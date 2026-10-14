// Police test: wanted level from crimes (witnessed, reported, cop crimes), patrols and the station, pursuit
// (cruisers close in, crews get out, box in, keep up with a fleeing car), arrests on foot and at the car
// door, decay out of sight, X.police.clear(), roadblocks and stingers, SWAT, the army, the helicopter (and
// shooting it down), stake-outs and raids indoors, radio, sirens (horn toggle, audio, pause), stealing a
// cruiser, respray, a second game and fps in a big chase.
// Usage: node tests/police.test.mjs <built.html> <screenshot dir>
import { launch } from './harness.mjs';
const t = await launch({ html: process.argv[2], out: process.argv[3] });
let failed = 0;
const check = (name, ok, info) => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info !== undefined ? ' — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`); };
const snap = async name => { await t.eval(() => { PG.game.status = 'freeze'; }); await t.wait(120); await t.shot(name); await t.eval(() => { PG.game.status = 'play'; }); };
// poll a condition inside the page every frame, up to ms; resolves with the last value
const until = (fn, ms) => t.eval(([src, ms]) => new Promise(r => { const f = new Function('return (' + src + ')()'); const t0 = performance.now(); (function g() { let v; try { v = f(); } catch (e) { v = null; } if (v || performance.now() - t0 > ms) r(v); else requestAnimationFrame(g); })(); }), [fn.toString(), ms]);

await t.eval(() => {
  const X = PG.gta, W = window, P = X.player;
  W.__ev = { wanted: [], busted: 0, radio: [], roadblock: 0, heliDown: 0, tyres: 0 };
  X.on('wanted', e => W.__ev.wanted.push(e.level));
  X.on('busted', () => W.__ev.busted++);
  X.on('policeRadio', e => W.__ev.radio.push(e.text));
  X.on('roadblock', () => W.__ev.roadblock++);
  X.on('heliDown', () => W.__ev.heliDown++);
  X.on('tyresPopped', () => W.__ev.tyres++);
  W.__tune0 = Object.assign({}, X.police.tune);
  // remove every police unit (keeps the parked station cruisers unless all)
  W.__purge = (all) => {
    const S = X.police._S;
    X.police.clear();
    for (const c of S.cars) if (all || c.pol.role !== 'parked') X.removeCar(c);
    for (const p of S.cops) p.removed = true;
    for (const p of X.peds) if (!p.isPlayer && (p.team === 'cop' || p.team === 'army')) p.removed = true;
    const keep = S.cars.filter(c => !all && c.pol.role === 'parked' && !c.removed);
    S.cars.length = 0; S.cars.push(...keep); S.cops.length = 0; S.heli = null; S.blocks.length = 0; S.spawnT = 0; S.arrest = S.arrestCar = 0;
    Object.assign(X.police.tune, W.__tune0);
  };
  // the player on foot in the middle of a straight horizontal road, nothing around
  W.__arena = (i, j, keepPolice) => {
    const C = X.city;
    if (P.car) { const c = P.car; c.driver = null; P.car = null; P.ped.car = null; P.ped.hidden = false; }
    if (X.scene) X.leaveScene();
    P.state = 'play'; P.entering = null;
    i = Math.max(1, Math.min(C.xs.length - 3, i)); j = Math.max(1, Math.min(C.ys.length - 2, j));
    const x = (C.xs[i] + C.xs[i + 1]) / 2, y = C.ys[j] + 2;
    for (const c of X.cars) if (Math.hypot(c.x - x, c.y - y) < 120 && !c.owner) X.removeCar(c);
    for (const p of X.peds) if (!p.isPlayer && Math.hypot(p.x - x, p.y - y) < 60) p.removed = true;
    if (!keepPolice) W.__purge();
    Object.assign(P.ped, { x, y, vx: 0, vy: 0, th: 0, knock: 0, hp: 100, armor: 0, dead: false });
    X.cam.x = x; X.cam.y = y;
    return { x, y };
  };
  W.__drive = (model, x, y, th) => {
    const c = X.makeCar(model || 'hatch', x, y, th || 0, model === 'tank' ? {} : { color: '#d64a3b' }); X.toPhys(c);
    c.driver = P.ped; P.ped.car = c; P.ped.hidden = true; P.car = c;
    return c;
  };
  W.__near = () => { const p = X.playerPos(); let best = 1e9; for (const c of X.police._S.cars) if (c.pol.role === 'pursuit' && !c.removed) best = Math.min(best, Math.hypot(c.x - p.x, c.y - p.y)); return Math.round(best); };
});

