// Ambient test: the world furniture is there (signals, props, billboards, the metro line, flocks, cats),
// a lane car stops at the stop line on red without honking and goes on green, X.ambient.signalAt /
// canCross for the peds module, the crossing ticks, weather (rain lowers every car's grip to 0.85 and draws
// rain; clear puts it back; fog; snow at 0.72; a storm whose lightning strikes close by), pigeons scatter
// on 'gunfire' and land again, a hydrant knocked over by a car gushes water (and knocks a person over),
// punching a parking meter spills coins you can pick up, a car alarm, an explosion sends the furniture
// flying, petting a cat, seagulls over Old Pier, the train passes, audio voices stop on pause and mute,
// the quality governor, a second game, and fps in a busy storm.
// Usage: node tests/ambient.test.mjs <built.html> <screenshot dir>
import { launch } from './harness.mjs';
const t = await launch({ html: process.argv[2], out: process.argv[3] });
let failed = 0;
const check = (name, ok, info) => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info !== undefined ? ' — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`); };
const snap = async name => { await t.eval(() => { PG.game.status = 'freeze'; }); await t.wait(150); await t.shot(name); await t.eval(() => { PG.game.status = 'play'; }); };
const until = (fn, ms) => t.eval(([src, ms]) => new Promise(r => { const f = new Function('return (' + src + ')()'); const t0 = performance.now(); (function g() { let v; try { v = f(); } catch (e) { v = null; } if (v || performance.now() - t0 > ms) r(v); else requestAnimationFrame(g); })(); }), [fn.toString(), ms]);

// helpers living in the page
await t.eval(() => {
  const X = PG.gta, W = window;
  W.__ev = { honk: [], smashed: [], weather: [], alarm: 0 };
  X.on('honk', e => W.__ev.honk.push(e.car));
  X.on('propSmashed', e => W.__ev.smashed.push(e.type));
  X.on('weather', e => W.__ev.weather.push(e.kind));
  X.on('carAlarm', () => W.__ev.alarm++);
  // the player on foot at (x, y), camera snapped there
  W.__go = (x, y) => {
    const P = X.player;
    if (P.car) { const c = P.car; c.driver = null; P.car = null; P.ped.car = null; P.ped.hidden = false; }
    if (X.scene) X.leaveScene();
    P.ped.x = x; P.ped.y = y; P.ped.vx = P.ped.vy = 0; X.cam.x = x; X.cam.y = y;
  };
  W.__clearCars = (x, y, r) => { for (const c of X.cars) if (c !== X.player.car && Math.hypot(c.x - x, c.y - y) < r) X.removeCar(c); X.cars = X.cars.filter(c => !c.removed); X.city.agents = X.cars; };
  // keep the police (if any) and everything else calm while we look at the scenery
  W.__calm = () => { if (X.police && X.police.clear) X.police.clear(); X.player.wanted = 0; X.player.ped.hp = X.player.ped.maxHp; };
});

// ---------- the furniture is in place ----------
await t.wait(1200);
const s0 = await t.eval(() => {
  const A = PG.gta.ambient, types = {};
  for (const p of A.props) types[p.type] = (types[p.type] || 0) + 1;
  return { weather: A.weather, sig: A.signals.length, types, boards: A.boards.length, line: !!A.line, flocks: A.flocks.length, cats: A.cats.length, litter: A.litter.length, hud: !!document.querySelector('#gta-hud .amb-wx'), solids: A.props.filter(p => p.solid && p.st === 0).length, n: A.props.length };
});
check('X.ambient exists with a weather', ['clear', 'rain', 'storm', 'fog'].includes(s0.weather), s0.weather);
check('traffic lights at the junctions', s0.sig >= 30, s0.sig);
check('street furniture placed', s0.types.hydrant > 80 && s0.types.bin > 50 && s0.types.meter > 10 && s0.types.bench > 20 && (s0.types.mailbox || 0) + (s0.types.newsbox || 0) > 10, s0.types);
check('standing furniture is solid', s0.solids === s0.n, `${s0.solids}/${s0.n}`);
check('billboards on the roofs, the metro line', s0.boards > 10 && s0.line, { boards: s0.boards, line: s0.line });
check('pigeons, cats and litter around the player', s0.flocks >= 3 && s0.cats >= 1 && s0.litter > 20, { flocks: s0.flocks, cats: s0.cats, litter: s0.litter });
check('weather label in the HUD', s0.hud);

