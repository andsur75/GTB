// Damage, fire and explosions for Grand Theft Bus. Cars dent where they are hit (crumpled panels, a
// cracked windscreen, dead headlights, a dangling bumper, bullet holes), smoke grey then black, lose
// power and cough, then catch fire and blow up after a burning fuse that gives the driver time to bail,
// leaving a smouldering wreck that can still be shoved around (flying bonnet and a runaway wheel
// included). Explosions fling people and cars, scorch the street, break lamps, burn trees and set off
// chain reactions. Red barrels, gas cans and propane tanks (shoot one and it takes off) sit in little
// clusters around the city; people, trees, leaked fuel trails and the ground itself burn.
// Owns X.explode, X.destroyCar and X.setOnFire; adds X.props, X.hitProp, X.addProp, X.fireAt,
// X.carDamageStage and X.damage (state + stats).
(function (PG) {
  if (typeof document === 'undefined') return;
  const X = PG.gta;
  if (!X) return;
  const { cl, rand, TAU } = X.util;
  const G = () => PG.game;
  const P = X.player;
  const SMOKE_AT = 0.45, BLACK_AT = 0.25, FIRE_AT = 0.12, SLOW = 0.25;
  const hr = (s, i) => { const v = Math.sin(s * 127.1 + i * 311.7) * 43758.5453; return v - Math.floor(v); };

  // ================= particles: a fixed pool in typed arrays =================
  const NP = 1400, K_SMOKE = 1, K_BLACK = 2, K_FLAME = 3, K_EMBER = 4, K_SPARK = 5;
  const PK = new Uint8Array(NP), PF = new Uint8Array(NP);   // PF: ember lights a fire / spark colour index
  const PX = new Float32Array(NP), PY = new Float32Array(NP), PVX = new Float32Array(NP), PVY = new Float32Array(NP);
  const PL = new Float32Array(NP), PM = new Float32Array(NP), PS0 = new Float32Array(NP), PS1 = new Float32Array(NP), PA = new Float32Array(NP);
  let pCur = 0, Q = 1, frameEma = 1 / 60, lastFrame = 0;   // Q: quality, drops when the frame rate does
  function emit(k, x, y, vx, vy, life, s0, s1, a, flag) {
    if (Q < 1 && k !== K_EMBER && Math.random() > Q) return;
    const i = pCur; pCur = pCur + 1 === NP ? 0 : pCur + 1;
    PK[i] = k; PX[i] = x; PY[i] = y; PVX[i] = vx; PVY[i] = vy; PL[i] = life; PM[i] = life; PS0[i] = s0; PS1[i] = s1; PA[i] = a; PF[i] = flag || 0;
  }
  const flame = (x, y, s, life, vx, vy) => emit(K_FLAME, x, y, (vx || 0) + wind.x * 0.5 + rand(-0.5, 0.5), (vy || 0) + wind.y * 0.5 + rand(-0.5, 0.5), life, s, s * 0.3, rand(0.75, 1));
  const smoke = (x, y, black, s, life, vx, vy) => emit(black ? K_BLACK : K_SMOKE, x, y, (vx || 0) + rand(-0.4, 0.4), (vy || 0) + rand(-0.4, 0.4), life, s, s * (black ? 3.1 : 2.9), black ? rand(0.6, 0.85) : rand(0.5, 0.7));

  // soft radial sprites, drawn scaled in world units (cheaper and nicer than flat arcs). Smoke and halos
  // are the biggest blits in a fire scene, so their gradients end tight (drawn at SMOKE_K / HALO_K of the
  // nominal size): same look, about half the pixels for a software rasteriser to blend.
  const SMOKE_K = 0.8, HALO_K = 0.72;
  let SPR = null;
  function sprite(stops) {
    const n = 64, cv = document.createElement('canvas'); cv.width = cv.height = n;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    for (const s of stops) gr.addColorStop(s[0], s[1]);
    g.fillStyle = gr; g.fillRect(0, 0, n, n);
    return cv;
  }
  function sprites() {
    return SPR || (SPR = {
      smoke: sprite([[0, 'rgba(178,178,182,0.85)'], [0.375, 'rgba(165,165,170,0.6)'], [0.8, 'rgba(150,150,156,0.2)'], [1, 'rgba(140,140,146,0)']]),
      black: sprite([[0, 'rgba(14,12,11,0.95)'], [0.375, 'rgba(18,16,15,0.7)'], [0.8, 'rgba(24,22,20,0.22)'], [1, 'rgba(30,28,26,0)']]),
      halo: sprite([[0, 'rgba(255,165,70,0.55)'], [0.62, 'rgba(255,105,30,0.2)'], [0.86, 'rgba(255,80,24,0.06)'], [1, 'rgba(255,70,20,0)']]),
      hot: sprite([[0, 'rgba(255,255,235,1)'], [0.3, 'rgba(255,228,130,0.95)'], [0.65, 'rgba(255,140,40,0.5)'], [1, 'rgba(255,80,10,0)']]),
      mid: sprite([[0, 'rgba(255,212,110,0.95)'], [0.4, 'rgba(255,130,40,0.7)'], [1, 'rgba(220,50,10,0)']]),
      cool: sprite([[0, 'rgba(255,120,40,0.8)'], [0.5, 'rgba(190,50,15,0.45)'], [1, 'rgba(120,20,5,0)']]),
      ground: sprite([[0, 'rgba(255,120,30,0.65)'], [0.35, 'rgba(160,40,10,0.45)'], [0.8, 'rgba(40,12,6,0.35)'], [1, 'rgba(20,10,6,0)']]),
    });
  }

  // ================= state =================
  let props = [], clusters = [], fires = [], treeFires = [], blasts = [], pend = [], chunks = [], fuel = [], rockets = [], pops = [];
  let treeGrid = new Map(), wind = { x: 0.6, y: -0.3 }, fx = 0, fy = 0, slowAcc = 0, spawnAcc = 0, cleanAcc = 0;
  let propsDirty = false, chainN = 0, chainCars = 0, chainT = -99, externalHits = false, lastBoom = -9, fireNear = 0, beepAcc = 0, busJoke = false;
  // who caused each recent explosion: a burning ember carries its slot (PF = slot + 1) to the fire it starts
  const EMBER_BY = new Array(16).fill(null);
  let byCur = 0;
  let warnEl = null, warnKey = null, warnW = '', warnTop = -1, placeT = 0;
  const stats = { explosions: 0, carsDestroyed: 0, propsBlown: 0, chainMax: 0, carFires: 0, pedFires: 0, treeFires: 0, rockets: 0 };
  X.props = props;
  X.damage = { stats, get quality() { return Q; }, get props() { return props; }, get fires() { return fires; }, get clusters() { return clusters; }, get fuel() { return fuel; }, get blasts() { return blasts; }, get treeFires() { return treeFires; }, get rockets() { return rockets; }, particles: () => { let n = 0; for (let i = 0; i < NP; i++) if (PK[i]) n++; return n; } };

  // ================= small helpers =================
  // distance from a point to a car's body box (0 inside)
  function carDistAt(c, cx, cy, x, y) {
    const cs = Math.cos(c.th), sn = Math.sin(c.th), dx = x - cx, dy = y - cy;
    const lx = Math.abs(dx * cs + dy * sn) - c.len / 2, ly = Math.abs(-dx * sn + dy * cs) - c.wid / 2;
    return Math.hypot(lx > 0 ? lx : 0, ly > 0 ? ly : 0);
  }
  const carDist = (c, x, y) => carDistAt(c, c.x, c.y, x, y);
  const notProp = s => s.kind !== 'prop';
  const heavy = c => c.maxHp >= 2500;
  const isEV = c => !!(c.def && c.def.dyn && c.def.dyn.type === 'ev');
  const powerOf = c => { const m = c.model; return m.kind === 'bus' ? 1.45 : m.kind === 'fire' ? 1.35 : m.kind === 'armored' ? 1.3 : m.box || m.kind === 'sports' ? 1.15 : 1; };
  const engineX = c => c.model.kind === 'bus' ? -c.len * 0.4 : c.len * 0.3;
  let TX = 0, TY = 0;   // scratch result of local -> world
  function toW(c, lx, ly) { const cs = Math.cos(c.th), sn = Math.sin(c.th); TX = c.x + cs * lx - sn * ly; TY = c.y + sn * lx + cs * ly; }
  function carVel(c) { if (c.dv) { TX = c.dv.vx; TY = c.dv.vy; } else if (c.ctrl === 'path') { TX = Math.cos(c.th) * c.v; TY = Math.sin(c.th) * c.v; } else { TX = 0; TY = 0; } }
  const seen = (x, y, pad) => X.inView(x, y, pad);

  // trees: our own grid (the city hash keeps only their solids)
  function buildTreeGrid() {
    treeGrid = new Map();
    for (const tr of X.city.trees) { const k = (Math.floor(tr.x / 20) + 512) * 4096 + Math.floor(tr.y / 20) + 512; let a = treeGrid.get(k); if (!a) treeGrid.set(k, a = []); a.push(tr); }
  }
  const scratch = [];
  function treesNear(x, y, r) {
    scratch.length = 0;
    for (let gx = Math.floor((x - r) / 20); gx <= Math.floor((x + r) / 20); gx++) for (let gy = Math.floor((y - r) / 20); gy <= Math.floor((y + r) / 20); gy++) {
      const a = treeGrid.get((gx + 512) * 4096 + gy + 512); if (!a) continue;
      for (const tr of a) if (!tr.gone && Math.abs(tr.x - x) < r && Math.abs(tr.y - y) < r && Math.hypot(tr.x - x, tr.y - y) < r) scratch.push(tr);
    }
    return scratch;
  }

  // ================= audio (one-shots only: nothing to stop on pause or mute) =================
  function voice(x, y, range) {
    const k = PG.audio.kit(); if (!k) return null;
    const d = Math.hypot(x - fx, y - fy), vol = 1 / (1 + (d / range) * (d / range));
    if (vol < 0.03) return null;
    let dest = k.master;
    if (k.ctx.createStereoPanner) { const p = k.ctx.createStereoPanner(); p.pan.value = cl((x - fx) / 45, -0.85, 0.85); p.connect(k.master); dest = p; }
    return { k, t: k.now, dest, vol, d };
  }
  function sfxBoom(x, y, pw) {
    if (Math.abs(X.time - lastBoom) < 0.05) return;
    lastBoom = X.time;
    const s = voice(x, y, 32); if (!s) return;
    const { k, t, dest } = s, v = s.vol * Math.min(1.3, 0.55 + pw * 0.5), lp = 350 + 5200 / (1 + s.d / 14);
    k.tone('sine', rand(80, 115), t, 0.9 + pw * 0.4, 0.8 * v, { to: 26, dest });
    k.noise(t, 1.1 + pw * 0.5, 0.75 * v, 'lowpass', lp, { to: 70, dest });
    if (s.d < 45) k.noise(t, 0.1, 0.45 * v, 'highpass', 2200, { dest });
    for (let i = 0; i < 4; i++) k.noise(t + 0.3 + Math.random() * 0.7, 0.05, 0.1 * v, 'bandpass', rand(1500, 4200), { Q: 4, dest });
  }
  function sfxWhoomp(x, y, big) {
    const s = voice(x, y, 18); if (!s) return;
    s.k.noise(s.t, 0.7, (big ? 0.45 : 0.22) * s.vol, 'lowpass', 300, { to: 1800, attack: 0.12, dest: s.dest });
    s.k.tone('sine', 55, s.t, 0.5, (big ? 0.25 : 0.12) * s.vol, { to: 110, attack: 0.08, dest: s.dest });
  }
  function sfxBackfire(x, y) {
    const s = voice(x, y, 16); if (!s) return;
    s.k.noise(s.t, 0.13, 0.5 * s.vol, 'lowpass', 1500, { to: 200, dest: s.dest });
    s.k.tone('square', 72, s.t, 0.08, 0.18 * s.vol, { lp: 500, dest: s.dest });
  }
  function sfxPing(x, y) {
    const s = voice(x, y, 14); if (!s) return;
    s.k.tone('triangle', 2100, s.t, 0.3, 0.12 * s.vol, { to: 1600, dest: s.dest }); s.k.tone('sine', 3300, s.t, 0.18, 0.05 * s.vol, { dest: s.dest });
  }
  function sfxHiss(x, y, dur) { const s = voice(x, y, 16); if (s) s.k.noise(s.t, dur, 0.22 * s.vol, 'highpass', 4500, { attack: 0.03, dest: s.dest }); }
  function sfxFire(vol) {
    const k = PG.audio.kit(); if (!k) return;
    const t = k.now;
    k.noise(t, 0.45, Math.min(0.2, 0.12 * vol), 'bandpass', rand(250, 420), { Q: 0.7, attack: 0.15 });
    for (let i = 0; i < 3; i++) if (Math.random() < vol * 1.5) k.noise(t + Math.random() * 0.25, 0.025, Math.min(0.22, 0.16 * vol), 'highpass', rand(2500, 5000));
  }
  function sfxWhistle(x, y, dur) {
    const s = voice(x, y, 20); if (!s) return;
    s.k.tone('sine', rand(700, 1000), s.t, dur, 0.06 * s.vol, { to: rand(2200, 3000), dest: s.dest });
    s.k.noise(s.t, dur * 0.8, 0.08 * s.vol, 'highpass', 3500, { dest: s.dest });
  }
  function sfxPop(x, y) {
    const s = voice(x, y, 26); if (!s) return;
    s.k.noise(s.t, 0.14, 0.5 * s.vol, 'lowpass', 3200, { to: 400, dest: s.dest });
    s.k.tone('sine', 170, s.t, 0.22, 0.28 * s.vol, { to: 55, dest: s.dest });
    for (let i = 0; i < 6; i++) s.k.noise(s.t + 0.15 + Math.random() * 0.6, 0.02, 0.12 * s.vol, 'highpass', rand(3000, 6000), { dest: s.dest });
  }
  function sfxAlarm() { const k = PG.audio.kit(); if (!k) return; const t = k.now; k.tone('square', 1320, t, 0.07, 0.045, { lp: 3000 }); k.tone('square', 990, t + 0.11, 0.07, 0.045, { lp: 3000 }); }

  // ================= car damage model =================
  function dmgOf(c) {
    return c.dmg || (c.dmg = { f: 0, b: 0, l: 0, r: 0, dents: [], holes: [], glass: 0, gx: 0, gy: 0, lights: 0, tails: 0, bumperF: 0, bumperB: 0, soot: 0, seed: Math.random() * 1000 });
  }
  // A hit at world point (wx, wy): dent the panel facing it; knocks out glass, lights and bumpers.
  function addDentAt(c, wx, wy, amt) {
    const d = dmgOf(c), cs = Math.cos(c.th), sn = Math.sin(c.th), dx = wx - c.x, dy = wy - c.y, hl = c.len / 2, hw = c.wid / 2;
    let lx = dx * cs + dy * sn, ly = -dx * sn + dy * cs;
    const u = lx / hl, v = ly / hw;
    lx = cl(lx, -hl + 0.2, hl - 0.2); ly = cl(ly, -hw + 0.15, hw - 0.15);
    const zone = Math.abs(u) >= Math.abs(v) ? (u > 0 ? 'f' : 'b') : (v < 0 ? 'l' : 'r');
    d[zone] = Math.min(1, d[zone] + amt);
    if (d.dents.length >= 10) d.dents.shift();
    d.dents.push({ x: lx, y: ly, s: 0.2 + Math.min(0.45, amt * 0.8), a: Math.random() * 3 });
    let shards = false;
    if (zone === 'f') {
      if (amt > 0.15 && d.glass < 2) { if (!d.glass) { d.gx = rand(-0.6, 0.6); d.gy = ly * 0.6; } const was = d.glass; d.glass = Math.min(2, d.glass + amt * 1.7); if (was < 1 && d.glass >= 1) shards = true; }
      if (amt > 0.14) { const b = v < -0.3 ? 1 : v > 0.3 ? 2 : (amt > 0.3 ? (Math.random() < 0.5 ? 1 : 2) : 0); if (b && !(d.lights & b)) { d.lights |= b; shards = true; } }
      if (d.f > 0.5 && !d.bumperF) d.bumperF = v < 0 ? 1 : -1;
    } else if (zone === 'b') {
      if (amt > 0.14) { const b = v < -0.3 ? 1 : v > 0.3 ? 2 : (amt > 0.3 ? (Math.random() < 0.5 ? 1 : 2) : 0); if (b && !(d.tails & b)) { d.tails |= b; shards = true; } }
      if (d.b > 0.5 && !d.bumperB) d.bumperB = v < 0 ? 1 : -1;
    }
    if (shards) { X.decal(wx, wy, 'glass', 0.7); if (seen(wx, wy, 5)) PG.burst(wx, wy, 'debris', 6, 3, 0.6, 0.12, ['#cfe3ef', '#9fc0d6', '#ffffff']); }
  }
  // Bullet hole on the side facing the shooter.
  function addHole(c, by) {
    const d = dmgOf(c), hl = c.len / 2, hw = c.wid / 2;
    let a = Math.random() * TAU;
    const src = by && by.x != null ? by : by && by.owner && by.owner.x != null ? by.owner : null;
    if (src) { const cs = Math.cos(c.th), sn = Math.sin(c.th), dx = src.x - c.x, dy = src.y - c.y; a = Math.atan2(-dx * sn + dy * cs, dx * cs + dy * sn) + rand(-0.5, 0.5); }
    const ca = Math.cos(a), sa = Math.sin(a), k = 1 / Math.max(Math.abs(ca) / (hl - 0.25), Math.abs(sa) / (hw - 0.2));
    if (d.holes.length >= 14) d.holes.shift();
    d.holes.push({ x: ca * k * rand(0.6, 0.95), y: sa * k * rand(0.6, 0.95) });
    if (Math.random() < 0.18) { if (!d.glass) { d.gx = rand(-0.6, 0.6); d.gy = rand(-0.3, 0.3); } d.glass = Math.min(2, d.glass + 0.35); }
  }
  X.carDamageStage = function (c) {
    if (!c) return 'ok';
    if (c.wrecked) return 'wreck';
    if (c.burning > 0) return 'fire';
    const f = c.hp / c.maxHp;
    return f < BLACK_AT ? 'black' : f < SMOKE_AT ? 'smoke' : 'ok';
  };
  // Engine power from health: full down to 50 %, then down to half; dyn is per vehicle (PG.dynFor copy).
  function applyPower(c, f) {
    const dv = c.dv; if (!dv) return;
    const d = dv.dyn;
    if (f >= 0.999) {
      if (d._base) { d.kw = d._base.kw; if (d._base.nm != null) d.nm = d._base.nm; if (d._base.g0 != null) d.g0 = d._base.g0; d._base = null; d._pf = 1; }
      return;
    }
    if (!d._base) d._base = { kw: d.kw, nm: d.nm, g0: d.g0 };
    if (d._pf === f) return;
    d._pf = f; d.kw = d._base.kw * f;
    if (d._base.nm != null) d.nm = d._base.nm * f;
    if (d._base.g0 != null) d.g0 = d._base.g0 * f;
  }

  // ================= burning cars, destruction =================
  function ignite(c, fuse, by) {
    if (!c || c.wrecked || c.removed || !X.active) return;
    if (c.burning > 0) { if (fuse < c.burning) c.burning = fuse; return; }
    c.burning = fuse; c.burnMax = fuse; c.burnT = 0; c.bailed = false; c.bailT = rand(0.5, 1.3);
    c.fireBy = by || c.lastBy || null;
    c.hp = Math.min(c.hp, c.maxHp * FIRE_AT);
    dmgOf(c);
    stats.carFires++;
    if (seen(c.x, c.y, 10)) { toW(c, engineX(c), 0); for (let i = 0; i < 10; i++) flame(TX + rand(-0.6, 0.6), TY + rand(-0.6, 0.6), rand(0.5, 0.9), rand(0.3, 0.6)); }
    sfxWhoomp(c.x, c.y, true);
    X.emit('onFire', { ent: c });
  }
  function extinguish(c) { c.burning = 0; c.burnT = 0; c.bailed = false; }
  // NPCs bail out of a burning car; some of them on fire.
  function bail(c) {
    if (!(c.npcDriver || (c.driver && !c.driver.isPlayer))) return;
    const out = X.ejectOccupants(c, 'fire');
    for (const p of out) if (Math.random() < 0.3) ignitePed(p, rand(3, 5), c.fireBy);
    c.ai = null;
  }
  function chunk(type, x, y, vx, vy, vz, color, w, h) {
    if (chunks.length >= 40) chunks.shift();
    chunks.push({ type, x, y, vx, vy, z: 0.4, vz, rot: type === 'wheel' ? Math.atan2(vy, vx) : rand(0, TAU), vr: type === 'wheel' ? 0 : rand(-12, 12), w, h, color, t: 0, life: rand(20, 30) });
  }
  function explodeCar(c, by) {
    if (!c || c.wrecked || c.removed) return;
    const occ = X.occupants(c);
    // abstract NPCs still inside come out as bodies
    const bodies = [];
    if (c.npcDriver) {
      const n = 1 + (c.npcDriver.extra || 0);
      for (let k = 0; k < n; k++) {
        const s = X.doorSpot(c, k % 2 ? 1 : -1) || { x: c.x, y: c.y };
        bodies.push(X.makePed({ x: s.x, y: s.y, th: rand(0, TAU), look: k ? X.randomLook() : c.npcDriver.look, team: c.npcDriver.team || 'civ', fromCar: c, dmgBody: true }));
      }
      c.npcDriver = null;
    }
    c.wrecked = true; c.hp = 0; c.burning = 0; c.siren = false; c.ai = null; c.lightsOn = false; c.braking = false;
    X.toPhys(c);
    c.wreckT = X.time; c.hopT = X.time; c.hopA = 1; c.smoulder = rand(7, 11) * (isEV(c) ? 1.6 : 1); c.smokeT = 40;
    const d = dmgOf(c); d.soot = 1; d.glass = 2; d.lights = 3; d.tails = 3;
    stats.carsDestroyed++;
    X.emit('carDestroyed', { car: c, by, kind: 'explosion' });
    if (X.byPlayer(by)) X.crime('destroyCar', c.x, c.y, { car: c });
    X.explode(c.x, c.y, { by, power: powerOf(c), source: c });
    for (const o of occ) X.damagePed(o, 200, by, 'explosion');
    for (const p of bodies) if (!p.dead) X.damagePed(p, 200, by, 'explosion');
    if (c.dv) c.dv.r += rand(-1.4, 1.4);
    if (isEV(c) && seen(c.x, c.y, 10)) PG.burst(c.x, c.y, 'spark', 40, 12, 0.9, 0.1);
    // flying parts: the bonnet, a door, and one wheel that rolls off down the street
    if (seen(c.x, c.y, 30)) {
      const a = rand(0, TAU), b = a + rand(1.5, 4.5), w = rand(0, TAU);
      chunk('hood', c.x, c.y, Math.cos(a) * rand(4, 8), Math.sin(a) * rand(4, 8), rand(7, 11), c.color, Math.min(1.4, c.len * 0.26), c.wid * 0.8);
      chunk('door', c.x, c.y, Math.cos(b) * rand(5, 9), Math.sin(b) * rand(5, 9), rand(5, 8), c.color, 1.05, 0.16);
      chunk('wheel', c.x, c.y, Math.cos(w) * rand(7, 10), Math.sin(w) * rand(7, 10), rand(3, 5), '#151515', 0.68, 0.26);
    }
    if (X.byPlayer(by)) {
      bumpChain(c.x, c.y, true);
      X.money(20 * Math.min(chainN, 10), 'mayhem', c.x, c.y);
      if (c.model.kind === 'bus' && !busJoke) { busJoke = true; X.floatText(c.x, c.y - 3.6, 'TAKE THE BUS? NOT THAT ONE.', '#ffb02e', { life: 2.8, size: 16 }); }
    }
  }
  X.destroyCar = function (c, by, kind) {
    if (!c || c.wrecked || c.removed) return;
    if (by) c.lastBy = by;
    if (kind === 'bomb' || kind === 'instant' || !X.active) return explodeCar(c, by || c.lastBy);
    ignite(c, kind === 'explosion' ? rand(0.5, 1.2) : rand(2.6, 3.6), by || c.lastBy);
  };
  X.blowUp = (c, by) => explodeCar(c, by);

  // ================= people on fire =================
  function ignitePed(p, s, by) {
    if (!p || p.removed || p.hidden || p.car || !X.active) return false;
    if (p.isPlayer && (P.state !== 'play' || p !== P.ped)) return false;
    if (!p.dead && p.fireImmune > X.time) return false;
    if (p.dead && p.deadT > 4) return false;
    s = s || rand(4, 7);
    if (p.isPlayer) s = Math.min(s, 3.2);
    if (p.dead) s = Math.min(s, 2.5);
    const was = p.onFire > 0;
    p.onFire = Math.max(p.onFire || 0, s);
    if (by) p.fireBy = by;
    if (!was) { stats.pedFires++; X.emit('onFire', { ent: p }); if (!p.dead) sfxWhoomp(p.x, p.y, false); }
    return true;
  }
  const CHAR = { skin: '#2b2520', hair: '#141110', shirt: '#26211d', pants: '#1b1816', hat: null };

  // ================= ground fires, trees, fuel trails =================
  function fireAt(x, y, o) {
    o = o || {};
    if (!X.active || fires.length >= 32) return null;
    if (X.blocked(x, y, 0)) return null;
    const r = o.r || 1, life = o.life || rand(4, 7);
    for (const f of fires) {
      if (Math.abs(f.x - x) < 1.5 && Math.abs(f.y - y) < 1.5 && Math.hypot(f.x - x, f.y - y) < Math.max(f.r, r) * 0.6) {
        f.life = Math.max(f.life, life); f.max = Math.max(f.max, f.life); f.r = Math.max(f.r, r); if (o.by) f.by = o.by; return f;
      }
    }
    const f = { x, y, r, life, max: life, by: o.by || null, acc: 0, sacc: 0, seed: Math.random() * 100 };
    fires.push(f);
    if (r >= 0.9 && o.scorch !== false) X.decal(x, y, 'scorch', r * 1.1);
    return f;
  }
  X.fireAt = fireAt;
  function igniteTree(tr, by) {
    if (!tr || tr.burnt || tr.burning || tr.gone || treeFires.length >= 14) return false;
    tr.burning = true; stats.treeFires++;
    treeFires.push({ tr, t: 0, life: rand(7, 11), by: by || null, acc: 0 });
    return true;
  }
  function leakFuel(c, dt) {
    carVel(c);
    const sp = Math.hypot(TX, TY);
    if (sp < 1.2) return;
    c._leak = (c._leak || 0) + sp * dt;
    if (c._leak < 1.2) return;
    c._leak = 0;
    toW(c, -c.len * 0.25, rand(-0.25, 0.25));
    if (fuel.length >= 180) fuel.shift();
    fuel.push({ x: TX, y: TY, t: X.time, s: rand(0.3, 0.45), lit: 0, done: false, car: c, by: c.lastBy || null });
  }
  function lightFuelNear(x, y, r, by) {
    for (const s of fuel) if (!s.done && !s.lit && Math.abs(s.x - x) < r && Math.abs(s.y - y) < r && Math.hypot(s.x - x, s.y - y) < r) { s.lit = X.time + 0.12; if (by && !s.by) s.by = by; }
  }

  // ================= explosive props =================
  const PROP_T = { barrel: { r: 0.42, hp: 20, power: 0.9 }, gas: { r: 0.3, hp: 12, power: 0.55 }, propane: { r: 0.36, hp: 26, power: 1.25 }, fireworks: { r: 0.4, hp: 10, power: 0 } };
  function addProp(type, x, y, o) {
    const T = PROP_T[type] || PROP_T.barrel;
    const pr = Object.assign({ id: ++X.uid, kind: 'prop', type: PROP_T[type] ? type : 'barrel', x, y, r: T.r, hp: T.hp, maxHp: T.hp, power: T.power, dead: false, armed: false, heat: 0, by: null, leak: 0, rot: rand(0, TAU), tint: Math.random(), cluster: null, solid: null, fly: null }, o);
    const oct = [];
    for (let k = 0; k < 8; k++) oct.push({ x: x + Math.cos(k * Math.PI / 4) * pr.r * 0.95, y: y + Math.sin(k * Math.PI / 4) * pr.r * 0.95 });
    pr.solid = { kind: 'prop', poly: oct, prop: pr };
    PG.cityPut(X.city, pr.solid);
    props.push(pr);
    return pr;
  }
  X.addProp = addProp;
  function removeSolid(pr) { if (pr.solid) { PG.cityRemove(X.city, pr.solid); pr.solid = null; } }
  X.removeProp = pr => { if (pr && !pr.dead) { pr.dead = true; removeSolid(pr); propsDirty = true; } };
  function armProp(pr, by, delay) {
    if (pr.dead || pr.armed) return;
    pr.armed = true; if (by) pr.by = by;
    pend.push({ t: X.time + delay, pr });
  }
  function blowProp(pr) {
    if (pr.dead) return;
    if (pr.type === 'fireworks') return startShow(pr);
    pr.dead = true; removeSolid(pr); propsDirty = true;
    stats.propsBlown++;
    if (X.byPlayer(pr.by)) bumpChain(pr.x, pr.y);
    X.explode(pr.x, pr.y, { by: pr.by, power: pr.power, source: pr });
  }
  function heatProp(pr, amt, by) {
    if (pr.dead || pr.armed || pr.fly) return;
    pr.heat += amt; if (by) pr.by = by;
    if (pr.heat >= 1) armProp(pr, by, 0.05);
  }
  // Propane with a shot-off valve takes off like a rocket, bounces off walls and blows up.
  function launch(pr, by) {
    removeSolid(pr);
    let a = rand(0, TAU);
    const src = by && by.x != null ? by : by && by.owner && by.owner.x != null ? by.owner : null;
    if (src) a = Math.atan2(pr.y - src.y, pr.x - src.x) + rand(-0.35, 0.35);
    pr.fly = { a, sp: 8, t: 0, life: rand(1.0, 1.6), b: 0, acc: 0 };
    pr.rot = a;
    sfxHiss(pr.x, pr.y, pr.fly.life);
  }
  // A crate of 17 May fireworks: set it off and it fires whistling rockets every which way for a few
  // seconds; each one pops into a coloured burst that lights up the street and stings whoever it hits.
  const FW = ['#ff4d6d', '#ffd23a', '#4dd2ff', '#7dff9a', '#ffffff', '#c77dff'];
  function startShow(pr) {
    if (pr.show) return;
    pr.armed = true; pr.show = { t: 0, next: 0, n: 7 + Math.floor(Math.random() * 5), acc: 0 };
    sfxWhoomp(pr.x, pr.y, false);
    stats.propsBlown++;
  }
  function showTick(pr, dt) {
    const s = pr.show;
    s.t += dt; s.next -= dt;
    if (s.next <= 0 && s.n > 0) {
      s.n--; s.next = rand(0.12, 0.32);
      const a = Math.random() * TAU, sp = rand(12, 19), life = rand(0.5, 0.95);
      if (rockets.length >= 40) rockets.shift();
      rockets.push({ x: pr.x + Math.cos(a) * 0.55, y: pr.y + Math.sin(a) * 0.55, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life, col: Math.floor(Math.random() * FW.length), by: pr.by, src: pr });
      stats.rockets++;
      sfxWhistle(pr.x, pr.y, life);
    }
    if (seen(pr.x, pr.y, 6)) { s.acc += dt * 30; while (s.acc >= 1) { s.acc--; const a = Math.random() * TAU, v = rand(1, 4); emit(K_SPARK, pr.x, pr.y, Math.cos(a) * v, Math.sin(a) * v, rand(0.2, 0.45), 0.1, 0.1, 1, Math.random() < 0.5 ? 1 : 4); } }
    if (s.n <= 0 && s.next < -0.6) { pr.dead = true; removeSolid(pr); propsDirty = true; fireAt(pr.x, pr.y, { r: 0.5, life: rand(2, 3.5), by: pr.by, scorch: false }); X.decal(pr.x, pr.y, 'scorch', 0.8); }
  }
  function rocketTick(dt) {
    const k = Math.exp(-0.5 * dt);
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.t += dt; r.vx *= k; r.vy *= k;
      const nx = r.x + r.vx * dt, ny = r.y + r.vy * dt;
      let pop = r.t >= r.life;
      const wall = X.blocked(nx, ny, 0.1);
      if (!wall || wall.prop === r.src) { r.x = nx; r.y = ny; }
      else { pop = true; if (wall.prop) hitPropI(wall.prop, 25, r.by, 'impact'); }   // a rocket into a barrel: you know what happens
      if (r.t > 0.08) {
        for (const p of X.peds) {
          if (p.dead || p.removed || p.hidden || p.car || Math.abs(p.x - r.x) > 0.6 || Math.abs(p.y - r.y) > 0.6) continue;
          if (Math.hypot(p.x - r.x, p.y - r.y) < 0.5) { X.damagePed(p, 14, r.by, 'explosion'); p.knock = Math.max(p.knock || 0, 0.5); p.vx += r.vx * 0.3; p.vy += r.vy * 0.3; pop = true; break; }
        }
        for (const c of X.cars) if (!pop && !c.removed && Math.abs(c.x - r.x) < c.len && Math.abs(c.y - r.y) < c.len && carDist(c, r.x, r.y) < 0.05) { if (!c.wrecked) X.damageCar(c, 30, r.by, 'explosion'); pop = true; }
      }
      if (seen(r.x, r.y, 6)) emit(K_SPARK, r.x, r.y, -r.vx * 0.08 + rand(-0.4, 0.4), -r.vy * 0.08 + rand(-0.4, 0.4), rand(0.25, 0.45), 0.08, 0.08, 0.9, 1);
      if (!pop) continue;
      rockets.splice(i, 1);
      if (seen(r.x, r.y, 10)) for (let j = 0; j < 28; j++) { const a = j / 28 * TAU + rand(-0.1, 0.1), v = rand(4, 8.5); emit(K_SPARK, r.x, r.y, Math.cos(a) * v, Math.sin(a) * v, rand(0.7, 1.3), 0.13, 0.13, 1, Math.random() < 0.8 ? r.col : 4); }
      pops.push({ x: r.x, y: r.y, t0: X.time, col: r.col });
      if (pops.length > 16) pops.shift();
      sfxPop(r.x, r.y);
      for (const p of X.peds) if (!p.dead && !p.removed && !p.hidden && !p.car && Math.abs(p.x - r.x) < 1.3 && Math.abs(p.y - r.y) < 1.3) { X.damagePed(p, 5, r.by, 'fire'); if (Math.random() < 0.15) ignitePed(p, 2.5, r.by); }
    }
    while (pops.length && X.time - pops[0].t0 > 0.7) pops.shift();
  }
  function hitPropI(pr, dmg, by, kind) {
    if (!pr || pr.dead || pr.armed) return false;
    if (by) pr.by = by;
    if (pr.fly) { armProp(pr, by, 0); return true; }
    if (kind === 'fire') { heatProp(pr, Math.max(0.2, dmg / 40), by); return true; }
    pr.hp -= dmg;
    if (pr.hp <= 0) {
      if (pr.type === 'propane' && kind === 'bullet' && Math.random() < 0.65) { launch(pr, by); return true; }
      armProp(pr, by, kind === 'ram' ? 0.03 : rand(0.03, 0.09));
      return true;
    }
    pr.leak = Math.min(3, pr.leak + 1);
    if (seen(pr.x, pr.y, 3)) PG.burst(pr.x, pr.y, 'spark', 6, 5, 0.3, 0.08);
    sfxPing(pr.x, pr.y);
    if (kind === 'bullet' && pr.type !== 'gas' && Math.random() < 0.45) pr.heat = Math.max(pr.heat, 0.35);
    return true;
  }
  // For weapons (or anything else): hit a prop (or its solid from X.raycast) for dmg.
  X.hitProp = function (pr, dmg, by, kind) {
    if (pr && pr.prop) pr = pr.prop;
    return hitPropI(pr, dmg == null ? 30 : dmg, by, kind || 'bullet');
  };
  // Clusters on the sidewalk hugging building corners (never mid-wall, where doors go), or on plazas.
  const SLOTS = [[0, 0], [0.95, 0], [0.48, 0.82], [1.9, 0], [1.43, 0.82]];
  function spawnCluster(f, rMin, rMax) {
    const C = X.city, bs = C.buildings;
    for (let tries = 0; tries < 16; tries++) {
      let cx, cy, ax, ay, nx, ny;
      if (Math.random() < 0.2) {
        const a = Math.random() * TAU, rr = rand(rMin, rMax), blk = X.blockAt(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr);
        if (!blk || blk.kind === 'city') continue;
        cx = rand(blk.x0 + 6, blk.x1 - 6); cy = rand(blk.y0 + 6, blk.y1 - 6);
        if (C.fountains.some(q => Math.hypot(q.x - cx, q.y - cy) < q.r + 3.5)) continue;
        const r = Math.random() * TAU; ax = Math.cos(r); ay = Math.sin(r); nx = -ay; ny = ax;
      } else {
        const b = bs[Math.floor(Math.random() * bs.length)];
        if (!b || b.deco || b.place) continue;
        const mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2, d = Math.hypot(mx - f.x, my - f.y);
        if (d < rMin || d > rMax) continue;
        const blk = X.blockAt(mx, my); if (!blk) continue;
        const sides = [];
        if (b.y0 - blk.y0 < 7) sides.push(0); if (blk.y1 - b.y1 < 7) sides.push(1); if (b.x0 - blk.x0 < 7) sides.push(2); if (blk.x1 - b.x1 < 7) sides.push(3);
        if (!sides.length) continue;
        const s = sides[Math.floor(Math.random() * sides.length)], end = Math.random() < 0.5 ? -1 : 1;
        if (s < 2) {
          if (b.x1 - b.x0 < 8) continue;
          nx = 0; ny = s === 0 ? -1 : 1; ax = -end; ay = 0;
          cx = end > 0 ? b.x1 - 0.75 : b.x0 + 0.75; cy = (s === 0 ? b.y0 : b.y1) + ny * 0.62;
        } else {
          if (b.y1 - b.y0 < 8) continue;
          ny = 0; nx = s === 2 ? -1 : 1; ax = 0; ay = -end;
          cy = end > 0 ? b.y1 - 0.75 : b.y0 + 0.75; cx = (s === 2 ? b.x0 : b.x1) + nx * 0.62;
        }
      }
      if (seen(cx, cy, 14)) continue;
      if (clusters.some(k => Math.abs(k.x - cx) < 40 && Math.abs(k.y - cy) < 40)) continue;
      let nearDoor = false;
      for (const id in X.places) { const dr = X.places[id].door; if (dr && Math.hypot(dr.x - cx, dr.y - cy) < 9) nearDoor = true; }
      if (nearDoor) continue;
      const roll = Math.random(), type = roll < 0.5 ? 'barrel' : roll < 0.72 ? 'gas' : roll < 0.9 ? 'mixed' : 'fireworks';
      const n = type === 'fireworks' ? 2 : 2 + Math.floor(Math.random() * 3);
      let ok = true;
      const spots = [];
      for (let k = 0; k < n && ok; k++) {
        const t = type === 'mixed' ? (k === 0 ? 'propane' : 'barrel') : type, r = PROP_T[t].r;
        const x = cx + ax * SLOTS[k][0] + nx * SLOTS[k][1], y = cy + ay * SLOTS[k][0] + ny * SLOTS[k][1];
        if (X.blocked(x, y, r + 0.06) || !X.blockAt(x, y)) ok = false;
        else if (X.cars.some(c => !c.removed && Math.abs(c.x - x) < 4 && Math.abs(c.y - y) < 4 && carDist(c, x, y) < r + 0.3)) ok = false;
        else if (X.peds.some(p => !p.removed && !p.hidden && Math.abs(p.x - x) < 1 && Math.abs(p.y - y) < 1)) ok = false;
        spots.push({ t, x, y });
      }
      if (!ok) continue;
      const cluster = { x: cx, y: cy, props: [] };
      for (const s of spots) cluster.props.push(addProp(s.t, s.x, s.y, { cluster }));
      clusters.push(cluster);
      return cluster;
    }
    return null;
  }
  // Kept fairly close so a player actually runs into them: 14 clusters within ~300 m.
  const CLUSTERS = 14, SPAWN_MIN = 70, SPAWN_MAX = 300, KEEP = 400;
  function manageProps() {
    const f = X.focus();
    let alive = 0;
    for (const pr of props) if (pr.dead) { removeSolid(pr); propsDirty = true; }   // marked dead by someone else
    for (const k of clusters) {
      const d = Math.hypot(k.x - f.x, k.y - f.y);
      if (d > KEEP) { for (const pr of k.props) if (!pr.dead) { removeSolid(pr); pr.dead = true; propsDirty = true; } k.gone = true; continue; }
      if (k.props.every(pr => pr.dead)) { k.gone = true; continue; }
      if (d < SPAWN_MAX + 20) alive++;
    }
    if (clusters.some(k => k.gone)) clusters = clusters.filter(k => !k.gone);
    if (!X.scene && alive < CLUSTERS) spawnCluster(f, SPAWN_MIN, SPAWN_MAX);
  }

  // ================= explosions =================
  let chainFloat = null;
  function bumpChain(x, y, car) {
    const on = X.time - chainT < 3;
    chainN = on ? chainN + 1 : 1; chainCars = (on ? chainCars : 0) + (car ? 1 : 0); chainT = X.time;
    if (chainN > stats.chainMax) stats.chainMax = chainN;
    // the hud module puts up its own big CHAIN REACTION banner once two cars have gone
    if (chainCars >= 2 && X.has('hud')) { if (chainFloat) chainFloat.t = Math.max(chainFloat.t, chainFloat.life - 0.3); return; }
    if (chainN < 2) return;
    const text = 'CHAIN x' + chainN, size = 18 + Math.min(14, chainN * 2);
    if (chainFloat && X.floats.includes(chainFloat) && chainFloat.t < 1.2) Object.assign(chainFloat, { x, y: y - 2.2, text, size, t: 0 });
    else { X.floatText(x, y - 2.2, text, '#ff9a3a', { size, life: 1.8, chain: true }); chainFloat = X.floats[X.floats.length - 1]; }
  }
  function fireball(x, y, R, pw, src, slot) {
    const sq = Math.sqrt(pw), n = Math.round(10 + 9 * pw);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = rand(2, 9) * sq, r0 = rand(0, R * 0.22);
      emit(K_FLAME, x + Math.cos(a) * r0, y + Math.sin(a) * r0, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.45, 0.95), rand(1.1, 2.3) * sq, rand(1.5, 2.8) * sq, 1);
    }
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * TAU, sp = rand(0.5, 3), r0 = rand(0, R * 0.3);
      emit(K_BLACK, x + Math.cos(a) * r0, y + Math.sin(a) * r0, Math.cos(a) * sp, Math.sin(a) * sp, rand(2.6, 4.2), rand(0.8, 1.4) * sq, rand(2.4, 3.6) * sq, rand(0.7, 0.9));
    }
    for (let i = 0, m = Math.round(10 * pw); i < m; i++) {
      const a = Math.random() * TAU, sp = rand(6, 17);
      emit(K_EMBER, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.5, 1.3), 0.1, 0.05, 1, Math.random() < 0.22 ? slot + 1 : 0);
    }
    PG.burst(x, y, 'spark', 26, 15 * sq, 0.6, 0.1);
    const col = src && src.kind === 'car' && !src.model.box ? src.color : src && src.kind === 'prop' ? '#9b2a1e' : '#8a8a8a';
    PG.burst(x, y, 'debris', src && src.kind === 'car' ? 16 : 8, 10, 1.3, 0.35, [col, '#2a2a2a', '#4a4d52', '#9aa3ad']);
  }
  X.explode = function (x, y, o) {
    o = o || {};
    if (!X.active) return;
    const pw = Math.max(0.2, o.power == null ? 1 : o.power), R = 6.5 * Math.pow(pw, 0.6), by = o.by, src = o.source;
    stats.explosions++;
    byCur = (byCur + 1) % EMBER_BY.length; EMBER_BY[byCur] = by || null;
    blasts.push({ x, y, R, pw, t0: X.time });
    if (blasts.length > 24) blasts.shift();
    const df = Math.hypot(x - X.cam.x, y - X.cam.y);
    if (seen(x, y, R * 2)) fireball(x, y, R, pw, src, byCur);
    X.decal(x, y, 'scorch', R * 0.5);
    if (src && src.kind === 'car') X.decal(x, y, 'glass', 1.6);
    G().shake = Math.max(G().shake || 0, Math.min(1.2, 0.95 * pw) * cl(1 - df / 75, 0, 1));
    sfxBoom(x, y, pw);
    // people: knocked down and flung by the shockwave, hurt with falloff (walls shield)
    const R15 = R * 1.5;
    for (const p of X.peds) {
      if (p.removed || p.hidden || p.car) continue;
      const dx = p.x - x, dy = p.y - y;
      if (Math.abs(dx) > R15 || Math.abs(dy) > R15) continue;
      const d = Math.hypot(dx, dy); if (d > R15) continue;
      const occ = d > 1.2 && X.raycast(x, y, p.x, p.y, { solidFilter: notProp }) ? 0.25 : 1;
      let nx = dx / (d || 1), ny = dy / (d || 1);
      if (d < 0.05) { const a = Math.random() * TAU; nx = Math.cos(a); ny = Math.sin(a); }
      const k = (1 - d / R15) * occ;
      if (k > 0.04) { p.knock = Math.max(p.knock || 0, 0.45 + 1.4 * k); const imp = 15 * k * Math.sqrt(pw); p.vx += nx * imp; p.vy += ny * imp; p.spin = rand(-14, 14) * k; }
      if (d < R && !p.dead) X.damagePed(p, 135 * pw * Math.pow(1 - d / R, 1.15) * occ, by, 'explosion');
      if (!o.noFire && d < R * 0.4 && occ === 1) ignitePed(p, rand(3, 6), by);
    }
    // vehicles: shoved and spun, dented on the near side, damaged; cars right next to an exploding car catch fire
    for (const c of X.cars) {
      if (c.removed || c === src) continue;
      const ex = c.len / 2 + R * 1.2;
      if (Math.abs(c.x - x) > ex || Math.abs(c.y - y) > ex) continue;
      const dp = carDist(c, x, y); if (dp > R * 1.2) continue;
      const k = 1 - dp / (R * 1.2);
      X.toPhys(c);
      if (c.dv) {
        const sc = Math.sqrt(1500 / c.dv.dyn.mTot);
        let nx = c.x - x, ny = c.y - y; const dd = Math.hypot(nx, ny) || 1; nx /= dd; ny /= dd;
        const J = 8 * pw * k * sc; c.dv.vx += nx * J; c.dv.vy += ny * J; c.dv.r += rand(-2.6, 2.6) * k * sc;
      }
      c.hopT = X.time; c.hopA = Math.min(1, k * 1.2);
      if (c.wrecked || dp >= R) continue;
      addDentAt(c, x, y, 0.45 * k + 0.1);
      const dm = dmgOf(c); dm.soot = Math.min(1, dm.soot + 0.5 * k);
      X.damageCar(c, 650 * pw * (1 - dp / R), by, 'explosion');
      if (!c.wrecked && !c.removed && !(c.burning > 0)) {
        const chain = src && src.kind === 'car' && dp < R * 0.55 && !heavy(c);
        if (chain || c.hp < c.maxHp * FIRE_AT) ignite(c, rand(0.5, 1.2), by);
      }
    }
    // explosive props go off in a quick ripple (queued: no recursion)
    for (const pr of props) {
      if (pr.dead || pr.armed || pr === src) continue;
      const d = Math.hypot(pr.x - x, pr.y - y) - pr.r;
      if (d < R * 0.9) armProp(pr, by, 0.07 + Math.max(0, d) / R * 0.3);
    }
    const C = X.city;
    for (const l of C.lamps) if (!l.broken && Math.abs(l.x - x) < R * 0.5 && Math.abs(l.y - y) < R * 0.5) { l.broken = true; PG.burst(l.x + l.nx * 1.2, l.y + l.ny * 1.2, 'spark', 12, 6, 0.5, 0.1); X.decal(l.x + l.nx * 1.2, l.y + l.ny * 1.2, 'glass', 0.8); X.emit('lampBroken', { lamp: l, by }); }
    if (!o.noFire) {
      for (const tr of treesNear(x, y, R * 0.65)) igniteTree(tr, by);
      // a burning wreck is its own fire: car blasts just spill a little burning fuel beside it
      const car = src && src.kind === 'car';
      if (!car) fireAt(x, y, { r: 1.05 * Math.sqrt(pw), life: rand(4, 6.5), by, scorch: false });
      const a = Math.random() * TAU, r = R * rand(car ? 0.35 : 0.2, 0.55);
      fireAt(x + Math.cos(a) * r, y + Math.sin(a) * r, { r: rand(0.5, 0.85), life: rand(2.5, 4.5), by, scorch: false });
      lightFuelNear(x, y, R, by);
    }
    X.emit('explosion', { x, y, power: pw, by, source: src });
    if (X.byPlayer(by)) X.crime('explosion', x, y, { power: pw });
  };

  X.setOnFire = function (ent, s, by) {
    if (!ent || !X.active) return false;
    if (ent.kind === 'ped') return ignitePed(ent, s, by);
    if (ent.kind === 'car') {
      if (ent.wrecked) { ent.smoulder = Math.max(ent.smoulder || 0, s || 6); return true; }
      ignite(ent, s || rand(4, 6), by); return !!(ent.burning > 0);
    }
    if (ent.kind === 'prop') { heatProp(ent, 1, by); return true; }
    if (ent.s != null && X.city.trees.includes(ent)) return igniteTree(ent, by);
    if (ent.x != null) return !!fireAt(ent.x, ent.y, { r: ent.r || 1.2, life: s || 6, by });
    return false;
  };

  // Put fires out (a fire truck's water cannon, an extinguisher...): one person / car / prop, or everything
  // burning within r of (x, y). Returns how many fires went out.
  function steam(x, y) { if (seen(x, y, 4)) for (let i = 0; i < 5; i++) smoke(x + rand(-0.4, 0.4), y + rand(-0.4, 0.4), false, rand(0.35, 0.55), rand(1, 1.8)); }
  function douse(e) {
    if (!e || e.removed) return 0;
    if (e.kind === 'ped') { if (!(e.onFire > 0)) return 0; e.onFire = 0; e.fireImmune = X.time + 2; steam(e.x, e.y); return 1; }
    if (e.kind === 'car') {
      if (e.wrecked) { if (!(e.smoulder > 0)) return 0; e.smoulder = 0; e.smokeT = Math.min(e.smokeT || 0, 8); steam(e.x, e.y); return 1; }
      if (!(e.burning > 0)) return 0;
      extinguish(e); e.hp = Math.max(e.hp, e.maxHp * (FIRE_AT + 0.02)); steam(e.x, e.y); return 1;
    }
    if (e.kind === 'prop') { if (e.armed || !(e.heat > 0)) return 0; e.heat = 0; steam(e.x, e.y); return 1; }
    return 0;
  }
  X.extinguish = function (a, b, r) {
    if (!X.active) return 0;
    if (a && typeof a === 'object') return douse(a);
    const x = a, y = b; r = r || 2;
    let n = 0;
    for (const f of fires) if (f.life > 0.3 && Math.hypot(f.x - x, f.y - y) < r + f.r) { f.life = 0.3; steam(f.x, f.y); n++; }
    for (const e of treeFires) if (Math.hypot(e.tr.x - x, e.tr.y - y) < r + 1.5 && e.t < e.life - 0.5) { e.t = e.life - 0.5; n++; }
    for (const p of X.peds) if (p.onFire > 0 && Math.abs(p.x - x) < r + 1 && Math.abs(p.y - y) < r + 1 && Math.hypot(p.x - x, p.y - y) < r + p.r) n += douse(p);
    for (const c of X.cars) if (!c.removed && Math.abs(c.x - x) < r + c.len && Math.abs(c.y - y) < r + c.len && carDist(c, x, y) < r) n += douse(c);
    for (const pr of props) if (!pr.dead && Math.hypot(pr.x - x, pr.y - y) < r + pr.r) n += douse(pr);
    for (const s of fuel) if (s.lit && !s.done && Math.hypot(s.x - x, s.y - y) < r) s.lit = 0;
    return n;
  };

  // ================= events =================
  X.on('carImpact', e => {
    if (!X.active || !e.car || e.car.removed) return;
    const c = e.car;
    if (e.solid && e.solid.prop) hitPropI(e.solid.prop, Math.max(0, e.speed - 2) * 5, c.driver || c, 'impact');
    const amt = Math.min(0.6, (e.speed - 2.5) / 20);
    if (amt > 0 && e.at) addDentAt(c, e.at.x, e.at.y, amt);
  });
  X.on('carHurt', e => {
    if (!X.active || !e.car || e.car.removed || e.car.wrecked) return;
    if (e.kind === 'bullet') addHole(e.car, e.by);
    else if (e.kind === 'melee' && e.by && e.by.x != null) addDentAt(e.car, e.by.x, e.by.y, 0.12);
    else if (e.kind === 'fire') { const d = dmgOf(e.car); d.soot = Math.min(1, d.soot + e.amount / e.car.maxHp); }
  });
  X.on('carRepaired', e => {
    const c = e && e.car; if (!c) return;
    extinguish(c); c.dmg = null; c.misT = 0; applyPower(c, 1);
  });
  X.on('pedKilled', e => {
    const p = e.ped;
    if (p && (e.kind === 'fire' || e.kind === 'explosion' || p.onFire > 0)) p.look = Object.assign({}, p.look, CHAR);
  });
  X.on('enterCar', () => { if (P.ped && P.ped.onFire > 0) P.ped.onFire = 0; });
  X.on('pedHitByCar', e => { if (X.active && e.car && e.car.burning > 0 && Math.random() < 0.6) ignitePed(e.ped, rand(3, 5), e.car.driver || e.car.fireBy); });
  // Bullets: weapons.js calls X.hitProp for its own; without it (interiors guards' plain hitscan), find
  // barrels along the shot ourselves. A shooter in a vehicle (the police tank) aims with the turret.
  X.on('gunfire', e => {
    if (!X.active || externalHits || !e) return;
    const s = e.by && e.by.kind === 'ped' && !e.by.car ? e.by : null; if (!s) return;
    const a = s.aim != null ? s.aim : s.th, x = e.x != null ? e.x : s.x, y = e.y != null ? e.y : s.y;
    const h = X.raycast(x, y, x + Math.cos(a) * 45, y + Math.sin(a) * 45, { cars: true, peds: true, ignore: s });
    if (h && h.kind === 'solid' && h.obj.prop) hitPropI(h.obj.prop, 30, s, 'bullet');
  });

  // ================= per-frame simulation =================
  function updateParticles(dt) {
    const dk = Math.exp(-2.5 * dt), de = Math.exp(-1.4 * dt), ds = Math.exp(-0.9 * dt), wx = wind.x, wy = wind.y;
    for (let i = 0; i < NP; i++) {
      const k = PK[i]; if (!k) continue;
      PL[i] -= dt;
      if (PL[i] <= 0) {
        if (k === K_EMBER && PF[i] && fires.length < 24 && Math.random() < 0.5) fireAt(PX[i], PY[i], { r: rand(0.35, 0.55), life: rand(1.5, 3.5), by: EMBER_BY[PF[i] - 1], scorch: false });
        PK[i] = 0; continue;
      }
      if (k === K_FLAME) { PVX[i] *= dk; PVY[i] *= dk; }
      else if (k === K_EMBER || k === K_SPARK) { PVX[i] *= de; PVY[i] *= de; }
      else { PVX[i] = (PVX[i] - wx) * ds + wx; PVY[i] = (PVY[i] - wy) * ds + wy; }
      PX[i] += PVX[i] * dt; PY[i] += PVY[i] * dt;
    }
  }
  function carTick(c, dt) {
    const vis = seen(c.x, c.y, 25);
    if (c.wrecked) {
      if (c.smoulder > 0) {
        c.smoulder -= dt;
        if (vis) {
          const k = Math.min(1, c.smoulder / 3);
          c._facc = (c._facc || 0) + dt * 12 * k;
          while (c._facc >= 1) { c._facc--; toW(c, rand(-0.4, 0.4) * c.len, rand(-0.35, 0.35) * c.wid); flame(TX, TY, rand(0.35, 0.7), rand(0.3, 0.6)); }
        }
      }
      if (c.smokeT > 0) {
        c.smokeT -= dt;
        if (vis) {
          c._sacc = (c._sacc || 0) + dt * 3.5 * Math.min(1, c.smokeT / 12);
          while (c._sacc >= 1) { c._sacc--; toW(c, rand(-0.3, 0.3) * c.len, rand(-0.3, 0.3) * c.wid); smoke(TX, TY, c.smoulder > 0 || c.smokeT > 25, rand(0.45, 0.7), rand(2.4, 3.6)); }
        }
      }
      return;
    }
    const f = c.hp / c.maxHp;
    if (c.burning > 0) {
      if (c.hp > c.maxHp * 0.3) { extinguish(c); }   // repaired some other way
      else {
        c.burnT += dt; c.burning -= dt;
        c.hp = Math.max(0, Math.min(c.hp, c.maxHp * FIRE_AT * Math.max(0, c.burning) / c.burnMax));
        const dm = dmgOf(c); dm.soot = Math.min(1, dm.soot + dt * 0.1);
        if (!c.bailed && c.burnT > c.bailT) { c.bailed = true; bail(c); }
        if (c.burning <= 0) { explodeCar(c, c.fireBy || c.lastBy); return; }
        if (vis) {
          const g = Math.min(1, c.burnT / c.burnMax), ex = engineX(c);
          c._facc = (c._facc || 0) + dt * (32 + 30 * g);
          carVel(c); const vx = TX * 0.6, vy = TY * 0.6;
          while (c._facc >= 1) {
            c._facc--;
            const lx = Math.random() < 0.6 - g * 0.4 ? ex + rand(-0.5, 0.5) : rand(-0.45, 0.45) * c.len, ly = rand(-0.38, 0.38) * c.wid;
            toW(c, lx, ly); flame(TX, TY, rand(0.45, 0.85) * (0.95 + g * 0.45), rand(0.3, 0.6), vx, vy);
          }
          c._sacc = (c._sacc || 0) + dt * 9;
          while (c._sacc >= 1) { c._sacc--; toW(c, ex * 0.5, rand(-0.3, 0.3)); smoke(TX, TY, true, rand(0.6, 0.9), rand(2.4, 3.4), vx * 0.5, vy * 0.5); }
        }
      }
    } else if (f < FIRE_AT) { ignite(c, rand(4, 6), c.lastBy); return; }
    else if (f < SMOKE_AT && vis) {
      const black = f < BLACK_AT;
      c._sacc = (c._sacc || 0) + dt * (black ? 16 : 7 + 10 * (SMOKE_AT - f) / (SMOKE_AT - BLACK_AT));
      carVel(c); const vx = TX * 0.5, vy = TY * 0.5;
      while (c._sacc >= 1) { c._sacc--; toW(c, engineX(c), rand(-0.3, 0.3) * c.wid); smoke(TX, TY, black, black ? rand(0.5, 0.75) : rand(0.4, 0.6), black ? rand(2.2, 3.2) : rand(1.8, 2.6), vx, vy); }
    }
    // weaker engine; below 25 % it coughs and backfires
    if (c.dv) {
      let pf = c.burning > 0 ? 0.55 : f >= 0.5 ? 1 : Math.round((0.5 + f) * 20) / 20;
      if (f < BLACK_AT && (c.driver || c.npcDriver || c.ai) && c.dv.thr > 0.3 && !(c.misT > 0) && Math.random() < dt * 0.9) {
        c.misT = rand(0.15, 0.3);
        toW(c, -c.len / 2 - 0.25, 0);
        if (seen(TX, TY, 5)) { PG.burst(TX, TY, 'spark', 5, 4, 0.3, 0.08); flame(TX, TY, 0.45, 0.18); smoke(TX, TY, true, 0.4, 1.4); }
        sfxBackfire(TX, TY);
      }
      if (c.misT > 0) { c.misT -= dt; pf *= 0.12; }
      applyPower(c, pf);
    }
    if (f < 0.3) leakFuel(c, dt);
    // a loose bumper scrapes the road
    const d = c.dmg;
    if (d && (d.bumperF || d.bumperB) && c.speed > 6 && vis && Math.random() < dt * 5) {
      toW(c, (d.bumperF ? 1 : -1) * c.len / 2, (d.bumperF || d.bumperB) * -c.wid * 0.35);
      PG.burst(TX, TY, 'spark', 4, 4, 0.3, 0.08);
    }
  }
  // Fast cars smash through barrels: drop the solid this frame so the car is not stopped dead.
  function ramProps(dt) {
    if (!props.length) return;
    for (const c of X.cars) {
      if (c.removed || c.ctrl !== 'phys' || !c.dv || c.speed < 4.5) continue;
      const ax = c.dv.vx * dt * 1.6, ay = c.dv.vy * dt * 1.6, reach = c.len / 2 + Math.hypot(ax, ay) + 1;
      for (const pr of props) {
        if (pr.dead || pr.armed || pr.fly || Math.abs(pr.x - c.x) > reach || Math.abs(pr.y - c.y) > reach) continue;
        const d = Math.min(carDist(c, pr.x, pr.y), carDistAt(c, c.x + ax, c.y + ay, pr.x, pr.y));
        if (d < pr.r + 0.05) { removeSolid(pr); hitPropI(pr, 999, c.driver || c, 'ram'); }
      }
    }
  }
  function propTick(pr, dt) {
    if (pr.show) return showTick(pr, dt);
    if (pr.fly) {
      const f = pr.fly;
      f.t += dt; f.sp = Math.min(19, f.sp + dt * 12);
      f.a += Math.sin(f.t * 23 + pr.tint * 9) * 0.07;
      const vx = Math.cos(f.a) * f.sp, vy = Math.sin(f.a) * f.sp, nx = pr.x + vx * dt, ny = pr.y + vy * dt;
      const wall = X.blocked(nx, ny, pr.r);
      if (wall && wall.prop && wall.prop !== pr) { pr.armed = true; blowProp(pr); return; }   // straight into another barrel
      if (wall) { f.a += Math.PI + rand(-0.7, 0.7); f.sp *= 0.6; f.b++; if (seen(pr.x, pr.y, 4)) PG.burst(pr.x, pr.y, 'spark', 8, 5, 0.3, 0.08); }
      else { pr.x = nx; pr.y = ny; }
      pr.rot = f.a;
      if (seen(pr.x, pr.y, 6)) {
        f.acc += dt * 45;
        while (f.acc >= 1) { f.acc--; emit(K_FLAME, pr.x - Math.cos(f.a) * 0.4, pr.y - Math.sin(f.a) * 0.4, -vx * 0.35 + rand(-1, 1), -vy * 0.35 + rand(-1, 1), rand(0.15, 0.3), rand(0.25, 0.45), 0.1, 1); }
        if (Math.random() < dt * 20) smoke(pr.x, pr.y, false, 0.35, 1.4);
      }
      let hit = f.t > f.life || f.b > 3;
      if (!hit) for (const c of X.cars) if (!c.removed && Math.abs(c.x - pr.x) < c.len && Math.abs(c.y - pr.y) < c.len && carDist(c, pr.x, pr.y) < pr.r) { hit = true; break; }
      if (!hit) for (const p of X.peds) if (!p.dead && !p.removed && !p.hidden && !p.car && Math.abs(p.x - pr.x) < 0.8 && Math.abs(p.y - pr.y) < 0.8 && Math.hypot(p.x - pr.x, p.y - pr.y) < 0.65 && p !== pr.by) { hit = true; break; }
      if (hit) { pr.armed = true; blowProp(pr); }
      return;
    }
    if (pr.heat > 0) {
      pr.heat = pr.heat >= 0.3 ? pr.heat + dt * 0.35 : Math.max(0, pr.heat - dt * 0.08);
      if (pr.heat >= 1) armProp(pr, pr.by, 0.02);
      if (pr.heat >= 0.3 && seen(pr.x, pr.y, 6)) {
        pr.facc = (pr.facc || 0) + dt * 24;
        while (pr.facc >= 1) { pr.facc--; flame(pr.x + rand(-0.15, 0.15), pr.y + rand(-0.15, 0.15), rand(0.25, 0.45), rand(0.25, 0.45)); }
        if (Math.random() < dt * 4) smoke(pr.x, pr.y, true, 0.35, 2);
      }
    }
  }
  function chunkTick(ch, dt) {
    ch.t += dt;
    if (ch.z > 0 || ch.vz > 0) {
      ch.vz -= 20 * dt; ch.z += ch.vz * dt;
      if (ch.z <= 0) { ch.z = 0; if (ch.vz < -2.5) { ch.vz = -ch.vz * 0.35; ch.vx *= 0.7; ch.vy *= 0.7; ch.vr *= 0.6; } else ch.vz = 0; }
    }
    const sp = Math.abs(ch.vx) + Math.abs(ch.vy);
    if (sp < 0.05) return;
    if (ch.z === 0) {
      const k = ch.type === 'wheel' && ch.t < 3.5 ? Math.exp(-0.5 * dt) : Math.exp(-4 * dt);
      ch.vx *= k; ch.vy *= k; ch.vr *= Math.exp(-3 * dt);
      if (ch.type === 'wheel' && ch.t > 3.5 && sp < 1) ch.flat = true;
    }
    const nx = ch.x + ch.vx * dt, ny = ch.y + ch.vy * dt;
    if (X.blocked(nx, ny, 0.15)) { ch.vx = -ch.vx * 0.4; ch.vy = -ch.vy * 0.4; if (ch.type === 'wheel') ch.vy += rand(-1, 1); }
    else { ch.x = nx; ch.y = ny; }
    if (ch.type === 'wheel' && !ch.flat) ch.rot = Math.atan2(ch.vy, ch.vx); else ch.rot += ch.vr * dt;
  }
  // Contact checks, damage over time, spreading: four times a second.
  function slowTick() {
    const T = X.time;
    fireNear = 0;
    const near = (x, y, r) => { const d = Math.hypot(x - fx, y - fy); fireNear += r / (1 + (d / 12) * (d / 12)); };
    // burning people: damage, spread to others, heat props, light fuel
    for (const p of X.peds) {
      if (!(p.onFire > 0) || p.removed || p.hidden) continue;
      near(p.x, p.y, 0.4);
      if (p.dead) continue;
      X.damagePed(p, (p.isPlayer ? 10 : 18) * SLOW, p.fireBy || null, 'fire');
      for (const q of X.peds) {
        if (q === p || q.dead || q.removed || q.hidden || q.car || q.onFire > 0 || Math.abs(q.x - p.x) > 0.9 || Math.abs(q.y - p.y) > 0.9) continue;
        if (Math.hypot(q.x - p.x, q.y - p.y) < 0.85 && Math.random() < 0.5) ignitePed(q, rand(3, 6), p.fireBy);
      }
      for (const pr of props) if (!pr.dead && Math.abs(pr.x - p.x) < 1 && Math.abs(pr.y - p.y) < 1) heatProp(pr, 0.15, p.fireBy);
      lightFuelNear(p.x, p.y, 0.8, p.fireBy);
    }
    // ground fires
    for (const f of fires) {
      if (f.life < 0.3) continue;
      near(f.x, f.y, f.r);
      const rr = f.r + 0.5;
      for (const p of X.peds) {
        if (p.removed || p.hidden || p.car || Math.abs(p.x - f.x) > rr || Math.abs(p.y - f.y) > rr) continue;
        if (Math.hypot(p.x - f.x, p.y - f.y) < f.r + p.r) ignitePed(p, rand(3, 5), f.by);
      }
      for (const c of X.cars) {
        if (c.removed || c.wrecked || Math.abs(c.x - f.x) > c.len / 2 + rr || Math.abs(c.y - f.y) > c.len / 2 + rr) continue;
        const d = carDist(c, f.x, f.y);
        if (d < f.r * 0.8) X.damageCar(c, 35 * SLOW, f.by, 'fire');
        if (d < f.r + 0.4 && c.hp < c.maxHp * 0.3 && !(c.burning > 0)) ignite(c, rand(1.2, 2.2), f.by);
      }
      for (const pr of props) if (!pr.dead && Math.abs(pr.x - f.x) < rr + 0.4 && Math.abs(pr.y - f.y) < rr + 0.4 && Math.hypot(pr.x - f.x, pr.y - f.y) < f.r + pr.r + 0.2) heatProp(pr, 0.25, f.by);
      if (Math.random() < 0.12) { const ts = treesNear(f.x, f.y, f.r + 1.6); if (ts.length) igniteTree(ts[0], f.by); }
      lightFuelNear(f.x, f.y, f.r + 1.25, f.by);
    }
    // the weapons module's molotov / flamethrower pools: it burns people and cars itself, we add the rest
    const wf = X.weapons && X.weapons.fires;
    if (wf) for (const f of wf) {
      if (!(f.life > 0.3) || f.x == null) continue;
      const r = f.r || 1;
      near(f.x, f.y, r);
      for (const pr of props) if (!pr.dead && Math.abs(pr.x - f.x) < r + 1 && Math.abs(pr.y - f.y) < r + 1 && Math.hypot(pr.x - f.x, pr.y - f.y) < r + pr.r) heatProp(pr, 0.25, f.by);
      if (!f.small && Math.random() < 0.12) { const ts = treesNear(f.x, f.y, r + 1.4); if (ts.length) igniteTree(ts[0], f.by); }
      lightFuelNear(f.x, f.y, r + 1, f.by);
    }
    // burning cars and hot wrecks
    for (const c of X.cars) {
      if (c.removed) continue;
      const burning = c.burning > 0, hot = c.wrecked && c.smoulder > 0;
      if (!burning && !hot) continue;
      near(c.x, c.y, burning ? 1.5 : 0.8);
      const reach = c.len / 2 + 2;
      for (const p of X.peds) {
        if (p.removed || p.hidden || p.car || p.onFire > 0 || Math.abs(p.x - c.x) > reach || Math.abs(p.y - c.y) > reach) continue;
        if (carDist(c, p.x, p.y) < (burning ? 0.5 : 0.25) && Math.random() < (burning ? 0.4 : 0.25)) ignitePed(p, rand(3, 5), c.fireBy || c.lastBy);
      }
      for (const pr of props) if (!pr.dead && Math.abs(pr.x - c.x) < reach && Math.abs(pr.y - c.y) < reach && carDist(c, pr.x, pr.y) < 1.3) heatProp(pr, 0.2, c.fireBy || c.lastBy);
      lightFuelNear(c.x, c.y, c.len / 2 + 1, c.fireBy || c.lastBy);
    }
    // trees: burn out, spread through parks now and then, drop fire on whoever stands underneath
    for (const e of treeFires) {
      const tr = e.tr;
      near(tr.x, tr.y, 1.2);
      if (e.t > 1.5 && e.t < e.life - 2 && Math.random() < 0.12) {
        for (const o of treesNear(tr.x, tr.y, 4.6)) if (!o.burnt && !o.burning) { igniteTree(o, e.by); break; }
      }
      const r = 1.7 * tr.s;
      for (const p of X.peds) if (!p.removed && !p.hidden && !p.car && Math.abs(p.x - tr.x) < r && Math.abs(p.y - tr.y) < r && Math.hypot(p.x - tr.x, p.y - tr.y) < r * 0.6 && Math.random() < 0.2) ignitePed(p, rand(3, 5), e.by);
    }
    // fuel trails: lit spots become little fires that light the next spot; a leaking car at the end catches
    for (const s of fuel) {
      if (s.done || !s.lit || T < s.lit) continue;
      s.done = true;
      fireAt(s.x, s.y, { r: 0.55, life: rand(2, 3.2), by: s.by, scorch: false });
    }
    if (fuel.length && T - fuel[0].t > 90) fuel = fuel.filter(s => T - s.t < 90);
    // sound of fire nearby
    if (fireNear > 0.04) sfxFire(Math.min(1.4, fireNear));
    // your car is burning: alarm chirp
    if (P.car && P.car.burning > 0 && (beepAcc = (beepAcc + 1) % 3) === 0) sfxAlarm();
  }

  function tick(dt) {
    fx = X.cam.x; fy = X.cam.y;   // the listener: where the player is looking (indoors too)
    // queued prop explosions (a few per frame at most)
    if (pend.length) {
      let n = 0;
      for (let i = 0; i < pend.length && n < 4; i++) {
        const e = pend[i];
        if (X.time < e.t) continue;
        pend.splice(i--, 1); n++;
        blowProp(e.pr);
      }
    }
    ramProps(dt);
    for (const pr of props) if (!pr.dead) propTick(pr, dt);
    if (propsDirty) { propsDirty = false; props = props.filter(pr => !pr.dead); X.props = props; }
    for (const c of X.cars) if (!c.removed) carTick(c, dt);
    // people on fire
    for (const p of X.peds) {
      if (!(p.onFire > 0)) continue;
      if (p.removed || p.hidden || p.car) { p.onFire = 0; continue; }
      p.onFire -= dt;
      if (p.onFire <= 0) { p.onFire = 0; p.fireImmune = X.time + 1.5; continue; }
      if (seen(p.x, p.y, 6)) {
        p._facc = (p._facc || 0) + dt * (p.dead ? 12 : 26);
        while (p._facc >= 1) { p._facc--; flame(p.x + rand(-0.25, 0.25), p.y + rand(-0.25, 0.25), rand(0.25, 0.45), rand(0.25, 0.5), p.vx * 0.5, p.vy * 0.5); }
        if (Math.random() < dt * 5) smoke(p.x, p.y, true, 0.3, 1.8, p.vx * 0.3, p.vy * 0.3);
      }
    }
    // ground fires
    for (let i = fires.length - 1; i >= 0; i--) {
      const fr = fires[i];
      fr.life -= dt;
      if (fr.life <= 0) { fires[i] = fires[fires.length - 1]; fires.pop(); continue; }
      if (!seen(fr.x, fr.y, 6)) continue;
      const inten = Math.min(1, fr.life / 1.5);
      fr.acc += dt * (5 + 11 * fr.r) * inten;
      while (fr.acc >= 1) { fr.acc--; const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * fr.r; flame(fr.x + Math.cos(a) * r, fr.y + Math.sin(a) * r, rand(0.35, 0.65) * (0.7 + 0.45 * fr.r), rand(0.3, 0.6)); }
      fr.sacc += dt * 1.8 * fr.r * inten;
      while (fr.sacc >= 1) { fr.sacc--; smoke(fr.x, fr.y, true, rand(0.4, 0.7), rand(2, 3.2)); }
    }
    // burning trees
    for (let i = treeFires.length - 1; i >= 0; i--) {
      const e = treeFires[i], tr = e.tr;
      e.t += dt;
      if (e.t > e.life * 0.4) tr.burnt = true;
      if (e.t >= e.life) { tr.burnt = true; tr.burning = false; treeFires.splice(i, 1); continue; }
      if (!seen(tr.x, tr.y, 8)) continue;
      const inten = e.t < 1 ? e.t : e.t > e.life - 2.5 ? (e.life - e.t) / 2.5 : 1, r = 1.5 * tr.s;
      e.acc += dt * 34 * inten;
      while (e.acc >= 1) { e.acc--; const a = Math.random() * TAU, q = Math.sqrt(Math.random()) * r; flame(tr.x + Math.cos(a) * q, tr.y + Math.sin(a) * q, rand(0.4, 0.75), rand(0.3, 0.6)); }
      if (Math.random() < dt * 6 * inten) smoke(tr.x, tr.y, true, 0.7, 3);
    }
    if (rockets.length || pops.length) rocketTick(dt);
    updateParticles(dt);
    for (let i = chunks.length - 1; i >= 0; i--) { const ch = chunks[i]; chunkTick(ch, dt); if (ch.t > ch.life) chunks.splice(i, 1); }
    while (blasts.length && X.time - blasts[0].t0 > 1.6) blasts.shift();
    slowAcc += dt; if (slowAcc >= SLOW) { slowAcc -= SLOW; slowTick(); }
    spawnAcc += dt; if (spawnAcc >= 0.4) { spawnAcc = 0; manageProps(); }
    cleanAcc += dt; if (cleanAcc >= 2) { cleanAcc = 0; capWrecks(); }
  }
  // Too many wrecks around: quietly drop the oldest one that nobody owns and nobody can see.
  function capWrecks() {
    let n = 0, old = null;
    for (const c of X.cars) if (c.wrecked && !c.removed) { n++; if (!c.owner && !c.keep && c !== P.car && !seen(c.x, c.y, c.len + 4) && (!old || c.wreckT < old.wreckT)) old = c; }
    if (n > 16 && old) X.removeCar(old);
    // the bodies we pull out of exploded cars: peds.js clears corpses; without it, we tidy up our own
    if (!X.has('peds')) {
      const f = X.focus();
      for (const p of X.peds) if (p.dmgBody && p.dead && !p.removed && !p.ai && (p.deadT > 60 || Math.hypot(p.x - f.x, p.y - f.y) > 200) && !seen(p.x, p.y, 3)) p.removed = true;
    }
  }

  // ================= drawing =================
  let WS0 = 0, WS1 = 0, WSF = 0, WSB = 0;
  function windscreen(c) {
    const L = c.len, W = c.wid, m = c.model;
    if (m.kind === 'bus') { WS0 = L / 2 - 0.55; WS1 = L / 2 - 0.13; WSF = WSB = W / 2 - 0.15; }
    else if (m.box) { WS0 = L * 0.33; WS1 = L * 0.41; WSF = WSB = W / 2 - 0.18; }
    else { WS0 = L * 0.12; WS1 = L * 0.30; WSB = W / 2 - 0.22; WSF = W / 2 - 0.16; }
  }
  function crumple(ctx, rot, ext, half, depth, seed) {
    ctx.save(); if (rot) ctx.rotate(rot);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.moveTo(ext + 0.3, -half - 0.3);
    for (let i = 0; i <= 8; i++) ctx.lineTo(ext - depth * (0.45 + 0.55 * hr(seed, i)), -half + 2 * half * i / 8);
    ctx.lineTo(ext + 0.3, half + 0.3); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 0.04; ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath();
    for (let i = 1; i < 8; i += 2) { const y = -half + 2 * half * i / 8; ctx.moveTo(ext - 0.04, y + (hr(seed, i + 20) - 0.5) * 0.3); ctx.lineTo(ext - depth * (0.4 + 0.5 * hr(seed, i)), y); }
    ctx.stroke();
    ctx.restore();
  }
  function drawCracks(ctx, c, d) {
    windscreen(c);
    ctx.save();
    ctx.beginPath(); ctx.moveTo(WS1, -WSF); ctx.lineTo(WS0, -WSB); ctx.lineTo(WS0, WSB); ctx.lineTo(WS1, WSF); ctx.closePath(); ctx.clip();
    if (c.wrecked) {   // burnt out: an empty frame with a few jagged teeth of glass left in it
      ctx.fillStyle = 'rgba(150,158,164,0.4)'; ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const y = -WSB + 2 * WSB * (i + 0.5) / 6, h = (0.1 + 0.16 * hr(d.seed, i + 90)) * (WS1 - WS0) * 1.6, w = WSB / 6;
        ctx.moveTo(WS1 + 0.05, y - w); ctx.lineTo(WS1 - h, y + (hr(d.seed, i + 97) - 0.5) * w); ctx.lineTo(WS1 + 0.05, y + w);
      }
      ctx.fill(); ctx.restore(); return;
    }
    if (d.glass >= 1) { ctx.fillStyle = 'rgba(200,215,228,0.33)'; ctx.fill(); }
    const ox = (WS0 + WS1) / 2 + d.gx * (WS1 - WS0) * 0.4, oy = cl(d.gy, -WSB * 0.7, WSB * 0.7);
    const n = d.glass >= 1 ? 11 : 2 + Math.round(d.glass * 7), len = d.glass >= 1 ? 1.7 : 0.35 + d.glass * 0.8;
    ctx.strokeStyle = 'rgba(232,240,246,0.85)'; ctx.lineWidth = 0.028; ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + hr(d.seed, i + 40) * 0.7, l = len * (0.4 + 0.6 * hr(d.seed, i + 60)), ca = Math.cos(a), sa = Math.sin(a), j = (hr(d.seed, i + 80) - 0.5) * 0.14;
      ctx.moveTo(ox, oy); ctx.lineTo(ox + ca * l * 0.5 - sa * j, oy + sa * l * 0.5 + ca * j); ctx.lineTo(ox + ca * l, oy + sa * l);
    }
    if (d.glass >= 0.5) { ctx.moveTo(ox + 0.11, oy); ctx.arc(ox, oy, 0.11, 0, TAU); }
    if (d.glass >= 1) { ctx.moveTo(ox + 0.3, oy); ctx.arc(ox, oy, 0.3, 0, TAU); }
    ctx.stroke();
    ctx.restore();
  }
  function bumper(ctx, ex, hw, side, dir, t, c, seed) {
    const sp = Math.min(1, (c.speed || 0) / 10), sway = 0.32 + 0.06 * sp + 0.1 * Math.sin(t * 9 + seed) * sp;
    const px = ex + dir * 0.04, py = side * (hw - 0.1), len = hw * 2 - 0.2;
    const qx = px + dir * Math.sin(sway) * len, qy = py - side * Math.cos(sway) * len;
    ctx.lineCap = 'round'; ctx.strokeStyle = '#1c1c1e'; ctx.lineWidth = 0.17;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(qx, qy); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 0.05; ctx.stroke(); ctx.lineCap = 'butt';
  }
  function drawDamage(ctx, c, t) {
    const d = c.dmg, L = c.len, W = c.wid, hl = L / 2, hw = W / 2, seed = d.seed;
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.th);
    ctx.save();
    PG.rr(ctx, -hl, -hw, L, W, c.model.kind === 'bus' ? 0.45 : Math.min(0.42, W * 0.22)); ctx.clip();
    if (d.soot > 0.03 && !c.wrecked) { ctx.globalAlpha = Math.min(0.72, d.soot * 0.75); ctx.fillStyle = '#100d0b'; ctx.fillRect(-hl, -hw, L, W); ctx.globalAlpha = 1; }
    if (d.f > 0.02) crumple(ctx, 0, hl, hw, d.f * Math.min(1.2, L * 0.16), seed);
    if (d.b > 0.02) crumple(ctx, Math.PI, hl, hw, d.b * Math.min(1.2, L * 0.16), seed + 3);
    if (d.l > 0.02) crumple(ctx, -Math.PI / 2, hw, hl, d.l * W * 0.3, seed + 7);
    if (d.r > 0.02) crumple(ctx, Math.PI / 2, hw, hl, d.r * W * 0.3, seed + 11);
    if (d.dents.length) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath();
      for (const q of d.dents) { ctx.moveTo(q.x + q.s, q.y); ctx.ellipse(q.x, q.y, q.s, q.s * 0.7, q.a, 0, TAU); }
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.17)'; ctx.lineWidth = 0.04; ctx.beginPath();
      for (const q of d.dents) { const a0 = q.a + 3.6; ctx.moveTo(q.x + Math.cos(a0) * q.s * 0.8, q.y + Math.sin(a0) * q.s * 0.56); ctx.ellipse(q.x, q.y, q.s * 0.8, q.s * 0.56, q.a, 3.6, 5.2); }
      ctx.stroke();
    }
    if (d.holes.length) {
      ctx.fillStyle = 'rgba(205,205,210,0.55)'; ctx.beginPath();
      for (const h of d.holes) { ctx.moveTo(h.x + 0.08, h.y); ctx.arc(h.x, h.y, 0.08, 0, TAU); }
      ctx.fill();
      ctx.fillStyle = '#0a0a0a'; ctx.beginPath();
      for (const h of d.holes) { ctx.moveTo(h.x + 0.05, h.y); ctx.arc(h.x, h.y, 0.05, 0, TAU); }
      ctx.fill();
    }
    ctx.restore();
    if (d.glass > 0.05) drawCracks(ctx, c, d);
    if (d.lights) {
      ctx.fillStyle = '#222'; if (d.lights & 1) ctx.fillRect(hl - 0.15, -hw + 0.1, 0.14, 0.42); if (d.lights & 2) ctx.fillRect(hl - 0.15, hw - 0.52, 0.14, 0.42);
      ctx.fillStyle = 'rgba(220,235,245,0.7)'; if (d.lights & 1) ctx.fillRect(hl - 0.1, -hw + 0.2, 0.05, 0.06); if (d.lights & 2) ctx.fillRect(hl - 0.1, hw - 0.3, 0.05, 0.06);
    }
    if (d.tails) { ctx.fillStyle = '#1e1414'; if (d.tails & 1) ctx.fillRect(-hl + 0.01, -hw + 0.1, 0.12, 0.4); if (d.tails & 2) ctx.fillRect(-hl + 0.01, hw - 0.5, 0.12, 0.4); }
    if (d.bumperF) bumper(ctx, hl, hw, d.bumperF, 1, t, c, seed);
    if (d.bumperB) bumper(ctx, -hl, hw, d.bumperB, -1, t, c, seed + 1);
    ctx.restore();
  }
  const baseDrawCar = X.drawCar;
  X.drawCar = function (ctx, c, t) {
    const hop = c.hopT != null ? X.time - c.hopT : 9;
    if (hop >= 0 && hop < 0.55) {
      const k = 1 + Math.sin(Math.PI * hop / 0.55) * 0.2 * (c.hopA || 1);
      ctx.save(); ctx.translate(c.x, c.y); ctx.scale(k, k); ctx.translate(-c.x, -c.y);
      baseDrawCar(ctx, c, t);
      if (c.dmg) drawDamage(ctx, c, t);
      ctx.restore();
      return;
    }
    baseDrawCar(ctx, c, t);
    if (c.dmg) drawDamage(ctx, c, t);
  };

  function drawProp(ctx, pr) {
    const x = pr.x, y = pr.y, r = pr.r;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(x + 0.1, y + 0.13, r, 0, TAU); ctx.fill();
    if (pr.type === 'gas') {
      ctx.save(); ctx.translate(x, y); ctx.rotate(pr.rot);
      ctx.fillStyle = pr.tint < 0.5 ? '#c9372c' : '#d9a21b'; PG.rr(ctx, -0.29, -0.2, 0.58, 0.4, 0.06); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 0.035; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.moveTo(-0.22, -0.14); ctx.lineTo(0.05, 0.14); ctx.moveTo(-0.22, 0.14); ctx.lineTo(0.05, -0.14); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0.08, -0.13, 0.16, 0.08);
      ctx.fillStyle = '#1b1b1b'; ctx.beginPath(); ctx.arc(0.19, 0.1, 0.055, 0, TAU); ctx.fill();
      ctx.restore();
    } else if (pr.type === 'fireworks') {
      ctx.save(); ctx.translate(x, y); ctx.rotate(pr.rot * 0.15);
      ctx.fillStyle = '#9a6a3a'; ctx.fillRect(-0.38, -0.38, 0.76, 0.76);
      ctx.strokeStyle = '#4a3018'; ctx.lineWidth = 0.05; ctx.strokeRect(-0.38, -0.38, 0.76, 0.76);
      ctx.fillStyle = '#ba0c2f'; ctx.fillRect(-0.27, -0.2, 0.54, 0.4);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-0.13, -0.2, 0.12, 0.4); ctx.fillRect(-0.27, -0.06, 0.54, 0.12);
      ctx.fillStyle = '#00205b'; ctx.fillRect(-0.1, -0.2, 0.06, 0.4); ctx.fillRect(-0.27, -0.03, 0.54, 0.06);
      ctx.fillStyle = pr.show ? '#ffd23a' : '#222'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-0.22 + i * 0.22, 0.29, 0.05, 0, TAU); ctx.fill(); }
      ctx.restore();
    } else if (pr.type === 'propane') {
      ctx.fillStyle = '#ecebe6'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#7d7d7d'; ctx.lineWidth = 0.04; ctx.stroke();
      ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#c9a227'; ctx.beginPath(); ctx.arc(x, y, r * 0.24, 0, TAU); ctx.fill();
      ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(x + r * 0.1, y - r * 0.05, r * 0.08, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = pr.tint < 0.75 ? '#b3261c' : '#c2481a'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#5e120c'; ctx.lineWidth = 0.06; ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.04; ctx.beginPath(); ctx.arc(x, y, r * 0.68, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.arc(x, y, r * 0.82, -2.5, -1.3); ctx.stroke();
      ctx.fillStyle = '#d8d8d0'; ctx.beginPath(); ctx.arc(x + r * 0.38, y - r * 0.3, r * 0.11, 0, TAU); ctx.fill();
      ctx.fillStyle = '#f2c230'; ctx.beginPath(); ctx.moveTo(x - r * 0.3, y + r * 0.02); ctx.lineTo(x - r * 0.12, y + r * 0.2); ctx.lineTo(x - r * 0.3, y + r * 0.38); ctx.lineTo(x - r * 0.48, y + r * 0.2); ctx.closePath(); ctx.fill();
    }
    if (pr.heat > 0.05) { ctx.globalAlpha = Math.min(0.8, pr.heat) * (0.6 + 0.4 * Math.sin(X.time * 18)); ctx.strokeStyle = '#ff7a1a'; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.arc(x, y, r + 0.04, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
  }
  function drawChunk(ctx, ch) {
    const fade = ch.life - ch.t < 3 ? (ch.life - ch.t) / 3 : 1, s = 1 + ch.z * 0.12;
    ctx.save(); ctx.globalAlpha = fade;
    ctx.translate(ch.x, ch.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(ch.z * 0.35 - ch.w / 2, ch.z * 0.45 - ch.h / 2, ch.w, ch.h);
    ctx.rotate(ch.rot); ctx.scale(s, s);
    if (ch.type === 'wheel') {
      if (ch.flat) { ctx.fillStyle = '#151515'; ctx.beginPath(); ctx.arc(0, 0, 0.34, 0, TAU); ctx.fill(); ctx.fillStyle = '#6b6f75'; ctx.beginPath(); ctx.arc(0, 0, 0.17, 0, TAU); ctx.fill(); }
      else { ctx.fillStyle = '#151515'; PG.rr(ctx, -0.34, -0.13, 0.68, 0.26, 0.08); ctx.fill(); ctx.fillStyle = '#5a5e64'; ctx.fillRect(-0.06, -0.13, 0.12, 0.26); }
    } else {
      ctx.fillStyle = ch.color || '#555'; PG.rr(ctx, -ch.w / 2, -ch.h / 2, ch.w, ch.h, 0.06); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(-ch.w / 2, -ch.h / 2, ch.w * 0.45, ch.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.04; ctx.strokeRect(-ch.w / 2, -ch.h / 2, ch.w, ch.h);
    }
    ctx.restore();
  }
  function drawSmoke(ctx) {
    const v = X.lastView, S = sprites(), cx = v.cx, cy = v.cy, R = v.r + 6;
    for (let i = 0; i < NP; i++) {
      const k = PK[i]; if (k !== K_SMOKE && k !== K_BLACK) continue;
      const x = PX[i], y = PY[i]; if (Math.abs(x - cx) > R || Math.abs(y - cy) > R) continue;
      const u = 1 - PL[i] / PM[i], s = (PS0[i] + (PS1[i] - PS0[i]) * u) * SMOKE_K, a = PA[i] * (u < 0.12 ? u / 0.12 : 1 - (u - 0.12) / 0.88);
      if (a < 0.03) continue;
      ctx.globalAlpha = a;
      ctx.drawImage(k === K_BLACK ? S.black : S.smoke, x - s, y - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
  }
  // Fire glow, gathered once a frame: sources within a few metres of each other share one light and one
  // halo. A chain reaction can leave thirty fires on screen, and thirty overlapping 8-10 m lights cost the
  // lighting pass more than everything else in the frame.
  const MAXC = 48, MERGE = 5;
  const CX = new Float32Array(MAXC), CY = new Float32Array(MAXC), CW = new Float32Array(MAXC), CR = new Float32Array(MAXC), CI = new Float32Array(MAXC), CHR = new Float32Array(MAXC), CHA = new Float32Array(MAXC);
  let nC = 0;
  function glowSrc(x, y, r, i, hrad, ha) {
    if (!(i > 0) || !seen(x, y, r)) return;
    for (let k = 0; k < nC; k++) {
      if (Math.abs(CX[k] - x) > MERGE || Math.abs(CY[k] - y) > MERGE) continue;
      const w = r * i, W = CW[k] + w;
      CX[k] += (x - CX[k]) * w / W; CY[k] += (y - CY[k]) * w / W; CW[k] = W;
      CR[k] = Math.min(16, Math.max(CR[k], r) + 0.18 * Math.min(CR[k], r));
      CI[k] = Math.min(1.25, Math.max(CI[k], i) + 0.12 * Math.min(CI[k], i));
      if (ha > 0) { CHR[k] = Math.min(6, Math.max(CHR[k], hrad) + 0.12 * Math.min(CHR[k], hrad)); CHA[k] = Math.min(0.8, Math.max(CHA[k], ha) + 0.15 * Math.min(CHA[k], ha)); }
      return;
    }
    if (nC >= MAXC) return;
    CX[nC] = x; CY[nC] = y; CW[nC] = r * i; CR[nC] = r; CI[nC] = i; CHR[nC] = ha > 0 ? hrad : 0; CHA[nC] = ha > 0 ? ha : 0; nC++;
  }
  function gatherGlow(t) {
    nC = 0;
    for (const f of fires) { const k = Math.min(1, f.life / 1.5), s = Math.sin(t * 13 + f.seed); glowSrc(f.x, f.y, 4 + f.r * 4, 0.8 * k * (0.82 + 0.18 * s), 1.4 + f.r * 2, 0.5 * k * (0.85 + 0.15 * s)); }
    for (const c of X.cars) {
      if (c.removed) continue;
      if (c.burning > 0) { const s = Math.sin(t * 11 + c.id); glowSrc(c.x, c.y, 10, 0.95 * (0.85 + 0.15 * s), c.len * 0.85, 0.6 + 0.15 * s); }
      else if (c.wrecked && c.smoulder > 0) glowSrc(c.x, c.y, 4 + Math.min(4, c.smoulder * 0.5), 0.5, c.len * 0.55, c.smoulder > 1.5 ? 0.35 * Math.min(1, (c.smoulder - 1.5) / 3) : 0);
    }
    for (const e of treeFires) glowSrc(e.tr.x, e.tr.y, 10, 0.9, 4.2, 0.55);
    for (const p of X.peds) if (p.onFire > 0 && !p.hidden && !p.removed) glowSrc(p.x, p.y, 4.5, 0.8, 1.5, 0.55);
    for (const pr of props) if (!pr.dead && (pr.fly || pr.heat >= 0.3 || pr.show)) glowSrc(pr.x, pr.y, 4, 0.8, 1.3, pr.show ? 0 : 0.55);
  }
  let HX = 0, HY = 0, HR = 0, sparkLeft = 0;
  const isShow = pr => !!pr.show;
  // A soft orange halo round something burning. Normal blending: additive 'lighter' over big areas
  // costs far too much raster time on software canvases.
  function halo(ctx, x, y, r, a) {
    r *= HALO_K;
    if (Math.abs(x - HX) > HR + r || Math.abs(y - HY) > HR + r) return;
    ctx.globalAlpha = a; ctx.drawImage(SPR.halo, x - r, y - r, r * 2, r * 2);
  }
  function drawFire(ctx, t) {
    const v = X.lastView, S = sprites(), cx = v.cx, cy = v.cy, R = v.r + 4;
    HX = cx; HY = cy; HR = R;
    for (let k = 0; k < nC; k++) if (CHA[k] > 0.01) halo(ctx, CX[k], CY[k], CHR[k], CHA[k]);
    // flames and embers: additive, but small
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#ffb347';
    for (let i = 0; i < NP; i++) {
      const k = PK[i]; if (k !== K_FLAME && k !== K_EMBER) continue;
      const x = PX[i], y = PY[i]; if (Math.abs(x - cx) > R || Math.abs(y - cy) > R) continue;
      const u = 1 - PL[i] / PM[i];
      if (k === K_FLAME) { const s = PS0[i] + (PS1[i] - PS0[i]) * u, a = PA[i] * (1 - u * u); if (a < 0.03) continue; ctx.globalAlpha = a; ctx.drawImage(u < 0.3 ? S.hot : u < 0.65 ? S.mid : S.cool, x - s, y - s, s * 2, s * 2); }
      else { ctx.globalAlpha = PA[i] * (1 - u); ctx.fillRect(x - 0.07, y - 0.07, 0.14, 0.14); }
    }
    // fireworks sparks, one colour at a time
    if (rockets.length || pops.length || props.some(isShow) || sparkLeft > 0) {
      sparkLeft = 0;
      for (let ci = 0; ci < FW.length; ci++) {
        ctx.fillStyle = FW[ci];
        for (let i = 0; i < NP; i++) {
          if (PK[i] !== K_SPARK || PF[i] !== ci) continue;
          sparkLeft++;
          const x = PX[i], y = PY[i]; if (Math.abs(x - cx) > R || Math.abs(y - cy) > R) continue;
          const u = 1 - PL[i] / PM[i], s = PS0[i];
          ctx.globalAlpha = PA[i] * (1 - u) * (0.65 + 0.35 * Math.sin(t * 40 + i));
          ctx.fillRect(x - s, y - s, s * 2, s * 2);
        }
      }
      ctx.fillStyle = '#fff6d0';
      for (const r of rockets) { ctx.globalAlpha = 1; ctx.fillRect(r.x - 0.11, r.y - 0.11, 0.22, 0.22); }
      for (const p of pops) { const a = X.time - p.t0; if (a >= 0 && a < 0.25) { const s = 1.2 + a * 8; ctx.globalAlpha = 0.7 * (1 - a / 0.25); ctx.drawImage(S.hot, p.x - s, p.y - s, s * 2, s * 2); } }
      ctx.fillStyle = '#ffb347';
    }
    // embers glowing in the wrecks
    for (const c of X.cars) {
      if (!c.wrecked || c.removed || !(c.smoulder > 0) || Math.abs(c.x - cx) > R || Math.abs(c.y - cy) > R) continue;
      const k = Math.min(1, c.smoulder / 4), cs = Math.cos(c.th), sn = Math.sin(c.th), sd = c.dmg ? c.dmg.seed : c.id;
      for (let i = 0; i < 7; i++) {
        const lx = (hr(sd, i) - 0.5) * c.len * 0.8, ly = (hr(sd, i + 9) - 0.5) * c.wid * 0.8;
        ctx.globalAlpha = k * (0.4 + 0.6 * Math.abs(Math.sin(t * (3 + i) + i)));
        ctx.fillRect(c.x + cs * lx - sn * ly - 0.08, c.y + sn * lx + cs * ly - 0.08, 0.16, 0.16);
      }
    }
    // explosion flash and shockwave ring
    for (const b of blasts) {
      const a = X.time - b.t0;   // can dip below 0: the first frame after unpausing has a negative dt
      if (a < 0 || Math.abs(b.x - cx) > R + b.R * 2 || Math.abs(b.y - cy) > R + b.R * 2) continue;
      if (a < 0.5) { const s = b.R * (1 + 1.2 * a) * HALO_K; ctx.globalAlpha = 0.6 * (1 - a / 0.5); ctx.drawImage(S.halo, b.x - s, b.y - s, s * 2, s * 2); }
      if (a < 0.3) { const s = b.R * (0.45 + 0.75 * a / 0.3); ctx.globalAlpha = 1 - a / 0.3; ctx.drawImage(S.hot, b.x - s, b.y - s, s * 2, s * 2); }
      if (a < 0.35) {
        const u = a / 0.35, rad = b.R * 1.5 * (1 - (1 - u) * (1 - u));
        ctx.globalAlpha = 0.85 * (1 - u) * (1 - u); ctx.strokeStyle = '#ffe2b0'; ctx.lineWidth = 0.1 + 0.45 * (1 - u);
        ctx.beginPath(); ctx.arc(b.x, b.y, rad, 0, TAU); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  // ================= HUD =================
  const CSS = `
#gta-hud .g-dmgwarn { position: absolute; left: 50%; top: 11%; transform: translateX(-50%); font-family: var(--display); font-size: clamp(15px, 3vw, 26px); color: #ffd23a; background: rgba(150,16,0,0.85); border: 3px solid #ff6a1a; border-radius: 8px; padding: 6px 16px 9px; text-shadow: 0 2px 0 #000; letter-spacing: 0.04em; text-align: center; white-space: nowrap; animation: gdmgblink .5s steps(2) infinite; box-shadow: 0 6px 22px rgba(0,0,0,0.5); }
#gta-hud .g-dmgwarn i { display: block; height: 6px; margin-top: 6px; background: rgba(0,0,0,0.55); border-radius: 3px; overflow: hidden; }
#gta-hud .g-dmgwarn i b { display: block; height: 100%; width: 100%; background: linear-gradient(90deg, #ffd23a, #ff4a1a); }
#gta-hud .g-dmgwarn.ped { font-size: clamp(13px, 2.4vw, 20px); padding: 4px 12px; }
@keyframes gdmgblink { 50% { background: rgba(70,0,0,0.88); color: #fff; } }
`;
  function hudEl() {
    if (warnEl && warnEl.isConnected) return warnEl;
    const root = document.getElementById('gta-hud'); if (!root) return null;
    if (!document.getElementById('gta-dmg-css')) { const st = document.createElement('style'); st.id = 'gta-dmg-css'; st.textContent = CSS; document.head.appendChild(st); }
    warnEl = document.createElement('div'); warnEl.className = 'g-dmgwarn'; warnEl.hidden = true;
    warnEl.innerHTML = '<span></span><i><b></b></i>';
    root.appendChild(warnEl); warnKey = null; warnW = ''; warnTop = -1;
    return warnEl;
  }
  // The top centre is busy (pager, mission call and timer, weapon frenzy; the hud module's combo banner
  // sits at 31 %): the warning stacks itself just below whichever of those is showing.
  const STACK = ['.g-pager', '.m-call', '.m-timer', '.w-frenzy'];
  function placeWarn() {
    const root = warnEl.parentNode; if (!root) return;
    const H = root.clientHeight;
    let y = Math.round(H * 0.11);
    for (const s of STACK) { const e = root.querySelector(s); if (e && !e.hidden && e.offsetParent) y = Math.max(y, e.offsetTop + e.offsetHeight + 8); }
    // a tall stack on a phone would run into the combo banner's band: go just below it instead
    if (y + warnEl.offsetHeight > H * 0.3 && root.querySelector('.h-combo')) y = Math.max(y, Math.round(H * 0.43));
    if (y !== warnTop) { warnTop = y; warnEl.style.top = y + 'px'; }
  }

  // ================= the module =================
  X.mod('damage', {
    order: 45,
    init() {
      props = []; X.props = props; clusters = []; fires = []; treeFires = []; blasts = []; pend = []; chunks = []; fuel = []; rockets = []; pops = []; sparkLeft = 0;
      PK.fill(0); pCur = 0; Q = 1; frameEma = 1 / 60; lastFrame = 0;
      for (const k in stats) stats[k] = 0;
      chainN = 0; chainCars = 0; chainT = -99; lastBoom = -9; slowAcc = 0; spawnAcc = 0; cleanAcc = 0; fireNear = 0; beepAcc = 0; busJoke = false;
      EMBER_BY.fill(null); byCur = 0; nC = 0;
      externalHits = X.has('weapons');   // weapons calls X.hitProp for its own bullets
      const a = Math.random() * TAU, w = rand(0.5, 1.1); wind = { x: Math.cos(a) * w, y: Math.sin(a) * w };
      sprites(); buildTreeGrid();
      const f = X.focus(); fx = X.cam.x; fy = X.cam.y; chainFloat = null;
      for (let k = 0; k < 34 && clusters.length < CLUSTERS; k++) spawnCluster(f, 25, SPAWN_MAX);
      const el = hudEl(); if (el) { el.hidden = true; warnKey = null; }
    },
    stop() {
      props = []; X.props = props; clusters = []; fires = []; treeFires = []; pend = []; chunks = []; fuel = []; blasts = []; rockets = []; pops = [];
      PK.fill(0); EMBER_BY.fill(null); nC = 0; chainFloat = null;
      if (warnEl) warnEl.hidden = true;
      warnKey = null;
    },
    tick,
    hud() {
      const el = hudEl(); if (!el) return;
      let key = '';
      if (P.state === 'play' && G().status === 'play') {
        if (P.car && P.car.burning > 0) key = 'car';
        else if (!P.car && P.ped && P.ped.onFire > 0 && !P.ped.dead) key = 'ped';
      }
      if (key !== warnKey) {
        warnKey = key; el.hidden = !key; placeT = 0;
        if (key) { el.className = 'g-dmgwarn' + (key === 'ped' ? ' ped' : ''); el.firstChild.textContent = key === 'car' ? 'YOUR CAR IS ON FIRE - GET OUT!' : "YOU'RE ON FIRE!"; el.lastChild.style.display = key === 'car' ? '' : 'none'; }
      }
      if (key && --placeT <= 0) { placeT = 12; placeWarn(); }
      if (key === 'car') { const w = Math.round(cl(P.car.burning / (P.car.burnMax || 1), 0, 1) * 100) + '%'; if (w !== warnW) { warnW = w; el.lastChild.firstChild.style.width = w; } }
    },
    render: {
      // lights are submitted here so fires keep lighting the night while paused
      ground(ctx, view, t) {
        for (const b of blasts) { const a = X.time - b.t0; if (a >= 0 && a < 0.7 && seen(b.x, b.y, b.R * 4)) X.addLight(b.x, b.y, b.R * 4, '#ffd08a', 1.8 * (1 - a / 0.7)); }
        gatherGlow(t);
        for (let k = 0; k < nC; k++) X.addLight(CX[k], CY[k], CR[k], '#ff8a30', CI[k]);
        for (const p of pops) { const a = X.time - p.t0; if (a >= 0 && seen(p.x, p.y, 12)) X.addLight(p.x, p.y, 11, FW[p.col], 1.3 * (1 - a / 0.7)); }
        for (const r of rockets) if (seen(r.x, r.y, 4)) X.addLight(r.x, r.y, 3, FW[r.col], 0.7);
        // fuel puddles and glowing fire beds
        const S = sprites();
        ctx.fillStyle = '#0d0c10';
        for (const s of fuel) {
          if (s.done || !seen(s.x, s.y, 2)) continue;
          ctx.globalAlpha = 0.55 * Math.max(0, 1 - (X.time - s.t) / 90); ctx.beginPath(); ctx.ellipse(s.x, s.y, s.s, s.s * 0.7, s.t, 0, TAU); ctx.fill();
        }
        for (const f of fires) {
          if (!seen(f.x, f.y, 4)) continue;
          const r = f.r * 1.6; ctx.globalAlpha = Math.min(1, f.life / 1.5) * (0.8 + 0.2 * Math.sin(t * 9 + f.seed));
          ctx.drawImage(S.ground, f.x - r, f.y - r, r * 2, r * 2);
        }
        ctx.globalAlpha = 1;
      },
      props(ctx) {
        for (const pr of props) {
          if (pr.dead || pr.fly || !seen(pr.x, pr.y, 2)) continue;
          if (pr.leak) { ctx.fillStyle = 'rgba(14,12,16,0.6)'; ctx.beginPath(); ctx.ellipse(pr.x + 0.25, pr.y + 0.3, pr.r + 0.2 * pr.leak, (pr.r + 0.2 * pr.leak) * 0.7, pr.rot, 0, TAU); ctx.fill(); }
          drawProp(ctx, pr);
        }
      },
      bodies(ctx) { for (const ch of chunks) if (ch.z <= 0.05 && seen(ch.x, ch.y, 2)) drawChunk(ctx, ch); },
      air(ctx) {
        drawSmoke(ctx);
        for (const ch of chunks) if (ch.z > 0.05 && seen(ch.x, ch.y, 3)) drawChunk(ctx, ch);
        for (const pr of props) if (pr.fly && !pr.dead && seen(pr.x, pr.y, 2)) { ctx.save(); ctx.translate(pr.x, pr.y); ctx.rotate(pr.rot); ctx.fillStyle = '#ecebe6'; PG.rr(ctx, -0.45, -0.3, 0.9, 0.6, 0.28); ctx.fill(); ctx.fillStyle = '#c0392b'; ctx.fillRect(-0.12, -0.3, 0.1, 0.6); ctx.fillStyle = '#c9a227'; ctx.fillRect(0.38, -0.08, 0.12, 0.16); ctx.restore(); }
      },
      overlay(ctx, view, t) {
        const now = performance.now();
        if (lastFrame) frameEma += (Math.min(0.1, (now - lastFrame) / 1000) - frameEma) * 0.05;
        lastFrame = now;
        if (frameEma > 1 / 48) Q = Math.max(0.45, Q - 0.01); else if (frameEma < 1 / 56) Q = Math.min(1, Q + 0.004);
        drawFire(ctx, t);
      },
      screen(ctx, view) {
        let a = 0;
        for (const b of blasts) {
          const age = X.time - b.t0; if (age > 0.14 || age < 0) continue;
          const d = Math.hypot(b.x - view.cx, b.y - view.cy);
          a = Math.max(a, 0.3 * Math.min(1.3, b.pw) * (1 - age / 0.14) * cl(1 - d / 60, 0, 1));
        }
        if (a > 0.01) { ctx.globalAlpha = a; ctx.fillStyle = '#fff1d6'; ctx.fillRect(0, 0, view.cw, view.ch); ctx.globalAlpha = 1; }
      },
    },
  });
})(typeof window !== 'undefined' ? (window.PG = window.PG || {}) : (globalThis.PG = globalThis.PG || {}));