// ---------- 1. API and the station ----------
const api = await t.eval(() => {
  const X = PG.gta, Q = X.police;
  return { fns: ['addHeat', 'setWanted', 'clear', 'alert'].every(k => typeof Q[k] === 'function'), units: Array.isArray(Q.units), wanted: X.player.wanted, flash: X.player.wantedFlash,
    parked: Q.cars.filter(c => c.pol.role === 'parked' && c.model.kind === 'police').length, station: !!X.places.police };
});
check('X.police API (addHeat, setWanted, clear, alert, units) and 0 stars at start', api.fns && api.units && api.wanted === 0 && api.flash === false, api);
check('two cruisers parked outside the police station', !api.station || api.parked === 2, api);

// ---------- 2. patrols ----------
await t.eval(() => window.__arena(5, 5));
const patrol = await until(() => { const S = PG.gta.police._S; const cars = S.cars.filter(c => c.pol.role === 'patrol' && c.ctrl === 'path' && c.npcDriver && c.npcDriver.team === 'cop').length, foot = S.cops.filter(p => p.ai.state === 'patrol').length; return cars >= 2 && foot >= 2 && { cars, foot }; }, 6000);
check('patrol cruisers drive in lane traffic and officers walk the sidewalks at 0 stars', !!patrol, patrol);

// ---------- 3. crime -> heat -> stars ----------
const cr = await t.eval(() => {
  const X = PG.gta, P = X.player, o = {}, W = window;
  W.__arena(3, 3);
  const p = P.ped;
  X.crime('carjack', p.x, p.y); o.carjack = [X.police.heat, P.wanted];
  X.crime('killPed', p.x, p.y); o.killPed = [X.police.heat, P.wanted];
  W.__purge();
  // a cop on the sidewalk 12 m away, with a clear view
  const cop = X.police.spawnCop(p.x + 12, p.y, 'cop', 'patrol'); cop.ai.patrol = true;
  X.crime('assault', p.x, p.y); o.witnessed = [Math.round(X.police.heat), P.wanted, cop.ai.state];
  W.__purge();
  X.crime('killCop', p.x, p.y); o.killCop = P.wanted;
  X.crime('stealCopCar', p.x, p.y); o.copCar = P.wanted;
  for (let k = 0; k < 12; k++) { X.police._S.crimeCd = {}; X.crime('killCop', p.x, p.y); }
  o.max = P.wanted; o.heat = Math.round(X.police.heat);
  W.__purge();
  X.crime('heist', p.x, p.y); o.heist = P.wanted;
  W.__purge();
  X.police.setWanted(4); o.set4 = P.wanted; X.police.setWanted(2); o.set2 = P.wanted; X.police.addHeat(1e6); o.add = P.wanted;
  W.__purge(); o.cleared = P.wanted;
  return o;
});
check('unwitnessed petty crimes build heat but no star', cr.carjack[0] > 0 && cr.carjack[1] === 0 && cr.killPed[1] === 0, cr);
check('a crime a cop sees is at least one star and the cop gives chase', cr.witnessed[1] >= 1 && cr.witnessed[2] === 'chase', cr.witnessed);
check('cop crimes count much more (killCop >= 2 stars, stealing a cruiser too)', cr.killCop >= 2 && cr.copCar >= 2, cr);
check('wanted level caps at 6 stars', cr.max === 6, cr);
check('a heist is worth 3 stars; setWanted/addHeat/clear work', cr.heist >= 3 && cr.set4 === 4 && cr.set2 === 2 && cr.add === 6 && cr.cleared === 0, cr);

// ---------- 4. arrest on foot at 1 star ----------
const pos1 = await t.eval(() => { const W = window, X = PG.gta; const a = W.__arena(4, 6); X.police.tune.maxCars = 0; X.police.setWanted(1); const cop = X.police.spawnCop(a.x + 4, a.y, 'cop', 'chase'); W.__ev.busted = 0; return a; });
const bust1 = await until(() => PG.gta.player.state === 'busted' && { busted: window.__ev.busted, wanted: PG.gta.player.wanted }, 5000);
check('a cop arrests the player on foot at 1 star (BUSTED)', !!bust1 && bust1.busted === 1, bust1);
check('busted clears the wanted level', !!bust1 && bust1.wanted === 0, bust1);
await t.wait(200); await t.shot('p01-busted-foot');
const resp = await until(() => PG.gta.player.state === 'play' && (() => { const X = PG.gta, d = X.places.police.door; return { d: Math.round(Math.hypot(X.player.ped.x - d.x, X.player.ped.y - d.y)), wanted: X.player.wanted }; })(), 5000);
check('after the bust the player walks out of the police station', !!resp && resp.d < 6 && resp.wanted === 0, resp);

