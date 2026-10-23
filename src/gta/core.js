// Grand Theft Bus: a free-roam crime sandbox in the random night city. This core owns the world, the
// player on foot and behind the wheel, every vehicle's physics, traffic, the camera, the render layers,
// the HUD frame and the module/service API. Feature modules (src/gta/*.js) plug in with X.mod(...) and
// by replacing the overridable services below. Read src/gta/API.md before writing a module.
(function (PG) {
  if (typeof document === 'undefined') return;
  const X = PG.gta = { active: false };
  const G = () => PG.game;
  const TAU = Math.PI * 2;
  const cl = (x, a, b) => Math.max(a, Math.min(b, x));
  const wrap = a => PG.wrap(a);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  X.util = { cl, wrap, rand, pick, TAU, lerp: (a, b, t) => a + (b - a) * t, dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y), angTo: (a, b) => Math.atan2(b.y - a.y, b.x - a.x) };

  // ================= modules, events, services =================
  X.modules = [];
  const errs = new Set();
  function safe(m, name, fn, args) {
    try { return fn.apply(m, args); } catch (e) { const k = m.name + '.' + name; if (!errs.has(k)) { errs.add(k); console.error('[gta] ' + k + ' failed:', e); } }
    return undefined;
  }
  // def: { order, init(), stop(), tick(dt), hud(dt), render: { <layer>: fn(ctx, view, t) } }
  X.mod = function (name, def) {
    def.name = name; if (def.order == null) def.order = 50;
    X.modules = X.modules.filter(m => m.name !== name).concat(def).sort((a, b) => a.order - b.order);
    return def;
  };
  X.has = name => X.modules.some(m => m.name === name);
  function hook(name, ...args) { for (const m of X.modules) if (m[name]) safe(m, name, m[name], args); }
  const listeners = {};
  X.on = (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); };
  X.emit = (type, d) => {
    d = d || {};
    const a = listeners[type];
    if (a) for (const fn of a) { try { fn(d); } catch (e) { const k = 'event.' + type; if (!errs.has(k)) { errs.add(k); console.error('[gta] ' + k + ' listener failed:', e); } } }
    return d;
  };

  // ================= car models =================
  // dims match the base game's cars; dyn is a PG.DYN id or a full drivetrain spec. weight = traffic share.
  const FAST = { m: 1450, ff: 0.45, h: 0.45, drive: 'R', type: 'ice', kw: 470, nm: 700, red: 8200, n: 7, v1: 75, vN: 330, cyl: 8, vmax: 290, z100: 3.3, cda: 0.62, shift: 0.08 };
  X.MODELS = {
    bambino: { name: 'Bambino', len: 3.57, wid: 1.63, wb: 2.30, turn: 9.3, dyn: 'fiat500', hp: 700, value: 300, weight: 13, colors: ['#e9dcb8', '#9fd0c8', '#d64a3b', '#f2f2f2'] },
    hatch: { name: 'Hatchling', len: 4.28, wid: 1.79, wb: 2.64, turn: 10.9, dyn: 'golf', hp: 850, value: 600, weight: 15, colors: ['#4a6fa5', '#c9ccd1', '#2b2d33', '#8a1f1a', '#3e5c4a'] },
    comet: { name: 'Comet', len: 4.37, wid: 1.79, wb: 2.64, turn: 10.4, dyn: 'corolla', hp: 900, value: 700, weight: 10, colors: ['#c9ccd1', '#e9e4d8', '#6b7f99', '#5a4a6b'] },
    taxi: { name: 'Taxi', kind: 'taxi', len: 4.37, wid: 1.79, wb: 2.64, turn: 10.4, dyn: 'corolla', hp: 950, value: 800, weight: 7, color: '#f2c230' },
    voltage: { name: 'Voltage EV', len: 4.72, wid: 1.85, wb: 2.88, turn: 11.6, dyn: 'model3', hp: 900, value: 1800, weight: 7, colors: ['#eeeeee', '#b0151a', '#1d2a44', '#101214'] },
    regret: { name: 'Regret-Mobile', len: 4.75, wid: 1.92, wb: 2.89, turn: 12.1, dyn: 'modely', hp: 1000, value: 2000, weight: 6, colors: ['#3b4049', '#eeeeee', '#7d8a99'] },
    fjord: { name: 'Fjord XC', len: 4.95, wid: 1.96, wb: 2.98, turn: 12.5, dyn: 'xc90', hp: 1100, value: 2200, weight: 6, colors: ['#8a9199', '#1f3f6e', '#2b2d33'] },
    rancher: { name: 'Rancher', len: 5.89, wid: 2.03, wb: 3.69, turn: 14.0, dyn: 'f150', hp: 1300, value: 1500, weight: 6, colors: ['#7a2a24', '#2f4a32', '#c9ccd1', '#b08d3c'] },
    boxvan: { name: 'Box Van', kind: 'van', box: true, len: 7.5, wid: 2.4, wb: 4.5, turn: 15.5, dyn: 'truck', hp: 1600, value: 1100, weight: 4, color: '#e6e1d3' },
    x5: { name: 'BMW X5', len: 4.92, wid: 2.0, wb: 2.975, turn: 12.6, dyn: 'x5', hp: 1150, value: 3000, weight: 3, colors: ['#1f4f9c', '#101214', '#e8e8e8'] },
    furia: { name: 'Furia GT', kind: 'sports', len: 4.5, wid: 1.95, wb: 2.65, turn: 11.0, dyn: FAST, hp: 800, value: 6000, weight: 2, colors: ['#d0141e', '#f2c230', '#f07a12'] },
    bus: { name: 'City Bus', kind: 'bus', len: 11.6, wid: 2.55, wb: 6.0, turn: 21, hp: 3000, value: 2500, weight: 2, color: '#d9381e',
      dyn: { m: 11500, ff: 0.35, h: 1.2, drive: 'R', type: 'ice', kw: 220, nm: 1200, red: 2600, n: 6, v1: 20, vN: 95, cyl: 6, vmax: 90, z100: 25, cda: 7.5, shift: 0.5, mu: 0.85 } },
    police: { name: 'Police Cruiser', kind: 'police', len: 4.9, wid: 1.9, wb: 2.9, turn: 11.8, hp: 1500, value: 0, weight: 0, color: '#f4f4f4',
      dyn: { m: 1800, ff: 0.52, h: 0.5, drive: 'R', type: 'ice', kw: 300, nm: 520, red: 6500, n: 6, v1: 62, vN: 280, cyl: 8, vmax: 230, z100: 5.6, cda: 0.7, shift: 0.12 } },
    swat: { name: 'SWAT Van', kind: 'swat', box: true, len: 6.2, wid: 2.3, wb: 3.8, turn: 14, hp: 4000, value: 0, weight: 0, color: '#1b1f27',
      dyn: { m: 5200, ff: 0.5, h: 1.0, drive: 'A', type: 'ice', kw: 260, nm: 800, red: 3800, n: 6, v1: 30, vN: 150, cyl: 8, vmax: 150, z100: 12, cda: 4.5, shift: 0.3 } },
    ambulance: { name: 'Ambulance', kind: 'ambulance', box: true, len: 5.9, wid: 2.2, wb: 3.6, turn: 13.5, hp: 1600, value: 1500, weight: 0, color: '#f2f2f2',
      dyn: { m: 3200, ff: 0.5, h: 0.9, drive: 'R', type: 'ice', kw: 160, nm: 400, red: 4500, n: 6, v1: 40, vN: 170, cyl: 6, vmax: 150, z100: 11, cda: 3.2, shift: 0.3 } },
    firetruck: { name: 'Fire Truck', kind: 'fire', box: true, len: 8.5, wid: 2.5, wb: 4.8, turn: 17, hp: 3000, value: 2000, weight: 0, color: '#c81e1e',
      dyn: { m: 14000, ff: 0.4, h: 1.3, drive: 'R', type: 'ice', kw: 300, nm: 1500, red: 2400, n: 6, v1: 18, vN: 105, cyl: 6, vmax: 110, z100: 22, cda: 8, shift: 0.5, mu: 0.85 } },
    securicar: { name: 'Securicar', kind: 'armored', box: true, len: 5.6, wid: 2.2, wb: 3.4, turn: 13, hp: 3500, value: 4000, weight: 0, color: '#5f6b5a',
      dyn: { m: 6000, ff: 0.5, h: 1.0, drive: 'R', type: 'ice', kw: 220, nm: 700, red: 4000, n: 6, v1: 32, vN: 140, cyl: 6, vmax: 130, z100: 14, cda: 4.2, shift: 0.3 } },
    // the army's (never in traffic: they live at Camp Bussby, rooms_military.js; the tank is police.js's)
    jeep: { name: 'Army Jeep', kind: 'jeep', len: 4.3, wid: 1.95, wb: 2.6, turn: 11.2, hp: 2200, value: 1800, weight: 0, color: '#4f5a36',
      dyn: { m: 1900, ff: 0.5, h: 0.75, drive: 'A', type: 'ice', kw: 190, nm: 460, red: 5200, n: 5, v1: 45, vN: 175, cyl: 6, vmax: 165, z100: 8.5, cda: 1.1, shift: 0.2, mu: 1.05 } },
    armytruck: { name: 'Army Truck', kind: 'armytruck', box: true, len: 8.2, wid: 2.55, wb: 4.7, turn: 16.5, hp: 4500, value: 2600, weight: 0, color: '#4a5634',
      dyn: { m: 9500, ff: 0.45, h: 1.3, drive: 'A', type: 'ice', kw: 260, nm: 1300, red: 2800, n: 6, v1: 22, vN: 110, cyl: 6, vmax: 105, z100: 20, cda: 7, shift: 0.45, mu: 0.95 } },
    apc: { name: 'Pansarvogn APC', kind: 'apc', box: true, len: 6.9, wid: 2.8, wb: 3.9, turn: 15, hp: 7500, value: 5000, weight: 0, color: '#55603e',
      dyn: { m: 14000, ff: 0.5, h: 1.2, drive: 'A', type: 'ice', kw: 330, nm: 1600, red: 2800, n: 6, v1: 20, vN: 100, cyl: 8, vmax: 100, z100: 17, cda: 6.5, shift: 0.45, mu: 1.05 } },
  };
  X.worldHooks = [];   // fn(city, seededRandom, places) after the places are picked, before any module's init
  const DEFS = {};
  X.modelDef = function (id) {
    if (DEFS[id]) return DEFS[id];
    const m = X.MODELS[id] || X.MODELS.hatch;
    m.id = id;
    PG.DYN[id] = Object.assign({}, typeof m.dyn === 'string' ? PG.DYN[m.dyn] : m.dyn);
    const def = PG.derive({ id, name: m.name, len: m.len, wid: m.wid, wb: m.wb, turn: m.turn, color: m.color || '#888' });
    def.dyn = PG.dynFor(def);
    return (DEFS[id] = def);
  };
  const carMid = def => (def.wb + def.fo - def.ro) / 2;
  X.carMid = carMid;

  // ================= people =================
  const SKIN = ['#f1c7a1', '#e0ac7e', '#c68a5c', '#8d5a3b', '#5c3a24', '#f6d7bd'];
  const HAIR = ['#1b1612', '#3a2a1e', '#6d4c2f', '#b9a47a', '#d8c08a', '#8a8a8a', '#a33a1e'];
  const SHIRT = ['#2f6fb5', '#c0392b', '#e9e4d8', '#3e8e5a', '#f2c230', '#6b4a8f', '#1b1f27', '#e07b2a', '#3fb6c4', '#d64a8f'];
  const PANTS = ['#1f2a44', '#2b2d33', '#4a3b2a', '#5a5d64', '#24332a', '#6b5a3e'];
  X.randomLook = () => ({ skin: pick(SKIN), hair: pick(HAIR), shirt: pick(SHIRT), pants: pick(PANTS), hat: Math.random() < 0.12 ? pick(['#1b1f27', '#8a1f1a', '#e9e4d8', '#2f6fb5']) : null });
  X.uid = 0;
  // A person. team: 'civ' | 'cop' | 'gang' | 'guard' | 'player' ... ai: owned by whichever module set it.
  X.makePed = function (o) {
    const p = Object.assign({
      id: ++X.uid, kind: 'ped', x: 0, y: 0, th: 0, vx: 0, vy: 0, r: 0.32, hp: 100, maxHp: 100, armor: 0, dead: false, deadT: 0,
      walk: 0, speed: 0, car: null, team: 'civ', look: X.randomLook(), weapon: null, ai: null, onFire: 0, knock: 0, hitCd: 0,
      hidden: false, isPlayer: false, removed: false, hurtT: 0,
    }, o || {});
    X.peds.push(p);
    return p;
  };

  // ================= collision helpers =================
  // Push a circle out of a convex polygon: {x, y, nx, ny, depth} or null.
  function circlePoly(cx, cy, r, poly) {
    let best = Infinity, qx = 0, qy = 0;
    for (let i = 0, n = poly.length; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n], dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
      let t = L ? ((cx - a.x) * dx + (cy - a.y) * dy) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = a.x + dx * t, py = a.y + dy * t, d = (cx - px) * (cx - px) + (cy - py) * (cy - py);
      if (d < best) { best = d; qx = px; qy = py; }
    }
    const d = Math.sqrt(best), inside = PG.pointInPoly({ x: cx, y: cy }, poly);
    if (!inside && d >= r) return null;
    let nx, ny;
    if (d > 1e-6) { nx = (cx - qx) / d; ny = (cy - qy) / d; if (inside) { nx = -nx; ny = -ny; } }
    else { nx = 1; ny = 0; }
    const depth = inside ? d + r : r - d;
    return { x: nx * depth, y: ny * depth, nx, ny, depth };
  }
  X.circlePoly = circlePoly;
  X.solidsNear = (x, y, r) => PG.cityNear(X.city, x, y, r);
  X.carPoly = c => c.dv ? PG.vehPolys(c.dv)[0] : PG.obb(c.x, c.y, c.len, c.wid, c.th);
  X.carVel = c => c.dv ? { x: c.dv.vx, y: c.dv.vy } : c.ctrl === 'path' ? { x: Math.cos(c.th) * c.v, y: Math.sin(c.th) * c.v } : { x: 0, y: 0 };
  // Is (x, y) inside a building / solid?
  X.blocked = function (x, y, r) {
    r = r || 0;
    for (const o of PG.cityNear(X.city, x, y, r + 0.5)) if (r ? circlePoly(x, y, r, o.poly) : PG.pointInPoly({ x, y }, o.poly)) return o;
    return null;
  };
  function segPoly(x0, y0, x1, y1, poly) {   // first t in [0,1] where the segment enters the polygon
    let best = Infinity;
    if (PG.pointInPoly({ x: x0, y: y0 }, poly)) return 0;
    const dx = x1 - x0, dy = y1 - y0;
    for (let i = 0, n = poly.length; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n], ex = b.x - a.x, ey = b.y - a.y, den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((a.x - x0) * ey - (a.y - y0) * ex) / den, u = ((a.x - x0) * dy - (a.y - y0) * dx) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && t < best) best = t;
    }
    return best;
  }
  function segCircle(x0, y0, x1, y1, cx, cy, r) {
    const dx = x1 - x0, dy = y1 - y0, fx = x0 - cx, fy = y0 - cy, a = dx * dx + dy * dy;
    if (a < 1e-12) return Infinity;
    const b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - r * r, disc = b * b - 4 * a * c;
    if (c <= 0) return 0;
    if (disc < 0) return Infinity;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    return t >= 0 && t <= 1 ? t : Infinity;
  }
  // Segment cast. opts: {solids=true, cars=false, peds=false, ignore: entity|[entities], deadPeds=false}.
  // Returns {t, x, y, kind: 'solid'|'car'|'ped', obj} for the nearest hit, or null.
  X.raycast = function (x0, y0, x1, y1, o) {
    o = o || {};
    const ign = o.ignore ? [].concat(o.ignore) : [];
    let best = null;
    const take = (t, kind, obj) => { if (t < (best ? best.t : Infinity)) best = { t, kind, obj }; };
    const len = Math.hypot(x1 - x0, y1 - y0), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    if (o.solids !== false) for (const s of PG.cityNear(X.city, mx, my, len / 2 + 1)) { if (o.solidFilter && !o.solidFilter(s)) continue; const t = segPoly(x0, y0, x1, y1, s.poly); if (t !== Infinity) take(t, 'solid', s); }
    if (o.cars) for (const c of X.cars) {
      if (c.removed || ign.includes(c) || Math.abs(c.x - mx) > len / 2 + c.len || Math.abs(c.y - my) > len / 2 + c.len) continue;
      const t = segPoly(x0, y0, x1, y1, X.carPoly(c)); if (t !== Infinity) take(t, 'car', c);
    }
    if (o.peds) for (const p of X.peds) {
      if (p.removed || p.hidden || p.car || (p.dead && !o.deadPeds) || ign.includes(p) || Math.abs(p.x - mx) > len / 2 + 1 || Math.abs(p.y - my) > len / 2 + 1) continue;
      const t = segCircle(x0, y0, x1, y1, p.x, p.y, p.r + (o.pad || 0)); if (t !== Infinity) take(t, 'ped', p);
    }
    if (best) { best.x = x0 + (x1 - x0) * best.t; best.y = y0 + (y1 - y0) * best.t; }
    return best;
  };
  X.lineOfSight = (a, b) => !X.raycast(a.x, a.y, b.x, b.y);

  // ================= roads & navigation =================
  // Which road is (x, y) on? {horiz, idx, c (centre coord), w} or null; on a junction, both.
  X.roadAt = function (x, y) {
    const C = X.city; let h = null, v = null;
    for (let j = 0; j < C.ys.length; j++) if (Math.abs(y - C.ys[j]) < C.wy[j] / 2 && x > -8 && x < C.W + 8) { h = { horiz: true, idx: j, c: C.ys[j], w: C.wy[j] }; break; }
    for (let i = 0; i < C.xs.length; i++) if (Math.abs(x - C.xs[i]) < C.wx[i] / 2 && y > -8 && y < C.H + 8) { v = { horiz: false, idx: i, c: C.xs[i], w: C.wx[i] }; break; }
    if (h && v) return { junction: true, h, v };
    return h || v;
  };
  X.blockAt = function (x, y) { for (const b of X.city.blocks) if (x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1) return b; return null; };
  X.onSidewalk = function (x, y) { const b = X.blockAt(x, y); return !!b && (x < b.x0 + 4.5 || x > b.x1 - 4.5 || y < b.y0 + 4.5 || y > b.y1 - 4.5); };
  X.nodePos = (i, j) => ({ x: X.city.xs[i], y: X.city.ys[j] });
  X.nearestNode = function (x, y) {
    const C = X.city; let bi = 0, bj = 0, bd = Infinity;
    for (let i = 0; i < C.xs.length; i++) { const d = Math.abs(C.xs[i] - x); if (d < bd) { bd = d; bi = i; } }
    bd = Infinity; for (let j = 0; j < C.ys.length; j++) { const d = Math.abs(C.ys[j] - y); if (d < bd) { bd = d; bj = j; } }
    return { i: bi, j: bj, x: C.xs[bi], y: C.ys[bj] };
  };
  // Nearest point on any road centre line.
  X.nearestRoadPoint = function (x, y) {
    const C = X.city; let best = null;
    for (let j = 0; j < C.ys.length; j++) { const d = Math.abs(y - C.ys[j]); if (!best || d < best.d) best = { d, x: cl(x, 0, C.W), y: C.ys[j], horiz: true, idx: j }; }
    for (let i = 0; i < C.xs.length; i++) { const d = Math.abs(x - C.xs[i]); if (d < best.d) best = { d, x: C.xs[i], y: cl(y, 0, C.H), horiz: false, idx: i }; }
    return best;
  };
  // Waypoints along road centre lines from (x0, y0) to (x1, y1): BFS over the junction grid.
  X.route = function (x0, y0, x1, y1) {
    const C = X.city, NX = C.xs.length, NY = C.ys.length;
    const s = X.nearestRoadPoint(x0, y0), e = X.nearestRoadPoint(x1, y1);
    const nodesOf = r => r.horiz ? [[nearIdx(C.xs, r.x, -1), r.idx], [nearIdx(C.xs, r.x, 1), r.idx]] : [[r.idx, nearIdx(C.ys, r.y, -1)], [r.idx, nearIdx(C.ys, r.y, 1)]];
    function nearIdx(arr, v, dir) { let k = 0; while (k < arr.length - 1 && arr[k + 1] <= v) k++; return dir > 0 ? Math.min(arr.length - 1, arr[k] < v ? k + 1 : k) : k; }
    const key = (i, j) => i * 64 + j, prev = new Map(), q = [];
    for (const [i, j] of nodesOf(s)) { const k = key(i, j); if (!prev.has(k)) { prev.set(k, null); q.push([i, j]); } }
    const goals = new Set(nodesOf(e).map(([i, j]) => key(i, j)));
    let end = null;
    while (q.length) {
      const [i, j] = q.shift();
      if (goals.has(key(i, j))) { end = [i, j]; break; }
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= NX || b >= NY) continue;
        const k = key(a, b); if (prev.has(k)) continue; prev.set(k, [i, j]); q.push([a, b]);
      }
    }
    const pts = [];
    for (let n = end; n; n = prev.get(key(n[0], n[1]))) pts.unshift({ x: C.xs[n[0]], y: C.ys[n[1]] });
    pts.unshift({ x: s.x, y: s.y }); pts.push({ x: e.x, y: e.y }, { x: x1, y: y1 });
    // drop a first node that lies behind the start
    return pts;
  };
  // A random point on a sidewalk between rMin and rMax from (x, y): {x, y, block}.
  X.randomSidewalkPoint = function (x, y, rMin, rMax) {
    const C = X.city;
    for (let tries = 0; tries < 40; tries++) {
      const a = Math.random() * TAU, r = rand(rMin, rMax), px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      const b = X.blockAt(px, py); if (!b) continue;
      const side = Math.floor(Math.random() * 4), inset = rand(0.8, 3.6);
      let qx = px, qy = py;
      if (side === 0) qy = b.y0 + inset; else if (side === 1) qy = b.y1 - inset; else if (side === 2) qx = b.x0 + inset; else qx = b.x1 - inset;
      qx = cl(qx, b.x0 + 0.8, b.x1 - 0.8); qy = cl(qy, b.y0 + 0.8, b.y1 - 0.8);
      if (X.blocked(qx, qy, 0.5)) continue;
      return { x: qx, y: qy, block: b };
    }
    return null;
  };

  // ================= places & districts =================
  const DISTRICTS = ['Bussby', 'Fjordheim', 'Parkingdal', 'Neon Mile', 'Old Pier', 'Tesla Flats', 'Smog Hill', 'Bank Row', 'Tolltown'];
  X.districtAt = function (x, y) {
    const C = X.city; if (!C) return '';
    const i = cl(Math.floor(x / C.W * 3), 0, 2), j = cl(Math.floor(y / C.H * 3), 0, 2);
    return X.districtNames[j * 3 + i];
  };
  const PLACE_DEFS = [
    { id: 'hideout', name: "Artur's Garage", color: '#4a3f5c' },
    { id: 'bank', name: 'Fjord Savings Bank', color: '#b39b55', big: true },
    { id: 'police', name: 'Police Station', color: '#2c4f8a' },
    { id: 'hospital', name: 'St. Bussby Hospital', color: '#d9dde2' },
    { id: 'gunshop', name: 'Ammu-Fjord', color: '#6b3b2a' },
    { id: 'spray', name: "Pay 'n' Spray", color: '#2f7d6d', pad: true },
    { id: 'crusher', name: 'Crusher & Export', color: '#5a5048', pad: true },
    { id: 'bar', name: 'The Rusty Pillar', color: '#7a2a4a' },
    { id: 'apartment', name: 'Safehouse Apartments', color: '#5d6d7e' },
  ];
  // A door for a building: the midpoint of a side that faces the sidewalk, nudged onto the pavement.
  X.buildingDoor = function (b, prefer) {
    const blk = X.blockAt((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2); if (!blk) return null;
    const sides = [];
    if (b.y0 - blk.y0 < 7) sides.push({ x: (b.x0 + b.x1) / 2, y: b.y0, nx: 0, ny: -1 });
    if (blk.y1 - b.y1 < 7) sides.push({ x: (b.x0 + b.x1) / 2, y: b.y1, nx: 0, ny: 1 });
    if (b.x0 - blk.x0 < 7) sides.push({ x: b.x0, y: (b.y0 + b.y1) / 2, nx: -1, ny: 0 });
    if (blk.x1 - b.x1 < 7) sides.push({ x: b.x1, y: (b.y0 + b.y1) / 2, nx: 1, ny: 0 });
    if (!sides.length) return null;
    const s = sides[(prefer || 0) % sides.length];
    return { x: s.x + s.nx * 0.9, y: s.y + s.ny * 0.9, nx: s.nx, ny: s.ny };
  };
  function makePlaces(R) {
    const C = X.city, out = {};
    const cands = [];
    for (const b of C.buildings) {
      if (b.deco) continue;
      const w = b.x1 - b.x0, d = b.y1 - b.y0; if (w < 12 || d < 12) continue;
      const blk = X.blockAt((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2); if (!blk) continue;
      const sides = [];
      if (b.y0 - blk.y0 < 7) sides.push({ x: (b.x0 + b.x1) / 2, y: b.y0, nx: 0, ny: -1 });
      if (blk.y1 - b.y1 < 7) sides.push({ x: (b.x0 + b.x1) / 2, y: b.y1, nx: 0, ny: 1 });
      if (b.x0 - blk.x0 < 7) sides.push({ x: b.x0, y: (b.y0 + b.y1) / 2, nx: -1, ny: 0 });
      if (blk.x1 - b.x1 < 7) sides.push({ x: b.x1, y: (b.y0 + b.y1) / 2, nx: 1, ny: 0 });
      if (!sides.length) continue;
      cands.push({ b, side: sides[Math.floor(R() * sides.length)], area: w * d, dc: Math.hypot((b.x0 + b.x1) / 2 - C.W / 2, (b.y0 + b.y1) / 2 - C.H / 2) });
    }
    const used = [];
    for (const pd of PLACE_DEFS) {
      let list = cands.filter(c => !c.b.place && used.every(u => Math.hypot(u.b.x0 - c.b.x0, u.b.y0 - c.b.y0) > 230));
      if (!list.length) list = cands.filter(c => !c.b.place);
      if (pd.big) list.sort((a, b) => (a.dc - b.dc) * 0.002 - (a.area - b.area) * 0.0006);
      else list.sort(() => R() - 0.5);
      const c = list[0]; if (!c) continue;
      c.b.place = pd.id; c.b.color = pd.color; used.push(c);
      const s = c.side;
      const door = { x: s.x + s.nx * 0.9, y: s.y + s.ny * 0.9, nx: s.nx, ny: s.ny };
      const pl = { id: pd.id, name: pd.name, b: c.b, door, color: pd.color };
      if (pd.pad) {   // a drive-on pad on the sidewalk in front of the building, long side along the kerb
        const along = s.nx === 0;
        pl.pad = { x: s.x + s.nx * 3.6, y: s.y + s.ny * 3.6, w: along ? 7 : 4.6, h: along ? 4.6 : 7 };
      }
      out[pd.id] = pl;
    }
    return out;
  }

  // ================= input =================
  const keys = new Set(), pressedSet = new Set();
  const mouse = X.mouse = { sx: 0, sy: 0, wx: 0, wy: 0, dx: 0, dy: 0, down: false, pressed: false, t: -1e9 };
  const GAME_KEYS = new Set(['Space', 'Tab', 'KeyF', 'KeyQ', 'KeyE', 'KeyH', 'KeyC', 'KeyG', 'KeyJ', 'KeyX', 'KeyV', 'KeyB', 'KeyN', 'KeyZ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'Enter', 'AltLeft']);
  const playing = () => X.active && G().status === 'play';
  window.addEventListener('keydown', e => {
    if (!X.active) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    keys.add(e.code); if (!e.repeat) pressedSet.add(e.code);
    if (playing() && (GAME_KEYS.has(e.code) || /^Digit/.test(e.code))) e.preventDefault();
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); mouse.down = false; mouse.rdown = false; });
  let canvasHooked = false;
  function hookCanvas() {
    if (canvasHooked) return; canvasHooked = true;
    const cv = document.getElementById('game');
    const pos = e => { const r = cv.getBoundingClientRect(); mouse.sx = e.clientX - r.left; mouse.sy = e.clientY - r.top; };
    cv.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      // relative motion steers in a car; some browsers (and synthetic events) report no movementX, so fall back to the position change
      let mx = e.movementX || 0, my = e.movementY || 0;
      if (!mx && !my && mouse.lx != null) { mx = e.clientX - mouse.lx; my = e.clientY - mouse.ly; }
      mouse.lx = e.clientX; mouse.ly = e.clientY;
      // browsers send a bogus jump when the cursor is hidden or the pointer lock engages: drop those
      if (performance.now() < (mouse.quietUntil || 0) || Math.abs(mx) > 160 || Math.abs(my) > 160) mx = my = 0;
      pos(e); mouse.t = performance.now(); mouse.dx += mx; mouse.dy += my;
    });
    cv.addEventListener('pointerdown', e => {
      if (!X.active || e.pointerType !== 'mouse') return;
      pos(e); mouse.t = performance.now();
      if (e.button === 0) { mouse.down = true; mouse.pressed = true; }
      if (e.button === 2) { mouse.rdown = true; if (P.car && P.state === 'play') { startMouseSteer(P.car); lockPointer(); } }
      e.preventDefault();
    });
    // pointerdown/up fire only for the first button pressed and the last released: a chorded press or release (shooting while
    // holding RMB to steer) arrives as a pointermove whose button is not -1
    cv.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse' || e.button < 0 || !X.active) return;
      const l = (e.buttons & 1) !== 0, r = (e.buttons & 2) !== 0;
      if (l && !mouse.down) mouse.pressed = true;
      mouse.down = l;
      if (r && !mouse.rdown && P.car && P.state === 'play') { startMouseSteer(P.car); lockPointer(); }
      mouse.rdown = r;
    });
    window.addEventListener('pointerup', e => { if (e.button === 0) mouse.down = false; if (e.button === 2) mouse.rdown = false; });
    document.addEventListener('pointerlockchange', () => { mouse.quietUntil = performance.now() + 150; mouse.dx = mouse.dy = 0; });
    cv.addEventListener('contextmenu', e => { if (X.active) e.preventDefault(); });
    // Wheel zooms the view: each notch scales the framing by ~10%, clamped so the car stays readable and the city stays in reach.
    cv.addEventListener('wheel', e => {
      if (!X.active) return;
      e.preventDefault();
      if ((PG.settings || {}).wheel === 'weapon') return;   // weapons.js switches weapons instead
      X.cam.zoom = cl(X.cam.zoom * Math.exp(e.deltaY * 0.0015), 0.45, 2.2);
    }, { passive: false });
  }
  // Touch controls (HUD module) write here: move {x, y} in -1..1 screen space, fire, plus one-shot presses.
  X.touch = { move: null, fire: false, aim: null, presses: new Set() };
  X.input = {
    down: c => keys.has(c),
    pressed: c => pressedSet.has(c) || X.touch.presses.has(c),
    any: (...cs) => cs.some(c => keys.has(c)),
    anyPressed: (...cs) => cs.some(c => pressedSet.has(c) || X.touch.presses.has(c)),
    mouseActive: () => performance.now() - mouse.t < 2500,
    fireDown: () => mouse.down || keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyJ') || X.touch.fire || (!X.player.car && keys.has('Space')),
    firePressed: () => mouse.pressed || pressedSet.has('ControlLeft') || pressedSet.has('ControlRight') || pressedSet.has('KeyJ') || (!X.player.car && pressedSet.has('Space')),
    clear() { keys.clear(); pressedSet.clear(); mouse.down = false; mouse.pressed = false; },
  };
  function endFrameInput() { pressedSet.clear(); mouse.pressed = false; X.touch.presses.clear(); }

  // ================= state =================
  const P = X.player = { ped: null, car: null, money: 0, wanted: 0, state: 'play', stateT: 0, inv: { fists: Infinity }, weapon: 'fists', entering: null, kills: 0, seatT: 0 };
  X.cars = []; X.peds = []; X.lights = []; X.blips = []; X.floats = []; X.interactions = [];
  // yaw: the view's heading (-PI/2 = north up). mode 'follow' turns it to the car while driving; lift: screen height of the focus (0..1), eased too.
  X.cam = { x: 0, y: 0, span: 30, yaw: -Math.PI / 2, mode: 'follow', lift: 0.5, zoom: 1 };
  X.scene = null;    // null = the city; an interior scene object while inside (see interiors.js)
  X.playerPos = () => P.car ? { x: P.car.x, y: P.car.y } : { x: P.ped.x, y: P.ped.y };
  X.playerVel = () => P.car ? X.carVel(P.car) : { x: P.ped.vx, y: P.ped.vy };
  X.byPlayer = by => !!by && (by === P.ped || (P.car && by === P.car) || by.owner === P.ped || by.isPlayer === true);
  // Where the city simulation centres itself (the street outside while the player is indoors).
  X.focus = () => X.scene && X.scene.cityPos ? X.scene.cityPos : X.playerPos();

  // ================= services (modules may replace these) =================
  X.damagePed = function (p, amount, by, kind) {
    if (!p || p.dead || p.removed || amount <= 0) return;
    if (p.isPlayer && P.state !== 'play') return;
    if (p.armor > 0 && kind !== 'fire' && kind !== 'drown') { const a = Math.min(p.armor, amount * 0.7); p.armor -= a; amount -= a; }
    p.hp -= amount; p.hurtT = 0.25; p.lastBy = by; p.lastKind = kind;
    X.emit('pedHurt', { ped: p, amount, by, kind });
    if (p.isPlayer) G().shake = Math.max(G().shake, Math.min(0.35, amount / 120));
    if (p.hp <= 0) X.killPed(p, by, kind);
  };
  X.killPed = function (p, by, kind) {
    if (p.dead) return;
    p.dead = true; p.hp = 0; p.deadT = 0; p.onFire = Math.min(p.onFire, 1.5);
    if (p.car) {
      const c = p.car;
      if (c.driver === p) c.driver = null;
      p.car = null; p.hidden = false; p.x = c.x; p.y = c.y;
      if (p.isPlayer) P.car = null;
    }
    X.emit('pedKilled', { ped: p, by, kind });
    if (X.byPlayer(by) && !p.isPlayer) { P.kills++; X.crime(p.team === 'cop' ? 'killCop' : 'killPed', p.x, p.y, { ped: p, kind }); }
    if (p.isPlayer) X.wasted(kind);
  };
  X.damageCar = function (c, amount, by, kind) {
    if (!c || c.wrecked || c.removed || amount <= 0) return;
    c.hp -= amount; c.lastBy = by; c.hurtT = 0.2;
    X.emit('carHurt', { car: c, amount, by, kind });
    if (c.hp <= 0) X.destroyCar(c, by, kind);
  };
  X.destroyCar = function (c, by, kind) {
    if (c.wrecked) return;
    c.wrecked = true; c.hp = 0; c.siren = false; c.ai = null;
    toPhys(c);
    X.emit('carDestroyed', { car: c, by, kind });
    if (X.byPlayer(by)) X.crime('destroyCar', c.x, c.y, { car: c });
    X.explode(c.x, c.y, { by, power: 1, source: c });
    for (const o of X.occupants(c)) X.damagePed(o, 200, by, 'explosion');
    c.npcDriver = null;
  };
  X.explode = function (x, y, o) {
    o = o || {};
    const R = 6 * (o.power || 1);
    PG.burst(x, y, 'fire', 30, 6, 0.9, 0.8); PG.burst(x, y, 'smoke', 24, 2.5, 2.2, 0.7); PG.burst(x, y, 'spark', 40, 14, 0.6, 0.1);
    PG.audio.boom(); G().shake = Math.max(G().shake, 0.6);
    for (const p of X.peds) { const d = Math.hypot(p.x - x, p.y - y); if (d < R && !p.car && !p.hidden) X.damagePed(p, 140 * (1 - d / R), o.by, 'explosion'); }
    for (const c of X.cars) { if (c === o.source) continue; const d = Math.hypot(c.x - x, c.y - y); if (d < R) X.damageCar(c, 500 * (1 - d / R), o.by, 'explosion'); }
    X.emit('explosion', { x, y, power: o.power || 1, by: o.by, source: o.source });
  };
  X.crime = function (type, x, y, o) { return X.emit('crime', Object.assign({ type, x, y, by: P.ped }, o)); };
  X.fireWeapon = function () { return false; };            // weapons.js
  X.addLight = function (x, y, radius, color, intensity, o) { X.lights.push(Object.assign({ x, y, r: radius, color: color || '#ffd9a0', i: intensity == null ? 1 : intensity }, o)); };
  // Ground decals (blood, scorch, oil...): a ring buffer drawn by core under everything that moves.
  // kind: 'blood' | 'scorch' | 'oil' | 'paint' | 'glass'; size in metres.
  X.decals = [];
  X.decal = function (x, y, kind, size, o) {
    X.decals.push(Object.assign({ x, y, kind, size: size || 1, rot: Math.random() * TAU, t: X.time, seed: Math.random() }, o));
    const cap = PG.DECAL_CAP[(PG.settings || {}).decals] || 400;
    if (X.decals.length > cap) X.decals.splice(0, X.decals.length - cap);
  };
  // Objective marker for this frame: pulsing ring on the ground, an arrow at the screen edge when it is
  // off-screen, and a map blip. o: {color, label, radius}.
  X.objectives = [];
  X.objective = function (x, y, o) { X.objectives.push(Object.assign({ x, y, color: '#ffd23a', radius: 2.2 }, o)); X.blip(x, y, (o && o.color) || '#ffd23a', { edge: true, size: 5, ring: true }); };
  // Carried loot: lost when wasted or busted, banked at a safehouse door (hideout or apartment).
  X.addLoot = function (n, x, y) { P.loot = (P.loot || 0) + Math.round(n); if (x != null) X.floatText(x, y, '+$' + Math.round(n) + ' loot', '#ffd23a'); X.emit('loot', { amount: n }); };
  // Rules lane traffic obeys (traffic lights etc.): fn(car) returns a speed limit in m/s or null.
  X.trafficRules = [];
  X.blip = function (x, y, color, o) { X.blips.push(Object.assign({ x, y, color: color || '#fff' }, o)); };
  X.floatText = function (x, y, text, color, o) { X.floats.push(Object.assign({ x, y, text, color: color || '#ffd23a', t: 0, life: 1.6 }, o)); };
  X.money = function (delta, reason, x, y) {
    delta = Math.round(delta);
    P.money = Math.max(0, P.money + delta);
    X.save.money = P.money; X.persist();
    if (x != null && delta) X.floatText(x, y, (delta > 0 ? '+$' : '-$') + Math.abs(delta), delta > 0 ? '#7dff9a' : '#ff6b5a');
    X.emit('money', { delta, reason });
  };
  // Every person inside a car, materialised as peds (npc drivers become real peds here).
  X.occupants = function (c) {
    const out = [];
    if (c.driver) out.push(c.driver);
    const e = P.entering;   // half way through the door (getting in or out) counts as inside
    if (e && e.car === c && e.ped && e.ped.seqHidden && e.ped !== c.driver) out.push(e.ped);
    return out;
  };
  // Pull the NPC driver (and any extra occupants) out at the driver's door: returns the new peds.
  X.ejectOccupants = function (c, reason) {
    const out = [];
    const n = c.npcDriver ? 1 + (c.npcDriver.extra || 0) : 0;
    for (let k = 0; k < n; k++) {
      const spot = doorSpot(c, k % 2 === 0 ? -1 : 1) || { x: c.x, y: c.y };
      const p = X.makePed({ x: spot.x, y: spot.y, th: c.th + (k % 2 ? 1 : -1) * Math.PI / 2, look: k === 0 ? c.npcDriver.look : X.randomLook(), team: c.npcDriver.team || 'civ', fromCar: c });
      out.push(p);
      X.emit('pedEjected', { ped: p, car: c, reason });
    }
    c.npcDriver = null;
    if (c.driver && !c.driver.isPlayer) {
      const d = c.driver, spot = doorSpot(c, -1) || { x: c.x, y: c.y };
      d.car = null; d.hidden = false; d.x = spot.x; d.y = spot.y; c.driver = null; out.push(d);
      X.emit('pedEjected', { ped: d, car: c, reason });
    }
    if (c.ctrl === 'path') toPhys(c);
    return out;
  };
  // Car-local (x forward, y right, from the body centre) to world.
  const carWorld = (c, l) => { const cs = Math.cos(c.th), sn = Math.sin(c.th); return { x: c.x + cs * l.x - sn * l.y, y: c.y + sn * l.x + cs * l.y }; };
  const spotFree = (c, q, r) => !X.blocked(q.x, q.y, r) && !X.cars.some(o => o !== c && !o.removed && Math.abs(o.x - q.x) < o.len / 2 + 1 && Math.abs(o.y - q.y) < o.len / 2 + 1 && circlePoly(q.x, q.y, r, X.carPoly(o)));
  // Where whoever sits on `side` (-1 driver, 1 front passenger) steps out: beside their own door (doors.js
  // knows where every door is), else the other side, else behind or in front of the car.
  function doorSpot(c, side) {
    const fx = Math.cos(c.th), fy = Math.sin(c.th), lx = fy * side * -1, ly = -fx * side * -1;
    const ds = X.doors && X.doors.exitSpot, a = ds && ds(c, side), b = ds && ds(c, -side);
    const cands = [
      a ? carWorld(c, a) : { x: c.x + lx * (c.wid / 2 + 0.6) + fx * 0.4, y: c.y + ly * (c.wid / 2 + 0.6) + fy * 0.4 },
      b ? carWorld(c, b) : { x: c.x - lx * (c.wid / 2 + 0.6) + fx * 0.4, y: c.y - ly * (c.wid / 2 + 0.6) + fy * 0.4 },
      { x: c.x - fx * (c.len / 2 + 0.7), y: c.y - fy * (c.len / 2 + 0.7) },
      { x: c.x + fx * (c.len / 2 + 0.7), y: c.y + fy * (c.len / 2 + 0.7) },
    ];
    for (const q of cands) if (spotFree(c, q, 0.35)) return q;
    return null;
  }
  X.doorSpot = doorSpot;

  // ================= vehicles =================
  X.makeCar = function (modelId, x, y, th, o) {
    const m = X.MODELS[modelId] ? X.MODELS[modelId] : X.MODELS.hatch, def = X.modelDef(X.MODELS[modelId] ? modelId : 'hatch');
    const c = Object.assign({
      id: ++X.uid, kind: 'car', model: m, def, len: def.len, wid: def.wid, color: m.colors ? pick(m.colors) : m.color,
      x, y, th, v: 0, speed: 0, ctrl: 'parked', dv: null, driver: null, npcDriver: null, hp: m.hp, maxHp: m.hp, wrecked: false,
      burning: 0, siren: false, lightsOn: true, braking: false, reversing: false, keep: false, owner: null, ai: null,
      cruise: 11, removed: false, ctl: null, hurtT: 0, stuckT: 0, horn: 0,
    }, o || {});
    X.cars.push(c);
    if (c.ctrl === 'phys') { c.ctrl = 'parked'; toPhys(c); }
    return c;
  };
  X.removeCar = c => { c.removed = true; if (P.car === c) P.car = null; };
  function toPhys(c) {
    if (c.ctrl === 'phys' && c.dv) return;
    const def = c.def, mid = carMid(def);
    const dv = PG.createDriftVehicle(def, c.x - Math.cos(c.th) * mid, c.y - Math.sin(c.th) * mid, c.th);
    const sp = c.ctrl === 'path' ? c.v : 0;
    dv.vx = Math.cos(c.th) * sp; dv.vy = Math.sin(c.th) * sp; dv.v = sp; dv.speed = sp;
    c.dv = dv; c.ctrl = 'phys'; c.rejoinT = 0;
  }
  X.toPhys = toPhys;
  function syncPose(c) {
    const dv = c.dv, mid = carMid(c.def);
    c.th = dv.th; c.x = dv.x + Math.cos(dv.th) * mid; c.y = dv.y + Math.sin(dv.th) * mid;
    c.v = dv.v; c.speed = dv.speed;
    c.braking = dv.brk > 0 || !!(c.ctl && c.ctl.hand) || (!c.driver && !c.npcDriver && c.speed > 0.5 && !c.wrecked);
    c.reversing = dv.gear < 0 && dv.v < -0.3;
  }
  // Move a car somewhere (teleport), keeping physics consistent.
  X.placeCar = function (c, x, y, th) {
    c.x = x; c.y = y; c.th = th;
    if (c.dv) { const mid = carMid(c.def); c.dv.x = x - Math.cos(th) * mid; c.dv.y = y - Math.sin(th) * mid; c.dv.th = th; c.dv.vx = c.dv.vy = c.dv.r = 0; }
  };

  // Pure-pursuit steering for an AI-driven physics car. o: {speed (m/s), brakeDist, reverseOk}
  X.steerCtl = function (c, tx, ty, o) {
    o = o || {};
    const dv = c.dv; if (!dv) return {};
    const a = Math.atan2(ty - c.y, tx - c.x), err = wrap(a - c.th), dist = Math.hypot(tx - c.x, ty - c.y);
    const want = o.speed == null ? 14 : o.speed;
    const ctl = { steerAbs: cl(err * 1.6, -1, 1), fwd: 0, rev: 0, hand: false, thrMax: 1 };
    // stuck: pushing but not moving -> back up while steering the other way
    if (c.backT > 0) { c.backT -= o.dt || 1 / 60; ctl.rev = 1; ctl.steerAbs = -ctl.steerAbs; return ctl; }
    if (Math.abs(dv.speed) < 0.6 && (dist > 4)) { c.stuckT = (c.stuckT || 0) + (o.dt || 1 / 60); if (c.stuckT > 1.4) { c.backT = 1.1; c.stuckT = 0; } } else c.stuckT = 0;
    const corner = Math.abs(err), limit = corner > 1.2 ? Math.min(want, 7) : corner > 0.6 ? Math.min(want, 12) : want;
    if (Math.abs(err) > 2.3 && dist < 20 && o.reverseOk) { ctl.rev = 1; ctl.steerAbs = -ctl.steerAbs; return ctl; }
    if (dv.speed < limit - 0.5) ctl.fwd = 1;
    else if (dv.speed > limit + 2) ctl.rev = 1;
    if (o.brakeDist && dist < o.brakeDist && dv.speed > 4) { ctl.fwd = 0; ctl.rev = 1; }
    if (corner > 1.0 && dv.speed > 14 && o.handbrake) ctl.hand = true;
    return ctl;
  };
  // Lane a position sits in: {i, j, d, frac, k, px, py, th} for PG.cityTraffic.place, or null off-road.
  X.laneAt = function (x, y, th) {
    const C = X.city, r = X.roadAt(x, y); if (!r) return null;
    let road = r.junction ? (Math.abs(Math.cos(th)) > Math.abs(Math.sin(th)) ? r.h : r.v) : r;
    const T = PG.cityTraffic;
    if (road.horiz) {
      const d = Math.cos(th) >= 0 ? 0 : 2, j = road.idx;
      let i;
      if (d === 0) { i = 0; while (i < C.xs.length - 2 && C.xs[i + 1] <= x) i++; }
      else { i = C.xs.length - 1; while (i > 1 && C.xs[i - 1] >= x) i--; }
      const i2 = i + T.DX[d];
      if (i2 < 0 || i2 >= C.xs.length) return null;
      const frac = cl((x - C.xs[i]) / (C.xs[i2] - C.xs[i]), 0, 0.95);
      return { i, j, d, frac };
    }
    const d = Math.sin(th) >= 0 ? 1 : 3, i = road.idx;
    let j;
    if (d === 1) { j = 0; while (j < C.ys.length - 2 && C.ys[j + 1] <= y) j++; }
    else { j = C.ys.length - 1; while (j > 1 && C.ys[j - 1] >= y) j--; }
    const j2 = j + T.DY[d];
    if (j2 < 0 || j2 >= C.ys.length) return null;
    const frac = cl((y - C.ys[j]) / (C.ys[j2] - C.ys[j]), 0, 0.95);
    return { i, j, d, frac };
  };
  // Back into lane traffic: put a physics car onto the lane it is driving along.
  X.toPath = function (c) {
    const ln = X.laneAt(c.x, c.y, c.th); if (!ln) return false;
    const save = { x: c.x, y: c.y, th: c.th };
    PG.cityTraffic.place(X.city, c, ln.i, ln.j, ln.d, ln.frac);
    if (Math.hypot(c.x - save.x, c.y - save.y) > 6 || Math.abs(wrap(c.th - save.th)) > 0.6) { Object.assign(c, save); return false; }
    c.ctrl = 'path'; c.dv = null; c.v = Math.max(2, c.speed * 0.8); c.mode = 'drive';
    return true;
  };
  // NPC behind the wheel after a bump: drive back towards the lane and merge in.
  function rejoinCtl(c, dt) {
    c.rejoinT = (c.rejoinT || 0) + dt;
    const ln = X.laneAt(c.x, c.y, c.th);
    if (c.rejoinT > 1.6 && ln && c.speed < 9) {
      if (X.toPath(c)) return null;
    }
    if (c.rejoinT < 1.2) return { rev: c.speed > 0.5 ? 1 : 0 };   // stop, gather yourself
    const rp = X.nearestRoadPoint(c.x + Math.cos(c.th) * 10, c.y + Math.sin(c.th) * 10);
    return X.steerCtl(c, rp.x, rp.y, { speed: 6, dt });
  }

  // Steering. A/D and the arrows steer and always win. Holding the right mouse button switches on mouse fine steering: the OS cursor
  // hides (pointer lock where the browser allows it) and the mouse moves a marker round the car at a fixed screen distance. The
  // marker holds a direction in the WORLD (P.aim, radians), not on the screen: as the follow camera turns, the marker turns with the
  // world, so the car steers towards it and settles once it points that way. Without the right button (or while a key steers) the
  // marker rides on the car's nose, unseen, so pressing the button starts from straight ahead and letting go of a key holds the
  // new heading; the cursor is back and aims drive-bys.
  const AIM_R = 400, MOUSE_SENS = 0.4, AIM_LEAD = 0.4;
  const mouseUsed = () => mouse.t > 0;
  const mouseSteering = () => !!mouse.rdown && mouseUsed();
  function startMouseSteer(c) { P.aimCar = c; P.aim = c.th; mouse.dx = mouse.dy = 0; mouse.quietUntil = performance.now() + 150; }
  const keySteer = () => (X.input.any('KeyD', 'ArrowRight') ? 1 : 0) - (X.input.any('KeyA', 'ArrowLeft') ? 1 : 0);
  function mouseSteer(c) {
    if (P.aimCar !== c) { P.aimCar = c; P.aim = c.th; }
    // aim with the heading the car will have AIM_LEAD s from now: counter-steers early, no overshoot
    let err = wrap(P.aim - c.th) - (c.dv ? c.dv.r : 0) * AIM_LEAD;
    if (c.dv && c.dv.v < -1) err = -err;                     // reversing: opposite lock turns the nose the same way
    return (c.mouseSteer = cl(err / (c.def.maxSteer * 0.85), -1, 1));
  }
  // Called from X.view with the frame's view: turns mouse motion into a new world direction for the marker.
  function updateAim(view) {
    const c = P.car;
    if (!c || P.state !== 'play' || X.scene) { mouse.dx = mouse.dy = 0; return; }
    if (P.aimCar !== c) { P.aimCar = c; P.aim = c.th; }
    const r = aimRadius(c, view);
    if (keySteer() || !mouseSteering()) { P.aim = c.th + (c.dv ? c.dv.r : 0) * AIM_LEAD; mouse.dx = mouse.dy = 0; return; }   // the marker rides on the nose
    else if (mouse.dx || mouse.dy) {
      const a = P.aim + view.rot;   // world direction -> screen direction
      P.aim = Math.atan2(Math.sin(a) * r + mouse.dy * MOUSE_SENS, Math.cos(a) * r + mouse.dx * MOUSE_SENS) - view.rot;
      mouse.dx = mouse.dy = 0;
    }
    // while mouse-steering, anything aiming with the mouse (drive-bys) aims at the marker
    mouse.wx = c.x + Math.cos(P.aim) * r / view.scale; mouse.wy = c.y + Math.sin(P.aim) * r / view.scale;
  }
  // AIM_R, cut down only when the window is too small to show the whole circle round the car
  const aimRadius = (c, view) => {
    const room = Math.min(view.ax, view.cw - view.ax, view.ay, view.ch - (view.bottomPad || 0) - view.ay) - 24;
    return Math.max(Math.min(AIM_R, room), c.len / 2 * view.scale + 70);
  };
  function lockPointer() {
    const cv = document.getElementById('game');
    if (!cv || document.pointerLockElement === cv || !cv.requestPointerLock) return;
    try { const r = cv.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* not allowed here: the hidden cursor still steers */ }
  }
  // Cursor hidden and pointer locked only while mouse-steering in play; released everywhere else (menus need the cursor).
  function syncCursor() {
    const cv = document.getElementById('game'); if (!cv) return;
    const driving = X.active && !!P.car && P.state === 'play' && G().status === 'play' && mouseSteering();
    const want = driving ? 'none' : '';
    if (cv.style.cursor !== want) cv.style.cursor = want;
    if (!driving && document.pointerLockElement === cv && document.exitPointerLock) document.exitPointerLock();
  }
  X.steerTarget = c => mouseSteer(c);
  function playerCarCtl(c) {
    const T = X.touch, k = X.input;
    let fwd = k.any('KeyW', 'ArrowUp'), rev = k.any('KeyS', 'ArrowDown'), boost = k.any('ShiftLeft', 'ShiftRight');
    let steer = keySteer(), steerAbs = null;
    if (steer || !mouseSteering()) c.mouseSteer = 0; else steerAbs = mouseSteer(c);   // keys first, then the mouse while RMB is held
    if (T.move) { if (T.move.y < -0.3) fwd = true; if (T.move.y > 0.3) rev = true; steerAbs = cl(T.move.x * 1.3, -1, 1); boost = boost || T.move.y < -0.85; }
    const ctl = { fwd: fwd || boost ? 1 : 0, rev: rev ? 1 : 0, hand: k.down('Space') || !!T.hand, steerDir: steer, steerAbs, thrMax: boost ? 1 : 0.78 };
    if (P.state !== 'play') { ctl.fwd = 0; ctl.rev = 0; ctl.hand = true; ctl.steerDir = 0; ctl.steerAbs = null; }
    return ctl;
  }
  function carControl(c, dt) {
    if (c.wrecked) return {};
    if (c.driver && c.driver.isPlayer) return playerCarCtl(c);
    if (c.ai && c.ai.drive) { const r = safe(c.ai, 'drive', c.ai.drive, [c, dt]); if (r) return r; }
    if (c.npcDriver || c.driver) { const r = rejoinCtl(c, dt); if (r) return r; return {}; }
    return {};
  }
  function collideCarStatic(c) {
    const v = c.dv, d = v.dyn, p = PG.vehPolys(v)[0], cg = PG.cgOf(v);
    for (const o of PG.cityNear(X.city, cg.x, cg.y, c.len / 2 + 2)) {
      const m = PG.mtv(p, o.poly); if (!m) continue;
      const at = contactPoint(p, o.poly), rx = at.x - cg.x, ry = at.y - cg.y;
      const vcx = v.vx - v.r * ry, vcy = v.vy + v.r * rx, vn = vcx * m.x + vcy * m.y;
      v.x += m.x * (m.depth + 0.003); v.y += m.y * (m.depth + 0.003);
      if (vn < 0) {
        const rn = rx * m.y - ry * m.x, k = 1 / d.mTot + rn * rn / d.Iz, j = -1.25 * vn / k;
        v.vx += j * m.x / d.mTot; v.vy += j * m.y / d.mTot; v.r += rn * j / d.Iz;
        const tx = -m.y, ty = m.x, vt = vcx * tx + vcy * ty, rt = rx * ty - ry * tx, kt = 1 / d.mTot + rt * rt / d.Iz;
        const jt = Math.max(-0.35 * j, Math.min(0.35 * j, -vt / kt));
        v.vx += jt * tx / d.mTot; v.vy += jt * ty / d.mTot; v.r += rt * jt / d.Iz;
        impact(c, null, -vn, at, o);
      }
    }
  }
  function contactPoint(p, q) {
    let best = null, bd = Infinity;
    for (const a of p) for (const b of q) { const dd = (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y); if (dd < bd) { bd = dd; best = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; } }
    return best;
  }
  function impact(c, other, sp, at, solid) {
    if (sp < 1.2) return;
    const now = X.time;
    if (sp > 2.5 && (c.lastImpactT == null || now - c.lastImpactT > 0.25)) {
      c.lastImpactT = now;
      const dmg = (sp - 3) * 19;
      const by = other && other.driver ? other.driver : other;
      X.damageCar(c, dmg, by, 'crash');
      PG.burst(at.x, at.y, 'spark', Math.min(30, 6 + sp * 2), 6, 0.4, 0.1);
      if (c === P.car || other === P.car) { PG.audio.scrape(); G().shake = Math.max(G().shake, Math.min(0.5, 0.08 + sp * 0.03)); if (sp > 9) PG.audio.boom(); }
      // a crash hurts whoever is inside a little
      if (c === P.car && sp > 9) X.damagePed(P.ped, (sp - 9) * 2.2, other, 'crash');
      X.emit('carImpact', { car: c, other, speed: sp, at, solid });
    }
  }
  function carCarCollisions(phys) {
    for (const a of phys) {
      if (a.removed) continue;
      const pa = PG.vehPolys(a.dv)[0], ca = PG.cgOf(a.dv);
      for (const b of X.cars) {
        if (b === a || b.removed) continue;
        if (b.ctrl === 'phys' && b.dv && b.id < a.id && phys.includes(b)) continue;
        if (Math.abs(b.x - ca.x) > (a.len + b.len) / 2 + 1 || Math.abs(b.y - ca.y) > (a.len + b.len) / 2 + 1) continue;
        const pb = X.carPoly(b), m = PG.mtv(pa, pb); if (!m) continue;
        if (b.ctrl !== 'phys') toPhys(b);
        resolveCars(a, b, m, contactPoint(pa, pb));
      }
    }
  }
  function resolveCars(a, b, m, at) {
    const va = a.dv, vb = b.dv, da = va.dyn, db = vb.dyn;
    const ca = PG.cgOf(va), cb = PG.cgOf(vb);
    const rax = at.x - ca.x, ray = at.y - ca.y, rbx = at.x - cb.x, rby = at.y - cb.y;
    const vax = va.vx - va.r * ray, vay = va.vy + va.r * rax, vbx = vb.vx - vb.r * rby, vby = vb.vy + vb.r * rbx;
    const vn = (vax - vbx) * m.x + (vay - vby) * m.y;
    const ma = da.mTot, mb = db.mTot, tot = ma + mb;
    va.x += m.x * (m.depth * mb / tot + 0.002); va.y += m.y * (m.depth * mb / tot + 0.002);
    vb.x -= m.x * (m.depth * ma / tot + 0.002); vb.y -= m.y * (m.depth * ma / tot + 0.002);
    if (vn >= 0) return;
    const ra = rax * m.y - ray * m.x, rb = rbx * m.y - rby * m.x;
    const k = 1 / ma + 1 / mb + ra * ra / da.Iz + rb * rb / db.Iz, j = -1.3 * vn / k;
    va.vx += j * m.x / ma; va.vy += j * m.y / ma; va.r += ra * j / da.Iz;
    vb.vx -= j * m.x / mb; vb.vy -= j * m.y / mb; vb.r -= rb * j / db.Iz;
    const sp = -vn;
    impact(a, b, sp * Math.min(1.6, mb / ma) , at); impact(b, a, sp * Math.min(1.6, ma / mb), at);
    if (sp > 2 && (a === P.car || b === P.car)) {
      const o = a === P.car ? b : a;
      if (o.model.kind === 'police') X.crime('hitCopCar', at.x, at.y, { car: o, speed: sp });
      else if (o.npcDriver || o.driver) X.emit('trafficRammed', { car: o, speed: sp });
    }
  }
  function stepPhysCars(dt) {
    let phys = X.cars.filter(c => c.ctrl === 'phys' && c.dv && !c.removed);
    if (!phys.length) return;
    for (const c of phys) { c.ctl = carControl(c, dt) || {}; c.driven = !!(c.driver || c.npcDriver || c.ai) && !c.wrecked; }
    phys = phys.filter(c => c.ctrl === 'phys' && c.dv);   // a car may have merged back into lane traffic
    const n = Math.max(1, Math.ceil(dt / (1 / 240) - 1e-9)), h = dt / n;
    for (let s = 0; s < n; s++) {
      for (const c of phys) {
        PG.driftStep(c.dv, c.ctl, h, { mu: (c.mu || 1) * (c.wrecked ? 0.8 : 1), assist: false });
        if (!c.driven) {   // nobody at the wheel: rolls to a stop
          const v = c.dv, sp = Math.hypot(v.vx, v.vy);
          if (sp > 0) { const dec = Math.min(sp, (c.wrecked ? 5 : 2.8) * h); v.vx -= v.vx / sp * dec; v.vy -= v.vy / sp * dec; }
          v.r *= Math.exp(-2.5 * h);
        }
      }
      for (const c of phys) collideCarStatic(c);
      carCarCollisions(phys);
    }
    for (const c of phys) syncPose(c);
  }
  // Lane traffic: kinematic, brakes for anything in its lane (cars, people, the player).
  function pathTraffic(dt) {
    const T = PG.cityTraffic, C = X.city;
    for (const a of X.cars) {
      if (a.ctrl !== 'path' || a.removed) continue;
      const fx = Math.cos(a.th), fy = Math.sin(a.th);
      let lim = a.cruise * (a.cruiseMul || 1);
      const look = 8 + a.v * 1.6;
      const check = (x, y, half, wide) => {
        const dx = x - a.x, dy = y - a.y, al = dx * fx + dy * fy;
        if (al <= 0 || al > look + half + a.len / 2) return;
        if (Math.abs(dx * fy - dy * fx) > (wide || 2.3)) return;
        lim = Math.min(lim, Math.max(0, (al - half - a.len / 2 - 2.2) * 0.8));
      };
      if (a.ghost > 0) a.ghost -= dt;
      else for (const b of X.cars) if (b !== a && !b.removed && Math.abs(b.x - a.x) < 40 && Math.abs(b.y - a.y) < 40) check(b.x, b.y, b.len / 2);
      for (const p of X.peds) if (!p.dead && !p.hidden && !p.car && Math.abs(p.x - a.x) < 25 && Math.abs(p.y - a.y) < 25) check(p.x, p.y, 0.5, 2.0);
      for (const rule of X.trafficRules) { const r = rule(a); if (r != null) lim = Math.min(lim, r); }
      const acc = a.v < lim ? 3 : 9;
      a.braking = lim < a.v - 0.3;
      a.v += Math.max(-acc * dt, Math.min(acc * dt, lim - a.v));
      a.wait = a.v < 0.3 && lim < 0.5 ? (a.wait || 0) + dt : 0;
      if (a.wait > 2.5 && !a.honked) { a.honked = true; X.emit('honk', { car: a }); if (Math.hypot(a.x - X.focus().x, a.y - X.focus().y) < 40) PG.audio.honk(cl((a.x - X.focus().x) / 20, -1, 1)); }
      if (a.wait < 0.1) a.honked = false;
      if (a.wait > 5) { a.ghost = 2; a.wait = 0; }
      T.advance(C, a, a.v * dt);
      a.speed = a.v;
    }
  }
  function carPedHits() {
    for (const c of X.cars) {
      if (c.removed) continue;
      const vel = X.carVel(c), sp = Math.hypot(vel.x, vel.y);
      let poly = null;
      for (const p of X.peds) {
        if (p.removed || p.hidden || p.car || (p.dead && p.knock <= 0)) continue;
        const R = c.len / 2 + 1;
        if (Math.abs(p.x - c.x) > R || Math.abs(p.y - c.y) > R) continue;
        poly = poly || X.carPoly(c);
        const m = circlePoly(p.x, p.y, p.r, poly); if (!m) continue;
        const rel = (vel.x - p.vx) * (-m.nx) + (vel.y - p.vy) * (-m.ny);
        if (sp > 3 && rel > 2.5 && !p.dead && p.hitCd <= 0) {
          p.vx = vel.x * 0.95 + m.nx * sp * 0.4; p.vy = vel.y * 0.95 + m.ny * sp * 0.4;
          p.knock = 0.8 + sp * 0.035; p.hitCd = 0.6; p.spin = (Math.random() - 0.5) * 18;
          p.x += m.x; p.y += m.y;
          const by = c.driver || c;
          X.emit('pedHitByCar', { ped: p, car: c, speed: sp });
          if (c === P.car && !p.isPlayer) X.crime(p.team === 'cop' ? 'hitCop' : 'hitPed', p.x, p.y, { ped: p });
          X.damagePed(p, (sp - 2) * 9, by, 'car');
          if (c.dv) { c.dv.vx *= 0.985; c.dv.vy *= 0.985; }
          if (c === P.car) G().shake = Math.max(G().shake, 0.12);
        } else { p.x += m.x; p.y += m.y; const vn = p.vx * m.nx + p.vy * m.ny; if (vn < 0) { p.vx -= vn * m.nx; p.vy -= vn * m.ny; } }
      }
    }
  }
  // Tyre marks, smoke and squeal for every physics car; engine note for the player's.
  const skidLast = new Map();
  function tyreFx(dt) {
    const S = PG.settings || {}, skids = S.skidMarks !== false, pcap = PG.PARTICLE_CAP[S.particles] || 600;
    for (const c of X.cars) {
      if (c.ctrl !== 'phys' || !c.dv || c.removed) { skidLast.delete(c.id); continue; }
      const v = c.dv, sp = v.speed;
      if (sp < 0.5 && v.spinR < 0.3) { skidLast.delete(c.id); continue; }
      const wheels = PG.wheelPoses(v);
      const rear = Math.max(v.spinR, Math.min(1, (v.slipR - 0.1) / 0.35)), front = Math.max(v.spinF, Math.min(1, (v.slipF - 0.16) / 0.4));
      const k = [front, front, rear, rear];
      let last = skidLast.get(c.id) || [];
      for (let i = 0; i < 4; i++) {
        const w = wheels[i];
        if (k[i] > 0.08 && last[i] && skids && Math.hypot(w.x - last[i].x, w.y - last[i].y) < 3) X.skid.line(last[i].x, last[i].y, w.x, w.y);
        last[i] = { x: w.x, y: w.y };
        if (i >= 2 && k[i] > 0.25 && G().particles.length < pcap && Math.random() < k[i] * dt * 26) G().particles.push({ x: w.x, y: w.y, vx: v.vx * 0.2 + rand(-1, 1), vy: v.vy * 0.2 + rand(-1, 1), life: rand(1, 2), max: 2.2, kind: 'tsmoke', size: rand(0.3, 0.5) });
      }
      skidLast.set(c.id, last);
      if (c === P.car) PG.audio.squeal(sp > 2 ? Math.min(1, Math.max(rear, front * 0.7)) * Math.min(1, 0.4 + sp / 15) : 0, 1500 + 1600 * Math.min(1, sp / 25));
    }
    const c = P.car;
    if (c && c.dv && !c.wrecked) {
      const v = c.dv, dy = v.dyn;
      PG.audio.engineDrift({ ev: dy.type === 'ev', rpm: dy.type === 'ev' ? 0 : v.rpm, cyl: dy.cyl || 4, rf: dy.type === 'ice' ? v.rpm / dy.red : dy.type === 'cvt' ? v.rpm / 5000 : 0, sf: Math.min(1, v.speed / (dy.vmax / 3.6)), load: v.thr, car: c.model.id });
      if (v.shifted !== c.shiftSeen) { c.shiftSeen = v.shifted; PG.audio.shift(); }
    }
  }

  // ================= traffic population =================
  const TRAFFIC_N = 48, PARKED_N = 24;
  function trafficModel() {
    const ids = Object.keys(X.MODELS).filter(id => X.MODELS[id].weight > 0);
    let r = Math.random() * ids.reduce((s, id) => s + X.MODELS[id].weight, 0);
    for (const id of ids) if ((r -= X.MODELS[id].weight) <= 0) return id;
    return 'hatch';
  }
  X.randomNpc = team => ({ look: X.randomLook(), team: team || 'civ', extra: Math.random() < 0.25 ? 1 : 0 });
  function carOverlaps(c) {
    const pc = X.carPoly(c);
    for (const o of X.cars) if (o !== c && !o.removed && Math.abs(o.x - c.x) < 12 && Math.abs(o.y - c.y) < 12 && PG.overlap(pc, X.carPoly(o))) return true;
    for (const p of X.peds) if (!p.dead && !p.hidden && !p.car && Math.abs(p.x - c.x) < 6 && Math.abs(p.y - c.y) < 6 && circlePoly(p.x, p.y, p.r, pc)) return true;
    return false;
  }
  X.spawnTraffic = function (x, y, rMin, rMax, modelId, o) {
    const id = modelId || trafficModel(), m = X.MODELS[id];
    const c = X.makeCar(id, -9999, -9999, 0, Object.assign({ ctrl: 'path', npcDriver: X.randomNpc() }, o));
    c.cruise = m.kind === 'bus' ? rand(7, 9) : m.kind === 'sports' ? rand(13, 17) : rand(9, 15);
    if (!PG.cityTraffic.spawnNear(X.city, c, x, y, rMin, rMax) || carOverlaps(c)) { X.removeCar(c); return null; }
    c.ctrl = 'path';
    return c;
  };
  // A parked car at the kerb, half on the sidewalk, facing the traffic on that side.
  X.spawnParked = function (x, y, rMin, rMax, modelId, o) {
    const C = X.city;
    for (let tries = 0; tries < 30; tries++) {
      const horiz = Math.random() < 0.5, side = Math.random() < 0.5 ? 1 : -1;
      let px, py, th, idx;
      if (horiz) { idx = Math.floor(Math.random() * C.ys.length); px = x + rand(-rMax, rMax); py = C.ys[idx] + side * (C.wy[idx] / 2 + 0.55); th = side > 0 ? 0 : Math.PI; if (C.xs.some((v, i) => Math.abs(px - v) < C.wx[i] / 2 + 7)) continue; }
      else { idx = Math.floor(Math.random() * C.xs.length); py = y + rand(-rMax, rMax); px = C.xs[idx] - side * (C.wx[idx] / 2 + 0.55); th = side > 0 ? Math.PI / 2 : -Math.PI / 2; if (C.ys.some((v, j) => Math.abs(py - v) < C.wy[j] / 2 + 7)) continue; }
      if (px < 10 || py < 10 || px > C.W - 10 || py > C.H - 10) continue;
      const d = Math.hypot(px - x, py - y); if (d < rMin || d > rMax) continue;
      const id = modelId || trafficModel();
      if (X.MODELS[id].kind === 'bus' && !modelId) continue;
      const c = X.makeCar(id, px, py, th, Object.assign({ ctrl: 'parked' }, o));
      const pc = X.carPoly(c);
      if (PG.cityNear(C, px, py, c.len).some(s => PG.overlap(pc, s.poly)) || carOverlaps(c) || C.lamps.some(l => Math.abs(l.x - px) < c.len / 2 + 0.5 && Math.abs(l.y - py) < c.len / 2 + 0.5)) { X.removeCar(c); continue; }
      return c;
    }
    return null;
  };
  // Keeps about TRAFFIC_N moving and PARKED_N parked cars around the focus (times the traffic setting); with
  // too many (the setting was lowered), the farthest unowned one out of sight goes, one per frame.
  function manageTraffic() {
    const f = X.focus(), mul = (PG.settings || {}).traffic || 1;
    const tN = Math.round(TRAFFIC_N * mul), pN = Math.round(PARKED_N * mul);
    let path = 0, parked = 0, farPath = null, farPark = null, dPath = 0, dPark = 0;
    for (const c of X.cars) {
      if (c.removed) continue;
      const d = Math.hypot(c.x - f.x, c.y - f.y);
      const mine = c === P.car || c.keep || c.owner;
      if (!mine && c.ctrl === 'path' && d > 440) { X.removeCar(c); continue; }
      if (!mine && c.ctrl !== 'path' && d > 470) { X.removeCar(c); continue; }
      if (c.ctrl === 'path') { path++; if (!mine && d > dPath && d > 60 && !X.inView(c.x, c.y, 10)) { dPath = d; farPath = c; } }
      else if (c.ctrl === 'parked' && d < 400) { parked++; if (!mine && d > dPark && d > 60 && !X.inView(c.x, c.y, 10)) { dPark = d; farPark = c; } }
    }
    if (path > tN + 2 && farPath) X.removeCar(farPath);
    if (parked > pN + 2 && farPark) X.removeCar(farPark);
    if (X.scene) return;
    for (let k = 0; k < 3 && path < tN; k++) if (X.spawnTraffic(f.x, f.y, X.time < 1 ? 30 : 170, X.time < 1 ? 420 : 400)) path++;
    for (let k = 0; k < 2 && parked < pN; k++) if (X.spawnParked(f.x, f.y, X.time < 1 ? 15 : 160, 380)) parked++;
  }

  // ================= the player =================
  function newPlayerPed(x, y, th) {
    if (P.entering) endSeq();
    if (P.ped) { P.ped.isPlayer = false; if (!P.ped.dead || P.ped.car) { if (P.ped.car && P.ped.car.driver === P.ped) P.ped.car.driver = null; P.ped.removed = true; } }
    P.ped = X.makePed({ x, y, th, isPlayer: true, team: 'player', look: { skin: '#e0ac7e', hair: '#1b1612', shirt: '#f2c230', pants: '#1f2a44', hat: null }, hp: 100, maxHp: 100 });
    return P.ped;
  }
  function footControl(dt) {
    const p = P.ped;
    if (p.seqHidden && !(P.entering && P.entering.ped === p)) { p.seqHidden = false; p.hidden = false; p.car = null; }   // a sequence cut short elsewhere
    if (p.dead) { X.movePed(p, dt, 0, 0); return; }
    let mx = 0, my = 0;
    const k = X.input;
    if (P.state === 'play' && !P.entering) {
      if (k.any('KeyW', 'ArrowUp')) my -= 1;
      if (k.any('KeyS', 'ArrowDown')) my += 1;
      if (k.any('KeyA', 'ArrowLeft')) mx -= 1;
      if (k.any('KeyD', 'ArrowRight')) mx += 1;
      if (X.touch.move) { mx = X.touch.move.x; my = X.touch.move.y; }
    }
    const rot = X.lastView ? X.lastView.rot : 0;
    if (rot) { const c = Math.cos(-rot), s = Math.sin(-rot); const ax = mx * c - my * s, ay = mx * s + my * c; mx = ax; my = ay; }
    let len = Math.hypot(mx, my); if (len > 1) { mx /= len; my /= len; len = 1; }
    const sprint = k.any('ShiftLeft', 'ShiftRight');
    const spd = (sprint ? 7.2 : 4.3) * (p.speedMul || 1);
    if (P.entering) { seqStep(dt); return; }   // getting in or out (below)
    X.movePed(p, dt, mx * spd, my * spd);
    if (X.input.mouseActive() && !X.touch.move) { p.th = Math.atan2(mouse.wy - p.y, mouse.wx - p.x); }
    else if (X.touch.aim != null) p.th = X.touch.aim;
    else if (len > 0.1) { const a = Math.atan2(my, mx); p.th += wrap(a - p.th) * Math.min(1, dt * 14); }
    p.aim = p.th;
    // legs follow the way you walk; p.th (the upper body) follows the aim. Legs keep their last heading when still.
    if (p.legTh == null) p.legTh = p.th;
    if (Math.hypot(p.vx, p.vy) > 0.4) p.legTh += wrap(Math.atan2(p.vy, p.vx) - p.legTh) * Math.min(1, dt * 12);
  }
  // Generic person movement with collisions: want (wx, wy) is the target velocity.
  X.movePed = function (p, dt, wx, wy) {
    if (p.knock > 0) {
      p.knock -= dt;
      const k = Math.exp(-2.6 * dt); p.vx *= k; p.vy *= k;
      if (p.spin) { p.th += p.spin * dt; p.spin *= Math.exp(-3 * dt); }
    } else if (p.dead) { const k = Math.exp(-6 * dt); p.vx *= k; p.vy *= k; }
    else { const a = 1 - Math.exp(-dt * 14); p.vx += (wx - p.vx) * a; p.vy += (wy - p.vy) * a; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    const sp = Math.hypot(p.vx, p.vy); p.speed = sp; p.walk += sp * dt * (p.isPlayer ? 0.6 : 2.4);   // player legs swing 4x slower (2.4 / 4)
    if (p.hitCd > 0) p.hitCd -= dt;
    if (p.hurtT > 0) p.hurtT -= dt;
    for (const o of PG.cityNear(X.city, p.x, p.y, p.r + 1)) {
      const m = circlePoly(p.x, p.y, p.r, o.poly); if (!m) continue;
      p.x += m.x; p.y += m.y;
      const vn = p.vx * m.nx + p.vy * m.ny;
      if (vn < 0) { if (p.knock > 0 && -vn > 7) X.damagePed(p, (-vn - 7) * 5, p.lastBy, 'impact'); p.vx -= vn * m.nx * 1.4; p.vy -= vn * m.ny * 1.4; }
    }
    if (!p.dead) for (const c of X.cars) {
      if (c.removed || Math.abs(c.x - p.x) > c.len / 2 + 1 || Math.abs(c.y - p.y) > c.len / 2 + 1) continue;
      const m = circlePoly(p.x, p.y, p.r, X.carPoly(c)); if (m) { p.x += m.x; p.y += m.y; }
    }
  };
  X.nearestEnterableCar = function (maxD) {
    const p = P.ped; let best = null, bd = maxD || 2.6;
    for (const c of X.cars) {
      if (c.removed || c.wrecked || Math.abs(c.x - p.x) > c.len || Math.abs(c.y - p.y) > c.len) continue;
      if (c.ctrl === 'path' && c.v > 6) continue;
      if (c.ctrl === 'phys' && c.speed > 6) continue;
      const m = circlePoly(p.x, p.y, 0.05, X.carPoly(c)); const d = m ? 0 : PG.polyDist(X.carPoly(c), [{ x: p.x, y: p.y }, { x: p.x + 0.01, y: p.y }, { x: p.x, y: p.y + 0.01 }]);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  };
  // ================= getting in and out =================
  // In: walk round the car to its door (X.pathAroundCar), the door swings open (doors.js answers 'doorOpen'
  // with how long that takes; without it the rest is instant), a driver is yanked out, you step in and sit,
  // the door shuts ('doorClose'). Out: P.car clears at once (the world sees you on foot), the door opens, you
  // climb out beside it and it shuts behind you, unless you sprint off or the car is still rolling.
  // P.entering = {car, ped, mode: 'enter'|'exit', phase: walk|open|jack|in|out, t, pt (s in phase), ent}.
  // ent (an entry) = {side, stand, seat, via?, door, any?}: car-local points (x forward, y right).
  const carLocal = (c, x, y) => { const cs = Math.cos(c.th), sn = Math.sin(c.th), dx = x - c.x, dy = y - c.y; return { x: dx * cs + dy * sn, y: -dx * sn + dy * cs }; };
  const plainEntry = (c, side) => ({ side, stand: { x: 0.3, y: side * (c.wid / 2 + 0.45) }, seat: { x: 0, y: -c.wid * 0.22 }, door: null });
  function entryFor(c, side) {
    if (X.doors && X.doors.entry) return X.doors.entry(c, side);
    return plainEntry(c, side);
  }
  // The driver's own door unless a wall or a car is in the way (or there is no way round to it): then the other
  // side, and climb across.
  function pickEntry(c, p, avoid) {
    const a = entryFor(c, -1), b = entryFor(c, 1);
    const free = e => !!e && spotFree(c, carWorld(c, e.stand), 0.3), reach = e => !X.pathAroundCar(p, c, carWorld(c, e.stand)).blocked;
    let order = a && b && a.any && carLocal(c, p.x, p.y).y > 0 ? [b, a] : [a, b];   // either side will do (the tank): the near one
    if (avoid && order[0] === avoid) order = [order[1], order[0]];   // stuck getting to that one: try the other
    for (const e of order) if (free(e) && reach(e)) return e;
    for (const e of order) if (free(e)) return e;
    return order[0] || order[1] || plainEntry(c, -1);
  }
  const exitEntry = c => { const a = entryFor(c, -1), b = entryFor(c, 1); return a && spotFree(c, carWorld(c, a.stand), 0.3) ? a : b && spotFree(c, carWorld(c, b.stand), 0.3) ? b : null; };
  function segBox(a, b, ex, ey) {   // does segment a-b cross the open box |x| < ex, |y| < ey?
    const dx = b.x - a.x, dy = b.y - a.y, pk = [-dx, dx, -dy, dy], qk = [a.x + ex, ex - a.x, a.y + ey, ey - a.y];
    let t0 = 0, t1 = 1;
    for (let k = 0; k < 4; k++) {
      if (Math.abs(pk[k]) < 1e-12) { if (qk[k] <= 0) return false; continue; }
      const t = qk[k] / pk[k];
      if (pk[k] < 0) { if (t > t0) t0 = t; } else if (t < t1) t1 = t;
      if (t0 >= t1) return false;
    }
    return t1 - t0 > 1e-4;
  }
  // Next waypoint for a person walking to `target` beside car c without cutting through it: the shortest way
  // round the corners of its footprint grown by the walker's radius and a margin (corners in walls or other
  // cars are out). Returns {x, y, len (what is left of the path), direct}. Cheap; re-plan every frame.
  X.pathAroundCar = function (p, c, target) {
    const r = p.r || 0.32, hl = c.len / 2, hw = c.wid / 2, a = carLocal(c, p.x, p.y), b = carLocal(c, target.x, target.y);
    const gap = q => Math.hypot(Math.max(0, Math.abs(q.x) - hl), Math.max(0, Math.abs(q.y) - hw));
    const e = Math.max(0, Math.min(r + 0.05, gap(a) - 0.03, gap(b) - 0.03)), bx = hl + e, by = hw + e;
    const direct = { x: target.x, y: target.y, len: Math.hypot(b.x - a.x, b.y - a.y), direct: true };
    if (!segBox(a, b, bx, by)) return direct;
    const m = r + 0.35, K = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([sx, sy]) => {   // a tree or a post on the corner: go wider
      for (const x of [0, 0.6]) { const k = { x: sx * (hl + m + x), y: sy * (hw + m + x) }; if (spotFree(c, carWorld(c, k), r * 0.9)) return k; }
      return null;
    });
    // legs that would run into a neighbouring car (parked bumper to bumper) are out too
    const near = X.cars.filter(o => o !== c && !o.removed && Math.abs(o.x - c.x) < (o.len + c.len) / 2 + 3 && Math.abs(o.y - c.y) < (o.len + c.len) / 2 + 3);
    const clear = (q0, q1) => {
      if (!near.length) return true;
      const w0 = carWorld(c, q0), w1 = carWorld(c, q1);
      return !near.some(o => segBox(carLocal(o, w0.x, w0.y), carLocal(o, w1.x, w1.y), o.len / 2 + r * 0.9, o.wid / 2 + r * 0.9));
    };
    const ring = [0, 1, 2, 3].map(j => !!(K[j] && K[(j + 1) % 4]) && clear(K[j], K[(j + 1) % 4]));   // leg j -> j+1
    let best = null, bl = Infinity;
    for (let i = 0; i < 4; i++) {
      if (!K[i] || segBox(a, K[i], bx, by) || !clear(a, K[i])) continue;
      const l0 = Math.hypot(K[i].x - a.x, K[i].y - a.y);
      for (const d of [1, 3]) {   // round the ring either way
        let L = l0, j = i;
        for (let n = 0; n < 4; n++) {
          if (n) { const nj = (j + d) % 4; if (!ring[d === 1 ? j : nj]) break; L += Math.hypot(K[nj].x - K[j].x, K[nj].y - K[j].y); j = nj; }
          if (!segBox(K[j], b, bx, by) && clear(K[j], b)) { const tot = L + Math.hypot(b.x - K[j].x, b.y - K[j].y); if (tot < bl) { bl = tot; best = K[i]; } break; }
        }
      }
    }
    if (!best) return Object.assign(direct, { blocked: true });   // no way round (hemmed in): straight at it
    const w = carWorld(c, best);
    return { x: w.x, y: w.y, len: bl, direct: false };
  };
  X.enterCar = function (c) {
    if (!c || c.removed) return;
    if (P.entering) endSeq();
    P.entering = { car: c, ped: P.ped, mode: 'enter', phase: 'walk', t: 0, pt: 0, stall: 0, ent: null, pickT: 0 };
  };
  function jackOut(c) {
    const was = c.model.kind, ej = X.ejectOccupants(c, 'carjack');
    X.emit('carjack', { car: c, victims: ej });
    X.crime(was === 'police' || was === 'swat' ? 'stealCopCar' : 'carjack', c.x, c.y, { car: c });
  }
  function finishEnter(c) {
    const e = P.entering && P.entering.car === c ? P.entering : null;
    P.entering = null;
    const p = P.ped;
    p.seqHidden = false;
    if (c.npcDriver || (c.driver && !c.driver.isPlayer)) jackOut(c);
    else if (!(e && e.jacked) && (c.model.kind === 'police' || c.model.kind === 'swat')) X.crime('stealCopCar', c.x, c.y, { car: c });
    toPhys(c);
    c.driver = p; c.ai = null; c.keep = false; c.owner = c.owner === 'police' ? null : c.owner;
    p.car = c; p.hidden = true; p.vx = p.vy = 0;
    P.car = c;
    X.cam.mode = 'follow';
    P.aimCar = c; P.aim = c.th; mouse.dx = mouse.dy = 0; mouse.quietUntil = performance.now() + 150;
    if (mouseSteering()) lockPointer();
    if (c.dv) c.dv.gear = 1;
    X.popup(c.model.name);
    X.emit('enterCar', { car: c });
    if (e && e.opened) { X.emit('doorClose', { car: c, side: e.ent.side, door: e.ent.door, by: p }); P.seatT = X.time + 0.3; }
  }
  // Pin the person to a car-local point (they ride along while the car rocks or rolls).
  function hold(e, c, p, l) {
    const w = carWorld(c, l), v = X.carVel(c);
    p.x = w.x; p.y = w.y; p.vx = v.x; p.vy = v.y; p.speed = 0; e.px = p.x; e.py = p.y;
  }
  function along(pts, k) {   // point at fraction k along a polyline of car-local points
    let tot = 0; for (let i = 1; i < pts.length; i++) tot += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    let d = k * tot;
    for (let i = 1; i < pts.length; i++) {
      const L = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (d <= L || i === pts.length - 1) { const f = L ? Math.min(1, d / L) : 1; return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f }; }
      d -= L;
    }
    return pts[pts.length - 1];
  }
  const ease = k => k * k * (3 - 2 * k);
  // End whatever sequence is running, leaving the person standing beside the door if they were still inside.
  function endSeq() {
    const e = P.entering; P.entering = null;
    if (!e) return;
    const p = e.ped, c = e.car;
    if (p && p.seqHidden) {
      p.seqHidden = false; p.hidden = false; if (p.car === c && P.car !== c) p.car = null;
      const l = carLocal(c, p.x, p.y);
      if (e.ent && !c.removed && Math.abs(l.x) < c.len / 2 + 0.1 && Math.abs(l.y) < c.wid / 2 + 0.1) { const w = carWorld(c, e.ent.stand); p.x = w.x; p.y = w.y; }
      if (c.wrecked && !e.wreck0 && !p.dead) { const a = Math.atan2(p.y - c.y, p.x - c.x); p.vx = Math.cos(a) * 6; p.vy = Math.sin(a) * 6; p.knock = Math.max(p.knock || 0, 0.9); p.spin = 8; }   // blown back out of the doorway
    }
    if (e.opened && !e.closed) X.emit('doorClose', { car: e.car, side: e.ent.side, door: e.ent.door, leave: true });
  }
  function arrive(e, c, p) {
    const occ = !!(c.npcDriver || (c.driver && !c.driver.isPlayer));
    if (occ && c.ctrl === 'path') toPhys(c);
    const d = X.emit('doorOpen', { car: c, side: e.ent.side, door: e.ent.door, fast: occ, jack: occ, by: p });
    if (d.wait == null) return finishEnter(c);   // nothing to animate: straight in
    e.from = carLocal(c, p.x, p.y); e.phase = occ ? 'jack' : 'open'; e.pt = 0; e.wait = d.wait; e.opened = true;
    e.dur = d.step || (e.ent.via ? 0.5 : 0.3);
    hold(e, c, p, e.from);
  }
  const SEQ_RUN = 7;   // m/s: you hurry to a car
  function walkStep(e, c, p, dt) {
    if (!e.ent || e.avoid || (e.t - e.pickT > 0.5 && (e.stuck || !spotFree(c, carWorld(c, e.ent.stand), 0.3)))) { const n = pickEntry(c, p, e.avoid); if (n !== e.ent) { e.prog = Infinity; e.progT = e.t; } e.ent = n; e.avoid = null; e.pickT = e.t; }
    if (!e.ent || X.input.anyPressed('KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight')) return endSeq();   // changed your mind
    const T = carWorld(c, e.ent.stand), dT = Math.hypot(T.x - p.x, T.y - p.y);
    if (dT > 16 || (c.speed > 6 && dT > 1.5)) return endSeq();   // it drove off
    e.stall = p.speed < 0.5 && e.t > 0.3 ? e.stall + dt : 0;
    if (dT < 0.35 || (dT < 0.9 && e.stall > 0.25)) return arrive(e, c, p);
    const w = X.pathAroundCar(p, c, T), dx = w.x - p.x, dy = w.y - p.y, dd = Math.hypot(dx, dy) || 1;
    // no headway for a second (pressed against another car, a post, a wall): try the other door once, then give up
    // rather than sliding through whatever is in the way
    if (w.len < e.prog - 0.25) { e.prog = w.len; e.progT = e.t; }
    if (e.t - e.progT > 1 || e.t > 4.5) {
      const l = carLocal(c, p.x, p.y), touch = Math.hypot(Math.max(0, Math.abs(l.x) - c.len / 2), Math.max(0, Math.abs(l.y) - c.wid / 2)) < 0.75;
      if (dT < 1.2 || (touch && e.retried)) return arrive(e, c, p);   // right up against it (a tight alley): squeeze in
      if (e.retried || e.t > 4.5) { X.popup('Can\'t get to the door'); return endSeq(); }
      e.retried = true; e.avoid = e.ent; return;
    }
    e.stuck = !!w.blocked;
    const sp = Math.min(SEQ_RUN * (p.speedMul || 1), 1.6 + w.len * 4.5);
    X.movePed(p, dt, dx / dd * sp, dy / dd * sp);
    p.th += wrap(Math.atan2(dy, dx) - p.th) * Math.min(1, dt * 16); p.aim = p.th;
  }
  function seqStep(dt) {
    const e = P.entering, p = P.ped, c = e.car;
    e.t += dt; e.pt += dt;
    if (e.ped !== p || c.removed || e.t > 8) return endSeq();
    if (e.px != null && (Math.hypot(p.x - e.px, p.y - e.py) > 0.6 || (p.knock > 0 && !p.seqHidden))) return endSeq();   // knocked or teleported away
    if (e.mode === 'exit') return c.wrecked && !e.wreck0 ? endSeq() : exitStep(e, c, p, dt);
    if (c.wrecked || P.state !== 'play') return endSeq();
    if (e.phase === 'walk') return walkStep(e, c, p, dt);
    if (c.speed > 7) return endSeq();
    const seat = carWorld(c, e.ent.seat);
    if (e.phase === 'open' || e.phase === 'jack') {
      const tug = e.jacked ? Math.sin(Math.PI * Math.min(1, e.pt / e.wait)) * 0.3 : 0, out = e.ent.side;   // heave the driver out
      hold(e, c, p, tug ? { x: e.from.x, y: e.from.y + out * tug } : e.from);
      p.th += wrap(Math.atan2(seat.y - p.y, seat.x - p.x) - p.th) * Math.min(1, dt * 14);
      if (e.phase === 'jack' && !e.jacked && e.pt >= e.wait) { e.jacked = true; e.pt = 0; e.wait = 0.16; jackOut(c); return; }   // yanked out, then a tug
      if (e.pt >= e.wait && (e.phase === 'open' || e.jacked)) { e.phase = 'in'; e.pt = 0; p.hidden = true; p.seqHidden = true; p.car = c; }   // half in: as good as inside
      return;
    }
    // 'in': step through the door into the seat (across the other one if needed), then sit
    const k = Math.min(1, e.pt / e.dur);
    hold(e, c, p, along(e.ent.via ? [e.from, e.ent.via, e.ent.seat] : [e.from, e.ent.seat], ease(k)));
    p.th += wrap(c.th - p.th) * Math.min(1, dt * 10); p.speed = 1.6; p.walk += dt * 4;   // (legs still going)
    if (k >= 1) finishEnter(c);
  }
  function exitStep(e, c, p, dt) {
    if (e.phase === 'open') {
      hold(e, c, p, e.ent.seat);
      if (e.pt >= e.wait) { e.phase = 'out'; e.pt = 0; }
      return;
    }
    const k = Math.min(1, e.pt / e.dur), out = c.th + e.ent.side * Math.PI / 2;
    hold(e, c, p, along(e.ent.via ? [e.ent.seat, e.ent.via, e.ent.stand] : [e.ent.seat, e.ent.stand], ease(k)));
    p.th = c.th + wrap(out - c.th) * ease(k); p.aim = p.th; p.speed = 1.6; p.walk += dt * 4;
    if (k < 1) return;
    P.entering = null; p.hidden = false; p.seqHidden = false; p.car = null; e.closed = true;
    const v = X.carVel(c), sp = Math.hypot(v.x, v.y);
    if (sp > 5) { p.knock = 0.45; p.spin = 3 * e.ent.side; }
    X.emit('doorClose', { car: c, side: e.ent.side, door: e.ent.door, leave: X.input.any('ShiftLeft', 'ShiftRight') || sp > 1.5 || c.wrecked, by: p });
  }
  X.exitCar = function () {
    const c = P.car, p = P.ped; if (!c) return;
    const fast = c.speed > 9, ent = fast ? null : exitEntry(c);
    const spot = ent ? carWorld(c, ent.stand) : doorSpot(c, -1);
    if (!spot && !fast) { X.popup('No room to get out'); return; }
    const s = spot || { x: c.x, y: c.y };
    c.driver = null; P.car = null;
    p.car = null; p.hidden = false; p.x = s.x; p.y = s.y; p.th = c.th;
    const vel = X.carVel(c);
    if (fast) {
      p.vx = vel.x * 0.55; p.vy = vel.y * 0.55; p.knock = 0.9; p.spin = 6; X.damagePed(p, Math.min(40, (c.speed - 8) * 2.5), null, 'bail');
      const side = spot && carLocal(c, s.x, s.y).y > 0.2 ? 1 : -1, a = entryFor(c, side);   // the door on the side you rolled out of
      X.emit('doorOpen', { car: c, side, door: a && a.door, fast: true, bail: true, by: p });
    } else if (ent) {
      const hurry = c.burning > 0 || p.onFire > 0;
      const d = X.emit('doorOpen', { car: c, side: ent.side, door: ent.door, fast: hurry, exit: true, by: p });
      if (d.wait != null) {
        const e = P.entering = { car: c, ped: p, mode: 'exit', phase: 'open', t: 0, pt: 0, ent, wait: d.wait, dur: d.step || (hurry ? 0.2 : ent.via ? 0.5 : 0.32), opened: true, wreck0: c.wrecked };
        p.hidden = true; p.seqHidden = true; p.car = c;
        hold(e, c, p, ent.seat);
      }
    }
    PG.audio.stopLoops();
    X.emit('exitCar', { car: c, bailed: fast });
  };
  function handleUse() {
    if (P.car) return X.exitCar();
    let best = null;
    for (const it of X.interactions) { const r = safe(it, 'test', it.test, [P]); if (r && (!best || (r.priority || 0) > (best.priority || 0))) best = r; }
    if (best) { safe(best, 'run', best.run, []); return; }
    const c = X.nearestEnterableCar(); if (c) X.enterCar(c);
  }
  function currentHint() {
    if (P.state !== 'play' || P.entering) return '';
    if (P.car) return P.car.speed < 9 ? '' : '';
    let best = null;
    for (const it of X.interactions) { const r = safe(it, 'test', it.test, [P]); if (r && (!best || (r.priority || 0) > (best.priority || 0))) best = r; }
    if (best) return best.text || '';
    const c = X.nearestEnterableCar();
    if (c) return (c.npcDriver || c.driver ? 'F: Jack the ' : 'F: Get in the ') + c.model.name;
    return '';
  }
  X.wasted = function (kind) {
    if (P.state !== 'play') return;
    P.state = 'wasted'; P.stateT = 0; endSeq();
    X.big('WASTED', '#e8402f', 3000);
    PG.audio.stopLoops(); PG.audio.trombone();
    X.emit('wasted', { kind });
  };
  X.bust = function () {
    if (P.state !== 'play') return;
    P.state = 'busted'; P.stateT = 0; endSeq();
    if (P.car && P.car.dv) { P.car.dv.vx *= 0.3; P.car.dv.vy *= 0.3; }
    X.big('BUSTED', '#5aa9ff', 3000);
    PG.audio.stopLoops();
    X.emit('busted', {});
  };
  X.respawn = function (reason) {
    const pl = X.places[reason === 'busted' ? 'police' : 'hospital'] || X.places.hideout;
    const fee = reason === 'busted' ? 200 + Math.round(P.money * 0.15) : reason === 'wasted' ? 100 + Math.round(P.money * 0.05) : 0;
    if (P.car) { if (P.car.driver === P.ped) P.car.driver = null; P.car = null; }
    newPlayerPed(pl.door.x + pl.door.nx * 1.5, pl.door.y + pl.door.ny * 1.5, Math.atan2(pl.door.ny, pl.door.nx));
    P.state = 'play'; P.stateT = 0; P.inv = { fists: Infinity }; P.weapon = 'fists';
    if (X.scene) X.leaveScene();
    X.cam.x = P.ped.x; X.cam.y = P.ped.y;
    if (fee) X.money(-fee, reason === 'busted' ? 'bail' : 'hospital');
    if (P.loot) { X.emit('lootLost', { amount: P.loot }); P.loot = 0; }
    X.pager(reason === 'busted' ? `Bail paid: $${fee}. They kept your guns.` : reason === 'wasted' ? `Hospital bill: $${fee}. Your guns did not survive.` : '');
    X.emit('respawn', { reason, place: pl });
  };

  // ================= scenes (interiors) =================
  // scene: { id, name, cityPos: {x, y} (door outside), camSpan, bg, drawFloor(ctx, view, t), drawTop(ctx, view, t), ambient }
  X.enterScene = function (scene, x, y, th) {
    X.scene = scene;
    const p = P.ped; p.x = x; p.y = y; p.vx = p.vy = 0; if (th != null) p.th = th;
    X.cam.x = x; X.cam.y = y;
    X.emit('sceneChange', { scene });
  };
  X.leaveScene = function (x, y, th) {
    const s = X.scene; X.scene = null;
    if (x != null) { const p = P.ped; p.x = x; p.y = y; p.vx = p.vy = 0; if (th != null) p.th = th; X.cam.x = x; X.cam.y = y; }
    X.emit('sceneChange', { scene: null, from: s });
  };

  // ================= drawing =================
  const PEDDRAW = {};
  X.drawPed = function (ctx, p, t) {
    const lk = p.look || {}, S = PG.settings || {}, shadows = S.shadows !== false, hi = S.detail !== 'low';
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.th);
    if (p.dead) {
      if (shadows) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0.05, 0.05, 0.75, 0.42, 0, 0, TAU); ctx.fill(); }
      ctx.fillStyle = lk.pants || '#333'; ctx.fillRect(-0.75, -0.2, 0.45, 0.14); ctx.fillRect(-0.75, 0.06, 0.45, 0.14);
      ctx.fillStyle = lk.shirt || '#888'; ctx.beginPath(); ctx.ellipse(0, 0, 0.32, 0.26, 0, 0, TAU); ctx.fill();
      ctx.fillRect(-0.05, -0.62, 0.14, 0.4); ctx.fillRect(-0.05, 0.22, 0.14, 0.4);
      ctx.fillStyle = lk.skin || '#e0ac7e'; ctx.beginPath(); ctx.arc(0.42, 0, 0.15, 0, TAU); ctx.fill();
      ctx.restore(); return;
    }
    const sw = Math.sin(p.walk * 3) * Math.min(1, p.speed / 2) * 0.24;
    if (shadows) { ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(0.05, 0.06, 0.26, 0.36, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = lk.pants || '#333';
    ctx.fillRect(sw - 0.1, -0.17, 0.22, 0.12); ctx.fillRect(-sw - 0.1, 0.05, 0.22, 0.12);
    const armed = p.weapon && p.weapon !== 'fists';
    ctx.fillStyle = lk.shirt || '#888'; ctx.beginPath(); ctx.ellipse(0, 0, 0.17, 0.31, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = lk.skin || '#e0ac7e';
    if (armed) { if (hi) { ctx.beginPath(); ctx.arc(0.3, 0.1, 0.07, 0, TAU); ctx.arc(0.26, -0.12, 0.07, 0, TAU); ctx.fill(); } ctx.fillStyle = '#16181c'; ctx.fillRect(0.28, 0.02, 0.38, 0.08); }
    else if (hi) { ctx.beginPath(); ctx.arc(-sw * 0.8 + 0.02, -0.3, 0.07, 0, TAU); ctx.arc(sw * 0.8 + 0.02, 0.3, 0.07, 0, TAU); ctx.fill(); }
    ctx.fillStyle = lk.skin || '#e0ac7e'; ctx.beginPath(); ctx.arc(0.02, 0, 0.15, 0, TAU); ctx.fill();
    ctx.fillStyle = lk.hat || lk.hair || '#222'; ctx.beginPath(); ctx.arc(-0.03, 0, lk.hat ? 0.15 : 0.12, 0, TAU); ctx.fill();
    if (p.hurtT > 0) { ctx.fillStyle = 'rgba(255,40,30,0.45)'; ctx.beginPath(); ctx.arc(0, 0, 0.36, 0, TAU); ctx.fill(); }
    ctx.restore();
  };
  // Markings by vehicle kind, in the car's own frame (x forward). With the fast renderer they are baked
  // into the car's cached sprite; the key says which flash phase is showing.
  const KIND_MARKS = {
    police(ctx, c, on) {
      const L = c.len, W = c.wid;
      ctx.fillStyle = '#14161a'; ctx.fillRect(L / 2 - 1.0, -W / 2 + 0.05, 0.75, W - 0.1); ctx.fillRect(-L / 2 + 0.15, -W / 2 + 0.05, 0.7, W - 0.1);
      ctx.fillStyle = c.siren ? (on ? '#ff2a2a' : '#5a1010') : '#7a2020'; ctx.fillRect(-0.15, -0.7, 0.28, 0.66);
      ctx.fillStyle = c.siren ? (!on ? '#2a6bff' : '#10205a') : '#203070'; ctx.fillRect(-0.15, 0.04, 0.28, 0.66);
    },
    taxi(ctx) { ctx.fillStyle = '#1b1b1b'; ctx.fillRect(-0.25, -0.45, 0.36, 0.9); ctx.fillStyle = '#ffe680'; ctx.fillRect(-0.2, -0.38, 0.26, 0.76); },
    ambulance(ctx, c, on) {
      const L = c.len, fire = c.model.kind === 'fire';
      ctx.fillStyle = fire ? '#f2f2f2' : '#d42a2a'; ctx.fillRect(-L / 2, -0.12, L * 0.68, 0.24);
      ctx.fillStyle = c.siren ? (on ? '#ff3030' : '#3a5cff') : '#7a2020'; ctx.fillRect(L * 0.22, -0.6, 0.25, 1.2);
    },
    armored(ctx, c) { ctx.fillStyle = '#d4af37'; ctx.fillRect(-c.len / 2 + 0.1, -0.1, c.len * 0.66, 0.2); },
    swat(ctx, c, on) {
      ctx.fillStyle = c.color; ctx.fillRect(-c.len / 2 + 0.05, -c.wid / 2 + 0.05, c.len * 0.7, c.wid - 0.1);   // a black van, not a white box
      ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(-c.len / 2 + 0.3, -c.wid / 2 + 0.3, c.len * 0.6, c.wid - 0.6);
      ctx.fillStyle = '#f4f4f4'; ctx.font = '700 0.7px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.save(); ctx.rotate(Math.PI / 2); ctx.fillText('SWAT', 0, 0.6); ctx.restore();
      ctx.fillStyle = c.siren ? (on ? '#ff2a2a' : '#2a6bff') : '#333'; ctx.fillRect(c.len * 0.25, -0.6, 0.25, 1.2);
    },
  };
  // army green: a white star on the bonnet, canvas ribs on the truck bed, hatches and a gun on the APC
  const star = (ctx, x, y, r) => { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.42 : r; ctx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } ctx.closePath(); ctx.fill(); };
  Object.assign(KIND_MARKS, {
    jeep(ctx, c) {
      const L = c.len, W = c.wid;
      ctx.fillStyle = '#2f3622'; ctx.fillRect(-L / 2 + 0.25, -W / 2 + 0.2, L * 0.42, W - 0.4);   // open back, benches
      ctx.fillStyle = '#5d4a32'; ctx.fillRect(-L / 2 + 0.35, -W / 2 + 0.25, L * 0.36, 0.3); ctx.fillRect(-L / 2 + 0.35, W / 2 - 0.55, L * 0.36, 0.3);
      ctx.fillStyle = '#1b1d1f'; ctx.beginPath(); ctx.arc(-L / 2 - 0.05, 0, 0.36, 0, TAU); ctx.fill();   // spare wheel on the tailgate
      ctx.fillStyle = '#e9e4d8'; star(ctx, L / 2 - 0.75, 0, 0.32);
    },
    armytruck(ctx, c) {
      const L = c.len, W = c.wid;
      ctx.fillStyle = '#5b6740'; ctx.fillRect(-L / 2 + 0.1, -W / 2 + 0.08, L * 0.7, W - 0.16);
      ctx.strokeStyle = '#3b4429'; ctx.lineWidth = 0.1; ctx.beginPath();
      for (let i = 1; i < 7; i++) { const x = -L / 2 + 0.1 + i * L * 0.7 / 7; ctx.moveTo(x, -W / 2 + 0.12); ctx.lineTo(x, W / 2 - 0.12); }
      ctx.stroke();
      ctx.fillStyle = '#e9e4d8'; star(ctx, L / 2 - 0.9, 0, 0.36);
    },
    apc(ctx, c) {
      const L = c.len, W = c.wid;
      ctx.fillStyle = c.color; ctx.fillRect(-L / 2 + 0.05, -W / 2 + 0.05, L * 0.72, W - 0.1);   // armour, not a cargo box
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(-L / 2 + 0.05, -W / 2 + 0.05, L * 0.72, 0.16); ctx.fillRect(-L / 2 + 0.05, W / 2 - 0.21, L * 0.72, 0.16);
      ctx.fillStyle = '#48522f'; ctx.beginPath(); ctx.moveTo(L / 2, -W / 2 + 0.5); ctx.lineTo(L / 2 - 1.1, -W / 2 + 0.05); ctx.lineTo(L / 2 - 1.1, W / 2 - 0.05); ctx.lineTo(L / 2, W / 2 - 0.5); ctx.closePath(); ctx.fill();   // sloped glacis
      ctx.fillStyle = '#3a4227'; ctx.fillRect(-L / 2 + 0.4, -0.55, 1.1, 1.1); ctx.fillRect(-L / 2 + 0.4, W / 2 - 0.75, 1.6, 0.5); ctx.fillRect(-L / 2 + 0.4, -W / 2 + 0.25, 1.6, 0.5);
      ctx.fillStyle = '#2e3420'; ctx.beginPath(); ctx.arc(0.4, 0, 0.62, 0, TAU); ctx.fill();   // turret ring, gun forward
      ctx.fillStyle = '#1c1f16'; ctx.fillRect(0.4, -0.08, 2.2, 0.16);
      ctx.fillStyle = '#e9e4d8'; star(ctx, -1.4, 0, 0.3);
    },
  });
  KIND_MARKS.fire = KIND_MARKS.ambulance;
  X.drawCar = function (ctx, c, t) {
    const m = c.model;
    if (m.kind === 'bus') return drawBus(ctx, c, t);
    const def = c.def, mid = carMid(def), st = c.dv ? c.dv.steer * def.maxSteer : 0, hw = c.wid / 2 + 0.02;
    const wheels = [{ lx: def.wb - mid, ly: -hw, a: st }, { lx: def.wb - mid, ly: hw, a: st }, { lx: -mid, ly: -hw, a: 0 }, { lx: -mid, ly: hw, a: 0 }];
    const mk = !c.wrecked && KIND_MARKS[m.kind];
    let overlay = null, overlayKey = '';
    if (mk) {
      const on = !!c.siren && Math.floor(t * (m.kind === 'ambulance' || m.kind === 'fire' ? 6 : 8)) % 2 === 0;
      overlay = g => mk(g, c, on); overlayKey = m.kind + (c.siren ? (on ? 'A' : 'B') : '0');
    }
    PG.drawCar(ctx, { x: c.x, y: c.y, th: c.th, len: c.len, wid: c.wid, color: c.color, truck: !!m.box, wheels, lights: c.lightsOn && !c.wrecked, brake: c.braking && !c.wrecked, reverse: c.reversing, charred: c.wrecked, overlay, overlayKey });
  };
  function drawBus(ctx, c, t) {
    const S = PG.settings || {}, ppm = PG.renderPpm;
    if (S.fastRender && PG.renderCaps && PG.renderCaps.cars && ctx === PG.mainCtx && ppm > 0) {
      const lv = PG.spriteLevel(ppm), M = 0.6, hl = c.len / 2 + M, hw = c.wid / 2 + M;
      if (ppm < lv * 1.25 && 2 * hl * lv <= 2048) {
        const key = 'bus|' + c.len + '|' + c.wid + '|' + c.color + '|' + (c.wrecked ? 1 : 0) + (c.lightsOn ? 1 : 0) + (c.braking ? 1 : 0) + (S.shadows === false ? 0 : 1) + '|' + lv;
        const spr = PG.sprites.get(key, 2 * hl * lv, 2 * hw * lv, g => { g.setTransform(lv, 0, 0, lv, hl * lv, hw * lv); busBody(g, c, S); });
        ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.th); ctx.drawImage(spr, -hl, -hw, spr.width / lv, spr.height / lv); ctx.restore();
        return;
      }
    }
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.th); busBody(ctx, c, S); ctx.restore();
  }
  function busBody(ctx, c, S) {
    const L = c.len, W = c.wid;
    if (S.shadows !== false) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; PG.rr(ctx, -L / 2 + 0.2, -W / 2 + 0.25, L, W, 0.5); ctx.fill(); }
    if (S.detail !== 'low') { ctx.fillStyle = '#111'; for (const x of [L / 2 - 2.6, -L / 2 + 2.4]) { ctx.fillRect(x - 0.45, -W / 2 - 0.08, 0.9, 0.22); ctx.fillRect(x - 0.45, W / 2 - 0.14, 0.9, 0.22); } }
    ctx.fillStyle = c.wrecked ? '#1b1b1b' : c.color; PG.rr(ctx, -L / 2, -W / 2, L, W, 0.45); ctx.fill();
    if (!c.wrecked) {
      ctx.fillStyle = '#e9e6dc'; PG.rr(ctx, -L / 2 + 0.4, -W / 2 + 0.3, L - 1.4, W - 0.6, 0.3); ctx.fill();
      ctx.fillStyle = '#9aa0a8'; ctx.fillRect(-1.6, -0.55, 1.4, 1.1); ctx.fillRect(1.2, -0.45, 1.0, 0.9);
      ctx.fillStyle = '#18222d'; ctx.fillRect(L / 2 - 0.55, -W / 2 + 0.15, 0.42, W - 0.3);
      ctx.fillStyle = '#ffb02e'; ctx.font = '700 0.42px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.save(); ctx.translate(L / 2 - 0.85, 0); ctx.rotate(Math.PI / 2); ctx.fillText('TAKE THE BUS', 0, 0); ctx.restore();
      ctx.fillStyle = c.lightsOn ? '#fff6c8' : '#d8d2b8'; ctx.fillRect(L / 2 - 0.1, -W / 2 + 0.15, 0.1, 0.4); ctx.fillRect(L / 2 - 0.1, W / 2 - 0.55, 0.1, 0.4);
      ctx.fillStyle = c.braking ? '#ff2a1a' : '#8e1d16'; ctx.fillRect(-L / 2, -W / 2 + 0.15, 0.1, 0.4); ctx.fillRect(-L / 2, W / 2 - 0.55, 0.1, 0.4);
    }
  }

  // ================= camera =================
  X.view = function (cw, ch, g, dpr, pad, dt) {
    dt = Math.min(0.05, dt || 0.016);
    const vh = ch - (pad || 0), cam = X.cam, c = P.car, pos = X.playerPos(), vel = X.playerVel();
    let want = c ? 34 + Math.min(58, c.speed * 1.25) : 27;
    if (c && c.model.kind === 'bus') want += 10;
    if (X.scene && X.scene.camSpan) want = X.scene.camSpan;
    if (P.state !== 'play') want *= 0.8;
    want *= cam.zoom;
    if (X.input.down('Tab')) want = 260;
    cam.span += (want - cam.span) * Math.min(1, dt * (X.input.down('Tab') ? 5 : 1.6));
    const lead = c ? 0.5 : 0.15, lx = cl(vel.x * lead, -18, 18), ly = cl(vel.y * lead, -18, 18);
    const k = 1 - Math.exp(-dt * (c ? 5 : 8));
    if (!isFinite(cam.x) || Math.hypot(cam.x - pos.x, cam.y - pos.y) > 120) { cam.x = pos.x; cam.y = pos.y; }
    cam.x += (pos.x + lx - cam.x) * k; cam.y += (pos.y + ly - cam.y) * k;
    // the view turns with the car once the door has shut behind you, and back only once you are out
    const ex = P.entering && P.entering.mode === 'exit' ? P.entering.car : null, fc = c || ex;
    const follow = cam.mode === 'follow' && fc && !X.scene && !(c && P.seatT > X.time);
    const ease = 1 - Math.exp(-dt * 3.2);
    cam.yaw += wrap((follow ? fc.th : -Math.PI / 2) - cam.yaw) * ease;
    cam.lift += ((follow ? 0.6 : 0.5) - cam.lift) * ease;
    const scale = Math.min(cw, vh) / cam.span;
    let sx = 0, sy = 0;
    if (g.shake > 0 && (PG.settings || {}).cameraShake !== false) { const q = g.shake * 12; sx = (Math.random() - 0.5) * q; sy = (Math.random() - 0.5) * q; }
    const rot = -cam.yaw - Math.PI / 2;
    const view = { scale, dpr, cw, ch, cx: cam.x, cy: cam.y, rot: Math.abs(rot) < 1e-4 ? 0 : rot, ax: cw / 2 + sx, ay: vh * cam.lift + sy, r: Math.hypot(cw, ch) / scale * 0.62 + 4, bottomPad: pad || 0 };
    X.lastView = view;
    const w = X.toWorld(mouse.sx, mouse.sy); mouse.wx = w.x; mouse.wy = w.y;
    updateAim(view); syncCursor();
    return view;
  };
  X.toWorld = function (sx, sy) {
    const v = X.lastView; if (!v) return { x: 0, y: 0 };
    let x = sx - v.ax, y = sy - v.ay; const c = Math.cos(-v.rot), s = Math.sin(-v.rot);
    const rx = x * c - y * s, ry = x * s + y * c;
    return { x: rx / v.scale + v.cx, y: ry / v.scale + v.cy };
  };
  X.toScreen = function (x, y) {
    const v = X.lastView; if (!v) return { x: 0, y: 0 };
    const dx = (x - v.cx) * v.scale, dy = (y - v.cy) * v.scale, c = Math.cos(v.rot), s = Math.sin(v.rot);
    return { x: dx * c - dy * s + v.ax, y: dx * s + dy * c + v.ay };
  };
  X.inView = (x, y, pad) => { const v = X.lastView; return !!v && Math.abs(x - v.cx) < v.r + (pad || 0) && Math.abs(y - v.cy) < v.r + (pad || 0); };

  // ================= render =================
  const LAYERS = ['ground', 'props', 'buildings', 'bodies', 'cars', 'peds', 'air', 'light', 'overlay', 'screen'];
  function layer(name, ctx, view, t) {
    for (const m of X.modules) {
      const fn = m.render && m.render[name]; if (!fn) continue;
      ctx.save();
      if (name === 'screen' || name === 'light') ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0); else PG.cityDraw.worldTransform(ctx, view);
      safe(m, 'render.' + name, fn, [ctx, view, t]);
      ctx.restore();
    }
  }
  X.render = function (ctx, g, view, t) {
    if (!X.active || !X.city) return;
    const CD = PG.cityDraw, C = X.city, S = X.scene;
    X.renderT = t;
    CD.begin(ctx, view, S && S.bg ? S.bg : '#0b0c0f');
    if (S) { if (S.drawFloor) S.drawFloor(ctx, view, t); }
    else CD.ground(ctx, C, view);
    drawDecals(ctx, view);
    layer('ground', ctx, view, t);
    if (!S) { CD.skids(ctx, X.skid, view); CD.lampPools(ctx, C, view); }
    drawObjectives(ctx, t);
    layer('props', ctx, view, t);
    if (S) { if (S.drawWalls) S.drawWalls(ctx, view, t); } else CD.buildings(ctx, C, view, t);
    layer('buildings', ctx, view, t);
    let nCars = 0, nPeds = 0;
    for (const p of X.peds) if (p.dead && !p.removed && !p.hidden && X.inView(p.x, p.y, 2)) { X.drawPed(ctx, p, t); nPeds++; }
    layer('bodies', ctx, view, t);
    if (!S) for (const c of X.cars) if (!c.removed && X.inView(c.x, c.y, c.len)) { X.drawCar(ctx, c, t); nCars++; }
    layer('cars', ctx, view, t);
    for (const p of X.peds) if (!p.dead && !p.removed && !p.hidden && !p.car && X.inView(p.x, p.y, 2)) { X.drawPed(ctx, p, t); nPeds++; }
    const RS = PG.renderStats; if (RS) { RS.cars = nCars; RS.peds = nPeds; RS.particles = g.particles.length; RS.decals = X.decals.length; }
    layer('peds', ctx, view, t);
    if (!S) CD.canopies(ctx, C, view); else if (S.drawTop) S.drawTop(ctx, view, t);
    layer('air', ctx, view, t);
    PG.drawParticles(ctx, g);
    layer('light', ctx, view, t);
    X.lights.length = 0;
    CD.worldTransform(ctx, view);
    drawFloats(ctx, view);
    layer('overlay', ctx, view, t);
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    drawCrosshair(ctx, view);
    drawObjectiveArrows(ctx, view, t);
    layer('screen', ctx, view, t);
    if (P.state === 'wasted' || P.state === 'busted') {
      const k = Math.min(1, P.stateT / 1.2);
      ctx.fillStyle = P.state === 'wasted' ? `rgba(120,0,0,${0.35 * k})` : `rgba(0,30,90,${0.3 * k})`; ctx.fillRect(0, 0, view.cw, view.ch);
    }
  };
  // Fast renderer: each decal is one blit of a cached sprite of its kind (canonical size 1, centred),
  // placed with a single setTransform; broken glass stays a small batched path.
  const DB = 1.15;
  function decalShape(g, kind, color) {
    if (kind === 'blood') {
      g.fillStyle = color || 'rgba(110,8,10,0.78)';
      g.beginPath(); g.ellipse(0, 0, 1, 0.7, 0, 0, TAU); g.fill();
      g.beginPath(); g.arc(0.8, 0.3, 0.25, 0, TAU); g.arc(-0.6, -0.5, 0.18, 0, TAU); g.fill();
    } else if (kind === 'scorch') {
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, 'rgba(8,8,8,0.85)'); gr.addColorStop(0.6, 'rgba(20,18,16,0.5)'); gr.addColorStop(1, 'rgba(20,18,16,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill();
    } else if (kind === 'oil') { g.fillStyle = 'rgba(12,12,16,0.7)'; g.beginPath(); g.ellipse(0, 0, 1, 0.6, 0, 0, TAU); g.fill(); }
    else { g.fillStyle = color || 'rgba(255,255,255,0.4)'; g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill(); }
  }
  function drawDecals(ctx, view) {
    const S = PG.settings || {}, cap = PG.DECAL_CAP[S.decals] || 400;
    if (X.decals.length > cap) X.decals.splice(0, X.decals.length - cap);
    if (!S.fastRender || ctx !== PG.mainCtx || !PG.sprites) return drawDecalsClassic(ctx, view);
    const m = PG.cityDraw.worldMatrix(view), ppm = view.scale * view.dpr, sprites = !!(PG.renderCaps && PG.renderCaps.decals);
    let moved = false;
    for (const d of X.decals) {
      if (!X.inView(d.x, d.y, d.size + 2)) continue;
      const s = d.size, k = d.kind === 'blood' ? s * Math.min(1, 0.4 + (X.time - d.t) * 0.8) : d.kind === 'glass' ? 1 : s;
      const c = Math.cos(d.rot) * k, sn = Math.sin(d.rot) * k;
      ctx.setTransform(m[0] * c + m[2] * sn, m[1] * c + m[3] * sn, m[2] * c - m[0] * sn, m[3] * c - m[1] * sn, m[0] * d.x + m[2] * d.y + m[4], m[1] * d.x + m[3] * d.y + m[5]);
      moved = true;
      if (d.kind === 'glass') {
        ctx.fillStyle = 'rgba(200,225,240,0.5)'; ctx.beginPath();
        for (let q = 0; q < 7; q++) { const a = q * 2.4 + d.seed * 6, r = s * ((q * 37 % 10) / 10); ctx.rect(Math.cos(a) * r, Math.sin(a) * r, 0.12, 0.08); }
        ctx.fill();
        continue;
      }
      if (!sprites && d.kind !== 'scorch') { decalShape(ctx, d.kind, d.color); continue; }   // plain fills: cheaper as vector in software
      const lv = Math.pow(2, Math.max(2, Math.min(17, Math.ceil(Math.log2(Math.max(1e-3, ppm * s)) * 2 - 0.12))) / 2);
      const spr = PG.sprites.get('decal|' + d.kind + '|' + (d.color || '') + '|' + lv, 2 * DB * lv, 2 * DB * lv, g => { g.setTransform(lv, 0, 0, lv, DB * lv, DB * lv); decalShape(g, d.kind, d.color); });
      ctx.drawImage(spr, -DB, -DB, spr.width / lv, spr.height / lv);
    }
    if (moved) ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
  }
  function drawDecalsClassic(ctx, view) {
    for (const d of X.decals) {
      if (!X.inView(d.x, d.y, d.size + 2)) continue;
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot);
      const s = d.size, age = X.time - d.t;
      if (d.kind === 'blood') {
        const g = Math.min(1, 0.4 + age * 0.8);
        ctx.fillStyle = d.color || 'rgba(110,8,10,0.78)';
        ctx.beginPath(); ctx.ellipse(0, 0, s * g, s * 0.7 * g, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(s * 0.8 * g, s * 0.3, s * 0.25, 0, TAU); ctx.arc(-s * 0.6 * g, -s * 0.5, s * 0.18, 0, TAU); ctx.fill();
      } else if (d.kind === 'scorch') {
        const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, s); gr.addColorStop(0, 'rgba(8,8,8,0.85)'); gr.addColorStop(0.6, 'rgba(20,18,16,0.5)'); gr.addColorStop(1, 'rgba(20,18,16,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.fill();
      } else if (d.kind === 'oil') {
        ctx.fillStyle = 'rgba(12,12,16,0.7)'; ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.6, 0, 0, TAU); ctx.fill();
      } else if (d.kind === 'glass') {
        ctx.fillStyle = 'rgba(200,225,240,0.5)'; for (let k = 0; k < 7; k++) { const a = k * 2.4 + d.seed * 6, r = s * ((k * 37 % 10) / 10); ctx.fillRect(Math.cos(a) * r, Math.sin(a) * r, 0.12, 0.08); }
      } else { ctx.fillStyle = d.color || 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
  }
  function drawObjectives(ctx, t) {
    for (const o of X.objectives) {
      if (!X.inView(o.x, o.y, o.radius + 2)) continue;
      const k = 0.5 + 0.5 * Math.sin(t * 5);
      ctx.strokeStyle = o.color; ctx.globalAlpha = 0.5 + 0.4 * k; ctx.lineWidth = 0.35;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.radius * (0.85 + 0.15 * k), 0, TAU); ctx.stroke();
      ctx.globalAlpha = 0.18; ctx.fillStyle = o.color; ctx.beginPath(); ctx.arc(o.x, o.y, o.radius, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      // bobbing chevron above the spot
      ctx.fillStyle = o.color; const by = o.y - o.radius - 1.2 - 0.4 * Math.sin(t * 4);
      ctx.beginPath(); ctx.moveTo(o.x - 0.7, by - 0.7); ctx.lineTo(o.x + 0.7, by - 0.7); ctx.lineTo(o.x, by + 0.2); ctx.closePath(); ctx.fill();
    }
  }
  function drawObjectiveArrows(ctx, view, t) {
    const vh = view.ch - (view.bottomPad || 0);
    for (const o of X.objectives) {
      const s = X.toScreen(o.x, o.y), m = 46;
      if (s.x > m && s.y > m && s.x < view.cw - m && s.y < vh - m) {
        if (o.label) { ctx.font = '700 15px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(o.label, s.x, s.y - 34); ctx.fillStyle = o.color; ctx.fillText(o.label, s.x, s.y - 34); }
        continue;
      }
      const cx = view.cw / 2, cy = vh / 2, a = Math.atan2(s.y - cy, s.x - cx);
      const ex = cl(s.x, m, view.cw - m), ey = cl(s.y, m, vh - m);
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(a);
      ctx.fillStyle = o.color; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(-10, -14); ctx.lineTo(-4, 0); ctx.lineTo(-10, 14); ctx.closePath(); ctx.stroke(); ctx.fill();
      ctx.restore();
      const d = Math.round(Math.hypot(o.x - X.focus().x, o.y - X.focus().y));
      ctx.font = '700 13px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      const lx = ex - Math.cos(a) * 30, ly = ey - Math.sin(a) * 30 + 4;
      ctx.strokeText(d + ' m', lx, ly); ctx.fillStyle = '#fff'; ctx.fillText(d + ' m', lx, ly);
    }
  }
  function drawFloats(ctx, view) {
    for (const f of X.floats) {
      const s = X.toScreen(f.x, f.y - f.t * 1.2), a = Math.max(0, 1 - f.t / f.life);
      ctx.save(); ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      ctx.globalAlpha = a; ctx.font = `${f.size || 18}px Bungee, Impact, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(f.text, s.x, s.y); ctx.fillStyle = f.color; ctx.fillText(f.text, s.x, s.y);
      ctx.restore();
    }
  }
  // In a car, while the right mouse button is held: the steering marker. A circle 400 px from the car in the world direction P.aim, joined to the car by a faint line;
  // orange while the wheels are at full lock.
  function drawSteerGuide(ctx, view) {
    const c = P.car; if (!c || c.wrecked || P.state !== 'play' || !mouseSteering() || keySteer() || X.scene) return;
    const o = X.toScreen(c.x, c.y), r = aimRadius(c, view), a = P.aim + view.rot, ca = Math.cos(a), sa = Math.sin(a);
    const r0 = c.len / 2 * view.scale + 8, full = Math.abs(c.mouseSteer || 0) >= 0.999;
    const mx = o.x + ca * r, my = o.y + sa * r;
    ctx.save();
    ctx.setLineDash([5, 7]); ctx.lineWidth = 1.5; ctx.strokeStyle = full ? 'rgba(255,190,70,0.45)' : 'rgba(255,255,255,0.3)';
    ctx.beginPath(); ctx.moveTo(o.x + ca * r0, o.y + sa * r0); ctx.lineTo(mx - ca * 10, my - sa * 10); ctx.stroke(); ctx.setLineDash([]);
    ctx.lineWidth = 2; ctx.strokeStyle = full ? 'rgba(255,190,70,0.9)' : 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.arc(mx, my, 9, 0, TAU); ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(mx, my, 2, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function drawCrosshair(ctx, view) {
    drawSteerGuide(ctx, view);
    if (P.car || P.state !== 'play' || !X.input.mouseActive()) return;
    const w = P.weapon; if (!w || w === 'fists') return;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(mouse.sx, mouse.sy, 7, 0, TAU); ctx.moveTo(mouse.sx - 11, mouse.sy); ctx.lineTo(mouse.sx - 4, mouse.sy); ctx.moveTo(mouse.sx + 4, mouse.sy); ctx.lineTo(mouse.sx + 11, mouse.sy);
    ctx.moveTo(mouse.sx, mouse.sy - 11); ctx.lineTo(mouse.sx, mouse.sy - 4); ctx.moveTo(mouse.sx, mouse.sy + 4); ctx.lineTo(mouse.sx, mouse.sy + 11); ctx.stroke();
  }

  // ================= HUD =================
  const css = `
#gta-hud { position: absolute; inset: 0; pointer-events: none; font-family: var(--hud); color: #fff; }
#gta-hud .g-tr { position: absolute; right: 12px; top: calc(62px + env(safe-area-inset-top, 0px)); display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
#gta-hud .g-money { font-family: var(--display); font-size: clamp(22px, 4vw, 32px); color: #7dff9a; text-shadow: 0 3px 0 #000, 0 0 12px rgba(0,0,0,0.6); font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }
#gta-hud .g-wanted { display: flex; gap: 3px; font-size: 20px; line-height: 1; }
#gta-hud .g-wanted i { font-style: normal; color: rgba(255,255,255,0.18); text-shadow: 0 2px 0 #000; }
#gta-hud .g-wanted i.on { color: #ffd23a; }
#gta-hud .g-wanted.flash i.on { animation: gflash .5s steps(2) infinite; }
@keyframes gflash { 50% { color: #5aa9ff; } }
#gta-hud .g-loot { font-family: var(--display); font-size: 18px; color: #ffd23a; text-shadow: 0 2px 0 #000; animation: gflash 1s steps(2) infinite; }
body.gta .hud-top { justify-content: flex-end; }
#gta-hud .g-clock { font-weight: 700; font-size: 16px; color: #c9cdd6; text-shadow: 0 2px 0 #000; font-variant-numeric: tabular-nums; }
#gta-hud .g-tl { position: absolute; left: 12px; top: calc(12px + env(safe-area-inset-top, 0px)); display: flex; flex-direction: column; gap: 6px; }
body.fps-on #gta-hud .g-tl { top: calc(40px + env(safe-area-inset-top, 0px)); }
#gta-hud .g-bar { width: 150px; height: 10px; border-radius: 3px; background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.25); overflow: hidden; }
#gta-hud .g-bar i { display: block; height: 100%; background: linear-gradient(90deg, #e8402f, #ff7a5a); width: 100%; transition: width .15s; }
#gta-hud .g-bar.armor i { background: linear-gradient(90deg, #4f8cff, #9ec2ff); }
#gta-hud .g-bar.car i { background: linear-gradient(90deg, #f4c20d, #ffe27a); }
#gta-hud .g-weap { display: flex; align-items: baseline; gap: 8px; font-weight: 800; font-size: 18px; text-transform: uppercase; letter-spacing: 0.05em; text-shadow: 0 2px 0 #000; }
#gta-hud .g-weap b { color: #ffd23a; font-variant-numeric: tabular-nums; }
#gta-hud .g-pager { position: absolute; left: 50%; top: calc(14px + env(safe-area-inset-top, 0px)); transform: translateX(-50%); max-width: min(560px, calc(100vw - 340px)); min-width: 220px; background: #1d2b1e; border: 3px solid #0e140e; border-radius: 8px; box-shadow: inset 0 0 0 2px #3c5a3c, 0 8px 24px rgba(0,0,0,0.5); padding: 8px 12px; font-family: 'Courier New', monospace; font-weight: 700; font-size: 15px; color: #9cff8a; text-shadow: 0 0 6px rgba(120,255,100,0.5); line-height: 1.3; }
#gta-hud .g-big { position: absolute; left: 0; right: 0; top: 38%; text-align: center; font-family: var(--display); font-size: clamp(40px, 10vw, 84px); letter-spacing: 0.04em; text-shadow: 0 5px 0 #000, 0 0 40px rgba(0,0,0,0.6); animation: pop .3s cubic-bezier(.2,1.6,.4,1) both; }
#gta-hud .g-big small { display: block; font-size: 0.32em; letter-spacing: 0.1em; margin-top: 6px; color: #fff; }
#gta-hud .g-popup { position: absolute; left: 14px; bottom: calc(18px + env(safe-area-inset-bottom, 0px)); font-family: var(--display); font-size: clamp(18px, 3.4vw, 28px); color: #fff; text-shadow: 0 3px 0 #000; transition: opacity .4s; }
#gta-hud .g-district { position: absolute; right: 16px; bottom: calc(210px + env(safe-area-inset-bottom, 0px)); font-family: var(--display); font-size: clamp(16px, 2.8vw, 24px); color: #ffd23a; text-shadow: 0 3px 0 #000; transition: opacity .6s; text-align: right; }
#gta-hud .g-hint { position: absolute; left: 50%; bottom: calc(22px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); background: rgba(10,11,14,0.82); border: 1px solid #3a3f46; border-radius: 999px; padding: 6px 14px; font-weight: 800; font-size: 16px; letter-spacing: 0.05em; text-transform: uppercase; white-space: nowrap; }
#gta-hud .g-map { position: absolute; right: 12px; bottom: calc(12px + env(safe-area-inset-bottom, 0px)); width: 180px; height: 180px; border-radius: 10px; border: 2px solid #2f3339; background: rgba(10,11,14,0.75); box-shadow: 0 6px 20px rgba(0,0,0,0.45); }
@media (max-width: 600px) { #gta-hud .g-map { width: 120px; height: 120px; } #gta-hud .g-district { bottom: calc(144px + env(safe-area-inset-bottom, 0px)); } #gta-hud .g-pager { max-width: calc(100vw - 40px); top: calc(100px + env(safe-area-inset-top, 0px)); } #gta-hud .g-bar { width: 110px; } }
`;
  let H = null;
  function buildHud() {
    if (H) return H;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const root = document.createElement('div'); root.id = 'gta-hud'; root.className = 'gta-only';
    root.innerHTML = '<div class="g-tl"><div class="g-bar hp"><i></i></div><div class="g-bar armor" hidden><i></i></div><div class="g-bar car" hidden><i></i></div><div class="g-weap"><span class="g-wname">Fists</span><b class="g-ammo"></b></div></div>' +
      '<div class="g-tr"><div class="g-money">$0</div><div class="g-wanted"><i>★</i><i>★</i><i>★</i><i>★</i><i>★</i><i>★</i></div><div class="g-clock">22:00</div><div class="g-loot" hidden></div></div>' +
      '<div class="g-pager" hidden></div><div class="g-big" hidden></div><div class="g-popup"></div><div class="g-district"></div><div class="g-hint" hidden></div>' +
      '<canvas class="g-map" width="360" height="360"></canvas>';
    document.getElementById('hud').appendChild(root);
    const q = s => root.querySelector(s);
    H = { root, hp: q('.hp i'), armorBar: q('.armor'), armor: q('.armor i'), carBar: q('.car'), car: q('.car i'), wname: q('.g-wname'), ammo: q('.g-ammo'), money: q('.g-money'), wanted: q('.g-wanted'), stars: [...root.querySelectorAll('.g-wanted i')], clock: q('.g-clock'), loot: q('.g-loot'), pager: q('.g-pager'), big: q('.g-big'), popup: q('.g-popup'), district: q('.g-district'), hint: q('.g-hint'), map: q('.g-map'), cache: {}, shownMoney: 0 };
    return H;
  }
  const setT = (el, key, v) => { if (H.cache[key] !== v) { H.cache[key] = v; el.textContent = v; } };
  let bigTimer = null, popupTimer = null, pagerTimer = null, districtTimer = null;
  X.big = function (text, color, ms, sub) {
    buildHud(); const b = H.big;
    b.hidden = false; b.style.color = color || '#ffd23a'; b.textContent = text;
    if (sub) { const s = document.createElement('small'); s.textContent = sub; b.appendChild(s); }
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(bigTimer); bigTimer = setTimeout(() => { b.hidden = true; }, ms || 2200);
  };
  X.popup = function (text, ms) {
    buildHud(); H.popup.textContent = text; H.popup.style.opacity = 1;
    clearTimeout(popupTimer); popupTimer = setTimeout(() => { H.popup.style.opacity = 0; }, ms || 2200);
  };
  // Pager message (mission text). ms 0 = stays until replaced or cleared with X.pager('').
  X.pager = function (text, ms) {
    buildHud();
    if (!text) { H.pager.hidden = true; return; }
    H.pager.hidden = false; H.pager.textContent = text;
    clearTimeout(pagerTimer);
    if (ms !== 0) pagerTimer = setTimeout(() => { H.pager.hidden = true; }, ms || Math.max(4000, text.length * 70));
    if (PG.audio.kit()) { const k = PG.audio.kit(); k.tone('square', 1760, k.now, 0.06, 0.05, { lp: 3000 }); k.tone('square', 1760, k.now + 0.1, 0.06, 0.05, { lp: 3000 }); }
  };
  let lastDistrict = '';
  X.hud = function (g) {
    if (!X.active) return;
    buildHud();
    const p = P.ped, c = P.car;
    H.shownMoney += (P.money - H.shownMoney) * 0.2; if (Math.abs(P.money - H.shownMoney) < 1) H.shownMoney = P.money;
    setT(H.money, 'money', '$' + String(Math.round(H.shownMoney)).padStart(8, '0'));
    const hpw = Math.max(0, Math.round(p.hp / p.maxHp * 100)) + '%'; if (H.cache.hp !== hpw) { H.cache.hp = hpw; H.hp.style.width = hpw; }
    const ar = Math.round(p.armor || 0); if (H.cache.ar !== ar) { H.cache.ar = ar; H.armorBar.hidden = ar <= 0; H.armor.style.width = ar + '%'; }
    const ch = c ? Math.max(0, Math.round(c.hp / c.maxHp * 100)) : -1; if (H.cache.ch !== ch) { H.cache.ch = ch; H.carBar.hidden = ch < 0; if (ch >= 0) H.car.style.width = ch + '%'; }
    const W = X.WEAPONS && X.WEAPONS[P.weapon];
    setT(H.wname, 'wn', W ? W.name : P.weapon === 'fists' ? 'Fists' : P.weapon);
    const am = P.inv[P.weapon]; setT(H.ammo, 'am', am == null || am === Infinity ? '' : String(am));
    const wl = Math.round(P.wanted || 0); if (H.cache.wl !== wl) { H.cache.wl = wl; H.stars.forEach((s, i) => s.classList.toggle('on', i < wl)); }
    const fl = !!P.wantedFlash; if (H.cache.fl !== fl) { H.cache.fl = fl; H.wanted.classList.toggle('flash', fl); }
    const lt = P.loot ? 'LOOT $' + P.loot : ''; if (H.cache.lt !== lt) { H.cache.lt = lt; H.loot.hidden = !lt; H.loot.textContent = lt; }
    const mins = Math.floor(X.clock) % 1440; setT(H.clock, 'clk', String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0'));
    const hint = currentHint(); if (H.cache.hint !== hint) { H.cache.hint = hint; H.hint.hidden = !hint; H.hint.textContent = hint; }
    const dn = X.scene ? X.scene.name || '' : X.districtAt(p.x, p.y);
    if (dn !== lastDistrict) { lastDistrict = dn; H.district.textContent = dn; H.district.style.opacity = 1; clearTimeout(districtTimer); districtTimer = setTimeout(() => { H.district.style.opacity = 0; }, 2600); }
    drawMap();
    hook('hud', g);
    X.blips.length = 0;
  };
  // The map's streets, blocks and places, drawn once per city and scale (fast renderer).
  const mapCache = {};
  function mapBase(c, C, f, range) {
    c.fillStyle = '#5b606c'; c.fillRect(-8, -8, C.W + 16, C.H + 16);
    for (const b of C.blocks) { if (f && (Math.abs((b.x0 + b.x1) / 2 - f.x) > range * 1.5 || Math.abs((b.y0 + b.y1) / 2 - f.y) > range * 1.5)) continue; c.fillStyle = b.kind === 'park' ? '#1f3b27' : b.kind === 'plaza' ? '#3b3733' : '#1a1d24'; c.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); }
    for (const id in X.places) { const pl = X.places[id], b = pl.b; c.fillStyle = pl.color; c.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0); }
  }
  function staticMap(C, sc) {
    const key = sc.toFixed(4), sig = Object.keys(X.places).map(id => X.places[id].color).join();
    let m = mapCache[key];
    if (m && m.city === C && m.sig === sig) return m;
    const pad = 12, cv = document.createElement('canvas');
    cv.width = Math.ceil((C.W + 2 * pad) * sc); cv.height = Math.ceil((C.H + 2 * pad) * sc);
    const g = cv.getContext('2d'); g.setTransform(sc, 0, 0, sc, pad * sc, pad * sc); mapBase(g, C);
    return (mapCache[key] = { cv, pad, sc, city: C, sig });
  }
  function drawMap() {
    const cv = H.map, c = cv.getContext('2d'), S = cv.width, C = X.city, f = X.focus();
    const big = X.input.down('Tab');
    const range = big ? 700 : 260, sc = S / 2 / range * (big ? 1 : 1);
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, S, S);
    c.fillStyle = '#0d0f14'; c.fillRect(0, 0, S, S);
    const rot = X.lastView ? X.lastView.rot : 0;
    c.save(); c.translate(S / 2, S / 2); c.rotate(rot); c.scale(sc, sc); c.translate(-f.x, -f.y);
    if ((PG.settings || {}).fastRender && PG.renderCaps && PG.renderCaps.minimap) { const m = staticMap(C, sc); c.drawImage(m.cv, -m.pad, -m.pad, m.cv.width / m.sc, m.cv.height / m.sc); }
    else mapBase(c, C, f, range);
    const r = 1 / sc;
    for (const b of X.blips) {
      c.fillStyle = b.color; c.beginPath();
      let bx = b.x, by = b.y;
      if (b.edge) { const dx = bx - f.x, dy = by - f.y, d = Math.hypot(dx, dy), lim = range * 0.92; if (d > lim) { bx = f.x + dx / d * lim; by = f.y + dy / d * lim; } }
      const sz = (b.size || 4) * r * 2;
      if (b.shape === 'square') c.fillRect(bx - sz, by - sz, sz * 2, sz * 2); else { c.arc(bx, by, sz, 0, TAU); c.fill(); }
      if (b.ring) { c.strokeStyle = b.color; c.lineWidth = 2 * r; c.beginPath(); c.arc(bx, by, sz * 1.8, 0, TAU); c.stroke(); }
    }
    c.restore();
    // player arrow
    const th = (P.car ? P.car.th : P.ped.th) + rot;
    c.save(); c.translate(S / 2, S / 2); c.rotate(th + Math.PI / 2);
    c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -12); c.lineTo(8, 9); c.lineTo(0, 4); c.lineTo(-8, 9); c.closePath(); c.fill(); c.stroke();
    c.restore();
  }

  // ================= lifecycle =================
  X.persist = (function () { let t = null; return function () { clearTimeout(t); t = setTimeout(() => { try { PG.local.save(PG.ui.state()); } catch (e) { /* storage blocked */ } }, 800); }; })();
  X.start = function (def) {
    const g = G();
    hookCanvas(); buildHud();
    X.active = true; X.def = def;
    X.cars = []; X.peds = []; X.lights = []; X.blips = []; X.floats = []; X.decals = []; X.objectives = []; X.trafficRules = []; X.uid = 0; X.time = 0; X.clock = 21 * 60 + 30;
    X.scene = null; X.interactions = [];
    const st = PG.ui.state(); st.gta = st.gta || {}; X.save = st.gta;
    const seed = 1 + Math.floor(Math.random() * 2147483000);
    const L = PG.buildCity(PG.derive(PG.carById('x5')), seed, { traffic: false });
    X.city = L.city; X.city.agents = X.cars;
    const R = (() => { let s = seed % 2147483647; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    X.districtNames = DISTRICTS.slice().sort(() => R() - 0.5);
    X.places = makePlaces(R);
    // modules that rebuild a block of the new city (rooms_military.js's compounds) and add places of their own
    for (const f of X.worldHooks) { try { f(X.city, R, X.places); } catch (e) { console.error('[gta] world hook failed:', e); } }
    X.skid = PG.makeCitySkid();
    Object.assign(P, { loot: 0, car: null, money: X.save.money || 0, wanted: 0, wantedFlash: false, state: 'play', stateT: 0, inv: { fists: Infinity }, weapon: 'fists', entering: null, kills: 0, seatT: 0 });
    P.ped = null;
    const home = X.places.hideout || X.places.bank;
    newPlayerPed(home.door.x + home.door.nx * 1.4, home.door.y + home.door.ny * 1.4, Math.atan2(home.door.ny, home.door.nx));
    X.cam.x = P.ped.x; X.cam.y = P.ped.y; X.cam.span = 27; X.cam.yaw = -Math.PI / 2;
    Object.assign(g, { mode: 'gta', L, city: X.city, particles: [], shake: 0, status: 'play', skid: X.skid, def, veh: null, crashed: false, ctl: null, cam: null, time: 0, drift: { combo: 0, mult: 1, bank: 0 } });
    // a getaway car waiting at the kerb outside the garage
    const fp = X.nearestRoadPoint(home.door.x + home.door.nx * 6, home.door.y + home.door.ny * 6);
    const C = X.city;
    let parkedX5 = null;
    if (fp.horiz) { const y = C.ys[fp.idx] + Math.sign(home.door.y - C.ys[fp.idx] || 1) * (C.wy[fp.idx] / 2 + 0.55); parkedX5 = X.makeCar('x5', home.door.x + 4, y, home.door.y > C.ys[fp.idx] ? 0 : Math.PI, { color: '#1f4f9c' }); }
    else { const x = C.xs[fp.idx] + Math.sign(home.door.x - C.xs[fp.idx] || 1) * (C.wx[fp.idx] / 2 + 0.55); parkedX5 = X.makeCar('x5', x, home.door.y + 4, home.door.x > C.xs[fp.idx] ? -Math.PI / 2 : Math.PI / 2, { color: '#1f4f9c' }); }
    if (parkedX5 && (PG.cityNear(C, parkedX5.x, parkedX5.y, 4).some(s => PG.overlap(X.carPoly(parkedX5), s.poly)))) X.removeCar(parkedX5);
    X.input.clear();
    hook('init');
    manageTraffic(); for (let k = 0; k < 40; k++) manageTraffic();
    X.cars = X.cars.filter(c => !c.removed); X.city.agents = X.cars;
    X.popup(def.name); lastDistrict = '';
    X.emit('start', {});
  };
  X.stop = function () {
    if (!X.active) return;
    hook('stop');
    X.active = false; X.scene = null;
    { const cv = document.getElementById('game'); if (cv) cv.style.cursor = ''; if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); }
    PG.audio.stopLoops();
    if (H) { H.pager.hidden = true; H.big.hidden = true; }
  };

  X.tick = function (dt) {
    if (!X.active) return;
    dt = Math.min(dt, 0.05);
    const g = G();
    X.time += dt; g.time = X.time;
    X.clock = (X.clock + dt * 2) % 1440;
    if (P.state === 'play') {
      if (X.input.anyPressed('KeyF', 'Enter') && !P.entering) handleUse();
      if (P.car && X.input.pressed('KeyC')) { X.cam.mode = X.cam.mode === 'fixed' ? 'follow' : 'fixed'; X.popup(X.cam.mode === 'follow' ? 'Camera: follow car' : 'Camera: fixed north'); }
      if (X.input.pressed('KeyH') && P.car) { PG.audio.honk(0); X.emit('horn', { car: P.car }); }
    } else {
      P.stateT += dt;
      if (P.stateT > 3.4) X.respawn(P.state);
    }
    if (!P.car) footControl(dt);
    else { P.ped.x = P.car.x; P.ped.y = P.car.y; P.ped.th = P.car.th; }
    pathTraffic(dt);
    hook('tick', dt);
    stepPhysCars(dt);
    carPedHits();
    if (P.car) { P.ped.x = P.car.x; P.ped.y = P.car.y; P.ped.vx = P.car.dv ? P.car.dv.vx : 0; P.ped.vy = P.car.dv ? P.car.dv.vy : 0; }
    tyreFx(dt);
    if (!P.car) { PG.audio.squeal(0); }
    for (const p of X.peds) if (p.dead) p.deadT += dt;
    if (P.loot > 0 && P.state === 'play' && !X.scene) for (const id of ['hideout', 'apartment']) {
      const pl = X.places[id]; if (!pl) continue;
      const pos = X.playerPos();
      X.blip(pl.door.x, pl.door.y, '#7dff9a', { edge: true, size: 4, shape: 'square' });
      if (Math.hypot(pos.x - pl.door.x, pos.y - pl.door.y) < (P.car ? 7 : 2.5)) {
        const n = P.loot; P.loot = 0; X.money(n, 'loot', pos.x, pos.y); X.big('$' + n, '#7dff9a', 1800, 'stashed at ' + pl.name); X.emit('lootBanked', { amount: n, place: pl });
      }
    }
    X.objectives.length = 0;
    manageTraffic();
    for (const f of X.floats) f.t += dt;
    X.floats = X.floats.filter(f => f.t < f.life);
    if (X.cars.some(c => c.removed)) { X.cars = X.cars.filter(c => !c.removed); X.city.agents = X.cars; }
    if (X.peds.some(p => p.removed)) X.peds = X.peds.filter(p => !p.removed);
    endFrameInput();
  };

  PG.GTA_DEF = {
    id: 'GTA', mode: 'gta', name: 'Grand Theft Bus', zone: 'Free roam',
    intro: 'A whole city that nobody planned, at night. Steal anything with wheels, answer the ringing phones for work, and stay off the police radio. Or do not.',
    goal: 'WASD move · F get in or out / doors · Mouse or Ctrl (or Space on foot) fires · Q/E or 1-9 weapons · Shift sprint / full throttle · Space handbrake · H horn · C camera · hold Tab for the big map',
    introLines: [
      'Well, well. The menace who wrecked my car park.',
      'I have a new business now. It does not involve parking.',
      'The phones on the street ring for you. Answer them.',
      'Steal what I ask for. Drive how you drive. Stay off the police radio.',
      'And the bank on Bank Row? Do not think about the bank. Yet.',
      'Here. Take the bus. Or anything else with wheels.',
    ],
  };
})(typeof window !== 'undefined' ? (window.PG = window.PG || {}) : (globalThis.PG = globalThis.PG || {}));
