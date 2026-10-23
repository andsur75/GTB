// Doors test: every model's door layout; getting in and out (door angle over time, when the player is hidden,
// the door shut afterwards, left open when sprinting off or rolling); a carjack (door yanked open, the driver
// pulled out through it); walking round a sedan, a bus and an SUV parked against a wall from 8 directions
// (never through the body, never stuck, seated in ~3 s; the passenger door and a climb across when the
// driver's side is walled in, and out the same way); broken locks swinging with braking, accelerating and
// cornering, slamming without catching; a real side impact springing a lock; a blast tearing doors off into
// debris (flies, lands, gets shoved by a car, fades); repair; a missing driver door (straight in); bailing at
// speed; F ignored mid-sequence; the car driven off / blown up / wasted mid-sequence; NPCs and a police crew
// leaving through their doors; doors open on parked cars that slam shut once driven; every door sound with
// audio on; a second game; the module's frame cost with 60 cars. Frame-by-frame screenshots of getting in and
// out at normal zoom and zoomed in, a carjack, the bus, the tank, vans with everything open.
// Works with the full build and with core + doors only.
// Usage: node tests/doors.test.mjs <built.html> <screenshot dir>
import { launch, fpsSkip } from './harness.mjs';
const t = await launch({ html: process.argv[2], out: process.argv[3] });
let fails = 0;
const check = (name, ok, info) => { if (fpsSkip(name, ok, info)) return; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info !== undefined ? ' ' + JSON.stringify(info) : ''}`); if (!ok) fails++; };
const r2 = v => Math.round(v * 100) / 100;

// ---- in-page helpers (on window: they survive a second game) ----
const setup = () => t.eval(() => {
  const X = PG.gta, C = X.city, P = X.player;
  const T = window.T = window.T || { ev: [] };
  window.r2 = v => Math.round(v * 100) / 100;
  if (!T.hooked) {
    T.hooked = true;
    for (const k of ['doorOpen', 'doorClose', 'enterCar', 'exitCar', 'carjack', 'pedEjected']) X.on(k, e => T.ev.push({ k, t: X.time, side: e.side, fast: !!e.fast, leave: !!e.leave, reason: e.reason, wait: e.wait }));
  }
  T.rec = null;
  // runs every frame after the other modules (game time); also keeps strays out of the test arena
  X.mod('doorsTest', { order: 99, tick(dt) { if (T.rec) T.rec(dt); if (T.A) for (const c of X.cars) if (!c.tcar && c !== P.car && !c.removed && Math.abs(c.x - T.A.x) < 60 && Math.abs(c.y - T.A.y) < 60) X.removeCar(c); } });
  T.sleep = ms => new Promise(r => setTimeout(r, ms));
  T.until = async (fn, ms) => { const t0 = performance.now(); while (!fn()) { if (performance.now() - t0 > ms) return false; await T.sleep(16); } return true; };
  // a long straight road with no traffic
  T.arena = function () {
    const pp = X.playerPos(); let best = null;
    for (let j = 1; j < C.ys.length - 1; j++) for (let i = 1; i < C.xs.length - 2; i++) {
      const len = C.xs[i + 1] - C.xs[i] - (C.wx[i] + C.wx[i + 1]) / 2, x = (C.xs[i] + C.xs[i + 1]) / 2, y = C.ys[j];
      const score = Math.hypot(x - pp.x, y - pp.y) - (len >= 90 ? 5000 : len * 10);
      if (!best || score < best.score) best = { score, x, y, j, w: C.wy[j], len };
    }
    T.A = best;
    X.trafficRules.push(c => Math.abs(c.x - best.x) < 140 && Math.abs(c.y - best.y) < 140 ? 0 : null);
    return best;
  };
  T.onFoot = function () {
    if (P.entering) { const e = P.entering; P.entering = null; if (P.ped.seqHidden) { P.ped.seqHidden = false; P.ped.hidden = false; } if (e.car && e.car.doors) for (const d of e.car.doors) d.busy = false; }
    if (P.car) { const c = P.car; c.driver = null; P.car = null; }
    P.ped.car = null; P.ped.hidden = false; P.ped.knock = 0; P.state = 'play';
  };
  T.clean = function () {
    T.onFoot(); T.rec = null;
    for (const c of X.cars) if (Math.abs(c.x - T.A.x) < 150 && Math.abs(c.y - T.A.y) < 150) X.removeCar(c);
    for (const p of X.peds) if (!p.isPlayer && Math.abs(p.x - T.A.x) < 80 && Math.abs(p.y - T.A.y) < 80) p.removed = true;
    if (X.props) for (const pr of X.props.slice()) if (Math.abs(pr.x - T.A.x) < 80 && Math.abs(pr.y - T.A.y) < 80 && X.removeProp) X.removeProp(pr);
    X.doors.debris.length = 0; X.decals.length = 0;
    if (X.police && X.police.clear) X.police.clear(); else P.wanted = 0;
    const p = P.ped; p.maxHp = p.hp = 1e5; p.armor = 0; p.onFire = 0; p.vx = p.vy = 0;
    T.put(T.A.x, T.A.y + T.A.w / 2 + 2.5);
    X.cam.zoom = 1;
  };
  T.put = function (x, y) { const p = P.ped; p.x = x; p.y = y; p.vx = p.vy = 0; X.cam.x = x; X.cam.y = y; };
  T.park = (id, x, y, th, o) => { const c = X.makeCar(id, x, y, th || 0, Object.assign({ ctrl: 'parked' }, o)); c.tcar = true; X.doors.of(c); return c; };
  T.local = (c, x, y) => { const cs = Math.cos(c.th), sn = Math.sin(c.th), dx = x - c.x, dy = y - c.y; return { x: dx * cs + dy * sn, y: -dx * sn + dy * cs }; };
  T.world = (c, l) => { const cs = Math.cos(c.th), sn = Math.sin(c.th); return { x: c.x + cs * l.x - sn * l.y, y: c.y + sn * l.x + cs * l.y }; };
  T.gap = (c, x, y) => { const l = T.local(c, x, y); return Math.hypot(Math.max(0, Math.abs(l.x) - c.len / 2), Math.max(0, Math.abs(l.y) - c.wid / 2)) * (Math.abs(l.x) < c.len / 2 && Math.abs(l.y) < c.wid / 2 ? -1 : 1); };
  T.front = (c, side) => c.doors.find(d => d.role === 'front' && d.side === side);
  T.arena(); T.A0 = T.A;
  X.doors.opts.parkedOpen = 0;   // (section 13 turns it on)
});
await setup();
await t.eval(() => T.clean());

// ---------- 1. every vehicle has doors, laid out per model ----------
const lay = await t.eval(() => {
  const X = PG.gta, out = {};
  for (const id of Object.keys(X.MODELS)) {
    const c = T.park(id, T.A.x, T.A.y + 0.1, 0), D = X.doors.of(c), E = [X.doors.entry(c, -1), X.doors.entry(c, 1)];
    const hl = c.len / 2 + 0.01, hw = c.wid / 2 + 0.01;
    out[id] = {
      kinds: D.map(d => d.kind + (d.side < 0 ? 'L' : 'R')).join(' '),
      inside: D.every(d => Math.abs(d.hx) <= hl && Math.abs(d.hy) <= hw && (d.kind === 'hatch' || d.kind === 'rear' || d.hx - d.len >= -hl - 0.01)),
      entry: E.filter(Boolean).every(e => !!e.door && Math.abs(e.stand.y) > hw + 0.3 && Math.abs(e.seat.y) < hw && Math.abs(e.seat.x) < hl),
      nEntry: E.filter(Boolean).length,
      spots: [X.doors.exitSpot(c, -1), X.doors.exitSpot(c, 1)].every(s => s && (Math.abs(s.y) > hw || Math.abs(s.x) > hl)),
    };
    X.removeCar(c);
  }
  return out;
});
const want = {
  bambino: 'swingL swingR', furia: 'swingL swingR',
  hatch: 'swingL swingR swingL swingR', comet: 'swingL swingR swingL swingR', taxi: 'swingL swingR swingL swingR', voltage: 'swingL swingR swingL swingR',
  regret: 'swingL swingR swingL swingR', fjord: 'swingL swingR swingL swingR', x5: 'swingL swingR swingL swingR', police: 'swingL swingR swingL swingR',
  boxvan: 'swingL swingR slideR rearL rearR', ambulance: 'swingL swingR rearL rearR', swat: 'swingL swingR rearL rearR', securicar: 'swingL swingR rearL rearR',
  firetruck: 'swingL swingR swingL swingR', bus: 'foldR foldR swingL', tank: 'hatchL',
};
const badLay = Object.keys(lay).filter(id => (want[id] ? lay[id].kinds !== want[id] : !/swing/.test(lay[id].kinds)) && !(id === 'rancher' && /^swingL swingR( swingL swingR)?$/.test(lay[id].kinds)));
check('every model has its doors: 2-door coupes, 4-door cars, pickups, vans (slide + rear), ambulance/SWAT/Securicar (rear), fire truck crew cab, bus folding doors + driver door' + (lay.tank ? ', tank hatch' : ''), badLay.length === 0 && Object.keys(lay).length >= 16, badLay.length ? badLay.map(id => id + ': ' + lay[id].kinds) : Object.fromEntries(Object.entries(lay).map(([k, v]) => [k, v.kinds])));
check('doors sit on the body; every entry has a door, a place to stand outside and a seat inside', Object.values(lay).every(v => v.inside && v.entry && v.nEntry >= 1 && v.spots), Object.fromEntries(Object.entries(lay).filter(([, v]) => !(v.inside && v.entry && v.spots)).map(([k, v]) => [k, v])));

// ---------- 2. getting in: door opens, step in, sit, door shuts ----------
const seqIn = await t.eval(async () => {
  const X = PG.gta, P = X.player; T.clean();
  const c = T.park('comet', T.A.x, T.A.y + 3.75, 0, { color: '#2f6fb5' }), d = T.front(c, -1), s = X.doorSpot(c, -1);
  T.put(s.x, s.y); T.c2 = c;
  await T.sleep(200);
  const rows = [], t0 = X.time;
  T.rec = () => rows.push({ t: X.time - t0, a: d.a, mode: d.mode, ph: P.entering ? P.entering.phase : P.car === c ? 'car' : '-', hid: P.ped.hidden, gap: T.gap(c, P.ped.x, P.ped.y), yaw: X.cam.yaw });
  X.enterCar(c);
  await T.until(() => P.car === c && d.mode === 'shut', 3000);
  await T.sleep(450); T.rec = null;
  const first = f => { const r = rows.find(f); return r ? +r.t.toFixed(2) : -1; };
  const tIn = first(r => r.ph === 'in'), tCar = first(r => r.ph === 'car'), tShut = rows.findIndex(r => r.ph === 'car' && r.mode === 'shut') >= 0 ? first(r => r.ph === 'car' && r.mode === 'shut') : -1;
  let mono = true; for (let i = 1; i < rows.length && rows[i].t <= tIn; i++) if (rows[i].a < rows[i - 1].a - 1e-6) mono = false;
  const atIn = rows.find(r => r.ph === 'in'), hidBefore = rows.some(r => r.hid && r.t < tIn - 1e-6);
  const yawAt = tt => { const r = rows.find(q => q.t >= tt); return r ? r.yaw : NaN; }, turn = (t1, t2) => r2(Math.abs(PG.gta.util.wrap(yawAt(t2) - yawAt(t1))));
  return { tOpen: first(r => r.a > 0.05), tWide: first(r => r.a > 0.9), maxA: +Math.max(...rows.map(r => r.a)).toFixed(2), tIn, aAtIn: atIn ? +atIn.a.toFixed(2) : -1, tCar, tShut, mono, hidBefore, hidIn: rows.filter(r => r.ph === 'in').every(r => r.hid), final: d.mode, finalA: d.a, inCar: P.car === c, camHeld: turn(tCar, tCar + 0.22), camTurns: turn(tCar + 0.3, tCar + 0.7), curve: rows.filter((r, i) => i % 3 === 0 && r.t < tShut + 0.1).map(r => r.ph[0] + r.a.toFixed(2)).join(' ') };
});
check('getting in: the door swings open first, eased over ~0.3 s', seqIn.tOpen >= 0 && seqIn.tOpen < 0.12 && seqIn.tWide > 0.12 && seqIn.tWide < 0.45 && seqIn.mono && seqIn.maxA > 1.0 && seqIn.maxA < 1.31, seqIn);
check('... the player steps in only once it is open (hidden only from then) and sits', seqIn.tIn > seqIn.tOpen && seqIn.aAtIn > 0.75 && !seqIn.hidBefore && seqIn.hidIn && seqIn.tCar > seqIn.tIn + 0.2 && seqIn.tCar < 1.1, seqIn);
check('... then the door swings shut and latches', seqIn.tShut > seqIn.tCar && seqIn.tShut - seqIn.tCar < 0.55 && seqIn.final === 'shut' && seqIn.finalA === 0 && seqIn.inCar, { tCar: seqIn.tCar, tShut: seqIn.tShut, final: seqIn.final });
check('... and the follow camera only starts turning with the car once the door has shut', seqIn.camHeld < 0.03 && seqIn.camTurns > 0.1, { camHeld: seqIn.camHeld, camTurns: seqIn.camTurns });

// ---------- 3. getting out: out of the seat at once, door opens, step out beside it, door shuts ----------
const seqOut = await t.eval(async () => {
  const X = PG.gta, P = X.player, c = T.c2, d = T.front(c, -1);
  const rows = [], t0 = X.time;
  T.rec = () => rows.push({ t: X.time - t0, a: d.a, mode: d.mode, ph: P.entering ? P.entering.phase : '-', hid: P.ped.hidden, x: P.ped.x, y: P.ped.y, off: Math.abs(PG.gta.util.wrap(X.cam.yaw - c.th)) });
  X.exitCar();
  const now = { car: !!P.car, hid: P.ped.hidden, ph: P.entering && P.entering.mode + ':' + P.entering.phase };
  await T.until(() => !P.entering && d.mode === 'shut', 3000);
  await T.sleep(80); T.rec = null;
  const first = f => { const r = rows.find(f); return r ? +r.t.toFixed(2) : -1; };
  const tOut = first(r => r.ph === 'out'), tVis = first(r => !r.hid), stand = T.world(c, X.doors.entry(c, -1).stand);
  const atOut = rows.find(r => r.ph === 'out'), inSeq = rows.filter(r => r.ph !== '-');
  let camKept = true; for (let i = 1; i < inSeq.length; i++) if (inSeq[i].off > inSeq[i - 1].off + 0.005) camKept = false;   // still turning with the car, not back to north
  return { now, tOpen: first(r => r.a > 0.05), tOut, aAtOut: atOut ? +atOut.a.toFixed(2) : -1, tVis, tShut: first(r => r.mode === 'shut' && r.t > tVis), off: +Math.hypot(P.ped.x - stand.x, P.ped.y - stand.y).toFixed(2), gap: +T.gap(c, P.ped.x, P.ped.y).toFixed(2), final: d.mode, camKept, camBack: r2(rows[rows.length - 1].off - inSeq[inSeq.length - 1].off), curve: rows.filter((r, i) => i % 3 === 0).map(r => r.ph[0] + r.a.toFixed(2)).join(' ') };
});
check('getting out: off the seat at once (the world sees you on foot), hidden inside while the door opens', !seqOut.now.car && seqOut.now.hid && seqOut.now.ph === 'exit:open' && seqOut.tOpen >= 0 && seqOut.tOpen < 0.1, seqOut);
check('... steps out through the open door to stand beside it, then the door shuts behind', seqOut.aAtOut > 0.75 && seqOut.tVis > seqOut.tOut && seqOut.tVis < 0.9 && seqOut.off < 0.3 && seqOut.gap > 0.35 && seqOut.tShut > seqOut.tVis && seqOut.final === 'shut', seqOut);
check('... the camera keeps the car\'s heading while you climb out, and turns back north after', seqOut.camKept && seqOut.camBack > 0.05, { camKept: seqOut.camKept, camBack: seqOut.camBack });

// sprinting off leaves the door swinging; so does getting out of a rolling car
const left = await t.eval(async () => {
  const X = PG.gta, P = X.player, c = T.c2, d = T.front(c, -1);
  const s = X.doorSpot(c, -1); T.put(s.x, s.y); X.enterCar(c);
  await T.until(() => P.car === c && d.mode === 'shut', 3000);
  return true;
});
await t.page.keyboard.down('ShiftLeft');
await t.eval(() => PG.gta.exitCar());
await t.wait(900);
const sprint = await t.eval(() => { const d = T.front(T.c2, -1); return { mode: d.mode, a: +d.a.toFixed(2), on: !PG.gta.player.car, ev: T.ev.filter(e => e.k === 'doorClose').slice(-1)[0] }; });
await t.page.keyboard.up('ShiftLeft');
check('sprinting off leaves the door open (free to swing)', left && sprint.on && sprint.mode === 'free' && sprint.a > 0.5 && sprint.ev && sprint.ev.leave, sprint);
const rolling = await t.eval(async () => {
  const X = PG.gta, P = X.player, c = T.c2, d = T.front(c, -1);
  d.mode = 'shut'; d.a = 0; d.w = 0; X.placeCar(c, T.A.x, T.A.y + 3.75, 0);
  const s = X.doorSpot(c, -1); T.put(s.x, s.y); X.enterCar(c);
  await T.until(() => P.car === c && d.mode === 'shut', 3000);
  c.dv.vx = 6; c.dv.vy = 0;
  await T.sleep(50);
  X.exitCar();
  await T.until(() => !P.entering, 2000);
  await T.sleep(150);
  return { mode: d.mode, a: +d.a.toFixed(2), speed: +c.speed.toFixed(1), on: !P.car };
});
check('getting out of a rolling car: the door stays open and swings', rolling.on && rolling.mode === 'free' && rolling.a > 0.25, rolling);

// ---------- 4. carjacking ----------
const jack = await t.eval(async () => {
  const X = PG.gta, P = X.player; T.clean();
  const c = T.park('hatch', T.A.x + 12, T.A.y + 3.75, 0, { npcDriver: X.randomNpc(), color: '#8a1f1a' }); c.npcDriver.extra = 0; c.npcDriver.team = 'test';
  const d = T.front(c, -1), s = X.doorSpot(c, -1); T.put(s.x - 2.5, s.y - 0.5);
  await T.sleep(150);
  const rows = [], t0 = X.time; let victim = null, vAt = null;
  T.rec = () => { rows.push({ t: X.time - t0, a: d.a, ph: P.entering ? P.entering.phase : P.car === c ? 'car' : '-' }); if (!victim) { victim = X.peds.find(p => p.fromCar === c) || null; if (victim) { vAt = { t: X.time - t0, gap: T.gap(c, victim.x, victim.y), l: T.local(c, victim.x, victim.y), vOut: -(T.local(c, c.x + victim.vx, c.y + victim.vy).y) }; } } };
  X.enterCar(c);
  await T.until(() => P.car === c && d.mode === 'shut', 3500);
  await T.sleep(400); T.rec = null;
  const first = f => { const r = rows.find(f); return r ? r.t : -1; };
  const tJack = first(r => r.ph === 'jack'), tWide = first(r => r.a > 0.9), jev = T.ev.filter(e => e.k === 'carjack').length;
  return { tJack: r2(tJack), yank: r2(tWide - tJack), tCar: r2(first(r => r.ph === 'car')), victim: !!victim, vAt: vAt && { t: r2(vAt.t), gap: r2(vAt.gap), x: r2(vAt.l.x), y: r2(vAt.l.y), out: r2(vAt.vOut) }, doorX: r2(d.hx - d.len / 2), jev, inCar: P.car === c, npc: !c.npcDriver, shut: d.mode };
});
check('carjack: the door is yanked open fast (< 0.2 s)', jack.tJack >= 0 && jack.yank > 0 && jack.yank < 0.2, jack);
check('... the driver is pulled out through it and shoved away from the car', jack.victim && jack.jev >= 1 && jack.npc && jack.vAt.gap > -0.4 && jack.vAt.gap < 0.9 && jack.vAt.y < 0 && Math.abs(jack.vAt.x - jack.doorX) < 1.0 && jack.vAt.out > 2 && jack.vAt.t >= jack.tJack, jack);
check('... then the player gets in and the door shuts', jack.inCar && jack.tCar > jack.vAt.t && jack.tCar < jack.tJack + 0.8 && jack.shut === 'shut', jack);

// ---------- 5. walking round the car to the door: 8 directions, three cars ----------
const ring = async (label, make, rmax) => t.eval(async ({ make, rmax }) => {
  const X = PG.gta, P = X.player;
  const out = [];
  for (let k = 0; k < 8; k++) {
    T.clean();
    const c = new Function('X', 'T', make)(X, T);
    if (!c) return { err: 'no spot' };
    const a = k * Math.PI / 4, hl = c.len / 2, hw = c.wid / 2, l = { x: Math.cos(a) * (hl + 2.6), y: Math.sin(a) * (hw + 2.6) }, s = T.world(c, l);
    if (X.blocked(s.x, s.y, 0.45) || X.cars.some(o => o !== c && !o.removed && PG.pointInPoly(s, X.carPoly(o)))) { out.push({ k, skip: true }); X.removeCar(c); continue; }
    T.put(s.x, s.y); await T.sleep(120);
    let minGap = 9, touch = 0, stall = 0, maxStall = 0, t0 = X.time, tCar = -1, path = 0, lx = P.ped.x, ly = P.ped.y;
    T.rec = dt => {
      const e = P.entering;
      if (e && e.phase === 'walk') {
        const g = T.gap(c, P.ped.x, P.ped.y); minGap = Math.min(minGap, g); if (g < P.ped.r + 0.03) touch++;
        if (P.ped.speed < 0.5 && X.time - t0 > 0.25) { stall += dt; maxStall = Math.max(maxStall, stall); } else stall = 0;
        path += Math.hypot(P.ped.x - lx, P.ped.y - ly);
      }
      lx = P.ped.x; ly = P.ped.y;
      if (tCar < 0 && P.car === c) tCar = X.time - t0;
    };
    X.enterCar(c);
    await T.until(() => P.car === c, rmax * 1000 + 1500);
    T.rec = null;
    const e = T.ev.filter(q => q.k === 'doorOpen').slice(-1)[0];
    out.push({ k, t: r2(tCar), gap: r2(minGap), touch, stall: r2(maxStall), path: r2(path), side: e ? e.side : 0, from: Math.abs(l.y) < 0.5 ? 0 : Math.sign(l.y) });
    T.onFoot(); X.removeCar(c);
  }
  return out;
}, { make, rmax });
const R1 = await ring('sedan', "return T.park('comet', T.A.x, T.A.y + 3.75, 0);", 3);
const R2 = await ring('bus', "return T.park('bus', T.A.x, T.A.y + 3.75, Math.PI);", 3.3);
const R3 = await ring('wall', `
  const m = X.MODELS.x5, hw = m.wid / 2, hl = m.len / 2, pp = X.playerPos();
  const bs = X.city.buildings.filter(b => !b.deco && !b.place && b.x1 - b.x0 > m.len + 8).sort((a, b) => Math.hypot((a.x0 + a.x1) / 2 - pp.x, a.y1 - pp.y) - Math.hypot((b.x0 + b.x1) / 2 - pp.x, b.y1 - pp.y));
  for (const b of bs) {
    const x = (b.x0 + b.x1) / 2, y = b.y1 + hw + 0.35, poly = PG.obb(x, y, m.len, m.wid, 0);
    if (PG.cityNear(X.city, x, y, m.len + 4).some(s => PG.overlap(poly, s.poly))) continue;
    if (![[0, hw + 3], [hl + 3, 0.5], [-hl - 3, 0.5], [hl + 2.5, hw + 2.5], [-hl - 2.5, hw + 2.5], [0, hw + 1.2]].every(([dx, dy]) => !X.blocked(x + dx, y + dy, 0.7))) continue;
    if (X.cars.some(o => !o.removed && Math.hypot(o.x - x, o.y - y) < 9)) continue;
    T.A = Object.assign({}, T.A, { x, y });
    return T.park('x5', x, y, 0, { color: '#e8e8e8' });
  }
  return null;`, 3);
const wallOut = await t.eval(async () => {
  const X = PG.gta, P = X.player, A = T.A;   // still the wall spot
  T.clean();
  const c = T.park('x5', A.x, A.y, 0, { color: '#e8e8e8' }), s = T.world(c, { x: 0, y: c.wid / 2 + 2 }); T.put(s.x, s.y);
  X.enterCar(c);
  await T.until(() => P.car === c, 3500);
  await T.sleep(400);
  X.exitCar();
  const e = P.entering && P.entering.ent;
  await T.until(() => !P.entering, 2500);
  const l = T.local(c, P.ped.x, P.ped.y), R = T.front(c, 1);
  await T.sleep(500);
  return { side: e && e.side, via: !!(e && e.via), y: r2(l.y), vis: !P.ped.hidden, shut: R.mode };
});
check('... and getting out of it: across the seats and out of the passenger door', wallOut.side === 1 && wallOut.via && wallOut.y > 1.2 && wallOut.vis && wallOut.shut === 'shut', wallOut);
await t.eval(() => { T.A = T.A0; });
const sandwich = await t.eval(async () => {
  const X = PG.gta, P = X.player, A = T.A, out = [];
  for (const k of [0, 1, 2, 3]) {
    T.clean();
    const c = T.park('comet', A.x, A.y + 3.75, 0), g = 0.45;
    T.park('fjord', A.x + c.len / 2 + g + X.MODELS.fjord.len / 2, A.y + 3.75, 0); T.park('hatch', A.x - c.len / 2 - g - X.MODELS.hatch.len / 2, A.y + 3.75, 0);
    const s = T.world(c, [{ x: 1.2, y: c.wid / 2 + 1.6 }, { x: -1.2, y: c.wid / 2 + 1.4 }, { x: 0, y: c.wid / 2 + 2.4 }, { x: 0.5, y: -c.wid / 2 - 2 }][k]);
    T.put(s.x, s.y); await T.sleep(120);
    const t0 = X.time; X.enterCar(c);
    await T.until(() => P.car === c, 4500);
    const e = T.ev.filter(q => q.k === 'doorOpen').slice(-1)[0];
    out.push({ k, t: r2(P.car === c ? X.time - t0 : -1), side: e ? e.side : 0 });
    T.onFoot();
  }
  return out;
});
check('a car parked bumper to bumper: from the kerb, in through the passenger door and across; from the road, the driver door', sandwich.slice(0, 3).every(r => r.t > 0 && r.t < 2.2 && r.side === 1) && sandwich[3].t > 0 && sandwich[3].t < 2.2 && sandwich[3].side === -1, sandwich);
const all = [...R1, ...R2, ...(Array.isArray(R3) ? R3 : [])].filter(r => !r.skip);
const summ = R => Array.isArray(R) ? R.map(r => r.skip ? `${r.k}:skip` : `${r.k}:${r.t}s gap${r.gap} touch${r.touch} stall${r.stall} side${r.side}`).join(' | ') : R;
check('walking up from 8 directions round a sedan: round the corners, never through it, seated in < 3 s', R1.every(r => r.t > 0 && r.t < 3 && r.gap > 0.25 && r.touch <= 2 && r.stall < 0.3 && r.side === -1), summ(R1));
check('... round a 12 m city bus: in by the door on the side you are on (front door or the driver\'s), seated in < 3 s', R2.every(r => r.t > 0 && r.t < 3 && r.gap > 0.25 && r.touch <= 2 && r.stall < 0.3 && (!r.from || r.side === r.from)), summ(R2));
check('... an SUV parked against a wall: the passenger door and a climb across, never stuck', Array.isArray(R3) && R3.filter(r => !r.skip).length >= 4 && R3.every(r => r.skip || (r.t > 0 && r.t < 3 && r.gap > 0.2 && r.stall < 0.35 && r.side === 1)), summ(R3));
check('the approach never gets stuck behind a car (all 24 runs)', all.every(r => r.t > 0) && all.length >= 20, all.length);
const pathApi = await t.eval(() => {
  const X = PG.gta, c = T.park('comet', T.A.x + 30, T.A.y + 3.75, 0), behind = T.world(c, { x: -c.len / 2 - 1.2, y: 0 }), door = T.world(c, X.doors.entry(c, -1).stand);
  const w = X.pathAroundCar({ x: behind.x, y: behind.y, r: 0.32 }, c, door), l = T.local(c, w.x, w.y), d0 = X.pathAroundCar({ x: door.x - 2, y: door.y - 1, r: 0.32 }, c, door);
  X.removeCar(c);
  return { l: { x: r2(l.x), y: r2(l.y) }, len: r2(w.len), direct: w.direct, d0: d0.direct };
});
check('X.pathAroundCar: from behind the car the next waypoint is its rear corner on the door side; a clear line goes straight', !pathApi.direct && pathApi.l.x < -2 && pathApi.l.y < -0.9 && pathApi.len > 3 && pathApi.d0, pathApi);

// ---------- 6. a broken lock swings with the car's motion ----------
const drive = await t.eval(async () => {
  const X = PG.gta, P = X.player; T.clean();
  const c = T.park('x5', T.A.x - T.A.len / 2 + 12, T.A.y + 1.8, 0, { color: '#c9ccd1' }), s = X.doorSpot(c, -1); T.put(s.x, s.y); T.c6 = c;
  X.enterCar(c);
  await T.until(() => P.car === c && T.front(c, -1).mode === 'shut', 3000);
  const L = T.front(c, -1), R = T.front(c, 1);
  X.doors.breakLock(c, L, 0); X.doors.breakLock(c, R, 0);
  X.doors.opts.road = 0;   // no random bumps: each phase starts with both doors ajar and only the car's motion acts
  T.ajar = () => { for (const d of [L, R]) { d.a = 0.3; d.w = 0; } };
  T.ajar();
  T.rows6 = []; const t0 = X.time;
  T.rec = () => T.rows6.push({ t: X.time - t0, L: L.a, R: R.a, sp: c.speed, ax: c._dm ? c._dm.ax : 0, r: c.dv ? c.dv.r : 0, lm: L.mode });
  return { locks: [L.lock, R.lock], modes: [L.mode, R.mode] };
});
await t.hold(['KeyW', 'ShiftLeft'], 2300);
await t.eval(() => { T.mark = T.rows6.length; T.ajar(); });
await t.hold(['KeyS'], 900);
await t.eval(() => { T.mark2 = T.rows6.length; T.ajar(); });
await t.hold(['KeyW', 'ShiftLeft'], 900);
await t.eval(() => { T.mark3 = T.rows6.length; T.ajar(); });
await t.hold(['KeyW', 'KeyD'], 750);
await t.eval(() => { T.mark4 = T.rows6.length; });
await t.hold(['KeyS'], 900);
const sw = await t.eval(() => {
  T.rec = null; PG.gta.doors.opts.road = 1;
  const R = T.rows6, acc = R.slice(Math.floor(T.mark * 0.4), T.mark), brk = R.slice(T.mark, T.mark2), acc2 = R.slice(T.mark2 + 15, T.mark3), turn = R.slice(T.mark3, T.mark4);
  const late = turn.slice(Math.floor(turn.length / 2));
  const mx = (a, k) => a.length ? +Math.max(...a.map(r => r[k])).toFixed(2) : -1, mean = (a, k) => a.length ? +(a.reduce((s, r) => s + r[k], 0) / a.length).toFixed(2) : -1;
  const c = T.c6, L = T.front(c, -1), Rr = T.front(c, 1);
  return { vmax: +Math.max(...R.map(r => r.sp)).toFixed(1), accL: mean(acc, 'L'), accR: mean(acc, 'R'), brkL: mx(brk, 'L'), brkR: mx(brk, 'R'), acc2L: mean(acc2, 'L'), turnL: mean(late, 'L'), turnR: mean(late, 'R'), turnRate: mx(turn, 'r'), ax: [mx(acc, 'ax'), -mx(brk.map(r => ({ n: -r.ax })), 'n')], latched: [L.mode, Rr.mode], locks: [L.lock, Rr.lock], slams: PG.gta.doors.stats.slams };
});
check('broken locks: accelerating keeps the doors pressed shut (they lag behind)', drive.locks.every(l => !l) && sw.vmax > 10 && sw.accL < 0.2 && sw.accR < 0.2, sw);
check('... braking hard swings them open', sw.brkL > 0.45 && sw.brkR > 0.45, sw);
check('... in a right-hand bend the outside (left) door swings out, the inside one shuts', sw.turnL > 0.4 && sw.turnL > sw.turnR + 0.25 && sw.turnRate > 0.2, sw);
check('... they slam against the frame without catching (the lock is broken)', sw.latched.every(m => m !== 'shut') && sw.locks.every(l => !l) && sw.slams >= 1, sw);
await t.eval(() => { T.onFoot(); });

// ---------- 6b. a real side impact springs a lock ----------
const ram = await t.eval(async () => {
  const X = PG.gta; T.clean();
  const a = T.park('fjord', T.A.x, T.A.y + 2, 0, { color: '#8a9199' });
  let res = null;
  for (let k = 0; k < 3 && !res; k++) {
    const b = X.makeCar('hatch', a.x + 0.3, a.y - 9, Math.PI / 2, { ctrl: 'parked' }); b.tcar = true; X.toPhys(b); b.dv.vx = 0; b.dv.vy = 16;
    await T.sleep(1100);
    const left = a.doors.filter(d => d.side < 0);
    if (left.some(d => !d.lock || d.detached)) res = { tries: k + 1, doors: left.map(d => ({ lock: d.lock, gone: d.detached, mode: d.mode, a: r2(d.a) })), hp: Math.round(a.hp) };
    X.removeCar(b); X.placeCar(a, T.A.x, T.A.y + 2, 0); if (a.dv) { a.dv.vx = a.dv.vy = 0; a.dv.r = 0; }
  }
  return res || { tries: 3, doors: a.doors.map(d => ({ side: d.side, lock: d.lock })) };
});
check('a car rammed in the side at ~55 km/h: a door on that side springs its lock (or comes off)', !!ram.doors && ram.doors.some(d => d.lock === false || d.gone), ram);

// ---------- 7. a blast tears doors off: debris flies, lands, gets shoved, fades ----------
const blast = await t.eval(async () => {
  const X = PG.gta; T.clean();
  const c = T.park('x5', T.A.x, T.A.y + 3, 0, { color: '#1f4f9c' }); T.c7 = c;
  c.hp = c.maxHp = 1e6;   // keep the car itself out of it
  const n0 = X.doors.debris.length, rnd = Math.random;
  Math.random = () => 0.12;
  const w = T.world(c, { x: 0.2, y: -c.wid / 2 - 1.0 });
  try { X.explode(w.x, w.y, { power: 1.4, noFire: true }); } finally { Math.random = rnd; }
  const torn = c.doors.filter(d => d.detached), b = X.doors.debris[X.doors.debris.length - 1];
  const fly = b ? { z: r2(b.z), sp: r2(Math.hypot(b.vx, b.vy)) } : null;
  await T.sleep(1600);
  const land = b ? { z: b.z, x: b.x, y: b.y } : null;
  const left = c.doors.filter(d => d.side < 0 && !d.detached);
  // where they came down, along the blast's push: short of the car (it was blown away from them), never past it
  const ux = c.x - w.x, uy = c.y - w.y, ul = Math.hypot(ux, uy), sides = X.doors.debris.slice(n0).map(q => r2(((q.x - c.x) * ux + (q.y - c.y) * uy) / ul));
  return { torn: torn.map(d => d.role + (d.side < 0 ? 'L' : 'R')), n: X.doors.debris.length - n0, fly, land: land && { z: land.z }, sides, hw: c.wid / 2, leftOpen: left.map(d => ({ lock: d.lock, a: r2(d.a) })), hp: c.hp > 0 };
});
check('a blast beside a car tears the doors on that side off', blast.torn.length >= 1 && blast.torn.every(s => s.endsWith('L')) && blast.n === blast.torn.length, blast);
check('... they fly off as debris and land in the road, on the blast side (never through the car)', blast.fly && blast.fly.z > 0 && blast.fly.sp > 2 && blast.land && blast.land.z === 0 && blast.sides.every(y => y < -blast.hw), blast);
await t.eval(() => { PG.gta.cam.zoom = 0.45; }); await t.wait(500); await t.shot('doors-07-blast-debris');
const shove = await t.eval(async () => {
  const X = PG.gta, b = X.doors.debris[X.doors.debris.length - 1]; if (!b) return null;
  b.vx = b.vy = 0; b.w = 0; b.z = 0; b.vz = 0; b.x = T.A.x + 25; b.y = T.A.y;   // (wherever it landed: onto the clear road for this)
  const x0 = b.x, y0 = b.y, car = X.makeCar('hatch', b.x - 9, b.y, 0, { ctrl: 'parked' }); car.tcar = true; X.toPhys(car); car.dv.vx = 9;
  await T.sleep(1600);
  const moved = Math.hypot(b.x - x0, b.y - y0);
  X.removeCar(car);
  b.t = b.life - 0.05;
  await T.sleep(200);
  return { moved: r2(moved), gone: !X.doors.debris.includes(b) };
});
check('... a car drives into the debris and shoves it along; it fades after its time', shove && shove.moved > 0.8 && shove.gone, shove);

// ---------- 8. Pay 'n' Spray restores them ----------
const fixd = await t.eval(() => {
  const X = PG.gta, c = T.c7;
  X.emit('carRepaired', { car: c });
  const D = X.doors.of(c);
  return { n: D.length, ok: D.every(d => !d.detached && d.lock && d.mode === 'shut' && d.a === 0) };
});
check('a repair puts every door back, shut and locked', fixd.n === 4 && fixd.ok, fixd);

// ---------- 9. a missing driver door: straight in ----------
const missing = await t.eval(async () => {
  const X = PG.gta, P = X.player, c = T.c7, d = T.front(c, -1);
  X.doors.tear(c, d, 0, -2);
  const s = X.doorSpot(c, -1); T.put(s.x, s.y);
  await T.sleep(120);
  const t0 = X.time; X.enterCar(c);
  await T.until(() => P.car === c, 2000);
  const e = T.ev.filter(q => q.k === 'doorOpen').slice(-1)[0];
  return { t: r2(X.time - t0), wait: e && e.wait, inCar: P.car === c };
});
check('with the driver door torn off there is nothing to open: straight in', missing.inCar && missing.wait === 0 && missing.t < 0.5, missing);
await t.eval(() => T.onFoot());

// ---------- 10. bailing out at speed: the door flies open and keeps swinging ----------
const bail = await t.eval(async () => {
  const X = PG.gta, P = X.player; T.clean();
  const c = T.park('voltage', T.A.x - T.A.len / 2 + 10, T.A.y + 1.8, 0, { color: '#b0151a' }), d = T.front(c, -1), s = X.doorSpot(c, -1); T.put(s.x, s.y);
  X.enterCar(c);
  await T.until(() => P.car === c && d.mode === 'shut', 3000);
  c.dv.vx = 16; c.dv.vy = 0;
  await T.sleep(60);
  const sp = c.speed;
  X.exitCar();
  const knock = P.ped.knock > 0;
  let maxA = 0, swings = 0, last = 0, dir = 0;
  T.rec = () => { maxA = Math.max(maxA, d.a); const nd = Math.sign(d.a - last); if (nd && nd !== dir) { swings++; dir = nd; } last = d.a; };
  await T.sleep(1500);
  T.rec = null;
  return { sp: r2(sp), knock, maxA: r2(maxA), swings, mode: d.mode, lock: d.lock };
});
check('bailing out at speed: thrown out, the door flies open and keeps swinging (unlatched a while)', bail.sp > 12 && bail.knock && bail.maxA > 0.8 && bail.swings >= 2, bail);

// ---------- 11. F is ignored mid-sequence; the car leaving or wasted mid-sequence cancels cleanly ----------
const fMid = await t.eval(async () => {
  const X = PG.gta, P = X.player; T.clean();
  const c = T.park('taxi', T.A.x, T.A.y + 3.75, 0), s = X.doorSpot(c, -1); T.put(s.x, s.y); T.c11 = c;
  X.enterCar(c);
  await T.until(() => P.entering && P.entering.phase === 'open', 1500);
  return !!P.entering;
});
await t.press('KeyF');
const fMid2 = await t.eval(async () => { const X = PG.gta, P = X.player; const mid = !!P.entering; await T.until(() => P.car === T.c11, 2000); return { mid, inCar: P.car === T.c11 }; });
await t.eval(() => PG.gta.exitCar());
await t.wait(120);
await t.press('KeyF');
const fMid3 = await t.eval(async () => { const X = PG.gta, P = X.player; await T.until(() => !P.entering, 2000); await T.sleep(300); return { onFoot: !P.car && !P.entering, vis: !P.ped.hidden }; });
check('F during the sequence is ignored (getting in, and getting out)', fMid && fMid2.mid && fMid2.inCar && fMid3.onFoot && fMid3.vis, { fMid2, fMid3 });
const cancel = await t.eval(async () => {
  const X = PG.gta, P = X.player, c = T.c11; T.onFoot();
  X.placeCar(c, T.A.x, T.A.y + 3.75, 0); if (c.dv) c.dv.vx = c.dv.vy = 0;
  const s = X.doorSpot(c, -1); T.put(s.x, s.y);
  X.enterCar(c);
  await T.until(() => P.entering && P.entering.phase === 'open', 1500);
  X.toPhys(c); c.dv.vx = 11;   // someone else drives it off
  await T.sleep(250);
  const a = { entering: !!P.entering, hidden: P.ped.hidden, car: !!P.car, pc: !!P.ped.car };
  c.dv.vx = 0; X.placeCar(c, T.A.x, T.A.y + 3.75, 0);
  await T.sleep(500);
  // wasted half way in
  const s2 = X.doorSpot(c, -1); T.put(s2.x, s2.y);
  X.enterCar(c);
  await T.until(() => P.entering && P.entering.phase === 'in', 1500);
  const was = P.ped.hidden;
  P.ped.maxHp = P.ped.hp = 100; X.damagePed(P.ped, 1000, null, 'test');
  await T.sleep(100);
  const b = { was, state: P.state, entering: !!P.entering, hidden: P.ped.hidden, car: !!P.car, inside: T.gap(c, P.ped.x, P.ped.y) < 0 };
  X.respawn('wasted');
  await T.sleep(300);
  return { a, b, after: { state: P.state, hidden: P.ped.hidden, entering: !!P.entering } };
});
check('the car driven off mid-sequence: the player is left standing, visible', !cancel.a.entering && !cancel.a.hidden && !cancel.a.car && !cancel.a.pc, cancel.a);
const boom = await t.eval(async () => {
  const X = PG.gta, P = X.player; T.clean();
  const c = T.park('hatch', T.A.x + 20, T.A.y + 3.75, 0), s = X.doorSpot(c, -1); T.put(s.x, s.y);
  X.enterCar(c);
  await T.until(() => P.entering && P.entering.phase === 'in', 1500);
  const was = P.ped.hidden, hp0 = P.ped.hp;
  let knock = 0; T.rec = () => { knock = Math.max(knock, P.ped.knock || 0); };
  X.destroyCar(c, null, 'instant');
  await T.sleep(250); T.rec = null;
  return { was, wrecked: c.wrecked, entering: !!P.entering, hidden: P.ped.hidden, car: !!P.car, pc: !!P.ped.car, state: P.state, outside: T.gap(c, P.ped.x, P.ped.y) > 0, hurt: Math.round(hp0 - P.ped.hp), knock: r2(knock) };
});
check('the car blown up while getting in: caught in it (hurt), blown back out of the doorway, no stuck state', boom.was && boom.wrecked && !boom.entering && !boom.hidden && !boom.car && !boom.pc && boom.outside && boom.hurt >= 100 && boom.knock > 0, boom);
const boomOut = await t.eval(async () => {
  const X = PG.gta, P = X.player; T.clean();
  const c = T.park('hatch', T.A.x + 20, T.A.y + 3.75, 0), s = X.doorSpot(c, -1); T.put(s.x, s.y);
  X.enterCar(c); await T.until(() => P.car === c, 3000); await T.sleep(300);
  X.exitCar();
  await T.until(() => P.entering && P.entering.phase === 'out', 1500);
  const was = P.ped.hidden, hp0 = P.ped.hp;
  X.destroyCar(c, null, 'instant');
  await T.sleep(150);
  return { was, entering: !!P.entering, hidden: P.ped.hidden, pc: !!P.ped.car, outside: T.gap(c, P.ped.x, P.ped.y) > 0, hurt: Math.round(hp0 - P.ped.hp) };
});
check('... and blown up while climbing out: the same', boomOut.was && !boomOut.entering && !boomOut.hidden && !boomOut.pc && boomOut.outside && boomOut.hurt >= 100, boomOut);
check('wasted half way in: the sequence ends, the body lies outside the car, the respawn is clean', cancel.b.was && cancel.b.state === 'wasted' && !cancel.b.entering && !cancel.b.hidden && !cancel.b.car && !cancel.b.inside && cancel.after.state === 'play' && !cancel.after.hidden, cancel);
await t.eval(() => T.clean());

// ---------- 12. NPCs and a police crew leave through their doors ----------
const npc = await t.eval(async () => {
  const X = PG.gta; T.clean();
  const c = T.park('fjord', T.A.x, T.A.y + 3.75, 0, { npcDriver: X.randomNpc() }); c.npcDriver.extra = 1; c.npcDriver.team = 'test';
  const out = X.ejectOccupants(c, 'fire');
  await T.sleep(350);
  const L = T.front(c, -1), R = T.front(c, 1);
  const pos = out.map(p => { const l = T.local(c, p.x, p.y); return { x: r2(l.x), y: r2(l.y) }; });
  const pc = T.park('police', T.A.x + 14, T.A.y + 3.75, 0);
  pc.pol = { doorT: X.time, out: [{}, {}], role: 'empty' };
  await T.sleep(400);
  const pl = T.front(pc, -1), pr = T.front(pc, 1);
  return { n: out.length, L: r2(L.a), R: r2(R.a), pos, hw: c.wid / 2, cop: [r2(pl.a), r2(pr.a)], doorT: pc.pol.doorT };
});
check('people let out of a car come out through their own doors and leave them open', npc.n === 2 && npc.L > 0.8 && npc.R > 0.8 && npc.pos[0].y < -npc.hw && npc.pos[1].y > npc.hw, npc);
check('a police crew getting out flings the cruiser\'s front doors open (police.js no longer draws its own)', npc.cop[0] > 0.8 && npc.cop[1] > 0.8 && npc.doorT < -50, npc);

// ---------- 13. a parked car with a door left open: driven off, the door slams shut ----------
const shop = await t.eval(async () => {
  const X = PG.gta; T.clean();
  const keep = X.doors.opts.parkedOpen; X.doors.opts.parkedOpen = 1;
  const c = X.makeCar('regret', T.A.x - 20, T.A.y + 1.8, 0, { ctrl: 'parked' }); c.tcar = true; X.doors.of(c);
  X.doors.opts.parkedOpen = keep;
  const d = c.dShop && c.dShop.d, a0 = d ? r2(d.a) : 0, m0 = d && d.mode;
  T.c13 = c;
  await T.sleep(300);
  X.toPhys(c);
  c.ai = { owner: 'test', drive: () => ({ fwd: 1, thrMax: 1, steerAbs: 0 }) };
  const ok = await T.until(() => d && d.mode === 'shut', 3000);
  c.ai = null;
  return { open: !!d, kind: d && d.kind, a0, m0, shut: ok, mode: d && d.mode, sp: r2(c.speed), bags: !c.dShop };
});
check('now and then a parked car has a door open (shopping on the kerb); when it drives off the door swings shut and catches', shop.open && shop.a0 > 0.5 && shop.m0 === 'hold' && shop.shut && shop.bags, shop);

// ---------- 13b. boxed in: no way to a door -> give up, never through another car; NPCs never put in a wall ----------
const boxed = await t.eval(async () => {
  const X = PG.gta, P = X.player; T.clean();
  const m = X.MODELS.comet, pp = X.playerPos();
  const bs = X.city.buildings.filter(b => !b.deco && !b.place && b.x1 - b.x0 > m.len * 3 + 6).sort((a, b) => Math.hypot((a.x0 + a.x1) / 2 - pp.x, a.y1 - pp.y) - Math.hypot((b.x0 + b.x1) / 2 - pp.x, b.y1 - pp.y));
  let w = null;
  for (const b of bs) {
    const x = (b.x0 + b.x1) / 2, y = b.y1; let ok = true;
    for (let dx = -m.len * 1.5 - 3; dx <= m.len * 1.5 + 3; dx += 1) for (const dy of [0.6, 1.5, 2.5, 3.5, 4.5, 6]) if (X.blocked(x + dx, y + dy, 0.3)) ok = false;
    if (ok) { w = { x, y }; break; }
  }
  if (!w) return { err: 'no wall' };
  T.A = Object.assign({}, T.A, { x: w.x, y: w.y });
  const y = w.y + m.wid / 2 + 0.3, c = T.park('comet', w.x, y, 0), side = T.park('fjord', w.x, y + m.wid / 2 + 0.4 + X.MODELS.fjord.wid / 2, 0);
  const others = [side, T.park('hatch', w.x + m.len / 2 + 0.3 + X.MODELS.hatch.len / 2, y, 0), T.park('hatch', w.x - m.len / 2 - 0.3 - X.MODELS.hatch.len / 2, y, 0)];
  T.put(w.x - 1, side.y + side.wid / 2 + 1.2);
  await T.sleep(150);
  let inside = 0; const t0 = X.time;
  T.rec = () => { if (!P.ped.hidden && [c, ...others].some(o => T.gap(o, P.ped.x, P.ped.y) < 0.05)) inside++; };
  X.enterCar(c);
  await T.until(() => !P.entering, 6000);
  T.rec = null;
  const res = { t: r2(X.time - t0), inCar: P.car === c, inside, vis: !P.ped.hidden };
  // an NPC ejected on the walled side comes out where there is room, not in the wall
  T.onFoot(); X.removeCar(side);
  c.npcDriver = X.randomNpc(); c.npcDriver.extra = 1; c.npcDriver.team = 'test';
  const out = X.ejectOccupants(c, 'fire');
  await T.sleep(50);
  res.npcs = out.map(p => ({ wall: !!X.blocked(p.x, p.y, 0.2), gap: r2(T.gap(c, p.x, p.y)) }));
  T.A = T.A0;
  return res;
});
check('a car hemmed in on every side: the player gives up within ~3 s ("Can\'t get to the door"), never slides through the cars round it', !boxed.err && !boxed.inCar && boxed.t < 3.6 && boxed.inside === 0 && boxed.vis, boxed);
check('... and people let out of it on its walled side step out where there is room', !boxed.err && boxed.npcs.length === 2 && boxed.npcs.every(q => !q.wall && q.gap > 0), boxed.npcs);

// ---------- 13c. big crashes bend the body: a lock lets go now and then even far from the hit ----------
const smash = await t.eval(async () => {
  const X = PG.gta; T.clean();
  const pp = X.playerPos(), m = X.MODELS.comet;
  const bs = X.city.buildings.filter(b => !b.deco && !b.place && b.x1 - b.x0 > 10).sort((a, b) => Math.hypot((a.x0 + a.x1) / 2 - pp.x, a.y1 - pp.y) - Math.hypot((b.x0 + b.x1) / 2 - pp.x, b.y1 - pp.y));
  let w = null;
  for (const b of bs) { const x = (b.x0 + b.x1) / 2, y = b.y1; let ok = true; for (let dx = -4; dx <= 4; dx++) for (const dy of [0.6, 2, 4, 6, 8]) if (X.blocked(x + dx, y + dy, 0.3)) ok = false; if (ok) { w = { x, y }; break; } }
  if (!w) return { err: 'no wall' };
  T.A = Object.assign({}, T.A, { x: w.x, y: w.y });
  let broken = 0, slow = 0;
  for (let k = 0; k < 6; k++) {
    const c = T.park('comet', w.x, w.y + 4.4, -Math.PI / 2); X.doors.of(c); X.toPhys(c); c.dv.vx = 0; c.dv.vy = -23;
    await T.sleep(600);
    broken += c.doors.filter(d => !d.lock || d.detached).length; X.removeCar(c);
    const c2 = T.park('comet', w.x, w.y + 4.4, -Math.PI / 2); X.doors.of(c2); X.toPhys(c2); c2.dv.vx = 0; c2.dv.vy = -7;   // a bump
    await T.sleep(600);
    slow += c2.doors.filter(d => !d.lock || d.detached).length; X.removeCar(c2);
  }
  T.A = T.A0;
  return { broken, slow };
});
check('head-on into a wall at ~80 km/h springs a door now and then; a 25 km/h bump never does', !smash.err && smash.broken >= 1 && smash.slow === 0, smash);

// ---------- sound on: every door noise plays without a hitch ----------
const snd = await t.eval(async () => {
  const X = PG.gta; T.clean();
  PG.audio.unlock && PG.audio.unlock(); PG.audio.setMuted(false);
  const live = !!PG.audio.kit();
  const c = T.park('comet', T.A.x, T.A.y + 3.75, 0), v = T.park('boxvan', T.A.x + 12, T.A.y + 3.75, 0), b = T.park('bus', T.A.x - 14, T.A.y + 3.75, 0);
  T.put(T.A.x, T.A.y + 1);
  const L = T.front(c, -1), R = T.front(c, 1);
  X.doors.open(c, L, { then: 'hold' }); await T.sleep(150);                 // creak
  X.doors.open(c, R, { fast: true, then: 'hold' }); await T.sleep(250);    // yank
  X.doors.close(c, L); await T.sleep(300);                                 // thunk
  X.doors.breakLock(c, R, -8); await T.sleep(400);                         // slam against the frame
  X.doors.open(v, v.doors.find(d => d.kind === 'slide'), { then: 'hold' }); X.doors.open(b, b.doors[0], { then: 'hold' }); await T.sleep(500);   // slide, hiss
  X.doors.tear(c, c.doors[2], 3, -3); await T.sleep(900);                 // rip, clatter
  PG.audio.setMuted(true);
  return { live, slams: X.doors.stats.slams, torn: c.doors[2].detached };
});
check('sound on: creak, yank, thunk, slam, slide, hiss, rip and clatter all play without errors', snd.torn && t.errors.length === 0, Object.assign(snd, { errors: t.errors.slice(0, 2) }));

// ---------- screenshots: getting in and out, frame by frame, normal and zoomed in ----------
async function film(name, zoom, setupFn, actFn, frames, gap) {
  await t.eval(setupFn, zoom);
  await t.wait(900);
  await t.eval(actFn);
  for (let i = 0; i < frames; i++) { await t.shot(`doors-${name}-${String(i).padStart(2, '0')}`); await t.wait(gap); }
}
const stage = zoom => {
  const X = PG.gta; T.clean();
  const c = T.park('comet', (T.A.x - 32), T.A.y + 3.75, 0, { color: '#d64a3b' }); T.cf = c;
  T.park('fjord', (T.A.x - 32) + 9, T.A.y + 3.75, 0, { color: '#8a9199' }); T.park('bambino', (T.A.x - 32) - 8, T.A.y + 3.75, 0, { color: '#9fd0c8' });
  const s = T.world(c, { x: -0.6, y: c.wid / 2 + 2.2 }); T.put(s.x, s.y); X.cam.x = c.x; X.cam.y = c.y;
  X.cam.zoom = zoom; X.cam.span = 27 * zoom; X.cam.mode = 'fixed';
};
await film('in', 1, stage, () => PG.gta.enterCar(T.cf), 14, 40);
await t.eval(() => { PG.gta.cam.mode = 'fixed'; }); await t.wait(600);
await film('out', 1, () => { PG.gta.cam.mode = 'fixed'; }, () => PG.gta.exitCar(), 10, 40);
await film('in-zoom', 10 / 27, stage, () => PG.gta.enterCar(T.cf), 16, 30);
await t.eval(() => { PG.gta.cam.mode = 'fixed'; }); await t.wait(600);
await film('out-zoom', 10 / 27, () => { PG.gta.cam.mode = 'fixed'; }, () => PG.gta.exitCar(), 12, 30);
// a carjack and a bus, zoomed in
await film('jack-zoom', 10 / 27, z => {
  const X = PG.gta; T.clean();
  const c = T.park('taxi', (T.A.x - 32), T.A.y + 3.75, 0, { npcDriver: X.randomNpc() }); c.npcDriver.extra = 0; T.cf = c;
  const s = T.world(c, { x: -2.6, y: -c.wid / 2 - 1.2 }); T.put(s.x, s.y); X.cam.x = c.x; X.cam.y = c.y; X.cam.zoom = z; X.cam.span = 27 * z;
}, () => PG.gta.enterCar(T.cf), 14, 30);
await film('bus', 0.6, z => {
  const X = PG.gta; T.clean();
  const c = T.park('bus', (T.A.x - 32), T.A.y + 3.75, 0); T.cf = c;
  const s = T.world(c, { x: 1, y: c.wid / 2 + 2 }); T.put(s.x, s.y); X.cam.x = c.x; X.cam.y = c.y; X.cam.zoom = z; X.cam.span = 27 * z;
}, () => PG.gta.enterCar(T.cf), 12, 90);
// a van with everything open, a broken door flapping on the move
await film('van', 0.45, z => {
  const X = PG.gta; T.clean();
  const v = T.park('boxvan', (T.A.x - 32) - 6, T.A.y + 3.75, 0), a = T.park('ambulance', (T.A.x - 32) + 4, T.A.y + 3.75, 0), f = T.park('furia', (T.A.x - 32) + 4, T.A.y - 3.75, Math.PI, { color: '#f2c230' });
  for (const c of [v, a, f]) for (const d of c.doors) X.doors.open(c, d, { then: 'hold' });
  T.put((T.A.x - 32) - 1, T.A.y); X.cam.x = (T.A.x - 32); X.cam.y = T.A.y; X.cam.zoom = z; X.cam.span = 27 * z;
}, () => 0, 2, 400);
if (await t.eval(() => !!PG.gta.MODELS.tank)) {
  await film('tank', 0.5, z => {
    const X = PG.gta; T.clean();
    const c = T.park('tank', (T.A.x - 32), T.A.y + 3, 0); T.cf = c;
    const s = T.world(c, { x: 0, y: c.wid / 2 + 2 }); T.put(s.x, s.y); X.cam.x = c.x; X.cam.y = c.y; X.cam.zoom = z; X.cam.span = 27 * z;
  }, () => PG.gta.enterCar(T.cf), 10, 90);
  const tank = await t.eval(async () => { await T.until(() => PG.gta.player.car === T.cf, 3000); return { in: PG.gta.player.car === T.cf, hatch: T.cf.doors[0].mode }; });
  check('the tank: in through the turret hatch', tank.in, tank);
}
await t.eval(() => { T.onFoot(); PG.gta.cam.mode = 'follow'; PG.gta.cam.zoom = 1; });

// ---------- 14. a second game ----------
const g2 = await t.eval(async () => {
  const X = PG.gta;
  X.stop(); X.start(PG.GTA_DEF);
  await T.sleep(600);
  return { debris: X.doors.debris.length, mod: X.has('doors'), cars: X.cars.length };
});
await setup();
const g2b = await t.eval(async () => {
  const X = PG.gta, P = X.player; T.clean();
  const c = T.park('hatch', T.A.x, T.A.y + 3.75, 0), s = X.doorSpot(c, 1); T.put(s.x, s.y);
  X.enterCar(c);
  const ok = await T.until(() => P.car === c, 3000);
  return { ok, side: T.ev.filter(e => e.k === 'doorOpen').slice(-1)[0].side };
});
check('a second game starts clean and getting in still works', g2.debris === 0 && g2.mod && g2.cars > 10 && g2b.ok, { g2, g2b });

// ---------- 15. cost with 60 cars, some doors open and flapping ----------
const perf = await t.eval(async () => {
  const X = PG.gta, P = X.player; T.clean();
  const ids = ['hatch', 'comet', 'taxi', 'x5', 'fjord', 'bambino', 'boxvan', 'police', 'voltage', 'ambulance'];
  let n = 0;
  for (let i = 0; i < 15 && n < 60; i++) for (const dy of [-5.4, -1.8, 1.8, 5.4]) {
    const c = T.park(ids[n % ids.length], T.A.x - 55 + i * 7.8, T.A.y + dy, dy < 0 ? Math.PI : 0); n++;
    if (n % 4 === 0) { const d = c.doors[0]; X.doors.breakLock(c, d, 3); }
    if (n % 7 === 0) X.doors.open(c, c.doors[c.doors.length - 1], { then: 'hold' });
    if (n % 5 === 0) { X.toPhys(c); c.ai = { owner: 'test', drive: () => { const s = Math.sin(X.time * 3 + c.id); return { fwd: s > 0 ? 1 : 0, rev: s < 0 ? 1 : 0, thrMax: 0.35, steerAbs: 0 }; } }; }
  }
  T.put(T.A.x, T.A.y + T.A.w / 2 + 1); X.cam.zoom = 1.3;
  await T.sleep(800);
  const m = X.modules.find(q => q.name === 'doors'), oTick = m.tick, oCars = m.render.cars;
  const fpsOf = ms => new Promise(r => { let n = 0; const t0 = performance.now(); (function f() { n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else r(n / ((performance.now() - t0) / 1000)); })(); });
  m.render.cars = () => {};   // the same scene without drawing any doors
  const fpsOff = await fpsOf(2000);
  let ms = 0, frames = 0;
  m.tick = function (dt) { const t0 = performance.now(); oTick.call(this, dt); ms += performance.now() - t0; };
  m.render.cars = function (...a) { const t0 = performance.now(); oCars.apply(this, a); ms += performance.now() - t0; frames++; };
  const fps = await fpsOf(2500);
  m.tick = oTick; m.render.cars = oCars;
  const inView = X.cars.filter(c => !c.removed && X.inView(c.x, c.y, 2)).length;
  for (const c of X.cars) c.ai = null;
  return { cars: n, inView, ms: +(ms / Math.max(1, frames)).toFixed(2), fps: Math.round(fps), fpsOff: Math.round(fpsOff), open: X.cars.filter(c => c._dOpen).length };
});
await t.shot('doors-15-sixty-cars');
check('60 cars with doors open and flapping: the doors module costs < 1.5 ms a frame and does not drag the frame rate down', perf.cars === 60 && perf.inView >= 40 && perf.ms < 1.5 && perf.fps >= perf.fpsOff * 0.85 && perf.fps >= 20, perf);

check('no console errors', t.errors.length === 0, t.errors.slice(0, 5).join(' | '));
console.log(fails ? `${fails} check(s) FAILED` : 'all doors checks passed');
await t.close();
process.exit(fails ? 1 : 0);