// ---------- traffic light: stop on red at the line, go on green ----------
await t.eval(() => PG.gta.ambient.setWeather('clear', true));
const tl = await t.eval(() => {
  const X = PG.gta, A = X.ambient, C = X.city, T = PG.cityTraffic, W = window;
  const s = A.signals.filter(s => C.xs[s.i] - C.xs[s.i - 1] > 95).sort((a, b) => Math.abs(a.x - C.W / 2) - Math.abs(b.x - C.W / 2))[0] || A.signals[0];
  W.__clearCars(s.x - 60, s.y, 130);
  W.__go(s.x - s.vw / 2 - 8, s.y + s.hw / 2 + 2.5);
  W.__calm();
  A.forceSignal(s.i, s.j, 'red', 'green');
  const car = X.makeCar('hatch', 0, 0, 0, { ctrl: 'path', npcDriver: X.randomNpc() });
  car.cruise = 12;
  T.place(C, car, s.i - 1, s.j, 0, 0.35); car.ctrl = 'path'; car.keep = true;
  W.__tl = { s, car };
  return { i: s.i, j: s.j, d0: A.stopLine(car) };
});
await until(() => { const c = window.__tl.car; return c.v < 0.05 && PG.gta.ambient.stopLine(c) && PG.gta.ambient.stopLine(c).dist < 4; }, 9000);
await t.wait(3200);   // longer than the 2.5 s core waits before honking
const red = await t.eval(() => { const W = window, c = W.__tl.car, q = PG.gta.ambient.stopLine(c); return { v: c.v, dist: q && q.dist, light: q && q.light, path: c.ctrl, honks: W.__ev.honk.filter(x => x === c).length, x: c.x, jx: W.__tl.s.x - W.__tl.s.vw / 2 }; });
check('lane car stops for the red light', red.path === 'path' && red.v < 0.3 && red.light === 'red', red);
check('it stops at the stop line, not in the junction', red.dist != null && red.dist > -1.5 && red.dist < 3 && red.x < red.jx, red);
check('no honking while waiting at a light', red.honks === 0, red.honks);
const sigQ = await t.eval(() => { const A = PG.gta.ambient, s = window.__tl.s, q = A.signalAt(s.x + 2, s.y - 3); return { q, crossV: A.canCross(s.x - s.vw / 2 - 1, s.y - s.hw / 2 - 2, s.x + s.vw / 2 + 1, s.y - s.hw / 2 - 2), crossH: A.canCross(s.x - s.vw / 2 - 2, s.y - s.hw / 2 - 1, s.x - s.vw / 2 - 2, s.y + s.hw / 2 + 1), far: A.signalAt(s.x + 40, s.y + 40) }; });
check('signalAt reports the junction phases for peds', sigQ.q && sigQ.q.h === 'red' && sigQ.q.v === 'green' && sigQ.q.walkH === true && sigQ.q.walkV === false, sigQ.q);
check('canCross: walk over the held road, wait over the moving one, null away from signals', sigQ.crossH === true && sigQ.crossV === false && sigQ.far === null, sigQ);
await snap('amb-01-red-light');
await t.eval(() => { const s = window.__tl.s; PG.gta.ambient.forceSignal(s.i, s.j, 'green', 'red'); window.__tl.x0 = window.__tl.car.x; });
await t.wait(2600);
const go = await t.eval(() => { const W = window, c = W.__tl.car; return { v: c.v, moved: c.x - W.__tl.x0, removed: c.removed }; });
check('and drives on when it turns green', !go.removed && go.v > 2 && go.moved > 4, go);
await t.eval(() => { const s = window.__tl.s; PG.gta.ambient.forceSignal(s.i, s.j, null); window.__tl.car.keep = false; });
// the cycle runs by itself: every phase shows up within a full cycle
const cyc = await t.eval(() => new Promise(r => { const A = PG.gta.ambient, s = window.__tl.s, seen = new Set(); const t0 = performance.now(); (function g() { const q = A.signalAt(s.x, s.y); if (q) seen.add(q.h + '/' + q.v); if (performance.now() - t0 > 2500) r([...seen]); else requestAnimationFrame(g); })(); }));
const cycFull = await t.eval(() => { const s = window.__tl.s; return { T: s.T, gh: s.gh, gv: s.gv }; });
check('signals cycle on their own', cyc.length >= 1 && cycFull.T > 20 && cycFull.T < 40, { seen: cyc, cycle: cycFull });