// ---------- 5. busted in a stopped car ----------
await t.eval(() => { const W = window, X = PG.gta; const a = W.__arena(6, 4); X.police.tune.maxCars = 0; const c = W.__drive('hatch', a.x, a.y, 0); X.police.setWanted(3); X.police.spawnCop(a.x - 8, a.y - 4, 'cop', 'chase'); W.__ev.busted = 0; });
const mid = await until(() => PG.gta.police.arrest > 0.3 && PG.gta.police.arrest, 6000);
if (mid) await snap('p02-door-arrest');
const bust2 = await until(() => PG.gta.player.state === 'busted' && window.__ev.busted, 6000);
check('a cop at the driver door of a stopped car busts the player (any star level)', !!bust2, { mid, bust2 });
await until(() => PG.gta.player.state === 'play', 5000);

// driver door against a wall: they cannot get you out
const wall = await t.eval(() => {
  const X = PG.gta, W = window, C = X.city;
  W.__arena(5, 7);
  // a building with a long west wall facing the sidewalk
  const b = C.buildings.find(b => !b.deco && !b.place && b.y1 - b.y0 > 14 && X.blockAt(b.x0 - 3, (b.y0 + b.y1) / 2) && !X.blocked(b.x0 - 2.6, (b.y0 + b.y1) / 2, 1.2));
  if (!b) return null;
  const x = b.x0 - 1.0, y = (b.y0 + b.y1) / 2, P = X.player;
  for (const c of X.cars) if (Math.hypot(c.x - x, c.y - y) < 20 && !c.owner) X.removeCar(c);
  for (const p of X.peds) if (!p.isPlayer && Math.hypot(p.x - x, p.y - y) < 30) p.removed = true;
  P.ped.x = x - 3; P.ped.y = y;
  const c = W.__drive('hatch', x, y, Math.PI / 2);   // heading south: the driver's side is the wall
  X.cam.x = x; X.cam.y = y;
  X.police.tune.maxCars = 0; X.police.setWanted(1);
  X.police.spawnCop(x - 5, y + 4, 'cop', 'chase'); X.police.spawnCop(x - 5, y - 4, 'cop', 'chase');
  return { x: Math.round(x), y: Math.round(y) };
});
if (wall) {
  await t.wait(3500);
  const w2 = await t.eval(() => ({ state: PG.gta.player.state, arrest: +PG.gta.police.arrest.toFixed(2) }));
  check('a driver door blocked by a wall cannot be opened (no bust)', w2.state === 'play', w2);
} else console.log('SKIP wall test (no suitable building)');

// ---------- 6. pursuit: cruisers close in, crews get out ----------
await t.eval(() => { const W = window, X = PG.gta; const a = W.__arena(5, 5); W.__drive('hatch', a.x, a.y, 0); X.police.setWanted(2); X.clock = 23 * 60; });
const t0 = Date.now();
const closed = await until(() => window.__near() < 30 && window.__near(), 16000);
const pur = await t.eval(() => { const S = PG.gta.police._S; return { pursuit: S.cars.filter(c => c.pol.role === 'pursuit' || c.pol.role === 'empty').map(c => ({ siren: c.siren, ctrl: c.ctrl, ai: c.ai ? c.ai.owner : c.pol.role })), near: window.__near() }; });
check('pursuit cruisers spawn with sirens and drive with physics', pur.pursuit.length >= 1 && pur.pursuit.every(c => c.ctrl === 'phys' && (c.siren || c.ai === 'empty')), pur);
check('cruisers close in on the suspect', !!closed, { closed, s: (Date.now() - t0) / 1000 });
const out = await until(() => { const S = PG.gta.police._S; const n = S.cops.filter(p => p.ai.car && p.ai.state === 'chase').length; return n >= 1 && n; }, 7000);
check('the crew jumps out next to the stopped suspect', !!out, out);
await t.wait(500);
await snap('p03-boxed-in');

// ---------- 7. fleeing: they keep up ----------
const flee = await t.eval(async () => {
  const W = window, X = PG.gta, P = X.player, C = X.city;
  // long straight run east along the middle avenue
  const j = Math.floor(C.ys.length / 2), x = C.xs[1] + 10, y = C.ys[j] + 2;
  for (const c of X.cars) if (Math.abs(c.y - y) < 14 && !c.owner) X.removeCar(c);
  W.__purge();
  if (P.car) { P.car.driver = null; P.car = null; P.ped.car = null; P.ped.hidden = false; }
  P.ped.x = x; P.ped.y = y; P.state = 'play';
  const c = W.__drive('voltage', x, y, 0); X.cam.x = x; X.cam.y = y;
  X.police.setWanted(4); X.police.tune.arrestCar = 99;
  W.__gunner = 0; if (!W.__gunHook) { W.__gunHook = true; X.on('gunfire', e => { if (e.by && e.by.kind === 'gunner') W.__gunner++; }); }
  // two cruisers right behind
  X.police.spawnCar('pursuit', 'cop', x - 25, y - 3, 0); X.police.spawnCar('pursuit', 'cop', x - 35, y + 3, 0);
  W.__fleeX = x;
  return { x, y };
});
await t.hold(['ShiftLeft', 'KeyW'], 4000);
await snap('p04-chase');
const fl = await t.eval(() => { const X = PG.gta, P = X.player; return { speed: Math.round(P.car.speed), near: window.__near(), dx: Math.round(P.car.x - window.__fleeX), sirens: X.police.cars.filter(c => c.siren && c.pol.role === 'pursuit').length, gunner: window.__gunner, guns: X.has('weapons') }; });
check('cruisers keep up with a fleeing car', fl.speed > 14 && fl.dx > 30 && fl.near < 45 && fl.sirens >= 2, fl);
if (fl.guns) check('at 4 stars the passenger shoots out of the cruiser window', fl.gunner > 0, fl);
await t.eval(() => window.__purge());

