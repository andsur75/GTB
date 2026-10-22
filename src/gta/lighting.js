// Night & dynamic lighting for Grand Theft Bus: owns the 'light' render layer and the day/night look. The
// clock decides how dark the city is (deep blue night, warm dusk and dawn, nothing at noon); interiors use
// X.scene.ambient instead. A half-resolution light map gathers every light, turns into the darkness with
// holes cut where it is lit, takes the coloured glows and goes over the scene; then emissive details
// (lamp heads, neon tubes, lenses, beacons, sparks) are redrawn bright on top. Sources: street lamps (they
// switch on one by one at dusk, a few flicker, broken ones stay dark; LED white in Tesla Flats, pink in
// Neon Mile), headlight cones (a battered car loses one), tail/brake/reverse lights, hazard blinkers on
// bumped cars, siren wash and light bars, taxi signs, lit bus interiors, neon edges and rooftop neon signs,
// lit windows that go dark as the city goes to bed (and the odd flickering TV), red aircraft beacons on the
// towers, fire and spark particles, objective markers, a big-blast sky flash, and every light other modules
// submit with X.addLight. Roofs are masked so street light stays on the street. L toggles the headlights,
// or a pocket torch on foot. X.lighting = {darkness(), isNight(), ambient, lightAt(x, y), flash(k), ...};
// emits 'dayPhase' {phase: 'day'|'night'} when the sun comes up or goes down.
// Two light-map engines draw the same picture: WebGL (every light one procedural quad in a single batched
// buffer, additive / cut blending on the GPU, one drawImage onto the scene) and Canvas 2D (pre-baked
// sprites). PG.settings.lightEngine picks one: 'webgl' (the default; canvas only if the browser has no WebGL)
// or 'canvas'; PG.settings.lighting is the quality: 'high' (everything), 'medium' (1/3-res map, no
// window spill), 'low' (1/4-res map: darkness, lamps, headlights and the big lights only), 'off' (no
// darkness at all; gameplay still knows it is night).
(function (PG) {
  if (typeof document === 'undefined') return;
  const X = PG.gta;
  if (!X) return;
  const TAU = Math.PI * 2;
  const cl = (x, a, b) => x < a ? a : x > b ? b : x;
  const sstep = (a, b, x) => { const k = cl((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
  const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const P = X.player;
  // quality settings (read every frame; the engine part of the game may be absent)
  const SET = () => PG.settings || {};
  const levelOf = v => v === 'off' || v === 'low' || v === 'medium' ? v : 'high';

  const MAXA = 0.8;      // darkness alpha at full night
  const MAXL = 380;      // light records per frame
  const HEAD = '#fff1cf', TAIL = '#ff2414', AMBER = '#ffa020';
  const NEON = ['#ff2d95', '#22e5ff', '#b14dff', '#ffd23a', '#3dff8c'];
  const LAMPC = ['#ffb766', '#dfeaff', '#ff9ad8'];   // sodium, LED (Tesla Flats), pink (Neon Mile)
  const WINC = ['#ffd49a', '#d6e4ff', '#8fb6ff'];    // warm home, office white, TV blue
  const SIGNS = ['HOTEL', 'BAR', 'PIZZA', 'KEBAB', 'PØLSE', 'KIOSK', 'VAFLER', 'BRUS', 'SUSHI', 'FISK', 'KARAOKE', 'MOTEL', 'BINGO', 'DISCO', 'PUB',
    'OPEN 24/7', 'TAKE THE BUS', 'ARTUR & SØNN', 'LUTEFISK', 'BRUNOST', 'SKÅL', 'TACO FREDAG', 'LOTTO', 'TATTOO', 'PAWN', 'NOODLES', 'DRIFT CLUB', 'NO PARKING'];

  // ================= sky =================
  // [minute, darkness 0..1, r, g, b (colour of the dark), warm (dawn/dusk sun glow)]
  const SKY = [
    [0, 1, 5, 9, 28, 0], [300, 1, 5, 9, 28, 0], [345, 0.85, 22, 18, 58, 0.2], [390, 0.55, 64, 40, 96, 0.7], [435, 0.25, 118, 70, 72, 0.85],
    [480, 0.04, 130, 86, 60, 0.3], [510, 0, 130, 86, 60, 0], [1050, 0, 130, 86, 60, 0], [1110, 0.13, 128, 70, 40, 0.7], [1170, 0.4, 76, 40, 96, 0.85],
    [1230, 0.72, 24, 20, 64, 0.3], [1290, 0.95, 8, 11, 34, 0.04], [1320, 1, 5, 9, 28, 0], [1440, 1, 5, 9, 28, 0],
  ];
  // share of windows lit through the night: people come home, then go to bed one by one
  const WINLIT = [[0, 0.42], [60, 0.32], [240, 0.12], [360, 0.3], [480, 0.4], [1020, 0.35], [1140, 0.62], [1380, 0.6], [1440, 0.42]];
  const curve = (K, m, col) => {
    m = ((m % 1440) + 1440) % 1440;
    let k = 0; while (k < K.length - 2 && K[k + 1][0] <= m) k++;
    const a = K[k], b = K[k + 1], f = (m - a[0]) / Math.max(1e-6, b[0] - a[0]);
    return a[col] + (b[col] - a[col]) * f;
  };
  const sky = { d: 1, raw: 1, clockD: 1, r: 5, g: 9, b: 28, warm: 0 };
  let flashK = 0;
  function updateSky() {
    const m = X.clock == null ? 1290 : X.clock;
    sky.clockD = curve(SKY, m, 1);
    const S = X.scene;
    if (S) {
      const a = S.ambient == null ? 0.7 : cl(+S.ambient || 0, 0, 1);
      sky.raw = (1 - a) * 0.96; sky.r = 10; sky.g = 8; sky.b = 16; sky.warm = 0;
    } else {
      sky.raw = sky.clockD; sky.r = curve(SKY, m, 2); sky.g = curve(SKY, m, 3); sky.b = curve(SKY, m, 4); sky.warm = curve(SKY, m, 5);
    }
    sky.d = sky.raw * (1 - 0.6 * flashK);
    if (flashK > 0) { const f = flashK * 0.8; sky.r += (120 - sky.r) * f; sky.g += (62 - sky.g) * f; sky.b += (24 - sky.b) * f; }   // a blast lights the block orange
    api.ambient = 1 - sky.d;
  }

  // ================= public API =================
  const api = X.lighting = {
    ambient: 1 - MAXA,
    quality: null,                              // light-map resolution (fraction of CSS pixels); null = automatic
    // debugging switches for the canvas engine (A/B timing): native = false scales the 256 px sprites
    // instead of native-size copies, copyDark = false accumulates light then fills 'source-out'
    native: true, copyDark: true,
    stats: { lights: 0, submitted: 0, ms: 0, lamps: 0, cars: 0, engine: '' },   // engine: 'webgl' | 'canvas' | 'off'
    darkness() { updateSky(); return sky.d; },  // 0 = broad daylight, 1 = deepest night
    isNight() { updateSky(); return sky.d > 0.45; },
    sky() { updateSky(); return { darkness: sky.d, color: [Math.round(sky.r), Math.round(sky.g), Math.round(sky.b)], warm: sky.warm, indoor: !!X.scene }; },
    flash(k) { flashK = cl(flashK + (k == null ? 0.6 : k), 0, 1); },   // the sky lights up (lightning, a huge blast)
    get torch() { return torch; }, set torch(v) { torch = !!v; },
    toggle() { toggleLights(); },
    lightAt,
    // which light-map engine draws: {engine, webgl ('any' when a context exists, else null), err}
    engineInfo() { return { engine: api.stats.engine, webgl: GE.gl ? 'any' : null, err: GE.err }; },
    // this frame's lights after culling (for tests and debugging): {x, y, r, ry, cone, dir, cut, glow, color}
    records() { const out = []; for (let k = 0; k < nL; k++) { const r = LP[k]; out.push({ x: r.x, y: r.y, r: r.rx, ry: r.ry, cone: r.sp, dir: r.rot, cut: r.cut, glow: r.glow, color: r.col, roof: k >= nGround }); } return out; },
  };

  // ================= state =================
  let torch = false, pref = true, phase = null, booms = [], lampGrid = null, GX = 0, GY = 0, BF = [], neonExtra = [], signs = [];
  const CELL = 40;
  function resetState() {
    torch = false; pref = true; phase = null; booms = []; flashK = 0; lampGrid = null; BF = []; neonExtra = []; signs = []; nL = 0; nSub = 0; nGround = 0;
    api.stats.lights = api.stats.submitted = api.stats.ms = api.stats.lamps = api.stats.cars = 0;
  }

  // Static fixtures, built once per city: lamps in a grid, windows / neon / beacons / signs per building.
  function buildFixtures() {
    const C = X.city; if (!C) return;
    GX = Math.ceil((C.W + 2 * CELL) / CELL) + 1; GY = Math.ceil((C.H + 2 * CELL) / CELL) + 1;
    lampGrid = new Array(GX * GY);
    C.lamps.forEach((l, i) => {
      const s = hash(i * 7.31 + C.seed % 997), dn = X.districtAt(l.x, l.y);
      const f = { l, hx: l.x + l.nx * 1.2, hy: l.y + l.ny * 1.2, px: l.x + l.nx * 2.6, py: l.y + l.ny * 2.6, seed: s, th: 0.1 + hash(i * 3.17 + 5) * 0.3,
        flick: s < 0.035, col: dn === 'Tesla Flats' ? 1 : dn === 'Neon Mile' ? 2 : 0, k: 0 };
      const gi = cellIdx(l.x, l.y); (lampGrid[gi] = lampGrid[gi] || []).push(f);
    });
    BF = new Array(C.buildings.length);
    const doorB = new Set();   // buildings the interiors module already hangs a shop sign on
    if (X.interiors && X.interiors.doors) for (const dr of X.interiors.doors) if (dr && dr.b) doorB.add(dr.b);
    const R = (() => { let s = (C.seed % 2147483646) + 1; return () => (s = (s * 48271) % 2147483647) / 2147483647; })();
    C.buildings.forEach((b, i) => {
      const w = b.x1 - b.x0, d = b.y1 - b.y0, F = { wins: [], neon: [], beacons: [], sign: null };
      BF[i] = F;
      const edges = [[b.x0, b.y1, b.x1, b.y1, 0, 1], [b.x0, b.y0, b.x1, b.y0, 0, -1], [b.x0, b.y0, b.x0, b.y1, -1, 0], [b.x1, b.y0, b.x1, b.y1, 1, 0]];
      if (!b.deco && b.h > 11) for (let s = 0; s < 4; s++) {
        const e = edges[s], len = Math.hypot(e[2] - e[0], e[3] - e[1]), n = cl(Math.floor(len / 7), 1, 5), horiz = e[4] === 0;
        for (let k = 0; k < n; k++) {
          const f = (k + 0.5) / n, sd = R(), tv = R() < 0.1;
          F.wins.push({ x: e[0] + (e[2] - e[0]) * f + e[4] * 0.9, y: e[1] + (e[3] - e[1]) * f + e[5] * 0.9, rx: horiz ? 1.8 : 1.35, ry: horiz ? 1.35 : 1.8, seed: sd, tv, col: tv ? 2 : R() < 0.25 ? 1 : 0 });
        }
      }
      const dn = b.deco ? '' : X.districtAt((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
      const addNeon = (s, ci, extra) => {
        const e = edges[s];
        F.neon.push({ x0: e[0], y0: e[1], x1: e[2], y1: e[3], cx: (e[0] + e[2]) / 2, cy: (e[1] + e[3]) / 2, horiz: e[4] === 0, len: Math.hypot(e[2] - e[0], e[3] - e[1]),
          col: NEON[ci], seed: R(), flick: R() < 0.16, side: s, extra });
      };
      if (b.neon >= 0 && b.h > 14) addNeon(b.nside, b.neon, false);
      // Neon Mile earns its name: extra tubes on most of its buildings (drawn by this module)
      if (dn === 'Neon Mile' && !b.place && b.h > 10 && R() < 0.7) {
        const s = (b.neon >= 0 && b.h > 14) ? (b.nside + 1 + Math.floor(R() * 3)) % 4 : Math.floor(R() * 4);
        addNeon(s, Math.floor(R() * NEON.length), true);
      }
      for (const n of F.neon) if (n.extra) neonExtra.push(n);
      // a rooftop sign along a neon edge
      const nn = F.neon[0];
      if (nn && !b.place && !b.deco && !doorB.has(b) && Math.min(w, d) >= 10 && R() < (dn === 'Neon Mile' ? 0.8 : 0.45)) {
        const text = SIGNS[Math.floor(R() * SIGNS.length)], fs = Math.min(2.6, (nn.len - 4) / (0.62 * text.length));
        if (fs >= 1.1) {
          const inx = -edges[nn.side][4], iny = -edges[nn.side][5], off = fs * 0.75 + 1.1;
          const sg = { text, x: nn.cx + inx * off, y: nn.cy + iny * off, rot: nn.horiz ? 0 : -Math.PI / 2, fs, col: nn.col, seed: R(), flick: R() < 0.2, w: Math.min(nn.len - 4, fs * 0.62 * text.length) };
          F.sign = sg; signs.push(sg);
        }
      }
      if (b.h > 58 && w > 8 && d > 8) { F.beacons.push({ x: b.x0 + 1, y: b.y0 + 1, seed: R() }, { x: b.x1 - 1, y: b.y1 - 1, seed: R() }); }
    });
  }
  function cellIdx(x, y) { return cl(Math.floor((x + CELL) / CELL), 0, GX - 1) + cl(Math.floor((y + CELL) / CELL), 0, GY - 1) * GX; }

  // ================= light records =================
  const LP = []; let nL = 0, nSub = 0, nGround = 0;
  let vcx = 0, vcy = 0, vr = 0, pxm = 1, Q = 0.5;
  function rec() { if (nL >= MAXL) return null; let r = LP[nL]; if (!r) r = LP[nL] = { x: 0, y: 0, rx: 0, ry: 0, rot: 0, sp: 0, col: '', cut: 0, glow: 0, gs: 1 }; nL++; r.gs = 1; return r; }
  function vis(x, y, R) { return Math.abs(x - vcx) < vr + R && Math.abs(y - vcy) < vr + R && R * pxm > 1.2; }
  function ell(x, y, rx, ry, rot, col, cut, glow) {
    if (!(cut > 0.004 || glow > 0.004)) return null;
    if (!vis(x, y, rx > ry ? rx : ry)) return null;
    const r = rec(); if (!r) return null;
    r.x = x; r.y = y; r.rx = rx; r.ry = ry; r.rot = rot; r.sp = 0; r.col = col; r.cut = cut; r.glow = glow;
    return r;
  }
  function pt(x, y, R, col, cut, glow) { return ell(x, y, R, R, 0, col, cut, glow); }
  function cone(x, y, reach, dir, spread, col, cut, glow) {
    if (!(cut > 0.004 || glow > 0.004) || !vis(x, y, reach)) return;
    const r = rec(); if (!r) return;
    r.x = x; r.y = y; r.rx = reach; r.ry = reach; r.rot = dir; r.sp = cl(spread, 0.05, 1.4); r.col = col; r.cut = cut; r.glow = glow;
  }
  // a module already submitted a big light here (police siren wash, damage.js blasts): do not double it
  function submittedNear(x, y, minR) {
    for (let k = 0; k < nSub; k++) { const r = LP[k]; if (r.rx >= minR && Math.abs(r.x - x) < 1.6 && Math.abs(r.y - y) < 1.6) return true; }
    return false;
  }

  // ================= sprites =================
  // A software-rasterised canvas is fastest with axis-aligned, nearest-sampled, source-over draws and no
  // globalAlpha: point lights use big sprites with the intensity baked in (16 levels, 8 for the common glow
  // colours); cones are drawn turned to their exact angle.
  const LV = 16, CS = 128, DIRS = 360, CR = 72;   // CR: px per reach in a turned beam
  let SPR = null;
  function mk(w, h, fn) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), im = g.createImageData(w, h), D = im.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; D[i] = D[i + 1] = D[i + 2] = 255; D[i + 3] = Math.round(cl(fn(x + 0.5, y + 0.5), 0, 1) * 255); }
    g.putImageData(im, 0, 0);
    return c;
  }
  const cutFall = d => d >= 1 ? 0 : (1 - d * d) * (1 - d * d);
  const glowFall = d => d >= 1 ? 0 : (1 - d) * (1 - d);
  function sprites() {
    if (SPR) return SPR;
    const N = 256, h = N / 2, base = mk(N, N, (x, y) => cutFall(Math.hypot(x - h, y - h) / h));
    const levels = [null];
    for (let l = 1; l <= LV; l++) {
      const c = document.createElement('canvas'); c.width = c.height = N;
      const g = c.getContext('2d'); g.globalAlpha = l / LV; g.drawImage(base, 0, 0); levels.push(c);
    }
    SPR = { levels, glow: mk(128, 128, (x, y) => glowFall(Math.hypot(x - 64, y - 64) / 64)), coneBase: [], coneRot: [] };
    return SPR;
  }
  const bucket = sp => cl(Math.round(sp / 0.05), 1, 28);
  // a cone pointing east with its apex in the middle of a (2 CS)^2 canvas
  function coneBase(b) {
    const arr = SPR.coneBase;
    if (arr[b]) return arr[b];
    const sp = b * 0.05;
    return (arr[b] = mk(CS * 2, CS * 2, (x, y) => {
      const dx = x - CS, dy = y - CS, d = Math.hypot(dx, dy) / CS; if (d >= 1 || dx <= 0) return 0;
      const m = 1 - sstep(sp * 0.55, sp, Math.abs(Math.atan2(dy, dx))); if (m <= 0) return 0;
      return m * Math.pow(1 - d, 1.25) * sstep(0, 0.1, d);
    }));
  }
  // the cone for spread bucket b turned to direction bucket k (1 degree), cropped to its bounding box (unit = reach)
  function coneRot(b, k) {
    const row = SPR.coneRot[b] || (SPR.coneRot[b] = []);
    if (row[k]) return row[k];
    const sp = b * 0.05, phi = k * TAU / DIRS;
    let x0 = 0, y0 = 0, x1 = 0, y1 = 0;
    const take = a => { const x = Math.cos(a), y = Math.sin(a); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
    take(phi - sp); take(phi + sp);
    for (let q = -4; q <= 4; q++) { const a = q * Math.PI / 2; if (Math.abs(PG.wrap(a - phi)) < sp) take(a); }
    x0 -= 0.03; y0 -= 0.03; x1 += 0.03; y1 += 0.03;
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil((x1 - x0) * CR)); c.height = Math.max(1, Math.ceil((y1 - y0) * CR));
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
    g.setTransform(CR / CS, 0, 0, CR / CS, -x0 * CR, -y0 * CR); g.rotate(phi); g.drawImage(coneBase(b), -CS, -CS);
    return (row[k] = { cv: c, x0, y0, w: c.width / CR, h: c.height / CR });
  }
  const dirBucket = a => { const k = Math.round(a / TAU * DIRS) % DIRS; return k < 0 ? k + DIRS : k; };
  const TINT = new Map();
  function tint(src, col) {
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const g = c.getContext('2d'); g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
    return c;
  }
  function tintOf(col) {
    let e = TINT.get(col);
    if (!e) {
      if (TINT.size > 120) for (const k of TINT.keys()) if (!BAKE.has(k)) TINT.delete(k);   // modules made up lots of colours
      e = { pt: tint(SPR.glow, col), lv: null }; TINT.set(col, e);
    }
    return e;
  }
  // the colours drawn every frame get their glow baked at a few strengths (no globalAlpha needed)
  const GL = 8, BAKE = new Set([HEAD, TAIL, AMBER].concat(LAMPC, WINC));
  function glowLevels(e) {
    if (e.lv) return e.lv;
    e.lv = [null];
    for (let l = 1; l <= GL; l++) { const c = document.createElement('canvas'); c.width = c.height = e.pt.width; const g = c.getContext('2d'); g.globalAlpha = l / GL; g.drawImage(e.pt, 0, 0); e.lv.push(c); }
    return e.lv;
  }

  // build the common sprites up front (headlights, torch, police torches) so the first night has no hitch
  let warmed = false;
  function prewarm() {
    if (warmed) return; warmed = true;
    sprites();
    for (const sp of [0.36, 0.4]) { const b = bucket(sp); for (let k = 0; k < DIRS; k++) coneRot(b, k); }   // headlights, torches
    for (const c of BAKE) glowLevels(tintOf(c));
  }

  // ================= gathering lights =================
  const visB = [], visLamps = [], visCars = [], visNeon = [], visBeacons = [], visSigns = [];
  let em = 0, LVL = 'high';   // LVL: this frame's quality level
  function gather(view, t) {
    nL = 0; nSub = 0; nGround = 0;
    visB.length = visLamps.length = visCars.length = visNeon.length = visBeacons.length = visSigns.length = 0;
    const S = X.scene, d = sky.d, gk = 0.3 + 0.7 * d, low = LVL === 'low';
    em = sstep(0.08, 0.55, d);
    // 1. whatever the other modules submitted this frame ('low' keeps the big ones: sirens, blasts, flashes, fires)
    let nBig = 0;
    for (let k = 0; k < X.lights.length; k++) {
      const l = X.lights[k];
      if (!l || !isFinite(l.x) || !isFinite(l.y) || !(l.r > 0) || !isFinite(l.r)) continue;
      const i = l.i == null ? 1 : +l.i; if (!(i > 0)) continue;
      if (low && (l.r < 3 || ++nBig > 40)) continue;
      // by day only the bright stuff (blasts, muzzle flashes) still shows; signs and phones vanish in the sun
      const col = l.color || '#ffd9a0', c = i > 1 ? 1 : i;
      let g = Math.min(1, i * 0.55) * (d + (1 - d) * 0.6 * cl((i - 0.6) / 0.6, 0, 1));
      if (low && l.r < 5) g = 0;
      if (l.cone) cone(l.x, l.y, l.r, +l.cone.dir || 0, l.cone.spread == null ? 0.5 : +l.cone.spread, col, c, g);
      else pt(l.x, l.y, l.r, col, c, g);
    }
    nSub = nL;
    api.stats.submitted = nSub;
    // explosions nobody else lit (damage.js lights its own)
    for (const b of booms) {
      const a = X.time - b.t0; if (a > 0.9 || a < 0) continue;
      if (!submittedNear(b.x, b.y, 6)) { const k = 1 - a / 0.9; pt(b.x, b.y, 15 * b.p * (0.8 + a * 0.5), '#ffc46a', k, 0.9 * k * gk); }
    }
    if (d < 0.02) return;
    // 2. the player: a faint aura so you never lose yourself in the dark, plus the torch
    const pp = P.ped;
    if (pp && !pp.removed) {
      const pos = X.playerPos();
      pt(pos.x, pos.y, P.car ? 7 : 5.5, '#ffffff', 0.38, 0);
      if (torch && !P.car && !pp.dead) {
        const th = pp.aim != null ? pp.aim : pp.th, cs = Math.cos(th), sn = Math.sin(th);
        cone(pp.x + cs * 0.1, pp.y + sn * 0.1, 15, th, 0.34, '#fff4d8', 1, 0.14 * em);
        pt(pp.x + cs * 0.4, pp.y + sn * 0.4, 1.2, '#fff4d8', 0.2, 0.5 * em);
      }
    }
    // 3. objective markers stay readable at night
    for (const o of X.objectives) pt(o.x, o.y, (o.radius || 2.2) + 2.6, o.color || '#ffd23a', 0.55, low ? 0 : 0.3 * em);
    // 4. fire and sparks
    const parts = PG.game && PG.game.particles;
    if (parts) {
      let n = 0;
      for (let k = parts.length - 1, nMax = low ? 10 : LVL === 'medium' ? 40 : 70; k >= 0 && n < nMax; k--) {
        const p = parts[k]; if (p.kind !== 'fire') continue;
        const f = p.life / p.max; if (f <= 0.05) continue;
        n++; pt(p.x, p.y, 1.2 + p.size * 4.5, '#ff8a30', 0.35 * f, 0.22 * f * em);
      }
    }
    if (S) { nGround = nL; return; }
    // 5. vehicles
    let nc = 0;
    for (const c of X.cars) {
      if (c.removed || c.wrecked) continue;
      if (Math.abs(c.x - vcx) > vr + 26 || Math.abs(c.y - vcy) > vr + 26) continue;
      nc++; visCars.push(c); if (low) carLightsLow(c, t, gk); else carLights(c, t, gk);
    }
    api.stats.cars = nc;
    // 6. street lamps
    lampsGather(t);
    // 7. buildings in view: lit windows (ground level), then neon / signs / beacons above the roof mask
    const C = X.city, B = C.buildings, wl = curve(WINLIT, X.clock, 1), near = vr < 62 && LVL === 'high';
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      if (b.x1 < vcx - vr - 8 || b.x0 > vcx + vr + 8 || b.y1 < vcy - vr - 8 || b.y0 > vcy + vr + 8) continue;
      visB.push(b);
      const F = BF[i]; if (!F) continue;
      if (near) for (const w of F.wins) {
        if (w.seed > wl) continue;
        let k = 1;
        if (w.tv) k = 0.55 + 0.45 * Math.sin(t * 9 + w.seed * 50) * Math.sin(t * 3.7 + w.seed * 20);
        ell(w.x, w.y, w.rx, w.ry, 0, WINC[w.col], 0.42 * k * em, 0.17 * k * em);
      }
      if (low) continue;
      if (F.neon.length) visNeon.push(F);
      if (F.beacons.length) visBeacons.push(F);
      if (F.sign) visSigns.push(F.sign);
    }
    nGround = nL;
    for (const F of visNeon) for (const n of F.neon) {
      n.k = neonLevel(n, t, d);
      if (n.k <= 0) continue;
      ell(n.cx, n.cy, n.horiz ? n.len / 2 + 2.5 : 3.4, n.horiz ? 3.4 : n.len / 2 + 2.5, 0, n.col, 0.5 * n.k * em, 0.4 * n.k * em);
    }
    for (const sg of visSigns) {
      sg.k = sg.flick && Math.sin(t * 13 + sg.seed * 80) * Math.sin(t * 2.1 + sg.seed * 9) > 0.55 ? 0.12 : 1;
      ell(sg.x, sg.y, sg.rot ? sg.fs * 1.4 : sg.w / 2 + 2, sg.rot ? sg.w / 2 + 2 : sg.fs * 1.4, 0, sg.col, 0.35 * sg.k * em, 0.45 * sg.k * em);
    }
    for (const F of visBeacons) for (const bc of F.beacons) {
      bc.on = ((t * 0.85 + bc.seed) % 1) < 0.16;
      if (bc.on) pt(bc.x, bc.y, 3.2, '#ff2a1a', 0.35 * em, 0.95 * em);
    }
  }
  // Every car has exactly two headlights and two tail lights, at the lamp positions PG.drawCar paints (front
  // and rear bumper, W/2 - 0.31 from the centre line). Each beam is a cone whose apex sits on the bumper, so
  // it lights the road and never the car's own bonnet or roof; the halo at each lens is glow only.
  const HL_Y = 0.31, BUMP = 0.08;
  function carLamp(c, cs, sn, lx, ly) { return { x: c.x + lx * cs - ly * sn, y: c.y + lx * sn + ly * cs }; }
  function headReach(c, kind) { return c === P.car ? 23 : kind === 'police' || kind === 'swat' ? 19 : c.len > 7 ? 18 : 16; }
  function carLights(c, t, gk) {
    const cs = Math.cos(c.th), sn = Math.sin(c.th), L2 = c.len / 2, W2 = c.wid / 2, kind = c.model && c.model.kind;
    if (c.lightsOn) {
      const reach = headReach(c, kind), hk = c.maxHp ? c.hp / c.maxHp : 1;
      for (let s = -1; s <= 1; s += 2) {
        const on = hk < 0.18 && s > 0 ? (Math.sin(t * 23 + c.id) > -0.2 ? 1 : 0.35) : 1;   // a wreck-to-be flickers, never goes out
        const h = carLamp(c, cs, sn, L2 + BUMP, s * (W2 - HL_Y));
        cone(h.x, h.y, reach, c.th + s * 0.04, 0.36, HEAD, 0.85 * on, 0.12 * on * em);
        pt(h.x + cs * 0.2, h.y + sn * 0.2, 0.55, HEAD, 0, 0.6 * on * em);
      }
      if (kind === 'taxi') pt(c.x - cs * 0.07, c.y - sn * 0.07, 0.5, '#ffe680', 0, 0.35 * em);
      if (kind === 'bus' && (c.driver || c.npcDriver)) {
        ell(c.x, c.y, L2 + 0.5, W2 + 0.8, c.th, '#ffeec0', 0.22, 0.07 * em);
        pt(c.x + cs * (L2 - 0.85), c.y + sn * (L2 - 0.85), 1.5, '#ffb02e', 0, 0.55 * em);
      }
    }
    if (c.lightsOn || c.braking) {
      const br = c.braking;
      for (let s = -1; s <= 1; s += 2) {
        const q = carLamp(c, cs, sn, -L2 - BUMP, s * (W2 - HL_Y));
        const o = br ? 0.75 : 0.45;   // centred behind the bumper: the glow lies on the road, barely on the boot
        pt(q.x - cs * o, q.y - sn * o, br ? 1.25 : 0.8, TAIL, br ? 0.3 : 0.12, (br ? 0.85 : 0.4) * em);
      }
    }
    if (c.reversing) { const q = carLamp(c, cs, sn, -L2 - 1.6, 0); pt(q.x, q.y, 2.2, '#f4f6ff', 0.45, 0.25 * em); }
    // bumped NPC cars sit there with the hazards on
    if (!c.siren && c.ctrl === 'phys' && (c.npcDriver || (c.driver && !c.driver.isPlayer)) && !c.ai && c.speed < 1.5 && ((t * 1.6 + c.id * 0.37) % 1) < 0.5) {
      for (let s = -1; s <= 1; s += 2) for (let f = -1; f <= 1; f += 2) {
        const lx = f * (L2 - 0.15), ly = s * (W2 - 0.12);
        pt(c.x + lx * cs - ly * sn, c.y + lx * sn + ly * cs, 1.3, AMBER, 0.12, 0.8 * em);
      }
    }
    if (c.siren) {
      const fast = kind === 'ambulance' || kind === 'fire', on = Math.floor(t * (fast ? 6 : 8)) % 2 === 0;
      if (kind === 'police' || !kind || kind === 'taxi' || kind === 'sports' || kind === 'van') {
        for (let s = -1; s <= 1; s += 2) {
          const lit = s < 0 ? on : !on, lx = -0.01, ly = s * 0.37;
          pt(c.x + lx * cs - ly * sn, c.y + lx * sn + ly * cs, 2.6, s < 0 ? '#ff2a2a' : '#2a6bff', lit ? 0.3 : 0.05, (lit ? 0.95 : 0.12) * gk);
        }
      } else {
        const bx = c.len * (fast ? 0.22 : 0.25) + 0.12;
        pt(c.x + cs * bx, c.y + sn * bx, 2.8, on ? '#ff2a2a' : '#2a6bff', 0.3, 0.95 * gk);
      }
      if (!submittedNear(c.x, c.y, 6)) pt(c.x, c.y, 12, on ? '#ff3030' : '#3060ff', 0.45, 0.32 * gk);
    }
  }
  // 'low': the two beams per lit car and the siren wash, nothing else
  function carLightsLow(c, t, gk) {
    const cs = Math.cos(c.th), sn = Math.sin(c.th), L2 = c.len / 2, kind = c.model && c.model.kind;
    if (c.lightsOn) {
      const reach = headReach(c, kind), W2 = c.wid / 2;
      for (let s = -1; s <= 1; s += 2) { const h = carLamp(c, cs, sn, L2 + BUMP, s * (W2 - HL_Y)); cone(h.x, h.y, reach, c.th + s * 0.04, 0.36, HEAD, 0.85, 0); }
    }
    if (c.siren && !submittedNear(c.x, c.y, 6)) { const on = Math.floor(t * 8) % 2 === 0; pt(c.x, c.y, 12, on ? '#ff3030' : '#3060ff', 0.45, 0.32 * gk); }
  }
  function lampLevel(f, d, t) {
    let k = sstep(f.th, f.th + 0.07, d);
    if (k <= 0) return 0;
    if (k < 1 && Math.sin(t * 31 + f.seed * 90) > 0.15) k *= 0.3;   // sodium lamps stutter as they warm up
    if (f.flick) { const z = Math.sin(t * 11 + f.seed * 70) + Math.sin(t * 27.3 + f.seed * 13); if (z > 1.25) k *= 0.06; else if (z > 0.95) k *= 0.5; }
    return k;
  }
  function lampsGather(t) {
    if (!lampGrid) return;
    const d = sky.d, R = vr + 14, stride = vr > 150 ? Math.ceil(vr / 110) : 1;
    const i0 = cl(Math.floor((vcx - R + CELL) / CELL), 0, GX - 1), i1 = cl(Math.floor((vcx + R + CELL) / CELL), 0, GX - 1);
    const j0 = cl(Math.floor((vcy - R + CELL) / CELL), 0, GY - 1), j1 = cl(Math.floor((vcy + R + CELL) / CELL), 0, GY - 1);
    let n = 0, cnt = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cell = lampGrid[i + j * GX]; if (!cell) continue;
      for (const f of cell) {
        if (f.l.broken) { f.k = 0; continue; }
        if (Math.abs(f.px - vcx) > R || Math.abs(f.py - vcy) > R) continue;
        if (stride > 1 && (cnt++ % stride)) continue;
        f.k = lampLevel(f, d, t); if (f.k <= 0) continue;
        n++; visLamps.push(f);
        const r = pt(f.px, f.py, 10.5, LAMPC[f.col], 0.88 * f.k, 0.4 * f.k * em); if (r) r.gs = 0.72;
        if (pxm > 7 && LVL !== 'low') pt(f.hx, f.hy, 2, LAMPC[f.col], 0, 0.6 * f.k * em);
      }
    }
    api.stats.lamps = n;
  }
  function neonLevel(n, t, d) {
    let k = sstep(0.15 + n.seed * 0.12, 0.3 + n.seed * 0.12, d);
    if (n.flick && k > 0) { const z = Math.sin(t * 17 + n.seed * 90) * Math.sin(t * 2.3 + n.seed * 11); if (z > 0.6) k *= 0.08; else if (z > 0.45) k *= 0.5; }
    return k;
  }

  // ================= rendering =================
  // One half-resolution map. Light accumulates with source-over (alpha = 1 - prod(1 - cut)); a single
  // 'source-out' fill turns it into the darkness; coloured glows are painted over that; roofs are reset to
  // a flat dark; roof-level lights (neon, signs, beacons) are cut and painted; the map then goes onto the
  // screen with nearest-neighbour scaling (it is smooth anyway, and a filtered upscale costs ~7x more).
  let lm = null, lc = null, MW = 0, MH = 0;
  let Ma = 1, Mb = 0, Mc = 0, Md = 1, Me = 0, Mf = 0, vrot = 0, kpx = 1;
  const BUDGET = 6;   // light pixels per map pixel before the frame drops resolution
  function ensureMap(cw, ch) {
    const w = Math.max(1, Math.ceil(cw * Q)), h = Math.max(1, Math.ceil(ch * Q));
    if (!lm) lm = document.createElement('canvas');
    if (w === MW && h === MH) return;
    lm.width = MW = w; lm.height = MH = h; lc = lm.getContext('2d');
  }
  // Native-size copies of the round sprites (6 % size steps, fast renderer): an unscaled, unfiltered blit
  // is the cheapest draw a software-rasterised canvas has; scaling the 256 px original costs about twice that.
  const NAT = new Map(), NSTEP = Math.log(1.06);
  let natPx = 0, NATIVE = true;
  const natSize = d => !NATIVE || d < 3 || d > 512 ? 0 : Math.round(Math.exp(Math.round(Math.log(d) / NSTEP) * NSTEP));
  function natSprite(key, src, n) {
    let c = NAT.get(key);
    if (c) { NAT.delete(key); NAT.set(key, c); return c; }
    c = document.createElement('canvas'); c.width = c.height = n;
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, n, n);
    NAT.set(key, c); natPx += n * n;
    while (natPx > 4e6 && NAT.size > 1) { const k = NAT.keys().next().value, o = NAT.get(k); NAT.delete(k); natPx -= o.width * o.height; }
    return c;
  }
  function drawCut(r) {
    const px = Ma * r.x + Mc * r.y + Me, py = Mb * r.x + Md * r.y + Mf;
    if (r.sp > 0) {
      lc.globalAlpha = r.cut > 0.97 ? 1 : r.cut;
      drawCone(r, px, py);
      lc.globalAlpha = 1;
      return;
    }
    const lev = Math.min(LV, Math.max(1, Math.round(r.cut * LV))), spr = SPR.levels[lev], rx = r.rx * kpx, ry = r.ry * kpx, rot = r.rx === r.ry ? 0 : r.rot + vrot;
    if (!rot && rx === ry) { const n = natSize(2 * rx); if (n) { lc.drawImage(natSprite('c' + lev + '|' + n, spr, n), px - n / 2, py - n / 2); return; } }
    if (rx > 300 || ry > 300) { lc.imageSmoothingEnabled = true; lc.drawImage(spr, px - rx, py - ry, 2 * rx, 2 * ry); lc.imageSmoothingEnabled = false; return; }
    if (!rot) { lc.drawImage(spr, px - rx, py - ry, 2 * rx, 2 * ry); return; }
    const cs = Math.cos(rot), sn = Math.sin(rot);
    lc.setTransform(cs, sn, -sn, cs, px, py); lc.drawImage(spr, -rx, -ry, 2 * rx, 2 * ry); lc.setTransform(1, 0, 0, 1, 0, 0);
  }
  // A beam turned to its screen angle in 1 degree steps (the old 3.75 degree steps made beams jump as the
  // camera turned), drawn axis-aligned: a rotated draw costs a software canvas several times more.
  function drawCone(r, px, py) {
    const R = r.rx * kpx, cr = coneRot(bucket(r.sp), dirBucket(r.rot + vrot));
    lc.imageSmoothingEnabled = true;
    lc.drawImage(cr.cv, px + cr.x0 * R, py + cr.y0 * R, cr.w * R, cr.h * R);
    lc.imageSmoothingEnabled = false;
  }
  function cutPass(a, b, op) {
    lc.setTransform(1, 0, 0, 1, 0, 0); lc.globalAlpha = 1; lc.globalCompositeOperation = op;
    for (let k = a; k < b; k++) if (LP[k].cut > 0.004) drawCut(LP[k]);
  }
  function glowPass(a, b) {
    lc.setTransform(1, 0, 0, 1, 0, 0); lc.globalCompositeOperation = 'source-over';
    for (let k = a; k < b; k++) {
      const r = LP[k]; if (r.glow <= 0.004) continue;
      const px = Ma * r.x + Mc * r.y + Me, py = Mb * r.x + Md * r.y + Mf, ga = r.glow > 1 ? 1 : r.glow;
      if (r.sp > 0) {   // beams glow white: the cut sprite doubles as the haze
        lc.globalAlpha = ga; drawCone(r, px, py);
        continue;
      }
      const e = tintOf(r.col);
      let spr = e.pt, lev = 0;
      if (BAKE.has(r.col)) { const l = Math.round(ga * GL); if (l < 1) continue; lev = l > GL ? GL : l; spr = glowLevels(e)[lev]; lc.globalAlpha = 1; }
      else lc.globalAlpha = ga;
      const rx = r.rx * kpx * r.gs, ry = r.ry * kpx * r.gs, rot = r.rx === r.ry ? 0 : r.rot + vrot;
      if (!rot && rx === ry) { const n = natSize(2 * rx); if (n) { lc.drawImage(natSprite('g' + r.col + '|' + lev + '|' + n, spr, n), px - n / 2, py - n / 2); continue; } }
      if (rx > 150 || ry > 150) { lc.imageSmoothingEnabled = true; lc.drawImage(spr, px - rx, py - ry, 2 * rx, 2 * ry); lc.imageSmoothingEnabled = false; continue; }
      if (!rot) { lc.drawImage(spr, px - rx, py - ry, 2 * rx, 2 * ry); continue; }
      const cs = Math.cos(rot), sn = Math.sin(rot);
      lc.setTransform(cs, sn, -sn, cs, px, py); lc.drawImage(spr, -rx, -ry, 2 * rx, 2 * ry); lc.setTransform(1, 0, 0, 1, 0, 0);
    }
    lc.globalAlpha = 1;
  }
  // ---------- the WebGL engine ----------
  // Every record becomes one quad in a single vertex buffer; the falloffs (cut (1-d^2)^2, glow (1-d)^2,
  // the headlight cone) are computed per pixel, so there are no sprite levels or direction buckets. Six
  // draw calls with different blend states replay the canvas recipe exactly (source-over accumulation,
  // source-out darkness, roof reset, destination-out roof cut), and the finished map goes onto the scene
  // with one drawImage.
  const STR = 10, MAXQ = 2048;   // floats per vertex: x, y, u, v, r, g, b, a (premultiplied), mode, spread
  const VS = 'attribute vec2 aPos; attribute vec2 aUV; attribute vec4 aCol; attribute vec2 aP; uniform vec2 uRes;' +
    'varying vec2 vUV; varying vec4 vCol; varying vec2 vP;' +
    'void main() { vUV = aUV; vCol = aCol; vP = aP; vec2 c = aPos / uRes * 2.0 - 1.0; gl_Position = vec4(c.x, -c.y, 0.0, 1.0); }';
  const FS = 'precision mediump float; varying vec2 vUV; varying vec4 vCol; varying vec2 vP;' +
    'void main() { float d = length(vUV), v;' +
    ' if (vP.x < 0.5) { float q = max(0.0, 1.0 - d * d); v = q * q; }' +                   // 0: cut
    ' else if (vP.x < 1.5) { float q = max(0.0, 1.0 - d); v = q * q; }' +                 // 1: glow
    ' else if (vP.x < 2.5) { if (d >= 1.0 || vUV.x <= 0.0) discard;' +                    // 2: cone
    '   v = (1.0 - smoothstep(vP.y * 0.55, vP.y, abs(atan(vUV.y, vUV.x)))) * pow(1.0 - d, 1.25) * smoothstep(0.0, 0.1, d); }' +
    ' else if (vP.x < 3.5) v = 1.0;' +                                                     // 3: flat
    ' else v = 1.0 - clamp(vUV.x, 0.0, 1.0);' +                                             // 4: linear gradient
    ' gl_FragColor = vCol * v; }';
  const GE = { gl: null, cv: null, strict: false, lost: false, tried: { loose: false }, vb: null, vbo: null, prog: null, uRes: null, err: '' };
  function glCreate(strict) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 4;
    const o = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: strict };
    let gl = null;
    try { gl = cv.getContext('webgl', o) || cv.getContext('experimental-webgl', o); } catch (e) { gl = null; }
    if (!gl) return false;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
    const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) { GE.err = 'shader'; return false; }
    const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { GE.err = 'link'; return false; }
    gl.useProgram(pr);
    const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, MAXQ * 4 * STR * 4, gl.DYNAMIC_DRAW);
    const idx = new Uint16Array(MAXQ * 6);
    for (let q = 0; q < MAXQ; q++) { const v = q * 4, i = q * 6; idx[i] = v; idx[i + 1] = v + 1; idx[i + 2] = v + 2; idx[i + 3] = v; idx[i + 4] = v + 2; idx[i + 5] = v + 3; }
    const ibo = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    const at = (name, n, off) => { const l = gl.getAttribLocation(pr, name); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, STR * 4, off * 4); };
    at('aPos', 2, 0); at('aUV', 2, 2); at('aCol', 4, 4); at('aP', 2, 8);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND);
    cv.addEventListener('webglcontextlost', e => { e.preventDefault(); GE.lost = true; });
    cv.addEventListener('webglcontextrestored', () => { GE.gl = null; GE.lost = false; GE.tried.loose = false; });
    GE.gl = gl; GE.cv = cv; GE.strict = strict; GE.prog = pr; GE.uRes = gl.getUniformLocation(pr, 'uRes');
    if (!GE.vb) GE.vb = new Float32Array(MAXQ * 4 * STR);
    GE.w = GE.h = 0;
    return true;
  }
  // WebGL takes any context the browser gives; only a browser with no WebGL at all falls back to canvas.
  function glReady() {
    if (GE.lost) return false;
    if (GE.gl) return true;
    if (GE.tried.loose) return false;
    GE.tried.loose = true;
    return glCreate(false);
  }
  // WebGL everywhere unless the player picked canvas in the settings.
  function engineOf(pref) { return pref !== 'canvas' && glReady() ? 'webgl' : 'canvas'; }
  // colours -> [r, g, b, a] 0..1 (records carry CSS colours)
  const RGBA = new Map(); let parseCtx = null;
  function rgbaOf(col) {
    let v = RGBA.get(col); if (v) return v;
    let s = col;
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) { parseCtx = parseCtx || document.createElement('canvas').getContext('2d'); parseCtx.fillStyle = '#000'; parseCtx.fillStyle = col; s = parseCtx.fillStyle; }
    if (s[0] === '#') { if (s.length === 4) s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]; v = [parseInt(s.slice(1, 3), 16) / 255, parseInt(s.slice(3, 5), 16) / 255, parseInt(s.slice(5, 7), 16) / 255, 1]; }
    else { const m = s.match(/[\d.]+/g) || [0, 0, 0]; v = [m[0] / 255, m[1] / 255, m[2] / 255, m[3] == null ? 1 : +m[3]]; }
    if (RGBA.size > 400) RGBA.clear();
    RGBA.set(col, v);
    return v;
  }
  let nq = 0;
  function vert(o, x, y, u, v, r, g, b, a, mode, sp) { const B = GE.vb; B[o] = x; B[o + 1] = y; B[o + 2] = u; B[o + 3] = v; B[o + 4] = r; B[o + 5] = g; B[o + 6] = b; B[o + 7] = a; B[o + 8] = mode; B[o + 9] = sp; }
  // a quad spanned by (cx, cy) + (ax, ay) u + (bx, by) v over u0..u1, v0..v1
  function quad(cx, cy, ax, ay, bx, by, u0, u1, v0, v1, r, g, b, a, mode, sp) {
    if (nq >= MAXQ) return;
    const o = nq * 4 * STR; nq++;
    vert(o, cx + ax * u0 + bx * v0, cy + ay * u0 + by * v0, u0, v0, r, g, b, a, mode, sp);
    vert(o + STR, cx + ax * u1 + bx * v0, cy + ay * u1 + by * v0, u1, v0, r, g, b, a, mode, sp);
    vert(o + STR * 2, cx + ax * u1 + bx * v1, cy + ay * u1 + by * v1, u1, v1, r, g, b, a, mode, sp);
    vert(o + STR * 3, cx + ax * u0 + bx * v1, cy + ay * u0 + by * v1, u0, v1, r, g, b, a, mode, sp);
  }
  function recQuad(r, glow) {
    const px = Ma * r.x + Mc * r.y + Me, py = Mb * r.x + Md * r.y + Mf;
    if (r.sp > 0) {
      const R = r.rx * kpx, phi = r.rot + vrot, c = Math.cos(phi) * R, s = Math.sin(phi) * R, h = Math.min(1, Math.sin(r.sp) + 0.02);
      if (glow) { const k = r.glow > 1 ? 1 : r.glow; quad(px, py, c, s, -s, c, 0, 1, -h, h, k, k, k, k, 2, r.sp); }
      else { const k = r.cut > 1 ? 1 : r.cut; quad(px, py, c, s, -s, c, 0, 1, -h, h, 0, 0, 0, k, 2, r.sp); }
      return;
    }
    const sc = glow ? kpx * r.gs : kpx, rx = r.rx * sc, ry = r.ry * sc, rot = r.rx === r.ry ? 0 : r.rot + vrot, cs = Math.cos(rot), sn = Math.sin(rot);
    if (glow) { const k = r.glow > 1 ? 1 : r.glow, C = rgbaOf(r.col), a = k * C[3]; quad(px, py, rx * cs, rx * sn, -ry * sn, ry * cs, -1, 1, -1, 1, C[0] * a, C[1] * a, C[2] * a, a, 1, 0); }
    else { const k = r.cut > 1 ? 1 : r.cut; quad(px, py, rx * cs, rx * sn, -ry * sn, ry * cs, -1, 1, -1, 1, 0, 0, 0, k, 0, 0); }
  }
  function recRange(a, b, glow) {
    const q0 = nq;
    for (let k = a; k < b; k++) { const r = LP[k]; if ((glow ? r.glow : r.cut) > 0.004) recQuad(r, glow); }
    return [q0, nq];
  }
  function glDraw(gl, R) { if (R[1] > R[0]) gl.drawElements(gl.TRIANGLES, (R[1] - R[0]) * 6, gl.UNSIGNED_SHORT, R[0] * 12); }
  function renderGL(ctx, view, dark, A, warm) {
    const gl = GE.gl, W = Math.max(1, Math.ceil(view.cw * Q)), H = Math.max(1, Math.ceil(view.ch * Q)), S = X.scene;
    if (GE.w !== W || GE.h !== H) { GE.cv.width = GE.w = W; GE.cv.height = GE.h = H; }
    nq = 0;
    const dr = sky.r / 255 * A, dg = sky.g / 255 * A, db = sky.b / 255 * A;
    const gCut = dark ? recRange(0, nGround, false) : [0, 0];
    const dq = [nq, nq]; if (dark) { quad(0, 0, W, 0, 0, H, 0, 1, 0, 1, dr, dg, db, A, 3, 0); dq[1] = nq; }
    const gGlow = recRange(0, nGround, true);
    const roofs = [nq, nq];
    if (dark && !S && visB.length) {
      const k = 0.9;
      for (const b of visB) { const w = b.x1 - b.x0, h = b.y1 - b.y0; quad(Ma * b.x0 + Mc * b.y0 + Me, Mb * b.x0 + Md * b.y0 + Mf, Ma * w, Mb * w, Mc * h, Md * h, 0, 1, 0, 1, dr * k, dg * k, db * k, A * k, 3, 0); }
      roofs[1] = nq;
    }
    const rCut = dark ? recRange(nGround, nL, false) : [nq, nq];
    const rGlow = recRange(nGround, nL, true);
    const sun = [nq, nq];
    if (warm) {
      // the same linear gradient as the canvas path, its parameter t carried in u
      const dawn = X.clock < 720, sg = dawn ? 1 : -1, rot = view.rot || 0, ux = Math.cos(rot) * sg, uy = Math.sin(rot) * sg;
      const cx = W / 2, cy = H / 2, R = Math.max(W, H) * 0.65, x0 = cx + ux * R, y0 = cy + uy * R, dx = -ux * R * 1.4, dy = -uy * R * 1.4, L2 = dx * dx + dy * dy;
      const a = dawn ? 0.36 * sky.warm : 0.4 * sky.warm, c = dawn ? [1, 160 / 255, 90 / 255] : [1, 110 / 255, 50 / 255], tq = (x, y) => ((x - x0) * dx + (y - y0) * dy) / L2;
      if (nq < MAXQ) {
        const o = nq * 4 * STR; nq++;
        vert(o, 0, 0, tq(0, 0), 0, c[0] * a, c[1] * a, c[2] * a, a, 4, 0); vert(o + STR, W, 0, tq(W, 0), 0, c[0] * a, c[1] * a, c[2] * a, a, 4, 0);
        vert(o + STR * 2, W, H, tq(W, H), 0, c[0] * a, c[1] * a, c[2] * a, a, 4, 0); vert(o + STR * 3, 0, H, tq(0, H), 0, c[0] * a, c[1] * a, c[2] * a, a, 4, 0);
        sun[1] = nq;
      }
    }
    gl.viewport(0, 0, W, H); gl.uniform2f(GE.uRes, W, H);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, GE.vb.subarray(0, nq * 4 * STR));
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    const over = () => gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    over(); glDraw(gl, gCut);
    gl.blendFunc(gl.ONE_MINUS_DST_ALPHA, gl.ZERO); glDraw(gl, dq);              // source-out: the darkness where nothing is lit
    over(); glDraw(gl, gGlow);
    if (roofs[1] > roofs[0]) { gl.disable(gl.BLEND); glDraw(gl, roofs); gl.enable(gl.BLEND); }   // roofs: back to a flat dark
    gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA); glDraw(gl, rCut);             // destination-out
    over(); glDraw(gl, rGlow); glDraw(gl, sun);
    api.stats.quads = nq;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true; ctx.drawImage(GE.cv, 0, 0, W, H, 0, 0, W / Q, H / Q);
  }

  // profiling (X.lighting.debugFlush = true): rasterise each step of the map before timing the next
  const PH = [0, 0, 0, 0], MP = [0, 0, 0, 0, 0, 0];
  let dbg = false, tm = 0, offFrame = false;
  function step(k) { if (!dbg) return; lc.getImageData(0, 0, 1, 1); const n = performance.now(); MP[k] = MP[k] * 0.9 + (n - tm) * 0.1; tm = n; }
  function renderLight(ctx, view, t) {
    if (!X.city) return;
    const set = SET(), lvl = levelOf(set.lighting);
    LVL = lvl;
    updateSky();
    offFrame = lvl === 'off';
    if (offFrame) {   // no darkness at all (lightAt falls back to the street lamps)
      nL = nSub = nGround = 0; em = 0;
      visB.length = visLamps.length = visCars.length = visNeon.length = visBeacons.length = visSigns.length = 0;
      api.stats.lights = api.stats.submitted = api.stats.lamps = api.stats.cars = 0; api.stats.engine = 'off'; api.stats.ms *= 0.9;
      const RS = PG.renderStats; if (RS) { RS.lights = 0; RS.lightEngine = 'off'; }
      return;
    }
    dbg = !!api.debugFlush;
    if (dbg) { ctx.getImageData(0, 0, 1, 1); api.stats.mapPhase = MP; }
    const t0 = performance.now();
    const eng = engineOf(set.lightEngine), webgl = eng === 'webgl';
    NATIVE = set.fastRender !== false && api.native !== false;
    api.stats.engine = eng;
    if (!webgl) sprites();
    // dpr 1 screens may well be rasterised in software: smaller map, nearest-neighbour composite. High-dpi
    // screens have a GPU canvas in practice, where a bigger map and a filtered composite cost nothing.
    const hi = view.dpr > 1;
    Q = api.quality ? cl(+api.quality, 0.2, 1) : lvl === 'low' ? 0.25 : lvl === 'medium' ? 1 / 3 : webgl || hi ? 0.5 : 0.35;
    const s = view.scale, rot = view.rot || 0, cr = Math.cos(rot), sr = Math.sin(rot);
    vcx = view.cx; vcy = view.cy; vr = view.r; pxm = s * Q; kpx = s * Q; vrot = rot;
    Ma = Q * s * cr; Mb = Q * s * sr; Mc = -Q * s * sr; Md = Q * s * cr;
    Me = Q * (view.ax - s * (cr * view.cx - sr * view.cy)); Mf = Q * (view.ay - s * (sr * view.cx + cr * view.cy));
    gather(view, t);
    // a frame with huge overdraw (a firefight full of flashes) is drawn at a lower resolution (canvas only)
    let fq = 1;
    if (!webgl) {
      let area = 0;
      for (let k = 0; k < nL; k++) { const r = LP[k], a = r.sp > 0 ? r.rx * r.rx * 1.2 : 4 * r.rx * r.ry; area += (r.cut > 0.004 ? a : 0) + (r.glow > 0.004 ? a * r.gs * r.gs : 0); }
      area *= kpx * kpx;
      fq = area > BUDGET * MW * MH && MW ? Math.max(0.5, Math.sqrt(BUDGET * MW * MH / area)) : 1;
      if (fq < 1) { Ma *= fq; Mb *= fq; Mc *= fq; Md *= fq; Me *= fq; Mf *= fq; kpx *= fq; }
    }
    api.stats.res = fq;
    PH[0] = PH[1] = PH[2] = performance.now();
    api.stats.lights = nL;
    const d = sky.d, A = d * MAXA, S = X.scene, warm = !S && sky.warm > 0.02, dark = A > 0.004;
    if ((dark || nL || warm) && webgl) {
      renderGL(ctx, view, dark, A, warm);
      if (dbg) ctx.getImageData(0, 0, 1, 1);
      PH[1] = PH[2] = performance.now();
    } else if (dark || nL || warm) {
      ensureMap(view.cw, view.ch);
      const UW = Math.min(MW, Math.ceil(MW * fq) + 1), UH = Math.min(MH, Math.ceil(MH * fq) + 1);
      lc.setTransform(1, 0, 0, 1, 0, 0); lc.globalAlpha = 1; lc.imageSmoothingEnabled = false;
      const dc = `rgba(${sky.r | 0},${sky.g | 0},${sky.b | 0},`;
      if (dbg) { lc.getImageData(0, 0, 1, 1); tm = performance.now(); }
      if (dark && api.copyDark !== false) {
        // darkness first, then every light cuts it (destination-out): dark * A * prod(1 - cut), the same map
        // as accumulating the light and filling 'source-out', in one full-map pass fewer
        lc.globalCompositeOperation = 'copy'; lc.fillStyle = dc + A.toFixed(3) + ')'; lc.fillRect(0, 0, UW, UH); step(0);
        cutPass(0, nGround, 'destination-out'); step(1);
        lc.globalCompositeOperation = 'source-over';
      } else {
        lc.globalCompositeOperation = 'source-over'; lc.clearRect(0, 0, UW, UH);
        if (dark) {
          cutPass(0, nGround, 'source-over'); step(0);
          lc.globalCompositeOperation = 'source-out'; lc.fillStyle = dc + A.toFixed(3) + ')'; lc.fillRect(0, 0, UW, UH);
          lc.globalCompositeOperation = 'source-over';
          step(1);
        }
      }
      glowPass(0, nGround); step(2);
      if (dark && !S && visB.length) {
        // roofs sit above the street light: back to a flat, slightly moonlit dark
        lc.setTransform(Ma, Mb, Mc, Md, Me, Mf); lc.beginPath();
        for (const b of visB) lc.rect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
        lc.globalCompositeOperation = 'destination-out'; lc.fill();
        lc.globalCompositeOperation = 'source-over'; lc.fillStyle = dc + (A * 0.9).toFixed(3) + ')'; lc.fill();
      }
      step(3);
      if (dark) cutPass(nGround, nL, 'destination-out');
      step(4);
      glowPass(nGround, nL); step(5);
      if (warm) sunGlow(view, fq);
      lc.imageSmoothingEnabled = true;
      if (dbg) lc.getImageData(0, 0, 1, 1);
      PH[1] = performance.now();
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.imageSmoothingEnabled = hi; ctx.drawImage(lm, 0, 0, UW, UH, 0, 0, UW / (Q * fq), UH / (Q * fq)); ctx.imageSmoothingEnabled = true;
      if (dbg) ctx.getImageData(0, 0, 1, 1);
      PH[2] = performance.now();
    }
    if (em > 0.01 && lvl !== 'low') emissive(ctx, view, t);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    if (dbg) ctx.getImageData(0, 0, 1, 1);
    const now = performance.now(), ms = now - t0;
    api.stats.ms = api.stats.ms * 0.9 + ms * 0.1;
    const RS = PG.renderStats; if (RS) { RS.lights = nL; RS.lightEngine = eng; }
    // [gather, light map, composite, emissive] (only meaningful with debugFlush)
    const ph = api.stats.phase || (api.stats.phase = [0, 0, 0, 0]);
    ph[0] = ph[0] * 0.9 + (PH[0] - t0) * 0.1; ph[1] = ph[1] * 0.9 + (PH[1] - PH[0]) * 0.1; ph[2] = ph[2] * 0.9 + (PH[2] - PH[1]) * 0.1; ph[3] = ph[3] * 0.9 + (now - PH[2]) * 0.1;
  }
  // dawn and dusk: a warm glow from the side the sun is on
  function sunGlow(view, fq) {
    const dawn = X.clock < 720, sg = dawn ? 1 : -1, rot = view.rot || 0;
    const ux = Math.cos(rot) * sg, uy = Math.sin(rot) * sg, cx = view.cw / 2, cy = view.ch / 2, R = Math.max(view.cw, view.ch) * 0.65;
    lc.setTransform(Q * fq, 0, 0, Q * fq, 0, 0); lc.globalAlpha = 1; lc.globalCompositeOperation = 'source-over';
    const g = lc.createLinearGradient(cx + ux * R, cy + uy * R, cx - ux * R * 0.4, cy - uy * R * 0.4);
    g.addColorStop(0, dawn ? `rgba(255,160,90,${(0.36 * sky.warm).toFixed(3)})` : `rgba(255,110,50,${(0.4 * sky.warm).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,140,80,0)');
    lc.fillStyle = g; lc.fillRect(0, 0, view.cw, view.ch);
  }
  // world transform M (a DOMMatrix) * translate(x, y) * rotate(th), without a save/restore
  function place(ctx, M, x, y, th) {
    const cs = Math.cos(th), sn = Math.sin(th);
    ctx.setTransform(M.a * cs + M.c * sn, M.b * cs + M.d * sn, M.c * cs - M.a * sn, M.d * cs - M.b * sn, M.a * x + M.c * y + M.e, M.b * x + M.d * y + M.f);
  }
  // rooftop signs are pre-rendered (text is slow to draw every frame): one sprite per sign, look (painted by
  // day / glowing at night) and power-of-two pixel density, so a zoom change rarely re-renders anything
  const SIGNSPR = new Map();
  const ppmOf = view => Math.min(32, Math.max(2, Math.pow(2, Math.ceil(Math.log2(Math.max(1, view.scale * view.dpr))))));
  function signSprite(sg, glow, ppm) {
    const key = sg.text + '|' + sg.col + '|' + sg.fs.toFixed(2) + '|' + sg.w.toFixed(1) + '|' + ppm + (glow ? '|g' : '|d') + (document.fonts ? document.fonts.status : '');
    let c = SIGNSPR.get(key);
    if (c) { SIGNSPR.delete(key); SIGNSPR.set(key, c); return c; }   // most recently used last
    if (SIGNSPR.size >= 40) SIGNSPR.delete(SIGNSPR.keys().next().value);
    const W = sg.w + 0.4, H = sg.fs * 1.2;
    c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(W * ppm)); c.height = Math.max(1, Math.ceil(H * ppm));
    const g = c.getContext('2d');
    g.setTransform(ppm, 0, 0, ppm, c.width / 2, c.height / 2);
    g.font = `900 ${sg.fs.toFixed(2)}px "Barlow Condensed", Impact, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (!glow) { g.globalAlpha = 0.55; g.lineWidth = 0.16; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.strokeText(sg.text, 0, 0, sg.w); }
    g.fillStyle = sg.col; g.fillText(sg.text, 0, 0, sg.w);
    c.mw = W; c.mh = H;
    SIGNSPR.set(key, c);
    return c;
  }
  function drawSign(ctx, M, sg, glow, ppm) {
    const spr = signSprite(sg, glow, ppm);
    place(ctx, M, sg.x, sg.y, sg.rot || 0);
    ctx.drawImage(spr, -spr.mw / 2, -spr.mh / 2, spr.mw, spr.mh);
  }
  // light sources themselves, crisp and bright on top of the dark
  function emissive(ctx, view, t) {
    PG.cityDraw.worldTransform(ctx, view);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = em;
    const parts = PG.game && PG.game.particles;
    if (parts && parts.length) {
      ctx.strokeStyle = 'rgba(255,190,110,0.8)'; ctx.lineWidth = 0.07; ctx.beginPath();
      let n = 0;
      for (let k = parts.length - 1; k >= 0 && n < 160; k--) { const p = parts[k]; if (p.kind !== 'spark') continue; n++; ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); }
      if (n) ctx.stroke();
    }
    if (X.scene) { ctx.globalAlpha = 1; return; }
    const fine = view.scale > 6;   // lamp heads, lenses and sign letters vanish below a pixel on the big map
    if (fine) for (let ci = 0; ci < 3; ci++) {
      ctx.fillStyle = LAMPC[ci]; ctx.beginPath(); let any = false;
      for (const f of visLamps) if (f.col === ci) { any = true; ctx.moveTo(f.hx + 0.3, f.hy); ctx.arc(f.hx, f.hy, 0.3, 0, TAU); }
      if (any) { ctx.globalAlpha = em * 0.9; ctx.fill(); }
    }
    ctx.lineCap = 'round';
    for (const F of visNeon) for (const n of F.neon) {
      if (!(n.k > 0)) continue;
      ctx.strokeStyle = n.col;
      ctx.globalAlpha = em * n.k * 0.3; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(n.x0, n.y0); ctx.lineTo(n.x1, n.y1); ctx.stroke();
      ctx.globalAlpha = em * n.k; ctx.lineWidth = 0.34; ctx.stroke();
    }
    ctx.lineCap = 'butt';
    const M = ctx.getTransform();
    if (fine && visSigns.length) {
      const ppm = ppmOf(view);
      for (const sg of visSigns) { if (!(sg.k > 0.2)) continue; ctx.globalAlpha = em * sg.k; drawSign(ctx, M, sg, true, ppm); }
      ctx.setTransform(M);
    }
    ctx.fillStyle = '#ff3a2a'; ctx.globalAlpha = em; ctx.beginPath(); let nb = 0;
    for (const F of visBeacons) for (const bc of F.beacons) if (bc.on) { nb++; ctx.moveTo(bc.x + 0.28, bc.y); ctx.arc(bc.x, bc.y, 0.28, 0, TAU); }
    if (nb) ctx.fill();
    if (fine) { for (const c of visCars) carLenses(ctx, M, c, t); ctx.setTransform(M); }
    ctx.globalAlpha = 1;
  }
  function carLenses(ctx, M, c, t) {
    if (!X.inView(c.x, c.y, c.len)) return;
    const L = c.len, W = c.wid, kind = c.model && c.model.kind, hk = c.maxHp ? c.hp / c.maxHp : 1;
    if (!c.lightsOn && !c.braking && !c.siren) return;
    place(ctx, M, c.x, c.y, c.th);
    if (c.lightsOn) {
      ctx.fillStyle = HEAD; ctx.globalAlpha = em;
      ctx.fillRect(L / 2 - 0.13, -W / 2 + 0.12, 0.12, 0.38);
      if (hk >= 0.18 || Math.sin(t * 23 + c.id) > -0.2) ctx.fillRect(L / 2 - 0.13, W / 2 - 0.5, 0.12, 0.38);
    }
    if (c.lightsOn || c.braking) {
      ctx.fillStyle = TAIL; ctx.globalAlpha = em * (c.braking ? 1 : 0.6);
      ctx.fillRect(-L / 2 + 0.02, -W / 2 + 0.12, 0.1, 0.36); ctx.fillRect(-L / 2 + 0.02, W / 2 - 0.48, 0.1, 0.36);
    }
    if (c.siren) {
      const fast = kind === 'ambulance' || kind === 'fire', on = Math.floor(t * (fast ? 6 : 8)) % 2 === 0;
      ctx.globalAlpha = em;
      if (kind === 'police' || !kind || kind === 'taxi' || kind === 'sports' || kind === 'van') { ctx.fillStyle = on ? '#ff3030' : '#3a1010'; ctx.fillRect(-0.15, -0.7, 0.28, 0.66); ctx.fillStyle = on ? '#10183a' : '#3a78ff'; ctx.fillRect(-0.15, 0.04, 0.28, 0.66); }
      else { ctx.fillStyle = on ? '#ff3030' : '#3a6cff'; ctx.fillRect(L * (fast ? 0.22 : 0.25), -0.6, 0.25, 1.2); }
    }
    if (kind === 'taxi' && c.lightsOn) { ctx.fillStyle = '#ffe680'; ctx.globalAlpha = em * 0.7; ctx.fillRect(-0.2, -0.38, 0.26, 0.76); }
  }
  // extra neon tubes (Neon Mile) and the rooftop signs, unlit by day; the night pass makes them glow
  function renderBuildings(ctx, view) {
    if (X.scene || !X.city) return;
    ctx.lineWidth = 0.4;
    for (const col of NEON) {   // one path per colour
      let any = false;
      for (const n of neonExtra) {
        if (n.col !== col || !X.inView(n.cx, n.cy, n.len / 2 + 2)) continue;
        if (!any) { any = true; ctx.beginPath(); }
        ctx.moveTo(n.x0, n.y0); ctx.lineTo(n.x1, n.y1);
      }
      if (any) { ctx.strokeStyle = col; ctx.stroke(); }
    }
    const M = ctx.getTransform(), ppm = ppmOf(view);
    let any = false;
    for (const sg of signs) {
      if (!X.inView(sg.x, sg.y, sg.w)) continue;
      any = true; drawSign(ctx, M, sg, false, ppm);
    }
    if (any) ctx.setTransform(M);
    ctx.globalAlpha = 1;
  }

  // ================= light level at a point (for stealth, AI) =================
  function recCut(r, x, y) {
    const dx = x - r.x, dy = y - r.y;
    if (r.sp > 0) {
      const cs = Math.cos(r.rot), sn = Math.sin(r.rot), a = dx * cs + dy * sn, b = -dx * sn + dy * cs, dd = Math.hypot(a, b) / r.rx;
      if (dd >= 1 || a <= 0) return 0;
      return r.cut * Math.pow(1 - dd, 1.25) * (1 - sstep(r.sp * 0.55, r.sp, Math.abs(Math.atan2(b, a))));
    }
    let ax = dx, ay = dy;
    if (r.rot) { const cs = Math.cos(r.rot), sn = Math.sin(r.rot); ax = dx * cs + dy * sn; ay = -dx * sn + dy * cs; }
    const dd = Math.hypot(ax / r.rx, ay / r.ry);
    return dd >= 1 ? 0 : r.cut * (1 - dd * dd) * (1 - dd * dd);
  }
  // 0 = pitch dark, 1 = daylight. Uses this frame's lights inside the view, street lamps elsewhere.
  function lightAt(x, y) {
    updateSky();
    if (sky.d < 0.01) return 1;
    let keep = 1;
    if (X.lastView && X.inView(x, y, 0) && !offFrame) { for (let k = 0; k < nL; k++) { const f = recCut(LP[k], x, y); if (f > 0) keep *= 1 - Math.min(1, f); } }
    else if (lampGrid && !X.scene) {
      const i0 = cl(Math.floor((x - 12 + CELL) / CELL), 0, GX - 1), i1 = cl(Math.floor((x + 12 + CELL) / CELL), 0, GX - 1);
      const j0 = cl(Math.floor((y - 12 + CELL) / CELL), 0, GY - 1), j1 = cl(Math.floor((y + 12 + CELL) / CELL), 0, GY - 1);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (const f of lampGrid[i + j * GX] || []) {
        if (f.l.broken) continue;
        const dd = Math.hypot(x - f.px, y - f.py) / 10.5; if (dd >= 1) continue;
        keep *= 1 - 0.86 * sstep(f.th, f.th + 0.07, sky.d) * (1 - dd * dd) * (1 - dd * dd);
      }
    }
    return cl(1 - sky.d * keep, 0, 1);
  }

  // ================= behaviour =================
  function clickSnd(on) {
    const k = PG.audio && PG.audio.kit && PG.audio.kit(); if (!k) return;
    k.tone('square', on ? 1900 : 1500, k.now, 0.025, 0.04, { lp: 4000 });
    k.tone('square', on ? 2500 : 1100, k.now + 0.05, 0.025, 0.035, { lp: 4000 });
  }
  function toggleLights() {
    if (!X.active || !P.ped) return;
    if (P.car) {
      const c = P.car;
      if (c.wrecked) return;
      c.lightsOn = !c.lightsOn; pref = c.lightsOn;
      X.popup(pref ? 'Headlights on' : 'Headlights off. Very stealthy. Very illegal.');
      clickSnd(pref);
    } else {
      torch = !torch;
      X.popup(torch ? 'Torch on' : 'Torch off');
      clickSnd(torch);
    }
  }
  // Headlights follow who is at the wheel: on when someone drives, off a few seconds after they leave.
  function autoLights() {
    for (const c of X.cars) {
      if (c.removed) continue;
      const occ = !!(c.driver || c.npcDriver || (c.ai && c.ai.drive)) || c.ctrl === 'path';
      if (c._lgo === undefined) { c._lgo = occ; if (!occ && c.ctrl === 'parked') c.lightsOn = false; continue; }
      if (occ !== c._lgo) {
        c._lgo = occ;
        if (occ) { if (!c.wrecked) c.lightsOn = c === P.car ? pref : true; c._lgoff = 0; }
        else c._lgoff = X.time + 6;
      }
      if (!occ && c._lgoff && X.time > c._lgoff) { c.lightsOn = false; c._lgoff = 0; }
    }
  }
  const DAWN_LINES = ['Sunrise. The night shift goes to bed.', 'Morning. Somewhere, Artur is already angry.', 'Dawn. Every lamp in town clocks off.', 'Day breaks. So does the speed limit.'];
  const NIGHT_LINES = ['Nightfall. The lamps come on, the cops get bored.', 'Night again. Neon Mile wakes up.', 'Dark out. Headlights on, Take the Bus fans.', 'Night falls over the city nobody planned.'];
  function phases() {
    const ph = sky.clockD > 0.6 ? 'night' : sky.clockD < 0.05 ? 'day' : null;
    if (!ph || ph === phase) return;
    const first = phase === null; phase = ph;
    if (!first) {
      const L = ph === 'day' ? DAWN_LINES : NIGHT_LINES;
      X.popup(L[Math.floor(Math.random() * L.length)], 3600);
    }
    X.emit('dayPhase', { phase: ph, first });
  }
  // the first time you drive in the dark, a word about the L key
  let hintT = -1;
  function hintTick(dt) {
    if (hintT === -2 || !P.car || sky.d < 0.5 || P.state !== 'play') return;
    if (hintT < 0) hintT = 0;
    hintT += dt;
    if (hintT > 2.6) { hintT = -2; X.popup('L: headlights on / off', 2600); }
  }
  // flickering lamps buzz when you walk past them
  let buzzT = 0;
  function lampBuzz(dt) {
    buzzT -= dt;
    if (!lampGrid || X.scene || P.car || sky.d < 0.3 || buzzT > 0 || !P.ped) return;
    const p = P.ped, t = X.renderT || 0, cell = lampGrid[cellIdx(p.x, p.y)];
    if (!cell) return;
    for (const f of cell) {
      if (!f.flick || f.l.broken || Math.abs(f.hx - p.x) > 9 || Math.abs(f.hy - p.y) > 9) continue;
      const k = lampLevel(f, sky.d, t), was = f.kb == null ? k : f.kb; f.kb = k;
      if (was > 0.4 && k < 0.2) {
        const kit = PG.audio && PG.audio.kit && PG.audio.kit(); buzzT = 0.35;
        if (kit) { kit.tone('sawtooth', 100, kit.now, 0.09, 0.025, { lp: 900 }); kit.noise(kit.now, 0.05, 0.02, 'bandpass', 3000, { Q: 3 }); }
      }
    }
  }
  // broken lamps near you spit the odd spark at night
  function lampSparks(dt) {
    if (!lampGrid || X.scene || sky.d < 0.3) return;
    const f0 = X.focus(), i0 = cl(Math.floor((f0.x - 30 + CELL) / CELL), 0, GX - 1), i1 = cl(Math.floor((f0.x + 30 + CELL) / CELL), 0, GX - 1);
    const j0 = cl(Math.floor((f0.y - 30 + CELL) / CELL), 0, GY - 1), j1 = cl(Math.floor((f0.y + 30 + CELL) / CELL), 0, GY - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (const f of lampGrid[i + j * GX] || []) {
      if (!f.l.broken || Math.random() > dt * 0.25) continue;
      if (Math.abs(f.hx - f0.x) > 30 || Math.abs(f.hy - f0.y) > 30) continue;
      PG.burst(f.hx, f.hy, 'spark', 4, 3, 0.35, 0.06);
    }
  }

  // the clock gets a little sun / moon
  const css = `
#gta-hud .g-clock[data-sky]::before { content: ''; display: inline-block; width: 11px; height: 11px; border-radius: 50%; margin-right: 6px; vertical-align: -1px; }
#gta-hud .g-clock[data-sky="day"]::before { background: #ffd23a; box-shadow: 0 0 6px #ffb02e; }
#gta-hud .g-clock[data-sky="dusk"]::before { background: linear-gradient(180deg, #ff9a3a 50%, #3a2f55 50%); box-shadow: 0 0 5px rgba(255,140,60,0.7); }
#gta-hud .g-clock[data-sky="night"]::before { background: transparent; box-shadow: inset -4px -1px 0 0 #dfe6ff; }
`;
  let styled = false, clockEl = null, skyIcon = '';
  function hud() {
    if (!styled) { styled = true; const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }
    if (!clockEl || !clockEl.isConnected) clockEl = document.querySelector('#gta-hud .g-clock');
    if (!clockEl) return;
    const icon = sky.clockD > 0.6 ? 'night' : sky.clockD < 0.05 ? 'day' : 'dusk';
    if (icon !== skyIcon) { skyIcon = icon; clockEl.setAttribute('data-sky', icon); }
  }

  // the base game's faint lamp discs would show at noon; in GTA mode this module draws the real pools
  if (PG.cityDraw && PG.cityDraw.lampPools) {
    const baseLampPools = PG.cityDraw.lampPools;
    PG.cityDraw.lampPools = function (ctx, C, view) { if (X.active && PG.game && PG.game.mode === 'gta' && lampGrid) return; return baseLampPools.apply(this, arguments); };
  }

  X.on('explosion', e => {
    if (!X.active || !e) return;
    const f = X.playerPos(), p = e.power || 1, k = p * cl(1 - Math.hypot(e.x - f.x, e.y - f.y) / 140, 0, 1);
    if (k > 0 && (e.x > 2900) === !!X.scene) flashK = Math.min(1, flashK + 0.4 * k);   // same side of the door as you
    booms.push({ x: e.x, y: e.y, p: cl(p, 0.3, 3), t0: X.time });
    if (booms.length > 16) booms.shift();
  });
  X.on('enterCar', e => { if (X.active && e && e.car && !e.car.wrecked) { e.car.lightsOn = pref; e.car._lgo = true; e.car._lgoff = 0; } });

  X.mod('lighting', {
    order: 90,
    init() { resetState(); buildFixtures(); updateSky(); skyIcon = ''; hintT = -1; buzzT = 0; prewarm(); },
    stop() {
      if (clockEl) { clockEl.removeAttribute('data-sky'); }
      skyIcon = ''; booms = []; lampGrid = null; BF = []; neonExtra = []; signs = []; torch = false; flashK = 0;
    },
    tick(dt) {
      updateSky();
      if (P.state === 'play' && X.input.pressed('KeyL')) toggleLights();
      autoLights();
      flashK *= Math.exp(-dt * 3.5); if (flashK < 0.002) flashK = 0;
      if (booms.length && X.time - booms[0].t0 > 2) booms.shift();
      phases();
      lampSparks(dt);
      hintTick(dt);
      lampBuzz(dt);
    },
    hud,
    render: { buildings: renderBuildings, light: renderLight },
  });
})(typeof window !== 'undefined' ? (window.PG = window.PG || {}) : (globalThis.PG = globalThis.PG || {}));
