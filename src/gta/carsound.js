// Car sound lab: a title-menu screen for tuning the engine sound. Hold W (or ArrowUp, or the on-screen
// GAS button) to accelerate a simulated car through its gears; every slider changes the synth live.
// The engine voice is its own Web Audio graph (firing-rate saw + square, sub octave, deep subs, half-order and 2nd-4th harmonics, bass shelf,
// intake noise, waveshaper drive, low-pass that opens with rpm and load, roughness LFO, lift-off pops,
// rev-limiter cut). Settings are saved on this device and can be copied out as JSON.
// Adds PG.carSound { P (current params), DEFAULTS, PRESETS, sim, freqOf, step }.
(function (PG) {
  const KEY = 'gtb-carsound-v1';
  // [key, label, min, max, step, unit, description]
  const GROUPS = [
    ['Engine', [
      ['cyl', 'Cylinders', 1, 16, 1, '', 'Firings per revolution / 2 set the base pitch.'],
      ['idle', 'Idle rpm', 400, 2000, 50, 'rpm', 'Where the engine sits with the throttle off.'],
      ['redline', 'Redline', 2000, 12000, 100, 'rpm', 'Rev limiter kicks in here.'],
      ['shift', 'Shift up at', 40, 100, 1, '%', 'Auto up-shift point, % of redline.'],
      ['gears', 'Gears', 1, 8, 1, '', 'Number of forward gears.'],
      ['revUp', 'Rev-up speed', 0.2, 4, 0.05, 'x', 'How fast rpm climbs under throttle.'],
      ['revDown', 'Rev-down speed', 0.2, 4, 0.05, 'x', 'How fast rpm falls when you lift.'],
      ['drop', 'Shift rpm drop', 0, 80, 1, '%', 'How far rpm falls on each up-shift.'],
      ['shiftTime', 'Shift time', 0, 0.6, 0.01, 's', 'Throttle cut during a gear change.'],
    ]],
    ['Tone', [
      ['pitch', 'Pitch', 0.25, 4, 0.01, 'x', 'Multiplies the firing frequency.'],
      ['saw', 'Saw level', 0, 1, 0.01, '', 'Buzzy main voice.'],
      ['square', 'Square level', 0, 1, 0.01, '', 'Hollow, boxy voice.'],
      ['sub', 'Sub octave', 0, 1, 0.01, '', 'Rumble an octave below.'],
      ['harm2', '2nd harmonic', 0, 1, 0.01, '', 'Adds a whine an octave above.'],
      ['detune', 'Detune', 0, 50, 1, 'ct', 'Spreads saw and square apart: thickness.'],
      ['drive', 'Distortion', 0, 1, 0.01, '', 'Waveshaper grit.'],
      ['rough', 'Roughness', 0, 1, 0.01, '', 'Uneven firing, loudest at idle.'],
    ]],
    ['Harmonics & sub bass', [
      ['sub2', 'Deep sub (2 oct down)', 0, 1, 0.01, '', 'Sine two octaves below: chest rumble.'],
      ['subTri', 'Sub growl', 0, 1, 0.01, '', 'Triangle an octave below: rougher sub.'],
      ['sub3', 'Third sub (1/3)', 0, 1, 0.01, '', 'Odd undertone: lumpy, cammy idle.'],
      ['halfOrd', 'Half order (1.5x)', 0, 1, 0.01, '', 'Between-firing tone of uneven exhausts.'],
      ['harm3', '3rd harmonic', 0, 1, 0.01, '', 'Brassy, raspy edge.'],
      ['harm4', '4th harmonic', 0, 1, 0.01, '', 'High whine two octaves up.'],
      ['subFollow', 'Sub vs rpm', -1, 1, 0.01, '', 'Below 0 the sub fades as rpm rises; above 0 it grows.'],
      ['bassBoost', 'Bass boost', -12, 18, 0.5, 'dB', 'Low-shelf EQ after the filter.'],
      ['bassFreq', 'Bass boost below', 40, 400, 5, 'Hz', 'Where the bass shelf starts.'],
    ]],
    ['Filter', [
      ['cutLo', 'Cutoff at idle', 100, 3000, 10, 'Hz', 'Low-pass with the throttle off at idle.'],
      ['cutHi', 'Cutoff at redline', 300, 12000, 10, 'Hz', 'Low-pass at full rpm.'],
      ['cutLoad', 'Throttle opens filter', 0, 6000, 10, 'Hz', 'Extra cutoff while W is held.'],
      ['res', 'Resonance', 0.1, 20, 0.1, 'Q', 'Filter peak: intake honk.'],
    ]],
    ['Loudness', [
      ['vol', 'Master volume', 0, 1, 0.01, '', 'Overall level.'],
      ['volIdle', 'Idle volume', 0, 1, 0.01, '', 'Level at idle, throttle off.'],
      ['volRpm', 'Rpm volume', 0, 1, 0.01, '', 'Added level at redline.'],
      ['volLoad', 'Throttle volume', 0, 1, 0.01, '', 'Added level while W is held.'],
      ['noise', 'Intake noise', 0, 1, 0.01, '', 'Air rush that grows with rpm and load.'],
      ['pops', 'Lift-off pops', 0, 1, 0.01, '', 'Exhaust crackle when you let go at high rpm.'],
      ['limiter', 'Limiter bounce', 0, 1, 0.01, '', 'How hard the rev limiter cuts.'],
    ]],
  ];
  const DEFAULTS = { cyl: 8, idle: 800, redline: 6800, shift: 92, gears: 6, revUp: 1, revDown: 1, drop: 32, shiftTime: 0.18,
    pitch: 1, saw: 0.6, square: 0.25, sub: 0.5, harm2: 0.15, detune: 12, drive: 0.35, rough: 0.35,
    cutLo: 380, cutHi: 3200, cutLoad: 1400, res: 2.5, sub2: 0, subTri: 0, sub3: 0, halfOrd: 0, harm3: 0, harm4: 0, subFollow: 0, bassBoost: 0, bassFreq: 120, vol: 0.7, volIdle: 0.35, volRpm: 0.35, volLoad: 0.3, noise: 0.15, pops: 0.5, limiter: 0.6 };
  const PRESETS = {
    'V8 muscle': {},
    'Inline-4': { cyl: 4, idle: 850, redline: 7200, pitch: 1.4, saw: 0.45, square: 0.4, sub: 0.2, harm2: 0.35, detune: 6, drive: 0.25, rough: 0.15, cutLo: 600, cutHi: 4500, res: 4, pops: 0.25, noise: 0.25 },
    'V12 exotic': { cyl: 12, idle: 950, redline: 8800, gears: 7, revUp: 1.6, revDown: 1.4, pitch: 1, saw: 0.7, square: 0.15, sub: 0.25, harm2: 0.4, detune: 18, drive: 0.2, rough: 0.05, cutLo: 700, cutHi: 7000, res: 1.5, pops: 0.2 },
    'Diesel truck': { cyl: 6, idle: 600, redline: 3400, gears: 8, revUp: 0.5, revDown: 0.6, drop: 25, shiftTime: 0.35, pitch: 0.8, saw: 0.4, square: 0.6, sub: 0.8, harm2: 0.05, drive: 0.6, rough: 0.6, cutLo: 200, cutHi: 1200, cutLoad: 600, res: 1, noise: 0.35, pops: 0, limiter: 0.3 },
    'Bus': { cyl: 6, idle: 550, redline: 2800, gears: 5, revUp: 0.4, revDown: 0.5, drop: 30, shiftTime: 0.45, pitch: 0.7, saw: 0.3, square: 0.5, sub: 1, harm2: 0, drive: 0.5, rough: 0.7, cutLo: 160, cutHi: 900, cutLoad: 400, res: 0.8, noise: 0.45, pops: 0, limiter: 0.2 },
    'Test Engine': { cyl: 4, idle: 1150, redline: 9300, shift: 87, gears: 6, revUp: 0.75, revDown: 1, drop: 24, shiftTime: 0.18, pitch: 0.8, saw: 0.63, square: 0.36, sub: 0.5, harm2: 0.89, detune: 17, drive: 0.43, rough: 0.49, cutLo: 500, cutHi: 2030, cutLoad: 690, res: 2.5, vol: 0.7, volIdle: 0.35, volRpm: 1, volLoad: 0.25, noise: 0.15, pops: 0.5, limiter: 0.6 },
    'Superbike': { cyl: 4, idle: 1300, redline: 12000, gears: 6, revUp: 3, revDown: 2.5, drop: 22, shiftTime: 0.06, pitch: 1.2, saw: 0.7, square: 0.3, sub: 0.1, harm2: 0.5, detune: 4, drive: 0.4, rough: 0.1, cutLo: 900, cutHi: 9000, res: 5, pops: 0.7 },
  };
  const P = Object.assign({}, DEFAULTS);
  try { Object.assign(P, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* storage blocked */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { /* storage blocked */ } };
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------------- simulation: rpm, gear, speed ----------------
  const sim = { rpm: P.idle, gear: 1, kmh: 0, thr: 0, shiftT: 0, limitT: 0, cut: false, lastLift: 0 };
  const topKmh = () => 60 + 25 * P.gears; // rough top speed in top gear at redline
  const gearRatio = g => Math.pow(0.62, g - 1); // rpm per km/h shrinks each gear
  function step(dt, gas) {
    const s = sim, span = P.redline - P.idle;
    s.thr += ((gas && s.shiftT <= 0 ? 1 : 0) - s.thr) * Math.min(1, dt * 12);
    if (s.shiftT > 0) s.shiftT -= dt;
    // rpm chases a target: up under throttle (slower in high gears), down with engine braking
    const load = s.thr * (s.cut ? 0 : 1);
    const up = P.revUp * span * 0.9 * Math.pow(0.8, s.gear - 1);
    const down = P.revDown * span * 0.45;
    s.rpm += (load * up - (1 - load) * down) * dt;
    // rev limiter
    if (s.rpm >= P.redline) { s.rpm = P.redline; s.cut = true; s.limitT = 0.04 + 0.08 * P.limiter; }
    if (s.cut) { s.limitT -= dt; s.rpm -= span * 0.6 * P.limiter * dt; if (s.limitT <= 0) s.cut = false; }
    s.rpm = cl(s.rpm, P.idle, P.redline);
    // road speed follows the gear; at standstill the clutch slips
    const want = (s.rpm - P.idle) / span * topKmh() * Math.pow(1 / 0.62, s.gear - 1) / Math.pow(1 / 0.62, P.gears - 1);
    s.kmh += (Math.max(0, want) - s.kmh) * Math.min(1, dt * (gas ? 1.5 : 0.4));
    // auto gearbox
    if (s.gear < P.gears && s.rpm >= P.redline * P.shift / 100 && gas && s.shiftT <= 0) {
      s.gear++; s.rpm = Math.max(P.idle, s.rpm * (1 - P.drop / 100)); s.shiftT = P.shiftTime; s.thr = 0; if (P.shiftTime > 0) blip();
    } else if (s.gear > 1 && s.rpm < P.redline * P.shift / 100 * (1 - P.drop / 100) * 0.75 && !gas) {
      s.gear--; s.rpm = Math.min(P.redline, s.rpm / Math.max(0.2, 1 - P.drop / 100) * 0.85);
    }
    if (!gas && s.kmh < 3) s.gear = 1;
    // lift-off pops
    if (!gas && s.lastGas && s.rpm > P.idle + span * 0.45) s.pops = 0.3 + 0.9 * P.pops * (s.rpm - P.idle) / span;
    s.lastGas = gas;
    if (s.pops > 0) s.pops -= dt;
    return s;
  }
  const freqOf = rpm => Math.max(8, rpm / 60 * P.cyl / 2 * P.pitch);

  // ---------------- audio graph ----------------
  let V = null;
  function curve(k) {
    const n = 1024, c = new Float32Array(n), a = 1 + k * 30;
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(a * x) / Math.tanh(a); }
    return c;
  }
  function build() {
    const ctx = PG.audio.ctx && PG.audio.ctx();
    if (!ctx) return null;
    const kit = PG.audio.kit && PG.audio.kit();
    const out = ctx.createGain(); out.gain.value = 0;
    out.connect(kit ? kit.master : ctx.destination);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    const ws = ctx.createWaveShaper(); ws.oversample = '2x';
    const pre = ctx.createGain();
    const shelf = ctx.createBiquadFilter(); shelf.type = 'lowshelf';
    pre.connect(ws); ws.connect(lp); lp.connect(shelf); shelf.connect(out);
    const osc = (type) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.connect(g); g.connect(pre); o.start(); return { o, g }; };
    const v = { ctx, out, lp, ws, pre, saw: osc('sawtooth'), sq: osc('square'), sub: osc('sine'), h2: osc('sawtooth'), shelf,
      sub2: osc('sine'), subTri: osc('triangle'), sub3: osc('sine'), half: osc('sawtooth'), h3: osc('sawtooth'), h4: osc('sine'), lastDrive: -1 };
    // roughness: noise-ish LFO on amplitude
    v.lfo = ctx.createOscillator(); v.lfoG = ctx.createGain(); v.lfo.type = 'triangle';
    v.lfo.connect(v.lfoG); v.lfoG.connect(pre.gain); v.lfo.start();
    // intake noise
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    v.nbuf = nb;
    v.ns = ctx.createBufferSource(); v.ns.buffer = nb; v.ns.loop = true;
    v.nf = ctx.createBiquadFilter(); v.nf.type = 'bandpass'; v.nf.Q.value = 0.8;
    v.ng = ctx.createGain(); v.ng.gain.value = 0;
    v.ns.connect(v.nf); v.nf.connect(v.ng); v.ng.connect(out); v.ns.start();
    return v;
  }
  function pop(v, t) {
    const src = v.ctx.createBufferSource(), f = v.ctx.createBiquadFilter(), g = v.ctx.createGain();
    src.buffer = v.nbuf; f.type = 'lowpass'; f.frequency.value = 600 + Math.random() * 1400;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * P.pops * (0.4 + Math.random() * 0.6), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05 + Math.random() * 0.06);
    src.connect(f); f.connect(g); g.connect(v.out);
    src.start(t, Math.random()); src.stop(t + 0.15);
  }
  function blip() {
    if (!V || !P.shiftTime) return;
    const t = V.ctx.currentTime, src = V.ctx.createBufferSource(), f = V.ctx.createBiquadFilter(), g = V.ctx.createGain();
    src.buffer = V.nbuf; f.type = 'lowpass'; f.frequency.value = 700;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    src.connect(f); f.connect(g); g.connect(V.out); src.start(t, Math.random()); src.stop(t + 0.12);
  }
  function voice(dt) {
    if (!V) V = build();
    if (!V) return;
    const t = V.ctx.currentTime, s = sim, span = P.redline - P.idle, rf = (s.rpm - P.idle) / span;
    const muted = PG.audio.muted, load = s.cut ? 0 : s.thr;
    const f = freqOf(s.rpm), det = P.detune;
    const k = 0.02;
    V.saw.o.frequency.setTargetAtTime(f, t, k); V.saw.o.detune.setTargetAtTime(-det, t, k);
    V.sq.o.frequency.setTargetAtTime(f, t, k); V.sq.o.detune.setTargetAtTime(det, t, k);
    V.sub.o.frequency.setTargetAtTime(f / 2, t, k);
    V.h2.o.frequency.setTargetAtTime(f * 2, t, k);
    V.saw.g.gain.setTargetAtTime(P.saw * 0.5, t, 0.05);
    V.sq.g.gain.setTargetAtTime(P.square * 0.3, t, 0.05);
    V.sub.g.gain.setTargetAtTime(P.sub * 0.9 * cl(1 + P.subFollow * (rf * 2 - 1), 0, 2), t, 0.05);
    V.h2.g.gain.setTargetAtTime(P.harm2 * 0.25, t, 0.05);
    const sf = cl(1 + P.subFollow * (rf * 2 - 1), 0, 2);
    [[V.sub2, f / 4, P.sub2 * 1.1 * sf], [V.subTri, f / 2, P.subTri * 0.8 * sf], [V.sub3, f / 3, P.sub3 * 0.8 * sf],
     [V.half, f * 1.5, P.halfOrd * 0.18], [V.h3, f * 3, P.harm3 * 0.15], [V.h4, f * 4, P.harm4 * 0.2]].forEach(([v, fr, g]) => {
      v.o.frequency.setTargetAtTime(fr, t, k); v.g.gain.setTargetAtTime(g, t, 0.05);
    });
    V.shelf.frequency.setTargetAtTime(P.bassFreq, t, 0.05); V.shelf.gain.setTargetAtTime(P.bassBoost, t, 0.05);
    if (V.lastDrive !== P.drive) { V.ws.curve = curve(P.drive); V.lastDrive = P.drive; }
    const rough = P.rough * (1 - 0.7 * rf);
    V.lfo.frequency.setTargetAtTime(Math.max(2, f / P.cyl * (0.9 + Math.random() * 0.2)), t, 0.05);
    V.lfoG.gain.setTargetAtTime(0.6 * rough, t, 0.05);
    V.pre.gain.setTargetAtTime(1 - 0.3 * rough, t, 0.05);
    const cut = P.cutLo + (P.cutHi - P.cutLo) * rf + P.cutLoad * load;
    V.lp.frequency.setTargetAtTime(cl(cut, 40, 18000), t, 0.04);
    V.lp.Q.setTargetAtTime(P.res, t, 0.05);
    const vol = muted ? 0 : P.vol * 0.35 * (P.volIdle + P.volRpm * rf + P.volLoad * load) * (s.cut ? 1 - 0.6 * P.limiter : 1);
    V.out.gain.setTargetAtTime(vol, t, 0.03);
    V.nf.frequency.setTargetAtTime(400 + 3000 * rf, t, 0.05);
    V.ng.gain.setTargetAtTime(muted ? 0 : P.vol * P.noise * 0.25 * (0.15 + 0.5 * rf + 0.6 * load), t, 0.05);
    if (s.pops > 0 && P.pops > 0 && !muted && Math.random() < dt * 22) pop(V, t);
  }
  function silence() { if (V) { const t = V.ctx.currentTime; V.out.gain.cancelScheduledValues(t); V.out.gain.setTargetAtTime(0, t, 0.03); V.ng.gain.setTargetAtTime(0, t, 0.03); } }

  PG.carSound = { P, DEFAULTS, PRESETS, GROUPS, sim, step, freqOf, reset() { Object.assign(sim, { rpm: P.idle, gear: 1, kmh: 0, thr: 0, shiftT: 0, cut: false, pops: 0 }); } };

  // ---------------- screen ----------------
  if (typeof document === 'undefined') return;
  const $ = id => document.getElementById(id);
  const scr = $('scr-carsound'), body = $('cs-body');
  if (!scr || !body) return;
  const css = document.createElement('style');
  css.textContent = `
#scr-carsound .panel { width: min(100%, 860px); gap: 14px; }
.cs-dash { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; background: rgba(18,20,24,.9); border: 2px solid var(--slab-2); border-radius: 10px; padding: 12px; position: sticky; top: 0; z-index: 2; }
.cs-dash canvas { width: 100%; height: 120px; display: block; }
.cs-read { font-family: var(--hud); font-variant-numeric: tabular-nums; display: flex; flex-direction: column; gap: 4px; min-width: 130px; text-align: right; }
.cs-read b { font-size: 34px; color: var(--hazard); line-height: 1; }
.cs-read span { color: var(--muted); font-size: 14px; text-transform: uppercase; letter-spacing: .08em; }
.cs-gas { grid-column: 1 / -1; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.cs-gas .cs-hint { color: var(--muted); font-size: 14px; flex: 1; min-width: 180px; }
.cs-gas .btn.down { filter: brightness(1.4); }
.cs-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr)); gap: 12px; }
.cs-sl { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 10px; padding: 8px 0; border-top: 1px solid var(--slab-2); }
.set-sec h3 + .cs-sl { border-top: 0; }
.cs-sl label { font-family: var(--hud); font-weight: 700; font-size: 16px; }
.cs-sl output { color: var(--amber); font-weight: 700; font-size: 14px; font-variant-numeric: tabular-nums; }
.cs-sl input { grid-column: 1 / -1; width: 100%; accent-color: var(--hazard); }
.cs-sl small { grid-column: 1 / -1; color: var(--muted); font-size: 13px; }
.cs-tools { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.cs-tools select { font: inherit; padding: 6px 8px; border-radius: 6px; background: var(--slab-2, #222); color: inherit; border: 1px solid var(--slab-2); }
`;
  document.head.appendChild(css);

  const fmt = (v, st, u) => (st < 1 ? (+v).toFixed(st < 0.1 ? 2 : 1) : String(Math.round(v))) + (u ? ' ' + u : '');
  const inputs = {};
  body.innerHTML =
    '<div class="cs-dash"><canvas id="cs-tach" width="600" height="120"></canvas>' +
    '<div class="cs-read"><b id="cs-rpm">0</b><span>rpm</span><b id="cs-gear">1</b><span>gear</span><b id="cs-kmh">0</b><span>km/h</span></div>' +
    '<div class="cs-gas"><button class="btn primary" id="cs-gasbtn">Hold to accelerate</button><span class="cs-hint">Hold <kbd>W</kbd> (or <kbd>↑</kbd>) to accelerate, let go to lift off. Sliders change the sound live.</span></div></div>' +
    '<div class="cs-tools"><label for="cs-preset">Preset</label><select id="cs-preset"><option value="">Pick a preset…</option>' +
    Object.keys(PRESETS).map(k => `<option>${k}</option>`).join('') + '</select>' +
    '<button class="btn small" id="cs-reset">Reset to default</button><button class="btn small" id="cs-copy">Copy settings</button><button class="btn small" id="cs-paste">Paste settings</button></div>' +
    '<div class="cs-grid" id="cs-grid"></div>';
  const grid = $('cs-grid');
  GROUPS.forEach(([title, rows]) => {
    const sec = document.createElement('section'); sec.className = 'set-sec';
    sec.innerHTML = `<h3>${title}</h3>`;
    rows.forEach(([k, label, min, max, st, u, desc]) => {
      const row = document.createElement('div'); row.className = 'cs-sl';
      row.innerHTML = `<label for="cs-${k}">${label}</label><output id="cs-${k}-v"></output><input type="range" id="cs-${k}" min="${min}" max="${max}" step="${st}"><small>${desc}</small>`;
      sec.appendChild(row);
      const inp = row.querySelector('input'), out = row.querySelector('output');
      inputs[k] = { inp, out, st, u };
      inp.addEventListener('input', () => { P[k] = +inp.value; out.textContent = fmt(P[k], st, u); if (k === 'idle' || k === 'redline') sim.rpm = cl(sim.rpm, P.idle, P.redline); save(); });
    });
    grid.appendChild(sec);
  });
  function refresh() { Object.keys(inputs).forEach(k => { const it = inputs[k]; it.inp.value = P[k]; it.out.textContent = fmt(P[k], it.st, it.u); }); }
  refresh();
  const apply = o => { Object.keys(DEFAULTS).forEach(k => { if (o && typeof o[k] === 'number' && isFinite(o[k])) P[k] = o[k]; }); save(); refresh(); };
  $('cs-preset').onchange = e => { if (PRESETS[e.target.value]) { apply(Object.assign({}, DEFAULTS, PRESETS[e.target.value])); PG.carSound.reset(); } e.target.value = ''; };
  $('cs-reset').onclick = () => { apply(DEFAULTS); PG.carSound.reset(); };
  const toast = (m, k) => PG.ui && PG.ui.toast ? PG.ui.toast(m, k) : null;
  $('cs-copy').onclick = () => { const j = JSON.stringify(P); (navigator.clipboard ? navigator.clipboard.writeText(j) : Promise.reject()).then(() => toast('Car sound settings copied.'), () => window.prompt('Copy these settings:', j)); };
  $('cs-paste').onclick = () => { const j = window.prompt('Paste car sound settings (JSON):'); if (!j) return; try { apply(JSON.parse(j)); toast('Car sound settings loaded.'); } catch (e) { toast('That is not valid settings JSON.', 'warn'); } };

  // gas: keyboard + button
  let keyGas = false, btnGas = false;
  const active = () => PG.ui && PG.ui.screen && PG.ui.screen() === 'carsound';
  const GAS = ['KeyW', 'ArrowUp'];
  window.addEventListener('keydown', e => {
    if (!active()) return;
    if (GAS.includes(e.code)) { keyGas = true; e.preventDefault(); }
    if (e.code === 'Escape') { e.preventDefault(); close(); }
  }, { capture: true });
  window.addEventListener('keyup', e => { if (GAS.includes(e.code)) keyGas = false; });
  window.addEventListener('blur', () => { keyGas = btnGas = false; });
  const gb = $('cs-gasbtn');
  gb.addEventListener('pointerdown', e => { e.preventDefault(); btnGas = true; gb.classList.add('down'); try { gb.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ } });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => gb.addEventListener(t, () => { btnGas = false; gb.classList.remove('down'); }));

  const tach = $('cs-tach'), tc = tach.getContext('2d');
  const hist = [];
  function draw() {
    const w = tach.width, h = tach.height, s = sim;
    tc.clearRect(0, 0, w, h);
    // bar
    const rf = (s.rpm - 0) / P.redline;
    tc.fillStyle = 'rgba(255,255,255,.08)'; tc.fillRect(0, h - 26, w, 18);
    tc.fillStyle = rf > P.shift / 100 ? '#ff5544' : '#ffcc33'; tc.fillRect(0, h - 26, w * cl(rf, 0, 1), 18);
    tc.fillStyle = '#ff5544'; tc.fillRect(w * P.shift / 100 - 1, h - 30, 2, 26);
    // rpm history line
    hist.push(rf); if (hist.length > 200) hist.shift();
    tc.strokeStyle = '#7fd4ff'; tc.lineWidth = 2; tc.beginPath();
    hist.forEach((r, i) => { const x = i / 199 * w, y = (h - 34) * (1 - cl(r, 0, 1)) + 2; i ? tc.lineTo(x, y) : tc.moveTo(x, y); });
    tc.stroke();
    tc.fillStyle = 'rgba(255,255,255,.6)'; tc.font = '12px sans-serif';
    tc.fillText(Math.round(freqOf(s.rpm)) + ' Hz', 6, 14);
    $('cs-rpm').textContent = Math.round(s.rpm);
    $('cs-gear').textContent = s.shiftT > 0 ? '–' : s.gear;
    $('cs-kmh').textContent = Math.round(s.kmh);
  }
  let last = 0, running = false;
  function loop(ts) {
    if (!active()) { running = false; silence(); keyGas = btnGas = false; return; }
    const dt = Math.min(0.05, last ? (ts - last) / 1000 : 0.016); last = ts;
    step(dt, keyGas || btnGas);
    if (PG.audio.ctx && PG.audio.ctx() && PG.audio.ctx().state === 'running') voice(dt);
    draw();
    requestAnimationFrame(loop);
  }
  function open() {
    if (PG.audio.click) PG.audio.click();
    PG.carSound.reset();
    PG.ui.show('carsound');
    scr.scrollTop = 0;
    if (!running) { running = true; last = 0; requestAnimationFrame(loop); }
  }
  function close() { if (PG.audio.click) PG.audio.click(); silence(); PG.ui.show('title'); }
  PG.carSound.open = open; PG.carSound.close = close;
  $('cs-back').onclick = close;
  const btn = $('btn-carsound');
  if (btn) btn.onclick = open;
})(typeof window !== 'undefined' ? (window.PG = window.PG || {}) : (globalThis.PG = globalThis.PG || {}));