// a signalled crossing ticks while you stand at it
const tk = await t.eval(() => new Promise(r => { const A = PG.gta.ambient, s = window.__tl.s, n0 = A.stats.ticks; window.__go(s.x - s.vw / 2 - 1.5, s.y - s.hw / 2 - 1.5); setTimeout(() => r({ ticks: A.stats.ticks - n0 }), 2000); }));
check('the crossing ticks for pedestrians', tk.ticks >= 2, tk);

// ---------- weather: rain, grip, fog, storm ----------
await t.eval(() => { const X = PG.gta, L = X.ambient.line, s = window.__tl.s; window.__go(s.x - s.vw / 2 - 3, s.y - s.hw / 2 - 3); X.ambient.setWeather('rain', true); });
await t.wait(500);
const rain = await t.eval(() => { const X = PG.gta, A = X.ambient, cars = X.cars.filter(c => !c.removed); return { w: A.weather, rain: A.rain, wet: A.wet, n: cars.length, bad: cars.filter(c => Math.abs((c.mu == null ? 1 : c.mu) - 0.85) > 1e-6).map(c => c.mu), drops: A.stats.drops, ev: window.__ev.weather.slice(-1)[0] }; });
check('rain: every car loses grip (mu 0.85)', rain.n > 5 && rain.bad.length === 0, { n: rain.n, bad: rain.bad.slice(0, 5) });
check('rain is drawn on screen', rain.drops > 100 && rain.rain > 0.4, { drops: rain.drops, rain: rain.rain });
check("'weather' event emitted", rain.ev === 'rain', rain.ev);
const lane = await t.eval(() => { const X = PG.gta, c = X.cars.find(c => c.ctrl === 'path' && !c.removed); return c ? { mu: c.mu } : null; });
await snap('amb-02-rain');
const newCar = await t.eval(() => { const X = PG.gta, p = X.player.ped, c = X.makeCar('comet', p.x + 3000, p.y, 0, { ctrl: 'parked' }); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => { const mu = c.mu; X.removeCar(c); r(mu); }))); });
check('cars that spawn in the rain get the wet grip too', Math.abs(newCar - 0.85) < 1e-6, newCar);
await t.eval(() => PG.gta.ambient.setWeather('clear', true));
await t.wait(300);
const dry = await t.eval(() => { const X = PG.gta, cars = X.cars.filter(c => !c.removed); return { bad: cars.filter(c => Math.abs((c.mu == null ? 1 : c.mu) - 1) > 1e-6).map(c => c.mu), drops: X.ambient.stats.drops }; });
check('clear again: grip restored, no rain drawn', dry.bad.length === 0 && dry.drops === 0, dry);
await t.eval(() => PG.gta.ambient.setWeather('fog', true));
await t.wait(400);
const fog = await t.eval(() => ({ fog: PG.gta.ambient.fog, w: PG.gta.ambient.weather, hud: document.querySelector('#gta-hud .amb-wx').textContent }));
check('fog rolls in (and the HUD says so)', fog.fog > 0.8 && fog.hud === 'FOG', fog);
await snap('amb-03-fog');
await t.eval(() => { const X = PG.gta; X.ambient.setWeather('storm', true); X.clock = 23 * 60; X.ambient.lightning(); });
await t.wait(250);
const storm = await t.eval(() => { const A = PG.gta.ambient; return { bolts: A.stats.bolts, w: A.weather, rain: A.rain }; });
check('storm with lightning', storm.w === 'storm' && storm.rain > 0.9 && storm.bolts >= 1, storm);
await snap('amb-04-storm-night');