// ---------- 8. decay out of sight; being seen keeps the stars ----------
const dec = await t.eval(async () => {
  const W = window, X = PG.gta, P = X.player;
  W.__arena(2, 8);
  Object.assign(X.police.tune, { grace: 0.6, graceStar: 0.2, decay: 0.8, decayFar: 0.3, maxCars: 0, maxCops: 0, patrolFoot: 0 });
  X.police.setWanted(2);
  let flashed = false;
  const t0 = performance.now();
  await new Promise(r => { (function g() { if (P.wantedFlash) flashed = true; if (P.wanted === 0 || performance.now() - t0 > 6000) r(); else requestAnimationFrame(g); })(); });
  const o = { flashed, wanted: P.wanted, s: Math.round(performance.now() - t0) / 1000 };
  // now a cop watching from 10 m: the stars stay
  X.police.setWanted(1);
  const cop = X.police.spawnCop(P.ped.x + 10, P.ped.y, 'cop', 'guard'); cop.ai.px = cop.x; cop.ai.py = cop.y;
  X.police.tune.arrestFoot = 99;
  await new Promise(r => setTimeout(r, 2500));
  o.seenWanted = P.wanted; o.seenFlash = P.wantedFlash;
  W.__purge();
  return o;
});
check('stars flash out of sight and the heat decays to 0', dec.flashed && dec.wanted === 0, dec);
check('a cop watching keeps the stars from fading', dec.seenWanted >= 1 && !dec.seenFlash, dec);

// ---------- 9. clear() ----------
const clr = await t.eval(async () => {
  const W = window, X = PG.gta, P = X.player;
  const a = W.__arena(5, 5); W.__drive('hatch', a.x, a.y, 0);
  X.police.setWanted(3);
  X.police.spawnCar('pursuit', 'cop'); X.police.spawnCar('pursuit', 'cop');
  await new Promise(r => setTimeout(r, 800));
  X.police.clear();
  await new Promise(r => setTimeout(r, 300));
  const S = X.police._S;
  return { wanted: P.wanted, flash: P.wantedFlash, sirens: S.cars.filter(c => !c.removed && c.siren && c.pol.role !== 'block').length, pursuit: S.cars.filter(c => c.pol.role === 'pursuit').length, heat: X.police.heat };
});
check('X.police.clear() ends the chase (0 stars, sirens off, units stand down)', clr.wanted === 0 && !clr.flash && clr.sirens === 0 && clr.pursuit === 0 && clr.heat === 0, clr);

// ---------- 10. roadblock and stinger ----------
const rb = await t.eval(() => {
  const W = window, X = PG.gta, P = X.player, C = X.city;
  W.__purge();
  const j = Math.floor(C.ys.length / 2) - 1, x = C.xs[2] + 20, y = C.ys[j] + 2;
  for (const c of X.cars) if (Math.abs(c.y - y) < 14 && !c.owner) X.removeCar(c);
  if (P.car) { P.car.driver = null; P.car = null; P.ped.car = null; P.ped.hidden = false; }
  P.ped.x = x; P.ped.y = y;
  const c = W.__drive('hatch', x, y, 0); X.cam.x = x; X.cam.y = y;
  X.police.tune.maxCars = 0;
  X.police.setWanted(3);
  const b = X.police.roadblock();
  if (!b) return null;
  window.__rb = b;
  return { cars: b.cars.length, perp: b.cars.every(q => Math.abs(Math.cos(q.th)) < 0.4), cops: b.cops.length, strip: !!b.strip, ahead: Math.round(b.x - x), ev: W.__ev.roadblock };
});
check('a roadblock: cruisers across the road ahead, officers behind, a stinger in front', !!rb && rb.cars >= 2 && rb.perp && rb.cops >= 4 && rb.strip && rb.ahead > 60 && rb.ev >= 1, rb);
if (rb) {
  await t.eval(() => { const X = PG.gta, b = window.__rb, c = X.player.car; X.placeCar(c, b.x - 24, b.y, 0); X.cam.x = b.x - 12; X.cam.y = b.y; });
  await t.wait(400);
  await snap('p05-roadblock');
  const st = await t.eval(() => {
    const X = PG.gta, b = window.__rb, c = X.player.car, s = b.strip;
    X.placeCar(c, s.x - 6, s.y, 0); c.dv.vx = 15; c.dv.vy = 0;
    return { mu0: c.mu == null ? 1 : c.mu };
  });
  const popped = await until(() => { const c = PG.gta.player.car; return c && c.polFlat > 0 && { mu: +c.mu.toFixed(2), flat: +c.polFlat.toFixed(1), ev: window.__ev.tyres }; }, 2000);
  check('driving over the stinger shreds the tyres (less grip)', !!popped && popped.mu < 0.8 && popped.ev >= 1, { st, popped });
  await t.wait(600);
  await snap('p06-stinger');
}

