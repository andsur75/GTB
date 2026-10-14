// HUD for Grand Theft Bus: everything on screen that is not the world, layered over core's HUD frame.
// Car radio: five live, procedurally generated stations (Fjord FM synthwave, Pillar Rock punk, Bass Station
// hip-hop, Parking Classics chiptune Grieg/Bach/Beethoven, Artur Talk with callers, ads and news about what
// the player just did), a police scanner in cop cars, R / Shift+R to switch, "radio off", every car keeps its
// station, music ducks under the pager and phone calls, static when the car is falling apart. Touch controls
// in GTA mode: floating joystick, fire button that doubles as an aim stick (auto-aim when tapped), use,
// weapon, sprint, handbrake, horn, radio, hold-for-big-map. HUD extras: cop-head wanted badges, damage
// vignette and low-health heartbeat, speedometer + radio LCD, station card, kill combos and counter, money
// deltas, district banner, place icons on the minimap and a big map with legend, weapon icon fallback, a GTA
// rap sheet on the pause screen, and layout fixes so core and module HUD elements never overlap.
// Adds X.radio and X.hudx.
(function (PG) {
  if (typeof document === 'undefined') return;
  const X = PG.gta;
  if (!X) return;
  const { cl, rand, pick, TAU } = X.util;
  const G = () => PG.game;
  const P = X.player;
  const playing = () => X.active && G().status === 'play';
  const mf = m => 440 * Math.pow(2, (m - 69) / 12);
  function seeded(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const pickR = (r, a) => a[Math.floor(r() * a.length)];
  const NOTE_I = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const midi = s => { const m = /^([A-G])(#|b)?(-?\d)$/.exec(s); return m ? NOTE_I[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] + 1) * 12 : null; };

  // ================= radio: audio graph =================
  const LOOK = 0.22;            // scheduler lookahead, s
  const VOL = 0.75;             // radio level against the engine
  const A = { ctx: null, linked: false };
  let CURVE = null;
  function clipCurve() {
    if (CURVE) return CURVE;
    CURVE = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) CURVE[i] = Math.tanh((i / 1023 * 2 - 1) * 5);
    return CURVE;
  }
  // Built once per AudioContext. Disconnected from the master while the radio is silent, so it costs nothing.
  function graph(k) {
    if (A.ctx === k.ctx) return A;
    const c = k.ctx, gn = v => { const g = c.createGain(); g.gain.value = v; return g; };
    const flt = (type, f, q) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; return b; };
    A.ctx = c; A.master = k.master; A.linked = false; A.noiseBuf = k.noiseBuf; A.hiss = null;
    A.out = gn(0); A.duck = gn(1); A.hp = flt('highpass', 60); A.tone = flt('lowpass', 9500);
    A.out.connect(A.duck); A.duck.connect(A.hp); A.hp.connect(A.tone);
    A.bus = gn(1); A.bus.connect(A.out);
    A.lead = gn(1); A.lead.connect(A.bus);          // lead line: dry plus a dotted-eighth echo
    A.echo = c.createDelay(1.5); A.echo.delayTime.value = 0.4;
    A.fb = gn(0.32); A.elp = flt('lowpass', 2200);
    A.lead.connect(A.echo); A.echo.connect(A.elp); A.elp.connect(A.fb); A.fb.connect(A.echo);
    const wet = gn(0.45); A.elp.connect(wet); wet.connect(A.bus);
    A.dist = c.createWaveShaper(); A.dist.curve = clipCurve(); A.dist.oversample = '2x';   // punk guitars
    const dlp = flt('lowpass', 3400), dg = gn(0.2); A.dist.connect(dlp); dlp.connect(dg); dg.connect(A.bus);
    A.voice = gn(1); A.voice.connect(A.bus);
    A.phone = flt('bandpass', 1500, 1.1); const pg = gn(1.7); A.phone.connect(pg); pg.connect(A.bus);
    A.scan = flt('bandpass', 1300, 2.5); const sg = gn(1.5); A.scan.connect(sg); sg.connect(A.bus);
    return A;
  }
  function link(on) {
    if (!A.ctx || A.linked === on) return;
    A.linked = on;
    try { if (on) A.tone.connect(A.master); else A.tone.disconnect(); } catch (e) { /* already in that state */ }
  }

  // ================= radio: instruments =================
  const RS = { notes: 0, songs: 0, lines: 0 };   // counters (tests, stats)
  function tn(k, type, f, t, dur, peak, o) { k.tone(type, f, t, dur, peak, o); RS.notes++; }
  function nz(k, t, dur, peak, type, f, o) { k.noise(t, dur, peak, type, f, o); RS.notes++; }
  const note = (k, type, m, t, dur, peak, o) => tn(k, type, mf(m), t, dur, peak, o);
  function kick(k, t, v) { tn(k, 'sine', 150, t, 0.3, 0.42 * v, { to: 42, dest: A.bus }); nz(k, t, 0.015, 0.09 * v, 'highpass', 2500, { dest: A.bus }); }
  function snare(k, t, v, big) { nz(k, t, big ? 0.34 : 0.15, (big ? 0.2 : 0.17) * v, 'bandpass', big ? 1500 : 2100, { Q: 0.7, dest: A.bus }); tn(k, 'triangle', 210, t, 0.08, 0.1 * v, { to: 150, dest: A.bus }); }
  function hat(k, t, v, open) { nz(k, t, open ? 0.22 : 0.035, 0.05 * v, 'highpass', 7200, { dest: A.bus }); }
  function clap(k, t, v) { for (let i = 0; i < 3; i++) nz(k, t + i * 0.011, i === 2 ? 0.16 : 0.03, 0.1 * v, 'bandpass', 1250, { Q: 1.3, dest: A.bus }); }
  function cymbal(k, t, v) { nz(k, t, 1.3, 0.055 * v, 'highpass', 5200, { dest: A.bus }); }
  // One cartoon voice blip (the base game's yap, routed through the radio).
  function blip(k, t, f, dur, g, dest) {
    const c = k.ctx, o = c.createOscillator(), bp = c.createBiquadFilter(), gn = c.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(f * 1.12, t); o.frequency.exponentialRampToValueAtTime(f * 0.86, t + dur);
    bp.type = 'bandpass'; bp.frequency.value = 900 + f * 2.2; bp.Q.value = 2.2;
    o.connect(bp); bp.connect(gn); gn.connect(dest);
    k.env(gn.gain, t, g, 0.006, dur);
    o.start(t); o.stop(t + dur + 0.05); RS.notes++;
  }
  const VOICES = {
    artur: { base: 150, panic: 0.35, gain: 6, dest: () => A.voice, who: 'ARTUR' },
    caller: { base: 200, panic: 0.2, gain: 5, dest: () => A.phone, who: 'CALLER' },
    ad: { base: 195, panic: 0.65, gain: 5.5, dest: () => A.voice, who: 'AD' },
    news: { base: 172, panic: 0.1, gain: 6, dest: () => A.voice, who: 'NEWS' },
    dj: { base: 168, panic: 0.7, gain: 4.5, dest: () => A.voice, who: 'DJ' },
    shout: { base: 205, panic: 0.95, gain: 3.5, dest: () => A.voice, who: '' },
    dispatch: { base: 128, panic: 0.3, gain: 4, dest: () => A.scan, who: 'DISPATCH' },
  };
  // A line being spoken. Blips are scheduled a little ahead every frame, so a station switch cuts it cleanly.
  function speech(text, voice, t0, base) {
    const plan = PG.yapPlan ? PG.yapPlan(text, { base: base || voice.base, panic: voice.panic }) : { events: [], total: text.length * 0.06 };
    RS.lines++;
    return { text, voice, ev: plan.events, i: 0, t0, end: t0 + plan.total };
  }
  function speakTick(k, sp, now) {
    const ev = sp.ev;
    while (sp.i < ev.length && sp.t0 + ev[sp.i].t < now + LOOK) {
      const e = ev[sp.i++], t = sp.t0 + e.t;
      if (t > now - 0.03) blip(k, t, e.f, e.dur, e.g * sp.voice.gain, sp.voice.dest());
    }
    return sp.i < ev.length || now < sp.end;
  }

  // ================= radio: music theory + songs =================
  const SC = { minor: [0, 2, 3, 5, 7, 8, 10], major: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], mixo: [0, 2, 4, 5, 7, 9, 10] };
  const deg = (sc, d) => sc[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
  const chord = (sc, d, n) => { const o = []; for (let i = 0; i < (n || 3); i++) o.push(deg(sc, d + i * 2)); return o; };
  function sections(bars) {
    const f = [];
    for (let b = 0; b < bars; b++) f.push(b < 4 ? 'intro' : b >= bars - 2 ? 'outro' : ((b - 4) >> 3) % 2 ? 'chorus' : 'verse');
    return f;
  }
  function melody(r, sc, prog, bars, lens) {
    const mel = new Array(bars * 16).fill(null); let d = 4;
    for (let b = 0; b < bars; b++) for (let i = 0; i < 16;) {
      const len = Math.min(16 - i, pickR(r, lens));
      if (r() < 0.8) { d = i === 0 ? prog[b % prog.length] + pickR(r, [0, 2, 4, 7]) : cl(d + pickR(r, [-2, -1, -1, 0, 1, 1, 2]), 0, 11); mel[b * 16 + i] = { n: deg(sc, d), len }; }
      i += len;
    }
    return mel;
  }
  function song(r, o) {
    const s = Object.assign({ swing: 0, sev: 3 }, o);
    s.sd = s.sd0 = 60 / s.bpm / 4;
    s.chords = s.prog.map(d => chord(s.sc, d, s.sev));
    s.form = sections(s.bars); s.len = s.bars * 16; s.dur = s.len * s.sd;
    if (s.names) { const n = s.names; s.title = n.title ? pickR(r, n.title) : pickR(r, n.a) + ' ' + pickR(r, n.b); s.artist = pickR(r, n.art); }
    return s;
  }
  const NAMES = {
    fjord: { a: ['Neon', 'Midnight', 'Fjord', 'Chrome', 'Aurora', 'Tunnel', 'Polar', 'Turbo', 'Velvet', 'Toll Road', 'Brunost'], b: ['Nights', 'Drive', 'Runner', 'Horizon', 'Highway', 'Lights', 'Dreams', 'Overdrive', 'Sunset', 'Kiss'], art: ['DJ Brunost', 'Laser Viking', 'Synthia Fjell', 'The Night Buses', 'Retro Rolf', 'Nordlys 84', 'Kavli Kid'] },
    pillar: { title: ['I Hate the Bus', 'Concrete Pillar', 'Wrong Way Down a One Way', 'Tow Truck Blues', 'No Parking (Anarchy)', 'Riot at the Roundabout', 'Smash the Meter', 'Handbrake Turn', 'Traffic Cone Crown', 'Six Stars and a Stinger', 'Bail Money'], art: ['The Parking Tickets', 'Bent Bumper', 'Kebab Riot', 'Pillar of Salt', 'Sex Pistonheads', 'Fjordcore', 'Ole Brumm & the Thrash'] },
    bass: { title: ['Straight Outta Bussby', 'Bank Row Hustle', 'Drive-By Waffles', 'Six Star Flow', "Pay 'n' Spray Freestyle", 'Low Rider, High Tolls', 'Cold Like the Fjord', 'Paper Route', 'Artur Is Watching', 'Loot Drop'], art: ['MC Pølse', 'Lil Brunost', 'Notorious T.R.O.N.D.', 'Grandmaster Fjell', 'Bussby Boyz', 'DJ Lutefisk', 'Kid Kavli'] },
  };
  function genFjord(r) {
    const s = song(r, { names: NAMES.fjord, bpm: 96 + Math.floor(r() * 16), root: 45 + Math.floor(r() * 7), sc: SC.minor, bars: 28 + 4 * Math.floor(r() * 3),
      prog: pickR(r, [[0, 5, 2, 6], [0, 5, 3, 4], [0, 3, 5, 4], [5, 6, 0, 0], [0, 6, 5, 6], [3, 4, 0, 0]]) });
    s.arp = pickR(r, [[0, 1, 2, 1], [0, 1, 2, 3], [0, 2, 1, 2, 3, 2], [0, 1, 2, 3, 4, 3, 2, 1]]);
    s.mel = melody(r, s.sc, s.prog, 4, [2, 2, 4, 4, 6, 1]); s.echo = s.sd * 3;
    return s;
  }
  function stepFjord(k, s, i, t) {
    const bar = i >> 4, p = i & 15, sec = s.form[bar], ch = s.chords[bar % s.chords.length], full = sec === 'verse' || sec === 'chorus';
    if (p % 4 === 0 && (full || p === 0)) kick(k, t, 0.9);
    if (full && (p === 4 || p === 12)) snare(k, t, 1, true);
    if (p % 4 === 2) hat(k, t, 0.7);
    if (sec === 'chorus' && p % 2) hat(k, t, 0.35);
    if (p % 2 === 0) note(k, 'sawtooth', s.root - 12 + ch[0] + (p % 4 ? 12 : 0), t, s.sd * 1.6, 0.1, { lp: 480, dest: A.bus });
    if (p === 0) for (let j = 0; j < 3; j++) note(k, 'sawtooth', s.root + 12 + ch[j], t, s.sd * 15, 0.017, { lp: 1200, attack: 0.4, detune: j * 7 - 7, dest: A.bus });
    if (sec !== 'intro') { const a = s.arp[p % s.arp.length]; note(k, 'square', s.root + 12 + ch[a % 3] + 12 * ((a / 3) | 0) + (p >= 8 ? 12 : 0), t, s.sd * 0.9, 0.02, { lp: 2400, dest: A.lead }); }
    if (sec === 'chorus') { const m = s.mel[(bar % 4) * 16 + p]; if (m) note(k, 'sawtooth', s.root + 24 + m.n, t, s.sd * m.len * 0.9, 0.04, { lp: 3000, vib: [5.5, 5], attack: 0.03, dest: A.lead }); }
  }
  function genPillar(r) {
    return song(r, { names: NAMES.pillar, bpm: 168 + Math.floor(r() * 28), root: 40 + Math.floor(r() * 6), sc: r() < 0.5 ? SC.major : SC.mixo, bars: 24 + 4 * Math.floor(r() * 3),
      prog: pickR(r, [[0, 3, 4, 3], [0, 4, 5, 3], [0, 0, 3, 4], [5, 3, 0, 4], [0, 6, 3, 0]]) });
  }
  function stepPillar(k, s, i, t, rt) {
    const bar = i >> 4, p = i & 15, sec = s.form[bar], r0 = s.root + s.chords[bar % s.chords.length][0], ch = sec === 'chorus';
    if (p === 0 && ((ch && bar % 4 === 0) || i === 0 || sec === 'outro')) cymbal(k, t, 1);
    if (sec !== 'intro' || bar >= 2) {
      if (p === 0 || p === 8 || (ch && (p === 6 || p === 14)) || (!ch && p === 10 && bar % 2)) kick(k, t, 1);
      if (p === 4 || p === 12) snare(k, t, 1.1, false);
      if (p % 2 === 0) hat(k, t, ch ? 1 : 0.8);
    }
    if (p % 2 === 0) {
      const mute = !ch, d = mute ? 0.09 : s.sd * 2.2, v = mute ? 0.05 : 0.042;
      note(k, 'sawtooth', r0, t, d, v, { detune: -9, dest: A.dist }); note(k, 'sawtooth', r0, t, d, v, { detune: 8, dest: A.dist });
      note(k, 'sawtooth', r0 + 7, t, d, v, { detune: -6, dest: A.dist }); note(k, 'sawtooth', r0 + 7, t, d, v, { detune: 7, dest: A.dist });
      note(k, 'sawtooth', r0 + 12, t, d, v * 0.8, { dest: A.dist });
      note(k, 'sawtooth', r0 - 12, t, s.sd * 1.8, 0.12, { lp: 420, dest: A.bus });
    }
    if (ch && bar % 4 === 0 && p === 0 && rt) rt.sp.push(speech(pick(['OI! OI! OI!', 'HEY! HO!', 'NO PARKING!', 'TAKE THE BUS!']), VOICES.shout, t));
  }
  function genBass(r) {
    const s = song(r, { names: NAMES.bass, bpm: 84 + Math.floor(r() * 13), swing: 0.2 + r() * 0.08, root: 36 + Math.floor(r() * 6), sc: r() < 0.6 ? SC.dorian : SC.minor, sev: 4, bars: 28 + 4 * Math.floor(r() * 2),
      prog: pickR(r, [[0, 0, 3, 4], [0, 3, 0, 4], [0, 5, 3, 4], [1, 4, 0, 0], [0, 6, 5, 4]]) });
    s.kicks = pickR(r, [[0, 7, 10], [0, 3, 8, 10], [0, 10, 11], [0, 6, 9], [0, 7, 9, 14]]);
    s.lastKick = s.kicks[s.kicks.length - 1];
    s.ghost = [3, 7, 11, 13, 15].filter(() => r() < 0.45);
    s.stab = pickR(r, [6, 10, 11, 14]);
    return s;
  }
  function stepBass(k, s, i, t, rt) {
    const bar = i >> 4, p = i & 15, sec = s.form[bar], ch = s.chords[bar % s.chords.length], r0 = s.root + ch[0];
    const drums = sec !== 'intro' || bar >= 2;
    if (drums && s.kicks.includes(p)) {
      kick(k, t, 1.1);
      const slide = p === s.lastKick && bar % 4 === 3;
      tn(k, 'sine', mf(r0), t, s.sd * (p === s.lastKick ? 5 : 3), 0.24, { to: slide ? mf(r0 - 5) : undefined, dest: A.bus });
    }
    if (drums && (p === 4 || p === 12)) { snare(k, t, 0.85); clap(k, t, 0.55); }
    if (p % 2 === 0) hat(k, t, p % 4 ? 0.45 : 0.7); else if (s.ghost.includes(p)) hat(k, t, 0.25);
    if (p === 0 || p === s.stab) for (const iv of ch) { note(k, 'triangle', s.root + 12 + iv, t, s.sd * 5, 0.028, { lp: 1700, dest: A.bus }); note(k, 'sine', s.root + 24 + iv, t, s.sd * 2.5, 0.01, { dest: A.bus }); }
    if (Math.random() < 0.3) nz(k, t + Math.random() * s.sd, 0.008, 0.035, 'highpass', 3000, { dest: A.bus });   // vinyl crackle
    if (sec === 'chorus' && bar % 4 === 3 && p === 8) { nz(k, t, s.sd * 2, 0.07, 'bandpass', 700, { to: 3200, Q: 4, dest: A.bus }); nz(k, t + s.sd * 2, s.sd * 2, 0.07, 'bandpass', 3000, { to: 600, Q: 4, dest: A.bus }); }
    if (rt && p === 0 && (sec === 'verse' && bar % 8 === 4 || sec === 'chorus' && bar % 8 === 0)) rt.sp.push(speech(pick(['YEAH!', 'UH!', 'BUSSBY!', 'SIX STARS!', 'WORD UP, ARTUR!', 'LOOT!']), VOICES.shout, t, 150));
  }
  // Parking Classics: public-domain tunes in 8 bits. Tokens: note[/len] or -[/len], len in units of s.unit 16ths.
  const CLASSICS = [
    { title: 'In the Hall of the Parking King', artist: 'Edvard Grieg, 8-bit', bpm: 112, unit: 2, loops: 3, accel: 1.2, bass: 'pizz',
      mel: 'A3 B3 C4 D4 E4 C4 E4/2 D#4 B3 D#4/2 D4 A#3 D4/2 A3 B3 C4 D4 E4 C4 E4 A4 G4 E4 C4 E4 G4/4 ' +
        'E4 F#4 G#4 A4 B4 G#4 B4/2 A#4 F#4 A#4/2 A4 F4 A4/2 E4 F#4 G#4 A4 B4 G#4 B4 E5 D5 B4 G#4 B4 D5/4',
      roots: ['A2', 'B2', 'A2', 'C3', 'E2', 'F#2', 'E2', 'E2'] },
    { title: 'Prelude in Parking Major', artist: 'J. S. Bach, BWV Bus', bpm: 92,
      pre: [[60, 64, 67, 72, 76], [60, 62, 69, 74, 77], [59, 62, 67, 74, 77], [60, 64, 67, 72, 76], [60, 64, 69, 76, 81], [60, 62, 66, 69, 74], [59, 62, 67, 74, 79], [59, 60, 64, 67, 72], [57, 60, 64, 67, 72], [50, 57, 62, 66, 72], [55, 59, 62, 67, 71], [55, 58, 64, 67, 73], [53, 57, 62, 69, 74], [53, 56, 62, 65, 71], [52, 55, 60, 67, 72], [52, 53, 57, 60, 65], [50, 53, 57, 60, 65], [43, 50, 55, 59, 65], [48, 52, 55, 60, 64]] },
    { title: 'Ode to Joyriding', artist: 'L. v. Beethoven', bpm: 132, unit: 2, loops: 2, bass: 'alberti',
      mel: 'E4/2 E4/2 F4/2 G4/2 G4/2 F4/2 E4/2 D4/2 C4/2 C4/2 D4/2 E4/2 E4/3 D4 D4/4 E4/2 E4/2 F4/2 G4/2 G4/2 F4/2 E4/2 D4/2 C4/2 C4/2 D4/2 E4/2 D4/3 C4 C4/4',
      roots: ['C3', 'G2', 'C3', 'G2', 'C3', 'G2', 'C3', 'C3'] },
    { title: 'Morning Mood (Rush Hour)', artist: 'Edvard Grieg', bpm: 104, unit: 2, loops: 3, bass: 'pad',
      mel: 'G4/2 E4 D4 C4 D4 E4/2 G4 E4 D4 C4 D4 E4 D4 E4 G4/2 E4 G4 A4/2 E4 A4 G4 E4 D4 C4/5', roots: ['C3', 'C3', 'F2', 'C3'] },
    { title: 'Für Elise (Fürious)', artist: 'L. v. Beethoven', bpm: 100, unit: 1, loops: 2,
      mel: 'E5 D#5 E5 D#5 E5 B4 D5 C5 A4/3 C4 E4 A4 B4/3 E4 G#4 B4 C5/3 E4 E5 D#5 E5 D#5 E5 B4 D5 C5 A4/3 C4 E4 A4 B4/3 E4 C5 B4 A4/6',
      lh: '-/8 A2 E3 A3 -/3 E2 E3 G#3 -/3 A2 E3 A3 -/3 -/6 A2 E3 A3 -/3 E2 E3 G#3 -/3 A2 E3 A3/4' },
  ];
  function track(str, unit, voice, out) {
    let s = 0;
    for (const tok of str.trim().split(/\s+/)) {
      const [n, l] = tok.split('/'), len = (l ? +l : 1) * unit;
      if (n !== '-') { (out[s] = out[s] || []).push({ m: midi(n), l: len, v: voice }); }
      s += len;
    }
    return s;
  }
  function genClassics(r, rt) {
    if (!rt.order || !rt.order.length) rt.order = CLASSICS.map((c, i) => i).sort(() => r() - 0.5);
    const d = CLASSICS[rt.order.shift()], s = { title: d.title, artist: d.artist, bpm: d.bpm, swing: 0, def: d };
    s.sd = s.sd0 = 60 / d.bpm / 4;
    if (d.pre) { s.pre = d.pre; s.loopLen = s.len = d.pre.length * 16; s.loops = 1; s.dur = s.len * s.sd; return s; }
    s.at = []; const u = d.unit || 2;
    s.loopLen = Math.max(track(d.mel, u, 'm', s.at), d.lh ? track(d.lh, u, 'b', s.at) : 0);
    s.loopLen = Math.ceil(s.loopLen / 4) * 4;
    s.loops = d.loops || 1; s.len = s.loopLen * s.loops; s.accel = d.accel || 0;
    s.roots = d.roots ? d.roots.map(midi) : null; s.bass = d.bass;
    s.dur = 0; for (let l = 0; l < s.loops; l++) s.dur += s.loopLen * s.sd0 / Math.pow(s.accel || 1, l);
    return s;
  }
  const PRE = [0, 1, 2, 3, 4, 2, 3, 4];
  function stepClassics(k, s, i, t) {
    if (s.pre) {
      const v = s.pre[i >> 4], p = i & 15;
      note(k, 'square', v[PRE[p & 7]], t, s.sd * 1.5, 0.028, { lp: 2800, dest: A.bus });
      if (p === 0 || p === 8) note(k, 'triangle', v[0] - 12, t, s.sd * 8, 0.09, { dest: A.bus });
      if (p === 1 || p === 9) note(k, 'triangle', v[1], t, s.sd * 7, 0.03, { dest: A.bus });
      return;
    }
    const loop = Math.floor(i / s.loopLen), j = i % s.loopLen;
    if (j === 0 && s.accel) s.sd = s.sd0 / Math.pow(s.accel, loop);   // the Mountain King speeds up every lap
    const ev = s.at[j];
    if (ev) for (const e of ev) {
      if (e.v === 'm') note(k, 'square', e.m, t, e.l * s.sd * 1.1, 0.034, { lp: 3200, dest: A.bus });
      else note(k, 'triangle', e.m, t, e.l * s.sd * 1.4, 0.08, { dest: A.bus });
    }
    if (s.roots) {
      const bar = Math.floor(j / 16), p = j % 16, r0 = s.roots[bar % s.roots.length];
      if (s.bass === 'pizz' && p % 4 === 0) note(k, 'triangle', r0 + (p % 8 ? 7 - 12 : 0), t, s.sd * 1.6, 0.1, { dest: A.bus });
      if (s.bass === 'alberti' && p % 2 === 0) { note(k, 'square', r0 + 12 + [0, 7, 4, 7][(p >> 1) % 4], t, s.sd * 1.8, 0.014, { lp: 1500, dest: A.bus }); if (p === 0) note(k, 'triangle', r0, t, s.sd * 14, 0.08, { dest: A.bus }); }
      if (s.bass === 'pad' && p === 0) { note(k, 'triangle', r0, t, s.sd * 15, 0.08, { dest: A.bus }); note(k, 'triangle', r0 + 7, t, s.sd * 15, 0.04, { dest: A.bus }); }
      if (s.accel && loop >= 1 && p % 2 === 0) hat(k, t, 0.5 + loop * 0.2);
      if (s.accel && loop >= 2 && p % 4 === 0) kick(k, t, 0.8);
      if (s.accel && loop === s.loops - 1 && j === s.loopLen - 4) cymbal(k, t, 1.4);
    }
  }

  // ================= radio: talk + scanner scripts =================
  const TALK = {
    open: [
      [['artur', 'Good evening, Bussby. This is Artur Talk. I talk. You drive. Badly.']],
      [['artur', 'You are listening to six-six-six AM. The only station that never takes the bus.']],
      [['artur', 'Artur here. The lines are open. Unlike the bank. Unfortunately.']],
    ],
    calls: [
      [['artur', 'Caller, you are on the air.'], ['caller', 'Hi Artur. Someone stole my car while I was parking it.'], ['artur', 'While you were IN it?'], ['caller', 'They said they needed it more.'], ['artur', 'Did you try taking the bus?']],
      [['caller', 'Artur, why are there so many explosions tonight?'], ['artur', 'Fireworks. Old Norwegian tradition. Next caller.']],
      [['caller', 'Is it true you run this city now?'], ['artur', 'I run a garage. The city just happens to be built around it.']],
      [['caller', 'My husband parked across four spaces.'], ['artur', 'Four? Amateur. I have seen eleven. On fire.']],
      [['caller', 'I want to report a crime.'], ['artur', 'This is a talk show. Call the police.'], ['caller', 'The police told me to call you.'], ['artur', 'Smart police.']],
      [['caller', 'Artur, the cops are chasing a bus down Bank Row!'], ['artur', 'Good. Finally somebody is taking the bus.']],
      [['caller', 'Hello? Am I on? HELLO?'], ['artur', 'You are on. You were always on. That is the problem.']],
      [['caller', 'I found a phone box that keeps ringing.'], ['artur', 'Do not answer it. Unless you need money. Then answer it.']],
      [['caller', 'Can I get a job at your garage?'], ['artur', 'Can you drive?'], ['caller', 'No.'], ['artur', 'You are hired.']],
    ],
    ads: [
      'Ammu-Fjord! Guns for the whole family. Ask about our lutefisk discount!',
      "Pay 'n' Spray. New colour, same you. Svein does not ask questions.",
      'Fjord Savings Bank. Your money is safe with us. Please stop asking how safe.',
      'St. Bussby Hospital. We fix you, we bill you, and then we fix you again.',
      'Take the Bus! It is cheaper than bail. Usually.',
      'Crusher and Export. If it has wheels, Knut has a cube for it.',
      'The Rusty Pillar. Come for the beer. Stay because your car got towed.',
    ],
    rants: [
      'Back in my day we parked between the lines. ALL of the lines.',
      'The police say crime is up. I say parking is down. We are not the same.',
      'Traffic report: everything near {district} is on fire. Drive around it. Or through it. I am not your mother.',
      'Weather: dark, wet, Norwegian. Tomorrow: the same, but colder.',
      'People ask me, Artur, why a garage? I say: because cars cannot run away. Usually.',
    ],
    news: [
      ['wanted', 'Breaking news: the police are chasing somebody through {district}. If that is you: turn left. Trust me.'],
      ['kills', "Tonight's body count is {kills}. The hospital says thank you."],
      ['money', 'Somebody out there has {money} dollars. Do not spend it on parking.'],
      ['any', 'News: a {colour} car was seen doing something illegal in {district}. So, a normal car.'],
    ],
    jingle: 'ARTUR TALK!',
  };
  const SCAN = [
    'Dispatch to all units: ten-thirty-one in progress, {district}.',
    'Unit {unit}, noise complaint at the Rusty Pillar. Artur is singing again.',
    'Be advised: suspect is driving like they stole it. Because they did.',
    'All units: the bus is NOT a getaway vehicle. Repeat: not.',
    'Unit {unit}, your coffee is ready. Repeat: coffee is ready.',
    'Ten-four, dispatch. Show me en route to {district}.',
    'Requesting a tow truck on {district}. And a bigger tow truck.',
    'Dispatch: a parked car was reported parked. Investigating.',
    'Unit {unit}: lost the suspect. Found a waffle stand.',
    'Reminder: the speed limit is a limit, not a target. Even for us.',
  ];
  function fill(text) {
    const pos = X.playerPos ? X.playerPos() : { x: 0, y: 0 };
    return text.replace(/\{(\w+)\}/g, (m, k) => k === 'district' ? (X.districtAt(pos.x, pos.y) || 'Bussby') : k === 'kills' ? String(P.kills || 0) : k === 'money' ? String(P.money || 0)
      : k === 'unit' ? pick(['Alfa', 'Bravo', 'Charlie', 'Delta', 'Echo']) + '-' + (1 + Math.floor(Math.random() * 30)) : k === 'colour' ? pick(['red', 'blue', 'yellow', 'stolen', 'suspicious']) : m);
  }
  function fillTalk(rt) {
    rt.n = (rt.n || 0) + 1;
    const q = rt.q;
    if (rt.n === 1) { q.push({ kind: 'jingle' }); for (const l of pick(TALK.open)) q.push({ kind: 'line', who: l[0], text: l[1] }); return; }
    if (rt.n % 4 === 0) q.push({ kind: 'jingle' });
    const r = Math.random(), base = rand(120, 250);
    if (r < 0.4) for (const l of pick(TALK.calls)) q.push({ kind: 'line', who: l[0], text: l[1], base: l[0] === 'caller' ? base : 0 });
    else if (r < 0.65) q.push({ kind: 'line', who: 'ad', text: pick(TALK.ads), bed: true });
    else if (r < 0.82) q.push({ kind: 'line', who: 'artur', text: fill(pick(TALK.rants)) });
    else {
      const ok = TALK.news.filter(n => n[0] === 'any' || (n[0] === 'wanted' && P.wanted > 0) || (n[0] === 'kills' && P.kills > 0) || (n[0] === 'money' && P.money > 0));
      q.push({ kind: 'line', who: 'news', text: fill(pick(ok)[1]) });
    }
    q.push({ kind: 'gap', dur: 0.6 });
  }

  // ================= radio: stations =================
  const STATIONS = [
    { id: 'fjord', name: 'Fjord FM', freq: '101.3 FM', genre: 'Synthwave', tag: 'Neon nights, wet roads', color: '#ff5ad8', vol: 1.5, gen: genFjord, step: stepFjord, id3: [69, 76, 81] },
    { id: 'pillar', name: 'Pillar Rock', freq: '96.6 FM', genre: 'Punk rock', tag: 'Loud. Fast. Parked badly.', color: '#ff4a3a', vol: 1, gen: genPillar, step: stepPillar, id3: [52, 59, 64] },
    { id: 'bass', name: 'Bass Station', freq: '88.8 FM', genre: 'Hip-hop', tag: 'Low end for low lifes', color: '#ffd23a', vol: 0.9, gen: genBass, step: stepBass, id3: [48, 55, 58] },
    { id: 'classics', name: 'Parking Classics', freq: '92.1 FM', genre: 'Chiptune classics', tag: 'Grieg, Bach, Beethoven. In 8 bits.', color: '#7dff9a', vol: 2.6, gen: genClassics, step: stepClassics, id3: [72, 76, 79] },
    { id: 'artur', name: 'Artur Talk', freq: '666 AM', genre: 'Talk radio', tag: 'He talks. You drive.', color: '#ffb02e', talk: true },
  ];
  const SCANNER = { id: 'scanner', name: 'Police Scanner', freq: 'CH 9', genre: 'Dispatch', tag: 'Ten-four, good buddy', color: '#5aa9ff', scanner: true };
  const OFF = { id: 'off', name: 'Radio Off', freq: '', genre: 'Silence', tag: 'Just you and the engine', color: '#9da3ab', off: true };
  const BY_ID = {}; for (const s of STATIONS.concat(SCANNER, OFF)) BY_ID[s.id] = s;
  const copCar = c => !!c && /^(police|swat|tank)$/.test(c.model.kind || '');
  const dialFor = c => copCar(c) ? [SCANNER, OFF] : STATIONS.concat(OFF);
  // The previous owner's taste, by model.
  function defaultStation(c) {
    if (copCar(c)) return 'scanner';
    const k = c.model.kind, id = c.model.id;
    if (k === 'bus') return 'classics';
    if (k === 'taxi') return 'artur';
    if (k === 'sports' || id === 'voltage') return 'fjord';
    if (k === 'van' || id === 'rancher' || k === 'fire') return 'pillar';
    if (id === 'x5' || id === 'regret' || k === 'armored') return 'bass';
    return pick(STATIONS).id;
  }
  let RT = {};
  const rt = def => RT[def.id] || (RT[def.id] = { def, song: null, step: 0, nextT: 0, x0: 0, seed: (Math.random() * 1e9) | 0, sp: [], q: [], cur: null, chatT: 0, lcd: '', order: null, n: 0 });
  function newSong(r) {
    const s = r.def.gen(seeded(r.seed++), r);
    r.song = s; r.step = 0; RS.songs++;
    r.lcd = '♪ ' + s.title + ' — ' + s.artist;
    return s;
  }
  function songStart(r, now) { const s = r.song; if (A.echo && s) A.echo.delayTime.setTargetAtTime(cl(s.echo || s.sd * 3, 0.05, 1.4), now, 0.05); }
  // Stations are live: tuning in joins the current song wherever it is.
  function tuneIn(r, now) {
    r.sp.length = 0; r.cur = null;
    if (A.bus) A.bus.gain.setTargetAtTime(r.def.vol || 1, now, 0.03);
    if (r.def.talk || r.def.scanner) { r.nextT = now + 0.3; r.chatT = now + rand(0.6, 1.6); if (r.def.scanner && !r.lcd) r.lcd = 'DISPATCH: ' + fill(pick(SCAN)); if (r.def.talk && !r.lcd) r.lcd = 'ARTUR TALK · 666 AM'; return; }
    if (!r.song) { newSong(r); r.x0 = X.time - Math.random() * r.song.dur * 0.6; }
    let el = X.time - r.x0, n = 0;
    while (el > r.song.dur + 1.5 && n++ < 6) { r.x0 += r.song.dur + 1.5; el -= r.song.dur + 1.5; newSong(r); }
    r.step = cl(Math.floor(el / r.song.sd), 0, r.song.len - 1);
    if (r.song.loopLen && r.song.accel) r.song.sd = r.song.sd0 / Math.pow(r.song.accel, Math.floor(r.step / r.song.loopLen));
    r.nextT = now + 0.08;
    songStart(r, now);
  }
  function stationId(k, r, t) {
    const d = r.def;
    d.id3.forEach((m, j) => { note(k, 'square', m + 12, t + j * 0.11, 0.18, 0.03, { lp: 3000, dest: A.lead }); note(k, 'triangle', m, t + j * 0.11, 0.3, 0.06, { dest: A.bus }); });
    r.sp.push(speech(d.name + '!', VOICES.dj, t + 0.42));
    r.lcd = d.name.toUpperCase() + ' · ' + d.freq;
  }
  function musicTick(k, r, now) {
    let s = r.song, n = 0;
    if (r.nextT < now - 0.3) r.nextT = now + 0.03;   // fell behind (hidden tab, long frame)
    while (r.nextT < now + LOOK && n++ < 24) {
      if (r.step >= s.len) {
        const t = r.nextT + 0.3;
        stationId(k, r, t);
        r.nextT = t + 1.4;
        s = newSong(r); r.lcd = r.def.name.toUpperCase() + ' · ' + r.def.freq + '   ' + r.lcd;
        r.x0 = X.time + (r.nextT - now);
        songStart(r, r.nextT);
        continue;
      }
      const t = r.nextT + (s.swing && (r.step & 1) ? s.swing * s.sd : 0);
      if (t > now - 0.02) r.def.step(k, s, r.step, t, r);
      r.nextT += s.sd; r.step++;
    }
    for (let i = r.sp.length - 1; i >= 0; i--) if (!speakTick(k, r.sp[i], now)) r.sp.splice(i, 1);
  }
  function talkTick(k, r, now) {
    let c = r.cur;
    if (!c || now >= c.end) {
      if (!r.q.length) fillTalk(r);
      const it = r.q.shift(), t0 = Math.max(now + 0.05, c ? c.end : now + 0.3);
      c = r.cur = { it, t0, end: t0 + 0.6, text: '', sp: null, notes: null, ni: 0 };
      if (it.kind === 'line') {
        const v = VOICES[it.who] || VOICES.artur;
        c.sp = speech(fill(it.text), v, t0, it.base); c.end = c.sp.end + 0.45; c.text = v.who + ': ' + c.sp.text;
        if (it.bed) { c.notes = []; const sd = 60 / 150 / 2, root = 60 + Math.floor(Math.random() * 5); for (let t = t0, j = 0; t < c.end - 0.2; t += sd, j++) c.notes.push({ t, m: root + [0, 4, 7, 12, 7, 4, 9, 5][j % 8], d: sd * 0.9 }); }
      } else if (it.kind === 'jingle') {
        c.notes = [{ t: t0, m: 72, d: 0.16 }, { t: t0 + 0.12, m: 76, d: 0.16 }, { t: t0 + 0.24, m: 79, d: 0.16 }, { t: t0 + 0.36, m: 84, d: 0.5 }];
        c.sp = speech(TALK.jingle, VOICES.dj, t0 + 0.55); c.end = c.sp.end + 0.4; c.text = 'ARTUR TALK · 666 AM · HE TALKS, YOU DRIVE';
      } else c.end = t0 + (it.dur || 0.5);
    }
    if (c.sp) speakTick(k, c.sp, now);
    if (c.notes) while (c.ni < c.notes.length && c.notes[c.ni].t < now + LOOK) { const nt = c.notes[c.ni++]; if (nt.t > now - 0.03) note(k, 'square', nt.m, nt.t, nt.d, 0.022, { lp: 2600, dest: A.bus }); }
    if (c.text && now >= c.t0 - 0.05) r.lcd = c.text;
    R.talking = !!(c.sp && now >= c.sp.t0 && now < c.sp.end && c.it.who === 'artur');
  }
  const SCANQ = [];
  function squelch(k, t) { nz(k, t, 0.07, 0.07, 'bandpass', 2600, { Q: 1.2, dest: A.bus }); tn(k, 'square', 1320, t + 0.02, 0.05, 0.02, { lp: 3500, dest: A.bus }); }
  function scanTick(k, r, now) {
    if (!A.hiss) startHiss();
    const c = r.cur;
    if (c && c.sp && speakTick(k, c.sp, now)) return;
    if (now < r.chatT) return;
    if (SCANQ.length) { r.lcd = 'POLICE: ' + SCANQ.shift(); squelch(k, now + 0.02); r.chatT = now + 4.5; r.cur = null; return; }
    const text = fill(pick(SCAN));
    squelch(k, now + 0.02);
    r.cur = { sp: speech(text, VOICES.dispatch, now + 0.16) };
    squelch(k, r.cur.sp.end + 0.05);
    r.lcd = 'DISPATCH: ' + text;
    r.chatT = r.cur.sp.end + rand(2.5, 6.5);
  }
  function startHiss() {
    if (A.hiss || !A.ctx || !A.noiseBuf) return;
    const c = A.ctx, src = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
    src.buffer = A.noiseBuf; src.loop = true; bp.type = 'bandpass'; bp.frequency.value = 2300; bp.Q.value = 0.6; g.gain.value = 0.014;
    src.connect(bp); bp.connect(g); g.connect(A.bus); src.start();
    A.hiss = src;
  }
  function stopHiss() { if (A.hiss) { try { A.hiss.stop(); A.hiss.disconnect(); } catch (e) { /* stopped */ } A.hiss = null; } }

  // ================= radio: tuner =================
  const R = { car: null, def: null, halted: true, unlinkAt: 0, duck: 1, duckT: 1, glitch: 0, talking: false, cardT: 0, cardKey: '', changed: 0, time: {} };
  function tuningSweep() {
    const k = PG.audio.kit(); if (!k) return;
    nz(k, k.now, 0.22, 0.05, 'bandpass', 500, { to: 3400, Q: 3 });
    tn(k, 'sine', 900, k.now + 0.05, 0.12, 0.012, { to: 2200 });
  }
  function setStation(def, quiet) {
    if (!R.car) return;
    const was = R.def;
    R.car.hudStation = def.id; R.def = def; R.changed++;
    if (was && was.scanner && !def.scanner) stopHiss();
    if (!R.halted) {
      if (A.ctx) { const now = A.ctx.currentTime; A.out.gain.cancelScheduledValues(now); A.out.gain.setValueAtTime(0, now); A.out.gain.setTargetAtTime(def.off ? 0 : VOL, now + 0.12, 0.05); }
      if (!def.off) tuneIn(rt(def), A.ctx.currentTime + 0.1);
    }
    if (!quiet) tuningSweep();
    R.cardT = 2.8;
  }
  function stepStation(dir) {
    if (!R.car) return;
    const dial = dialFor(R.car), i = Math.max(0, dial.indexOf(R.def));
    setStation(dial[(i + dir + dial.length) % dial.length]);
  }
  function enterRadio(c) {
    R.car = c;
    if (!c.hudStation || !BY_ID[c.hudStation] || !dialFor(c).includes(BY_ID[c.hudStation])) c.hudStation = defaultStation(c);
    R.def = BY_ID[c.hudStation]; R.cardT = 2.8; R.changed++;
    halt();
  }
  function leaveRadio() { R.car = null; R.def = null; R.cardT = 0; halt(); }
  function halt() {
    if (R.halted) return;
    R.halted = true; R.talking = false;
    stopHiss();
    if (A.ctx) { const now = A.ctx.currentTime; A.out.gain.cancelScheduledValues(now); A.out.gain.setTargetAtTime(0, now, 0.025); R.unlinkAt = now + 0.15; }
  }
  function startRadio(k) {
    R.halted = false; R.unlinkAt = 0;
    link(true);
    const now = k.ctx.currentTime;
    A.out.gain.cancelScheduledValues(now); A.out.gain.setValueAtTime(0, now); A.out.gain.setTargetAtTime(VOL, now + 0.05, 0.08);
    tuneIn(rt(R.def), now + 0.05);
  }
  function radioFrame(dt) {
    const c = P.car && P.state === 'play' && !P.car.wrecked && !P.car.removed ? P.car : null;
    if (c !== R.car) { if (c) enterRadio(c); else leaveRadio(); }
    if (R.cardT > 0) R.cardT -= dt;
    const k = R.car && R.def && !R.def.off && playing() ? PG.audio.kit() : null;
    if (!k) { halt(); if (R.unlinkAt && A.ctx && A.ctx.currentTime > R.unlinkAt) { R.unlinkAt = 0; link(false); } return; }
    graph(k);
    if (R.halted) startRadio(k);
    const now = k.ctx.currentTime;
    R.time[R.def.id] = (R.time[R.def.id] || 0) + dt;
    // ducking: pager, phone calls from Artur, the police radio box (unless this is the scanner)
    let duck = 1;
    if (HUD && HUD.pager && !HUD.pager.hidden) duck = 0.3;
    if (X.missions && X.missions.call) duck = Math.min(duck, 0.18);
    const pr = polRadio(); if (pr && !R.def.scanner && pr.classList.contains('on')) duck = Math.min(duck, 0.6);
    // a car falling apart has a radio falling apart
    const hpF = R.car.hp / R.car.maxHp;
    if (hpF < 0.3 && !R.def.off) {
      if (R.glitch > 0) R.glitch -= dt;
      else if (Math.random() < dt * (1.6 - hpF * 3)) { R.glitch = rand(0.08, 0.35); nz(k, now, R.glitch + 0.05, 0.035, 'bandpass', 2800, { Q: 0.6 }); }
      if (R.glitch > 0) duck = 0.04;
    }
    if (Math.abs(duck - R.duckT) > 0.01) { R.duckT = duck; A.duck.gain.setTargetAtTime(duck, now, duck < 0.1 ? 0.01 : 0.12); }
    const r = rt(R.def);
    if (R.def.talk) talkTick(k, r, now); else if (R.def.scanner) scanTick(k, r, now); else musicTick(k, r, now);
  }
  X.on('policeRadio', e => { if (X.active && R.def && R.def.scanner && e && e.text) { SCANQ.push(e.text); if (SCANQ.length > 3) SCANQ.shift(); } });

  // ================= drawing helpers (logos, badges, icons) =================
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function star(c, x, y, r1, r2, n) { c.beginPath(); for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, r = i % 2 ? r2 : r1; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath(); }
  function txt(c, s, x, y, size, color, font) { c.font = (font || '') + size + 'px Bungee, Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = size * 0.22; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.strokeText(s, x, y); c.fillStyle = color; c.fillText(s, x, y); }
  function drawLogo(cv, def, t, talking) {
    const c = cv.getContext('2d'), S = cv.width;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, S, S);
    if (def.talk && PG.ui && PG.ui.drawArturFace) {
      // drawArturFace ends with the parking game's window pillar; a radio studio has no window
      if (!c.hudNoPillar) { c.hudNoPillar = true; c.stroke = function () { if (this.strokeStyle === '#6f6a5c') return; CanvasRenderingContext2D.prototype.stroke.call(this); }; }
      PG.ui.drawArturFace(cv, 0.25, t, false, talking);
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = '#d0141e'; c.fillRect(0, S * 0.78, S, S * 0.22);
      txt(c, talking ? 'ON AIR' : '666 AM', S / 2, S * 0.89, S * 0.13, '#fff');
      return;
    }
    rr(c, 0, 0, S, S, S * 0.12); c.save(); c.clip();
    if (def.id === 'fjord') {
      const g = c.createLinearGradient(0, 0, 0, S * 0.6); g.addColorStop(0, '#1a0b3a'); g.addColorStop(1, '#ff3fa4'); c.fillStyle = g; c.fillRect(0, 0, S, S);
      const sg = c.createLinearGradient(0, S * 0.18, 0, S * 0.58); sg.addColorStop(0, '#ffe36a'); sg.addColorStop(1, '#ff4fa0'); c.fillStyle = sg;
      c.beginPath(); c.arc(S / 2, S * 0.58, S * 0.3, Math.PI, TAU); c.fill();
      c.fillStyle = '#3a1050'; for (let i = 0; i < 4; i++) c.fillRect(0, S * (0.42 + i * 0.045), S, S * 0.012 * (i + 1));
      c.fillStyle = '#12061f'; c.beginPath(); c.moveTo(0, S * 0.58); c.lineTo(S * 0.18, S * 0.36); c.lineTo(S * 0.34, S * 0.58); c.lineTo(S * 0.7, S * 0.58); c.lineTo(S * 0.84, S * 0.4); c.lineTo(S, S * 0.58); c.fill();
      c.fillStyle = '#12061f'; c.fillRect(0, S * 0.58, S, S); c.strokeStyle = '#22e5ff'; c.lineWidth = S * 0.015;
      for (let i = -4; i <= 4; i++) { c.beginPath(); c.moveTo(S / 2 + i * S * 0.05, S * 0.58); c.lineTo(S / 2 + i * S * 0.3, S); c.stroke(); }
      for (let i = 0; i < 4; i++) { const y = S * 0.58 + Math.pow(i / 4, 1.6) * S * 0.42 + S * 0.03; c.beginPath(); c.moveTo(0, y); c.lineTo(S, y); c.stroke(); }
      txt(c, 'FJORD FM', S / 2, S * 0.84, S * 0.16, '#ff7ae6');
    } else if (def.id === 'pillar') {
      c.fillStyle = '#141414'; c.fillRect(0, 0, S, S);
      c.fillStyle = '#8a8f96'; c.fillRect(S * 0.36, S * 0.06, S * 0.28, S * 0.66);
      c.fillStyle = '#f4c20d'; for (let i = 0; i < 4; i++) { c.save(); c.beginPath(); c.rect(S * 0.36, S * 0.56, S * 0.28, S * 0.16); c.clip(); c.translate(S * 0.36 + i * S * 0.1, S * 0.56); c.rotate(0.6); c.fillRect(0, -S * 0.1, S * 0.05, S * 0.4); c.restore(); }
      c.strokeStyle = '#222'; c.lineWidth = S * 0.02; c.beginPath(); c.moveTo(S * 0.5, S * 0.12); c.lineTo(S * 0.45, S * 0.25); c.lineTo(S * 0.55, S * 0.33); c.lineTo(S * 0.47, S * 0.45); c.stroke();
      c.fillStyle = '#ff3b2f'; c.beginPath(); c.moveTo(S * 0.78, S * 0.04); c.lineTo(S * 0.6, S * 0.38); c.lineTo(S * 0.72, S * 0.38); c.lineTo(S * 0.58, S * 0.7); c.lineTo(S * 0.9, S * 0.3); c.lineTo(S * 0.77, S * 0.3); c.closePath(); c.fill();
      txt(c, 'PILLAR', S / 2, S * 0.8, S * 0.15, '#fff'); txt(c, 'ROCK', S / 2, S * 0.93, S * 0.12, '#ff4a3a');
    } else if (def.id === 'bass') {
      c.fillStyle = '#ffd23a'; c.fillRect(0, 0, S, S);
      const pulse = 1 + 0.06 * Math.sin(t * 9);
      for (const [r, col] of [[0.36, '#16181c'], [0.29, '#3a3f46'], [0.2, '#16181c'], [0.09, '#6b7078']]) { c.fillStyle = col; c.beginPath(); c.arc(S / 2, S * 0.42, S * r * (r < 0.3 ? pulse : 1), 0, TAU); c.fill(); }
      txt(c, 'BASS', S / 2, S * 0.86, S * 0.17, '#fff');
    } else if (def.id === 'classics') {
      c.fillStyle = '#1f5fbf'; c.fillRect(0, 0, S, S); c.strokeStyle = '#fff'; c.lineWidth = S * 0.05; rr(c, S * 0.06, S * 0.06, S * 0.88, S * 0.88, S * 0.1); c.stroke();
      txt(c, 'P', S * 0.42, S * 0.48, S * 0.55, '#fff');
      c.fillStyle = '#7dff9a'; c.beginPath(); c.ellipse(S * 0.72, S * 0.66, S * 0.07, S * 0.05, -0.4, 0, TAU); c.fill(); c.fillRect(S * 0.77, S * 0.24, S * 0.025, S * 0.42);
      c.beginPath(); c.moveTo(S * 0.795, S * 0.24); c.quadraticCurveTo(S * 0.9, S * 0.32, S * 0.86, S * 0.42); c.lineTo(S * 0.795, S * 0.3); c.fill();
      txt(c, 'CLASSICS', S / 2, S * 0.86, S * 0.11, '#fff');
    } else if (def.scanner) {
      c.fillStyle = '#0b1630'; c.fillRect(0, 0, S, S);
      c.strokeStyle = '#5aa9ff'; c.lineWidth = S * 0.03;
      for (let i = 1; i <= 3; i++) { c.globalAlpha = 0.25 + 0.75 * ((Math.sin(t * 6 - i) + 1) / 2); c.beginPath(); c.arc(S / 2, S * 0.44, S * (0.2 + i * 0.08), -0.7, 0.7); c.stroke(); c.beginPath(); c.arc(S / 2, S * 0.44, S * (0.2 + i * 0.08), Math.PI - 0.7, Math.PI + 0.7); c.stroke(); }
      c.globalAlpha = 1; c.fillStyle = '#ffd23a'; star(c, S / 2, S * 0.44, S * 0.2, S * 0.09, 6); c.fill(); c.strokeStyle = '#000'; c.lineWidth = S * 0.02; c.stroke();
      txt(c, 'POLITI', S / 2, S * 0.86, S * 0.15, '#5aa9ff');
    } else {
      c.fillStyle = '#16181c'; c.fillRect(0, 0, S, S); c.strokeStyle = '#6b7078'; c.lineWidth = S * 0.07; c.lineCap = 'round';
      c.beginPath(); c.arc(S / 2, S * 0.47, S * 0.24, -Math.PI / 2 + 0.6, Math.PI * 1.5 - 0.6); c.stroke(); c.beginPath(); c.moveTo(S / 2, S * 0.18); c.lineTo(S / 2, S * 0.46); c.stroke();
      txt(c, 'OFF', S / 2, S * 0.87, S * 0.14, '#9da3ab');
    }
    c.restore();
  }
  function canvasURL(w, h, fn) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d'); fn(c); try { return cv.toDataURL(); } catch (e) { return ''; } }
  // GTA2 put a cop's head up for every wanted level. Ours have moustaches.
  function copHead(mode) {
    return canvasURL(48, 48, c => {
      c.translate(24, 25);
      if (mode === 'red' || mode === 'blue') { const g = c.createRadialGradient(0, 0, 4, 0, 0, 24); g.addColorStop(0, mode === 'red' ? 'rgba(255,50,30,0.9)' : 'rgba(50,120,255,0.9)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(-24, -25, 48, 48); }
      const off = mode === 'off';
      c.lineWidth = 2.5; c.strokeStyle = off ? 'rgba(0,0,0,0.5)' : '#000';
      c.fillStyle = off ? 'rgba(255,255,255,0.13)' : '#f1c7a1'; c.beginPath(); c.ellipse(0, 6, 12, 13, 0, 0, TAU); c.fill(); c.stroke();
      if (!off) { c.fillStyle = '#1b1612'; c.fillRect(-6, 3, 3, 4); c.fillRect(3, 3, 3, 4); c.fillStyle = '#6d4c2f'; c.beginPath(); c.moveTo(-7, 13); c.quadraticCurveTo(0, 9, 7, 13); c.quadraticCurveTo(0, 12, -7, 13); c.fill(); c.fillRect(-6, 11, 12, 2.5); }
      c.fillStyle = off ? 'rgba(255,255,255,0.2)' : '#1d2f5a'; c.beginPath(); c.moveTo(-14, -1); c.lineTo(-12, -14); c.quadraticCurveTo(0, -21, 12, -14); c.lineTo(14, -1); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = off ? 'rgba(255,255,255,0.12)' : '#0b0f1a'; c.fillRect(-16, -3, 32, 5); c.strokeRect(-16, -3, 32, 5);
      if (!off) { c.fillStyle = mode === 'red' ? '#ff8a7a' : mode === 'blue' ? '#9cc6ff' : '#ffd23a'; star(c, 0, -10, 5, 2.2, 5); c.fill(); }
    });
  }
  const SKULL = () => canvasURL(32, 32, c => {
    c.fillStyle = '#f2ece0'; c.strokeStyle = '#000'; c.lineWidth = 2;
    c.beginPath(); c.arc(16, 13, 10, 0, TAU); c.fill(); c.stroke(); c.fillRect(10, 18, 12, 8); c.strokeRect(10, 18, 12, 8);
    c.fillStyle = '#16181c'; c.beginPath(); c.arc(12, 13, 3, 0, TAU); c.arc(20, 13, 3, 0, TAU); c.fill(); c.fillRect(15, 17, 2, 3);
    c.fillRect(13, 23, 1.5, 3); c.fillRect(17, 23, 1.5, 3);
  });
  // Map / legend icons for places.
  const PLACE_ICON = {
    hideout: { c: '#c48bff', g: 'house', n: "Artur's Garage" }, apartment: { c: '#7dff9a', g: 'house', n: 'Safehouse' }, bank: { c: '#ffd23a', g: '$', n: 'Bank' },
    gunshop: { c: '#ff8a3a', g: 'gun', n: 'Ammu-Fjord' }, spray: { c: '#3fe0c5', g: 'spray', n: "Pay 'n' Spray" }, crusher: { c: '#b8ad9c', g: 'cube', n: 'Crusher' },
    hospital: { c: '#ffffff', g: '+', n: 'Hospital' }, police: { c: '#5aa9ff', g: 'badge', n: 'Police' }, bar: { c: '#ff6fb8', g: 'glass', n: 'Bar' },
  };
  function drawPlaceIcon(c, id, x, y, s) {
    const ic = PLACE_ICON[id] || { c: '#ffffff', g: '?' }, k = s * 0.62;
    c.fillStyle = '#0b0c0f'; c.beginPath(); c.arc(x, y, s + Math.max(1.5, s * 0.16), 0, TAU); c.fill();
    c.fillStyle = ic.c; c.beginPath(); c.arc(x, y, s, 0, TAU); c.fill();
    c.fillStyle = '#0b0c0f';
    switch (ic.g) {
      case 'house': c.beginPath(); c.moveTo(x - k, y); c.lineTo(x, y - k); c.lineTo(x + k, y); c.lineTo(x + k * 0.7, y); c.lineTo(x + k * 0.7, y + k * 0.8); c.lineTo(x - k * 0.7, y + k * 0.8); c.lineTo(x - k * 0.7, y); c.closePath(); c.fill(); break;
      case 'gun': c.fillRect(x - k, y - k * 0.45, k * 1.9, k * 0.5); c.fillRect(x - k * 0.95, y - k * 0.1, k * 0.55, k * 0.95); break;
      case 'spray': c.fillRect(x - k * 0.4, y - k * 0.35, k * 0.8, k * 1.2); c.fillRect(x - k * 0.15, y - k * 0.75, k * 0.3, k * 0.4); c.fillRect(x + k * 0.25, y - k * 0.8, k * 0.55, k * 0.18); break;
      case 'cube': c.lineWidth = Math.max(1.5, s * 0.2); c.strokeStyle = '#0b0c0f'; c.strokeRect(x - k * 0.7, y - k * 0.7, k * 1.4, k * 1.4); c.fillRect(x - k * 0.3, y - k * 0.3, k * 0.6, k * 0.6); break;
      case '+': c.fillStyle = '#e8402f'; c.fillRect(x - k * 0.25, y - k * 0.8, k * 0.5, k * 1.6); c.fillRect(x - k * 0.8, y - k * 0.25, k * 1.6, k * 0.5); break;
      case 'badge': star(c, x, y, k, k * 0.45, 6); c.fill(); break;
      case 'glass': c.beginPath(); c.moveTo(x - k * 0.6, y - k * 0.7); c.lineTo(x + k * 0.6, y - k * 0.7); c.lineTo(x + k * 0.4, y + k * 0.8); c.lineTo(x - k * 0.4, y + k * 0.8); c.closePath(); c.fill(); break;
      default: c.font = '700 ' + Math.round(s * 1.35) + 'px "Barlow Condensed", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ic.g, x, y + s * 0.06);
    }
  }
  // Weapon silhouettes, only used when weapons.js (which draws its own) is not loaded.
  function drawWeaponIcon(cv, id) {
    const c = cv.getContext('2d'), W = cv.width, H = cv.height;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H);
    c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 3; c.lineJoin = 'round';
    const box = (x, y, w, h) => { c.beginPath(); c.rect(x, y, w, h); c.stroke(); c.fill(); };
    switch (id) {
      case 'fists': c.beginPath(); rr(c, 30, 12, 34, 24, 8); c.stroke(); c.fill(); box(22, 16, 10, 16); c.strokeStyle = '#000'; c.lineWidth = 2; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(40 + i * 8, 12); c.lineTo(40 + i * 8, 22); c.stroke(); } break;
      case 'bat': c.save(); c.translate(W / 2, H / 2); c.rotate(-0.25); c.beginPath(); c.moveTo(-36, -3); c.lineTo(18, -7); c.quadraticCurveTo(36, -8, 36, 0); c.quadraticCurveTo(36, 8, 18, 7); c.lineTo(-36, 3); c.closePath(); c.stroke(); c.fill(); c.restore(); break;
      case 'pistol': box(26, 12, 42, 10); box(28, 20, 12, 18); break;
      case 'uzi': box(22, 12, 50, 12); box(36, 22, 9, 18); box(52, 22, 8, 12); break;
      case 'shotgun': case 'rifle': box(10, 16, 74, 8); box(14, 22, 20, 10); box(46, 22, 8, 10); break;
      case 'rocket': box(8, 15, 70, 14); c.fillStyle = '#d23a2a'; c.beginPath(); c.moveTo(78, 12); c.lineTo(90, 22); c.lineTo(78, 32); c.closePath(); c.stroke(); c.fill(); break;
      case 'grenade': case 'molotov': c.beginPath(); c.arc(46, 26, 13, 0, TAU); c.stroke(); c.fill(); box(41, 6, 10, 8); break;
      case 'flamer': c.beginPath(); c.arc(24, 24, 11, 0, TAU); c.stroke(); c.fill(); box(32, 18, 44, 8); c.fillStyle = '#ff8a1e'; c.beginPath(); c.moveTo(76, 16); c.quadraticCurveTo(94, 22, 76, 28); c.fill(); break;
      case 'electro': c.fillStyle = '#8fd0ff'; c.beginPath(); c.moveTo(54, 4); c.lineTo(34, 26); c.lineTo(46, 26); c.lineTo(38, 44); c.lineTo(62, 18); c.lineTo(50, 18); c.closePath(); c.stroke(); c.fill(); break;
      default: {
        const W2 = X.WEAPONS && X.WEAPONS[id], s = ((W2 && W2.name) || String(id)).slice(0, 4).toUpperCase();
        c.font = '800 24px "Barlow Condensed", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.lineWidth = 5; c.strokeText(s, W / 2, H / 2 + 1); c.fillText(s, W / 2, H / 2 + 1);
      }
    }
  }

  // ================= speedometer =================
  function drawSpeedo(cv, kmh, gear, hpF) {
    const c = cv.getContext('2d'), W = cv.width, H = cv.height, MAX = 240;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(10,11,14,0.86)'; rr(c, 2, 2, W - 4, H - 4, 14); c.fill(); c.lineWidth = 3; c.strokeStyle = '#2f3339'; c.stroke();
    const cx = 78, cy = 100, rad = 64, a0 = Math.PI, a1 = TAU, v = cl(kmh / MAX, 0, 1);
    c.lineWidth = 9; c.strokeStyle = '#23272e'; c.beginPath(); c.arc(cx, cy, rad - 7, a0, a1); c.stroke();
    c.strokeStyle = 'rgba(232,64,47,0.55)'; c.beginPath(); c.arc(cx, cy, rad - 7, a0 + Math.PI * 200 / MAX, a1); c.stroke();
    c.strokeStyle = kmh > 180 ? '#ff4a3a' : kmh > 110 ? '#ffd23a' : '#7dff9a'; c.beginPath(); c.arc(cx, cy, rad - 7, a0, a0 + Math.PI * v); c.stroke();
    c.strokeStyle = '#c9cdd6'; c.lineWidth = 2.5;
    for (let s = 0; s <= MAX; s += 20) { const a = a0 + Math.PI * s / MAX, r1 = rad - 16 - (s % 40 ? 0 : 6); c.beginPath(); c.moveTo(cx + Math.cos(a) * (rad - 14), cy + Math.sin(a) * (rad - 14)); c.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); c.stroke(); }
    const an = a0 + Math.PI * v;
    c.strokeStyle = '#ff3b2f'; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.moveTo(cx - Math.cos(an) * 8, cy - Math.sin(an) * 8); c.lineTo(cx + Math.cos(an) * (rad - 10), cy + Math.sin(an) * (rad - 10)); c.stroke(); c.lineCap = 'butt';
    c.fillStyle = '#d6d9df'; c.beginPath(); c.arc(cx, cy, 7, 0, TAU); c.fill();
    c.textAlign = 'right'; c.textBaseline = 'alphabetic';
    c.font = '46px Bungee, Impact, sans-serif'; c.fillStyle = '#fff'; c.fillText(String(Math.round(kmh)), 300, 70);
    c.font = '800 20px "Barlow Condensed", "Arial Narrow", sans-serif'; c.fillStyle = '#9da3ab'; c.fillText('KM/H', 300, 98);
    c.fillStyle = gear === 'R' ? '#5a1a14' : '#2a2410'; rr(c, 314, 26, 40, 50, 8); c.fill();
    c.lineWidth = 2; c.strokeStyle = gear === 'R' ? '#ff4a3a' : '#6b5a1e'; c.stroke();
    c.textAlign = 'center'; c.font = '32px Bungee, Impact, sans-serif'; c.fillStyle = gear === 'R' ? '#ff6a5a' : '#ffd23a'; c.fillText(gear, 334, 64);
    if (hpF < 0.3) { c.fillStyle = Math.floor(performance.now() / 300) % 2 ? '#ff4a3a' : '#5a1a14'; c.beginPath(); c.arc(334, 94, 6, 0, TAU); c.fill(); }
  }
  function gearOf(c) {
    const dv = c.dv; if (!dv) return 'N';
    if (dv.gear < 0 || dv.v < -0.3) return 'R';
    return dv.dyn && dv.dyn.type === 'ice' ? String(Math.max(1, dv.gear | 0)) : 'D';
  }

  // ================= CSS =================
  function css(img) {
    return `
body.gta #touch { display: none !important; }
#gta-hud { --h-mapw: 184px; --h-mapb: calc(12px + env(safe-area-inset-bottom, 0px)); --h-dashh: 0px; --h-cardh: 0px; --h-touch: 0px; }
#gta-hud.h-car { --h-dashh: 86px; }
#gta-hud.h-cardon { --h-cardh: 84px; }
body.gta #gta-hud .g-bar { position: relative; overflow: visible; margin-left: 20px; }
body.gta #gta-hud .g-bar.car { display: block; padding: 0; gap: 0; min-width: 0; width: 150px; height: 10px; border-radius: 3px; border: 1px solid rgba(255,255,255,0.25); background: rgba(0,0,0,0.6); text-align: left; }
body.gta #gta-hud .g-bar i { border-radius: 2px; }
body.gta #gta-hud .g-bar::before { content: ''; position: absolute; left: -19px; top: 50%; width: 13px; height: 12px; transform: translateY(-50%); }
body.gta #gta-hud .g-bar.hp::before { content: '\\2665'; width: auto; height: auto; color: #ff5a4a; font: 800 17px/1 var(--hud); text-shadow: 0 1px 0 #000, 0 0 6px rgba(255,60,40,0.5); }
body.gta #gta-hud .g-bar.armor::before { background: #8fb6ff; clip-path: polygon(50% 0, 100% 18%, 92% 62%, 50% 100%, 8% 62%, 0 18%); }
body.gta #gta-hud .g-bar.car::before { height: 9px; border-radius: 3px 5px 2px 2px; background: #ffd23a; box-shadow: inset 4px 0 0 #6b5a1e, inset -3px 0 0 #6b5a1e; }
body.gta #gta-hud .g-bar.hp.h-low i { background: linear-gradient(90deg, #ff1a0a, #ff7a5a); }
body.gta #gta-hud .g-bar.h-low { border-color: #ff4a3a; box-shadow: 0 0 10px rgba(255,40,20,0.55); }
body.gta #gta-hud .g-bar.hp.h-beat::before { animation: hbeat .32s ease-out; }
body.gta #gta-hud .g-bar.hp.h-beat-b::before { animation: hbeat-b .32s ease-out; }
body.gta #gta-hud .g-bar.car.h-low i { animation: hblink .5s steps(2) infinite; }
body.gta #gta-hud .g-bar.hp.h-hurt { animation: hhurt .35s ease-out; }
body.gta #gta-hud .g-bar.hp.h-hurt-b { animation: hhurt-b .35s ease-out; }
@keyframes hbeat { 30% { transform: translateY(-50%) scale(1.55); } }
@keyframes hbeat-b { 30% { transform: translateY(-50%) scale(1.55); } }
@keyframes hblink { 50% { opacity: 0.35; } }
@keyframes hhurt { 25% { transform: translateX(-3px); box-shadow: 0 0 12px #ff3b2f; } 60% { transform: translateX(2px); } }
@keyframes hhurt-b { 25% { transform: translateX(-3px); box-shadow: 0 0 12px #ff3b2f; } 60% { transform: translateX(2px); } }
body.gta #gta-hud .g-wanted { gap: 1px; min-height: 24px; }
body.gta #gta-hud .g-wanted i { display: block; width: 24px; height: 24px; font-size: 0; color: transparent; text-shadow: none; background: url(${img.off}) center / contain no-repeat; }
body.gta #gta-hud .g-wanted i.on { background-image: url(${img.on}); animation: hcopin .45s cubic-bezier(.2,1.7,.4,1) both; }
body.gta #gta-hud .g-wanted.flash i.on { animation: hcopfl .6s steps(1) infinite; }
@keyframes hcopin { from { transform: scale(2.4) rotate(-25deg); opacity: 0; } }
@keyframes hcopfl { 0% { background-image: url(${img.red}); } 50% { background-image: url(${img.blue}); } }
#gta-hud .h-kills { display: flex; align-items: center; gap: 5px; font: 800 17px/1 var(--hud); color: #ffd8d3; text-shadow: 0 2px 0 #000; font-variant-numeric: tabular-nums; }
#gta-hud .h-kills i { width: 17px; height: 17px; background: url(${img.skull}) center / contain no-repeat; }
#gta-hud .h-kills.bump { animation: hbump .4s cubic-bezier(.2,1.7,.4,1); }
#gta-hud .h-kills.bump-b { animation: hbump-b .4s cubic-bezier(.2,1.7,.4,1); }
@keyframes hbump { from { transform: scale(1.6); color: #ff4a3a; } }
@keyframes hbump-b { from { transform: scale(1.6); color: #ff4a3a; } }
#gta-hud .h-md { position: absolute; right: calc(100% + 10px); font: 19px/1 var(--display); text-shadow: 0 2px 0 #000; white-space: nowrap; pointer-events: none; animation: hmd 1.8s ease-out forwards; }
@keyframes hmd { 0% { transform: translateY(8px) scale(1.4); opacity: 0; } 12% { transform: none; opacity: 1; } 70% { opacity: 1; } 100% { transform: translateY(-22px); opacity: 0; } }
#gta-hud .h-vig { position: absolute; inset: 0; pointer-events: none; opacity: 0; will-change: opacity; background: radial-gradient(ellipse at center, rgba(0,0,0,0) 56%, rgba(160,0,0,0.45) 80%, rgba(95,0,0,0.9) 100%); }
#gta-hud .h-combo { position: absolute; left: 0; right: 0; top: 31%; text-align: center; pointer-events: none; font: clamp(30px, 6.4vw, 58px)/1 var(--display); color: #ff3b2f; text-shadow: 0 4px 0 #000, 0 0 26px rgba(255,40,20,0.45); opacity: 0; padding: 0 12px; }
#gta-hud .h-combo small { display: block; margin-top: 6px; font: 800 clamp(14px, 2.4vw, 20px)/1 var(--hud); color: #fff; letter-spacing: 0.14em; }
#gta-hud .h-combo.go { animation: hcombo 1.7s cubic-bezier(.2,1.4,.4,1) forwards; }
#gta-hud .h-combo.go-b { animation: hcombo-b 1.7s cubic-bezier(.2,1.4,.4,1) forwards; }
@keyframes hcombo { 0% { transform: scale(2.6) rotate(-8deg); opacity: 0; } 14% { transform: scale(1) rotate(-3deg); opacity: 1; } 78% { opacity: 1; } 100% { transform: scale(0.92) translateY(-16px) rotate(-3deg); opacity: 0; } }
@keyframes hcombo-b { 0% { transform: scale(2.6) rotate(-8deg); opacity: 0; } 14% { transform: scale(1) rotate(-3deg); opacity: 1; } 78% { opacity: 1; } 100% { transform: scale(0.92) translateY(-16px) rotate(-3deg); opacity: 0; } }
body.gta #gta-hud .g-district { right: 12px; bottom: calc(var(--h-mapb) + var(--h-mapw) + 10px + var(--h-dashh) + var(--h-cardh)); padding: 3px 12px 5px 26px; background: linear-gradient(90deg, rgba(10,11,14,0), rgba(10,11,14,0.86) 26%); border-right: 4px solid #ffd23a; transition: opacity .6s, bottom .3s; max-width: calc(100vw - 40px); }
body.gta #gta-hud .g-district::before { content: attr(data-k); display: block; font: 800 10px/1.2 var(--hud); letter-spacing: 0.32em; color: #c9cdd6; text-shadow: none; }
body.gta #gta-hud .g-district.h-in { animation: hdist .55s cubic-bezier(.2,1.4,.4,1); }
body.gta #gta-hud .g-district.h-in-b { animation: hdist-b .55s cubic-bezier(.2,1.4,.4,1); }
@keyframes hdist { from { transform: translateX(60px) skewX(-14deg); opacity: 0; } }
@keyframes hdist-b { from { transform: translateX(60px) skewX(-14deg); opacity: 0; } }
body.gta #gta-hud .g-map { bottom: var(--h-mapb); }
#gta-hud .h-dash { position: absolute; right: 12px; bottom: calc(var(--h-mapb) + var(--h-mapw) + 6px); width: var(--h-mapw); display: flex; flex-direction: column; gap: 4px; opacity: 0; transform: translateY(12px); transition: opacity .25s, transform .25s; pointer-events: none; }
#gta-hud.h-car .h-dash { opacity: 1; transform: none; }
#gta-hud .h-speedo { display: block; width: 100%; height: auto; }
#gta-hud .h-lcd { --hc: #7dff9a; height: 21px; box-sizing: border-box; display: flex; align-items: center; gap: 6px; padding: 0 7px; background: #06110b; border: 1px solid #1f3a2a; border-radius: 5px; box-shadow: inset 0 0 8px rgba(0,0,0,0.85); font: 700 13px/1 'Courier New', monospace; color: var(--hc); text-shadow: 0 0 6px var(--hc); overflow: hidden; white-space: nowrap; }
#gta-hud .h-eq { display: flex; gap: 1px; align-items: flex-end; height: 11px; flex: none; }
#gta-hud .h-eq i { width: 2px; height: 100%; background: var(--hc); transform: scaleY(0.25); transform-origin: bottom; }
#gta-hud .h-lcd.on .h-eq i { animation: heq .46s ease-in-out infinite alternate; }
#gta-hud .h-lcd.on .h-eq i:nth-child(2) { animation-duration: .31s; } #gta-hud .h-lcd.on .h-eq i:nth-child(3) { animation-duration: .55s; } #gta-hud .h-lcd.on .h-eq i:nth-child(4) { animation-duration: .38s; }
@keyframes heq { to { transform: scaleY(1); } }
#gta-hud .h-lcd-t { flex: 1; min-width: 0; overflow: hidden; }
#gta-hud .h-lcd-t span { display: inline-block; }
#gta-hud .h-lcd-t.mq span { animation: hmq var(--d, 12s) linear infinite; }
@keyframes hmq { 0%, 12% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
#gta-hud .h-card { --hc: #fff; position: absolute; right: 12px; bottom: calc(var(--h-mapb) + var(--h-mapw) + 10px + var(--h-dashh)); display: flex; gap: 10px; align-items: center; padding: 7px 14px 7px 7px; max-width: calc(100vw - 24px); box-sizing: border-box; background: rgba(10,11,14,0.92); border: 2px solid var(--hc); border-radius: 10px; box-shadow: 0 0 18px rgba(0,0,0,0.5); opacity: 0; transform: translateY(14px) scale(0.94); transform-origin: right bottom; transition: opacity .22s, transform .3s cubic-bezier(.2,1.4,.4,1); pointer-events: none; }
#gta-hud .h-card.on { opacity: 1; transform: none; }
#gta-hud .h-card canvas { width: 62px; height: 62px; border-radius: 8px; flex: none; }
#gta-hud .h-card div { min-width: 0; }
#gta-hud .h-card b { display: block; font: 21px/1.05 var(--display); color: var(--hc); text-shadow: 0 2px 0 #000; white-space: nowrap; }
#gta-hud .h-card span { display: block; margin-top: 3px; font: 800 12px/1.1 var(--hud); letter-spacing: 0.12em; text-transform: uppercase; color: #c9cdd6; }
#gta-hud .h-card em { display: block; margin-top: 3px; font: 700 14px/1.15 var(--hud); font-style: normal; color: #fff; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#gta-hud .h-wicon { width: 46px; height: 23px; flex: none; }
#gta-hud .h-mapdim { position: absolute; inset: 0; background: rgba(5,6,9,0.6); z-index: 4; display: none; pointer-events: none; }
#gta-hud.h-bigmap .h-mapdim { display: block; }
#gta-hud .h-bmap { position: absolute; left: var(--h-bigx); top: var(--h-bigy); width: var(--h-bigw); height: var(--h-bigw); z-index: 5; box-sizing: border-box; border: 2px solid #ffd23a; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.7); display: none; pointer-events: none; }
#gta-hud.h-bigmap .h-bmap { display: block; }
#gta-hud .h-legend { position: absolute; z-index: 5; display: none; box-sizing: border-box; width: var(--h-legw); max-height: calc(100% - 20px); overflow: hidden; background: rgba(10,11,14,0.92); border: 2px solid #2f3339; border-radius: 10px; padding: 10px 12px; font: 800 14px/1.1 var(--hud); letter-spacing: 0.05em; text-transform: uppercase; color: #e9e6dc; pointer-events: none; }
#gta-hud.h-bigmap .h-legend { display: grid; grid-template-columns: 24px 1fr; gap: 6px 9px; align-items: center; align-content: start; }
#gta-hud .h-legend.wide { grid-template-columns: 24px 1fr 24px 1fr !important; }
#gta-hud .h-legend h4 { grid-column: 1 / -1; margin: 0 0 2px; font: 400 19px/1 var(--display); color: #ffd23a; letter-spacing: 0.02em; }
#gta-hud .h-legend p { grid-column: 1 / -1; margin: 4px 0 0; font: 700 12px/1.2 var(--hud); color: #9da3ab; letter-spacing: 0.04em; }
#gta-hud .h-legend canvas { width: 24px; height: 24px; }
#gta-hud .h-touch { position: absolute; left: 0; right: 0; bottom: 0; height: var(--h-touch); pointer-events: none; display: none; z-index: 3; }
body.gta.touch #gta-hud .h-touch { display: block; }
#gta-hud .h-joy { position: absolute; left: 0; bottom: 0; width: 48%; height: calc(100% + 40px); pointer-events: auto; touch-action: none; }
#gta-hud .h-joy-b { position: absolute; left: 92px; top: calc(100% - 96px); width: 124px; height: 124px; margin: -62px 0 0 -62px; border-radius: 50%; box-sizing: border-box; border: 2px solid rgba(255,255,255,0.28); background: radial-gradient(circle, rgba(255,255,255,0.04) 0 58%, rgba(255,255,255,0.12) 59% 62%, rgba(0,0,0,0.25) 63%); opacity: .55; transition: opacity .15s; pointer-events: none; }
#gta-hud .h-joy.on .h-joy-b { opacity: 1; }
#gta-hud .h-joy-k { position: absolute; left: 50%; top: 50%; width: 56px; height: 56px; margin: -28px 0 0 -28px; border-radius: 50%; background: radial-gradient(circle at 40% 35%, #6a707b, #2a2e35); border: 2px solid rgba(255,255,255,0.45); box-shadow: 0 4px 12px rgba(0,0,0,0.5); }
#gta-hud .h-tb { position: absolute; box-sizing: border-box; pointer-events: auto; touch-action: none; border-radius: 50%; border: 2px solid rgba(255,255,255,0.38); background: rgba(16,18,22,0.74); color: #fff; font: 800 13px/1 var(--hud); letter-spacing: 0.06em; text-transform: uppercase; display: grid; place-items: center; padding: 0; text-shadow: 0 1px 0 #000; box-shadow: 0 4px 12px rgba(0,0,0,0.4); -webkit-user-select: none; user-select: none; }
#gta-hud .h-tb.down, #gta-hud .h-tb.lit { background: rgba(255,210,58,0.88); color: #111; border-color: #ffd23a; text-shadow: none; }
#gta-hud .h-tb.down { transform: scale(0.93); }
#gta-hud .h-tb.hot { border-color: #7dff9a; box-shadow: 0 0 0 3px rgba(125,255,154,0.35), 0 4px 12px rgba(0,0,0,0.4); }
#gta-hud .h-tb.fire { width: 90px; height: 90px; right: 22px; bottom: 26px; background: rgba(150,22,12,0.78); border-color: #ff6a4a; font-size: 17px; }
#gta-hud .h-tb.fire.down { background: rgba(255,90,60,0.92); color: #fff; }
#gta-hud .h-tb.use { width: 62px; height: 62px; right: 118px; bottom: 96px; }
#gta-hud .h-tb.weap, #gta-hud .h-tb.hand { width: 62px; height: 62px; right: 124px; bottom: 18px; }
#gta-hud .h-tb.sprint, #gta-hud .h-tb.horn { width: 54px; height: 54px; right: 30px; bottom: 130px; }
#gta-hud .h-tb.radio { width: 48px; height: 48px; right: 98px; bottom: 170px; font-size: 11px; }
#gta-hud .h-tb.map { width: 46px; height: 46px; right: 18px; bottom: 196px; font-size: 12px; }
#gta-hud .h-tb.job { width: 48px; height: 48px; right: 172px; bottom: 146px; font-size: 12px; border-color: #ffd23a; color: #ffe9a8; display: none; }
#gta-hud .h-touch.tm-car .h-tb.job.show { display: grid; }
#gta-hud .h-touch.tm-foot .h-tb.ct-car, #gta-hud .h-touch.tm-car .h-tb.ct-foot { display: none; }
#gta-hud .h-aim { position: absolute; width: 0; height: 0; pointer-events: none; display: none; }
#gta-hud .h-aim.on { display: block; }
#gta-hud .h-aim::after { content: ''; position: absolute; left: -15px; top: -15px; width: 26px; height: 26px; border: 2px solid #ff4a3a; border-radius: 50%; box-shadow: 0 0 0 2px rgba(0,0,0,0.6), inset 0 0 0 2px rgba(0,0,0,0.4); animation: haim .8s ease-in-out infinite alternate; }
@keyframes haim { to { transform: scale(0.75) rotate(45deg); } }
body.gta.touch #gta-hud { --h-touch: 236px; --h-mapb: calc(var(--h-touch) + 14px + env(safe-area-inset-bottom, 0px)); }
body.gta.touch #gta-hud .g-popup { bottom: calc(var(--h-touch) + 12px + env(safe-area-inset-bottom, 0px)); }
body.gta.touch #gta-hud .g-hint, body.gta.touch #gta-hud .j-hint { bottom: calc(var(--h-touch) + 12px + env(safe-area-inset-bottom, 0px)); }
body.gta.touch #gta-hud .pol-radio { bottom: calc(var(--h-touch) + 56px + env(safe-area-inset-bottom, 0px)); }
body.gta.touch #gta-hud .s-pick, body.gta.touch #gta-hud .s-offer { bottom: calc(var(--h-touch) + 56px + env(safe-area-inset-bottom, 0px)); }
@media (max-width: 600px) {
  #gta-hud { --h-mapw: 124px; }
  #gta-hud.h-car { --h-dashh: 64px; }
  #gta-hud.h-cardon { --h-cardh: 74px; }
  #gta-hud .h-lcd { height: 18px; font-size: 11px; padding: 0 5px; }
  #gta-hud .h-card canvas { width: 50px; height: 50px; }
  #gta-hud .h-card b { font-size: 17px; }
  #gta-hud .h-card em { max-width: 170px; }
  body.gta #gta-hud .g-tr { gap: 2px; }
  body.gta #gta-hud .g-money { font-size: 21px; }
  body.gta #gta-hud .g-wanted i { width: 19px; height: 19px; }
  body.gta #gta-hud .g-wanted { min-height: 19px; }
  body.gta #gta-hud .g-clock { font-size: 14px; }
  body.gta #gta-hud .g-pager, body.gta #gta-hud .m-call { top: var(--h-ptop, calc(150px + env(safe-area-inset-top, 0px))); }
  #gta-hud .h-kills { font-size: 15px; }
}
@media (max-width: 600px) {
  body.gta.touch #gta-hud .g-hint, body.gta.touch #gta-hud .j-hint { left: 12px; transform: none; max-width: calc(100% - var(--h-mapw) - 40px); box-sizing: border-box; white-space: normal; text-align: left; border-radius: 12px; font-size: 14px; }
  body.gta.touch #gta-hud .g-popup { bottom: calc(var(--h-touch) + 60px + env(safe-area-inset-bottom, 0px)); max-width: calc(100% - var(--h-mapw) - 40px); font-size: 20px; }
  body.gta.touch #gta-hud .pol-radio { bottom: calc(var(--h-touch) + 104px + env(safe-area-inset-bottom, 0px)); max-width: calc(100% - var(--h-mapw) - 40px); box-sizing: border-box; }
}
@media (max-height: 540px) {
  body.gta.touch #gta-hud { --h-touch: 150px; --h-mapw: 94px; }
  body.gta.touch #gta-hud .g-tr { top: calc(58px + env(safe-area-inset-top, 0px)); gap: 1px; }
  body.gta.touch #gta-hud .g-money { font-size: 22px; }
  body.gta.touch #gta-hud .g-wanted i { width: 18px; height: 18px; }
  body.gta.touch #gta-hud .g-wanted { min-height: 18px; }
  body.gta.touch #gta-hud .g-clock { font-size: 13px; }
  body.gta.touch #gta-hud .g-map { width: 90px; height: 90px; top: calc(140px + env(safe-area-inset-top, 0px)); bottom: auto; }
  body.gta.touch #gta-hud .h-dash { right: calc(12px + var(--h-mapw) + 8px); top: calc(140px + env(safe-area-inset-top, 0px)); bottom: auto; width: 140px; }
  body.gta.touch #gta-hud .h-card { right: calc(12px + var(--h-mapw) + 8px); top: calc(140px + env(safe-area-inset-top, 0px)); bottom: auto; z-index: 1; }
  body.gta.touch #gta-hud.h-cardon .h-dash { opacity: 0; }
  body.gta.touch #gta-hud .g-district { left: 0; right: 0; margin: 0 auto; width: max-content; bottom: calc(var(--h-touch) + 50px + env(safe-area-inset-bottom, 0px)); }
  #gta-hud .h-tb.fire { width: 80px; height: 80px; right: 20px; bottom: 20px; }
  #gta-hud .h-tb.use { width: 56px; height: 56px; right: 112px; bottom: 66px; }
  #gta-hud .h-tb.weap, #gta-hud .h-tb.hand { width: 56px; height: 56px; right: 178px; bottom: 16px; }
  #gta-hud .h-tb.sprint, #gta-hud .h-tb.horn { width: 50px; height: 50px; right: 24px; bottom: 108px; }
  #gta-hud .h-tb.radio { width: 44px; height: 44px; right: 180px; bottom: 82px; }
  #gta-hud .h-tb.map { width: 44px; height: 44px; right: 86px; bottom: 126px; }
  #gta-hud .h-tb.job { width: 44px; height: 44px; right: 244px; bottom: 30px; }
}
.h-pstats { width: 100%; box-sizing: border-box; background: rgba(12,13,16,0.85); border: 2px solid #2f3339; border-radius: 10px; padding: 12px 14px; text-align: left; }
.h-pstats .eyebrow { margin-bottom: 6px; }
.h-pgrid { display: grid; grid-template-columns: 1fr auto 1fr auto; gap: 4px 12px; font-family: var(--hud); font-size: 16px; font-variant-numeric: tabular-nums; }
.h-pgrid span { color: var(--muted); }
.h-pgrid b { color: var(--line); text-align: right; }
.h-pgrid b.g { color: #7dff9a; } .h-pgrid b.r { color: #ff6b5a; }
.h-pquip { margin: 8px 0 0; font-family: var(--hud); font-weight: 700; font-size: 16px; color: var(--amber); }
@media (max-width: 460px) { .h-pgrid { grid-template-columns: 1fr auto; } }
`;
  }

  // ================= DOM =================
  let HUD = null;
  function build() {
    const root = document.getElementById('gta-hud');
    if (!root) return null;
    if (HUD && HUD.root === root && HUD.dash.isConnected) return HUD;
    if (!document.getElementById('gta-hudx-css')) {
      const st = document.createElement('style'); st.id = 'gta-hudx-css';
      st.textContent = css({ on: copHead('on'), off: copHead('off'), red: copHead('red'), blue: copHead('blue'), skull: SKULL() });
      document.head.appendChild(st);
    }
    const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
    const H = { root, cache: {} };
    H.vig = el('div', 'h-vig'); root.insertBefore(H.vig, root.firstChild);
    H.dash = el('div', 'h-dash', root, '<canvas class="h-speedo" width="368" height="116"></canvas><div class="h-lcd"><span class="h-eq"><i></i><i></i><i></i><i></i></span><div class="h-lcd-t"><span></span></div></div>');
    H.speedo = H.dash.querySelector('canvas'); H.lcd = H.dash.querySelector('.h-lcd'); H.lcdT = H.dash.querySelector('.h-lcd-t'); H.lcdS = H.lcdT.firstChild;
    H.card = el('div', 'h-card', root, '<canvas width="124" height="124"></canvas><div><b></b><span></span><em></em></div>');
    H.logo = H.card.querySelector('canvas'); H.cardB = H.card.querySelector('b'); H.cardS = H.card.querySelector('span'); H.cardE = H.card.querySelector('em');
    H.combo = el('div', 'h-combo', root);
    H.mapdim = el('div', 'h-mapdim', root);
    H.bmap = el('canvas', 'h-bmap', root); H.bmap.width = H.bmap.height = 16;
    H.legend = el('div', 'h-legend', root);
    H.aim = el('div', 'h-aim', root);
    const tr = root.querySelector('.g-tr') || root;
    H.tr = tr;
    H.kills = el('div', 'h-kills', tr, '<i></i><span>0</span>'); H.kills.hidden = true; H.killsN = H.kills.lastChild;
    H.pager = root.querySelector('.g-pager'); H.district = root.querySelector('.g-district'); H.map = root.querySelector('.g-map');
    H.hp = root.querySelector('.g-bar.hp'); H.carBar = root.querySelector('.g-bar.car'); H.hint = root.querySelector('.g-hint'); H.weap = root.querySelector('.g-weap');
    H.touch = buildTouch(root);
    const pause = document.querySelector('#scr-pause .panel');
    if (pause) { H.pstats = pause.querySelector('.h-pstats') || el('div', 'h-pstats gta-only', null); if (!H.pstats.isConnected) pause.insertBefore(H.pstats, pause.querySelector('.btns')); }
    HUD = H;
    return H;
  }
  function polRadio() { if (HUD && (!HUD.polRadio || !HUD.polRadio.isConnected)) HUD.polRadio = HUD.root.querySelector('.pol-radio'); return HUD && HUD.polRadio; }

  // ================= touch controls =================
  const T = { joyId: null, bx: 0, by: 0, mv: { x: 0, y: 0 }, fireId: null, fx: 0, fy: 0, aiming: false, held: new Set(), sprint: false, mapId: null, handId: null, aimAt: null };
  const baseDown = X.input.down, baseAny = X.input.any;
  // Held on-screen buttons count as held keys (map = Tab, sprint = Shift) for core and every module.
  X.input.down = c => baseDown(c) || T.held.has(c);
  X.input.any = (...cs) => baseAny(...cs) || (T.held.size > 0 && cs.some(c => T.held.has(c)));
  const JR = 56;   // joystick throw, px
  function buildTouch(root) {
    const t = document.createElement('div'); t.className = 'h-touch tm-foot';
    t.innerHTML = '<div class="h-joy"><div class="h-joy-b"><div class="h-joy-k"></div></div></div>' +
      '<button class="h-tb fire" data-b="fire" aria-label="Fire">FIRE</button><button class="h-tb use" data-b="use" aria-label="Use">USE</button>' +
      '<button class="h-tb weap ct-foot" data-b="weap" aria-label="Next weapon">WPN</button><button class="h-tb hand ct-car" data-b="hand" aria-label="Handbrake">BRAKE</button>' +
      '<button class="h-tb sprint ct-foot" data-b="sprint" aria-label="Sprint">RUN</button><button class="h-tb horn ct-car" data-b="horn" aria-label="Horn">HORN</button>' +
      '<button class="h-tb radio ct-car" data-b="radio" aria-label="Radio">RADIO</button><button class="h-tb map" data-b="map" aria-label="Map">MAP</button>' +
      '<button class="h-tb job ct-car" data-b="job" aria-label="Start or stop a job">JOB</button>';
    root.appendChild(t);
    const joy = t.querySelector('.h-joy'), base = joy.firstChild, knob = base.firstChild;
    const cap = (e, el) => { try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ } };
    const placeBase = (x, y) => { base.style.left = x + 'px'; base.style.top = y + 'px'; };
    joy.addEventListener('pointerdown', e => {
      e.preventDefault(); if (T.joyId != null || !playing()) return;
      T.joyId = e.pointerId; cap(e, joy); joy.classList.add('on');
      const r = joy.getBoundingClientRect();
      T.bx = cl(e.clientX - r.left, 66, Math.max(66, r.width - 66)); T.by = cl(e.clientY - r.top, 66, Math.max(66, r.height - 66));
      placeBase(T.bx, T.by); joyMove(e);
    });
    const joyMove = e => {
      if (e.pointerId !== T.joyId) return;
      const r = joy.getBoundingClientRect();
      let dx = e.clientX - r.left - T.bx, dy = e.clientY - r.top - T.by, d = Math.hypot(dx, dy);
      if (d > JR) {   // drag the base along so the stick never runs out of throw
        const k = (d - JR) / d; T.bx = cl(T.bx + dx * k, 40, r.width - 40); T.by = cl(T.by + dy * k, 40, r.height - 40); placeBase(T.bx, T.by);
        dx = e.clientX - r.left - T.bx; dy = e.clientY - r.top - T.by; d = Math.hypot(dx, dy);
        if (d > JR) { dx *= JR / d; dy *= JR / d; d = JR; }
      }
      knob.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
      const m = d / JR;
      T.mv.x = m < 0.12 ? 0 : dx / JR; T.mv.y = m < 0.12 ? 0 : dy / JR;
      X.touch.move = T.mv;
    };
    const joyUp = e => {
      if (e.pointerId !== T.joyId) return;
      T.joyId = null; X.touch.move = null; T.mv.x = T.mv.y = 0;
      knob.style.transform = ''; base.style.left = ''; base.style.top = ''; joy.classList.remove('on');
    };
    joy.addEventListener('pointermove', joyMove);
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) joy.addEventListener(ev, joyUp);
    for (const b of t.querySelectorAll('.h-tb')) {
      const kind = b.dataset.b;
      b.addEventListener('contextmenu', e => e.preventDefault());
      b.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        if (!playing()) return;
        cap(e, b); b.classList.add('down'); b.hudId = e.pointerId;
        const pr = c => X.touch.presses.add(c);
        if (kind === 'fire') { T.fireId = e.pointerId; T.fx = e.clientX; T.fy = e.clientY; T.aiming = false; X.touch.fire = true; }
        else if (kind === 'use') pr('KeyF');
        else if (kind === 'weap') pr('KeyE');
        else if (kind === 'horn') pr('KeyH');
        else if (kind === 'radio') pr('KeyR');
        else if (kind === 'job') pr('KeyG');
        else if (kind === 'hand') { T.handId = e.pointerId; X.touch.hand = true; }
        else if (kind === 'map') { T.mapId = e.pointerId; T.held.add('Tab'); }
        else if (kind === 'sprint') { T.sprint = !T.sprint; if (T.sprint) T.held.add('ShiftLeft'); else T.held.delete('ShiftLeft'); b.classList.toggle('lit', T.sprint); }
      });
      if (kind === 'fire') b.addEventListener('pointermove', e => {
        if (e.pointerId !== T.fireId) return;
        const dx = e.clientX - T.fx, dy = e.clientY - T.fy;
        if (Math.hypot(dx, dy) > 16) { T.aiming = true; X.touch.aim = Math.atan2(dy, dx) - (X.lastView ? X.lastView.rot : 0); }
      });
      const up = e => {
        if (b.hudId !== e.pointerId) return;
        b.hudId = null; b.classList.remove('down');
        if (kind === 'fire' && T.fireId === e.pointerId) { T.fireId = null; T.aiming = false; X.touch.fire = false; X.touch.aim = null; }
        if (kind === 'hand' && T.handId === e.pointerId) { T.handId = null; X.touch.hand = false; }
        if (kind === 'map' && T.mapId === e.pointerId) { T.mapId = null; T.held.delete('Tab'); }
      };
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, up);
    }
    return { root: t, joy, base, knob, use: t.querySelector('.use'), fire: t.querySelector('.fire'), sprint: t.querySelector('.sprint'), job: t.querySelector('.job'), btns: [...t.querySelectorAll('.h-tb')] };
  }
  function releaseTouch() {
    T.joyId = T.fireId = T.mapId = T.handId = null; T.aiming = false; T.held.clear(); T.sprint = false; T.aimAt = null;
    X.touch.move = null; X.touch.fire = false; X.touch.aim = null; X.touch.hand = false;
    if (HUD && HUD.touch) {
      const t = HUD.touch; t.knob.style.transform = ''; t.base.style.left = ''; t.base.style.top = ''; t.joy.classList.remove('on');
      for (const b of t.btns) { b.classList.remove('down', 'lit'); b.hudId = null; }
    }
  }
  // Tap-to-fire auto-aim: the best target in front of the player within reach and in sight.
  function autoAim() {
    const p = P.ped; if (!p) return null;
    const w = X.WEAPONS && X.WEAPONS[P.weapon], reach = w && w.range > 4 ? Math.min(24, w.range) : Math.max(2.4, ((w && w.range) || 1) * 1.8);   // melee: step in and swing
    let best = null, bs = Infinity;
    for (const q of X.peds) {
      if (q === p || q.dead || q.removed || q.hidden || q.car || q.team === 'player') continue;
      const dx = q.x - p.x, dy = q.y - p.y; if (Math.abs(dx) > reach || Math.abs(dy) > reach) continue;
      const d = Math.hypot(dx, dy); if (d > reach) continue;
      const off = Math.abs(X.util.wrap(Math.atan2(dy, dx) - p.th));
      const s = d + off * 5 - (q.team === 'cop' || q.team === 'gang' || q.lastBy === p ? 4 : 0) - (q.ai && q.ai.target === p ? 5 : 0);
      if (s < bs && (d < 2 || X.lineOfSight(p, q))) { bs = s; best = q; }
    }
    return best;
  }
  function touchTick() {
    const on = !!(PG.input && PG.input.touchActive);
    if (!on) { if (T.joyId != null || T.fireId != null || T.held.size) releaseTouch(); return; }
    if (T.fireId != null && !T.aiming) {
      const q = !P.car ? autoAim() : null;
      T.aimAt = q; X.touch.aim = q ? Math.atan2(q.y - P.ped.y, q.x - P.ped.x) : null;
    } else if (T.fireId == null) T.aimAt = null;
    if (P.car && T.held.has('ShiftLeft')) { T.held.delete('ShiftLeft'); T.sprint = false; if (HUD) HUD.touch.sprint.classList.remove('lit'); }
  }

  // ================= HUD state =================
  // Restart a CSS animation without forcing a reflow: flip between two classes bound to twin keyframes.
  function replay(el, cls) { if (!el) return; const b = cls + '-b'; if (el.classList.contains(cls)) { el.classList.remove(cls); el.classList.add(b); } else { el.classList.remove(b); el.classList.add(cls); } }
  const V = { hit: 0, pulse: 0, beatT: 0, level: 0, shown: -1, beats: 0, shake: false, shakeT: 0 };
  const CB = { n: 0, t: -9, carN: 0, carT: -9, kinds: {} };
  const ST = {};
  function resetStats() { Object.assign(ST, { jacked: 0, stolen: 0, wrecked: 0, booms: 0, cops: 0, wasted: 0, busted: 0, earned: 0, spent: 0, dist: 0, drive: 0, top: 0, bestCombo: 0 }); }
  resetStats();
  let MD = [], mdLast = null;
  function heartbeat() {
    V.beats++;
    const k = PG.audio.kit();
    if (k) { tn(k, 'sine', 72, k.now, 0.16, 0.34, { to: 42 }); tn(k, 'sine', 64, k.now + 0.17, 0.13, 0.24, { to: 38 }); }
    if (HUD) replay(HUD.hp, 'h-beat');
  }
  const COMBO = ['', '', 'DOUBLE KILL!', 'TRIPLE KILL!', 'MULTI KILL!', 'MEGA KILL!', 'ULTRA KILL!', 'MASSACRE!', 'TAKE THE BUS!!'];
  const KIND_SUB = { car: 'ROADKILL', explosion: 'KABOOM', fire: 'WELL DONE', bullet: 'BANG BANG', melee: 'BARE KNUCKLES', crash: 'ROADKILL' };
  function showCombo(text, sub, color) {
    const H = HUD; if (!H) return;
    H.combo.textContent = text;
    if (sub) { const s = document.createElement('small'); s.textContent = sub; H.combo.appendChild(s); }
    H.combo.style.color = color || '#ff3b2f';
    replay(H.combo, 'go');
  }
  X.on('pedKilled', e => {
    if (!X.active || !e.ped || e.ped.isPlayer || !X.byPlayer(e.by)) return;
    if (e.ped.team === 'cop') ST.cops++;
    CB.n = X.time - CB.t < 3.2 ? CB.n + 1 : 1; CB.t = X.time;
    if (CB.n === 1) CB.kinds = {};
    CB.kinds[e.kind] = (CB.kinds[e.kind] || 0) + 1;
    ST.bestCombo = Math.max(ST.bestCombo, CB.n);
    if (HUD) replay(HUD.kills, 'bump');
    if (CB.n >= 2) {
      const top = Object.keys(CB.kinds).sort((a, b) => CB.kinds[b] - CB.kinds[a])[0];
      showCombo(COMBO[Math.min(CB.n, COMBO.length - 1)], (KIND_SUB[top] || 'CARNAGE') + ' ×' + CB.n + (e.ped.team === 'cop' ? ' · COP KILLER' : ''));
      const k = PG.audio.kit(); if (k) { tn(k, 'square', 440 * Math.pow(1.19, Math.min(8, CB.n)), k.now, 0.22, 0.06, { lp: 3000 }); tn(k, 'square', 660 * Math.pow(1.19, Math.min(8, CB.n)), k.now + 0.09, 0.3, 0.05, { lp: 3000 }); }
    }
  });
  X.on('carDestroyed', e => {
    if (!X.active || !X.byPlayer(e.by)) return;
    ST.wrecked++;
    CB.carN = X.time - CB.carT < 3 ? CB.carN + 1 : 1; CB.carT = X.time;
    if (CB.carN >= 2 && X.time - CB.t > 0.6) showCombo('CHAIN REACTION!', 'CARS ×' + CB.carN, '#ffb02e');
  });
  X.on('pedHurt', e => {
    if (!X.active || !e.ped || !e.ped.isPlayer) return;
    V.hit = Math.min(1, V.hit + 0.28 + (e.amount || 0) / 55);
    if ((e.amount || 0) >= 6 && performance.now() - V.shakeT > 180) { V.shakeT = performance.now(); V.shake = true; }
  });
  X.on('carjack', () => { if (X.active) ST.jacked++; });
  X.on('enterCar', () => { if (X.active) ST.stolen++; });
  X.on('explosion', e => { if (X.active && X.byPlayer(e.by)) ST.booms++; });
  X.on('wasted', () => { if (X.active) ST.wasted++; });
  X.on('busted', () => { if (X.active) ST.busted++; });
  X.on('money', e => {
    if (!X.active || !e.delta) return;
    if (e.delta > 0) ST.earned += e.delta; else ST.spent -= e.delta;
    MD.push(e.delta);
  });
  function moneyDeltas() {
    const H = HUD; if (!H || !MD.length) return;
    let sum = 0; for (const d of MD) sum += d; MD.length = 0;
    if (!sum) return;
    const now = performance.now();
    if (mdLast && mdLast.isConnected && now - mdLast.t0 < 450 && Math.sign(sum) === Math.sign(mdLast.v)) { mdLast.v += sum; mdLast.textContent = (mdLast.v > 0 ? '+$' : '-$') + Math.abs(mdLast.v); return; }
    const live = H.tr.querySelectorAll('.h-md');
    if (live.length >= 3) live[0].remove();
    const e = document.createElement('div'); e.className = 'h-md'; e.v = sum; e.t0 = now;
    e.textContent = (sum > 0 ? '+$' : '-$') + Math.abs(sum); e.style.color = sum > 0 ? '#7dff9a' : '#ff6b5a';
    e.style.top = (4 + (H.tr.querySelectorAll('.h-md').length) * 22) + 'px';
    e.addEventListener('animationend', () => e.remove());
    H.tr.appendChild(e); mdLast = e;
  }

  // ================= per-frame HUD =================
  let lastT = 0, speedoKey = '', wKey = '', districtKey = '', bigOn = false, bigKey = '', legendKey = '', pauseShown = false, logoT = 0;
  const put = (k, v, fn) => { const c = HUD.cache; if (c[k] !== v) { c[k] = v; fn(v); } };
  function setLcd(text, color, on) {
    const H = HUD;
    put('lcdc', color, v => H.lcd.style.setProperty('--hc', v));
    put('lcdon', on, v => H.lcd.classList.toggle('on', v));
    put('lcd', text, v => {
      const mq = v.length > (H.lcdT.clientWidth || 140) / 8;
      H.lcdS.textContent = mq ? v + '\u2003\u2022\u2003' + v + '\u2003\u2022\u2003' : v;
      H.lcdT.classList.toggle('mq', mq);
      if (mq) H.lcdT.style.setProperty('--d', Math.max(6, v.length * 0.22).toFixed(1) + 's');
    });
  }
  function hudFrame() {
    const H = build(); if (!H) return;
    const nowMs = performance.now(), dt = Math.min(0.1, lastT ? (nowMs - lastT) / 1000 : 0.016); lastT = nowMs;
    const g = G(), live = X.active && g.status === 'play';
    radioFrame(live ? dt : 0);
    touchTick();
    // ---- car: dashboard, LCD, station card
    const c = R.car, inCar = !!c && P.state === 'play';
    put('car', inCar, v => H.root.classList.toggle('h-car', v));
    if (inCar) {
      const kmh = Math.abs(c.speed || 0) * 3.6, gear = gearOf(c), hpF = c.hp / c.maxHp, key = Math.round(kmh) + gear + (hpF < 0.3 ? Math.floor(nowMs / 300) % 2 : '');
      if (key !== speedoKey) { speedoKey = key; drawSpeedo(H.speedo, kmh, gear, hpF); }
      const d = R.def || OFF, r = d.off ? null : rt(d);
      const muted = !!PG.audio.muted;
      setLcd(d.off ? 'RADIO OFF' : muted ? d.name.toUpperCase() + ' · MUTED' : (d.name.toUpperCase() + ' ' + d.freq + '  ' + (r && r.lcd ? r.lcd : d.tag)), d.color, !d.off && !muted && !R.halted);
    } else speedoKey = '';
    const card = inCar && R.cardT > 0;
    put('cardon', card, v => { H.card.classList.toggle('on', v); H.root.classList.toggle('h-cardon', v); });
    if (card) {
      const d = R.def || OFF;
      put('card', d.id + R.changed, () => {
        H.card.style.setProperty('--hc', d.color); H.cardB.textContent = d.name; const touch = !!PG.input.touchActive; H.cardS.textContent = d.off ? (touch ? 'Tap RADIO to tune in' : 'Press R to tune in') : d.freq + ' · ' + d.genre + (touch ? '' : ' · R: next');
        const r = d.off ? null : rt(d); H.cardE.textContent = d.off ? d.tag : r && r.song && !d.talk ? r.song.title + ' — ' + r.song.artist : d.tag;
        logoT = 0;
      });
      if ((logoT -= dt) <= 0) { logoT = d_anim(R.def) ? 0.07 : 99; drawLogo(H.logo, R.def || OFF, nowMs / 1000, R.talking); }
    }
    // ---- health, car bar, vignette
    const p = P.ped;
    if (p) {
      const frac = p.dead ? 0 : p.hp / p.maxHp, low = !p.dead && frac < 0.3 && P.state === 'play';
      put('low', low, v => H.hp && H.hp.classList.toggle('h-low', v));
      if (live) {
        V.hit *= Math.exp(-dt * 2.6);
        if (low) { V.beatT -= dt; if (V.beatT <= 0) { V.beatT = 0.42 + 1.1 * (frac / 0.3); heartbeat(); V.pulse = 1; } } else V.beatT = 0;
        V.pulse *= Math.exp(-dt * 5);
        V.level = Math.max(V.hit, low ? 0.3 + 0.32 * V.pulse + (0.3 - frac) : 0);
      }
      if (V.shake) { V.shake = false; replay(H.hp, 'h-hurt'); }
      const o = Math.round(cl(V.level, 0, 1) * 40) / 40;
      if (o !== V.shown) { V.shown = o; H.vig.style.opacity = o; }
    }
    put('carlow', !!(c && c.hp / c.maxHp < 0.3), v => H.carBar && H.carBar.classList.toggle('h-low', v));
    // ---- kills, money deltas
    put('kills', P.kills || 0, v => { H.kills.hidden = !v; H.killsN.textContent = v; });
    moneyDeltas();
    // ---- district banner: re-animate on change, label it
    if (H.district) {
      const dn = H.district.textContent;
      if (dn !== districtKey) { districtKey = dn; H.district.dataset.k = X.scene ? 'INSIDE' : 'DISTRICT'; replay(H.district, 'h-in'); }
    }
    // ---- weapon icon when weapons.js is not around to draw one
    if (H.weap && !X.has('weapons') && !H.weap.querySelector('.w-icon')) {
      let ic = H.weap.querySelector('.h-wicon');
      if (!ic) { ic = document.createElement('canvas'); ic.className = 'h-wicon'; ic.width = 92; ic.height = 46; H.weap.insertBefore(ic, H.weap.firstChild); wKey = ''; }
      if (wKey !== P.weapon) { wKey = P.weapon; drawWeaponIcon(ic, P.weapon); }
    }
    // ---- touch: context, use highlight, aim marker
    if (H.touch) {
      put('tmode', P.car ? 'car' : 'foot', v => { H.touch.root.classList.toggle('tm-car', v === 'car'); H.touch.root.classList.toggle('tm-foot', v === 'foot'); });
      const hot = !P.car && H.hint && !H.hint.hidden;
      put('thot', hot, v => H.touch.use.classList.toggle('hot', v));
      put('tuse', P.car ? 'EXIT' : 'USE', v => { H.touch.use.textContent = v; });
      const jh = P.car && X.jobs && PG.input.touchActive ? X.jobs.hint || '' : '';
      put('tjob', jh ? (/stop/i.test(jh) ? 'STOP' : 'JOB') : '', v => { H.touch.job.classList.toggle('show', !!v); if (v) H.touch.job.textContent = v; });
      const tg = T.aimAt && !T.aimAt.dead ? T.aimAt : null;
      put('aimon', !!tg, v => H.aim.classList.toggle('on', v));
      if (tg) { const s = X.toScreen(tg.x, tg.y); H.aim.style.transform = 'translate(' + s.x.toFixed(0) + 'px,' + s.y.toFixed(0) + 'px)'; }
    }
    pagerSlot(dt);
    if (!live && (T.joyId != null || T.fireId != null || T.handId != null || T.held.size || X.touch.move || X.touch.fire)) releaseTouch();
    bigMap(nowMs / 1000);
    mapIcons();
    pauseStats(g);
  }
  // Narrow screens: the pager (and a phone call) go just below whichever top-corner stack is taller.
  let slotT = 0;
  function pagerSlot(dt) {
    const vis = !!HUD.pager && (!HUD.pager.hidden || !!(X.missions && X.missions.call));
    put('pvis', vis, v => { if (v) slotT = 0; });
    if ((slotT -= dt) > 0) return;
    slotT = 0.25;
    const H = HUD, narrow = H.root.clientWidth <= 600;
    if (!narrow || !H.pager) { put('ptop', '', () => H.root.style.removeProperty('--h-ptop')); return; }
    if (!vis) return;
    const tl = H.root.querySelector('.g-tl'), b = Math.max(tl ? tl.getBoundingClientRect().bottom : 0, H.tr.getBoundingClientRect().bottom);
    put('ptop', Math.round(b + 8) + 'px', v => H.root.style.setProperty('--h-ptop', v));
  }
  const d_anim = d => !!d && (d.talk || d.scanner || d.id === 'bass');

  // ================= map icons + big map =================
  // Holding Tab (or the touch MAP button) opens a whole-city map, north up, with district names, place
  // icons, this frame's blips and a legend. The static part is cached once per city and size.
  let BM = null;
  function bmXf(S) { const C = X.city, span = Math.max(C.W, C.H) + 48, sc = S / span; return { sc, ox: (S - C.W * sc) / 2, oy: (S - C.H * sc) / 2 }; }
  function bmBuild(S, px) {
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const c = cv.getContext('2d'), C = X.city, f = bmXf(S);
    c.fillStyle = '#0b0c10'; c.fillRect(0, 0, S, S);
    c.save(); c.translate(f.ox, f.oy); c.scale(f.sc, f.sc);
    c.fillStyle = '#4d525d'; c.fillRect(-8, -8, C.W + 16, C.H + 16);
    for (const b of C.blocks) { c.fillStyle = b.kind === 'park' ? '#1f3b27' : b.kind === 'plaza' ? '#3b3733' : '#191c23'; c.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); }
    c.fillStyle = '#242832'; for (const b of C.buildings) if (!b.deco && !b.place) c.fillRect(b.x0 + 0.8, b.y0 + 0.8, b.x1 - b.x0 - 1.6, b.y1 - b.y0 - 1.6);
    for (const id in X.places) { const b = X.places[id].b; if (b) { c.fillStyle = X.places[id].color; c.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); } }
    c.restore();
    if (X.districtNames) {
      c.font = Math.round(S * 0.032) + 'px Bungee, Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = 'rgba(255,255,255,0.16)';
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) c.fillText(X.districtNames[j * 3 + i].toUpperCase(), f.ox + (i + 0.5) * C.W / 3 * f.sc, f.oy + (j + 0.5) * C.H / 3 * f.sc);
    }
    const rad = 10 * px;
    for (const id in X.places) {
      const pl = X.places[id], b = pl.b, x = f.ox + (b ? (b.x0 + b.x1) / 2 : pl.door.x) * f.sc, y = f.oy + (b ? (b.y0 + b.y1) / 2 : pl.door.y) * f.sc;
      drawPlaceIcon(c, id, x, y, rad);
      const label = (PLACE_ICON[id] && PLACE_ICON[id].n) || pl.name;
      c.font = '800 ' + Math.round(12.5 * px) + 'px "Barlow Condensed", "Arial Narrow", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'top';
      c.lineWidth = 3.5 * px; c.strokeStyle = 'rgba(0,0,0,0.9)'; c.strokeText(label, x, y + rad + 3 * px); c.fillStyle = '#fff'; c.fillText(label, x, y + rad + 3 * px);
    }
    return { cv, S, city: C, px };
  }
  function drawBigMap(t) {
    const H = HUD, cv = H.bmap, S = cv.width, px = S / (cv.clientWidth || S);
    if (!BM || BM.S !== S || BM.city !== X.city || Math.abs(BM.px - px) > 0.05) BM = bmBuild(S, px);
    const c = cv.getContext('2d'), f = bmXf(S);
    c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(BM.cv, 0, 0);
    for (const b of X.blips) {
      const x = f.ox + b.x * f.sc, y = f.oy + b.y * f.sc, sz = (b.size || 4) * px * 0.9;
      c.fillStyle = b.color;
      if (b.shape === 'square') c.fillRect(x - sz, y - sz, sz * 2, sz * 2); else { c.beginPath(); c.arc(x, y, sz, 0, TAU); c.fill(); }
      if (b.ring) { c.strokeStyle = b.color; c.lineWidth = 2 * px; c.beginPath(); c.arc(x, y, sz * (1.8 + 0.4 * Math.sin(t * 6)), 0, TAU); c.stroke(); }
    }
    const pos = X.focus(), th = P.car ? P.car.th : P.ped ? P.ped.th : 0, x = f.ox + pos.x * f.sc, y = f.oy + pos.y * f.sc;
    c.strokeStyle = 'rgba(255,255,255,' + (0.6 - 0.5 * ((t * 1.2) % 1)) + ')'; c.lineWidth = 2 * px; c.beginPath(); c.arc(x, y, (8 + 18 * ((t * 1.2) % 1)) * px, 0, TAU); c.stroke();
    c.save(); c.translate(x, y); c.rotate(th + Math.PI / 2); c.scale(px, px);
    c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(0, -11); c.lineTo(8, 9); c.lineTo(0, 4); c.lineTo(-8, 9); c.closePath(); c.fill(); c.stroke();
    c.restore();
  }
  function bigMap(t) {
    const H = HUD, on = X.active && X.input.down('Tab') && !!X.city;
    if (on !== bigOn) { bigOn = on; bigKey = ''; H.root.classList.toggle('h-bigmap', on); }
    if (!on) return;
    const W = H.root.clientWidth || innerWidth, Hh = H.root.clientHeight || innerHeight, touch = document.body.classList.contains('touch');
    const key = W + 'x' + Hh + (touch ? 't' : '');
    if (key !== bigKey) {
      bigKey = key;
      const side = W > Hh * 1.15, legW = side ? Math.min(230, W * 0.26) : Math.min(W - 24, 440);
      const size = Math.max(160, Math.floor(side ? Math.min(Hh - 28, W - legW - 52) : Math.min(W - 24, Hh - 28 - 170 - (touch ? 240 : 0))));
      const x = side ? Math.round((W - size - 16 - legW) / 2) : Math.round((W - size) / 2), y = side ? Math.round((Hh - size) / 2) : 14;
      const st = H.root.style;
      st.setProperty('--h-bigw', size + 'px'); st.setProperty('--h-bigx', x + 'px'); st.setProperty('--h-bigy', y + 'px'); st.setProperty('--h-legw', legW + 'px');
      H.legend.style.left = (side ? x + size + 16 : Math.round((W - legW) / 2)) + 'px';
      H.legend.style.top = (side ? y : y + size + 12) + 'px';
      H.legend.classList.toggle('wide', !side && legW > 330);
      const dpr = Math.min(2, window.devicePixelRatio || 1), S = Math.min(1400, Math.round(size * dpr));
      if (H.bmap.width !== S) H.bmap.width = H.bmap.height = S;
    }
    buildLegend();
    drawBigMap(t);
  }
  function buildLegend() {
    const H = HUD, ids = Object.keys(X.places || {}).join(',') + (document.body.classList.contains('touch') ? 't' : '');
    if (legendKey === ids && H.legend.childNodes.length) return;
    legendKey = ids;
    H.legend.textContent = '';
    const h = document.createElement('h4'); h.textContent = 'Bussby'; H.legend.appendChild(h);
    const row = (draw, label) => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 48; draw(cv.getContext('2d')); H.legend.appendChild(cv);
      const s = document.createElement('span'); s.textContent = label; H.legend.appendChild(s);
    };
    for (const id of Object.keys(X.places || {})) row(c => drawPlaceIcon(c, id, 24, 24, 18), (PLACE_ICON[id] && PLACE_ICON[id].n) || X.places[id].name);
    row(c => { c.translate(24, 24); c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, -18); c.lineTo(13, 14); c.lineTo(0, 6); c.lineTo(-13, 14); c.closePath(); c.stroke(); c.fill(); }, 'You');
    row(c => { c.strokeStyle = '#ffd23a'; c.fillStyle = '#ffd23a'; c.lineWidth = 4; c.beginPath(); c.arc(24, 24, 16, 0, TAU); c.stroke(); c.beginPath(); c.arc(24, 24, 8, 0, TAU); c.fill(); }, 'Objective');
    row(c => { c.fillStyle = '#7dff9a'; c.fillRect(12, 12, 24, 24); c.strokeStyle = '#000'; c.lineWidth = 3; c.strokeRect(12, 12, 24, 24); }, 'Stash loot');
    if (X.has('police')) row(c => { c.fillStyle = '#ff3b3b'; c.beginPath(); c.arc(17, 24, 9, 0, TAU); c.fill(); c.fillStyle = '#3b6bff'; c.beginPath(); c.arc(31, 24, 9, 0, TAU); c.fill(); }, 'Police');
    const tip = document.createElement('p'); tip.textContent = document.body.classList.contains('touch') ? 'Let go of MAP to close' : 'Let go of Tab to close'; H.legend.appendChild(tip);
  }
  // Place icons on core's map canvas, drawn after core's map pass each frame (same transform).
  function mapIcons() {
    const H = HUD, cv = H.map; if (!cv || !X.active || !X.places) return;
    const c = cv.getContext('2d'), S = cv.width, range = X.input.down('Tab') ? 700 : 260, sc = S / 2 / range, f = X.focus(), rot = X.lastView ? X.lastView.rot : 0;
    const cs = Math.cos(rot), sn = Math.sin(rot), cw = cv.clientWidth || 180, px = S / cw, rad = 6.5 * px;
    c.setTransform(1, 0, 0, 1, 0, 0);
    for (const id in X.places) {
      const pl = X.places[id], b = pl.b, wx = b ? (b.x0 + b.x1) / 2 : pl.door.x, wy = b ? (b.y0 + b.y1) / 2 : pl.door.y;
      const dx = (wx - f.x) * sc, dy = (wy - f.y) * sc, x = dx * cs - dy * sn + S / 2, y = dx * sn + dy * cs + S / 2;
      if (x < -rad || y < -rad || x > S + rad || y > S + rad) continue;
      drawPlaceIcon(c, id, x, y, rad);
    }
  }

  // ================= pause screen: the rap sheet =================
  function pauseStats(g) {
    const H = HUD; if (!H.pstats) return;
    const paused = X.active && g.status === 'paused';
    if (!paused) { pauseShown = false; return; }
    if (pauseShown) return;
    pauseShown = true;
    const M = X.missions && X.missions.list ? X.missions.list() : null, done = M ? M.filter(m => m.done).length : null;
    let fav = null, ft = 0; for (const id in R.time) if (R.time[id] > ft && BY_ID[id] && !BY_ID[id].off) { ft = R.time[id]; fav = BY_ID[id].name; }
    const mins = Math.floor(X.time / 60), secs = Math.floor(X.time % 60);
    const rows = [
      ['Cash', '$' + P.money, 'g'], ['Earned', '$' + ST.earned, 'g'],
      ['Kills', String(P.kills || 0), P.kills ? 'r' : ''], ['Cops down', String(ST.cops), ST.cops ? 'r' : ''],
      ['Cars jacked', String(ST.jacked), ''], ['Cars wrecked', String(ST.wrecked), ''],
      ['Explosions', String(ST.booms), ''], ['Best combo', ST.bestCombo > 1 ? '×' + ST.bestCombo : '-', ''],
      ['Missions', M ? done + ' / ' + M.length : '-', ''], ['Wanted', P.wanted ? P.wanted + ' ★' : 'clean', P.wanted ? 'r' : 'g'],
      ['Top speed', Math.round(ST.top) + ' km/h', ''], ['Driven', (ST.drive / 1000).toFixed(1) + ' km', ''],
      ['Wasted', String(ST.wasted), ''], ['Busted', String(ST.busted), ''],
      ['On the street', mins + ':' + String(secs).padStart(2, '0'), ''], ['Radio', fav || '-', ''],
    ];
    H.pstats.textContent = '';
    const eb = document.createElement('p'); eb.className = 'eyebrow'; eb.textContent = 'Rap sheet · ' + (X.districtAt && P.ped ? X.districtAt(P.ped.x, P.ped.y) : 'Bussby'); H.pstats.appendChild(eb);
    const grid = document.createElement('div'); grid.className = 'h-pgrid';
    for (const [k, v, cls] of rows) { const s = document.createElement('span'); s.textContent = k; const b = document.createElement('b'); b.textContent = v; if (cls) b.className = cls; grid.appendChild(s); grid.appendChild(b); }
    H.pstats.appendChild(grid);
    const q = document.createElement('p'); q.className = 'h-pquip'; q.textContent = 'Artur: ' + quip(); H.pstats.appendChild(q);
    const f = document.createElement('p'); f.className = 'fine'; f.textContent = 'R car radio (Shift+R back) · hold Tab for the map and legend'; H.pstats.appendChild(f);
  }
  function quip() {
    if (ST.cops > 2) return 'Killing cops is bad for business. Mostly theirs.';
    if ((P.kills || 0) > 15) return 'The hospital sent me a fruit basket. Thank you, I guess.';
    if (ST.wrecked > 5) return 'You wreck cars faster than I can steal them.';
    if (ST.busted > 1) return 'Bail is not a savings plan.';
    if (P.wanted >= 3) return 'Why are there helicopters? Why are there ALWAYS helicopters?';
    if (ST.top > 180) return 'Speed limits are for people who take the bus.';
    if (P.money > 5000) return 'Nice stack. Do not even think about the bank. Yet.';
    return pick(['Pause all you like. The cops do not.', 'Breathe. Then go steal something nice.', 'Remember: take the bus. Or a bus. Any bus.']);
  }

  // ================= module =================
  X.radio = {
    get stations() { return STATIONS.map(s => s.id); },
    get station() { return R.def ? R.def.id : null; },
    get on() { return !R.halted && A.linked && !!R.def && !R.def.off; },
    get song() { const r = R.def && !R.def.off ? RT[R.def.id] : null; return r && r.song ? { title: r.song.title, artist: r.song.artist, bpm: r.song.bpm } : null; },
    get lcd() { return HUD && HUD.lcdS ? HUD.lcdS.textContent : ''; },
    get duck() { return R.duckT; },
    get step() { const r = R.def && !R.def.off ? RT[R.def.id] : null; return r && r.song ? r.step + r.song.len * RS.songs : -1; },
    get talking() { return R.talking; },
    next: () => stepStation(1), prev: () => stepStation(-1),
    set: id => { if (BY_ID[id] && R.car && dialFor(R.car).includes(BY_ID[id])) { setStation(BY_ID[id]); return true; } return false; },
    off: () => { if (R.car) setStation(OFF); },
    dial: () => (R.car ? dialFor(R.car).map(s => s.id) : []),
    stats: RS, STATIONS, SCANNER, CLASSICS, _R: R, _A: A,
  };
  X.hudx = { T, V, CB, stats: ST, autoAim, get big() { return bigOn; }, el: () => HUD };

  X.mod('hud', {
    order: 95,
    init() {
      build();
      RT = {}; R.car = null; R.def = null; R.cardT = 0; R.time = {}; R.duckT = 1; R.glitch = 0; R.talking = false;
      halt(); SCANQ.length = 0;
      if (A.ctx) { A.duck.gain.value = 1; }
      releaseTouch();
      V.hit = V.pulse = V.level = 0; V.shown = -1; V.beatT = 0; V.beats = 0;
      CB.n = 0; CB.t = -9; CB.carN = 0; CB.carT = -9;
      resetStats(); MD.length = 0; mdLast = null;
      speedoKey = ''; wKey = ''; districtKey = ''; bigKey = ''; legendKey = ''; pauseShown = false; lastT = 0; BM = null;
      if (HUD) {
        HUD.cache = {};
        HUD.root.classList.remove('h-car', 'h-cardon', 'h-bigmap'); bigOn = false;
        HUD.vig.style.opacity = 0; HUD.combo.classList.remove('go', 'go-b');
        for (const e of HUD.tr.querySelectorAll('.h-md')) e.remove();
      }
    },
    stop() {
      leaveRadio(); halt();
      if (A.ctx) { link(false); R.unlinkAt = 0; }
      releaseTouch();
      if (HUD) { HUD.root.classList.remove('h-car', 'h-cardon', 'h-bigmap'); bigOn = false; HUD.vig.style.opacity = 0; V.shown = 0; }
    },
    tick(dt) {
      if (P.state === 'play' && P.car && X.input.pressed('KeyR')) stepStation(X.input.any('ShiftLeft', 'ShiftRight') ? -1 : 1);
      const v = X.playerVel(), sp = Math.hypot(v.x, v.y);
      ST.dist += sp * dt; if (P.car) { ST.drive += sp * dt; ST.top = Math.max(ST.top, sp * 3.6); }
    },
    hud() { hudFrame(); },
  });
})(typeof window !== 'undefined' ? (window.PG = window.PG || {}) : (globalThis.PG = globalThis.PG || {}));