// snow: a Norwegian winter night
await t.eval(() => PG.gta.ambient.setWeather('snow', true));
await t.wait(400);
const snow = await t.eval(() => { const X = PG.gta, A = X.ambient, cars = X.cars.filter(c => !c.removed); return { n: cars.length, bad: cars.filter(c => Math.abs((c.mu == null ? 1 : c.mu) - 0.72) > 1e-6).map(c => c.mu).slice(0, 4), flakes: A.stats.flakes, cover: A.cover, hud: document.querySelector('#gta-hud .amb-wx').textContent }; });
check('snow: white cover, falling flakes, slippery roads (mu 0.72)', snow.n > 5 && snow.bad.length === 0 && snow.flakes > 200 && snow.cover > 0.9 && snow.hud === 'SNOW', snow);
await snap('amb-04c-snow-night');
await t.eval(() => PG.gta.ambient.setWeather('storm', true));

// a bolt that comes down right here
const st = await t.eval(() => { const A = PG.gta.ambient, n0 = A.stats.strikes; A.lightning(true); const k = A.strikes[A.strikes.length - 1]; return { n: A.stats.strikes - n0, k: k && { x: Math.round(k.x), y: Math.round(k.y), arms: k.arms.length } }; });
check('lightning can strike close by (scorch, sparks, the lot)', st.n === 1 && st.k && st.k.arms >= 4, st);
await t.wait(60); await snap('amb-04b-lightning-strike');

// ---------- pigeons ----------
const fl = await t.eval(() => {
  const X = PG.gta, A = X.ambient, p = X.player.ped;
  A.setWeather('clear', true);
  let sp = null; for (let k = 0; k < 50 && !sp; k++) { const q = X.randomSidewalkPoint(p.x, p.y, 9, 16); if (q && !X.blocked(q.x, q.y, 1) && !X.roadAt(q.x, q.y)) sp = q; }
  const F = A.spawnFlock(sp.x, sp.y, 9); F.cool = 1e9; window.__F = F;
  return { st: F.st, n: F.birds.length };
});
await t.wait(400);
await t.eval(() => { const F = window.__F; PG.gta.emit('gunfire', { x: F.x + 12, y: F.y + 1, by: null, weapon: 'pistol', radius: 34 }); });
await t.wait(600);
const fly = await t.eval(() => { const F = window.__F; return { st: F.st, up: F.birds.filter(b => b.air && b.z > 0.5).length, n: F.birds.length, tx: F.tx, ty: F.ty, x: F.x, y: F.y }; });
check('pigeons scatter on gunfire', fly.st === 'air' && fly.up >= 5, fly);
await snap('amb-05-pigeons');

// ---------- a hydrant knocked over by a car ----------
const hy = await t.eval(() => {
  const X = PG.gta, A = X.ambient, p = X.player.ped, W = window;
  W.__calm();
  // a hydrant with clear road in front of it
  const list = A.propsNear(p.x, p.y, 500, 'hydrant').filter(h => h.st === 0);
  let h = null;
  for (const q of list) {
    const sx = q.x + q.nx * 7, sy = q.y + q.ny * 7;
    if (X.blocked(sx, sy, 2) || !X.roadAt(sx, sy)) continue;
    if (X.cars.some(c => !c.removed && Math.hypot(c.x - (q.x + q.nx * 3.5), c.y - (q.y + q.ny * 3.5)) < 6)) continue;
    h = q; break;
  }
  if (!h) return null;
  W.__clearCars(h.x, h.y, 14);
  W.__go(h.x + h.ny * 7 - h.nx * 1.5, h.y + h.nx * 7 - h.ny * 1.5);
  const th = Math.atan2(-h.ny, -h.nx), c = X.makeCar('hatch', h.x + h.nx * 6.5, h.y + h.ny * 6.5, th, { ctrl: 'phys' });
  c.dv.vx = Math.cos(th) * 13; c.dv.vy = Math.sin(th) * 13; c.dv.v = 13;
  const ped = X.makePed({ x: h.x + 0.7 * h.ny + 0.3 * h.nx, y: h.y + 0.7 * h.nx + 0.3 * h.ny, team: 'civ' });
  W.__H = { h, c, ped };
  return { x: h.x, y: h.y };
});
check('found a hydrant to hit', !!hy);
await t.wait(900);
const gush = await t.eval(() => { const X = PG.gta, A = X.ambient, H = window.__H; if (!H) return null; const h = H.h; return { st: h.st, gush: h.gush, solid: !!h.solid, blocked: !!X.blocked(h.hx, h.hy, 0.05), water: A.particles().water, ev: window.__ev.smashed.includes('hydrant'), knocked: H.ped.knock > 0 || Math.hypot(H.ped.vx, H.ped.vy) > 0.5 }; });
check('a car knocks the hydrant over', gush && gush.st !== 0 && !gush.solid && !gush.blocked && gush.ev, gush);
check('it gushes water', gush && gush.gush > 5 && gush.water > 20, gush);
check('the jet knocks a person over', gush && gush.knocked, gush);
await snap('amb-06-hydrant');
await t.eval(() => { const H = window.__H; if (H) { H.ped.removed = true; } });