// ---------- 11. SWAT at 4, army at 6 ----------
const swat = await t.eval(async () => {
  const W = window, X = PG.gta;
  const a = W.__arena(4, 4); W.__drive('hatch', a.x, a.y, 0);
  X.police.setWanted(4);
  const t0 = performance.now();
  let v = null;
  await new Promise(r => { (function g() { v = X.police._S.cars.find(c => c.pol.kind === 'swat' && c.pol.role === 'pursuit'); if (v || performance.now() - t0 > 9000) r(); else requestAnimationFrame(g); })(); });
  const o = { swat: !!v, model: v && v.model.kind };
  W.__purge();
  X.police.setWanted(6);
  const t1 = performance.now();
  let tr = null;
  await new Promise(r => { (function g() { tr = X.police._S.cars.find(c => c.polArmy); if (tr || performance.now() - t1 > 12000) r(); else requestAnimationFrame(g); })(); });
  o.army = !!tr; o.armyColor = tr && tr.color; o.crew = tr && tr.npcDriver && tr.npcDriver.team;
  return o;
});
check('4 stars: SWAT vans join the chase', swat.swat && swat.model === 'swat', swat);
check('6 stars: army trucks with soldiers', swat.army && swat.crew === 'army', swat);
// a truck pulling up next to the suspect: the soldiers dismount
await t.eval(() => { const X = PG.gta, p = X.playerPos(); X.police.tune.arrestCar = 99; X.police.spawnCar('pursuit', 'army', p.x - 34, p.y - 3, 0); });
const soldiers = await until(() => { const S = PG.gta.police._S; const n = S.cops.filter(p => p.team === 'army' && !p.dead).length; return n >= 2 && n; }, 10000);
check('soldiers jump out of the army truck', !!soldiers, soldiers);
await t.wait(300);
await snap('p07-army');

// ---------- 11b. the tank ----------
const tank = await t.eval(async () => {
  const W = window, X = PG.gta, P = X.player;
  W.__purge();
  const a = W.__arena(6, 3); W.__drive('hatch', a.x, a.y, 0);
  X.police.tune.maxCars = 1; X.police.tune.arrestCar = 99;
  X.police.setWanted(6);
  const tk = X.police.spawnCar('pursuit', 'tank', a.x - 24, a.y - 2, 0);
  window.__tank = tk;
  await new Promise(r => setTimeout(r, 1200));
  PG.game.status = 'freeze';
  return { model: tk.model.kind };
});
await t.wait(120); await t.shot('p07b-tank'); await t.eval(() => { PG.game.status = 'play'; });
Object.assign(tank, await t.eval(async () => {
  const X = PG.gta, tk = window.__tank, a = X.playerPos();
  let shell = null;
  X.on('explosion', e => { if (e.source === 'shell' && !shell) shell = { d: Math.round(Math.hypot(e.x - a.x, e.y - a.y)), by: e.by === tk }; });
  const t0 = performance.now();
  await new Promise(r => { (function g() { if (shell || performance.now() - t0 > 12000) r(); else requestAnimationFrame(g); })(); });
  return { model: tk.model.kind, crew: tk.npcDriver && tk.npcDriver.team, siren: tk.siren, shell, out: X.police._S.cops.filter(p => p.ai.car === tk).length, s: Math.round(performance.now() - t0) / 1000 };
}));
check('6 stars: an army tank turns its turret and shells the suspect', tank.model === 'tank' && !!tank.shell && tank.shell.d < 14 && tank.shell.by, tank);
check('the tank crew stays inside', tank.out === 0, tank);
const ptank = await t.eval(async () => {
  const W = window, X = PG.gta, P = X.player;
  W.__purge();
  const a = W.__arena(3, 6);
  const c = W.__drive('tank', a.x, a.y, 0);
  c.gunCd = 0;
  let boom = null; X.on('explosion', e => { if (e.source === 'shell' && X.byPlayer(e.by) && !boom) boom = { d: Math.round(Math.hypot(e.x - a.x, e.y - a.y)) }; });
  window.__pboom = () => boom;
  return { model: c.model.name, hp: c.hp };
});
await t.mouse(1000, 360); await t.hold(['KeyJ'], 400);
const pt = await until(() => window.__pboom(), 3000);
check('the player can drive a tank and fire its gun (Ctrl/J/mouse)', !!pt && pt.d > 5, { ptank, pt });
await t.wait(200); await snap('p07c-player-tank');
await t.eval(() => window.__purge());

