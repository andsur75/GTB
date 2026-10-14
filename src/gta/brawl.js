// Fist fights for Grand Theft Bus. Every person's melee goes through here: an action state per person
// (p.act: jab, cross, hook, uppercut, haymaker, kick, bat swing, block, dodge, hit reaction, stagger, knockdown
// with a dazed lie and a visible get-up, taunt, begging) with wind-up, strike and recovery phases, and a
// bobbing guard stance while fighting. A blow lands only when the fist, foot or bat physically reaches somebody,
// at that frame, with hit-stop, knockback and blocks; impacts get comic POW bursts, motion smears, sweat, flying
// teeth, dizzy stars and synthesised whooshes, smacks, grunts and a crowd "ooh". X.brawl.fight() takes over a
// person's AI for a fist fight (close in, guard, circle, combos, blocks and dodges, back off, beg or flee, chase,
// punch the car someone hides in, trade blows, shrug off a few and counter after a block) and hands it back
// when it ends. The player's fists chain jab, cross, hook, uppercut; sprint + fire throws a haymaker, fire while
// backing off a kick, fire over somebody on the ground a stomp; without a mouse the player squares up to whoever
// fights them. X.brawl.armPose() gives X.drawPed (peds.js) the arms; without peds.js a plain fallback figure is
// drawn here.
(function (PG) {
  if (typeof document === 'undefined') return;
  const X = PG.gta;
  if (!X) return;
  const { cl, wrap, rand, pick, TAU } = X.util;
  const G = () => PG.game;
  const P = X.player;
  const hr = (s, i) => { const v = Math.sin(s * 127.1 + i * 311.7) * 43758.5453; return v - Math.floor(v); };
  const mix = (a, b, k) => a + (b - a) * k;
  const eo = u => 1 - (1 - u) * (1 - u);
  const eio = u => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u));

  // ================= tunables =================
  // Body units: drawPed draws people BODY x life size (times look.scale), poses are in that unscaled frame
  // (+x where they face, +y their right hand side).
  const BODY = 1.18, SH = 0.235, UA = 0.27, FA = 0.27, THIGH = 0.47, SHIN = 0.46;
  const OPT = { npcMul: 0.7, blockMul: 0.3, comboWindow: 0.42, hitStop: 1, npcWind: 1.3, fightCam: 19 };
  // w/s/r: wind-up, strike, recovery (s). dmg: the player's damage (NPCs deal npcMul of it). kb: knockback m/s.
  // hs: hit-stop (s). reach: how far the target's centre may be for a strike to be worth starting.
  const SPEC = {
    jab: { w: 0.05, s: 0.07, r: 0.13, dmg: 6, kb: 1.4, hs: 0.045, reach: 1.12 },
    cross: { w: 0.07, s: 0.08, r: 0.17, dmg: 9, kb: 2.2, hs: 0.05, reach: 1.16 },
    hook: { w: 0.1, s: 0.1, r: 0.19, dmg: 12, kb: 2.6, hs: 0.06, reach: 1.08 },
    uppercut: { w: 0.13, s: 0.1, r: 0.27, dmg: 16, kb: 3.2, hs: 0.08, reach: 1.02 },
    haymaker: { w: 0.26, s: 0.12, r: 0.32, dmg: 22, kb: 5.0, hs: 0.09, reach: 1.7 },
    kick: { w: 0.13, s: 0.11, r: 0.26, dmg: 14, kb: 5.5, hs: 0.07, reach: 1.38 },
    bat: { w: 0.16, s: 0.11, r: 0.25, dmg: 38, kb: 6.5, hs: 0.08, reach: 1.6 },
    stomp: { w: 0.15, s: 0.08, r: 0.22, dmg: 10, kb: 0.6, hs: 0.06, reach: 1.1 },   // on somebody lying on the ground
  };
  const STRIKE = { jab: 1, cross: 1, hook: 1, uppercut: 1, haymaker: 1, kick: 1, bat: 1, stomp: 1 };
  const LEGS = { kick: 1, stomp: 1 };
  const LOCK = { hitReact: 1, stagger: 1, knockdown: 1, beg: 1 };      // nobody throws a punch out of these
  const REACT_DUR = { block: 0.42, dodge: 0.32, hitReact: 0.3, stagger: 0.72, taunt: 1.1, beg: 2.6 };
  // How long a clean blow stuns (s): light blows only make them flinch, so a fighter can answer between the
  // player's punches; the player shakes off half of it and can punch straight out of a flinch.
  const FLINCH = { jab: 0.17, cross: 0.22, hook: 0.27, uppercut: 0.3, haymaker: 0.32, kick: 0.3, bat: 0.32, stomp: 0.3 };
  const DEF_SIDE = { jab: -1, cross: 1, hook: -1, uppercut: 1, haymaker: 1, kick: 1, bat: 1, stomp: 1 };
  const COMBO = ['jab', 'cross', 'hook', 'uppercut'], COMBO_SIDE = [-1, 1, -1, 1];
  const BAT_K = [0.95, 0.65, 0.35];
  const PLANS = [['jab'], ['jab', 'cross'], ['cross'], ['hook'], ['jab', 'jab', 'cross'], ['cross', 'hook'], ['haymaker'], ['kick']];
  const W_CIV = [3, 4, 2, 2, 1, 1.5, 1.2, 0.8];
  const PRO = [['jab', 'cross'], ['jab', 'cross', 'hook'], ['jab', 'cross', 'uppercut'], ['hook', 'uppercut'], ['kick', 'cross'], ['jab', 'jab', 'cross', 'hook'], ['haymaker'], ['kick']];
  const W_PRO = [3, 3, 2, 1.5, 1.2, 1, 0.8, 1];
  const BATS = [['bat'], ['bat', 'bat']], CAR_HITS = ['jab', 'cross', 'hook', 'cross'], COSMETIC = ['jab', 'cross', 'hook'];
  const WORDS = { uppercut: ['POW!', 'UPPERCUT!', 'CRACK!'], haymaker: ['WHAM!', 'KA-POW!', 'BAM!'], kick: ['BOOF!', 'WHUMP!'], bat: ['THWACK!', 'CRACK!', 'BONK!'], hook: ['SMACK!', 'BIFF!'], cross: ['BAM!', 'POW!'], stomp: ['STOMP!', 'CRUNCH!'] };
  const LINES = {
    provoke: ['YOU WANT SOME?', 'COME HERE!', 'I DO KARATE!', 'PUT UP YOUR DUKES!', 'OH, IT IS ON!', 'BIG MISTAKE!', 'HOLD MY BEER!'],
    taunt: ['COME ON!', 'IS THAT ALL?', 'MY GRANDMA HITS HARDER!', 'UFF DA!', 'FLOAT LIKE A BUS!', 'BRING IT!'],
    down: ['GET UP!', 'STAY DOWN!', 'HAD ENOUGH?', 'TIMBER!'],
    beg: ['PLEASE! NOT THE FACE!', 'I HAVE A FAMILY!', 'OKAY, OKAY! YOU WIN!', 'TAKE MY WALLET!', 'MERCY!'],
    gloat: ['AND STAY DOWN!', 'WHO IS NEXT?', 'THAT IS HOW WE DO IT IN BUSSBY!'],
    car: ['GET OUT OF THE CAR!', 'OPEN UP!', 'COWARD!', 'FACE ME!'],
    give: ['I KNOW WHERE YOU PARK!', 'COME BACK HERE!', 'RUN, COWARD!'],
  };
  const BLOOD = ['#8a0f12', '#b0151a', '#5c0a0c'];
  const NONE = {};
  const SOLID = { solids: true };

  // ================= state =================
  let S = null;
  function fresh() {
    return { sayT: 0, snd: 6, frame: 0, n: 0, threat: false, oohT: 0, stats: { strikes: 0, hits: 0, blocked: 0, misses: 0, knockdowns: 0, fights: 0, provoked: 0, carHits: 0, stray: 0, cosmetic: 0, won: 0, fled: 0, begged: 0, escaped: 0 } };
  }
  const FIGHTS = [];
  const FX = [];
  for (let i = 0; i < 180; i++) FX.push({ on: false, k: '', x: 0, y: 0, vx: 0, vy: 0, z: 0, vz: 0, t: 0, life: 0, s: 1, rot: 0, vr: 0, txt: null, c: '', top: false, seed: 0 });
  let fxI = 0;
  const SX = new Float32Array(10), SY = new Float32Array(10), TX2 = new Float32Array(10), TY2 = new Float32Array(10);

  // Per-person combat state (created on first use).
  function bw(p) { return p.bw || (p.bw = { guard: 0, hs: 0, hsF: -1, kbx: 0, kby: 0, combo: 0, comboUntil: 0, buf: 0, startF: -1, lastT: -9, hitT: -9, lastSide: 1, batSide: -1, chain: 0, chainT: -9, streak: 0, lockOn: false, lockTh: 0 }); }
  function act(p) { return p.act || (p.act = { on: false, type: '', t: 0, w: 0, s: 0, r: 0, dur: 0, side: 1, v: 0, res: 0, n: 0, dmg: 0, cos: false, ang: 0, k: 0, dust: false, up: false, by: null, hold: 0 }); }
  const fighting = p => !!(p && p.ai && p.ai.owner === 'brawl');
  // Too stunned to throw a punch? The player can punch out of a flinch once it has registered.
  const streak = b => X.time - b.hitT < 0.9 ? b.streak : 0;
  const locked = (p, A) => !!(A && A.on && LOCK[A.type]) && !(p.isPlayer && A.type === 'hitReact' && A.t > 0.06);
  const scaleOf = p => BODY * ((p.look && p.look.scale) || 1);

  // ================= sound =================
  const SND = {
    whoosh(k, t, d, f) { k.noise(t, 0.12, 0.12, 'bandpass', 700 * f, { to: 2600 * f, Q: 2.2, dest: d }); },
    jab(k, t, d, f) { k.noise(t, 0.045, 0.45, 'lowpass', 2400 * f, { to: 700, dest: d }); k.tone('sine', 230 * f, t, 0.06, 0.3, { to: 110, dest: d }); },
    cross(k, t, d, f) { k.noise(t, 0.065, 0.55, 'lowpass', 1700 * f, { to: 300, dest: d }); k.tone('sine', 175 * f, t, 0.09, 0.42, { to: 70, dest: d }); },
    hook(k, t, d, f) { k.noise(t, 0.08, 0.6, 'bandpass', 1250 * f, { Q: 0.9, to: 380, dest: d }); k.tone('triangle', 150 * f, t, 0.1, 0.32, { to: 60, dest: d }); },
    uppercut(k, t, d, f) { k.noise(t, 0.03, 0.4, 'highpass', 2600, { dest: d }); k.noise(t + 0.01, 0.1, 0.6, 'lowpass', 950 * f, { to: 180, dest: d }); k.tone('sine', 125 * f, t, 0.16, 0.5, { to: 45, dest: d }); },
    haymaker(k, t, d, f) { k.tone('sine', 95 * f, t, 0.24, 0.7, { to: 36, dest: d }); k.noise(t, 0.15, 0.7, 'lowpass', 800 * f, { to: 140, dest: d }); k.noise(t, 0.03, 0.3, 'highpass', 3000, { dest: d }); },
    kick(k, t, d, f) { k.tone('sine', 110 * f, t, 0.17, 0.6, { to: 45, dest: d }); k.noise(t, 0.1, 0.55, 'lowpass', 700 * f, { to: 200, dest: d }); },
    stomp(k, t, d, f) { k.tone('sine', 80 * f, t, 0.14, 0.6, { to: 38, dest: d }); k.noise(t, 0.08, 0.5, 'lowpass', 520 * f, { to: 150, dest: d }); k.noise(t, 0.03, 0.2, 'bandpass', 1800, { Q: 2, dest: d }); },
    bat(k, t, d, f) { k.tone('triangle', 520 * f, t, 0.07, 0.3, { to: 250, dest: d }); k.noise(t, 0.09, 0.55, 'bandpass', 1100, { Q: 2, dest: d }); k.tone('sine', 130, t, 0.12, 0.4, { to: 55, dest: d }); },
    block(k, t, d, f) { k.noise(t, 0.07, 0.4, 'lowpass', 480 * f, { dest: d }); k.tone('sine', 150 * f, t, 0.07, 0.25, { to: 105, dest: d }); },
    car(k, t, d, f) { k.tone('triangle', 270 * f, t, 0.14, 0.22, { to: 170, dest: d }); k.noise(t, 0.09, 0.4, 'bandpass', 720, { Q: 3, dest: d }); },
    crack(k, t, d) { k.noise(t, 0.05, 0.35, 'highpass', 3600, { dest: d }); k.tone('sine', 3300, t, 0.05, 0.05, { dest: d }); },
    shatter(k, t, d) { k.noise(t, 0.32, 0.45, 'highpass', 3000, { dest: d }); for (let i = 0; i < 5; i++) k.tone('sine', 2600 + Math.random() * 3200, t + Math.random() * 0.18, 0.06, 0.05, { dest: d }); },
    fall(k, t, d) { k.noise(t, 0.13, 0.55, 'lowpass', 320, { to: 90, dest: d }); k.tone('sine', 72, t, 0.16, 0.45, { to: 40, dest: d }); },
    grunt(k, t, d, f) { k.tone('sawtooth', 185 * f, t, 0.11, 0.07, { to: 120 * f, lp: 900, dest: d }); k.noise(t, 0.07, 0.05, 'bandpass', 600 * f, { Q: 2, dest: d }); },
    oof(k, t, d, f) { k.tone('sawtooth', 250 * f, t, 0.17, 0.08, { to: 135 * f, lp: 1000, vib: [18, 14], dest: d }); k.noise(t, 0.09, 0.05, 'lowpass', 700, { dest: d }); },
    ooh(k, t, d) {
      for (let i = 0; i < 6; i++) { const f = 250 + i * 37 + Math.random() * 20; k.tone(i % 2 ? 'triangle' : 'sine', f, t + i * 0.025, 0.95, 0.03, { to: f * 1.25, lp: 1500, vib: [4 + i, 9], attack: 0.18, dest: d }); }
      k.noise(t, 0.9, 0.02, 'bandpass', 900, { Q: 0.8, attack: 0.15, dest: d });
    },
  };
  function snd(name, x, y, vol, f, delay) {
    if (!S || S.snd <= 0) return;
    const k = PG.audio.kit(); if (!k) return;
    let v = (vol == null ? 1 : vol) * 0.45;
    if (x != null) { const c = X.cam; v *= cl(1.15 - Math.hypot(x - c.x, y - c.y) / 42, 0, 1); }
    if (v < 0.03) return;
    S.snd--;
    const g = k.gain(v);
    SND[name](k, k.now + (delay || 0), g.node, f || 1);
  }
  const pitchOf = p => 0.75 + hr(p.id || 1, 7) * 0.6;
  function say(p, pool, color) {
    if (!S || X.time < S.sayT || !X.inView(p.x, p.y, -2)) return;
    S.sayT = X.time + 0.9;
    X.floatText(p.x, p.y - 0.9, PG.say ? PG.say(pool, {}) : pick(pool), color || '#ffd23a', { size: 14, life: 1.6 });
  }

  // ================= effects =================
  function fx(k, x, y, life, o) {
    const f = FX[fxI++ % FX.length];
    f.on = true; f.k = k; f.x = x; f.y = y; f.vx = 0; f.vy = 0; f.z = 0; f.vz = 0; f.t = 0; f.life = life; f.s = 1; f.rot = 0; f.vr = 0; f.txt = null; f.c = ''; f.top = true; f.seed = Math.random() * 100;
    if (o) Object.assign(f, o);
    return f;
  }
  // A comic impact star, s = radius in metres (never under a few pixels); txt is drawn above it, screen-sized.
  function pow(x, y, size, txt, rot) { fx('pow', x, y, txt ? 0.5 : 0.2, { s: size, txt, rot: rot == null ? rand(-0.5, 0.5) : rot }); }
  function sweat(x, y, ang, n) {
    for (let i = 0; i < n; i++) { const a = ang + rand(-1.1, 1.1), sp = rand(1.5, 3.8); fx('sweat', x, y, rand(0.3, 0.55), { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, s: rand(0.7, 1.2), rot: a, top: false }); }
  }
  function tooth(x, y, ang) {
    const a = ang + rand(-0.6, 0.6), sp = rand(2.5, 4.5);
    fx('tooth', x, y, 6, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, z: 0.9, vz: rand(2.5, 4), vr: rand(-25, 25), top: false });
  }
  function fxTick(dt) {
    for (const f of FX) {
      if (!f.on) continue;
      f.t += dt;
      if (f.t >= f.life) { f.on = false; continue; }
      if (f.k === 'sweat') { f.x += f.vx * dt; f.y += f.vy * dt; const k = Math.exp(-4 * dt); f.vx *= k; f.vy *= k; }
      else if (f.k === 'tooth') {
        if (f.z > 0 || f.vz > 0) {
          f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt; f.vz -= 16 * dt; f.z += f.vz * dt;
          if (f.z <= 0) { f.z = 0; if (f.vz < -2) { f.vz = -f.vz * 0.35; f.vx *= 0.5; f.vy *= 0.5; } else { f.vz = 0; f.vx = 0; f.vy = 0; f.vr = 0; } }
        }
      }
    }
  }

  // ================= poses =================
  // One strike sample: the striking fist (foot for kicks, both hands for the bat) at act time tt, with the
  // torso twist, lean, fist size (bigger = rising towards the camera) and the bat angle.
  const Q = { fx: 0, fy: 0, tw: 0, lean: 0, fs: 1, ba: 0, k: 0, u: 0 };
  function sample(a, tt, o) {
    const sd = a.side;
    let k, u;
    if (tt < a.w) { k = 0; u = a.w > 0 ? tt / a.w : 1; } else if (tt < a.w + a.s) { k = 1; u = (tt - a.w) / a.s; } else { k = 2; u = a.r > 0 ? Math.min(1, (tt - a.w - a.s) / a.r) : 1; }
    let Gx = sd < 0 ? 0.31 : 0.25, Gy = sd < 0 ? -0.1 : 0.125, Wx = Gx, Wy = Gy, Ex = 0.6, Ey = 0, twW = 0, twE = 0, lnW = 0, lnE = 0, fsW = 1, fsE = 1;
    let polar = false, pv = 0, aW = 0, rW = 0, aE = 0, rE = 0, baG = 0, baW = 0, baE = 0;
    switch (a.type) {
      case 'jab': Wx = Gx - 0.05; Wy = Gy + sd * 0.02; Ex = 0.6; Ey = sd * 0.04; twE = -sd * 0.3; lnE = 0.04; break;
      case 'cross': Wx = Gx - 0.07; Wy = Gy + sd * 0.05; Ex = 0.63; Ey = sd * 0.01; twW = sd * 0.08; twE = -sd * 0.5; lnE = 0.07; break;
      case 'hook': polar = true; pv = 0.06; aW = sd * 1.4; rW = 0.4; aE = -sd * 0.22; rE = 0.5; twW = sd * 0.25; twE = -sd * 0.55; lnE = 0.05; break;
      case 'uppercut': Wx = 0.14; Wy = sd * 0.17; Ex = 0.52; Ey = sd * 0.05; twW = sd * 0.15; twE = -sd * 0.45; lnW = -0.03; lnE = 0.09; fsW = 0.8; fsE = 1.55; break;
      case 'haymaker': polar = true; pv = 0.04; aW = sd * 2.35; rW = 0.44; aE = -sd * 0.1; rE = 0.6; twW = sd * 0.6; twE = -sd * 0.8; lnW = -0.07; lnE = 0.15; fsE = 1.25; break;
      case 'kick':
        Gx = 0.05; Gy = sd * 0.13; lnW = -0.04; lnE = -0.12;
        if (a.v === 1) { polar = true; pv = 0; aW = sd * 1.2; rW = 0.52; aE = -sd * 0.18; rE = 0.84; twW = sd * 0.2; twE = -sd * 0.65; }
        else { Wx = 0.32; Wy = sd * 0.14; Ex = 0.9; Ey = sd * 0.04; }
        break;
      case 'stomp':   // the knee comes up (the raised foot looks bigger from above), then the heel comes down
        Gx = 0.05; Gy = sd * 0.13; Wx = 0.3; Wy = sd * 0.12; Ex = 0.62; Ey = sd * 0.06; lnW = -0.04; lnE = 0.09; fsW = 1.55; fsE = 0.92;
        break;
      case 'bat':
        Gx = 0.14; Gy = sd * 0.2; polar = true; pv = 0.02; aW = sd * 1.75; rW = 0.3; aE = -sd * 0.6; rE = 0.36;
        baG = sd * 2.4; baW = sd * 2.55; baE = -sd * 1.2; twW = sd * 0.55; twE = -sd * 0.7; lnE = 0.1;
        break;
    }
    if (polar) { Wx = pv + Math.cos(aW) * rW; Wy = Math.sin(aW) * rW; Ex = pv + Math.cos(aE) * rE; Ey = Math.sin(aE) * rE; }
    if (k === 0) { const e = eio(u); o.fx = mix(Gx, Wx, e); o.fy = mix(Gy, Wy, e); o.tw = twW * e; o.lean = lnW * e; o.fs = mix(1, fsW, e); o.ba = mix(baG, baW, e); }
    else if (k === 1) {
      const e = eo(u);
      if (polar) { const an = mix(aW, aE, e), r = mix(rW, rE, e); o.fx = pv + Math.cos(an) * r; o.fy = Math.sin(an) * r; }
      else { o.fx = mix(Wx, Ex, e); o.fy = mix(Wy, Ey, e); }
      o.tw = mix(twW, twE, e); o.lean = mix(lnW, lnE, e); o.fs = mix(fsW, fsE, e); o.ba = mix(baW, baE, e);
    } else { const e = eio(u); o.fx = mix(Ex, Gx, e); o.fy = mix(Ey, Gy, e); o.tw = twE * (1 - e); o.lean = lnE * (1 - e); o.fs = mix(fsE, 1, e); o.ba = mix(baE, baG, e); }
    if (a.type === 'stomp') { /* the foot's size is its height */ } else if (k === 1) o.fs = Math.min(1.9, o.fs * (1 + 0.42 * u)); else if (k === 2) o.fs = Math.min(1.9, o.fs * (1 + 0.42 * (1 - eio(u))));   // the fist swells as the blow lands (cartoon emphasis)
    o.k = k; o.u = u;
    return o;
  }
  // Two-bone IK: elbow (or knee) bending to side sd, the end clamped to reach. Writes IK. fore: a fist held
  // close is raised towards the camera, so seen from above the arm looks shorter (a tucked guard, not wings).
  const IK = { ex: 0, ey: 0, fx: 0, fy: 0 };
  function limb(sx, sy, fx, fy, sd, A, B, fore) {
    let dx = fx - sx, dy = fy - sy, d = Math.hypot(dx, dy);
    if (fore) { const k = cl(d / ((A + B) * 0.8), 0.6, 1); A *= k; B *= k; }
    const L = (A + B) * 0.998;
    if (d < 0.04) { dx = 0.04; dy = 0; d = 0.04; fx = sx + 0.04; fy = sy; }
    if (d > L) { const k = L / d; dx *= k; dy *= k; d = L; fx = sx + dx; fy = sy + dy; }
    const c = (A * A + d * d - B * B) / (2 * A * d), an = Math.acos(c < -1 ? -1 : c > 1 ? 1 : c) * sd, ux = dx / d, uy = dy / d, ca = Math.cos(an), sa = Math.sin(an);
    IK.ex = sx + (ux * ca - uy * sa) * A; IK.ey = sy + (ux * sa + uy * ca) * A; IK.fx = fx; IK.fy = fy;
    return IK;
  }
  // A kicking leg seen from above bends towards the camera, so the knee sits on the hip-foot line (a touch
  // outward); the foot is clamped to the leg's reach. Writes IK (ex/ey = knee).
  function leg(hx, hy, fx, fy, sd) {
    let dx = fx - hx, dy = fy - hy, d = Math.hypot(dx, dy) || 0.01;
    const L = THIGH + SHIN; if (d > L) { dx *= L / d; dy *= L / d; d = L; }
    IK.fx = hx + dx; IK.fy = hy + dy;
    IK.ex = hx + dx * 0.5 - dy / d * sd * 0.04; IK.ey = hy + dy * 0.5 + dx / d * sd * 0.04;
    return IK;
  }
  // The pose drawPed draws: shoulders, elbows, fists, torso twist and lean, head offset, stance, a kicking
  // leg, the bat; or a body state (fall, lie, getup, kneel) for knockdowns and begging.
  const POSE = { on: false, arms: true, body: 'up', k: 0, ang: 0, fk: 1, lx: 0, ly: 0, rx: 0, ry: 0, lex: 0, ley: 0, rex: 0, rey: 0, lsx: 0, lsy: 0, rsx: 0, rsy: 0, fl: 1, fr: 1, tw: 0, lean: 0, sy: 0, hx: 0, hy: 0, stance: 0, leg: 0, hipx: 0, hipy: 0, kx: 0, ky: 0, knx: 0, kny: 0, bat: false, ba: 0, fight: 0 };
  function armPose(p, t, force) {
    if (!p || p.dead || p.removed) return null;
    const b = p.bw, a = p.act, on = !!(a && a.on), R = POSE;
    if (on && a.type === 'knockdown') {
      R.on = true; R.arms = false; R.ang = a.ang;
      if (a.t < a.w) { R.body = 'fall'; R.k = eo(a.t / a.w); } else if (a.t < a.w + a.s) { R.body = 'lie'; R.k = 1; } else { R.body = 'getup'; R.k = Math.min(1, (a.t - a.w - a.s) / a.r); }
      return R;
    }
    if (on && a.type === 'beg') { R.on = true; R.arms = false; R.body = 'kneel'; R.k = a.t; return R; }
    if (p.knock > 0) return null;
    const gun = !!p.weapon && p.weapon !== 'fists' && p.weapon !== 'bat' && !p.holster;
    const g = b ? b.guard : 0;
    if (gun || (!force && !on && g < 0.02)) return null;
    R.on = true; R.arms = true; R.body = 'up'; R.tw = 0; R.lean = 0; R.sy = 0; R.hx = 0; R.hy = 0; R.fl = 1; R.fr = 1; R.leg = 0; R.fk = 1; R.bat = false; R.fight = g;
    const sp = p.speed || 0, run = sp > 3.3, mv = Math.min(1, sp / 1.3);
    const sw = Math.sin(p.walk * 3) * mv * (run ? 0.34 : 0.24);
    let lx = run ? 0.12 - sw * 0.7 : -sw * 0.9, ly = run ? -0.27 : -0.33, rx = run ? 0.12 + sw * 0.7 : sw * 0.9, ry = run ? 0.27 : 0.33;
    if (g > 0) {   // the guard: fists up in front of the face, bobbing with the footwork
      const bob = Math.sin(t * 9 + p.id * 1.7) * 0.02 * (1 - mv * 0.5);
      lx = mix(lx, 0.31 + bob, g); ly = mix(ly, -0.1, g); rx = mix(rx, 0.25 + bob * 0.6, g); ry = mix(ry, 0.125, g);
    }
    R.stance = g * (1 - Math.min(1, sp / 3));
    const bat = p.weapon === 'bat' && !p.holster;
    if (bat) { R.bat = true; R.ba = mix(-0.32, 2.4, g); const hx = mix(0.22, 0.14, g), hy = mix(0.12, 0.2, g); lx = hx + Math.cos(R.ba) * 0.06; ly = hy + Math.sin(R.ba) * 0.06; rx = hx - Math.cos(R.ba) * 0.03; ry = hy - Math.sin(R.ba) * 0.03; }
    if (on) {
      const tt = a.t;
      if (STRIKE[a.type]) {
        sample(a, tt, Q);
        R.tw = Q.tw; R.lean = Q.lean;
        const sd = a.side;
        if (LEGS[a.type]) {
          R.leg = sd; R.hipx = Q.lean * 0.3; R.hipy = sd * 0.1; if (a.type === 'stomp') R.fk = Q.fs;
          leg(R.hipx, R.hipy, Q.fx, Q.fy, sd); R.kx = IK.fx; R.ky = IK.fy; R.knx = IK.ex; R.kny = IK.ey;
          const bal = Q.k === 1 ? eo(Q.u) : Q.k === 2 ? 1 - eio(Q.u) : 0;   // the arm on the kicking side swings back for balance
          lx = 0.24; ly = -0.11; rx = 0.22; ry = 0.12;
          if (sd > 0) { rx = mix(rx, -0.04, bal); ry = mix(ry, 0.36, bal); } else { lx = mix(lx, -0.04, bal); ly = mix(ly, -0.36, bal); }
        } else if (a.type === 'bat') {
          R.bat = true; R.ba = Q.ba; const c = Math.cos(Q.ba), s = Math.sin(Q.ba);
          lx = Q.fx + c * 0.06; ly = Q.fy + s * 0.06; rx = Q.fx - c * 0.03; ry = Q.fy - s * 0.03;
        } else if (sd < 0) { lx = Q.fx; ly = Q.fy; R.fl = Q.fs; rx = 0.23; ry = 0.11; R.bat = false; }   // the other fist stays up
        else { rx = Q.fx; ry = Q.fy; R.fr = Q.fs; lx = 0.26; ly = -0.09; R.bat = false; }
      } else {
        const u = a.dur > 0 ? Math.min(1, tt / a.dur) : 1;
        switch (a.type) {
          case 'block': {
            const e = Math.min(1, tt / 0.06), fl = a.k > 0 ? Math.max(0, 1 - (X.time - a.k) / 0.15) : 0;
            lx = mix(lx, 0.27 - fl * 0.06, e); ly = mix(ly, -0.075, e); rx = mix(rx, 0.27 - fl * 0.06, e); ry = mix(ry, 0.075, e);
            R.fl = R.fr = 1.12; R.lean = -0.04 - fl * 0.05; R.hx = -fl * 0.04;
            break;
          }
          case 'dodge': { const e = Math.sin(Math.PI * u); R.sy = a.side * 0.08 * e; R.hy = a.side * 0.05 * e; R.lean = -0.03 * e; R.tw = -a.side * 0.2 * e; ly += R.sy; ry += R.sy; break; }
          case 'hitReact': {
            const e = (tt < 0.05 ? tt / 0.05 : Math.max(0, 1 - (tt - 0.05) / Math.max(0.05, a.dur - 0.05))) * a.k;
            R.hx = -0.11 * e; R.hy = -a.side * 0.08 * e; R.lean = -0.08 * e; R.tw = a.side * 0.38 * e;
            const f = 0.6 * e; lx = mix(lx, 0.1, f); ly = mix(ly, -0.38, f); rx = mix(rx, 0.12, f); ry = mix(ry, 0.36, f);
            break;
          }
          case 'stagger': {
            const f = 1 - u, wob = Math.sin(tt * 13 + p.id);
            R.sy = wob * 0.07 * f; R.lean = -0.06 * f; R.hx = -0.05 * f; R.tw = wob * 0.25 * f;
            lx = mix(lx, 0.06 + 0.06 * Math.sin(tt * 11), f); ly = mix(ly, -0.44, f) + R.sy; rx = mix(rx, 0.04 - 0.06 * Math.sin(tt * 11), f); ry = mix(ry, 0.44, f) + R.sy;
            break;
          }
          case 'taunt': {
            const e = Math.min(1, tt / 0.15) * Math.min(1, (a.dur - tt) / 0.15);
            if (a.v === 0) { const wag = Math.sin(tt * 14) * 0.07; lx = mix(lx, 0.4 + wag, e); ly = mix(ly, -0.16, e); rx = mix(rx, 0.4 + wag, e); ry = mix(ry, 0.16, e); R.lean = -0.03 * e; }
            else if (a.v === 1) { const th = Math.sin(tt * 16); lx = mix(lx, 0.15 + Math.max(0, th) * 0.06, e); ly = mix(ly, -0.08, e); rx = mix(rx, 0.15 + Math.max(0, -th) * 0.06, e); ry = mix(ry, 0.08, e); R.lean = 0.03 * e; }
            else { const up = Math.sin(tt * 8) * 0.04; lx = mix(lx, 0.14, e); ly = mix(ly, -0.46 + up, e); rx = mix(rx, 0.14, e); ry = mix(ry, 0.46 - up, e); R.sy = Math.sin(tt * 6) * 0.03 * e; }
            break;
          }
        }
      }
    }
    // shoulders turn with the torso; elbows bend outwards
    const c = Math.cos(R.tw), s = Math.sin(R.tw);
    R.lsx = R.lean + 0.01 * c + SH * s; R.lsy = R.sy + 0.01 * s - SH * c;
    R.rsx = R.lean + 0.01 * c - SH * s; R.rsy = R.sy + 0.01 * s + SH * c;
    limb(R.lsx, R.lsy, lx, ly, -1, UA, FA, true); R.lex = IK.ex; R.ley = IK.ey; R.lx = IK.fx; R.ly = IK.fy;
    limb(R.rsx, R.rsy, rx, ry, 1, UA, FA, true); R.rex = IK.ex; R.rey = IK.ey; R.rx = IK.fx; R.ry = IK.fy;
    return R;
  }
  // Where the striking fist, foot or a point along the bat is in the world at act time tt (along: 0..1 of the bat).
  const HP = { x: 0, y: 0 };
  function limbWorld(p, a, tt, along, out) {
    sample(a, tt, Q);
    let x = Q.fx, y = Q.fy;
    if (LEGS[a.type]) { leg(Q.lean * 0.3, a.side * 0.1, x, y, a.side); x = IK.fx; y = IK.fy; }
    else if (a.type === 'bat') { const L = 0.82 * along; x += Math.cos(Q.ba) * L; y += Math.sin(Q.ba) * L; }
    else {
      const c = Math.cos(Q.tw), s = Math.sin(Q.tw), sy = a.side < 0 ? -SH : SH;
      limb(Q.lean + 0.01 * c - sy * s, 0.01 * s + sy * c, x, y, a.side, UA, FA, true); x = IK.fx; y = IK.fy;
    }
    const sc = scaleOf(p), c = Math.cos(p.th), s = Math.sin(p.th);
    out.x = p.x + (x * c - y * s) * sc; out.y = p.y + (x * s + y * c) * sc;
    return out;
  }

  // ================= actions =================
  function strike(p, type, o) {
    o = o || NONE;
    if (!S || !p || p.dead || p.removed || p.car || p.hidden || !SPEC[type] || p.knock > 0) return false;
    const A = act(p), b = bw(p);
    if (locked(p, A)) return false;
    const sp = SPEC[type], npc = !p.isPlayer, wind = npc && !o.cosmetic ? OPT.npcWind : 1;
    if (o.ang != null && isFinite(o.ang)) p.th = o.ang;
    A.on = true; A.type = type; A.w = sp.w * wind; A.s = sp.s; A.r = sp.r; A.dur = A.w + A.s + A.r; A.t = o.cosmetic ? A.w : 0;
    A.side = o.side || DEF_SIDE[type]; A.v = o.v != null ? o.v : type === 'kick' && npc ? (Math.random() < 0.45 ? 1 : 0) : 0;
    A.res = o.cosmetic ? 2 : 0; A.n = ++S.n; A.cos = !!o.cosmetic; A.k = 0; A.by = null;
    const base = type === 'bat' ? ((X.WEAPONS && X.WEAPONS.bat && X.WEAPONS.bat.dmg) || sp.dmg) : sp.dmg;
    A.dmg = base * (o.mul != null ? o.mul : !npc ? 1 : type === 'bat' ? 0.5 : OPT.npcMul * (p.meleeMul || 1));
    b.lastT = X.time; b.lastSide = A.side;
    S.stats.strikes++;
    if (o.cosmetic) S.stats.cosmetic++;
    else snd('whoosh', p.x, p.y, type === 'haymaker' || type === 'bat' ? 0.9 : 0.55, type === 'jab' ? 1.3 : type === 'haymaker' || type === 'bat' ? 0.7 : 1, A.w * 0.8);
    if (Math.random() < (type === 'haymaker' || type === 'kick' || type === 'bat' ? 0.55 : 0.15)) snd('grunt', p.x, p.y, 0.6, pitchOf(p));
    return true;
  }
  // A non-strike action: block, dodge, hitReact, stagger, taunt, beg.
  function react(p, type, side, k, dur) {
    const A = act(p); bw(p);
    if (A.on && A.type === 'knockdown') return false;
    A.on = true; A.type = type; A.t = 0; A.w = 0; A.s = 0; A.r = 0; A.dur = dur || REACT_DUR[type] || 0.3; A.side = side || 1; A.k = k == null ? 1 : k;
    A.res = 1; A.n = ++S.n; A.cos = false; A.v = type === 'taunt' ? Math.floor(Math.random() * 3) : 0;
    if (type === 'block') A.k = 0;
    return true;
  }
  // Fall (ragdoll slide) -> lie dazed with stars -> get up. ang: the direction the body falls.
  function knockdown(v, ang, by) {
    const A = act(v), lie = v.isPlayer ? 0.75 : rand(1.2, 2.0); bw(v);
    A.on = true; A.type = 'knockdown'; A.t = 0; A.w = 0.28; A.s = lie; A.r = v.isPlayer ? 0.32 : 0.55; A.dur = A.w + A.s + A.r;
    A.ang = ang; A.res = 1; A.n = ++S.n; A.dust = false; A.up = false; A.by = by || null; A.cos = false; A.hold = 0; A.stomped = false;
    bw(v).streak = 0;
    v.knock = Math.max(v.knock || 0, A.w + A.s); v.spin = 0;
    S.stats.knockdowns++;
    if (by && by.ai && by.ai.owner === 'brawl' && by.ai.target === v) by.ai.downs++;
    X.emit('brawlKnockdown', { ped: v, by: by || null, x: v.x, y: v.y });
  }
  function endAct(p) {
    const A = p.act; A.on = false;
    if (A.type === 'beg' && fighting(p)) end(p, 'flee');
    else if (A.type === 'knockdown' && fighting(p)) react(p, 'block', 1, 0, 0.4);   // back up with the guard raised
  }

  // ================= hits =================
  // On the ground (falling, flat, getting up; or sent flying): punches pass over them, a stomp finds them.
  const downOf = q => q.knock > 0 || (!!q.act && q.act.on && q.act.type === 'knockdown');
  // Who is at (x, y) within r (the closest body), not counting the striker. low: 0 standing people only (fists),
  // 1 anyone (kicks, bats), 2 people on the ground only (stomps).
  function pedAt(x, y, r, not, low) {
    let best = null, bd = 1e9;
    for (let i = 0, n = X.peds.length; i < n; i++) {
      const q = X.peds[i];
      if (q === not || q.removed || q.dead || q.hidden || q.car) continue;
      if (low !== 1 && downOf(q) !== (low === 2)) continue;
      const dx = q.x - x, dy = q.y - y, R = q.r + r + 0.03;
      if (dx > R || dx < -R || dy > R || dy < -R) continue;
      const d = Math.hypot(dx, dy) - q.r; if (d < r + 0.03 && d < bd) { bd = d; best = q; }
    }
    return best;
  }
  function carAtPt(x, y, r) {
    for (const c of X.cars) {
      if (c.removed || Math.abs(c.x - x) > c.len || Math.abs(c.y - y) > c.len) continue;
      if (X.circlePoly(x, y, r, X.carPoly(c))) return c;
    }
    return null;
  }
  function tryHit(p, A) {
    if (A.type === 'stomp' && A.t < A.w + A.s * 0.7) return false;   // the heel comes down at the end
    const tt = Math.min(A.t, A.w + A.s), n = A.type === 'bat' ? 3 : 1, r = LEGS[A.type] || A.type === 'bat' ? 0.13 : 0.1;
    const low = A.type === 'stomp' ? 2 : A.type === 'kick' || A.type === 'bat' ? 1 : 0;
    for (let i = 0; i < n; i++) {
      limbWorld(p, A, tt, BAT_K[i], HP);
      const v = pedAt(HP.x, HP.y, r, p, low);
      if (v && !X.raycast(p.x, p.y, HP.x, HP.y, SOLID)) { land(p, A, v, HP.x, HP.y); return true; }
    }
    if (A.t < A.w + A.s * 0.75) return false;   // cars and props only once the blow is (nearly) out
    for (let i = 0; i < n; i++) {
      limbWorld(p, A, tt, BAT_K[i], HP);
      const c = carAtPt(HP.x, HP.y, r);
      if (c) { landCar(p, A, c, HP.x, HP.y); return true; }
      if (X.hitProp) { const o = X.blocked(HP.x, HP.y, r); if (o && o.prop) { A.res = 1; X.hitProp(o, A.dmg * (A.type === 'bat' ? 1 : 0.4), p, 'melee'); snd('car', HP.x, HP.y, 0.6); pow(HP.x, HP.y, 0.26, null); return true; } }
    }
    return false;
  }
  let landing = false;
  function land(att, A, v, x, y) {
    A.res = 1;
    const sp = SPEC[A.type], bA = bw(att), bV = bw(v), VA = act(v), isP = !!att.isPlayer;
    let dx = v.x - att.x, dy = v.y - att.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    let kx = dx, ky = dy;
    if (A.type === 'hook' || A.type === 'bat' || (A.type === 'kick' && A.v === 1)) {   // swings shove sideways too
      const s = A.side, lx = s * Math.sin(att.th), ly = -s * Math.cos(att.th);
      kx = dx * 0.6 + lx * 0.8; ky = dy * 0.6 + ly * 0.8; const L = Math.hypot(kx, ky) || 1; kx /= L; ky /= L;
    }
    const facing = Math.cos(v.th - Math.atan2(att.y - v.y, att.x - v.x)) > 0.25;
    const blocked = VA.on && VA.type === 'block' && facing;
    const counter = !blocked && VA.on && STRIKE[VA.type] && VA.t < VA.w;   // caught winding up
    // trading blows: somebody already swinging can eat a light blow and keep swinging (the player always can,
    // tough guys and gang members often), so a fight is an exchange rather than whoever started first
    const light = A.type === 'jab' || A.type === 'cross' || A.type === 'hook', tough = fighting(v) && (v.ai.tough || v.ai.gang);
    const armor = !blocked && VA.on && STRIKE[VA.type] && !VA.cos && VA.t < VA.w + VA.s && light && (v.isPlayer || (fighting(v) && Math.random() < (tough ? 0.6 : 0.35)));
    // eaten a couple in a row: they shake the next light one off and swing straight back
    const shrug = !armor && !blocked && light && A.type !== 'hook' && fighting(v) && v.ai.target === att && streak(bV) >= 2 && Math.random() < (tough ? 0.6 : 0.3);
    const dmg = A.dmg * (blocked ? OPT.blockMul : 1) * (counter ? 1.25 : 1);
    const hp0 = v.hp;
    landing = true;
    try { X.damagePed(v, dmg, att, 'melee'); } finally { landing = false; }
    S.stats.hits++;
    if (blocked) S.stats.blocked++;
    bV.streak = blocked ? 0 : X.time - bV.hitT < 0.9 ? bV.streak + 1 : 1;   // clean hits in a row
    bV.hitT = X.time;
    if (isP && !v.isPlayer) X.crime('assault', v.x, v.y, { ped: v, weapon: A.type === 'bat' ? 'bat' : 'fists' });
    if (fighting(att)) { att.ai.hits++; if (att.ai.target !== v) S.stats.stray++; }
    if (fighting(v) && v.ai.target !== att && !v.dead && Math.random() < 0.55) v.ai.target = att;   // someone else joined in
    if (fighting(v) && !blocked && v.ai.target === att) v.ai.nextT = Math.min(v.ai.nextT, rand(0.02, 0.22) / v.ai.aggr);   // the urge to hit back
    const hs = SPEC[A.type].hs * OPT.hitStop * (blocked ? 0.6 : 1);
    bA.hs = Math.max(bA.hs, hs); bV.hs = Math.max(bV.hs, hs); bA.hsF = bV.hsF = S.frame;
    let kb = sp.kb * (blocked ? 0.35 : 1);
    const big = !blocked && (A.type === 'uppercut' || A.type === 'haymaker' || A.type === 'kick' || A.type === 'bat');
    let kd = false;
    const ang = Math.atan2(ky, kx);
    if (v.dead) {
      v.knock = Math.max(v.knock || 0, 0.5 + kb * 0.06); v.spin = rand(-5, 5); v.vx += kx * kb * 1.3; v.vy += ky * kb * 1.3; bV.hs = 0;
    } else if (blocked) {
      VA.dur = Math.max(VA.dur, VA.t + 0.2); VA.k = X.time;
      bV.kbx += kx * kb; bV.kby += ky * kb;
      fx('spark', x, y, 0.2, { rot: Math.atan2(att.y - y, att.x - x), s: big ? 1.3 : 1 });
      snd('block', x, y, 1, pitchOf(v));
      if (fighting(v) && v.ai.target === att && Math.random() < 0.3 + v.ai.skill * 0.6) v.ai.ripT = X.time + 0.08;   // block, then hit back
    } else {
      const low = v.hp < v.maxHp * 0.18, me = v.isPlayer;
      let st = false;
      switch (A.type) {
        // the player's uppercut floors them as the finisher of a combo that landed (half the time on its own)
        case 'uppercut': kd = me ? Math.random() < 0.35 : isP ? (X.time - bA.chainT < 1.3 && bA.chain >= 2) || low || Math.random() < 0.5 : (low || Math.random() < 0.6); break;
        case 'stomp': if (VA.on && VA.type === 'knockdown') VA.stomped = true; break;
        case 'haymaker': kd = low || Math.random() < (me ? 0.3 : 0.45); st = !kd; break;
        case 'kick': kd = low && !me; st = !kd; break;
        case 'bat': kd = low || Math.random() < (me ? 0.4 : 0.7); st = !kd; break;
        default: kd = low && !me && A.type !== 'jab' && Math.random() < 0.5;
      }
      if (kd) { knockdown(v, ang, att); kb *= 1.25; }
      else if (armor) kb *= 0.3;
      else if (shrug) { kb *= 0.4; react(v, 'hitReact', Math.random() < 0.5 ? -0.4 : 0.4, 0.6, 0.07); v.ai.ripT = X.time + 0.07; bV.streak = 0; }
      else if (st) react(v, 'stagger', Math.random() < 0.5 ? -1 : 1, 1, me ? 0.42 : REACT_DUR.stagger);
      else react(v, 'hitReact', A.type === 'hook' ? -A.side : Math.random() < 0.5 ? -0.4 : 0.4, A.type === 'jab' ? 0.65 : 1, FLINCH[A.type] * (me ? 0.55 : 1));
      bV.kbx += kx * kb; bV.kby += ky * kb;
      if (me) G().shake = Math.max(G().shake || 0, big || kd ? 0.16 : 0.07);
    }
    if (isP) {
      G().shake = Math.max(G().shake || 0, big || kd ? 0.12 : 0.04);
      if (big || kd) X.cam.span *= 0.965;   // a little punch-in that the camera eases back out of
      if (!blocked) { bA.chain = X.time - bA.chainT < 1.3 ? bA.chain + 1 : 1; bA.chainT = X.time; if (bA.chain >= 3) X.floatText(att.x, att.y - 1.1, bA.chain + ' HITS!', '#ffffff', { size: 13, life: 0.9 }); }
    }
    // the comic part
    const ko = isP && (v.dead || (kd && v.hp < v.maxHp * 0.3));
    const word = blocked ? null : ko ? 'K.O.!' : big || kd ? pick(WORDS[A.type] || WORDS.cross) : (A.type === 'hook' || A.type === 'stomp') && Math.random() < 0.5 ? pick(WORDS[A.type]) : null;
    if (!blocked) {
      pow(x + dx * 0.12, y + dy * 0.12, big || kd ? 0.5 : A.type === 'jab' ? 0.22 : 0.3, word);
      if (big || kd) fx('ring', x + dx * 0.12, y + dy * 0.12, 0.26, { s: big ? 1 : 0.8 });
      const hx = v.x - dx * 0.05, hy = v.y - dy * 0.05;
      sweat(hx, hy, ang, big ? 5 : 2 + (Math.random() < 0.5 ? 1 : 0));
      if ((A.type === 'uppercut' || A.type === 'haymaker' || A.type === 'bat') && Math.random() < 0.4) tooth(hx, hy, ang);
      if (A.type === 'bat' || (big && Math.random() < 0.5) || v.dead) PG.burst(x, y, 'debris', A.type === 'bat' ? 6 : 3, 3, 0.4, 0.1, BLOOD);
      snd(A.type, x, y, 1, 0.9 + Math.random() * 0.25);
      if (!v.dead && Math.random() < 0.55) snd('oof', v.x, v.y, 0.7, pitchOf(v), 0.05);
    }
    X.emit('brawlHit', { by: att, ped: v, type: A.type, dmg: Math.min(dmg, hp0), blocked, knockdown: kd, x, y });
  }
  function landCar(att, A, c, x, y) {
    A.res = 1;
    const bat = A.type === 'bat', dmg = bat ? ((X.WEAPONS && X.WEAPONS.bat && X.WEAPONS.bat.carDmg) || 40) * (A.dmg / 38) : A.dmg * 1.3;
    if (X.byPlayer(att) && !c.wrecked && (c.model.kind === 'police' || c.model.kind === 'swat' || c.owner === 'police') && !(c._copT != null && X.time - c._copT < 1 && X.time >= c._copT)) { c._copT = X.time; X.crime('hitCopCar', x, y, { car: c, weapon: bat ? 'bat' : 'fists' }); }
    X.damageCar(c, dmg, att, 'melee');
    S.stats.carHits++;
    bw(att).hs = Math.max(bw(att).hs, 0.04);
    PG.burst(x, y, 'spark', bat ? 6 : 3, 4, 0.25, 0.08);
    pow(x, y, 0.3, null);
    snd('car', x, y, 1, 0.9 + Math.random() * 0.2);
    // the window cracks, then gives way, then the fists go through it
    const cs = Math.cos(c.th), sn = Math.sin(c.th), lx = (x - c.x) * cs + (y - c.y) * sn, ly = -(x - c.x) * sn + (y - c.y) * cs;
    const cr = c._bwCr || (c._bwCr = []);
    if (cr.length < 6) cr.push({ x: lx * 0.82, y: ly * 0.8, r: rand(0.16, 0.3), s: Math.random() * 10, t: X.time });
    c._bwWin = (c._bwWin || 0) + (bat ? 2 : 1);
    if (c._bwWin >= 4 && !c._bwBroke) { c._bwBroke = true; X.decal(x, y, 'glass', 0.7); snd('shatter', x, y); if (att.ai && att.ai.owner === 'brawl') say(att, LINES.car, '#ffd23a'); }
    else if (!c._bwBroke) snd('crack', x, y, 0.8);
    else { const d = c.driver; if (d && !d.dead) { X.damagePed(d, A.dmg * 0.6, att, 'melee'); if (d.isPlayer) G().shake = Math.max(G().shake || 0, 0.1); } }
  }

  // ================= fighting AI =================
  function newAI(p, tg, o, prev) {
    const ty = prev && prev.owner === 'peds' ? prev.type : p.team;
    const gang = p.team === 'gang' || ty === 'gang', drunk = ty === 'drunk', tough = ty === 'tough' || drunk || (p.look && p.look.scale > 1.08), old = ty === 'old';
    return {
      owner: 'brawl', st: 'brawl', prev: prev || null, target: tg, t: 0, gang, tough,
      skill: o.skill != null ? o.skill : gang ? 0.58 : drunk ? 0.12 : tough ? 0.42 : old ? 0.08 : 0.3,
      aggr: o.aggr != null ? o.aggr : gang ? 1.35 : tough ? 1.2 : old ? 0.6 : rand(0.8, 1.1),
      giveUp: o.giveUp != null ? o.giveUp : gang ? 0.14 : tough ? 0.2 : 0.3, beg: gang ? 0 : tough ? 0.15 : 0.4,
      run: old ? 2.6 : gang ? 5.6 : 5.1, chaseMax: o.chase || (gang ? 7 : tough ? 5 : 3.5), dist: rand(1.25, 1.5),
      plan: null, pi: 0, planT: 0, nextT: rand(0.2, 0.5), alertT: o.alert != null ? o.alert : 0.35, strafe: Math.random() < 0.5 ? 1 : -1, strafeT: rand(0.8, 2),
      retreatT: 0, chaseT: 0, seenN: 0, hits: 0, downs: 0, hits0: 0, guard: 1, begged: false, tauntN: 0, sayT: rand(2, 4), ripT: 0, readN: 0,
    };
  }
  function fight(p, tg, o) {
    o = o || NONE;
    if (!S || !p || p.dead || p.removed || p.isPlayer || p.car || p.hidden || !tg || tg === p || tg.dead || tg.removed) return false;
    if (fighting(p)) { p.ai.target = tg; return true; }
    p.ai = newAI(p, tg, o, p.ai);
    p.pose = null;
    if (p.weapon === 'bat') p.holster = false;
    bw(p);
    S.stats.fights++;
    X.emit('brawlStart', { ped: p, target: tg });
    return true;
  }
  // The victim takes the attacker on (the caller already decided it fights rather than flees).
  function provoke(v, att) {
    if (!S || !v || v.dead || v.removed || v.isPlayer || v.car || !att || att === v || att.dead || att.removed) return false;
    if (fighting(v)) { if (v.ai.target !== att && Math.random() < 0.5) v.ai.target = att; return true; }
    if (!fight(v, att, NONE)) return false;
    S.stats.provoked++;
    if (Math.random() < 0.7) say(v, LINES.provoke, '#ffd23a');
    snd('grunt', v.x, v.y, 0.8, pitchOf(v) * 1.15);
    return true;
  }
  // Hand the person back to whoever owned them before the fight. reason: won | lost | flee | escaped | tired | stop.
  function end(p, reason) {
    const a = p.ai; if (!a || a.owner !== 'brawl') return;
    const tg = a.target;
    p.ai = a.prev || null; p.pose = null;
    const A = p.act; if (A && A.on && (A.type === 'block' || A.type === 'dodge' || A.type === 'taunt')) A.on = false;
    if (S) {
      if (reason === 'won') { S.stats.won++; if (Math.random() < 0.6 && !p.dead) say(p, LINES.gloat, '#ffd23a'); }
      else if (reason === 'flee') S.stats.fled++;
      else if (reason === 'escaped') { S.stats.escaped++; if (Math.random() < 0.5) say(p, LINES.give, '#ffd23a'); }
    }
    X.emit('brawlEnd', { ped: p, target: tg, reason });
  }
  function choosePlan(p, a) {
    if (p.weapon === 'bat' && !p.holster) return BATS[Math.random() < 0.7 ? 0 : 1];
    const pro = a.gang || a.tough, L = pro ? PRO : PLANS, Wt = pro ? W_PRO : W_CIV;
    let tot = 0; for (const w of Wt) tot += w;
    let r = Math.random() * tot;
    for (let i = 0; i < L.length; i++) if ((r -= Wt[i]) <= 0) return L[i];
    return L[0];
  }
  function planSide(a, ty, prev) {
    if (ty === 'hook') return prev === 'cross' || prev === 'uppercut' ? -1 : 1;
    if (ty === 'uppercut') return prev === 'cross' ? -1 : 1;
    if (ty === 'bat') return 0;
    return DEF_SIDE[ty];
  }
  const FAN = [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9];
  function freeHeading(p, ang, look) {
    for (const o of FAN) { const a = ang + o; if (!X.blocked(p.x + Math.cos(a) * look, p.y + Math.sin(a) * look, 0.33)) return a; }
    return ang;
  }
  // Move one of ours: keep clear of other people (a ring around the target), then the usual X.movePed.
  function step(p, dt, vx, vy, face, tg) {
    let sx = 0, sy = 0;
    for (let i = 0, n = X.peds.length; i < n; i++) {
      const q = X.peds[i];
      if (q === p || q.removed || q.dead || q.hidden || q.car) continue;
      const dx = p.x - q.x, dy = p.y - q.y;
      if (dx > 0.8 || dx < -0.8 || dy > 0.8 || dy < -0.8) continue;
      const R = q === tg ? 0.72 : 0.62, d2 = dx * dx + dy * dy;
      if (d2 >= R * R) continue;
      const d = Math.sqrt(d2) || 1e-3, ex = d2 > 1e-6 ? dx / d : -Math.cos(p.th), ey = d2 > 1e-6 ? dy / d : -Math.sin(p.th), w = (R - d) / R;   // right on top: step back
      sx += ex * w; sy += ey * w;
      if (d < 0.54) { const o = (0.54 - d) * 0.5; p.x += ex * o; p.y += ey * o; }
    }
    X.movePed(p, dt, vx + sx * 2.6, vy + sy * 2.6);
    if (face != null) p.th += wrap(face - p.th) * Math.min(1, dt * 13);
  }
  // A blow coming at them: one roll per blow to block it or slip it (skill, health; bonus: having eaten a few
  // in a row makes them wise up).
  function defend(p, a, A, tg, ang, d, bonus) {
    const ta = tg.act;
    if (!ta || !ta.on || !STRIKE[ta.type] || ta.n === a.seenN || ta.t > ta.w + ta.s * 0.4 || d > 2.3 || ta.cos) return false;
    a.seenN = ta.n;
    const aimed = Math.abs(wrap(tg.th - ang - Math.PI)) < 0.8, busy = A.on && STRIKE[A.type] && A.t > A.w;
    if (!aimed || busy || Math.random() >= a.skill * (0.55 + 0.45 * p.hp / p.maxHp) + bonus) return false;
    if (ta.type === 'haymaker' || ta.type === 'kick' || ta.type === 'bat' || Math.random() < 0.25) react(p, 'dodge', Math.random() < 0.5 ? -1 : 1, 1);
    else react(p, 'block', 1, 0, Math.max(0.3, ta.w + ta.s - ta.t + 0.18));
    a.plan = null;
    return true;
  }
  function think(p, dt) {
    const a = p.ai, b = bw(p), tg = a.target, A = act(p);
    a.t += dt; a.sayT -= dt; if (a.alertT > 0) a.alertT -= dt;
    if (!tg || tg.removed || (tg.hidden && !tg.car) || (tg.isPlayer && (P.state !== 'play' || X.scene)) || Math.abs(tg.x - p.x) + Math.abs(tg.y - p.y) > 60) return end(p, tg && tg.isPlayer && P.state === 'wasted' ? 'won' : 'lost');
    if (tg.dead) return end(p, 'won');
    if (a.t > 45) return end(p, 'escaped');   // enough is enough
    if (p.knock > 0) { a.guard = 0; X.movePed(p, dt, 0, 0); return; }
    if (b.hs > 0) return;
    const tc = tg.car && !tg.car.removed ? tg.car : null;
    const dx = (tc ? tc.x : tg.x) - p.x, dy = (tc ? tc.y : tg.y) - p.y, d = Math.hypot(dx, dy) || 0.01, ux = dx / d, uy = dy / d, ang = Math.atan2(dy, dx);
    if (A.on && LOCK[A.type]) {   // stunned, staggering, getting up or begging: no fighting
      a.guard = A.type === 'hitReact' ? 1 : 0;
      // shaking off a light hit: the guard can come back up in time for the next one
      if (A.type === 'hitReact' && A.t > A.dur * 0.4 && !tc && defend(p, a, A, tg, ang, d, streak(b) * 0.08 - a.skill * 0.5)) return;
      if (A.type === 'stagger') { const k = 1 - A.t / A.dur, w = Math.sin(A.t * 9 + p.id) * 1.2 * k; step(p, dt, -ux * 1.7 * k - uy * w, -uy * 1.7 * k + ux * w, ang, tg); }
      else X.movePed(p, dt, 0, 0);
      if (A.type === 'beg') p.th += wrap(ang - p.th) * Math.min(1, dt * 6);
      return;
    }
    if (p.hp < p.maxHp * a.giveUp) {   // had enough: beg on the knees, or run
      if (!a.begged && !tc && Math.random() < a.beg) { a.begged = true; react(p, 'beg', 1, 1); S.stats.begged++; say(p, LINES.beg, '#9ec2ff'); snd('oof', p.x, p.y, 0.8, pitchOf(p) * 1.2); return; }
      return end(p, 'flee');
    }
    if (tc) { carFight(p, a, tc, dt, d); return; }
    a.nextT -= dt;   // (also while flinching or blocking: they come back swinging)
    const ta = tg.act, tgDown = tg.knock > 0 || (ta && ta.on && ta.type === 'knockdown');
    if (!tg.isPlayer) {   // NPC opponents: a fight is won once they are beaten, begging or running
      const tai = tg.ai, running = tai && tai.owner === 'peds' && (tai.st === 'flee' || tai.st === 'cower');
      if (tg.hp < tg.maxHp * 0.12 || a.downs >= 2 || (ta && ta.on && ta.type === 'beg') || (running && d > 3)) return end(p, 'won');
    }
    if (d > 3.4) {   // they back off or run: give chase for a while
      a.chaseT += dt; a.plan = null;
      if (d > 20 || a.chaseT > a.chaseMax) return end(p, 'escaped');
      a.guard = 0;
      const h = freeHeading(p, ang, 1.2);
      step(p, dt, Math.cos(h) * a.run, Math.sin(h) * a.run, ang, tg);
      return;
    }
    a.chaseT = Math.max(0, a.chaseT - dt * 0.5);
    a.guard = 1;
    // see a blow coming: block it or slip it
    defend(p, a, A, tg, ang, d, streak(b) * 0.08);
    // the gap after their blow is the time to hit back
    if (ta && ta.on && STRIKE[ta.type] && !ta.cos && ta.n !== a.readN && ta.t > ta.w + ta.s && d < 1.25 && !tgDown && !(A.on && STRIKE[A.type]) && !a.plan) {
      a.readN = ta.n;
      if (Math.random() < 0.2 + a.skill * 0.6) { strike(p, Math.random() < 0.6 ? 'jab' : 'cross'); return; }
    }
    // blocked one: hit straight back
    if (a.ripT && X.time >= a.ripT) {
      a.ripT = 0;
      if (!tgDown && d < 1.3 && (!A.on || A.type === 'block')) { strike(p, Math.random() < 0.6 ? 'cross' : 'hook', { side: Math.random() < 0.5 ? -1 : 1 }); a.plan = null; return; }
    }
    if (A.on && A.type === 'dodge') { const k = Math.sin(Math.PI * Math.min(1, A.t / A.dur)); step(p, dt, (-uy * A.side * 4.2 - ux * 1.2) * (0.3 + k), (ux * A.side * 4.2 - uy * 1.2) * (0.3 + k), ang, tg); return; }
    if (A.on && (A.type === 'block' || A.type === 'taunt')) { step(p, dt, 0, 0, ang, tg); return; }
    if (a.alertT > 0) { step(p, dt, 0, 0, ang, tg); return; }   // startled: turn on them, guard up
    const striking = A.on && STRIKE[A.type], free = !striking || A.t >= A.w + A.s + A.r * 0.45;
    if (tgDown) {   // no hitting people on the ground: circle, maybe taunt
      if (a.plan) a.plan = null;
      if (!striking && a.tauntN < a.downs + 1 && Math.random() < dt * 1.5) { a.tauntN = a.downs + 1; if (Math.random() < 0.45) { react(p, 'taunt', 1, 1); say(p, LINES.down, '#ffd23a'); } }
    } else if (a.plan && free) {
      const ty = a.plan[a.pi];
      a.planT += dt;
      if (d <= SPEC[ty].reach * (ty === 'haymaker' ? 1 : 0.94)) {
        strike(p, ty, { side: ty === 'bat' ? (bw(p).batSide = -bw(p).batSide) : planSide(a, ty, a.pi ? a.plan[a.pi - 1] : null) });
        a.pi++;
        if (a.pi >= a.plan.length) {
          a.plan = null; a.nextT = rand(0.35, 0.95) / a.aggr;
          if (a.hits - a.hits0 >= 2 && Math.random() < 0.3) a.tauntDue = true;
        }
      } else if (a.planT > 1.6) a.plan = null;
    } else if (!a.plan && !striking) {
      if (a.tauntDue) { a.tauntDue = false; react(p, 'taunt', 1, 1); if (Math.random() < 0.5) say(p, LINES.taunt, '#ffd23a'); step(p, dt, 0, 0, ang, tg); return; }
      if (a.nextT <= 0 && d < 2.4) { a.plan = choosePlan(p, a); a.pi = 0; a.planT = 0; a.hits0 = a.hits; }
    }
    // footwork: close in to strike, otherwise hold a range and circle; hurt fighters back off now and then
    if (a.retreatT > 0) a.retreatT -= dt;
    else if (p.hp < p.maxHp * 0.5 && !a.plan && Math.random() < dt * 0.3) a.retreatT = rand(0.6, 1.1);
    a.strafeT -= dt; if (a.strafeT <= 0) { a.strafe = -a.strafe; a.strafeT = rand(0.8, 2.2); }
    const want = a.plan ? 0.84 : a.retreatT > 0 ? 2.2 : tgDown ? 1.8 : a.dist;
    // with a combo planned they step in decisively; otherwise they hold a range, giving ground slowly
    const rad = a.plan ? (d > 0.95 ? cl((d - want) * 4, 2.6, 4.5) : (d - want) * 3) : cl((d - want) * 3.2, a.retreatT > 0 ? -2.4 : -1.3, 3);
    const tan = a.plan || striking ? 0 : a.strafe * (tgDown ? 1.5 : 0.95);
    let vx = ux * rad - uy * tan, vy = uy * rad + ux * tan;
    if (striking && A.t < A.w + A.s) {   // step into the blow; the haymaker is a full lunge
      const k = A.type === 'haymaker' ? (A.t > A.w * 0.5 ? 4.5 : 0) : d > 0.92 ? 1.4 : 0;
      vx += ux * k; vy += uy * k;
    }
    if (Math.hypot(vx, vy) > 1.5) { const h = freeHeading(p, Math.atan2(vy, vx), 0.8), sp = Math.hypot(vx, vy); vx = Math.cos(h) * sp; vy = Math.sin(h) * sp; }
    step(p, dt, vx, vy, ang, tg);
    if (a.sayT <= 0) { a.sayT = rand(5, 9); if (Math.random() < 0.35) say(p, LINES.taunt, '#ffd23a'); }
  }
  // The target sits in a car: walk up to its side and pound on it (the window cracks, then breaks).
  function carFight(p, a, c, dt, d) {
    a.plan = null;
    if (c.speed > 4.5) {   // driving off: chase it a few steps, then give up
      a.chaseT += dt;
      if (d > 14 || a.chaseT > 3) return end(p, 'escaped');
      const ang = Math.atan2(c.y - p.y, c.x - p.x), h = freeHeading(p, ang, 1.2);
      a.guard = 0; step(p, dt, Math.cos(h) * a.run, Math.sin(h) * a.run, ang, null);
      return;
    }
    a.chaseT = 0; a.guard = 1;
    const cs = Math.cos(c.th), sn = Math.sin(c.th), lx = (p.x - c.x) * cs + (p.y - c.y) * sn, ly = -(p.x - c.x) * sn + (p.y - c.y) * cs;
    const hl = c.len / 2, hw = c.wid / 2;
    let qx, qy, nx = 0, ny = 0;
    if (hl - Math.abs(lx) < hw - Math.abs(ly) && Math.abs(lx) > hl * 0.8) { qx = Math.sign(lx) * hl; qy = cl(ly, -hw * 0.7, hw * 0.7); nx = Math.sign(lx); }
    else { qy = Math.sign(ly || 1) * hw; qx = cl(lx, -hl * 0.55, hl * 0.55); ny = Math.sign(ly || 1); }
    const sx = qx + nx * 0.6, sy = qy + ny * 0.6;
    const tx = c.x + sx * cs - sy * sn, ty = c.y + sx * sn + sy * cs, fx = c.x + qx * cs - qy * sn, fy = c.y + qx * sn + qy * cs;
    const ex = tx - p.x, ey = ty - p.y, e = Math.hypot(ex, ey), face = Math.atan2(fy - p.y, fx - p.x);
    if (e > 0.18) { const v = Math.min(e > 2 ? 5 : 2.6, e * 4); step(p, dt, ex / e * v, ey / e * v, face, null); }
    else step(p, dt, 0, 0, face, null);
    const A = act(p);
    if (e < 0.5 && Math.abs(wrap(face - p.th)) < 0.45 && (!A.on || (STRIKE[A.type] && A.t > A.w + A.s + A.r * 0.5))) {
      a.nextT -= dt;
      if (a.nextT <= 0) { strike(p, p.weapon === 'bat' && !p.holster ? 'bat' : pick(CAR_HITS), { side: Math.random() < 0.5 ? -1 : 1 }); a.nextT = rand(0.3, 0.75); if (Math.random() < 0.12) say(p, LINES.car, '#ffd23a'); }
    }
  }

  // ================= melee from weapons.js (the player and other modules' people) =================
  // Somebody lying on the ground right in front (and nobody standing closer): the player stomps.
  function downAhead(p) {
    let best = null, bd = 1.45, up = 9;
    for (let i = 0, n = X.peds.length; i < n; i++) {
      const q = X.peds[i];
      if (q === p || q.dead || q.removed || q.hidden || q.car) continue;
      const dx = q.x - p.x, dy = q.y - p.y; if (Math.abs(dx) > 2 || Math.abs(dy) > 2) continue;
      const d = Math.hypot(dx, dy); if (Math.abs(wrap(Math.atan2(dy, dx) - p.th)) > 0.95) continue;
      if (!downOf(q)) up = Math.min(up, d); else if (d < bd && !(q.act && q.act.on && q.act.type === 'knockdown' && q.act.stomped)) { bd = d; best = q; }   // one stomp each time they go down
    }
    return best && bd < up ? best : null;
  }
  function playerType(p, b) {
    if (downAhead(p)) { b.combo = -1; return 'stomp'; }
    const sprint = X.input.any('ShiftLeft', 'ShiftRight') && (p.speed || 0) > 4.2;
    const back = (p.vx || 0) * Math.cos(p.th) + (p.vy || 0) * Math.sin(p.th) < -1.3;
    if (sprint) { b.combo = -1; return 'haymaker'; }
    if (back) { b.combo = -1; return 'kick'; }
    b.combo = X.time < b.comboUntil && b.combo >= 0 ? (b.combo + 1) % 4 : 0;
    return COMBO[b.combo];
  }
  // Keyboard players get a gentle turn towards whoever stands in front of them.
  function assist(p) {
    let best = null, bd = 1.95;
    for (const q of X.peds) {
      if (q === p || q.dead || q.removed || q.hidden || q.car) continue;
      const dx = q.x - p.x, dy = q.y - p.y; if (Math.abs(dx) > 2 || Math.abs(dy) > 2) continue;
      const d = Math.hypot(dx, dy); if (d > bd || Math.abs(wrap(Math.atan2(dy, dx) - p.th)) > 1.0) continue;
      bd = d; best = q;
    }
    return best;
  }
  function melee(sh, w, ang, mul, isP) {
    if (!S || !sh || sh.dead || sh.kind !== 'ped') return false;
    const b = bw(sh), A = act(sh);
    if (locked(sh, A)) return false;
    if (ang != null && isFinite(ang)) sh.th = ang;
    let type, side;
    const isBat = !!w && w.id === 'bat';
    if (isBat) { type = 'bat'; b.batSide = -b.batSide; side = b.batSide; }
    else if (isP) { type = playerType(sh, b); side = b.combo >= 0 ? COMBO_SIDE[b.combo] : DEF_SIDE[type]; }
    else { const r = Math.random(); type = r < 0.38 ? 'jab' : r < 0.7 ? 'cross' : r < 0.92 ? 'hook' : 'uppercut'; side = type === 'jab' ? -1 : type === 'cross' ? 1 : b.lastSide ? -b.lastSide : 1; }
    // turn to whoever stands in front (keyboard players and other modules' NPCs; a mouse aims itself) and lean
    // into the blow if they are a little out of reach
    const q = assist(sh);
    if (q) {
      const d = Math.hypot(q.x - sh.x, q.y - sh.y);
      if (!isP || (!X.input.mouseActive() && X.touch.aim == null)) sh.th = Math.atan2(q.y - sh.y, q.x - sh.x);
      if (d > 0.95 && type !== 'haymaker') { const k = Math.min(isP ? 3 : 3.5, (d - 0.9) * 7); sh.vx = (sh.vx || 0) + Math.cos(sh.th) * k; sh.vy = (sh.vy || 0) + Math.sin(sh.th) * k; }
    }
    const ok = strike(sh, type, { side, mul: isP ? mul : isBat ? mul : null });
    if (ok && isP) { sh.fireCd = A.w + A.s + A.r * 0.4; b.startF = S.frame; b.buf = 0; b.comboUntil = X.time + A.dur + OPT.comboWindow; }
    return ok;
  }

  // Without a mouse (keyboard, touch stick) the player faces where they walk, so they could never back off into
  // a kick or circle someone. While somebody is fist-fighting them close by, they square up to the nearest one;
  // sprinting breaks away.
  function squareUp(pp, b, dt) {
    let q = null;
    const W = X.WEAPONS && X.WEAPONS[P.weapon];
    if (!pp.dead && !P.car && !P.entering && P.state === 'play' && (!W || W.kind === 'melee') && !(pp.knock > 0) && X.touch.aim == null
      && !(X.input.mouseActive() && !X.touch.move) && !X.input.any('ShiftLeft', 'ShiftRight')) {
      let bd = 3.2;
      for (let i = 0, n = X.peds.length; i < n; i++) {
        const o = X.peds[i];
        if (!fighting(o) || o.ai.target !== pp || o.dead || o.removed || o.knock > 0 || (o.act && o.act.on && (o.act.type === 'knockdown' || o.act.type === 'beg'))) continue;
        const d = Math.abs(o.x - pp.x) + Math.abs(o.y - pp.y); if (d < bd) { bd = d; q = o; }
      }
    }
    if (!q) { b.lockOn = false; return; }
    if (!b.lockOn) { b.lockOn = true; b.lockTh = pp.th; }
    b.lockTh += wrap(Math.atan2(q.y - pp.y, q.x - pp.x) - b.lockTh) * Math.min(1, dt * 12);
    pp.th = pp.aim = b.lockTh;
  }

  // ================= the fallback figure (no peds.js) =================
  const coreDraw = X.drawPed;
  function fallbackDraw(ctx, p, t) {
    const b = !p.dead && !(p.knock > 0) && !p.removed ? armPose(p, t, true) : null;
    if (!b || !b.arms) {   // knocked flat: core's lying figure along the fall; anything else: core's own
      if (b && (b.body === 'fall' || b.body === 'lie') && !p.dead) { Object.assign(TMPP, p); TMPP.dead = true; TMPP.th = b.ang; return coreDraw(ctx, TMPP, t); }
      return coreDraw(ctx, p, t);
    }
    const lk = p.look || NONE, s = BODY;
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(0.06, 0.08, 0.26 * s, 0.36 * s, p.th, 0, TAU); ctx.fill();
    ctx.rotate(p.th); ctx.scale(s, s); ctx.lineCap = 'round';
    ctx.strokeStyle = lk.pants || '#333'; ctx.lineWidth = 0.15; ctx.beginPath();
    if (b.leg) { ctx.moveTo(b.hipx, b.hipy); ctx.lineTo(b.knx, b.kny); ctx.lineTo(b.kx, b.ky); ctx.moveTo(0, -b.leg * 0.1); ctx.lineTo(-0.04, -b.leg * 0.12); }
    else { const f = 0.12 * b.stance; ctx.moveTo(0, -0.1); ctx.lineTo(f, -0.12); ctx.moveTo(0, 0.1); ctx.lineTo(-f, 0.13); }
    ctx.stroke();
    ctx.strokeStyle = lk.shirt || '#888'; ctx.lineWidth = 0.13; ctx.beginPath(); ctx.moveTo(b.lsx, b.lsy); ctx.lineTo(b.lex, b.ley); ctx.lineTo(b.lx, b.ly); ctx.moveTo(b.rsx, b.rsy); ctx.lineTo(b.rex, b.rey); ctx.lineTo(b.rx, b.ry); ctx.stroke();
    ctx.save(); ctx.translate(b.lean, b.sy); ctx.rotate(b.tw); ctx.fillStyle = lk.shirt || '#888'; ctx.beginPath(); ctx.ellipse(0, 0, 0.17, 0.29, 0, 0, TAU); ctx.fill(); ctx.restore();
    if (b.bat) { ctx.strokeStyle = '#b07a3e'; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.moveTo(b.rx, b.ry); ctx.lineTo(b.rx + Math.cos(b.ba) * 0.8, b.ry + Math.sin(b.ba) * 0.8); ctx.stroke(); }
    ctx.fillStyle = lk.skin || '#e0ac7e'; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.022;
    ctx.beginPath(); ctx.arc(b.lx, b.ly, 0.075 * b.fl, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(b.rx, b.ry, 0.075 * b.fr, 0, TAU); ctx.fill(); ctx.stroke();
    const hx = 0.03 + b.lean + b.hx, hy = b.sy + b.hy;
    ctx.beginPath(); ctx.arc(hx, hy, 0.15, 0, TAU); ctx.fill();
    ctx.fillStyle = lk.hat || lk.hair || '#222'; ctx.beginPath(); ctx.arc(hx - 0.03, hy, lk.hat ? 0.15 : 0.12, 0, TAU); ctx.fill();
    if (p.hurtT > 0) { ctx.fillStyle = 'rgba(255,40,30,0.45)'; ctx.beginPath(); ctx.arc(0, 0, 0.36, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  const TMPP = {};
  fallbackDraw.owner = 'brawl';

  // ================= the fight cam =================
  // While the player is in a fist fight on foot the camera eases in a little (core's camera eases back out).
  const baseView = X.view;
  X.view = function (cw, ch, g, dpr, pad, dt) {
    if (S && X.active && !P.car && !X.scene && P.state === 'play' && !X.input.down('Tab')) {
      let near = false;
      const pp = P.ped;
      for (const f of FIGHTS) if (f.player && pp && Math.abs(f.x - pp.x) < 8 && Math.abs(f.y - pp.y) < 8) { near = true; break; }
      if (near) X.cam.span += (OPT.fightCam - X.cam.span) * Math.min(1, Math.min(0.05, dt || 0.016) * 2.6);
    }
    return baseView.apply(this, arguments);
  };

  // ================= per-frame update =================
  function update(p, dt) {
    const b = p.bw, A = p.act;
    if (p.dead) { if (A) A.on = false; b.guard = 0; b.hs = 0; b.kbx = b.kby = 0; return; }
    if (p.knock > 0 && !(A && A.on && A.type === 'knockdown')) {   // sent flying by a car or a blast: no punch survives that
      if (fighting(p) && p.knock > 0.3) { const v = Math.hypot(p.vx || 0, p.vy || 0); knockdown(p, v > 0.5 ? Math.atan2(p.vy, p.vx) : p.th + Math.PI, p.lastBy && p.lastBy.kind === 'ped' ? p.lastBy : null); }
      else if (A && A.on) { if (A.type === 'beg') endAct(p); else A.on = false; }
    }
    if (b.hs > 0) {   // hit-stop: frozen, then the knockback lands
      if (b.hsF !== S.frame) b.hs -= dt;
      if (b.hs <= 0) { b.hs = 0; p.vx = (p.vx || 0) + b.kbx; p.vy = (p.vy || 0) + b.kby; b.kbx = b.kby = 0; }
      return;
    }
    if (b.kbx || b.kby) { p.vx = (p.vx || 0) + b.kbx; p.vy = (p.vy || 0) + b.kby; b.kbx = b.kby = 0; }
    if (A && A.on) {
      A.t += dt;
      if (STRIKE[A.type] && !A.res) {
        if (A.t >= A.w + A.s * 0.3 && tryHit(p, A)) { /* landed */ }
        else if (A.t > A.w + A.s + 0.03) { A.res = 2; S.stats.misses++; }
      }
      if (A.type === 'knockdown') {
        if (!A.dust && A.t >= A.w) {   // lands on the ground
          A.dust = true;
          if (X.inView(p.x, p.y, 3)) { PG.burst(p.x + Math.cos(A.ang) * 0.4, p.y + Math.sin(A.ang) * 0.4, 'tsmoke', 4, 1.4, 0.6, 0.14); snd('fall', p.x, p.y, 1); }
        }
        if (A.t < A.w + A.s && A.t > A.w && !(p.knock > 0)) A.t = A.w + A.s;   // someone stood them up early
        if (A.t >= A.w + A.s && p.knock > 0.05 && A.hold < 2) { A.hold += dt; A.t = A.w + A.s - 0.001; }   // still sliding / held down
        if (!A.up && A.t >= A.w + A.s) { A.up = true; if (!p.isPlayer) p.th = A.ang + Math.PI; }
      }
      if (A.t >= A.dur) endAct(p);
    }
    let want;
    if (fighting(p)) want = p.ai.guard;
    else if (p.isPlayer) { const W = X.WEAPONS && X.WEAPONS[P.weapon]; want = !P.car && (!W || W.kind === 'melee') && (X.time - b.lastT < 2.4 || X.time - b.hitT < 2.4 || S.threat) ? 1 : 0; }
    else want = X.time - b.lastT < 1.5 || (A && A.on && A.type === 'block') ? 1 : 0;
    if (A && A.on && (A.type === 'knockdown' || A.type === 'beg')) want = 0;
    b.guard += (want - b.guard) * Math.min(1, dt * (want > b.guard ? 9 : 3.5));
    if (b.guard < 0.01) b.guard = 0;
  }
  // Active fights for the crowd: {x, y (the middle), a, b, player (is the player in it), t0, alive, watch}.
  function updateFights() {
    const st = S.frame;
    let threat = false;
    for (const p of X.peds) {
      const a = p.ai;
      if (!a || a.owner !== 'brawl' || p.dead || p.removed) continue;
      const tg = a.target; if (!tg || tg.removed) continue;
      const key = Math.min(p.id, tg.id) * 65536 + Math.max(p.id, tg.id);
      let f = null;
      for (const g of FIGHTS) if (g.key === key) { f = g; break; }
      if (!f) { f = { key, a: p, b: tg, x: p.x, y: p.y, t0: X.time, alive: true, stamp: st, player: !!(p.isPlayer || tg.isPlayer), watch: 0 }; FIGHTS.push(f); }
      f.stamp = st; f.x = (p.x + tg.x) / 2; f.y = (p.y + tg.y) / 2;
      if (tg.isPlayer && Math.abs(p.x - tg.x) < 4.5 && Math.abs(p.y - tg.y) < 4.5) threat = true;
    }
    let k = 0;
    for (const f of FIGHTS) { if (f.stamp === st) FIGHTS[k++] = f; else f.alive = false; }
    FIGHTS.length = k;
    S.threat = threat;
  }

  // ================= drawing =================
  function drawPow(ctx, f, view) {
    const age = f.t / f.life, pop = age < 0.15 ? 0.5 + age / 0.15 * 0.7 : 1.2 - Math.min(1, (age - 0.15) / 0.5) * 0.2;
    const px = 1 / (view.scale || 30), star = f.txt ? Math.min(1, f.t / 0.06) : 1;
    const sc = Math.max(f.s, (f.s > 0.4 ? 13 : 8) * px) * pop / 1.2;
    const al = age > 0.65 ? Math.max(0, 1 - (age - 0.65) / 0.35) : 1;
    if (f.txt) {   // the word rises above the burst
      const fs = Math.max(0.5, 15 * px) * (age < 0.12 ? 0.6 + age / 0.12 * 0.5 : 1.1 - Math.min(0.1, age * 0.2));
      ctx.save(); ctx.translate(f.x, f.y - 0.35 - Math.max(0.35, 10 * px) - age * 0.5); ctx.rotate(f.rot * 0.25); ctx.globalAlpha = al;
      ctx.font = `900 ${fs.toFixed(3)}px Bungee, Impact, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round'; ctx.lineWidth = fs * 0.28; ctx.strokeStyle = '#1b0b0b'; ctx.strokeText(f.txt, 0, 0);
      ctx.fillStyle = f.txt === 'K.O.!' ? '#ff3b2f' : '#ffcf1a'; ctx.fillText(f.txt, 0, 0);
      ctx.restore();
      if (age > 0.45) return;   // the burst itself is quick
    }
    ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot); ctx.scale(sc * star, sc * star);
    ctx.globalAlpha = f.txt ? Math.max(0, 1 - age / 0.45) : al;
    const n = 9;
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * TAU, r = i % 2 ? 0.52 + hr(f.seed, i) * 0.12 : 1 + hr(f.seed, i + 40) * 0.35; i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.fillStyle = '#ffe14a'; ctx.fill(); ctx.lineWidth = 0.13; ctx.strokeStyle = '#d4231a'; ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * TAU + 0.15, r = i % 2 ? 0.3 : 0.58; i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.restore();
  }
  function drawSpark(ctx, f) {
    const age = f.t / f.life, k = 1 - age;
    ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot); ctx.globalAlpha = k;
    ctx.strokeStyle = '#d8f0ff'; ctx.lineWidth = 0.05 * f.s; ctx.lineCap = 'round'; ctx.beginPath();
    for (let i = 0; i < 7; i++) { const a = (i - 3) * 0.42, r0 = 0.12 + age * 0.3, r1 = r0 + 0.22 * f.s * k + 0.05; ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); }
    ctx.stroke();
    ctx.strokeStyle = '#7fc8ff'; ctx.lineWidth = 0.07; ctx.beginPath(); ctx.arc(-0.12, 0, 0.3 + age * 0.15, -1.1, 1.1); ctx.stroke();
    ctx.restore();
  }
  function drawSmear(ctx, p, A) {
    const t1 = Math.min(A.t, A.w + A.s), bat = A.type === 'bat';
    let m = 0, fs0 = 1;
    for (let j = 0; j < 8; j++) {
      const tt = t1 - j * A.s / (bat ? 7 : 5);
      if (tt < A.w - A.s * (bat ? -0.2 : 0.35) || tt < 0) break;   // the bat's trail only shows the front of the swing
      limbWorld(p, A, tt, 1, HP); SX[m] = HP.x; SY[m] = HP.y;
      if (!j) fs0 = Q.fs;
      if (bat) { limbWorld(p, A, tt, 0.5, HP); TX2[m] = HP.x; TY2[m] = HP.y; }
      m++;
    }
    if (m < 2) return;
    const fade = A.t > A.w + A.s ? Math.max(0, 1 - (A.t - A.w - A.s) / 0.08) : 1;
    if (fade <= 0) return;
    if (bat) {   // the bat sweeps a pale fan
      ctx.globalAlpha = 0.12 * fade; ctx.fillStyle = '#ffffff'; ctx.beginPath();
      ctx.moveTo(SX[0], SY[0]); for (let j = 1; j < m; j++) ctx.lineTo(SX[j], SY[j]);
      for (let j = m - 1; j >= 0; j--) ctx.lineTo(TX2[j], TY2[j]);
      ctx.closePath(); ctx.fill();
    }
    const big = A.type === 'haymaker' || bat || A.type === 'kick' || A.type === 'uppercut', px = 1 / ((X.lastView && X.lastView.scale) || 30);
    // the tail starts behind the fist (foot, bat tip) so the fist itself stays a clear skin-coloured fist
    const rf = (bat ? 0.05 : LEGS[A.type] ? 0.1 * (A.type === 'stomp' ? fs0 : 1) : 0.084 * fs0) * scaleOf(p) + Math.max((big ? 2.5 : 1.8) * px, 0.015);
    let j0 = 1, d0 = 0, d1 = 0;
    for (; j0 < m; j0++) { d1 = Math.hypot(SX[j0] - SX[0], SY[j0] - SY[0]); if (d1 >= rf) break; d0 = d1; }
    if (j0 >= m) return;
    const u = d1 > d0 ? (rf - d0) / (d1 - d0) : 0;
    const hx = SX[j0 - 1] + (SX[j0] - SX[j0 - 1]) * u, hy = SY[j0 - 1] + (SY[j0] - SY[j0 - 1]) * u;
    ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round';
    for (let j = j0 - 1; j < m - 1; j++) {
      const k = 1 - j / (m - 1);
      ctx.globalAlpha = 0.6 * k * fade; ctx.lineWidth = Math.max((big ? 0.22 : 0.15) * k + 0.03, (big ? 5 : 3.6) * k * px);
      ctx.lineCap = j === j0 - 1 ? 'butt' : 'round';   // a flat start: no round cap poking into the fist
      ctx.beginPath(); if (j === j0 - 1) ctx.moveTo(hx, hy); else ctx.moveTo(SX[j], SY[j]); ctx.lineTo(SX[j + 1], SY[j + 1]); ctx.stroke();
    }
    ctx.lineCap = 'round';
    ctx.globalAlpha = 1;
  }
  function star(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, q = i % 2 ? r * 0.45 : r; i ? ctx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q) : ctx.moveTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  function dizzy(ctx, p, A, t) {
    const lying = A.t < A.w + A.s, sc = scaleOf(p);
    const hd = lying ? 0.47 * sc * 0.9 : 0.04, an = lying ? A.ang : p.th;
    const hx = p.x + Math.cos(an) * hd, hy = p.y + Math.sin(an) * hd - 0.12;
    const fade = lying ? Math.min(1, (A.t - A.w * 0.6) / 0.15) : Math.max(0, 1 - (A.t - A.w - A.s) / A.r);
    if (fade <= 0) return;
    const px = 1 / ((X.lastView && X.lastView.scale) || 30), r = Math.max(0.12, 4.5 * px), rx = Math.max(0.4, 13 * px), ry = rx * 0.45;
    ctx.globalAlpha = fade; ctx.fillStyle = '#ffe14a'; ctx.strokeStyle = '#6a3a00'; ctx.lineWidth = r * 0.25; ctx.lineJoin = 'round';
    for (let i = 0; i < 3; i++) { const a = t * 5.5 + i * TAU / 3 + p.id; star(ctx, hx + Math.cos(a) * rx, hy + Math.sin(a) * ry, r * (1 + 0.2 * Math.sin(t * 9 + i))); }
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); const a = -t * 4 + p.id; ctx.arc(hx + Math.cos(a) * rx * 0.85, hy + Math.sin(a) * ry * 0.85, r * 0.35, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ================= the module =================
  X.mod('brawl', {
    order: 42,
    init() {
      S = fresh();
      FIGHTS.length = 0;
      for (const f of FX) f.on = false;
      if (!X.drawPed.owner) X.drawPed = fallbackDraw;   // no peds.js: draw the fighters ourselves
    },
    stop() { S = null; FIGHTS.length = 0; for (const f of FX) f.on = false; },
    tick(dt) {
      if (!S) return;
      S.snd = 6;
      const pp = P.ped;
      if (pp) squareUp(pp, bw(pp), dt);
      // the player's melee: buffer a tap during a strike; core + brawl alone, punch without weapons.js
      if (pp && !pp.dead && !P.car && P.state === 'play') {
        const W = X.WEAPONS && X.WEAPONS[P.weapon], meleeIn = !W || W.kind === 'melee', b = bw(pp);
        if (meleeIn) {
          if (!X.has('weapons')) {
            if (pp.fireCd > 0) pp.fireCd -= dt;
            if (X.input.fireDown() && !(pp.fireCd > 0) && !(pp.knock > 0.1)) melee(pp, null, pp.th, 1, true);
          }
          // a tap between two frames, or a press during a strike, is kept and thrown as soon as it can be
          if (X.input.firePressed() && b.startF !== S.frame) b.buf = X.time + 0.35;
          if (b.buf > X.time && b.startF !== S.frame && !(pp.fireCd > 0) && !(pp.knock > 0.1)) {
            b.buf = 0;
            if (X.has('weapons')) X.fireWeapon(pp, P.weapon, pp.th); else melee(pp, null, pp.th, 1, true);
          }
        }
      }
      for (let i = 0, n = X.peds.length; i < n; i++) { const p = X.peds[i]; if (p.bw && !p.removed) update(p, dt); }
      for (let i = 0, n = X.peds.length; i < n; i++) {
        const p = X.peds[i];
        if (p.ai && p.ai.owner === 'brawl' && !p.removed && !p.dead && !p.car && !p.hidden) think(p, dt);
      }
      updateFights();
      fxTick(dt);
      if (S.oohT > 0) S.oohT -= dt;
      S.frame++;   // last: melee() calls from weapons.js (which ticks before us) belong to this frame
    },
    render: {
      cars(ctx, view, t) {   // cracked windows on cars someone has been punching
        if (!S) return;
        for (const c of X.cars) {
          const cr = c._bwCr; if (!cr || !cr.length || c.removed || !X.inView(c.x, c.y, c.len)) continue;
          ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.th);
          ctx.strokeStyle = c._bwBroke ? 'rgba(220,235,250,0.95)' : 'rgba(225,238,255,0.8)'; ctx.lineWidth = 0.03; ctx.lineCap = 'round';
          ctx.beginPath();
          for (const k of cr) {
            for (let i = 0; i < 6; i++) { const a = k.s + i * 1.05 + hr(k.s, i) * 0.6, r = k.r * (0.6 + hr(k.s, i + 9) * 0.6); ctx.moveTo(k.x, k.y); ctx.lineTo(k.x + Math.cos(a) * r * 0.55, k.y + Math.sin(a) * r * 0.55 + 0.02); ctx.lineTo(k.x + Math.cos(a) * r, k.y + Math.sin(a) * r); }
            ctx.moveTo(k.x + k.r * 0.35, k.y); ctx.arc(k.x, k.y, k.r * 0.35, 0, TAU);
          }
          ctx.stroke();
          ctx.restore();
        }
      },
      air(ctx, view, t) {
        if (!S) return;
        for (const f of FX) {
          if (!f.on || !X.inView(f.x, f.y, 2)) continue;
          if (f.k === 'sweat') {
            const k = 1 - f.t / f.life;
            ctx.globalAlpha = k; ctx.fillStyle = '#bfe6ff';
            ctx.beginPath(); ctx.ellipse(f.x, f.y, 0.07 * f.s, 0.04 * f.s, f.rot, 0, TAU); ctx.fill();
            ctx.globalAlpha = 1;
          } else if (f.k === 'tooth') {
            const k = Math.min(1, (f.life - f.t) / 1.2);
            ctx.globalAlpha = k;
            ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(f.x, f.y, 0.05, 0.035, 0, 0, TAU); ctx.fill();
            ctx.save(); ctx.translate(f.x, f.y - f.z * 0.35); ctx.rotate(f.rot);
            ctx.fillStyle = '#fbfbf2'; ctx.strokeStyle = '#6b6050'; ctx.lineWidth = 0.012;
            ctx.beginPath(); ctx.moveTo(-0.05, -0.035); ctx.lineTo(0.05, -0.035); ctx.lineTo(0.04, 0.035); ctx.lineTo(0.01, 0.02); ctx.lineTo(-0.01, 0.035); ctx.lineTo(-0.04, 0.035); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.restore(); ctx.globalAlpha = 1;
          } else if (f.k === 'pow' && f.t < 0.08 && f.s > 0.4) X.addLight(f.x, f.y, 3.2, '#fff0c0', 0.9);
        }
      },
      overlay(ctx, view, t) {
        if (!S) return;
        // motion smears behind fists, feet and bats
        for (let i = 0, n = X.peds.length; i < n; i++) {
          const p = X.peds[i], A = p.act;
          if (!A || !A.on || !STRIKE[A.type] || A.cos || p.dead || p.hidden || p.car || A.t < A.w || A.t > A.w + A.s + 0.08 || !X.inView(p.x, p.y, 2)) continue;
          drawSmear(ctx, p, A);
        }
        for (const f of FX) {
          if (!f.on || !f.top || !X.inView(f.x, f.y, 3)) continue;
          if (f.k === 'pow') drawPow(ctx, f, view);
          else if (f.k === 'spark') drawSpark(ctx, f);
          else if (f.k === 'ring') { const k = f.t / f.life; ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.08 * (1 - k) + 0.02; ctx.beginPath(); ctx.arc(f.x, f.y, (0.2 + k * 0.9) * f.s, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
        }
        // dizzy stars over people who went down
        for (let i = 0, n = X.peds.length; i < n; i++) {
          const p = X.peds[i], A = p.act;
          if (!A || !A.on || A.type !== 'knockdown' || p.dead || p.hidden || A.t < A.w * 0.6 || !X.inView(p.x, p.y, 2)) continue;
          dizzy(ctx, p, A, t);
        }
      },
    },
  });

  // ================= events =================
  // Melee damage dealt by somebody else's code (a module that punches without weapons.js, a mission thug):
  // still show the swing and the flinch.
  X.on('pedHurt', e => {
    if (!X.active || !S || landing || !e || !e.ped) return;
    const v = e.ped;
    if (e.kind === 'melee') {
      const att = e.by && e.by.kind === 'ped' ? e.by : null;
      if (att && !att.dead && !att.car && !att.hidden && !(att.act && att.act.on && (STRIKE[att.act.type] || LOCK[att.act.type]))) {
        if (Math.hypot(v.x - att.x, v.y - att.y) < 2.5) att.th = Math.atan2(v.y - att.y, v.x - att.x);
        strike(att, pick(COSMETIC), { cosmetic: true, side: Math.random() < 0.5 ? -1 : 1 });
      }
      if (!v.dead && !v.car && !v.hidden) {
        react(v, 'hitReact', Math.random() < 0.5 ? -0.5 : 0.5, 0.8);
        bw(v).hitT = X.time;
        const ax = att ? att.x : v.x - Math.cos(v.th), ay = att ? att.y : v.y - Math.sin(v.th), a = Math.atan2(v.y - ay, v.x - ax);
        pow(v.x - Math.cos(a) * 0.2, v.y - Math.sin(a) * 0.2, 0.26, null);
        sweat(v.x, v.y, a, 2);
        if (fighting(v) && att && v.ai.target !== att && Math.random() < 0.5) v.ai.target = att;
      }
    } else if ((e.kind === 'bullet' || e.kind === 'explosion' || e.kind === 'fire') && fighting(v) && !v.ai.gang && !v.dead) end(v, 'flee');   // fists lose to guns
  });
  X.on('pedKilled', e => {   // a fighter who dies goes back to the owner it came from (their corpse rules, mourners)
    if (!e || !e.ped) return;
    const p = e.ped;
    if (fighting(p)) end(p, 'dead');
    if (p.act) p.act.on = false;
  });
  X.on('gunfire', e => {
    if (!X.active || !S || !e) return;
    for (const p of X.peds) {
      if (!fighting(p) || p.ai.gang || p.ai.tough || p.dead) continue;
      if (Math.abs(p.x - e.x) < 18 && Math.abs(p.y - e.y) < 18 && e.by !== p) end(p, 'flee');
    }
  });
  X.on('brawlKnockdown', e => {
    if (!S || !e || S.oohT > 0) return;
    let crowd = 0;
    for (const f of FIGHTS) if (f.watch > 1 && Math.abs(f.x - e.x) < 12 && Math.abs(f.y - e.y) < 12) crowd += f.watch;
    if (crowd || (e.by && e.by.isPlayer)) { S.oohT = 1.5; snd('ooh', e.x, e.y, crowd ? 1 : 0.6); }
  });
  X.on('carRepaired', e => { if (e && e.car) { e.car._bwCr = null; e.car._bwWin = 0; e.car._bwBroke = false; } });

  // ================= public API =================
  X.brawl = {
    opts: OPT, SPEC,
    get stats() { return S ? S.stats : null; },
    strike(p, type, o) { return strike(p, type, o); },
    provoke, fight,
    stopFight(p, reason) { if (fighting(p)) end(p, reason || 'stop'); },
    armPose(p, t) { return armPose(p, t == null ? X.time : t, false); },
    isFighting(p) {
      if (!p) return false;
      if (p.isPlayer) { for (const f of FIGHTS) if (f.player) return true; return false; }
      return fighting(p);
    },
    melee,
    react(p, type, side, k) { return S && p ? react(p, type, side, k) : false; },
    knockdown(p, ang, by) { if (S && p && !p.dead) knockdown(p, ang == null ? p.th + Math.PI : ang, by); },
    fights() { return S ? FIGHTS : []; },
    // World position of a person's striking fist / foot right now (null when not striking).
    limbAt(p) { const A = p && p.act; if (!A || !A.on || !STRIKE[A.type]) return null; limbWorld(p, A, A.t, 1, HP); return { x: HP.x, y: HP.y }; },
    fx: () => FX.filter(f => f.on).map(f => f.k),
  };
})(typeof window !== 'undefined' ? (window.PG = window.PG || {}) : (globalThis.PG = globalThis.PG || {}));