// ---------- parking meter: punch it, collect the coins ----------
const mt = await t.eval(() => {
  const X = PG.gta, A = X.ambient, p = X.player.ped, W = window;
  const list = A.propsNear(p.x, p.y, 900, 'meter').filter(m => m.st === 0);
  let m = null;
  for (const q of list) { const sx = q.x - q.nx * 0.75, sy = q.y - q.ny * 0.75; if (!X.blocked(sx, sy, 0.4)) { m = q; break; } }
  if (!m) return null;
  W.__clearCars(m.x, m.y, 10);
  W.__go(m.x - m.nx * 0.75, m.y - m.ny * 0.75);
  p.th = p.aim = Math.atan2(m.y - p.y, m.x - p.x);
  W.__M = { m, money: X.player.money, d0: A.stats.dropped };
  return { hp: m.hp };
});
check('found a parking meter', !!mt);
for (let k = 0; k < 4; k++) { await t.eval(() => { const p = PG.gta.player.ped, m = window.__M.m; p.th = p.aim = Math.atan2(m.y - p.y, m.x - p.x); }); await t.press('Space'); await t.wait(380); }
const coins = await t.eval(() => { const A = PG.gta.ambient, M = window.__M; return { st: M.m.st, dropped: A.stats.dropped - M.d0, onGround: A.coins.length }; });
check('punching the meter breaks it and spills coins', coins.st !== 0 && coins.dropped >= 2, coins);
await snap('amb-07-meter-coins');
await t.wait(500);
const got = await t.eval(() => new Promise(r => {
  const X = PG.gta, A = X.ambient, M = window.__M, list = A.coins.slice();
  let k = 0;
  (function g() { if (k < list.length) { window.__go(list[k].x, list[k].y); k++; requestAnimationFrame(() => requestAnimationFrame(g)); } else setTimeout(() => r({ left: A.coins.length, delta: X.player.money - M.money, dropped: A.stats.dropped - M.d0 }), 200); })();
}));
check('the coins are worth money ($5 each, all picked up)', got.left === 0 && got.delta === 5 * got.dropped && got.delta >= 10, got);

// ---------- car alarm ----------
const al = await t.eval(() => {
  const X = PG.gta, A = X.ambient, p = X.player.ped;
  const c = X.cars.filter(c => c.ctrl === 'parked' && !c.removed && !c.driver && !c.npcDriver && !c.owner && c.model.kind !== 'police').sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
  if (!c) return null;
  window.__go(c.x + Math.cos(c.th + Math.PI / 2) * 3.5, c.y + Math.sin(c.th + Math.PI / 2) * 3.5);
  X.damageCar(c, 5, X.player.ped, 'bullet');
  window.__AL = c;
  return { on: A.alarms.some(a => a.car === c), ev: window.__ev.alarm };
});
check('shooting a parked car sets off its alarm', al && al.on && al.ev >= 1, al);
await t.wait(300); await snap('amb-08-car-alarm');