// ---------- 12. the helicopter ----------
const heli = await t.eval(async () => {
  const W = window, X = PG.gta, P = X.player;
  const a = W.__arena(6, 6);
  X.police.tune.maxCars = 0;
  X.police.setWanted(5); X.police._S.heliT = 0;
  const t0 = performance.now();
  await new Promise(r => { (function g() { const h = X.police.heli; if ((h && h.lit) || performance.now() - t0 > 14000) r(); else requestAnimationFrame(g); })(); });
  const h = X.police.heli;
  return h ? { lit: h.lit, d: Math.round(Math.hypot(h.x - P.ped.x, h.y - P.ped.y)), z: h.z, s: Math.round(performance.now() - t0) / 1000, seen: X.police.seen } : null;
});
check('5 stars: the helicopter arrives and catches the suspect in its searchlight', !!heli && heli.lit && heli.d < 40, heli);
await t.wait(400);
await snap('p08-helicopter');
const down = await t.eval(async () => {
  const X = PG.gta, h = X.police.heli; if (!h) return null;
  const w0 = X.player.wanted;
  X.explode(h.x, h.y, { by: X.player.ped, power: 2 });
  const crashing = h.state;
  await new Promise(r => setTimeout(r, 4500));
  return { crashing, gone: !X.police.heli, ev: window.__ev.heliDown, w0, w1: X.player.wanted };
});
check('a rocket blast brings the helicopter down in flames', !!down && down.crashing === 'crash' && down.gone && down.ev === 1, down);
await t.eval(() => window.__purge());

// ---------- 13. indoors: stake-out and SWAT raid ----------
const indoor = await t.eval(async () => {
  const W = window, X = PG.gta, P = X.player;
  const a = W.__arena(3, 5);
  X.police.tune.raidAfter = 1.5; X.police.tune.maxCars = 3;
  X.police.setWanted(4);
  const scene = { id: 'testroom', name: 'Test Room', cityPos: { x: a.x, y: a.y }, camSpan: 24, bg: '#202020', ambient: 0.5 };
  X.enterScene(scene, 3600, 3600, 0);
  await new Promise(r => setTimeout(r, 3500));
  const S = X.police._S, raiders = S.cops.filter(p => p.ai.indoor === scene && !p.dead);
  const o = { raid: raiders.length, near: raiders.length ? Math.round(Math.min(...raiders.map(p => Math.hypot(p.x - P.ped.x, p.y - P.ped.y)))) : -1, wanted: P.wanted, seen: X.police.seen };
  X.leaveScene(a.x, a.y, 0);
  await new Promise(r => setTimeout(r, 200));
  o.after = S.cops.filter(p => p.ai.indoor && !p.removed).length;
  return o;
});
check('hiding indoors at 4 stars brings a SWAT raid inside', indoor.raid >= 2 && indoor.near < 6, indoor);
check('raiders stay inside when the player leaves', indoor.after === 0, indoor);
await t.eval(() => window.__purge());

