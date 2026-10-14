// Weapons & combat for Grand Theft Bus: the arsenal (fists and a bandy bat up to rockets, grenades,
// molotovs, the flamethrower and the GTA2 electro gun), X.fireWeapon for the player and every NPC (hitscan
// bullets with tracers, muzzle flashes and ejected shells, blood and sparks, rockets with smoke trails,
// thrown grenades that bounce, molotov fire pools), ammo and weapon switching, drive-bys, keyboard aim
// assist, spinning GTA2 pickup crates (weapons, health, armour, cash, power-ups, cop bribes, kill frenzies)
// and the HUD weapon icon and weapon strip. Shooters up in the air (z > 3, the police helicopter) fire past
// rooftops; water (X.extinguish) puts molotov pools out; dropped pickups merge and are capped.
(function (PG) {
  if (typeof document === 'undefined') return;
  const X = PG.gta;
  if (!X) return;
  const { cl, wrap, rand, pick, TAU } = X.util;
  const G = () => PG.game;
  const P = X.player;

  // ================= the arsenal =================
  // kind: melee | gun | flame | electro | rocket | throw. rate = seconds between shots, range m, spread rad,
  // ammo = per pickup, max = carry limit, loud = radius (m) of the 'gunfire' event and the 'shoot' crime,
  // tracer = rgb, tw = tracer width, flash = muzzle flash size, light = muzzle light colour, shell = casing colour.
  const W = X.WEAPONS = {
    fists: { name: 'Fists', slot: 1, kind: 'melee', dmg: 9, rate: 0.32, range: 1.25, cone: 0.9, knock: 3, ko: 0.6, koP: 0.45, ammo: Infinity, max: Infinity, loud: 0, price: 0, held: 'none', sfx: 'punch', desc: 'Free. Knocks people over.' },
    bat: { name: 'Bandy Bat', slot: 1, kind: 'melee', dmg: 38, rate: 0.5, range: 1.8, cone: 1.05, knock: 6.5, ko: 1.0, koP: 1, carDmg: 40, ammo: Infinity, max: Infinity, loud: 0, price: 60, held: 'bat', sfx: 'bat', desc: 'National sport. Also a national argument.' },
    pistol: { name: 'Pistol', slot: 2, kind: 'gun', dmg: 34, rate: 0.28, range: 40, spread: 0.022, ammo: 30, max: 300, loud: 34, knock: 1.6, tracer: '255,232,150', tw: 0.05, flash: 0.8, light: '#ffcf6a', shell: '#d9b04a', driveBy: true, price: 150, held: 'pistol', sfx: 'pistol', desc: 'Point, click, regret.' },
    uzi: { name: 'Uzi', slot: 3, kind: 'gun', dmg: 16, rate: 0.08, range: 32, spread: 0.085, ammo: 60, max: 500, auto: true, loud: 34, knock: 1, tracer: '255,205,110', tw: 0.045, flash: 0.7, light: '#ffc060', shell: '#d9b04a', driveBy: true, price: 300, held: 'smg', sfx: 'uzi', desc: 'Spray and pray. Mostly spray.' },
    shotgun: { name: 'Shotgun', slot: 4, kind: 'gun', pellets: 8, dmg: 14, rate: 0.8, range: 20, spread: 0.15, ammo: 12, max: 80, loud: 42, knock: 7, ko: 0.7, koP: 0.8, tracer: '255,215,140', tw: 0.035, flash: 1.3, light: '#ffb850', shell: '#c0392b', driveBy: true, carMul: 1.4, price: 400, held: 'long', sfx: 'shotgun', desc: 'Close-range customer service.' },
    rifle: { name: 'Machine Gun', slot: 5, kind: 'gun', dmg: 26, rate: 0.1, range: 48, spread: 0.04, ammo: 60, max: 400, auto: true, loud: 48, knock: 2, tracer: '255,240,170', tw: 0.06, flash: 1.0, light: '#ffd27a', shell: '#e0c060', driveBy: true, price: 900, held: 'long', sfx: 'rifle', desc: 'For when the parking warden will not listen.' },
    flamer: { name: 'Flamethrower', slot: 6, kind: 'flame', dmg: 3.4, rate: 0.05, range: 8.5, spread: 0.2, ammo: 200, max: 800, auto: true, loud: 16, carDmg: 7, light: '#ff8a30', price: 800, held: 'long', desc: 'Warms up any winter night in Bussby.' },
    electro: { name: 'Electro Gun', slot: 6, kind: 'electro', dmg: 30, rate: 0.16, range: 13, chain: 3, ammo: 50, max: 200, auto: true, loud: 18, light: '#8fd0ff', driveBy: true, price: 1200, held: 'smg', sfx: 'zap', desc: 'Hydro power, straight from the fjord.' },
    rocket: { name: 'Rocket Launcher', slot: 7, kind: 'rocket', dmg: 1100, rate: 1.0, range: 100, speed: 42, ammo: 5, max: 20, loud: 60, flash: 1.6, light: '#ffb060', driveBy: true, price: 1500, held: 'tube', sfx: 'rocket', desc: 'Solves traffic. Permanently.' },
    grenade: { name: 'Grenades', slot: 8, kind: 'throw', rate: 0.7, range: 26, fuse: 2.1, ammo: 6, max: 30, loud: 0, driveBy: true, price: 500, held: 'throw', desc: 'Pull pin. Count to two. Run.' },
    molotov: { name: 'Molotovs', slot: 9, kind: 'throw', fire: true, rate: 0.7, range: 22, ammo: 6, max: 30, loud: 0, driveBy: true, price: 350, held: 'throw', desc: 'Aquavit, rag, lighter. Do not drink it.' },
  };
  const ORDER = Object.keys(W);
  for (const id of ORDER) W[id].id = id;
  // names other modules might reasonably guess, resolved to the same specs (hidden from for..in)
  const ALIAS = { fist: 'fists', punch: 'fists', melee: 'bat', baseball: 'bat', baseballbat: 'bat', gun: 'pistol', handgun: 'pistol', revolver: 'pistol', smg: 'uzi', submachinegun: 'uzi', machinegun: 'rifle', mg: 'rifle', ak: 'rifle', ak47: 'rifle', m16: 'rifle', assault: 'rifle', assaultrifle: 'rifle', carbine: 'rifle', sniper: 'rifle', flamethrower: 'flamer', flame: 'flamer', rpg: 'rocket', rocketlauncher: 'rocket', bazooka: 'rocket', launcher: 'rocket', grenades: 'grenade', molotovs: 'molotov', molotovcocktail: 'molotov', taser: 'electro', electrogun: 'electro', electric: 'electro' };
  for (const a in ALIAS) Object.defineProperty(W, a, { value: W[ALIAS[a]], enumerable: false, configurable: true });

  const NPC_DMG = 0.5;          // NPC shots hurt half as much unless shooter.dmgMul says otherwise
  const GRAV = 16;               // thrown things: snappier than real gravity
  const AMBIENT_N = 18;
  const DROP_CAP = 36;          // dropped (timed) pickups alive at once
  const PK_LIGHTS = 14;         // pickups that glow per frame
  const SOLID_ONLY = { solids: true };
  const IGN = [null, null];
  const RC = { cars: true, peds: true, ignore: IGN, pad: 0.06 };
  const RC_AIR = { cars: true, peds: true, ignore: IGN, pad: 0.06, solids: false };
  const DIGITS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'];
  const BLOOD = ['#7a0a0c', '#a3121a', '#5c0608'];
  const ZAP = ['#dff4ff', '#8fd0ff', '#ffffff'];

  // ================= state =================
  const S = X.weapons = {
    pickups: [], projectiles: [], fires: [], power: { double: 0, fast: 0 }, frenzy: null, assist: null,
    ORDER, AMBIENT_N,
  };
  let tracers = [], flashes = [], bolts = [], swings = [];
  const SHELLS = [];
  for (let i = 0; i < 140; i++) SHELLS.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rot: 0, vr: 0, t: 0, c: '#d9b04a', big: false });
  let shellI = 0, sndBudget = 6, lastCrimeT = -9, spawnT = 0, stripT = 0, stripDirty = true, flame = null, wheelT = 0;
  const extShooters = new Set();
  let lampGrid = new Map();
  const LCELL = 32;

  const owned = id => { const a = P.inv[id]; return a === Infinity || a > 0; };
  const spec = id => (typeof id === 'string' && Object.prototype.hasOwnProperty.call(W, id) ? W[id] : null);
  const resolve = id => { const w = spec(id); return w ? w.id : null; };

  // ================= effects helpers =================
  function part(x, y, vx, vy, life, kind, size, color) {
    const ps = G().particles; if (!ps || ps.length > 900) return;
    ps.push({ x, y, vx, vy, life, max: life, kind, size, color: color || '#888', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14 });
  }
  function sparks(x, y, nx, ny, n) {
    for (let i = 0; i < n; i++) { const a = Math.atan2(ny, nx) + rand(-1.1, 1.1), s = rand(4, 11); part(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.12, 0.3), 'spark', 0.1); }
  }
  function blood(p, x, y, dx, dy, dmg, decal) {
    const n = Math.min(10, 3 + (dmg / 6 | 0));
    for (let i = 0; i < n; i++) { const s = rand(1.2, 5); part(x, y, dx * s + rand(-1.2, 1.2), dy * s + rand(-1.2, 1.2), rand(0.25, 0.55), 'debris', rand(0.07, 0.15), BLOOD[i % 3]); }
    if (decal && (!p._bt || X.time - p._bt > 0.3)) { p._bt = X.time; X.decal(p.x + dx * rand(0.5, 1.1) + rand(-0.2, 0.2), p.y + dy * rand(0.5, 1.1) + rand(-0.2, 0.2), 'blood', rand(0.22, 0.45)); }
  }
  function shake(v) { const g = G(); g.shake = Math.max(g.shake || 0, v); }
  function addTracer(x0, y0, x1, y1, w) { if (tracers.length < 120) tracers.push({ x0, y0, x1, y1, life: 0.09, max: 0.09, c: w.tracer || '255,230,150', w: w.tw || 0.05 }); }
  function addFlash(x, y, a, w) { if (flashes.length < 40) flashes.push({ x, y, a, life: 0.06, max: 0.06, s: w.flash || 0.8, c: w.light || '#ffcf6a' }); }
  function ejectShell(sh, a, w) {
    if (!w.shell || !X.inView(sh.x, sh.y, 4)) return;
    const s = SHELLS[shellI++ % SHELLS.length], rx = -Math.sin(a), ry = Math.cos(a), sp = rand(2.2, 3.6), back = rand(0, 1);
    s.on = true; s.x = sh.x + rx * 0.16; s.y = sh.y + ry * 0.16; s.z = 1.05; s.vz = rand(2, 3.4);
    s.vx = rx * sp - Math.cos(a) * back + (sh.vx || 0) * 0.5; s.vy = ry * sp - Math.sin(a) * back + (sh.vy || 0) * 0.5;
    s.rot = a; s.vr = rand(-26, 26); s.t = 0; s.c = w.shell; s.big = w.id === 'shotgun';
  }

  // ================= sound =================
  const SFX = {
    pistol(k, t, d) { k.noise(t, 0.16, 0.5, 'bandpass', 1800, { to: 380, Q: 0.8, dest: d }); k.tone('square', 230, t, 0.07, 0.12, { to: 70, lp: 1400, dest: d }); k.noise(t, 0.025, 0.35, 'highpass', 5000, { dest: d }); },
    uzi(k, t, d) { k.noise(t, 0.07, 0.36, 'bandpass', 2600, { to: 900, Q: 1, dest: d }); k.tone('square', 170, t, 0.04, 0.08, { to: 80, lp: 1200, dest: d }); },
    rifle(k, t, d) { k.noise(t, 0.13, 0.5, 'lowpass', 5200, { to: 480, dest: d }); k.tone('sawtooth', 130, t, 0.08, 0.14, { to: 50, lp: 900, dest: d }); k.noise(t, 0.02, 0.3, 'highpass', 6000, { dest: d }); },
    shotgun(k, t, d) {
      k.noise(t, 0.42, 0.75, 'lowpass', 3500, { to: 140, dest: d }); k.tone('sine', 110, t, 0.3, 0.5, { to: 36, dest: d });
      k.noise(t + 0.34, 0.05, 0.22, 'bandpass', 1500, { Q: 4, dest: d }); k.noise(t + 0.47, 0.05, 0.22, 'bandpass', 1050, { Q: 4, dest: d });
    },
    rocket(k, t, d) { k.noise(t, 0.6, 0.45, 'bandpass', 500, { to: 2400, Q: 1.2, dest: d }); k.tone('sawtooth', 90, t, 0.25, 0.1, { to: 300, lp: 800, dest: d }); k.noise(t, 0.08, 0.5, 'lowpass', 1500, { dest: d }); },
    zap(k, t, d) { k.tone('sawtooth', 70, t, 0.14, 0.12, { to: 160, lp: 3200, dest: d }); k.noise(t, 0.14, 0.3, 'bandpass', 3500, { Q: 6, dest: d }); k.tone('square', 1900, t, 0.05, 0.03, { to: 600, lp: 5000, dest: d }); },
    throw(k, t, d) { k.noise(t, 0.2, 0.2, 'bandpass', 800, { to: 2400, Q: 2, dest: d }); },
    pin(k, t, d) { k.tone('sine', 2900, t, 0.03, 0.08, { dest: d }); k.tone('sine', 2300, t + 0.05, 0.03, 0.06, { dest: d }); },
    clink(k, t, d) { k.tone('triangle', rand(1900, 2500), t, 0.06, 0.07, { dest: d }); },
    glass(k, t, d) { k.noise(t, 0.25, 0.35, 'highpass', 4000, { dest: d }); for (let i = 0; i < 5; i++) k.tone('sine', rand(2800, 6000), t + Math.random() * 0.15, 0.06, 0.04, { dest: d }); },
    whoomp(k, t, d) { k.noise(t, 0.7, 0.55, 'lowpass', 700, { to: 140, attack: 0.04, dest: d }); k.tone('sine', 80, t, 0.5, 0.3, { to: 40, attack: 0.03, dest: d }); },
    punch(k, t, d) { k.tone('sine', 150, t, 0.09, 0.4, { to: 55, dest: d }); k.noise(t, 0.05, 0.3, 'lowpass', 1200, { dest: d }); },
    bat(k, t, d) { k.tone('triangle', 420, t, 0.07, 0.2, { to: 190, dest: d }); k.noise(t, 0.1, 0.45, 'bandpass', 900, { Q: 1.5, dest: d }); k.tone('sine', 120, t, 0.1, 0.3, { to: 60, dest: d }); },
    swish(k, t, d) { k.noise(t, 0.12, 0.12, 'bandpass', 1500, { to: 600, Q: 3, dest: d }); },
    clang(k, t, d) { for (const f of [620, 935, 1480]) k.tone('triangle', f, t, 0.25, 0.07, { dest: d }); k.noise(t, 0.05, 0.3, 'bandpass', 2500, { Q: 2, dest: d }); },
    flesh(k, t, d) { k.noise(t, 0.06, 0.35, 'lowpass', 900, { to: 250, dest: d }); k.tone('sine', 95, t, 0.06, 0.25, { to: 60, dest: d }); },
    tink(k, t, d) { k.tone('square', rand(3000, 4000), t, 0.03, 0.025, { lp: 6000, dest: d }); },
    ricochet(k, t, d) { k.tone('sine', rand(2200, 3000), t, 0.2, 0.05, { to: 1100, dest: d }); },
    dry(k, t, d) { k.tone('square', 1800, t, 0.02, 0.05, { lp: 4000, dest: d }); },
    switch(k, t, d) { k.noise(t, 0.04, 0.2, 'bandpass', 2400, { Q: 5, dest: d }); k.noise(t + 0.07, 0.03, 0.2, 'bandpass', 1600, { Q: 5, dest: d }); },
    pick(k, t, d) { [660, 880, 1320].forEach((f, i) => k.tone('square', f, t + i * 0.06, 0.08, 0.05, { lp: 3500, dest: d })); },
    cash(k, t, d) { k.tone('triangle', 1568, t, 0.1, 0.1, { dest: d }); k.tone('triangle', 2093, t + 0.08, 0.3, 0.1, { dest: d }); k.noise(t, 0.05, 0.2, 'highpass', 6000, { dest: d }); },
    heal(k, t, d) { [523, 659, 784, 1047].forEach((f, i) => k.tone('sine', f, t + i * 0.05, 0.15, 0.08, { dest: d })); },
    power(k, t, d) { k.tone('sawtooth', 220, t, 0.5, 0.08, { to: 880, lp: 2500, dest: d }); k.tone('square', 440, t + 0.1, 0.4, 0.05, { to: 1760, lp: 3000, dest: d }); },
    frenzy(k, t, d) { for (let i = 0; i < 4; i++) k.tone('sawtooth', [196, 233, 196, 294][i], t + i * 0.13, 0.12, 0.1, { lp: 1600, dest: d }); },
  };
  function sfx(name, x, y, vol) {
    if (sndBudget <= 0 || !SFX[name]) return;
    const k = PG.audio.kit(); if (!k) return;
    let v = (vol == null ? 1 : vol) * 0.6, pan = 0;
    if (x != null) { const c = X.cam, dx = x - c.x, dy = y - c.y; v *= cl(1.15 - Math.hypot(dx, dy) / 70, 0, 1); pan = cl(dx / 30, -1, 1); }
    if (v < 0.04) return;
    sndBudget--;
    const g = k.gain(v);
    let dest = g.node;
    if (k.ctx.createStereoPanner && pan) { const sp = k.ctx.createStereoPanner(); sp.pan.value = pan; sp.connect(g.node); dest = sp; }
    SFX[name](k, k.now, dest);
  }
  // The flamethrower's hiss is a loop: on while the trigger is held, gone on release, pause, stop or mute.
  function flameOn() {
    const k = PG.audio.kit();
    if (!k) { flameStop(); return; }
    if (!flame) {
      const src = k.ctx.createBufferSource(); src.buffer = k.noiseBuf; src.loop = true;
      const f = k.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 650; f.Q.value = 0.55;
      const g = k.gain(0); src.connect(f); f.connect(g.node); src.start();
      const lfo = k.ctx.createOscillator(), lg = k.ctx.createGain(); lfo.frequency.value = 13; lg.gain.value = 260; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
      flame = { src, lfo, g, ctx: k.ctx, on: 0 };
    }
    flame.g.gain.setTargetAtTime(0.34, k.now, 0.04);
    flame.on = X.time;
  }
  function flameStop() {
    if (!flame) return;
    const f = flame; flame = null;
    try { const t = f.ctx.currentTime; f.g.gain.cancelScheduledValues(t); f.g.gain.setTargetAtTime(0, t, 0.03); f.src.stop(t + 0.2); f.lfo.stop(t + 0.2); } catch (e) { /* already stopped */ }
  }

  // ================= damage application =================
  function hitPed(p, dmg, by, dx, dy, w, hx, hy, kind) {
    const was = p.dead;
    X.damagePed(p, dmg, by, kind);
    // knockback raises the speed along the shot up to k (pellets of one blast do not stack)
    const k = (w.knock || 1.5) * (p.dead ? 1.6 : 1), along = (p.vx || 0) * dx + (p.vy || 0) * dy;
    if (along < k) { p.vx = (p.vx || 0) + dx * (k - along); p.vy = (p.vy || 0) + dy * (k - along); }
    if (p.dead && !was) { p.knock = Math.max(p.knock || 0, 0.45 + k * 0.05); p.spin = rand(-6, 6); }
    else if (!p.dead && w.ko && Math.random() < (w.koP == null ? 1 : w.koP)) { p.knock = Math.max(p.knock || 0, w.ko); p.spin = rand(-8, 8); }
    if (kind !== 'melee' || w.id !== 'fists' || p.dead) blood(p, hx, hy, dx, dy, dmg, kind !== 'melee' || p.dead || w.id === 'bat');
    if (kind === 'bullet' && by === P.ped) sfx('flesh', hx, hy, 0.7);
  }
  // Shooting (or clubbing, frying, torching) a police car is a crime even when nobody stands near it.
  function copCar(c, by, x, y, w) {
    if (c.wrecked || !X.byPlayer(by) || !(c.model.kind === 'police' || c.model.kind === 'swat' || c.owner === 'police')) return;
    if (c._copT != null && X.time - c._copT < 1 && X.time >= c._copT) return;
    c._copT = X.time;
    X.crime('hitCopCar', x, y, { car: c, weapon: w.id });
  }
  function hitCar(c, dmg, by, dx, dy, w, hx, hy) {
    copCar(c, by, hx, hy, w);
    X.damageCar(c, dmg * (w.carMul || 1.25), by, w.kind === 'melee' ? 'melee' : 'bullet');
    sparks(hx, hy, -dx, -dy, 4);
    if (c.dv && w.knock > 3) { const m = (c.dv.dyn && c.dv.dyn.mTot) || 1500; c.dv.vx += dx * w.knock * 90 / m; c.dv.vy += dy * w.knock * 90 / m; }
    if (!c._gt || X.time - c._gt > 0.7) { c._gt = X.time; if (Math.random() < 0.4) X.decal(hx + rand(-0.3, 0.3), hy + rand(-0.3, 0.3), 'glass', 0.5); sfx('tink', hx, hy, 0.8); }
  }
  // Burn a ped or car: the damage module owns burning when present; otherwise a small fallback here.
  function ignite(e, s, by) {
    if (!e || e.removed || (e.kind === 'ped' && e.car)) return;
    if (e._ignT && X.time - e._ignT < 0.3) return;
    e._ignT = X.time; e.fireBy = by;
    if (X.setOnFire) { X.setOnFire(e, s, by); return; }
    if (e.kind === 'ped') { if (!(e.onFire > 0)) X.emit('onFire', { ent: e, by }); e.onFire = Math.max(e.onFire || 0, s); e._fireBy = by; }
  }
  function burnFallback(dt) {
    if (X.setOnFire) return;
    for (const p of X.peds) {
      if (!(p.onFire > 0) || p.removed) continue;
      p.onFire = Math.max(0, p.onFire - dt);
      if (!p.dead && !p.car) {
        p._fireAcc = (p._fireAcc || 0) + 15 * dt;
        if (p._fireAcc >= 5) { const a = p._fireAcc; p._fireAcc = 0; X.damagePed(p, a, p._fireBy || null, 'fire'); }
      }
      if (!p.hidden && Math.random() < dt * 24) part(p.x + rand(-0.25, 0.25), p.y + rand(-0.25, 0.25), rand(-0.6, 0.6), rand(-0.6, 0.6), rand(0.3, 0.6), 'fire', rand(0.14, 0.3));
    }
  }
  // Water (the fire truck's cannon, burst hydrants) puts out molotov pools too: wrap the damage module's
  // X.extinguish, or stand in for it (burning people only) when it is absent.
  const baseExtinguish = X.extinguish;
  X.extinguish = function (a, b, r) {
    let n = baseExtinguish ? baseExtinguish.apply(this, arguments) || 0 : 0;
    if (!X.active) return n;
    if (a && typeof a === 'object') {
      if (!baseExtinguish && a.kind === 'ped' && a.onFire > 0) { a.onFire = 0; n++; }
      return n;
    }
    if (!isFinite(a) || !isFinite(b)) return n;
    const R = r || 2;
    for (const f of S.fires) {
      if (f.life <= 0.3 || Math.abs(f.x - a) > R + f.r || Math.abs(f.y - b) > R + f.r || Math.hypot(f.x - a, f.y - b) > R + f.r) continue;
      f.life = 0.3; n++;
      if (X.inView(f.x, f.y, 4)) for (let i = 0; i < 5; i++) part(f.x + rand(-f.r, f.r) * 0.6, f.y + rand(-f.r, f.r) * 0.6, rand(-0.5, 0.5), rand(-1.2, -0.3), rand(0.8, 1.4), 'tsmoke', rand(0.35, 0.6));
    }
    if (!baseExtinguish) for (const p of X.peds) if (p.onFire > 0 && Math.abs(p.x - a) < R + 1 && Math.abs(p.y - b) < R + 1 && Math.hypot(p.x - a, p.y - b) < R + p.r) { p.onFire = 0; n++; }
    return n;
  };
  function peopleNear(x, y, r) {
    for (const p of X.peds) if (!p.isPlayer && !p.dead && !p.removed && !p.hidden && Math.abs(p.x - x) < r && Math.abs(p.y - y) < r && Math.hypot(p.x - x, p.y - y) < r) return true;
    const r2 = r * 0.7;
    for (const c of X.cars) if (!c.removed && c !== P.car && (c.npcDriver || (c.driver && !c.driver.isPlayer)) && Math.abs(c.x - x) < r2 && Math.abs(c.y - y) < r2) return true;
    return false;
  }
  // Gunfire scares people and draws the police; the player's shots near people are a crime.
  function report(sh, w, x, y, radius) {
    const r = radius || w.loud; if (!r) return;
    if (!sh._gf || X.time - sh._gf > 0.3 || sh._gf > X.time) { sh._gf = X.time; X.emit('gunfire', { x, y, by: sh, weapon: w.id, radius: r }); }
    if (X.byPlayer(sh) && X.time - lastCrimeT > 1.0 && peopleNear(x, y, r)) { lastCrimeT = X.time; X.crime('shoot', x, y, { weapon: w.id }); }
  }

  // Street lamps break when a bullet passes through the lamp head.
  function buildLampGrid() {
    lampGrid = new Map();
    for (const l of X.city.lamps) {
      const hx = l.x + l.nx * 1.2, hy = l.y + l.ny * 1.2, k = Math.floor(hx / LCELL) * 4096 + Math.floor(hy / LCELL);
      let a = lampGrid.get(k); if (!a) lampGrid.set(k, a = []); a.push(l);
    }
  }
  function lampsOnSegment(x0, y0, x1, y1, by) {
    if (X.scene) return;
    const gx0 = Math.floor(Math.min(x0, x1) / LCELL), gx1 = Math.floor(Math.max(x0, x1) / LCELL), gy0 = Math.floor(Math.min(y0, y1) / LCELL), gy1 = Math.floor(Math.max(y0, y1) / LCELL);
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
    for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) {
      const a = lampGrid.get(gx * 4096 + gy); if (!a) continue;
      for (const l of a) {
        if (l.broken) continue;
        const hx = l.x + l.nx * 1.2, hy = l.y + l.ny * 1.2;
        const t = cl(((hx - x0) * dx + (hy - y0) * dy) / L2, 0, 1), qx = x0 + dx * t - hx, qy = y0 + dy * t - hy;
        if (qx * qx + qy * qy > 0.09) continue;
        l.broken = true;
        X.decal(hx + rand(-0.4, 0.4), hy + rand(-0.4, 0.4), 'glass', 0.9);
        sparks(hx, hy, dx, dy, 10); part(hx, hy, 0, 0, 0.4, 'smoke', 0.25);
        sfx('glass', hx, hy, 0.7);
        X.emit('lampBroken', { lamp: l, by: by || null });
      }
    }
  }

  // ================= firing =================
  // One shot from a ped (or any {x, y, th, owner} shooter). o (optional): {dist} for throws.
  X.fireWeapon = function (shooter, id, angle, o) {
    if (!X.active || !shooter || shooter.dead || shooter.removed) return false;
    const isP = shooter === P.ped;
    let w = spec(id);
    if (!w) { if (isP) return false; w = W.pistol; }
    if (shooter.fireCd > 0) return false;
    if (isP && (P.state !== 'play' || !owned(w.id))) return false;
    if (angle == null || !isFinite(angle)) angle = shooter.aim != null ? shooter.aim : shooter.th || 0;
    shooter.fireCd = w.rate * (isP && S.power.fast > 0 ? 0.5 : 1) * (shooter.rateMul || 1);
    if (shooter.kind !== 'ped') extShooters.add(shooter);
    const car = shooter.car && !shooter.car.removed ? shooter.car : null;
    const ca = Math.cos(angle), sa = Math.sin(angle);
    let mx, my;
    if (car) {   // out of the window on the aim side
      const la = angle - car.th, lx = Math.abs(Math.cos(la)), ly = Math.abs(Math.sin(la));
      const r = Math.min(lx > 1e-3 ? car.len / 2 / lx : 99, ly > 1e-3 ? car.wid / 2 / ly : 99) + 0.25;
      mx = car.x + ca * r; my = car.y + sa * r;
    } else { mx = shooter.x + ca * 0.62 - sa * 0.06; my = shooter.y + sa * 0.62 + ca * 0.06; }
    const mul = isP ? (S.power.double > 0 ? 2 : 1) : (shooter.dmgMul != null ? shooter.dmgMul : NPC_DMG);
    const inacc = isP ? 0 : (shooter.inaccuracy != null ? shooter.inaccuracy : 0.05);
    const by = shooter;
    // a shooter up in the air (the police helicopter's door gunner) fires down past the rooftops
    const air = !car && shooter.z > 3;
    switch (w.kind) {
      case 'melee': melee(shooter, w, angle, mul, isP); break;
      case 'gun': {
        const n = w.pellets || 1;
        for (let k = 0; k < n; k++) bullet(shooter, w, mx, my, angle + (Math.random() - Math.random()) * (w.spread + inacc), mul, car, air);
        addFlash(mx, my, angle, w);
        if (!car && !air) ejectShell(shooter, angle, w);
        sfx(w.sfx, mx, my);
        if (isP) shake(w.id === 'shotgun' ? 0.09 : 0.025);
        break;
      }
      case 'flame': flameShot(shooter, w, angle, mx, my, mul, car, isP); break;
      case 'electro': electroShot(shooter, w, angle, mx, my, mul, car); break;
      case 'rocket': {
        const cv = car ? X.carVel(car) : null;
        if (S.projectiles.length < 80) S.projectiles.push({ kind: 'rocket', x: mx, y: my, z: 1, vx: ca * w.speed + (cv ? cv.x : 0), vy: sa * w.speed + (cv ? cv.y : 0), th: angle, t: 0, by, car, w, mul, trail: 0 });
        addFlash(mx, my, angle, w);
        for (let i = 0; i < 6; i++) part(shooter.x - ca * 0.7, shooter.y - sa * 0.7, -ca * rand(2, 6) + rand(-1, 1), -sa * rand(2, 6) + rand(-1, 1), rand(0.6, 1.1), 'smoke', rand(0.25, 0.4));
        sfx('rocket', mx, my);
        if (isP) shake(0.12);
        break;
      }
      case 'throw': {
        const dist = cl(o && o.dist != null ? o.dist : shooter.throwDist || 14, 2, w.range);
        const T = 0.45 + dist / 32, z0 = car ? 1.3 : 1.2, vh = dist / T, vz = (GRAV * T * T / 2 - z0) / T;
        const cv = car ? X.carVel(car) : null;
        if (S.projectiles.length < 80) S.projectiles.push({ kind: w.id, x: mx, y: my, z: z0, vx: ca * vh + (cv ? cv.x : 0), vy: sa * vh + (cv ? cv.y : 0), vz, th: angle, t: 0, by, car, w, mul, rot: angle, vr: rand(9, 15) * (Math.random() < 0.5 ? -1 : 1), fuse: w.fuse || 3, maxZ: z0 });
        sfx('throw', mx, my); if (w.id === 'grenade') sfx('pin', mx, my, 0.7);
        break;
      }
    }
    if (isP && w.ammo !== Infinity) {
      P.inv[w.id] -= 1;
      if (P.inv[w.id] <= 0) { delete P.inv[w.id]; sfx('dry', mx, my); X.popup(w.name + ': empty'); }
    }
    report(shooter, w, mx, my);
    return true;
  };

  function bullet(sh, w, mx, my, a, mul, car, air) {
    const dx = Math.cos(a), dy = Math.sin(a), R = w.range, x0 = car ? car.x : sh.x, y0 = car ? car.y : sh.y;
    IGN[0] = sh; IGN[1] = car || sh;
    const hit = X.raycast(x0, y0, x0 + dx * R, y0 + dy * R, air ? RC_AIR : RC);
    const d = hit ? hit.t * R : R, ex = x0 + dx * d, ey = y0 + dy * d;
    const md = (mx - x0) * dx + (my - y0) * dy;
    if (d > md + 0.05) addTracer(mx, my, ex, ey, w);
    if (!air) lampsOnSegment(x0, y0, ex, ey, sh);
    if (!hit) return;
    const fall = w.pellets ? cl(1.25 - d / R, 0.25, 1) : d > R * 0.7 ? 0.75 : 1;
    if (hit.kind === 'ped') hitPed(hit.obj, w.dmg * mul * fall, sh, dx, dy, w, ex, ey, 'bullet');
    else if (hit.kind === 'car') hitCar(hit.obj, w.dmg * mul * fall, sh, dx, dy, w, ex, ey);
    else {
      const bx = ex - dx * 0.06, by = ey - dy * 0.06;
      sparks(bx, by, -dx, -dy, 3); part(bx, by, -dx * 0.8, -dy * 0.8, rand(0.3, 0.5), 'smoke', rand(0.08, 0.14));
      if (hit.obj.prop && X.hitProp) X.hitProp(hit.obj, w.dmg * mul * fall, sh, 'bullet');   // barrels, gas cans (damage.js)
      else if (Math.random() < 0.25) sfx('ricochet', bx, by, 0.6);
    }
  }

  function melee(sh, w, ang, mul, isP) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    let best = null, bd = 1e9;
    for (const p of X.peds) {
      if (p === sh || p.dead || p.removed || p.hidden || p.car) continue;
      const dx = p.x - sh.x, dy = p.y - sh.y; if (Math.abs(dx) > 3 || Math.abs(dy) > 3) continue;
      const d = Math.hypot(dx, dy); if (d > w.range + p.r) continue;
      const da = Math.abs(wrap(Math.atan2(dy, dx) - ang)); if (da > w.cone && d > 0.55) continue;
      const sc = d + da * 0.6; if (sc < bd) { bd = sc; best = p; }
    }
    if (swings.length < 20) swings.push({ x: sh.x, y: sh.y, a: ang, life: 0.16, max: 0.16, r: w.range * 0.85, bat: w.id === 'bat' });
    if (best && !X.raycast(sh.x, sh.y, best.x, best.y, SOLID_ONLY)) {
      const d = Math.hypot(best.x - sh.x, best.y - sh.y) || 1, dx = (best.x - sh.x) / d, dy = (best.y - sh.y) / d;
      hitPed(best, w.dmg * mul, sh, dx, dy, w, best.x - dx * 0.2, best.y - dy * 0.2, 'melee');
      sfx(w.sfx, best.x, best.y);
      if (isP) { shake(w.id === 'bat' ? 0.08 : 0.04); if (!best.isPlayer) X.crime('assault', best.x, best.y, { ped: best, weapon: w.id }); }
      return;
    }
    if (w.carDmg) {
      const hx = sh.x + ca * 1.1, hy = sh.y + sa * 1.1;
      const prop = X.hitProp && X.blocked(hx, hy, 0.35);
      if (prop && prop.prop) { X.hitProp(prop, w.carDmg * mul, sh, 'melee'); sparks(hx, hy, -ca, -sa, 6); sfx('clang', hx, hy); return; }
      for (const c of X.cars) {
        if (c.removed || c === sh.car || Math.abs(c.x - hx) > c.len || Math.abs(c.y - hy) > c.len) continue;
        if (!X.circlePoly(hx, hy, 0.35, X.carPoly(c))) continue;
        copCar(c, sh, hx, hy, w);
        X.damageCar(c, w.carDmg * mul, sh, 'melee'); sparks(hx, hy, -ca, -sa, 6); sfx('clang', hx, hy);
        if (Math.random() < 0.3) X.decal(hx, hy, 'glass', 0.4);
        if (isP) shake(0.06);
        return;
      }
    }
    sfx('swish', sh.x, sh.y, 0.8);
  }

  function flameShot(sh, w, ang, mx, my, mul, car, isP) {
    const x0 = car ? car.x : sh.x, y0 = car ? car.y : sh.y, ca = Math.cos(ang), sa = Math.sin(ang);
    const wall = X.raycast(x0, y0, x0 + ca * w.range, y0 + sa * w.range, SOLID_ONLY);
    const reach = Math.max(0.6, wall ? wall.t * w.range - 0.2 : w.range);
    if (wall && wall.obj.prop && X.hitProp) X.hitProp(wall.obj, w.dmg * 2 * mul, sh, 'fire');
    const cv = car ? X.carVel(car) : { x: sh.vx || 0, y: sh.vy || 0 };
    for (let k = 0; k < 3; k++) {
      const a = ang + (Math.random() - Math.random()) * w.spread * 0.55, sp = Math.min(20, reach / 0.42) * rand(0.7, 1.05);
      part(mx, my, Math.cos(a) * sp + cv.x, Math.sin(a) * sp + cv.y, rand(0.35, 0.5), 'fire', rand(0.22, 0.42));
    }
    if (Math.random() < 0.3) part(mx + ca * reach * 0.8, my + sa * reach * 0.8, ca * 2 + rand(-1, 1), sa * 2 + rand(-1, 1), rand(0.7, 1.2), 'smoke', rand(0.3, 0.5));
    for (const p of X.peds) {
      if (p === sh || p.dead || p.removed || p.hidden || p.car) continue;
      const dx = p.x - x0, dy = p.y - y0; if (Math.abs(dx) > reach + 1 || Math.abs(dy) > reach + 1) continue;
      const d = Math.hypot(dx, dy); if (d > reach + 0.4) continue;
      if (Math.abs(wrap(Math.atan2(dy, dx) - ang)) > 0.22 + 0.5 / Math.max(1, d)) continue;
      X.damagePed(p, w.dmg * mul, sh, 'fire'); ignite(p, 4, sh);
    }
    for (const c of X.cars) {
      if (c === car || c.removed || Math.abs(c.x - x0) > reach + c.len || Math.abs(c.y - y0) > reach + c.len) continue;
      const poly = X.carPoly(c);
      for (let s = 1; s <= reach; s += 1) if (X.circlePoly(x0 + ca * s, y0 + sa * s, 0.4, poly)) { copCar(c, sh, c.x, c.y, w); X.damageCar(c, w.carDmg * mul, sh, 'fire'); if (Math.random() < 0.08) ignite(c, 6, sh); break; }
    }
    if (Math.random() < 0.12) addFire(x0 + ca * reach * 0.9, y0 + sa * reach * 0.9, 0.9, 1.6, sh, true);
    if (isP) flameOn();
  }

  function electroShot(sh, w, ang, mx, my, mul, car) {
    const x0 = car ? car.x : sh.x, y0 = car ? car.y : sh.y;
    const pts = [mx, my], hitList = [];
    let from = { x: x0, y: y0 }, first = true;
    for (let k = 0; k <= w.chain; k++) {
      let best = null, bs = 1e9;
      for (const p of X.peds) {
        if (p === sh || p.dead || p.removed || p.hidden || p.car || hitList.includes(p)) continue;
        const dx = p.x - from.x, dy = p.y - from.y; if (Math.abs(dx) > w.range || Math.abs(dy) > w.range) continue;
        const d = Math.hypot(dx, dy); if (d > (first ? w.range : 6)) continue;
        const da = first ? Math.abs(wrap(Math.atan2(dy, dx) - ang)) : 0; if (da > 0.45) continue;
        const sc = d + da * 12; if (sc < bs && !X.raycast(from.x, from.y, p.x, p.y, SOLID_ONLY)) { bs = sc; best = p; }
      }
      if (!best && first) {   // no person in reach: arc into a car
        for (const c of X.cars) {
          if (c === car || c.removed || c.wrecked) continue;
          const dx = c.x - x0, dy = c.y - y0, d = Math.hypot(dx, dy); if (d > w.range) continue;
          if (Math.abs(wrap(Math.atan2(dy, dx) - ang)) > 0.35) continue;
          if (d < bs) { bs = d; best = c; }
        }
      }
      if (!best) break;
      hitList.push(best);
      if (best.kind === 'car') { copCar(best, sh, best.x, best.y, w); X.damageCar(best, 45 * mul, sh, 'electro'); sparks(best.x, best.y, 0, -1, 8); }
      else {
        X.damagePed(best, w.dmg * mul * (first ? 1 : 0.75), sh, 'electro');
        best.knock = Math.max(best.knock || 0, 0.7); best.spin = rand(-10, 10);
        for (let i = 0; i < 6; i++) part(best.x, best.y, rand(-5, 5), rand(-5, 5), rand(0.1, 0.25), 'debris', 0.08, ZAP[i % 3]);
      }
      pts.push(best.x, best.y); from = best; first = false;
      if (best.kind === 'car') break;
    }
    if (pts.length === 2) {
      const wall = X.raycast(x0, y0, x0 + Math.cos(ang) * w.range * 0.6, y0 + Math.sin(ang) * w.range * 0.6, SOLID_ONLY);
      const d = wall ? wall.t * w.range * 0.6 : w.range * 0.6;
      pts.push(x0 + Math.cos(ang) * d, y0 + Math.sin(ang) * d);
    }
    if (bolts.length < 12) bolts.push({ pts, life: 0.13, max: 0.13 });
    sfx('zap', mx, my);
  }

  // ================= projectiles =================
  // The explosion crime is reported once: by X.explode if the installed one does (damage.js), else here.
  let boomCrime = false;
  X.on('crime', e => { if (e.type === 'explosion') boomCrime = true; });
  function detonate(pr, x, y, power) {
    boomCrime = false;
    X.explode(x, y, { by: pr.by, power: power || 1, source: pr.kind });
    if (!X.has('damage')) X.decal(x, y, 'scorch', 2.4 * (power || 1));
    if (!boomCrime && X.byPlayer(pr.by)) X.crime('explosion', x, y, { weapon: pr.kind });
  }
  function shatter(pr) {
    pr.dead = true;
    addFire(pr.x, pr.y, 2.5, 7, pr.by, false);
    X.decal(pr.x, pr.y, 'glass', 0.8);
    for (let i = 0; i < 26; i++) { const a = Math.random() * TAU, s = rand(1, 6); part(pr.x, pr.y, Math.cos(a) * s, Math.sin(a) * s, rand(0.4, 0.9), 'fire', rand(0.3, 0.6)); }
    sfx('glass', pr.x, pr.y); sfx('whoomp', pr.x, pr.y);
    report(pr.by, W.molotov, pr.x, pr.y, 20);
    X.emit('molotov', { x: pr.x, y: pr.y, by: pr.by });
  }
  function stepRocket(r, dt) {
    const nx = r.x + r.vx * dt, ny = r.y + r.vy * dt;
    IGN[0] = r.by; IGN[1] = r.car || r.by;
    const hit = X.raycast(r.x, r.y, nx, ny, RC);
    r.trail -= dt;
    if (r.trail <= 0) {
      r.trail = 0.018;
      const bx = r.x - Math.cos(r.th) * 0.5, by = r.y - Math.sin(r.th) * 0.5;
      part(bx, by, rand(-0.6, 0.6), rand(-0.6, 0.6), rand(0.7, 1.3), 'smoke', rand(0.18, 0.32));
      part(bx, by, -r.vx * 0.08 + rand(-1, 1), -r.vy * 0.08 + rand(-1, 1), rand(0.06, 0.14), 'fire', rand(0.15, 0.28));
    }
    if (hit) {
      const sp = Math.hypot(r.vx, r.vy) || 1, hx = hit.x - r.vx / sp * 0.2, hy = hit.y - r.vy / sp * 0.2;
      if (hit.kind === 'car') X.damageCar(hit.obj, r.w.dmg * r.mul, r.by, 'explosion');
      else if (hit.kind === 'ped') X.damagePed(hit.obj, 150 * r.mul, r.by, 'explosion');
      r.dead = true; detonate(r, hx, hy, 1.1); return;
    }
    r.x = nx; r.y = ny; r.t += dt;
    if (r.t > r.w.range / r.w.speed) { r.dead = true; detonate(r, r.x, r.y, 1.1); }
  }
  function stepThrown(pr, dt) {
    pr.t += dt;
    const mol = pr.kind === 'molotov';
    let nx = pr.x + pr.vx * dt, ny = pr.y + pr.vy * dt;
    if (X.blocked(nx, pr.y, 0.12)) { if (mol) return shatter(pr); pr.vx = -pr.vx * 0.45; nx = pr.x; if (Math.abs(pr.vx) > 1.5) sfx('clink', pr.x, pr.y, 0.6); }
    if (X.blocked(nx, ny, 0.12)) { if (mol) return shatter(pr); pr.vy = -pr.vy * 0.45; ny = pr.y; if (Math.abs(pr.vy) > 1.5) sfx('clink', pr.x, pr.y, 0.6); }
    if (pr.z < 1.5) {
      for (const c of X.cars) {
        if (c.removed || (c === pr.car && pr.t < 0.5) || Math.abs(c.x - nx) > c.len || Math.abs(c.y - ny) > c.len) continue;
        const m = X.circlePoly(nx, ny, 0.14, X.carPoly(c)); if (!m) continue;
        if (mol) { pr.x = nx; pr.y = ny; return shatter(pr); }
        const vn = pr.vx * m.nx + pr.vy * m.ny;
        if (vn < 0) { pr.vx -= 1.5 * vn * m.nx; pr.vy -= 1.5 * vn * m.ny; pr.vx *= 0.6; pr.vy *= 0.6; sfx('clink', nx, ny, 0.7); }
        nx += m.x; ny += m.y;
      }
      if (mol) for (const p of X.peds) {
        if (p === pr.by || p.dead || p.removed || p.hidden || p.car || Math.abs(p.x - nx) > 0.6 || Math.abs(p.y - ny) > 0.6) continue;
        if (Math.hypot(p.x - nx, p.y - ny) < p.r + 0.15) { pr.x = nx; pr.y = ny; return shatter(pr); }
      }
    }
    pr.x = nx; pr.y = ny;
    pr.vz -= GRAV * dt; pr.z += pr.vz * dt; pr.maxZ = Math.max(pr.maxZ, pr.z);
    if (pr.z <= 0) {
      pr.z = 0;
      if (mol) return shatter(pr);
      if (pr.vz < -1.5) { pr.vz = -pr.vz * 0.32; sfx('clink', pr.x, pr.y, 0.8); } else pr.vz = 0;
      pr.vx *= 0.5; pr.vy *= 0.5; pr.vr *= 0.6;
    }
    if (pr.z === 0 && pr.vz === 0) { const f = Math.exp(-5 * dt); pr.vx *= f; pr.vy *= f; pr.vr *= f; }
    pr.rot += pr.vr * dt;
    if (mol && Math.random() < dt * 30) part(pr.x, pr.y, rand(-0.5, 0.5), rand(-0.5, 0.5), rand(0.12, 0.25), 'fire', 0.12);
    if (!mol && pr.t >= pr.fuse) { pr.dead = true; detonate(pr, pr.x, pr.y, 1); }
    else if (mol && pr.t > 3) shatter(pr);
  }
  function addFire(x, y, r, life, by, small) {
    if (S.fires.length > 44) S.fires.shift();
    S.fires.push({ x, y, r, life, max: life, by, t: 0, hitT: 0, small, cars: small ? null : [] });
    if (!small) X.decal(x, y, 'scorch', r * 0.9);
  }
  function stepFires(dt) {
    for (const f of S.fires) {
      f.life -= dt; f.t += dt; f.hitT -= dt;
      const k = Math.min(1, f.life / 1.2);
      if (Math.random() < f.r * f.r * 7 * dt * k + 0.02) part(f.x + rand(-f.r, f.r) * 0.7, f.y + rand(-f.r, f.r) * 0.7, rand(-0.4, 0.4), rand(-1.2, -0.2), rand(0.4, 0.8), 'fire', rand(0.2, 0.42) * Math.min(1, f.r));
      if (!f.small && Math.random() < dt * 4 * k) part(f.x + rand(-1, 1), f.y + rand(-1, 1), rand(-0.6, 0.6), rand(-1.5, -0.4), rand(1.2, 2.2), 'smoke', rand(0.35, 0.6));
      if (f.hitT > 0) continue;
      f.hitT = 0.25;
      for (const p of X.peds) {
        if (p.dead || p.removed || p.hidden || p.car || Math.abs(p.x - f.x) > f.r || Math.abs(p.y - f.y) > f.r) continue;
        if (Math.hypot(p.x - f.x, p.y - f.y) > f.r * 0.85 + p.r) continue;
        X.damagePed(p, f.small ? 4 : 8, f.by, 'fire'); ignite(p, 3, f.by);
      }
      if (f.small) continue;
      for (const c of X.cars) {
        if (c.removed || c.wrecked || Math.abs(c.x - f.x) > f.r + c.len / 2 || Math.abs(c.y - f.y) > f.r + c.len / 2) continue;
        if (!X.circlePoly(f.x, f.y, f.r * 0.7, X.carPoly(c))) continue;
        if (X.setOnFire) { if (!f.cars.includes(c)) { f.cars.push(c); ignite(c, 6, f.by); } }
        else X.damageCar(c, 35, f.by, 'fire');
      }
    }
    let out = false;
    for (const f of S.fires) if (f.life <= 0) out = true;
    if (out) S.fires = S.fires.filter(f => f.life > 0);
  }
  function stepShells(dt) {
    for (const s of SHELLS) {
      if (!s.on) continue;
      s.t += dt;
      if (s.z > 0 || s.vz > 0) {
        s.x += s.vx * dt; s.y += s.vy * dt; s.vz -= 18 * dt; s.z += s.vz * dt; s.rot += s.vr * dt;
        if (s.z <= 0) { s.z = 0; if (s.vz < -1.5) { s.vz = -s.vz * 0.3; s.vx *= 0.5; s.vy *= 0.5; s.vr *= 0.5; if (Math.random() < 0.3) sfx('tink', s.x, s.y, 0.35); } else { s.vz = 0; s.vx = s.vy = 0; } }
      }
      if (s.t > 12) s.on = false;
    }
  }

  // ================= the player =================
  function ownedList() { return ORDER.filter(owned); }
  function select(id, quiet) {
    if (!owned(id)) return false;
    if (P.weapon !== id) {
      P.weapon = id;
      if (P.ped) { P.ped.weapon = id; P.ped.fireCd = Math.min(P.ped.fireCd || 0, W[id].rate); }   // a fresh gun is ready to fire
      if (!quiet) sfx('switch');
    }
    stripT = 1.8; stripDirty = true;
    return true;
  }
  function cycle(dir) { const l = ownedList(); if (l.length < 2) return; const i = l.indexOf(P.weapon); select(l[(i + dir + l.length) % l.length]); }
  function slotSelect(n) { const l = ORDER.filter(id => W[id].slot === n && owned(id)); if (!l.length) return; const i = l.indexOf(P.weapon); select(l[(i + 1) % l.length]); }
  const AUTO = ['rifle', 'uzi', 'shotgun', 'pistol', 'electro', 'flamer', 'bat', 'fists'];
  function autoSwitch() {
    for (const id of AUTO) if (owned(id)) { select(id, true); return; }
    P.inv.fists = Infinity; select('fists', true);
  }
  const DRIVEBY = ['rifle', 'uzi', 'electro', 'shotgun', 'pistol'];
  function bestDriveBy() { for (const id of DRIVEBY) if (owned(id)) return id; return null; }
  function hostile(p) { return p.team === 'cop' || p.team === 'gang' || p.team === 'guard' || p.team === 'swat' || p.hostile || (p.ai && p.ai.hostile) || p.lastBy === P.ped; }
  // Keyboard aim assist: nearest person (hostiles first) within the cone and range, in line of sight.
  function findAssist(x, y, ang, cone, range, car) {
    let best = null, bs = 1e9;
    for (const p of X.peds) {
      if (p.isPlayer || p.dead || p.removed || p.hidden || p.car) continue;
      const dx = p.x - x, dy = p.y - y; if (Math.abs(dx) > range || Math.abs(dy) > range) continue;
      const d = Math.hypot(dx, dy); if (d > range || d < 0.3) continue;
      const da = Math.abs(wrap(Math.atan2(dy, dx) - ang)); if (da > cone) continue;
      const sc = da + d / range * 0.4 - (hostile(p) ? 0.3 : 0);
      if (sc < bs && !X.raycast(x, y, p.x, p.y, SOLID_ONLY)) { bs = sc; best = p; }
    }
    if (!best) for (const c of X.cars) {   // police cars are fair game too
      if (c.removed || c.wrecked || c === car || !(c.model.kind === 'police' || c.model.kind === 'swat' || c.owner === 'police')) continue;
      const dx = c.x - x, dy = c.y - y, d = Math.hypot(dx, dy); if (d > range) continue;
      const da = Math.abs(wrap(Math.atan2(dy, dx) - ang)); if (da > cone) continue;
      const sc = da + d / range * 0.4; if (sc < bs) { bs = sc; best = c; }
    }
    return best;
  }
  function playerTick() {
    const p = P.ped; if (!p) return;
    const ws = spec(P.weapon);
    if (ws && ws.id !== P.weapon && owned(P.weapon)) {   // another module used an alias: fold it into the real id
      const a = P.inv[P.weapon]; delete P.inv[P.weapon];
      P.inv[ws.id] = a === Infinity ? Infinity : Math.min(ws.max, (P.inv[ws.id] || 0) + a); P.weapon = ws.id;
    }
    if (!ws || !owned(P.weapon)) autoSwitch();
    if (p.weapon !== P.weapon) p.weapon = P.weapon;
    S.assist = null;
    if (P.state !== 'play' || p.dead) return;
    const I = X.input;
    if (I.pressed('KeyE')) cycle(1);
    if (I.pressed('KeyQ')) cycle(-1);
    for (let n = 0; n < 9; n++) if (I.pressed(DIGITS[n])) slotSelect(n + 1);
    let id = P.weapon;
    if (P.car && !W[id].driveBy) id = bestDriveBy();
    if (!id || P.entering) return;
    const w = W[id], aimed = (I.mouseActive() && !X.touch.move) || X.touch.aim != null;
    let ang, dist = null;
    if (P.car) {
      const c = P.car;
      if (X.touch.aim != null) ang = X.touch.aim;
      else if (I.mouseActive()) { ang = Math.atan2(X.mouse.wy - c.y, X.mouse.wx - c.x); dist = Math.hypot(X.mouse.wx - c.x, X.mouse.wy - c.y); }
      else {
        const L = findAssist(c.x, c.y, c.th - Math.PI / 2, 1.15, 26, c), R = L ? null : findAssist(c.x, c.y, c.th + Math.PI / 2, 1.15, 26, c);
        S.assist = L || R;
        ang = S.assist ? Math.atan2(S.assist.y - c.y, S.assist.x - c.x) : c.th - Math.PI / 2;
      }
    } else {
      ang = p.th;
      if (aimed) { if (X.touch.aim == null) dist = Math.hypot(X.mouse.wx - p.x, X.mouse.wy - p.y); }
      else if (w.kind !== 'melee') {
        S.assist = findAssist(p.x, p.y, p.th, 0.52, w.kind === 'flame' ? 9 : w.kind === 'electro' ? 13 : 25, null);
        if (S.assist) ang = Math.atan2(S.assist.y - p.y, S.assist.x - p.x);
      }
    }
    if (S.assist && dist == null) dist = Math.hypot(S.assist.x - p.x, S.assist.y - p.y);
    if (!I.fireDown() || p.fireCd > 0 || (!P.car && p.knock > 0.1)) return;   // nobody shoots straight while tumbling
    if (!P.car) p.th = ang;
    p.aim = ang;
    X.fireWeapon(p, id, ang, { dist: dist == null ? 14 : dist });
  }

  // ================= pickups =================
  const PK_COLORS = { weapon: '#d9a441', health: '#ff4a4a', armor: '#4f8cff', cash: '#5fdc6e', double: '#c25cff', fast: '#ff9a2e', bribe: '#ffd23a', frenzy: '#ff3b2f' };
  const POWER_KINDS = { health: 1, armor: 1, armour: 1, cash: 1, money: 1, double: 1, fast: 1, bribe: 1, frenzy: 1, rampage: 1 };
  const CAR_OK = { cash: 1, health: 1, armor: 1, bribe: 1 };
  // Spawn a pickup. kind: a weapon id, 'health', 'armor', 'cash', 'double', 'fast', 'bribe' or 'frenzy'.
  // o: {amount ($ for cash, ammo for weapons), ammo, ttl (s, blinks out), keep}. Returns the pickup.
  X.spawnPickup = function (kind, x, y, o) {
    o = o || {};
    let cat, id = null;
    if (spec(kind)) { cat = 'weapon'; id = spec(kind).id; }
    else if (Object.prototype.hasOwnProperty.call(POWER_KINDS, kind)) cat = kind === 'armour' ? 'armor' : kind === 'money' ? 'cash' : kind === 'rampage' ? 'frenzy' : kind;
    else return null;
    if (!isFinite(x) || !isFinite(y)) return null;
    let amount = o.amount != null ? +o.amount : o.ammo != null ? +o.ammo : cat === 'weapon' ? (W[id].ammo === Infinity ? 1 : W[id].ammo) : cat === 'cash' ? pick([50, 100, 100, 150, 250, 500]) : 0;
    if (!isFinite(amount)) amount = 0;
    const ttl = o.ttl > 0 ? o.ttl : 0;
    // A massacre would bury the street in crates (and the night in their glow): drops of the same thing
    // close together merge, and past DROP_CAP the drop nearest its end goes.
    if (!o.ambient && !o.keep && cat !== 'frenzy') {
      let n = 0, old = null;
      for (const q of S.pickups) {
        if (q.removed || q.ambient || q.keep) continue;
        if (q.kind === cat && q.id === id && Math.abs(q.x - x) < 1.6 && Math.abs(q.y - y) < 1.6) {
          if (cat === 'cash' || (cat === 'weapon' && W[id].ammo !== Infinity)) q.amount += amount;
          q.ttl = !ttl || !q.ttl ? 0 : Math.max(q.ttl, q.t + ttl);
          return q;
        }
        if (q.ttl) { n++; if (!old || q.t - q.ttl > old.t - old.ttl) old = q; }
      }
      if (ttl && n >= DROP_CAP && old) old.removed = true;
    }
    const pk = { kind: cat, id, x, y, amount, ttl, ambient: !!o.ambient, keep: !!o.keep, t: 0, ph: Math.random() * TAU, removed: false };
    S.pickups.push(pk);
    return pk;
  };
  const AMB = [['pistol', 14], ['uzi', 9], ['shotgun', 7], ['rifle', 4], ['flamer', 3], ['electro', 1.5], ['rocket', 2.5], ['grenade', 5], ['molotov', 5], ['bat', 4], ['health', 10], ['armor', 7], ['cash', 13], ['double', 1.4], ['fast', 1.4], ['bribe', 2], ['frenzy', 1.3]];
  function ambientKind() {
    let tot = 0;
    for (const [k, w] of AMB) if (kindOk(k)) tot += w;
    let r = Math.random() * tot;
    for (const [k, w] of AMB) if (kindOk(k) && (r -= w) <= 0) return k;
    return 'pistol';
  }
  function kindOk(k) {
    if (k === 'bribe') return !!X.police;
    if (k === 'frenzy') return !S.frenzy && !S.pickups.some(q => q.kind === 'frenzy');
    return true;
  }
  function plazaPoint(f) {
    const bl = X.city.blocks.filter(b => b.kind !== 'city' && Math.abs((b.x0 + b.x1) / 2 - f.x) < 240 && Math.abs((b.y0 + b.y1) / 2 - f.y) < 240);
    if (!bl.length) return null;
    const b = pick(bl);
    return { x: rand(b.x0 + 5.5, b.x1 - 5.5), y: rand(b.y0 + 5.5, b.y1 - 5.5) };
  }
  function spawnAmbient(f, initial, kind) {
    for (let tries = 0; tries < 8; tries++) {
      const pt = Math.random() < 0.25 ? plazaPoint(f) : X.randomSidewalkPoint(f.x, f.y, initial ? 14 : 70, 240);
      if (!pt) continue;
      if (!initial && X.inView(pt.x, pt.y, 8)) continue;
      if (X.blocked(pt.x, pt.y, 0.7)) continue;
      if (S.pickups.some(q => Math.abs(q.x - pt.x) < 16 && Math.abs(q.y - pt.y) < 16)) continue;
      return X.spawnPickup(kind || ambientKind(), pt.x, pt.y, { ambient: true });
    }
    return null;
  }
  function collect(pk) {
    const p = P.ped;
    switch (pk.kind) {
      case 'weapon': {
        const w = W[pk.id], got = X.giveWeapon(pk.id, pk.amount);
        if (!got) return;
        X.popup(w.name + (w.ammo === Infinity ? '' : ' +' + got));
        X.floatText(pk.x, pk.y, w.name.toUpperCase(), '#ffd23a');
        sfx('pick');
        if (X.save && !X.save.weaponHint) { X.save.weaponHint = true; X.persist(); X.pager('Armed. Mouse, Ctrl or J fires (Space on foot). Q/E, 1-9 or the wheel switch. Shooting near people brings the police.', 7000); }
        break;
      }
      case 'health':
        if (p.hp >= p.maxHp) return;
        X.floatText(pk.x, pk.y, '+' + Math.round(p.maxHp - p.hp) + ' HP', '#ff6b5a');
        p.hp = p.maxHp; X.popup('Health'); sfx('heal');
        break;
      case 'armor':
        if ((p.armor || 0) >= 100) return;
        p.armor = Math.min(100, (p.armor || 0) + 50); X.popup('Body armour'); X.floatText(pk.x, pk.y, 'ARMOUR', '#9ec2ff'); sfx('heal');
        break;
      case 'cash': X.money(pk.amount, 'pickup', pk.x, pk.y); sfx('cash'); break;
      case 'double': S.power.double = 20; X.popup('DOUBLE DAMAGE!'); X.floatText(pk.x, pk.y, '2× DAMAGE', '#d79bff'); sfx('power'); break;
      case 'fast': S.power.fast = 20; X.popup('FAST RELOAD!'); X.floatText(pk.x, pk.y, 'FAST RELOAD', '#ffbf6e'); sfx('power'); break;
      case 'bribe':
        if (!X.police || !(P.wanted > 0)) return;
        X.police.setWanted(Math.max(0, Math.round(P.wanted) - 1)); X.popup('Cop bribe: one star off'); X.floatText(pk.x, pk.y, '-1 ★', '#ffd23a'); sfx('cash');
        break;
      case 'frenzy': if (!startFrenzy()) return; break;
    }
    pk.removed = true;
    PG.burst(pk.x, pk.y, 'confetti', 10, 4, 0.5, 0.18, ['#fff', PK_COLORS[pk.kind] || '#ffd23a']);
    X.emit('pickup', { kind: pk.kind, id: pk.id, amount: pk.amount, x: pk.x, y: pk.y });
  }
  function pickupsTick(dt) {
    const f = X.focus();
    let n = 0, gone = false;
    for (const pk of S.pickups) {
      if (pk.removed) { gone = true; continue; }
      pk.t += dt;
      if (pk.ttl && pk.t > pk.ttl) { pk.removed = gone = true; continue; }
      if (pk.ambient) { if (Math.abs(pk.x - f.x) > 330 || Math.abs(pk.y - f.y) > 330) pk.removed = gone = true; else n++; }
      if (pk.kind === 'frenzy' && !X.scene) X.blip(pk.x, pk.y, '#ff3b2f', { size: 3.5, shape: 'square' });
    }
    if (P.state === 'play' && P.ped && !P.ped.dead && !P.entering) {
      const c = P.car, px = c ? c.x : P.ped.x, py = c ? c.y : P.ped.y, R = c ? c.len / 2 + 0.8 : 1.05;
      let poly = null;
      for (const pk of S.pickups) {
        if (pk.removed) continue;
        const dx = pk.x - px, dy = pk.y - py;
        if (Math.abs(dx) > R || Math.abs(dy) > R) continue;
        if (c) { if (!CAR_OK[pk.kind]) continue; poly = poly || X.carPoly(c); if (!X.circlePoly(pk.x, pk.y, 0.6, poly)) continue; }
        else if (dx * dx + dy * dy > R * R) continue;
        collect(pk); gone = gone || pk.removed;
      }
    }
    if (gone) S.pickups = S.pickups.filter(q => !q.removed);
    spawnT -= dt;
    if (n < AMBIENT_N && spawnT <= 0 && !X.scene) { spawnT = 0.35; spawnAmbient(f, false); }
  }

  // ================= kill frenzy (GTA2's rampage skull) =================
  const FRENZIES = [
    { w: 'uzi', need: 15, time: 45, reward: 1500, text: 'Kill 15 people in 45 seconds with the Uzi' },
    { w: 'flamer', need: 12, time: 45, reward: 2000, text: 'Torch 12 people in 45 seconds' },
    { w: 'rocket', need: 6, time: 50, reward: 2500, cars: true, text: 'Blow up 6 cars in 50 seconds' },
    { w: 'electro', need: 15, time: 40, reward: 2000, text: 'Fry 15 people in 40 seconds' },
    { w: 'shotgun', need: 12, time: 45, reward: 1500, text: 'Kill 12 people in 45 seconds with the shotgun' },
  ];
  function startFrenzy() {
    if (S.frenzy || X.scene || (X.missions && X.missions.active) || P.state !== 'play') return false;
    const F = pick(FRENZIES), had = P.inv[F.w];
    S.frenzy = { w: F.w, need: F.need, got: 0, left: F.time, reward: F.reward, cars: !!F.cars, text: F.text, prevWeapon: P.weapon, prevAmmo: had };
    P.inv[F.w] = Infinity; select(F.w, true);
    X.big('KILL FRENZY!', '#ff3b2f', 2800, F.text);
    sfx('frenzy');
    X.emit('frenzyStart', { weapon: F.w, need: F.need, time: F.time });
    return true;
  }
  function endFrenzy(passed, quiet) {
    const F = S.frenzy; if (!F) return;
    S.frenzy = null;
    if (P.inv[F.w] === Infinity) { if (F.prevAmmo == null) delete P.inv[F.w]; else P.inv[F.w] = F.prevAmmo; }
    if (!select(F.prevWeapon, true)) autoSwitch();
    if (passed) {
      X.money(F.reward, 'frenzy', X.playerPos().x, X.playerPos().y);
      X.big('FRENZY PASSED!', '#7dff9a', 2600, '$' + F.reward);
      PG.audio.fanfare();
    } else if (P.state === 'play' && !quiet) { X.big('FRENZY FAILED', '#e8402f', 2200); PG.audio.trombone(); }
    X.emit(passed ? 'frenzyPassed' : 'frenzyFailed', { reward: passed ? F.reward : 0, cancelled: !!quiet });
  }
  function frenzyTick(dt) {
    const F = S.frenzy; if (!F) return;
    F.left -= dt;
    if (P.state !== 'play' || X.scene) endFrenzy(false);
    else if (F.got >= F.need) endFrenzy(true);
    else if (F.left <= 0) endFrenzy(false);
  }
  X.on('pedKilled', e => {
    if (!X.active) return;
    const F = S.frenzy, p = e.ped;
    if (F && !F.cars && p && !p.isPlayer && X.byPlayer(e.by)) { F.got++; X.floatText(p.x, p.y, F.got + '/' + F.need, '#ff3b2f'); }
    // an armed NPC drops its weapon (once)
    const w = p && spec(p.weapon);
    if (w && !p.isPlayer && !p.weaponDropped && !p.noDrop && w.ammo !== Infinity && !p.hidden) {
      p.weaponDropped = true;
      let x = p.x + rand(-0.6, 0.6), y = p.y + rand(-0.6, 0.6);
      if (X.blocked(x, y, 0.3)) { x = p.x; y = p.y; }   // never inside the wall they died against
      X.spawnPickup(w.id, x, y, { ammo: Math.max(1, Math.round(w.ammo * 0.4)), ttl: 30 });
    }
  });
  // A mission takes over the player's hands (its own frenzies, handed-out weapons): a skull frenzy ends first.
  X.on('missionStart', () => { if (X.active && S.frenzy) endFrenzy(false, true); });
  X.on('carDestroyed', e => {
    const F = S.frenzy;
    if (X.active && F && F.cars && e.car && e.car !== P.car && X.byPlayer(e.by)) { F.got++; X.floatText(e.car.x, e.car.y, F.got + '/' + F.need, '#ff3b2f'); }
  });
  X.on('respawn', () => { S.power.double = 0; S.power.fast = 0; flameStop(); stripDirty = true; });
  X.on('wasted', () => flameStop());
  X.on('busted', () => flameStop());

  // ================= give / select API =================
  X.giveWeapon = function (id, ammo) {
    const w = spec(id); if (!w) return 0;
    id = w.id;
    const F = S.frenzy;
    if (F && F.w === id && P.inv[id] === Infinity && w.ammo !== Infinity) {   // bought or found mid-frenzy: kept for afterwards
      const prev = F.prevAmmo > 0 ? F.prevAmmo : 0, add = Math.min(w.max - prev, Math.round(ammo == null ? w.ammo : +ammo));
      if (!(add > 0)) return 0;
      F.prevAmmo = prev + add; stripDirty = true;
      return add;
    }
    const had = P.inv[id] || 0, onlyFists = Object.keys(P.inv).every(k => k === 'fists' || !owned(k));
    if (w.ammo === Infinity) { if (had === Infinity) return 0; P.inv[id] = Infinity; }
    else {
      if (had === Infinity) return 0;
      const add = Math.min(w.max - had, Math.round(ammo == null ? w.ammo : +ammo));
      if (!(add > 0)) return 0;
      P.inv[id] = had + add;
    }
    if (onlyFists || P.weapon === 'fists') select(id, true);
    stripT = 1.8; stripDirty = true;
    return w.ammo === Infinity ? 1 : P.inv[id] - had;
  };
  S.select = id => select(resolve(id), false);
  S.next = () => cycle(1);
  S.prev = () => cycle(-1);
  S.owned = () => ownedList();
  S.resolve = resolve;
  S.flameActive = () => !!flame;
  // For NPC brains: can `shooter` hit `target` with this weapon from here (range + line of sight)?
  S.canHit = function (shooter, target, id) {
    const w = spec(id) || W.pistol, d = Math.hypot(target.x - shooter.x, target.y - shooter.y);
    if (d > (w.kind === 'throw' ? w.range : w.range * 0.9)) return false;
    return !X.raycast(shooter.x, shooter.y, target.x, target.y, SOLID_ONLY);
  };
  // Angle to aim at a target, leading it for rockets and throws.
  S.aimAt = function (shooter, target, id) {
    const w = spec(id) || W.pistol;
    let tx = target.x, ty = target.y;
    const v = target.kind === 'car' ? X.carVel(target) : { x: target.vx || 0, y: target.vy || 0 };
    const d = Math.hypot(tx - shooter.x, ty - shooter.y), sp = w.kind === 'rocket' ? w.speed : w.kind === 'throw' ? 20 : 0;
    if (sp) { tx += v.x * d / sp; ty += v.y * d / sp; }
    return Math.atan2(ty - shooter.y, tx - shooter.x);
  };

  // ================= icons =================
  const ICON_PATHS = {
    fists: 'M-22-18H14C22-18 26-12 26-6V8C26 16 20 20 14 20H-22Z M-32-12H-22V12H-32Z',
    bat: 'M-48 14L-45 21L36-3C48-7 48-21 37-18Z',
    pistol: 'M-30-17H34V-5H-30Z M-28-5H-8L-1 25H-19Z M-8-5H8V0C8 7 0 9-4 9L-6 4Z',
    uzi: 'M-26-14H24V2H-26Z M24-11H38V-4H24Z M-14 2H-2V26H-14Z M4 2H14V34H4Z M-40-10H-26V-3H-40Z',
    shotgun: 'M-50-6L-22-12V2L-50 12Z M-22-12H48V-5H-22Z M-22-5H40V0H-22Z M2 0H26V6H2Z M-20 2H-10L-6 14H-16Z',
    rifle: 'M-50-4L-26-10V4L-48 10Z M-26-10H24V2H-26Z M24-8H50V-3H24Z M2 2H12C14 14 18 22 24 28L16 32C8 24 4 14 2 4Z M-18 2H-8L-6 16H-16Z M8-15H18V-10H8Z',
    flamer: 'M-44-2A14 14 0 1 0-16-2A14 14 0 1 0-44-2Z M-20-8H32V2H-20Z M32-11H40V5H32Z M-6 2H4V20H-6Z',
    electro: 'M10-32L-24 4H-3L-14 32L26-8H5Z',
    rocket: 'M-50-9H30V9H-50Z M-10 9H0V24H-10Z M-30 9H-22V18H-30Z',
    grenade: 'M-16 6A16 18 0 1 0 16 6A16 18 0 1 0-16 6Z M-5-26H9V-11H-5Z',
    molotov: 'M-6-22H6V-10L14-1V32H-14V-1L-6-10Z',
  };
  const ICONS = {};
  function iconPath(id) {
    if (!ICONS[id] && typeof Path2D !== 'undefined' && ICON_PATHS[id]) ICONS[id] = new Path2D(ICON_PATHS[id]);
    return ICONS[id];
  }
  // Draw a weapon silhouette centred at (x, y), s = width. mode 'hud' (white, outlined) or 'crate' (dark).
  function drawIcon(ctx, id, x, y, s, mode) {
    const p = iconPath(id); if (!p) return;
    ctx.save(); ctx.translate(x, y); ctx.scale(s / 100, s / 100);
    if (mode === 'hud') { ctx.lineJoin = 'round'; ctx.lineWidth = 9; ctx.strokeStyle = '#000'; ctx.stroke(p); ctx.fillStyle = '#fff'; }
    else ctx.fillStyle = '#1d1a16';
    ctx.fill(p);
    if (id === 'rocket') { ctx.fillStyle = '#d23a2a'; ctx.beginPath(); ctx.moveTo(30, -10); ctx.lineTo(50, 0); ctx.lineTo(30, 10); ctx.closePath(); ctx.fill(); }
    if (id === 'flamer' || id === 'molotov') {
      ctx.fillStyle = '#ff8a1e'; ctx.beginPath();
      if (id === 'flamer') { ctx.moveTo(40, -9); ctx.quadraticCurveTo(62, -16, 54, -2); ctx.quadraticCurveTo(64, 6, 40, 3); }
      else { ctx.moveTo(-6, -22); ctx.quadraticCurveTo(-10, -38, 2, -44); ctx.quadraticCurveTo(0, -34, 10, -30); ctx.quadraticCurveTo(10, -22, 6, -22); }
      ctx.closePath(); ctx.fill();
    }
    if (id === 'electro') { ctx.fillStyle = mode === 'hud' ? '#8fd0ff' : '#2a6bff'; ctx.fill(p); }
    if (id === 'grenade') { ctx.strokeStyle = mode === 'hud' ? '#fff' : '#1d1a16'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(16, -22, 7, 0, TAU); ctx.stroke(); }
    ctx.restore();
  }
  S.drawIcon = drawIcon;
  // Weapon in a ped's hands, ped-local coords (x forward). Used for armed people when peds.js is absent.
  S.drawHeld = function (ctx, p) {
    const w = spec(p.weapon); if (!w || w.held === 'none') return;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.th);
    ctx.fillStyle = '#16181c';
    switch (w.held) {
      case 'bat': ctx.fillStyle = '#b07a3e'; ctx.beginPath(); ctx.moveTo(0.22, 0.12); ctx.lineTo(0.95, -0.12); ctx.lineTo(0.97, 0.02); ctx.lineTo(0.24, 0.2); ctx.closePath(); ctx.fill(); break;
      case 'long': ctx.fillRect(0.12, 0.0, 0.78, 0.09); ctx.fillStyle = '#5a3a20'; ctx.fillRect(0.0, -0.02, 0.2, 0.12); break;
      case 'smg': ctx.fillRect(0.22, 0.0, 0.42, 0.11); break;
      case 'tube': ctx.fillStyle = '#3f4a32'; ctx.fillRect(-0.45, -0.24, 1.25, 0.18); ctx.fillStyle = '#d23a2a'; ctx.fillRect(0.8, -0.22, 0.1, 0.14); break;
      case 'throw': ctx.fillStyle = w.id === 'molotov' ? '#5b7a3a' : '#3f5a2a'; ctx.beginPath(); ctx.arc(0.32, 0.22, 0.09, 0, TAU); ctx.fill(); break;
      default: ctx.fillRect(0.28, 0.02, 0.36, 0.08);
    }
    if (p.weapon === 'flamer') { ctx.fillStyle = '#8a8f96'; ctx.beginPath(); ctx.arc(-0.22, 0, 0.14, 0, TAU); ctx.fill(); }
    ctx.restore();
  };

  // ================= drawing =================
  function drawPickup(ctx, pk, t) {
    if (pk.ttl && pk.ttl - pk.t < 3 && Math.floor(t * 7) % 2 === 0) return;
    const col = PK_COLORS[pk.kind] || '#fff', bob = 1 + 0.08 * Math.sin(t * 4 + pk.ph), s = 0.62 * bob;
    ctx.save(); ctx.translate(pk.x, pk.y);
    ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t * 3 + pk.ph); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, 0.95, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-s + 0.12, -s + 0.14, s * 2, s * 2);
    ctx.rotate(t * 1.6 + pk.ph);
    if (pk.kind === 'weapon') {
      ctx.fillStyle = '#c9963f'; ctx.fillRect(-s, -s, s * 2, s * 2);
      ctx.fillStyle = '#e0b45e'; ctx.fillRect(-s + 0.08, -s + 0.08, s * 2 - 0.16, s * 2 - 0.16);
      ctx.strokeStyle = '#6b4a1e'; ctx.lineWidth = 0.07; ctx.strokeRect(-s, -s, s * 2, s * 2);
      drawIcon(ctx, pk.id, 0, 0, s * 1.75, 'crate');
    } else {
      ctx.fillStyle = '#16181c'; ctx.fillRect(-s, -s, s * 2, s * 2);
      ctx.strokeStyle = col; ctx.lineWidth = 0.1; ctx.strokeRect(-s + 0.06, -s + 0.06, s * 2 - 0.12, s * 2 - 0.12);
      ctx.fillStyle = col;
      if (pk.kind === 'health') { ctx.beginPath(); ctx.moveTo(0, s * 0.62); ctx.bezierCurveTo(-s * 1.1, -s * 0.1, -s * 0.45, -s * 0.85, 0, -s * 0.3); ctx.bezierCurveTo(s * 0.45, -s * 0.85, s * 1.1, -s * 0.1, 0, s * 0.62); ctx.fill(); }
      else if (pk.kind === 'armor') { ctx.beginPath(); ctx.moveTo(0, -s * 0.7); ctx.lineTo(s * 0.6, -s * 0.45); ctx.quadraticCurveTo(s * 0.55, s * 0.4, 0, s * 0.72); ctx.quadraticCurveTo(-s * 0.55, s * 0.4, -s * 0.6, -s * 0.45); ctx.closePath(); ctx.fill(); }
      else if (pk.kind === 'cash') {
        ctx.fillStyle = '#2f8a3c'; ctx.fillRect(-s * 0.8, -s * 0.45, s * 1.6, s * 0.9); ctx.fillStyle = col; ctx.fillRect(-s * 0.7, -s * 0.36, s * 1.4, s * 0.72);
        ctx.fillStyle = '#1d4a24'; ctx.font = `700 ${s * 0.9}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', 0, s * 0.04);
      } else if (pk.kind === 'frenzy') {
        ctx.beginPath(); ctx.arc(0, -s * 0.12, s * 0.52, 0, TAU); ctx.fill(); ctx.fillRect(-s * 0.3, s * 0.2, s * 0.6, s * 0.38);
        ctx.fillStyle = '#16181c'; ctx.beginPath(); ctx.arc(-s * 0.2, -s * 0.12, s * 0.14, 0, TAU); ctx.arc(s * 0.2, -s * 0.12, s * 0.14, 0, TAU); ctx.fill();
        ctx.fillRect(-s * 0.04, s * 0.06, s * 0.08, s * 0.14);
      } else {
        ctx.font = `700 ${s * 0.95}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(pk.kind === 'double' ? '2×' : pk.kind === 'fast' ? '»' : '★', 0, s * 0.05);
      }
    }
    ctx.restore();
  }
  function drawFire(ctx, f, t) {
    const k = Math.min(1, f.life / 1.2, f.t / 0.15), n = f.small ? 3 : 7;
    ctx.globalAlpha = 0.35 * k; ctx.fillStyle = '#ff5a1a'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.95, 0, TAU); ctx.fill();
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996 + f.x, rr = f.r * (0.25 + 0.6 * ((i * 0.37) % 1)), fl = 0.5 + 0.5 * Math.sin(t * 13 + i * 1.7);
      const x = f.x + Math.cos(a) * rr * 0.8, y = f.y + Math.sin(a) * rr * 0.8, s = f.r * (0.22 + 0.16 * fl) * k;
      ctx.globalAlpha = 0.85 * k; ctx.fillStyle = '#ff7a1e'; ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffd04a'; ctx.beginPath(); ctx.arc(x, y - s * 0.25, s * 0.55, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function drawProjectile(ctx, pr, t) {
    if (pr.kind === 'rocket') {
      ctx.save(); ctx.translate(pr.x, pr.y); ctx.rotate(pr.th);
      ctx.fillStyle = '#4b5638'; ctx.fillRect(-0.32, -0.07, 0.56, 0.14);
      ctx.fillStyle = '#d23a2a'; ctx.beginPath(); ctx.moveTo(0.24, -0.07); ctx.lineTo(0.4, 0); ctx.lineTo(0.24, 0.07); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2c3324'; ctx.fillRect(-0.32, -0.13, 0.12, 0.26);
      ctx.restore();
      return;
    }
    const z = pr.z, sc = 1 + z * 0.1;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(pr.x + z * 0.25, pr.y + z * 0.3, 0.13, 0.09, 0, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(pr.x, pr.y); ctx.scale(sc, sc); ctx.rotate(pr.rot);
    if (pr.kind === 'grenade') {
      ctx.fillStyle = '#1c2614'; ctx.beginPath(); ctx.ellipse(0, 0, 0.22, 0.18, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#4a6a30'; ctx.beginPath(); ctx.ellipse(0, 0, 0.18, 0.14, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#86a860'; ctx.beginPath(); ctx.arc(-0.06, -0.05, 0.06, 0, TAU); ctx.fill();
      ctx.fillStyle = '#b0b6be'; ctx.fillRect(0.15, -0.04, 0.1, 0.08);
    } else {
      ctx.fillStyle = '#2c3a1c'; ctx.fillRect(-0.24, -0.11, 0.36, 0.22); ctx.fillRect(0.1, -0.055, 0.15, 0.11);
      ctx.fillStyle = '#5e7d3c'; ctx.fillRect(-0.21, -0.08, 0.3, 0.16);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-0.17, -0.06, 0.22, 0.04);
      const fl = 0.6 + 0.4 * Math.sin(t * 40 + pr.x);
      ctx.fillStyle = '#ff9a1e'; ctx.beginPath(); ctx.arc(0.31, 0, 0.09 * fl + 0.04, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffe07a'; ctx.beginPath(); ctx.arc(0.31, 0, 0.04 * fl + 0.02, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  // pass 0: the blue glow (air layer), pass 1: the white-hot core (overlay, above the night)
  function drawBolt(ctx, b, pass) {
    const k = b.life / b.max, pts = b.pts;
    ctx.strokeStyle = pass ? `rgba(255,255,255,${k})` : `rgba(120,190,255,${0.55 * k})`;
    ctx.lineWidth = pass ? 0.07 : 0.26;
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) {
      const x0 = pts[i - 2], y0 = pts[i - 1], x1 = pts[i], y1 = pts[i + 1], dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      const segs = Math.max(2, Math.min(8, Math.round(L / 1.2)));
      for (let s = 1; s <= segs; s++) {
        const f = s / segs, j = s === segs ? 0 : (Math.random() - 0.5) * 0.7;
        ctx.lineTo(x0 + dx * f + nx * j, y0 + dy * f + ny * j);
      }
    }
    ctx.stroke();
  }
  function drawFlash(ctx, f) {
    const k = f.life / f.max, s = f.s * (0.7 + 0.3 * k);
    ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.a);
    ctx.globalAlpha = 0.45 * k; ctx.fillStyle = f.c; ctx.beginPath(); ctx.arc(0, 0, 0.45 * s, 0, TAU); ctx.fill();
    ctx.globalAlpha = k; ctx.fillStyle = '#fff3c4';
    ctx.beginPath(); ctx.moveTo(-0.05, -0.12 * s); ctx.lineTo(0.62 * s, 0); ctx.lineTo(-0.05, 0.12 * s); ctx.lineTo(0.12 * s, 0.32 * s); ctx.lineTo(0.05 * s, 0); ctx.lineTo(0.12 * s, -0.32 * s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = f.c; ctx.beginPath(); ctx.moveTo(0.05, -0.06 * s); ctx.lineTo(0.38 * s, 0); ctx.lineTo(0.05, 0.06 * s); ctx.closePath(); ctx.fill();
    ctx.restore(); ctx.globalAlpha = 1;
  }

  // ================= HUD =================
  const css = `
#gta-hud .g-weap { align-items: center; }
#gta-hud .w-icon { width: 46px; height: 23px; flex: none; }
#gta-hud .g-weap.w-pop .w-icon { animation: wpop .25s cubic-bezier(.2,1.6,.4,1); }
@keyframes wpop { from { transform: scale(1.6); } to { transform: scale(1); } }
#gta-hud .w-strip { position: absolute; left: 0; top: calc(100% + 6px); width: 0; height: 40px; transition: opacity .3s; opacity: 0; }
#gta-hud .w-strip.on { opacity: 1; }
#gta-hud .w-db { font-size: 13px; color: #ffd23a; letter-spacing: 0.06em; }
#gta-hud .w-pow { display: flex; gap: 6px; font-weight: 800; font-size: 14px; letter-spacing: 0.05em; text-shadow: 0 2px 0 #000; }
#gta-hud .w-pow span { padding: 1px 7px; border-radius: 4px; background: rgba(0,0,0,0.55); }
#gta-hud .w-frenzy { position: absolute; left: 50%; top: calc(104px + env(safe-area-inset-top, 0px)); transform: translateX(-50%); font-family: var(--display); font-size: clamp(18px, 3vw, 26px); color: #ff3b2f; text-shadow: 0 3px 0 #000; white-space: nowrap; text-align: center; }
#gta-hud .w-frenzy small { display: block; font-family: var(--hud); font-weight: 800; font-size: 14px; color: #fff; letter-spacing: 0.06em; }
@media (max-width: 600px) { #gta-hud .w-frenzy { font-size: 20px; } #gta-hud .w-frenzy small { white-space: normal; width: min(300px, calc(100vw - 40px)); margin: 2px auto 0; font-size: 12px; } }
`;
  let hudEls = null;
  function hudBuild() {
    const root = document.getElementById('gta-hud'); if (!root) return null;
    const weap = root.querySelector('.g-weap'); if (!weap) return null;
    if (!document.getElementById('gta-weapons-css')) { const st = document.createElement('style'); st.id = 'gta-weapons-css'; st.textContent = css; document.head.appendChild(st); }
    let icon = weap.querySelector('.w-icon');
    if (!icon) { icon = document.createElement('canvas'); icon.className = 'w-icon'; icon.width = 92; icon.height = 46; weap.insertBefore(icon, weap.firstChild); }
    const tl = root.querySelector('.g-tl') || root;
    let strip = root.querySelector('.w-strip');
    if (!strip) { strip = document.createElement('canvas'); strip.className = 'w-strip'; strip.width = 4; strip.height = 80; tl.appendChild(strip); }
    let db = weap.querySelector('.w-db');
    if (!db) { db = document.createElement('span'); db.className = 'w-db'; weap.appendChild(db); }
    let pow = root.querySelector('.w-pow');
    if (!pow) { pow = document.createElement('div'); pow.className = 'w-pow'; tl.appendChild(pow); }
    let fr = root.querySelector('.w-frenzy');
    if (!fr) { fr = document.createElement('div'); fr.className = 'w-frenzy'; fr.hidden = true; root.appendChild(fr); }
    return { weap, icon, strip, db, pow, fr, key: '', dbKey: '', powKey: '', frKey: '', stripOn: false, frAt: 0 };
  }
  // The frenzy readout sits below whatever occupies the top centre (the pager, a phone call; on narrow
  // screens also the corner stacks, which the hud module moves the pager under).
  function placeFrenzy(H) {
    H.frAt = performance.now();
    const root = H.fr.parentNode; if (!root) return;
    const r0 = root.getBoundingClientRect().top, narrow = root.clientWidth <= 600;
    let top = narrow ? 0 : 104;
    const below = el => { if (el && el.offsetParent) top = Math.max(top, el.getBoundingClientRect().bottom - r0 + 8); };
    below(root.querySelector('.g-pager')); below(root.querySelector('.m-call'));
    if (narrow) { below(root.querySelector('.g-tl')); below(root.querySelector('.g-tr')); }
    const v = Math.round(top) + 'px';
    if (H.fr.style.top !== v) H.fr.style.top = v;
  }
  function drawHudIcon(cv, id) {
    const c = cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
    drawIcon(c, id, cv.width / 2, cv.height / 2 + 2, cv.width * 0.78, 'hud');
  }
  function drawStrip(cv) {
    const l = ownedList(), bw = 64, h = 80;
    const wpx = Math.max(1, l.length) * bw;
    if (cv.width !== wpx) { cv.width = wpx; cv.style.width = wpx / 2 + 'px'; }
    const c = cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, h);
    l.forEach((id, i) => {
      const x = i * bw, cur = id === P.weapon;
      c.fillStyle = cur ? 'rgba(255,210,58,0.28)' : 'rgba(0,0,0,0.5)'; c.fillRect(x + 2, 2, bw - 4, h - 4);
      c.strokeStyle = cur ? '#ffd23a' : 'rgba(255,255,255,0.25)'; c.lineWidth = cur ? 4 : 2; c.strokeRect(x + 3, 3, bw - 6, h - 6);
      drawIcon(c, id, x + bw / 2, 32, bw * 0.72, 'hud');
      const a = P.inv[id];
      c.font = '700 20px sans-serif'; c.textAlign = 'center'; c.fillStyle = cur ? '#ffd23a' : '#fff';
      c.fillText(a === Infinity ? String(W[id].slot) : String(a), x + bw / 2, h - 10);
    });
  }

  // Age short-lived effects and drop the dead ones in place (no new array every frame while firing).
  function age(a, dt) {
    let j = 0;
    for (let i = 0; i < a.length; i++) { const e = a[i]; e.life -= dt; if (e.life > 0) a[j++] = e; }
    a.length = j;
    return a;
  }

  // ================= module =================
  function resetState() {
    S.pickups = []; S.projectiles = []; S.fires = []; S.power.double = 0; S.power.fast = 0; S.frenzy = null; S.assist = null;
    tracers = []; flashes = []; bolts = []; swings = [];
    for (const s of SHELLS) s.on = false;
    extShooters.clear(); flameStop();
    lastCrimeT = -9; spawnT = 0; stripT = 0; stripDirty = true;
    if (hudEls) hudEls.key = '';
  }
  let wheelHooked = false;
  X.mod('weapons', {
    order: 40,
    init() {
      resetState();
      buildLampGrid();
      hudEls = hudBuild();
      if (!wheelHooked) {
        wheelHooked = true;
        window.addEventListener('wheel', e => {
          if (!X.active || G().status !== 'play' || performance.now() - wheelT < 110) return;
          wheelT = performance.now(); cycle(e.deltaY > 0 ? 1 : -1);
        }, { passive: true });
      }
      // a starter crate or two outside Trond's Garage, then the rest of the city's stash
      const home = X.places.hideout || X.places.bank, f = X.focus();
      if (home) for (const k of ['pistol', 'bat']) {
        const pt = X.randomSidewalkPoint(home.door.x, home.door.y, 7, 22);
        if (pt && !X.blocked(pt.x, pt.y, 0.7)) X.spawnPickup(k, pt.x, pt.y, { ambient: true });
      }
      for (let i = 0; i < AMBIENT_N * 2 && S.pickups.length < AMBIENT_N; i++) spawnAmbient(f, true);
    },
    stop() { flameStop(); resetState(); },
    tick(dt) {
      sndBudget = 6;
      for (const p of X.peds) if (p.fireCd > 0) p.fireCd -= dt;
      for (const s of extShooters) { s.fireCd -= dt; if (!(s.fireCd > 0)) extShooters.delete(s); }
      if (S.power.double > 0) S.power.double = Math.max(0, S.power.double - dt);
      if (S.power.fast > 0) S.power.fast = Math.max(0, S.power.fast - dt);
      if (stripT > 0) stripT -= dt;
      playerTick();
      let gone = false;
      for (const pr of S.projectiles) { if (!pr.dead) { if (pr.kind === 'rocket') stepRocket(pr, dt); else stepThrown(pr, dt); } gone = gone || !!pr.dead; }
      if (gone) S.projectiles = S.projectiles.filter(pr => !pr.dead);
      stepFires(dt);
      stepShells(dt);
      burnFallback(dt);
      tracers = age(tracers, dt); flashes = age(flashes, dt); bolts = age(bolts, dt); swings = age(swings, dt);
      pickupsTick(dt);
      frenzyTick(dt);
      if (flame && X.time - flame.on > 0.12) flameStop();
    },
    hud() {
      if (G().status !== 'play' || (flame && !PG.audio.kit())) flameStop();
      if (!hudEls || !hudEls.icon.isConnected) hudEls = hudBuild();
      const H = hudEls; if (!H) return;
      // in a car a melee weapon or flamethrower in hand means the best gun goes out of the window instead
      const ws = spec(P.weapon), eff = P.car && ws && !ws.driveBy ? bestDriveBy() : null, shown = eff || P.weapon;
      if (H.key !== shown) {
        H.key = shown; drawHudIcon(H.icon, shown);
        H.weap.classList.remove('w-pop'); void H.weap.offsetWidth; H.weap.classList.add('w-pop');
      }
      const dbk = eff ? 'DRIVE-BY ' + W[eff].name + (P.inv[eff] === Infinity ? '' : ' ' + P.inv[eff]) : '';
      if (dbk !== H.dbKey) { H.dbKey = dbk; H.db.textContent = dbk; }
      const on = stripT > 0 && P.state === 'play', am = P.inv[P.weapon];
      if (on && (stripDirty || !H.stripOn || am !== H.stripAm)) { stripDirty = false; H.stripAm = am; drawStrip(H.strip); }
      if (on !== H.stripOn) { H.stripOn = on; H.strip.classList.toggle('on', on); }
      const pw = (S.power.double > 0 ? '2×DMG ' + Math.ceil(S.power.double) : '') + '|' + (S.power.fast > 0 ? 'FAST ' + Math.ceil(S.power.fast) : '');
      if (pw !== H.powKey) {
        H.powKey = pw; H.pow.textContent = '';
        if (S.power.double > 0) { const s = document.createElement('span'); s.style.color = '#d79bff'; s.textContent = '2× DAMAGE ' + Math.ceil(S.power.double); H.pow.appendChild(s); }
        if (S.power.fast > 0) { const s = document.createElement('span'); s.style.color = '#ffbf6e'; s.textContent = 'FAST RELOAD ' + Math.ceil(S.power.fast); H.pow.appendChild(s); }
      }
      const F = S.frenzy, fk = F ? F.got + '/' + F.need + ' ' + Math.ceil(F.left) : '';
      if (fk !== H.frKey) {
        H.frKey = fk; H.fr.hidden = !F;
        if (F) { H.fr.textContent = 'KILL FRENZY ' + F.got + ' / ' + F.need; const s = document.createElement('small'); s.textContent = F.text + ' · ' + Math.ceil(F.left) + ' s'; H.fr.appendChild(s); }
      }
      if (F && performance.now() - H.frAt > 250) placeFrenzy(H);
    },
    render: {
      props(ctx, view, t) {
        for (const pk of S.pickups) if (!pk.removed && X.inView(pk.x, pk.y, 2)) drawPickup(ctx, pk, X.time);
      },
      bodies(ctx, view, t) {
        for (const f of S.fires) if (X.inView(f.x, f.y, f.r + 1)) drawFire(ctx, f, t);
        for (const s of SHELLS) {
          if (!s.on || !X.inView(s.x, s.y, 1)) continue;
          const L = s.big ? 0.17 : 0.11, Wd = s.big ? 0.075 : 0.045, c = Math.cos(s.rot), n = Math.sin(s.rot), sc = 1 + s.z * 0.15;
          const ax = c * L / 2 * sc, ay = n * L / 2 * sc, bx = -n * Wd / 2 * sc, by = c * Wd / 2 * sc, y = s.y - s.z * 0.3;
          ctx.globalAlpha = s.t > 10 ? Math.max(0, (12 - s.t) / 2) : 1;
          ctx.fillStyle = s.c;
          ctx.beginPath(); ctx.moveTo(s.x + ax + bx, y + ay + by); ctx.lineTo(s.x + ax - bx, y + ay - by); ctx.lineTo(s.x - ax - bx, y - ay - by); ctx.lineTo(s.x - ax + bx, y - ay + by); ctx.closePath(); ctx.fill();
        }
        ctx.globalAlpha = 1;
      },
      peds(ctx, view, t) {
        if (X.has('peds')) return;
        for (const p of X.peds) if (p.weapon && p.weapon !== 'pistol' && !p.dead && !p.removed && !p.hidden && !p.car && X.inView(p.x, p.y, 2)) S.drawHeld(ctx, p);
      },
      air(ctx, view, t) {
        for (const sw of swings) {
          const k = sw.life / sw.max, a0 = sw.a - 0.9 + (1 - k) * 0.6;
          ctx.strokeStyle = sw.bat ? `rgba(255,236,200,${0.7 * k})` : `rgba(255,255,255,${0.6 * k})`; ctx.lineWidth = sw.bat ? 0.16 : 0.1;
          ctx.beginPath(); ctx.arc(sw.x, sw.y, sw.r, a0, a0 + 1.2); ctx.stroke();
        }
        ctx.lineCap = 'round';
        for (const tr of tracers) {   // the faint trail; the hot head is drawn in overlay, above the night
          if (!X.inView((tr.x0 + tr.x1) / 2, (tr.y0 + tr.y1) / 2, 30)) continue;
          ctx.strokeStyle = `rgba(${tr.c},${0.4 * tr.life / tr.max})`; ctx.lineWidth = tr.w;
          ctx.beginPath(); ctx.moveTo(tr.x0, tr.y0); ctx.lineTo(tr.x1, tr.y1); ctx.stroke();
        }
        ctx.lineCap = 'butt';
        for (const pr of S.projectiles) if (X.inView(pr.x, pr.y, 2)) drawProjectile(ctx, pr, t);
        for (const b of bolts) if (X.inView(b.pts[0], b.pts[1], 20)) drawBolt(ctx, b, 0);
        for (const f of flashes) if (X.inView(f.x, f.y, 2)) drawFlash(ctx, f);
        // lights for the night (lighting.js renders them)
        for (const f of flashes) if (X.inView(f.x, f.y, 6)) X.addLight(f.x, f.y, 5 * f.s, f.c, f.life / f.max);
        for (const pr of S.projectiles) if (pr.kind !== 'grenade' && X.inView(pr.x, pr.y, 8)) X.addLight(pr.x, pr.y, pr.kind === 'rocket' ? 6 : 2.5, '#ffa040', 0.85);
        for (const f of S.fires) if (X.inView(f.x, f.y, 10)) X.addLight(f.x, f.y, f.r * 3.6, '#ff7a28', 0.85 * Math.min(1, f.life / 1.2) * (0.85 + 0.15 * Math.sin(t * 17 + f.x)));
        for (const b of bolts) { const n = b.pts.length; if (X.inView(b.pts[n - 2], b.pts[n - 1], 8)) X.addLight(b.pts[n - 2], b.pts[n - 1], 7, '#8fd0ff', b.life / b.max); }
        let lit = 0;
        for (const pk of S.pickups) if (!pk.removed && lit < PK_LIGHTS && X.inView(pk.x, pk.y, 3)) { lit++; X.addLight(pk.x, pk.y, 2.4, PK_COLORS[pk.kind] || '#fff', 0.55); }
        if (!X.setOnFire) for (const p of X.peds) if (p.onFire > 0 && !p.hidden && !p.removed && X.inView(p.x, p.y, 4)) X.addLight(p.x, p.y, 4, '#ff7a28', 0.8);
      },
      overlay(ctx, view, t) {
        // what glows at night stays bright: hot tracer heads, the white core of electro bolts, rocket exhausts
        ctx.lineCap = 'round';
        for (const tr of tracers) {
          if (!X.inView((tr.x0 + tr.x1) / 2, (tr.y0 + tr.y1) / 2, 30)) continue;
          const k = tr.life / tr.max, hx = tr.x0 + (tr.x1 - tr.x0) * 0.65, hy = tr.y0 + (tr.y1 - tr.y0) * 0.65;
          ctx.strokeStyle = `rgba(255,255,235,${k})`; ctx.lineWidth = tr.w * 1.6;
          ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tr.x1, tr.y1); ctx.stroke();
        }
        ctx.lineCap = 'butt';
        for (const b of bolts) if (X.inView(b.pts[0], b.pts[1], 20)) drawBolt(ctx, b, 1);
        for (const pr of S.projectiles) {
          if (!X.inView(pr.x, pr.y, 2)) continue;
          if (pr.kind === 'rocket') {
            const fl = 0.7 + 0.3 * Math.sin(t * 60), c = Math.cos(pr.th), s = Math.sin(pr.th), bx = pr.x - c * 0.32, by = pr.y - s * 0.32;
            ctx.fillStyle = '#ffd06a'; ctx.beginPath(); ctx.moveTo(bx - s * 0.06, by + c * 0.06); ctx.lineTo(bx - c * 0.45 * fl, by - s * 0.45 * fl); ctx.lineTo(bx + s * 0.06, by - c * 0.06); ctx.closePath(); ctx.fill();
          } else if (pr.kind === 'grenade' && Math.floor(t * (pr.fuse - pr.t < 0.8 ? 16 : 6)) % 2 === 0) {
            const sc = 1 + pr.z * 0.1;
            ctx.fillStyle = '#ff3a2a'; ctx.beginPath(); ctx.arc(pr.x, pr.y, 0.06 * sc, 0, TAU); ctx.fill();
          }
        }
        // where a grenade or molotov would land (mouse aiming on foot)
        const w = spec(P.weapon), p = P.ped;
        if (w && w.kind === 'throw' && p && !P.car && P.state === 'play' && X.input.mouseActive()) {
          const dx = X.mouse.wx - p.x, dy = X.mouse.wy - p.y, d = Math.hypot(dx, dy) || 1, k = cl(d, 2, w.range) / d;
          const lx = p.x + dx * k, ly = p.y + dy * k;
          ctx.strokeStyle = w.id === 'grenade' ? 'rgba(160,220,120,0.5)' : 'rgba(255,150,60,0.5)'; ctx.lineWidth = 0.08; ctx.setLineDash([0.35, 0.3]);
          ctx.beginPath(); ctx.arc(lx, ly, 1.1 + 0.1 * Math.sin(t * 6), 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        }
        const a = S.assist; if (!a || a.removed || a.dead) return;
        const r = a.kind === 'car' ? Math.max(a.len, a.wid) / 2 + 0.4 : 0.75, q = r * 0.45, pulse = 1 + 0.08 * Math.sin(t * 10);
        ctx.save(); ctx.translate(a.x, a.y); ctx.scale(pulse, pulse);
        ctx.strokeStyle = 'rgba(255,60,40,0.9)'; ctx.lineWidth = 0.09;
        for (let i = 0; i < 4; i++) {
          const sx = i & 1 ? 1 : -1, sy = i & 2 ? 1 : -1;
          ctx.beginPath(); ctx.moveTo(sx * r, sy * (r - q)); ctx.lineTo(sx * r, sy * r); ctx.lineTo(sx * (r - q), sy * r); ctx.stroke();
        }
        ctx.restore();
      },
      screen(ctx) {   // core only draws the crosshair on foot: add one for mouse drive-bys
        const w = spec(P.weapon);
        if (!P.car || P.state !== 'play' || !X.input.mouseActive() || !(w && w.driveBy ? w.id : bestDriveBy())) return;
        const m = X.mouse;
        ctx.strokeStyle = 'rgba(255,230,140,0.9)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(m.sx, m.sy, 8, 0, TAU); ctx.moveTo(m.sx - 13, m.sy); ctx.lineTo(m.sx - 5, m.sy); ctx.moveTo(m.sx + 5, m.sy); ctx.lineTo(m.sx + 13, m.sy);
        ctx.moveTo(m.sx, m.sy - 13); ctx.lineTo(m.sx, m.sy - 5); ctx.moveTo(m.sx, m.sy + 5); ctx.lineTo(m.sx, m.sy + 13); ctx.stroke();
      },
    },
  });
})(typeof window !== 'undefined' ? (window.PG = window.PG || {}) : (globalThis.PG = globalThis.PG || {}));