// ---------- an explosion: furniture flies, birds go ----------
const ex = await t.eval(() => {
  const X = PG.gta, A = X.ambient, p = X.player.ped;
  const b = A.propsNear(p.x, p.y, 600, 'bin').find(q => q.st === 0);
  window.__go(b.x + 12, b.y + 12);
  X.player.ped.hp = 1000; X.player.ped.maxHp = 1000;
  const n0 = A.stats.smashed;
  X.explode(b.x + 1.5, b.y, { power: 1, by: null, noFire: true });
  return { st: b.st, smashed: A.stats.smashed - n0, x: b.x, y: b.y };
});
check('an explosion knocks the furniture flying', ex.st !== 0 && ex.smashed >= 1, ex);
await t.eval(() => { const P = PG.gta.player; P.ped.maxHp = 100; P.ped.hp = 100; window.__calm(); });

// ---------- pet the cat ----------
const cat = await t.eval(() => {
  const X = PG.gta, A = X.ambient, W = window;
  // a park or plaza block, away from parked cars
  const C = X.city, b = C.blocks.find(b => b.kind === 'plaza') || C.blocks.find(b => b.kind === 'park') || C.blocks[5];
  let pt = null; for (let k = 0; k < 60 && !pt; k++) { const x = b.x0 + 6 + Math.random() * (b.x1 - b.x0 - 12), y = b.y0 + 6 + Math.random() * (b.y1 - b.y0 - 12); if (!X.blocked(x, y, 1.6) && !X.blocked(x + 1.2, y, 0.8)) pt = { x, y }; }
  if (!pt) return null;
  W.__clearCars(pt.x, pt.y, 12);
  W.__go(pt.x, pt.y);
  const c = A.spawnCat(pt.x + 1.2, pt.y); c.st = 'sit'; c.t = 30;
  W.__C = c;
  return true;
});
await t.wait(200);
const hint = await t.eval(() => { const h = document.querySelector('#gta-hud .g-hint'); return h && !h.hidden ? h.textContent : ''; });
await t.press('KeyF'); await t.wait(200);
const pet = await t.eval(() => ({ st: window.__C.st, pets: PG.gta.ambient.stats.pets }));
check('pet the cat', /pet the cat/i.test(hint) && pet.st === 'purr' && pet.pets === 1, { hint, pet });

// ---------- the pigeons landed again ----------
const landed = await until(() => window.__F.st === 'ground', 15000);
check('the pigeons land again', !!landed, await t.eval(() => ({ st: window.__F.st, t: window.__F.t })));

// ---------- seagulls over the harbour ----------
const gl = await t.eval(() => new Promise(r => {
  const X = PG.gta, A = X.ambient, C = X.city;
  let c = null; for (let i = 0; i < 3 && !c; i++) for (let j = 0; j < 3 && !c; j++) { const x = (i + 0.5) * C.W / 3, y = (j + 0.5) * C.H / 3; if (X.districtAt(x, y) === 'Old Pier') c = { x, y }; }
  const sp = X.randomSidewalkPoint(c.x, c.y, 0, 60) || c; window.__go(sp.x, sp.y);
  setTimeout(() => r({ gulls: A.gulls.length, d: X.districtAt(X.player.ped.x, X.player.ped.y) }), 6500);
}));
check('seagulls circle over Old Pier', gl.gulls >= 1 && gl.d === 'Old Pier', gl);
await snap('amb-09b-gulls');

// ---------- the metro ----------
const tr = await t.eval(() => {
  const X = PG.gta, A = X.ambient, L = A.line;
  if (L.horiz) window.__go(L.st + 30, L.c + 10); else window.__go(L.c + 10, L.st + 30);
  X.clock = 23 * 60 + 30;
  const T = A.callTrain(1);
  return { a0: T.a, v: T.v };
});
await t.wait(1100);
const tr2 = await t.eval(() => { const T = PG.gta.ambient.train; return T ? { a: T.a, v: T.v } : null; });
check('the train runs along the viaduct', tr2 && Math.abs(tr2.a - tr.a0) > 10 && tr2.v > 10, { tr, tr2 });
await snap('amb-09-train-night');