// ---------- 14. radio, horn siren, stealing a cruiser, respray ----------
await until(() => PG.gta.player.state === 'play', 5000);
const misc = await t.eval(async () => {
  const W = window, X = PG.gta, P = X.player, o = {};
  W.__arena(5, 3);
  X.police.setWanted(2);
  await new Promise(r => setTimeout(r, 300));
  const el = document.querySelector('#gta-hud .pol-radio');
  o.radio = W.__ev.radio.length; o.dom = !!el && el.classList.contains('on') && el.textContent.length > 15;
  o.text = W.__ev.radio[W.__ev.radio.length - 1];
  W.__purge();
  return o;
});
check('police radio chatter appears with a crackle (HUD ticker)', misc.radio >= 1 && misc.dom, misc);
await snap('p09-radio');
// other modules talk to the police through events
const evs = await t.eval(async () => {
  const W = window, X = PG.gta, P = X.player, o = {};
  const a = W.__arena(4, 7);
  X.emit('witnessCall', { crime: { type: 'killPed', x: a.x, y: a.y, by: P.ped }, x: a.x + 5, y: a.y });
  o.call = P.wanted;
  W.__purge();
  X.emit('heistAlarm', {});
  const b = X.places.bank.door, S = X.police._S;
  o.heist = P.wanted; o.toBank = Math.round(Math.hypot(S.lastX - b.x, S.lastY - b.y));
  W.__purge();
  // jack a patrol cruiser: the officers come out fighting
  const c = X.makeCar('police', a.x + 6, a.y, 0, { owner: 'police', npcDriver: { look: X.randomLook(), team: 'cop', extra: 1 } });
  c.pol = { role: 'patrol', kind: 'cop', no: 7, slot: 0, navT: 0, n: 0, wp: [], los: false, losT: 0, stuckT: 0, stopping: false, out: [], doorT: 0 }; S.cars.push(c);
  const ej = X.ejectOccupants(c, 'carjack');
  o.ejected = ej.length; o.adopted = ej.filter(p => p.ai && p.ai.owner === 'police' && p.team === 'cop').length;
  W.__purge();
  return o;
});
check('a civilian phone call (peds.js witnessCall) brings a star', evs.call >= 1, evs);
check('the bank alarm (heistAlarm) is 3 stars and sends units to the bank', evs.heist >= 3 && evs.toBank < 3, evs);
check('officers thrown out of a jacked cruiser are adopted as police', evs.ejected === 2 && evs.adopted === 2, evs);
// steal the parked cruiser at the station with F
const steal = await t.eval(() => {
  const W = window, X = PG.gta, P = X.player;
  W.__purge();
  const c = X.police.cars.find(q => q.pol.role === 'parked' && !q.removed && !q.wrecked);
  if (!c) return null;
  const s = X.doorSpot(c, -1) || { x: c.x, y: c.y + 2 };
  for (const p of X.police._S.cops) p.removed = true;
  P.ped.x = s.x; P.ped.y = s.y; X.cam.x = s.x; X.cam.y = s.y;
  window.__cop = c;
  return { ok: true };
});
if (steal) {
  await t.wait(150); await t.press('KeyF'); await t.wait(1600);
  const st2 = await t.eval(() => ({ inCop: PG.gta.player.car === window.__cop, wanted: PG.gta.player.wanted, owner: window.__cop.owner, siren: window.__cop.siren }));
  await t.press('KeyH'); await t.wait(100);
  const sir = await t.eval(() => window.__cop.siren);
  check('stealing a parked cruiser is a crime (2+ stars)', st2.inCop && st2.wanted >= 2 && st2.owner !== 'police', st2);
  check('the horn switches the siren in a police car', sir !== st2.siren, { before: st2.siren, after: sir });
  await t.eval(() => PG.gta.emit('carSprayed', { car: PG.gta.player.car }));
  const sp = await t.eval(() => PG.gta.player.wanted);
  check('a respray loses the cops', sp === 0, sp);
} else console.log('SKIP steal test (no parked cruiser)');

// ---------- 15. cops get rough at 2 stars ----------
const rough = await t.eval(async () => {
  const W = window, X = PG.gta, P = X.player;
  const a = W.__arena(7, 5);
  X.police.tune.maxCars = 0; X.police.tune.arrestFoot = 99;
  X.police.setWanted(2);
  P.ped.hp = 100; P.ped.armor = 0;
  let shots = 0; X.on('gunfire', e => { if (e.by && e.by.team === 'cop') shots++; });
  X.police.spawnCop(a.x + 7, a.y, 'cop', 'chase'); X.police.spawnCop(a.x - 7, a.y, 'cop', 'chase');
  await new Promise(r => setTimeout(r, 3500));
  const o = { hp: Math.round(P.ped.hp), shots, guns: X.has('weapons') };
  W.__purge();
  P.ped.hp = 100;
  return o;
});
check('at 2 stars cops attack (shoot with weapons.js, punch without)', rough.hp < 100 || rough.shots > 0, rough);

// ---------- 16. audio: sirens and rotor, silenced on pause and mute ----------
const snd = await t.eval(async () => {
  const W = window, X = PG.gta, V = X.police._V;
  PG.audio.unlock(); PG.audio.setMuted(false);
  await new Promise(r => setTimeout(r, 200));
  const live = !!PG.audio.kit();
  const a = W.__arena(5, 5); W.__drive('hatch', a.x, a.y, 0);
  X.police.tune.maxCars = 0;
  X.police.setWanted(5);
  X.police.spawnCar('pursuit', 'cop', a.x + 30, a.y - 2, Math.PI);
  X.police.spawnHeli();
  await new Promise(r => setTimeout(r, 1500));
  const o = { live, siren: !!V.siren, rotor: !!V.rotor };
  PG.pause(true); await new Promise(r => setTimeout(r, 200));
  o.pausedSiren = !!V.siren; o.pausedRotor = !!V.rotor;
  PG.pause(false); await new Promise(r => setTimeout(r, 300));
  o.resumed = !!V.siren;
  PG.audio.setMuted(true); await new Promise(r => setTimeout(r, 200));
  o.mutedSiren = !!V.siren;
  W.__purge();
  return o;
});
if (snd.live) {
  check('siren and rotor loops play near the chase', snd.siren && snd.rotor, snd);
  check('loops stop on pause and mute, and come back after pause', !snd.pausedSiren && !snd.pausedRotor && snd.resumed && !snd.mutedSiren, snd);
} else console.log('SKIP audio loop checks (audio context unavailable here)', JSON.stringify(snd));

