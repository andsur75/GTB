// Car doors for Grand Theft Bus. Every vehicle has real doors, laid out per model: two or four swing doors
// on cars, a crew cab on pickups and the fire truck, cab doors plus a sliding side door and rear barn doors
// on the box van, rear doors on the ambulance, SWAT van and Securicar, folding doors on the bus and a turret
// hatch on the tank. They swing open and shut when people get in and out (core's 'doorOpen' / 'doorClose'
// events; this module answers with how long core should wait), get yanked open in a carjack and fly open
// when you bail. Crashes break the locks: a broken door swings from the car's own motion in its frame
// (braking, accelerating, cornering, yaw, the wind and the road), bounces off its stop and slams against the
// frame without catching; hard hits and blasts tear doors off into debris that lies in the road and gets
// shoved about. Drawn over the car whatever renders it: the dark door opening with the seat, the panel in the
// car's colour with its window, mirror and shadow, an interior light at night. Pay 'n' Spray restores them.
// Owns X.doors.
(function (PG) {
  if (typeof document === 'undefined') return;
  const X = PG.gta;
  if (!X) return;
  const { cl, rand, TAU, wrap } = X.util;
  const P = X.player;
  const OPEN = 1.12, MAX = 1.3;              // rad: a person-sized opening; the hinge stop (~75 deg)
  const BREAK_AT = 6, TEAR_AT = 14;          // impact speed (m/s) that pops a lock near the hit / rips a door off
  const SHOCK_AT = 9;                        // ... that may spring any lock on the car (the body bends)
  const DAMP = 1.7;                          // hinge friction (1/s)
  const debris = [];
  const stats = { opened: 0, closed: 0, latched: 0, slams: 0, broken: 0, torn: 0 };
  const opts = { parkedOpen: 0.05, debrisLife: 60, road: 1 };   // road: how much the road shakes loose doors
  const low = () => !!(PG.settings && PG.settings.detail === 'low');

  const toW = (c, x, y) => { const cs = Math.cos(c.th), sn = Math.sin(c.th); return { x: c.x + cs * x - sn * y, y: c.y + sn * x + cs * y }; };
  const toL = (c, x, y) => { const cs = Math.cos(c.th), sn = Math.sin(c.th), dx = x - c.x, dy = y - c.y; return { x: dx * cs + dy * sn, y: -dx * sn + dy * cs }; };
  const SH = {};
  function shade(hex, k) {
    const key = hex + k; if (SH[key]) return SH[key];
    const n = parseInt(String(hex).slice(1), 16);
    if (!(n >= 0)) return (SH[key] = hex);
    const f = v => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
    return (SH[key] = `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`);
  }

  // ================= layouts =================
  // A door: {i, kind: swing|rear|slide|fold|hatch, side (-1 left, 1 right), hx, hy (hinge, car-local m from
  // the body centre, x forward, y right), len, max, role: front|rear|crew|side|cargo|mid|hatch, mirror,
  // a (opening: rad, or 0..1 for slide/fold), w (its rate), mode: shut|anim|hold|free|gone, lock (intact),
  // detached, noLatch (s before it may catch again), seatX (where the seat behind it is)}.
  function layout(c) {
    const m = c.model || {}, k = m.kind, L = c.len, W = c.wid, hl = L / 2, hw = W / 2, def = c.def;
    const mid = def ? X.carMid(def) : 0, wb = def ? def.wb : L * 0.6, fA = def ? def.wb - mid : L * 0.28;
    const D = [];
    const add = o => { const d = Object.assign({ i: D.length, a: 0, w: 0, mode: 'shut', lock: true, detached: false, noLatch: 0, max: MAX }, o); if (d.seatX == null) d.seatX = d.hx - d.len * 0.6; D.push(d); return d; };
    const pair = (hx, len, o) => [-1, 1].map(s => add(Object.assign({ kind: 'swing', side: s, hx, hy: s * hw, len }, o)));
    if (k === 'tank') add({ kind: 'hatch', side: -1, hx: -0.45, hy: 0.42, len: 0.34, max: Math.PI * 0.94, role: 'hatch' });
    else if (k === 'bus') {   // passenger doors on the kerb side, and the driver's own little door
      add({ kind: 'fold', side: 1, hx: hl - 0.35, hy: hw, len: 1.25, max: 1, role: 'front' });
      add({ kind: 'fold', side: 1, hx: 0.35, hy: hw, len: 1.25, max: 1, role: 'mid' });
      add({ kind: 'swing', side: -1, hx: hl - 0.55, hy: -hw, len: 0.85, role: 'driver', mirror: true, seatX: hl - 1.0 });
    } else if (m.box) {
      const h = L * 0.36, len = Math.min(1.12, L * 0.16);
      pair(h, len, { role: 'front', mirror: true });
      if (k === 'fire') pair(h - len - 0.07, len * 0.92, { role: 'crew' });
      if (k === 'van') add({ kind: 'slide', side: 1, hx: L * 0.2 - 0.15, hy: hw, len: 1.3, max: 1, role: 'side', seatX: L * 0.2 - 0.8 });
      if (k !== 'fire') [-1, 1].forEach(s => add({ kind: 'rear', side: s, hx: -hl, hy: s * hw, len: hw - 0.02, max: 1.75, role: 'cargo', seatX: -hl + 0.6 }));
    } else if (m.id === 'rancher') {   // pickup: the cab sits forward of the bed; regular or crew cab
      const h = fA - 0.42;
      if (c.id % 3 === 0) pair(h, 1.25, { role: 'front', mirror: true });
      else { pair(h, 1.06, { role: 'front', mirror: true }); pair(h - 1.13, 0.82, { role: 'rear' }); }
    } else {
      const h = fA - 0.15 * wb;
      if (m.id === 'bambino' || k === 'sports') pair(h, 0.52 * wb, { role: 'front', mirror: true });
      else { pair(h, 0.39 * wb, { role: 'front', mirror: true }); pair(h - 0.39 * wb - 0.07, 0.33 * wb, { role: 'rear', seatX: h - 0.39 * wb - 0.07 - 0.33 * wb * 0.5 }); }
    }
    return D;
  }
  function doorsOf(c) {
    if (c.doors) return c.doors;
    const D = c.doors = layout(c);
    c._dEnt = null;
    // now and then a parked car with a door left open: somebody loading the shopping
    if (c.ctrl === 'parked' && !c.npcDriver && !c.driver && !c.owner && !c.keep && !c.wrecked && X.time > 0.5 && Math.random() < opts.parkedOpen) {
      const cands = D.filter(d => d.kind === 'swing' || d.kind === 'rear' || d.kind === 'slide');
      const d = cands[Math.floor(Math.random() * cands.length)];
      if (d) { d.a = d.kind === 'swing' ? rand(0.8, 1.15) : d.kind === 'rear' ? rand(1.2, 1.6) : 1; d.mode = 'hold'; c.dShop = { d, n: 1 + Math.floor(Math.random() * 3), seed: Math.random() * 100 }; }
    }
    return D;
  }
  // How the driver gets in from each side: {side, door, stand (beside it, clear of its swing), seat, via?
  // (the other seat, to climb across), any? (either side is as good)}; spot[] = where occupants step out.
  function entries(c) {
    const D = doorsOf(c);
    if (c._dEnt && c._dEnt.D === D) return c._dEnt;
    const hw = c.wid / 2, hl = c.len / 2, k = c.model && c.model.kind, E = { D, l: null, r: null, spot: [null, null] };
    if (k === 'tank') {
      const h = D[0], seat = { x: -0.75, y: 0.42 };
      E.l = { side: -1, any: true, door: h, stand: { x: -0.3, y: -(hw + 0.45) }, via: { x: -0.3, y: -(hw - 0.6) }, seat, climb: true };
      E.r = { side: 1, any: true, door: h, stand: { x: -0.3, y: hw + 0.45 }, via: { x: -0.3, y: hw - 0.6 }, seat, climb: true };
      E.spot = [E.l.stand, E.r.stand];
    } else if (k === 'bus') {   // either way in: the driver's door, or up the steps at the front door
      const f = D[0], m = D[1], dd = D[2], fx = f.hx - f.len / 2, mx = m.hx - m.len / 2, seat = { x: hl - 1.0, y: -(hw - 0.62) };
      E.l = { side: -1, any: true, door: dd, stand: { x: dd.hx - dd.len + 0.03, y: -(hw + 0.55) }, seat };
      E.r = { side: 1, any: true, door: f, stand: { x: fx, y: hw + 0.55 }, via: { x: fx, y: hw - 0.62 }, seat };
      E.spot = [E.l.stand, { x: mx, y: hw + 0.55 }];
    } else {
      const fl = D.find(d => d.role === 'front' && d.side < 0), fr = D.find(d => d.role === 'front' && d.side > 0);
      if (fl && fr) {
        const sy = hw - Math.max(0.42, c.wid * 0.24), stand = d => ({ x: d.hx - d.len + 0.03, y: d.side * (hw + 0.55) });
        E.l = { side: -1, door: fl, stand: stand(fl), seat: { x: fl.seatX, y: -sy } };
        E.r = { side: 1, door: fr, stand: stand(fr), seat: { x: fl.seatX, y: -sy }, via: { x: fr.seatX, y: sy } };
        E.spot = [E.l.stand, E.r.stand];
      }
    }
    return (c._dEnt = E);
  }

  // ================= sound =================
  let fx = 0, fy = 0;
  function voice(x, y, range) {
    const k = PG.audio.kit(); if (!k) return null;
    const d = Math.hypot(x - fx, y - fy), vol = 1 / (1 + (d / range) * (d / range));
    if (vol < 0.04) return null;
    let dest = k.master;
    if (k.ctx.createStereoPanner) { const p = k.ctx.createStereoPanner(); p.pan.value = cl((x - fx) / 30, -0.8, 0.8); p.connect(k.master); dest = p; }
    return { k, t: k.now, dest, vol };
  }
  function sfx(c, kind, loud, x, y) {
    if (!X.active) return;
    const last = c ? (c._dsfx || (c._dsfx = {})) : {};
    if (c && last[kind] && X.time - last[kind] < 0.09) return;
    if (c) last[kind] = X.time;
    const s = voice(x != null ? x : c.x, y != null ? y : c.y, 14); if (!s) return;
    const { k, t, dest } = s, v = s.vol * (loud == null ? 1 : cl(loud, 0.15, 1.4)) * 0.8;
    switch (kind) {
      case 'creak':   // handle click, then the hinge
        k.noise(t, 0.025, 0.05 * v, 'highpass', 2600, { dest });
        k.tone('triangle', 330, t + 0.03, 0.2, 0.014 * v, { to: 520, lp: 1500, vib: [9, 14], dest });
        break;
      case 'yank':
        k.noise(t, 0.02, 0.09 * v, 'highpass', 2400, { dest });
        k.noise(t + 0.015, 0.13, 0.07 * v, 'bandpass', 1100, { to: 420, Q: 1.3, dest });
        k.tone('sine', 160, t + 0.11, 0.07, 0.07 * v, { to: 90, dest });
        break;
      case 'thunk':
        k.noise(t, 0.1, 0.2 * v, 'lowpass', 750, { to: 140, dest });
        k.tone('sine', 110, t, 0.1, 0.15 * v, { to: 52, dest });
        k.noise(t + 0.01, 0.018, 0.05 * v, 'highpass', 3800, { dest });
        break;
      case 'slam':   // the frame, no latch: a hollow bang and a rattle
        k.noise(t, 0.12, 0.24 * v, 'lowpass', 1000, { to: 180, dest });
        k.tone('square', 190, t, 0.06, 0.035 * v, { to: 120, lp: 900, dest });
        k.noise(t + 0.04, 0.12, 0.05 * v, 'bandpass', 2400, { Q: 4, dest });
        break;
      case 'stop':
        k.tone('sine', 150, t, 0.07, 0.07 * v, { to: 92, dest });
        k.noise(t, 0.05, 0.05 * v, 'lowpass', 520, { dest });
        break;
      case 'tear':
        k.noise(t, 0.32, 0.18 * v, 'bandpass', 2600, { to: 520, Q: 2.2, dest });
        k.tone('square', 270, t, 0.2, 0.04 * v, { to: 85, lp: 1300, dest });
        break;
      case 'clatter':
        k.noise(t, 0.14, 0.11 * v, 'bandpass', 1500, { Q: 1.6, dest });
        k.tone('triangle', 520, t, 0.05, 0.02 * v, { to: 300, dest });
        break;
      case 'hiss':   // bus doors are pneumatic
        k.noise(t, 0.5, 0.07 * v, 'highpass', 3000, { attack: 0.04, dest });
        k.tone('sine', 880, t + 0.02, 0.05, 0.012 * v, { dest });
        break;
      case 'slide':
        k.noise(t, 0.42, 0.06 * v, 'bandpass', 650, { to: 480, Q: 3, attack: 0.05, dest });
        k.noise(t + 0.4, 0.06, 0.12 * v, 'lowpass', 600, { dest });
        break;
      case 'hatch':
        k.tone('square', 230, t, 0.07, 0.035 * v, { to: 140, lp: 1500, dest });
        k.noise(t, 0.09, 0.1 * v, 'lowpass', 900, { dest });
        break;
    }
  }

  // ================= opening, closing =================
  // The swing angle the street allows here (walls, cars), so a door never opens through a lamp post.
  function roomFor(c, d, want) {
    if (d.kind !== 'swing') return want;
    let ok = 0;
    for (let i = 1; i <= 5; i++) {
      const a = want * i / 5, ux = -Math.cos(a), uy = d.side * Math.sin(a), e = toW(c, d.hx + ux * d.len, d.hy + uy * d.len), m = toW(c, d.hx + ux * d.len * 0.55, d.hy + uy * d.len * 0.55);
      if (X.blocked(e.x, e.y, 0.06) || X.blocked(m.x, m.y, 0.06) || hitsCar(c, e.x, e.y)) return Math.max(0.25, ok + want * 0.1);   // stopped by it
      ok = a;
    }
    return want;
  }
  function hitsCar(c, x, y) {
    for (const o of X.cars) if (o !== c && !o.removed && Math.abs(o.x - x) < o.len / 2 + 0.5 && Math.abs(o.y - y) < o.len / 2 + 0.5 && PG.pointInPoly({ x, y }, X.carPoly(o))) return true;
    return false;
  }
  function soundOf(d, fast) { return d.kind === 'fold' ? 'hiss' : d.kind === 'slide' ? 'slide' : d.kind === 'hatch' ? 'hatch' : fast ? 'yank' : 'creak'; }
  // Open d (animated). then: what it does when open: 'hold' (held there) or 'free' (left to swing).
  // Returns how long until a person fits through.
  function openDoor(c, d, o) {
    o = o || {};
    if (!d || d.detached) return 0;
    const fast = !!o.fast, want = o.to != null ? o.to : d.kind === 'swing' ? OPEN + (fast ? 0.1 : 0) : d.kind === 'rear' ? 1.6 : d.max;
    const to = roomFor(c, d, want);
    d.busy = !!o.busy; d.wob = 0;
    if (d.mode === 'anim' && d.anim.to >= to - 0.01) { d.anim.then = o.then || d.anim.then; return Math.max(0, d.anim.dur - d.anim.t) * 0.7; }
    if (d.a >= to * 0.85 && d.mode !== 'anim') { d.mode = o.then || 'hold'; d.w = 0; return 0; }
    const dur = fast ? (d.kind === 'swing' || d.kind === 'rear' ? 0.13 : 0.24) : d.kind === 'fold' ? 0.32 : d.kind === 'slide' ? 0.45 : d.kind === 'hatch' ? 0.38 : 0.3;
    d.mode = 'anim'; d.anim = { from: d.a, to, t: 0, dur, then: o.then || 'hold', fast };
    stats.opened++;
    sfx(c, soundOf(d, fast), fast ? 1.1 : 0.8);
    return dur * (d.kind === 'swing' ? 0.72 : 0.8);
  }
  function closeDoor(c, d) {
    if (!d || d.detached || d.mode === 'gone') return;
    d.busy = false;
    if (d.a < 0.02 && d.mode === 'shut') return;
    d.mode = 'anim'; d.anim = { from: d.a, to: 0, t: 0, dur: d.kind === 'fold' ? 0.4 : d.kind === 'slide' ? 0.42 : 0.16 + 0.1 * Math.min(1.5, d.a), then: 'latch' };
    stats.closed++;
    if (d.kind === 'fold' || d.kind === 'slide') sfx(c, soundOf(d), 0.8);
  }
  function shut(c, d, loud) {
    d.mode = 'shut'; d.a = 0; d.w = 0; d.wob = 0; stats.latched++;
    sfx(c, d.kind === 'hatch' ? 'hatch' : 'thunk', loud);
  }
  function breakLock(c, d, kick) {
    if (!d || d.detached || d.kind === 'hatch') return false;
    const was = d.lock;
    d.lock = false; d.noLatch = 0;
    if (d.kind === 'fold') { d.mode = 'hold'; d.a = Math.max(d.a, rand(0.15, 0.35)); return was; }
    if (d.mode === 'shut' || d.mode === 'hold') d.mode = 'free';
    if (d.mode === 'free') d.w += kick || 0;
    if (was) stats.broken++;
    return was;
  }
  // Rip d off: it becomes debris with the car's velocity plus a shove (vx, vy).
  function tear(c, d, vx, vy) {
    if (!d || d.detached || d.kind === 'hatch' || d.kind === 'fold') return null;
    const u = dirOf(d, d.a), mx = d.hx + u.x * d.len / 2, my = d.hy + u.y * d.len / 2, w = toW(c, mx, my), v = X.carVel(c);
    d.detached = true; d.mode = 'gone'; d.lock = false; d.busy = false;
    stats.torn++;
    // a shove into the body (a blast on this side) bounces off it: the door flies off outwards, never through the car
    const cs = Math.cos(c.th), sn = Math.sin(c.th), nx = d.kind === 'rear' ? -cs : -sn * d.side, ny = d.kind === 'rear' ? -sn : cs * d.side;
    let sx = vx || 0, sy = vy || 0; const dn = sx * nx + sy * ny;
    if (dn < 0) { sx -= 1.6 * dn * nx; sy -= 1.6 * dn * ny; }
    sx += nx * 1.2; sy += ny * 1.2;
    const b = { x: w.x + nx * 0.12, y: w.y + ny * 0.12, z: 0.5, vx: v.x + sx, vy: v.y + sy, vz: rand(2.5, 4.5) + Math.min(4, Math.hypot(sx, sy) * 0.2), th: c.th + Math.atan2(u.y, u.x), w: rand(-9, 9), len: d.len, kind: d.kind, color: c.color, charred: !!c.wrecked, police: c.model && c.model.kind === 'police', mirror: !!d.mirror, side: d.side, inner: Math.random() < 0.4, t: 0, life: opts.debrisLife };
    debris.push(b); if (debris.length > 28) debris.shift();
    sfx(c, 'tear', 1);
    if (X.inView(w.x, w.y, 6)) PG.burst(w.x, w.y, 'spark', 10, 7, 0.4, 0.1);
    return b;
  }
  function dirOf(d, a) {   // unit vector from the hinge along the door (car-local)
    if (d.kind === 'rear') return { x: -Math.sin(a), y: -d.side * Math.cos(a) };
    if (d.kind === 'slide' || d.kind === 'fold') return { x: -1, y: 0 };
    return { x: -Math.cos(a), y: d.side * Math.sin(a) };
  }
  function rock(c, k) { if (c && !c.wrecked) { c.hopT = X.time; c.hopA = -(k || 0.07); } }   // damage.js draws the bounce
  function pickDoor(c, side, l) {
    let best = null, bd = Infinity;
    for (const d of doorsOf(c)) {
      if (d.detached || d.kind === 'hatch' || (side && d.side !== side && d.kind !== 'fold')) continue;
      const dd = (l ? Math.hypot(d.seatX - l.x, d.side * c.wid / 2 - l.y) : Math.abs(d.seatX)) + (d.a > 0.5 ? 3 : 0) + (d.role === 'cargo' ? 2 : 0);
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  }

  // ================= physics =================
  // How the car moves this frame, in its own frame: acceleration of the CG (ax forward, ay right), yaw rate
  // r and yaw acceleration rd, forward speed uf. Doors feel the opposite (they lag behind).
  function motion(c, dt) {
    let vx = 0, vy = 0, r = 0, cg = 0;
    if (c.dv) { vx = c.dv.vx; vy = c.dv.vy; r = c.dv.r; cg = c.dv.dyn.b - X.carMid(c.def); }
    else if (c.ctrl === 'path') { vx = Math.cos(c.th) * c.v; vy = Math.sin(c.th) * c.v; r = c._dth != null ? wrap(c.th - c._dth) / dt : 0; }
    c._dth = c.th;
    let M = c._dm;
    if (!M) M = c._dm = { vx, vy, r, ax: 0, ay: 0, rd: 0, cg, uf: 0, sp: 0 };
    const ax = (vx - M.vx) / dt, ay = (vy - M.vy) / dt, cs = Math.cos(c.th), sn = Math.sin(c.th);
    M.ax = cl(ax * cs + ay * sn, -400, 400); M.ay = cl(-ax * sn + ay * cs, -400, 400); M.rd = cl((r - M.r) / dt, -80, 80);
    M.vx = vx; M.vy = vy; M.r = r; M.cg = cg; M.uf = vx * cs + vy * sn; M.sp = Math.hypot(vx, vy);
    return M;
  }
  function physStep(c, d, M, dt) {
    if ((d.kind === 'fold' || d.kind === 'hatch') && d.lock && d.noLatch <= 0) return closeDoor(c, d);   // pneumatic / a lid: it just shuts
    if (M.sp > 2 && Math.random() < dt * M.sp * 0.05 * opts.road) d.w += rand(0.4, 1.6) * (d.kind === 'slide' ? 0.3 : 1);   // a bump in the road
    const rx = d.hx - M.cg, ry = d.hy, r2 = M.r * M.r;
    const Ax = M.ax - M.rd * ry - r2 * rx, Ay = M.ay + M.rd * rx - r2 * ry;   // the hinge's acceleration
    const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n, sp = Math.min(M.sp, 30) * opts.road;
    for (let s = 0; s < n; s++) {
      let acc;
      if (d.kind === 'slide') acc = -Ax / (d.len * 0.95) - 2.5 * d.w + (Math.random() - 0.5) * sp * 0.8;
      else if (d.kind === 'fold' || d.kind === 'hatch') { acc = -12 * (d.a - (d.kind === 'fold' ? 0.25 : 0)) - 4 * d.w + (Math.random() - 0.5) * sp * 2; }
      else {
        const ca = Math.cos(d.a), sa = Math.sin(d.a), rear = d.kind === 'rear';
        const ux = rear ? -sa : -ca, uy = rear ? -d.side * ca : d.side * sa;
        // a hinged bar: phi'' = 1.5/len * (u x -A) - yaw accel; a = -side * phi
        acc = -d.side * (1.5 / d.len * (ux * -Ay + uy * Ax) - M.rd) - DAMP * d.w;
        // the wind shuts a front-hinged door going forwards (opens it in reverse) and drags barn doors open
        acc += rear ? 0.01 * M.uf * Math.abs(M.uf) * ca : -0.022 * M.uf * Math.abs(M.uf) * sa / d.len;
        acc += (Math.random() - 0.5) * sp * 5;   // the road
      }
      d.w += acc * h; d.a += d.w * h;
      const top = d.kind === 'slide' || d.kind === 'fold' ? 1 : d.max;
      if (d.a > top) { d.a = top; if (d.w > 0) { if (d.w > 2.5) sfx(c, 'stop', d.w / 9); d.w *= -0.3; } }
      if (d.a < 0) {
        if (d.w < -0.6 && d.lock && d.noLatch <= 0) { shut(c, d, Math.min(1.4, -d.w / 5)); return; }
        if (d.w < -0.35) { if (d.w < -1.5) { sfx(c, 'slam', -d.w / 7); stats.slams++; } d.w *= -0.38; }
        else if (d.lock && d.noLatch <= 0) { d.mode = 'shut'; d.a = 0; d.w = 0; return; }   // eased to: the latch catches quietly
        else d.w = 0;
        d.a = 0;
      }
    }
  }
  function doorTick(c, d, M, dt) {
    if (d.noLatch > 0) d.noLatch -= dt;
    if (d.mode === 'anim') {
      const A = d.anim; A.t += dt;
      const k = Math.min(1, A.t / A.dur), opening = A.to >= A.from;
      const f = opening ? (A.fast ? 1 - Math.pow(1 - k, 3) : k * k * (3 - 2 * k)) : k * k;   // shutting accelerates into the frame
      const prev = d.a;
      d.a = A.from + (A.to - A.from) * f; d.w = (d.a - prev) / Math.max(dt, 1e-3);
      if (k >= 1) {
        if (A.then === 'latch') { if (d.lock) shut(c, d, 1); else { d.mode = 'free'; d.a = 0.03; d.w = rand(1.2, 2.2); sfx(c, 'slam', 0.8); stats.slams++; } }
        else if (A.then === 'free') d.mode = 'free';
        else { d.mode = 'hold'; d.w = 0; if (A.fast && d.kind !== 'fold') d.wob = 1; }
      }
      return;
    }
    if (d.mode === 'hold') {
      if (d.wob > 0) d.wob = Math.max(0, d.wob - dt * 2.6);   // bounced off the stop after a yank
      if (!d.busy && (M.sp > 1.2 || Math.abs(M.ax) > 25)) { d.mode = d.kind === 'fold' && d.lock ? 'hold' : 'free'; if (d.kind === 'fold' && d.lock) closeDoor(c, d); }
      if (c.dShop && c.dShop.d === d && M.sp > 0.6) c.dShop = null;
      return;
    }
    if (d.mode === 'free') physStep(c, d, M, dt);
  }
  // Doors of a car that came out of a cruiser get flung open (police.js lets its crew out at the doors).
  function crewOut(c) {
    const n = c.pol.out ? c.pol.out.length : 1, D = doorsOf(c);
    for (let k = 0; k < Math.max(1, n); k++) {
      const side = k % 2 ? 1 : -1, rank = Math.floor(k / 2);
      const list = D.filter(d => !d.detached && d.side === side && (d.kind === 'swing' || d.kind === 'slide'));
      const d = list[rank] || (rank ? D.find(q => q.role === 'cargo' && q.side === side) : null) || list[0];
      if (d) openDoor(c, d, { fast: true, then: 'hold' });
    }
  }

  function tick(dt) {
    const f = X.focus(); fx = f.x; fy = f.y;
    for (const c of X.cars) {
      if (c.removed) continue;
      if (c.pol && c.pol.doorT > -50) { crewOut(c); c.pol.doorT = -99; }   // (and police.js no longer draws its own)
      const D = c.doors; if (!D) continue;
      const M = motion(c, dt);
      let act = false;
      for (const d of D) { if (d.mode !== 'shut' && d.mode !== 'gone') { doorTick(c, d, M, dt); act = true; } }
      c._dOpen = act;
    }
    debrisTick(dt);
  }

  // ================= debris (torn-off doors) =================
  function debrisTick(dt) {
    for (let i = debris.length - 1; i >= 0; i--) {
      const b = debris[i];
      b.t += dt;
      if (b.t > b.life) { debris.splice(i, 1); continue; }
      if (b.z > 0 || b.vz > 0) {
        b.vz -= 22 * dt; b.z += b.vz * dt;
        if (b.z <= 0) { b.z = 0; if (b.vz < -3) { sfx(null, 'clatter', Math.min(1, -b.vz / 9), b.x, b.y); b.vz *= -0.3; b.w *= 0.6; } else b.vz = 0; }
      }
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 0) { const dec = Math.min(sp, (b.z > 0 ? 0.6 : 7) * dt); b.vx -= b.vx / sp * dec; b.vy -= b.vy / sp * dec; }
      b.w *= Math.exp(-(b.z > 0 ? 0.5 : 4) * dt);
      b.x += b.vx * dt; b.y += b.vy * dt; b.th += b.w * dt;
      if (sp < 0.05 && b.z === 0 && Math.abs(b.w) < 0.05) { b.vx = b.vy = 0; b.w = 0; }
      // walls bounce it, cars shove it along
      const s = X.blocked(b.x, b.y, 0.3);
      if (s) { const m = X.circlePoly(b.x, b.y, 0.3, s.poly); if (m) { b.x += m.x; b.y += m.y; const vn = b.vx * m.nx + b.vy * m.ny; if (vn < 0) { b.vx -= vn * m.nx * 1.5; b.vy -= vn * m.ny * 1.5; } } }
      if (b.z > 0.6) continue;
      for (const c of X.cars) {
        if (c.removed || Math.abs(c.x - b.x) > c.len / 2 + 1 || Math.abs(c.y - b.y) > c.len / 2 + 1) continue;
        const m = X.circlePoly(b.x, b.y, Math.min(0.5, b.len * 0.42), X.carPoly(c)); if (!m) continue;
        const v = X.carVel(c), rel = (v.x - b.vx) * m.nx + (v.y - b.vy) * m.ny;   // how fast the car closes on it (n: car -> debris)
        b.x += m.x; b.y += m.y;
        if (rel > 0.2) {
          b.vx += m.nx * rel * 1.3 + (v.x - b.vx) * 0.25; b.vy += m.ny * rel * 1.3 + (v.y - b.vy) * 0.25;
          b.w += (Math.random() - 0.5) * rel * 3;
          if (rel > 3) { sfx(null, 'clatter', rel / 10, b.x, b.y); if (rel > 6) { b.vz = rel * 0.25; b.z = 0.01; } }
        }
      }
    }
  }

  // ================= events =================
  X.on('doorOpen', e => {
    if (!X.active || !e.car || e.car.removed) return;
    const c = e.car, d = e.door || pickDoor(c, e.side);
    e.step = (c.model && c.model.kind === 'tank') ? 0.7 : (c.model && c.model.kind === 'bus') ? 0.45 : undefined;
    if (e.exit || e.jack) rock(c, e.jack ? 0.09 : 0.06);
    if (!d || d.detached) { e.wait = 0; return; }
    if (e.bail) {   // thrown open by someone jumping out at speed: it swings until it catches again
      d.mode = 'free'; d.busy = false; d.noLatch = 2.2; d.w = Math.max(d.w, rand(6, 9)); if (d.kind === 'fold' || d.kind === 'hatch') d.a = Math.max(d.a, 0.5);
      sfx(c, 'yank', 1); stats.opened++;
      e.wait = 0; return;
    }
    e.wait = openDoor(c, d, { fast: !!(e.fast || e.jack), then: 'hold', busy: true });
  });
  X.on('doorClose', e => {
    if (!X.active || !e.car) return;
    const c = e.car, d = e.door || pickDoor(c, e.side);
    if (!d || d.detached) return;
    d.busy = false;
    if (e.leave) { if (d.mode === 'anim' || d.mode === 'hold') { d.mode = 'free'; d.noLatch = 1.2; if (d.kind === 'fold' || d.kind === 'hatch') closeDoor(c, d); } return; }
    closeDoor(c, d);
  });
  X.on('enterCar', e => { if (X.active && e.car) rock(e.car, 0.08); });
  // People let out of a car (jacked, bailing from a fire, arrested...) come out through a door, which they
  // leave open. A jacked driver is yanked out through the door the player just opened.
  X.on('pedEjected', e => {
    if (!X.active || !e.car || !e.ped) return;
    const c = e.car, p = e.ped, l = toL(c, p.x, p.y), side = l.y < 0 ? -1 : 1, hw = c.wid / 2;
    const jack = e.reason === 'carjack' && P.entering && P.entering.car === c && P.entering.ent;
    const d = jack ? P.entering.ent.door : pickDoor(c, side, l);
    if (!d) return;
    if (!jack) openDoor(c, d, { fast: e.reason !== 'arrest', then: 'hold' });
    if (d.kind === 'hatch' || d.kind === 'fold') return;
    const sx = d.kind === 'rear' ? -c.len / 2 - 0.35 : d.seatX, sy = d.kind === 'rear' ? d.side * hw * 0.45 : d.side * (hw + 0.34);   // just out of the doorway
    const w = toW(c, sx, sy), v = X.carVel(c), out = d.kind === 'rear' ? c.th + Math.PI : c.th + d.side * Math.PI / 2;
    const kick = jack ? 4.5 : 2;
    if (!X.blocked(w.x, w.y, p.r || 0.3) && !hitsCar(c, w.x, w.y)) { p.x = w.x; p.y = w.y; }   // (else core's spot stands)
    p.vx = v.x + Math.cos(out) * kick; p.vy = v.y + Math.sin(out) * kick; p.th = out;
  });
  // Where on the body a crash landed (car-local): the other car's corner that dug in, or the middle of our
  // side when it hit flat (two of our corners touching), else core's contact point.
  function contactLocal(c, e) {
    const hl = c.len / 2, hw = c.wid / 2, poly = e.other && e.other.kind === 'car' && !e.other.removed ? X.carPoly(e.other) : e.solid && e.solid.poly;
    if (poly) {
      let best = null, bp = 0.2;
      if (e.other) for (const v of poly) { const l = toL(c, v.x, v.y), pen = Math.max(Math.abs(l.x) - hl, Math.abs(l.y) - hw); if (pen < bp) { bp = pen; best = l; } }
      const mine = [];
      for (const sx of [1, -1]) for (const sy of [1, -1]) { const w = toW(c, sx * hl, sy * hw); if (X.circlePoly(w.x, w.y, 0.12, poly)) mine.push({ x: sx * hl, y: sy * hw }); }
      if (mine.length >= 2) return { x: (mine[0].x + mine[1].x) / 2, y: (mine[0].y + mine[1].y) / 2 };
      if (best) return { x: cl(best.x, -hl, hl), y: cl(best.y, -hw, hw) };
      if (mine.length) return mine[0];
    }
    return toL(c, e.at.x, e.at.y);
  }
  // Crashes: a hit near a door springs its lock; a really hard one rips it off.
  X.on('carImpact', e => {
    if (!X.active || !e.car || !e.at || e.car.removed) return;
    const c = e.car, sp = e.speed || 0;
    if (sp < BREAK_AT) return;
    const D = doorsOf(c), l = contactLocal(c, e);
    for (const d of D) {
      if (d.detached || d.kind === 'hatch') continue;
      const u = dirOf(d, 0), ex = d.hx + u.x * d.len, ey = d.hy + u.y * d.len;
      const dx = ex - d.hx, dy = ey - d.hy, L2 = dx * dx + dy * dy, tt = cl(((l.x - d.hx) * dx + (l.y - d.hy) * dy) / L2, 0, 1);
      const dist = Math.hypot(l.x - d.hx - dx * tt, l.y - d.hy - dy * tt);
      if (dist > 0.95) {
        // a big smash anywhere bends the body: the further from the hit, the less likely a lock lets go
        if (sp > SHOCK_AT && d.lock && Math.random() < (sp - SHOCK_AT) / 26 * (0.35 + 0.65 * Math.max(0, 1 - dist / c.len))) breakLock(c, d, rand(1, 3) + sp * 0.15);
        continue;
      }
      const k = (1 - dist / 0.95) * (sp - BREAK_AT + 3) / 6;
      if (sp > TEAR_AT && dist < 0.6 && Math.random() < (sp - TEAR_AT) / 10 + 0.15) {
        const ox = -Math.sin(c.th) * d.side, oy = Math.cos(c.th) * d.side;   // outwards, in the world
        tear(c, d, ox * rand(1.5, 4) + rand(-2, 2), oy * rand(1.5, 4) + rand(-2, 2));
      } else if (Math.random() < k) breakLock(c, d, rand(2, 5) + sp * 0.2);
    }
  });
  X.on('explosion', e => {
    if (!X.active) return;
    const pw = Math.max(0.2, e.power || 1), R = 6.5 * Math.pow(pw, 0.6) * 1.15;
    for (const c of X.cars) {
      if (c.removed || Math.abs(c.x - e.x) > R + c.len / 2 || Math.abs(c.y - e.y) > R + c.len / 2) continue;
      const own = c === e.source, D = doorsOf(c);
      let torn = 0;
      for (const d of D) {
        if (d.detached || d.kind === 'hatch') continue;
        const u = dirOf(d, d.a), m = toW(c, d.hx + u.x * d.len / 2, d.hy + u.y * d.len / 2), dx = m.x - e.x, dy = m.y - e.y, dist = Math.hypot(dx, dy);
        if (dist > R) continue;
        const k = 1 - dist / R, J = 9 * k * Math.sqrt(pw), bl = toL(c, e.x, e.y);
        const facing = d.kind === 'rear' ? bl.x < -c.len / 2 + 0.5 : bl.y * d.side > c.wid / 2 - 0.3;   // the body shields the far side
        if ((own && torn < 1 && Math.random() < 0.55) || (!own && facing && pw >= 0.5 && dist < R * 0.42 && Math.random() < 0.6 + k * 0.3)) { torn++; tear(c, d, dx / (dist || 1) * J, dy / (dist || 1) * J); }
        else if (own || (k > 0.25 && (facing || Math.random() < k))) breakLock(c, d, rand(5, 10) * (own ? 1 : k + 0.3));
      }
    }
  });
  X.on('carHurt', e => {
    if (!X.active || !e.car || e.car.removed) return;
    const c = e.car, kind = e.kind;
    if (kind !== 'bullet' && kind !== 'melee') return;
    if (Math.random() > (kind === 'bullet' ? 0.035 : 0.09)) return;
    const by = e.by && e.by.x != null ? e.by : e.by && e.by.owner && e.by.owner.x != null ? e.by.owner : null;
    const l = by ? toL(c, by.x, by.y) : null;
    const d = pickDoor(c, l ? (l.y < 0 ? -1 : 1) : 0, l);
    if (d && d.mode === 'shut' && breakLock(c, d, rand(1, 3))) sfx(c, 'stop', 0.7);
  });
  X.on('carRepaired', e => { const c = e && e.car; if (c) { c.doors = null; c._dEnt = null; c.dShop = null; } });

  // ================= drawing =================
  // q: detail level, 0 plain (low detail setting, or tiny on screen) .. 2 zoomed in (every trim and glint).
  function drawCarDoors(ctx, c, view, lo) {
    const D = c.doors || doorsOf(c);
    let open = false;
    for (const d of D) if (d.detached || d.a > 0.025) { open = true; break; }
    const q = lo ? 0 : view.scale > 30 ? 2 : view.scale > 13 ? 1 : 0, seams = q === 2 && view.scale > 34;   // panel gaps and handles: only zoomed in
    if (!open && !seams) return;
    const charred = !!c.wrecked, col = charred ? '#1d1d1d' : c.color || '#888';
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.th);
    if (seams) drawSeams(ctx, c, D, charred);
    if (open) {
      for (const d of D) if (d.detached || d.a > 0.025) drawOpening(ctx, c, d, q);
      if (c.dShop) drawShopping(ctx, c, c.dShop);
      if (q) for (const d of D) if (!d.detached && d.a > 0.025) drawPanel(ctx, c, d, col, true, q);
      for (const d of D) if (!d.detached && d.a > 0.025) drawPanel(ctx, c, d, col, false, q);
    }
    ctx.restore();
  }
  function drawSeams(ctx, c, D, charred) {
    const hw = c.wid / 2;
    ctx.strokeStyle = charred ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.32)'; ctx.lineWidth = 0.025;
    ctx.beginPath();
    for (const d of D) {
      if (d.detached || d.a > 0.025) continue;
      if (d.kind === 'swing') {
        const s = d.side; for (const x of [d.hx, d.hx - d.len]) { ctx.moveTo(x, s * hw); ctx.lineTo(x, s * (hw - 0.2)); }
      } else if (d.kind === 'slide' || d.kind === 'fold') {
        const s = d.side; for (const x of [d.hx, d.hx - d.len]) { ctx.moveTo(x, s * hw); ctx.lineTo(x, s * (hw - 0.16)); }
        if (d.kind === 'fold') { ctx.moveTo(d.hx - d.len / 2, s * hw); ctx.lineTo(d.hx - d.len / 2, s * (hw - 0.1)); }
      } else if (d.kind === 'rear' && d.side > 0) { ctx.moveTo(-c.len / 2, 0); ctx.lineTo(-c.len / 2 + 0.16, 0); }
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.42)';   // handles
    for (const d of D) if (d.kind === 'swing' && !d.detached && d.a <= 0.025) ctx.fillRect(d.hx - d.len + 0.1, d.side > 0 ? hw - 0.035 : -hw, 0.13, 0.035);
  }
  // The hole in the body where the door was: the dark doorway, the seat's edge, the sill.
  function drawOpening(ctx, c, d, q) {
    const hw = c.wid / 2, s = d.side, k = d.detached ? 1 : cl(d.a / 0.28, 0, 1);
    ctx.globalAlpha = k;
    if (d.kind === 'swing' || d.kind === 'slide') {
      const x0 = d.hx - d.len + 0.05, x1 = d.hx - 0.05, dep = DW + 0.03, y0 = s < 0 ? -hw : hw - dep;
      ctx.fillStyle = '#121418'; ctx.fillRect(x0, y0, x1 - x0, dep);
      if (q) {
        ctx.fillStyle = c.wrecked ? '#191919' : '#3b4049';   // seat cushion and bolster
        const sx0 = Math.max(x0 + 0.04, d.seatX - 0.26), sx1 = Math.min(x1 - 0.04, d.seatX + 0.24);
        if (sx1 > sx0) { ctx.fillRect(sx0, s < 0 ? -hw + dep * 0.45 : hw - dep, sx1 - sx0, dep * 0.55); if (q > 1) { ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(sx0 + 0.04, s < 0 ? -hw + dep * 0.5 : hw - dep * 0.95, sx1 - sx0 - 0.08, 0.04); } }
        if (q > 1) { ctx.fillStyle = 'rgba(160,165,175,0.5)'; ctx.fillRect(x0, s < 0 ? -hw : hw - 0.03, x1 - x0, 0.03); }   // the sill
      }
    } else if (d.kind === 'rear') {
      ctx.fillStyle = '#121418'; ctx.fillRect(-c.len / 2, s < 0 ? -hw + 0.06 : 0, 0.2, hw - 0.06);
    } else if (d.kind === 'fold') {
      const x0 = d.hx - d.len, x1 = d.hx, dep = 0.62, y0 = s < 0 ? -hw : hw - dep, f = cl(d.a, 0, 1);
      ctx.fillStyle = '#121418'; ctx.fillRect(x0, y0, d.len, dep);
      if (q) { ctx.fillStyle = 'rgba(200,200,190,0.18)'; for (let i = 1; i < 3; i++) ctx.fillRect(x0 + 0.05, s < 0 ? -hw + i * 0.18 : hw - i * 0.18 - 0.03, d.len - 0.1, 0.03); }   // steps
      // two leaves folding in from each jamb
      ctx.lineCap = 'round';
      for (const [hx, dir] of [[x1 - 0.04, -1], [x0 + 0.04, 1]]) {   // two glass leaves folded in from each jamb
        const a = f * 1.45, L2 = d.len / 2 - 0.05, lx = hx + dir * Math.cos(a) * L2, ly = s * (hw - 0.04) - s * Math.sin(a) * L2;
        ctx.strokeStyle = '#1d2026'; ctx.lineWidth = 0.13; ctx.beginPath(); ctx.moveTo(hx, s * (hw - 0.04)); ctx.lineTo(lx, ly); ctx.stroke();
        ctx.strokeStyle = 'rgba(160,200,225,0.9)'; ctx.lineWidth = 0.06; ctx.stroke();
      }
      ctx.lineCap = 'butt';
    } else if (d.kind === 'hatch') {
      ctx.save(); turretFrame(ctx, c);
      ctx.fillStyle = '#0d0e0b'; ctx.beginPath(); ctx.arc(d.hx, d.hy, d.len * 0.9, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  function turretFrame(ctx, c) { ctx.translate(-0.3, 0); ctx.rotate((c.turret == null ? c.th : c.turret) - c.th); }
  // The door itself, swung out round its hinge (or slid back, or the hatch lid flipped over).
  function drawPanel(ctx, c, d, col, shadow, q) {
    const s = d.side, hw = c.wid / 2;
    if (d.kind === 'fold') return;
    if (d.kind === 'hatch') {
      if (shadow) return;
      ctx.save(); turretFrame(ctx, c);
      const r = d.len, ca = Math.cos(d.a), hx = d.hx - r, cx = hx + r * ca;
      ctx.fillStyle = ca > 0 ? col : shade(col.startsWith('#') ? col : '#4a5634', -0.45);
      ctx.beginPath(); ctx.ellipse(cx, d.hy, Math.max(0.02, r * Math.abs(ca)), r, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 0.05; ctx.stroke();
      ctx.restore();
      return;
    }
    const out = -s;   // which side of the door frame (+y') is the outer skin
    let x, y, ang, len = d.len;
    if (d.kind === 'slide') {
      const sl = d.a * d.len * 0.95, off = Math.min(1, d.a * 6) * 0.1;
      x = d.hx - sl; y = s * (hw + off); ang = Math.PI;
    } else {
      const u = dirOf(d, d.a); x = d.hx; y = d.hy; ang = Math.atan2(u.y, u.x);
      if (d.wob) ang += -s * (d.kind === 'rear' ? -1 : 1) * 0.1 * d.wob * Math.abs(Math.sin(X.time * 26));
    }
    ctx.save();
    if (shadow) { ctx.translate(x + 0.09, y + 0.12); ctx.rotate(ang); ctx.fillStyle = 'rgba(0,0,0,0.3)'; const W = d.kind === 'rear' ? 0.17 : DW; ctx.fillRect(0.1, out > 0 ? -W : 0, len - 0.1, W); ctx.restore(); return; }
    ctx.translate(x, y); ctx.rotate(ang);
    drawSlab(ctx, d, col, out, len, q, !!c.wrecked, c.model && c.model.kind === 'police');
    ctx.restore();
  }
  // A door in its own frame: the hinge (its outer front corner) at the origin, the door running along +x,
  // out = which way (+1 / -1 in y) its outer skin faces. Seen from above it is the band of the body's side
  // it came out of: the skin's shoulder, the window, the trim; the hinge end is cut back to clear the wing.
  const DW = 0.22;
  function drawSlab(ctx, d, col, out, len, q, charred, police) {
    const o = out > 0 ? 1 : -1, W = d.kind === 'rear' ? 0.17 : DW, cut = Math.min(0.2, len * 0.2), y = v => v * o;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len - 0.04, 0); ctx.quadraticCurveTo(len, 0, len, y(-0.04)); ctx.lineTo(len, y(-W)); ctx.lineTo(cut, y(-W)); ctx.closePath(); ctx.fill();
    if (!q) return;
    if (q > 1) { ctx.strokeStyle = shade(col.startsWith('#') ? col : '#777777', -0.5); ctx.lineWidth = 0.022; ctx.stroke(); }
    if (police && !charred) { const n = Math.max(2, Math.round(len / 0.22)), w = (len - cut) / n; for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? '#f2cf1d' : '#1d4fb8'; ctx.fillRect(cut + i * w, y(-0.075), w, y(0.06)); } }
    if (q > 1) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(0.06, y(-0.035), len - 0.12, y(0.02)); }   // light along the shoulder
    // the window (edge-on, up) and the trim on the inside
    const gx = cut + 0.04, gw = len * (d.kind === 'rear' ? 0.55 : 0.78) - gx;
    if (gw > 0.05) {
      ctx.fillStyle = charred ? '#0a0a0a' : '#1f2f3c'; ctx.fillRect(gx, y(-0.1), gw, y(-0.065));
      if (!charred && q > 1) { ctx.fillStyle = 'rgba(190,220,240,0.4)'; ctx.fillRect(gx + 0.04, y(-0.125), gw * 0.5, y(-0.014)); }
    }
    ctx.fillStyle = charred ? '#121212' : '#25282e'; ctx.fillRect(cut + 0.02, y(-W + 0.045), len - cut - 0.04, y(-0.045));
    if (!charred && q > 1) { ctx.fillStyle = '#3d424b'; ctx.fillRect(len * 0.45, y(-W + 0.05), len * 0.35, y(-0.025)); }   // armrest
    if (d.mirror) {
      ctx.fillStyle = col; ctx.fillRect(0.07, o > 0 ? -0.01 : -0.14, 0.17, 0.15);
      if (q > 1) { ctx.fillStyle = charred ? '#0b0b0b' : '#a9bccb'; ctx.fillRect(0.1, o > 0 ? 0.08 : -0.12, 0.11, 0.035); }
    }
    if (q > 1) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(len - 0.27, y(-0.028), 0.15, y(0.028)); }   // the handle
  }
  function drawShopping(ctx, c, S) {
    const d = S.d, hw = c.wid / 2, s = d.side;
    for (let i = 0; i < S.n; i++) {
      const x = (d.kind === 'rear' ? -c.len / 2 - 0.55 : d.seatX - 0.35) + i * 0.34, y = d.kind === 'rear' ? (i - 1) * 0.36 : s * (hw + 0.55 + (i % 2) * 0.12);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x - 0.12, y - 0.07, 0.3, 0.24);
      ctx.fillStyle = i % 2 ? '#c9a46a' : '#e8e2d2'; ctx.fillRect(x - 0.15, y - 0.11, 0.28, 0.22);
      ctx.fillStyle = i % 2 ? '#5b8a3c' : '#c0392b'; ctx.fillRect(x - 0.1, y - 0.06, 0.08, 0.06); ctx.fillStyle = '#f2c230'; ctx.fillRect(x + 0.01, y - 0.02, 0.07, 0.07);
    }
  }
  // The player half way through a doorway: drawn here, clipped to outside the body plus the doorway, so they
  // duck under the roof instead of walking over it (core keeps them hidden while it moves them).
  function drawSeating(ctx, t) {
    const e = P.entering, p = P.ped;
    if (!e || !p || !p.seqHidden || !e.ent || !(e.phase === 'in' || e.phase === 'out') || e.car.removed) return;
    const c = e.car, d = e.ent.door, hw = c.wid / 2, hl = c.len / 2;
    const k = Math.min(1, e.pt / (e.dur || 0.3)), prog = e.phase === 'in' ? k : 1 - k;   // 0 outside .. 1 seated
    ctx.save();
    if (c.model && c.model.kind === 'tank') {   // up onto the hull, then down the hatch
      const sc = 1 - 0.45 * cl((prog - 0.6) / 0.4, 0, 1);
      ctx.globalAlpha = 1 - cl((prog - 0.85) / 0.15, 0, 1);
      ctx.translate(p.x, p.y); ctx.scale(sc, sc); ctx.translate(-p.x, -p.y);
      X.drawPed(ctx, p, t);
      ctx.restore(); return;
    }
    ctx.translate(c.x, c.y); ctx.rotate(c.th);
    ctx.beginPath(); ctx.rect(-hl - 40, -hw - 40, c.len + 80, c.wid + 80); ctx.rect(-hl, -hw, c.len, c.wid);
    if (d && (d.kind === 'swing' || d.kind === 'slide' || d.kind === 'fold')) {
      const dep = d.kind === 'fold' ? 0.62 : DW + 0.06, x0 = d.hx - d.len, s = d.side;
      ctx.rect(x0, s < 0 ? -hw : hw - dep, d.len, dep);
    }
    ctx.clip('evenodd');
    ctx.globalAlpha = 1 - cl((prog - 0.8) / 0.2, 0, 1);
    ctx.rotate(-c.th); ctx.translate(-c.x, -c.y);
    const was = p.hidden; p.hidden = false;
    X.drawPed(ctx, p, t);
    p.hidden = was;
    ctx.restore();
  }
  function darkness() {
    if (X.lighting && X.lighting.darkness) { try { return X.lighting.darkness(); } catch (e) { /* fall through */ } }
    const h = (X.clock || 0) / 60; return h > 20 || h < 5.5 ? 1 : h > 18.5 ? (h - 18.5) / 1.5 : h < 7 ? (7 - h) / 1.5 : 0;
  }
  // A torn-off door lying in the road shows its whole face: skin or trim side up, window at the top; in the
  // air it tumbles (the face foreshortens as it turns over).
  function drawDebris(ctx, air, lo) {
    for (const b of debris) {
      if ((b.z > 0.05) !== air || !X.inView(b.x, b.y, 3)) continue;
      const fade = Math.min(1, (b.life - b.t) / 4), L = b.len, H = Math.min(0.78, L * 0.72);
      const flip = air ? Math.cos(b.t * 9 + b.side) : 1, up = air ? flip > 0 : !b.inner, sy = air ? Math.max(0.12, Math.abs(flip)) : 1, sc = 1 + b.z * 0.1;
      ctx.save();
      ctx.globalAlpha = fade;
      if (!lo) { ctx.save(); ctx.translate(b.x + 0.1 + b.z * 0.45, b.y + 0.12 + b.z * 0.55); ctx.rotate(b.th); ctx.scale(1, sy); ctx.fillStyle = 'rgba(0,0,0,0.3)'; PG.rr(ctx, -L / 2, -H / 2, L, H, 0.08); ctx.fill(); ctx.restore(); }
      ctx.translate(b.x, b.y); ctx.rotate(b.th); ctx.scale(sc, sc * sy);
      const col = b.charred ? '#1d1d1d' : b.color || '#888';
      ctx.fillStyle = up ? col : '#2c2f35'; PG.rr(ctx, -L / 2, -H / 2, L, H, 0.08); ctx.fill();
      if (!lo) {
        ctx.strokeStyle = shade(col.startsWith('#') ? col : '#777777', -0.5); ctx.lineWidth = 0.03; ctx.stroke();
        // the window frame (glass gone or crazed), on the hinge end's upper half
        ctx.fillStyle = b.charred ? '#0c0c0c' : 'rgba(40,55,70,0.9)';
        ctx.beginPath(); ctx.moveTo(-L / 2 + 0.1, -H / 2 + 0.07); ctx.lineTo(L / 2 - 0.12, -H / 2 + 0.07); ctx.lineTo(L / 2 - 0.12, -0.04); ctx.lineTo(-L / 2 + 0.28, -0.04); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(220,235,245,0.35)'; ctx.lineWidth = 0.02; ctx.beginPath(); ctx.moveTo(-L / 2 + 0.3, -0.1); ctx.lineTo(L / 2 - 0.3, -H / 2 + 0.12); ctx.stroke();
        if (up) {
          if (b.police && !b.charred) { const n = Math.max(2, Math.round(L / 0.2)), w = L / n; for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? '#f2cf1d' : '#1d4fb8'; ctx.fillRect(-L / 2 + i * w, 0.06, w, 0.16); } }
          ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(-L / 2 + 0.12, 0.02, 0.16, 0.04);   // handle
          if (b.mirror) { ctx.fillStyle = col; ctx.fillRect(L / 2 - 0.2, -H / 2 - 0.05, 0.16, 0.12); }
        } else { ctx.fillStyle = '#3b3f47'; ctx.fillRect(-L / 2 + 0.15, 0.08, L - 0.4, 0.09); }   // armrest
      }
      ctx.restore();
    }
  }

  // ================= module =================
  X.doors = {
    of: doorsOf,
    entry(c, side) { const E = entries(c); return side < 0 ? E.l : E.r; },
    exitSpot(c, side) { const E = entries(c); return side < 0 ? E.spot[0] : E.spot[1]; },
    open: (c, d, o) => openDoor(c, d, o), close: (c, d) => closeDoor(c, d), breakLock: (c, d, kick) => breakLock(c, d, kick), tear: (c, d, vx, vy) => tear(c, d, vx, vy),
    dir: dirOf, debris, stats, opts,
  };
  X.mod('doors', {
    order: 48,
    init() { debris.length = 0; for (const k in stats) stats[k] = 0; const f = X.focus(); fx = f.x; fy = f.y; },
    stop() { debris.length = 0; },
    tick,
    render: {
      bodies(ctx) { if (!X.scene) drawDebris(ctx, false, low()); },
      cars(ctx, view, t) {
        if (X.scene) return;
        const lo = low(), dk = darkness();
        for (const c of X.cars) {
          if (c.removed || c.shopHide || c.shopSquash || !X.inView(c.x, c.y, c.len)) continue;
          drawCarDoors(ctx, c, view, lo);
          if (dk > 0.2 && c._dOpen && !c.wrecked) {   // the dome light
            for (const d of c.doors) if (!d.detached && d.a > 0.3 && d.kind !== 'hatch') { const w = toW(c, d.seatX, d.side * (c.wid / 2 - 0.3)); X.addLight(w.x, w.y, 2.4, '#ffe0a6', 0.5 * dk); break; }
          }
        }
        drawSeating(ctx, t);
      },
      air(ctx) { if (!X.scene) drawDebris(ctx, true, low()); },
    },
  });
})(typeof window !== 'undefined' ? (window.PG = window.PG || {}) : (globalThis.PG = globalThis.PG || {}));