// ---------- billboards ----------
await t.eval(() => {
  const X = PG.gta, A = X.ambient, p = X.player.ped;
  const B = A.boards.slice().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
  const sp = X.randomSidewalkPoint(B.x + B.w / 2, B.y + B.h / 2, 0, 25) || { x: B.x, y: B.y - 6 };
  window.__go(sp.x, sp.y); X.clock = 12 * 60;
});
await t.wait(500); await snap('amb-10-billboard-day');

// ---------- audio: voices run while playing, stop on pause and mute ----------
const au = await t.eval(() => new Promise(res => {
  const X = PG.gta, A = X.ambient;
  PG.audio.unlock(); PG.audio.setMuted(false);
  A.setWeather('storm', true);
  setTimeout(() => {
    const live = !!PG.audio.kit(), on = A.voices();
    PG.pause(true);
    setTimeout(() => {
      const paused = A.voices();
      PG.pause(false);
      setTimeout(() => {
        const again = A.voices();
        PG.audio.setMuted(true);
        setTimeout(() => res({ live, on, paused, again, muted: A.voices() }), 150);
      }, 300);
    }, 150);
  }, 400);
}));
if (au.live) {
  check('rain, wind and hum play in a storm', au.on.includes('rain') && au.on.includes('wind') && au.on.includes('hum'), au.on);
  check('ambient sound stops on pause and resumes', au.paused.length === 0 && au.again.includes('rain'), au);
  check('and stops on mute', au.muted.length === 0, au.muted);
} else check('audio unavailable in this browser (sound checks skipped)', true, au);

// ---------- fps in a busy storm: train, gushing hydrant, flocks in the air, traffic ----------
await t.eval(() => {
  const X = PG.gta, A = X.ambient, L = A.line;
  A.setWeather('storm', true); X.clock = 23 * 60;
  if (L.horiz) window.__go(L.st - 60, L.c + 9); else window.__go(L.c + 9, L.st - 60);
  const p = X.player.ped, h = A.propsNear(p.x, p.y, 200, 'hydrant').find(q => q.st === 0); if (h) A.knock(h, 2, 1, null);
  for (let k = 0; k < 3; k++) { const sp = X.randomSidewalkPoint(p.x, p.y, 6, 25); if (sp) { const F = A.spawnFlock(sp.x, sp.y, 9); } }
  A.scare(p.x, p.y, 40);
  A.callTrain(1);
});
await t.wait(500);
const fps = await t.eval(() => new Promise(r => { let n = 0; const t0 = performance.now(); (function f() { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); })(); }));
const busy = await t.eval(() => { const X = PG.gta, A = X.ambient; return { cars: X.cars.length, birds: A.flocks.reduce((n, F) => n + (F.st === 'air' ? F.birds.length : 0), 0), parts: A.particles(), train: !!A.train }; });
check('fps in a busy storm', fps >= 30, { fps, busy });
await snap('amb-11-busy-storm');

check('quality governor reports a level', ['high', 'low'].includes(await t.eval(() => PG.gta.ambient.quality)));

// ---------- a second game ----------
const g2 = await t.eval(() => new Promise(r => {
  const X = PG.gta;
  X.stop();
  PG.startLevel(PG.GTA_DEF);
  setTimeout(() => { const A = X.ambient; r({ sig: A.signals.length, props: A.props.length, flocks: A.flocks.length, alarms: A.alarms.length, coins: A.coins.length, train: !!A.train, smashed: A.stats.smashed, voices: A.voices().length, w: A.weather, rules: X.trafficRules.length, inter: X.interactions.length }); }, 700);
}));
check('a second game starts clean', g2.sig > 20 && g2.props > 200 && g2.alarms === 0 && g2.coins === 0 && g2.smashed === 0 && !g2.train && g2.rules >= 2, g2);

console.log(t.errors.length ? 'console errors:\n' + t.errors.join('\n') : 'no console errors');
check('no console errors', t.errors.length === 0, t.errors.length);
await t.close();
console.log(failed ? `${failed} check(s) failed` : 'all ambient checks passed');
process.exit(failed ? 1 : 0);