// ---------- 17. fps in a big chase ----------
const fps = await t.eval(async () => {
  const W = window, X = PG.gta, P = X.player, C = X.city;
  const j = Math.floor(C.ys.length / 2), x = C.xs[2] + 10, y = C.ys[j] + 2;
  W.__purge();
  if (P.car) { P.car.driver = null; P.car = null; P.ped.car = null; P.ped.hidden = false; }
  P.ped.x = x; P.ped.y = y; P.state = 'play';
  const c = W.__drive('furia', x, y, 0); X.cam.x = x; X.cam.y = y;
  X.police.setWanted(5); X.police.tune.arrestCar = 99;
  for (let k = 0; k < 6; k++) X.police.spawnCar('pursuit', k < 4 ? 'cop' : 'swat', x - 20 - k * 9, y + (k % 2 ? 3 : -3), 0);
  X.police.spawnHeli(); const h = X.police.heli; h.x = x; h.y = y - 20;
  await new Promise(r => setTimeout(r, 1500));
  let n = 0; const t0 = performance.now();
  await new Promise(r => { (function g() { n++; const car = P.car; if (car && car.dv) { car.dv.vx = Math.max(car.dv.vx, 16); } if (performance.now() - t0 < 3000) requestAnimationFrame(g); else r(); })(); });
  const S = X.police._S;
  return { fps: Math.round(n / ((performance.now() - t0) / 1000)), cars: S.cars.filter(q => q.pol.role === 'pursuit' || q.pol.role === 'empty').length, cops: S.cops.length, heli: !!S.heli, all: X.cars.length, peds: X.peds.length };
});
check('a 6-cruiser chase with the helicopter keeps ~60 fps', fps.fps >= 45 && fps.cars >= 6 && fps.heli, fps);
await snap('p10-big-chase');

const setS = (k, v) => t.eval(([k, v]) => { if (PG.setSetting) PG.setSetting(k, v); else (PG.settings = PG.settings || {})[k] = v; }, [k, v]);
const presetHigh = () => t.eval(() => { if (PG.applyPreset) PG.applyPreset('high'); else Object.assign(PG.settings = PG.settings || {}, { lighting: 'high', particles: 'high', detail: 'high', shadows: true, decals: 'high', pedDensity: 1, policeMax: 8, wheel: 'zoom' }); });
// ---------- 17b. PG.settings.policeMax caps the police vehicles out at once ----------
await setS('policeMax', 3);
const capped = await t.eval(async () => {
  const W = window, X = PG.gta, P = X.player, S = X.police._S;
  W.__purge(); X.police.tune.arrestCar = 99; X.police.setWanted(6);
  let most = 0;
  for (let k = 0; k < 16; k++) {
    await new Promise(r => setTimeout(r, 500));
    if (P.wanted < 6) X.police.setWanted(6);
    most = Math.max(most, S.cars.filter(c => !c.removed && !c.wrecked && c.pol.role !== 'parked' && c.pol.role !== 'stolen').length);
  }
  W.__purge();
  return { most };
});
await presetHigh();
check('policeMax 3: at 6 stars no more than 3 police vehicles are out', capped.most >= 1 && capped.most <= 3, capped);

// ---------- 18. a second game starts clean ----------
const again = await t.eval(async () => {
  const X = PG.gta;
  X.stop(); X.start(PG.GTA_DEF);
  await new Promise(r => setTimeout(r, 600));
  const S = X.police._S;
  return { wanted: X.player.wanted, heat: X.police.heat, heli: !!S.heli, blocks: S.blocks.length, pursuit: S.cars.filter(c => c.pol.role === 'pursuit').length, parked: S.cars.filter(c => c.pol.role === 'parked').length, cops: S.cops.filter(p => p.ai.state !== 'patrol' && !p.ai.station).length, siren: !!X.police._V.siren };
});
check('a second game starts with no chase, no helicopter, fresh station cruisers', again.wanted === 0 && again.heat === 0 && !again.heli && again.blocks === 0 && again.pursuit === 0 && again.cops === 0 && !again.siren, again);

check('no console errors', t.errors.length === 0, t.errors.slice(0, 5).join('\n'));
await t.close();
console.log(failed ? `${failed} check(s) failed` : 'all police checks passed');
process.exit(failed ? 1 : 0);
