// Core smoke test: start GTA mode, walk, get into the nearest car, drive, crash, get out; walk round a car to its
// door from the far side (never through it). Works with core alone or with every module.
// Usage: node tests/core.test.mjs <built.html> <screenshot dir>
import { launch } from './harness.mjs';
const t = await launch({ html: process.argv[2], out: process.argv[3] });
let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info !== undefined ? ' ' + JSON.stringify(info) : ''}`); if (!ok) fails++; };
const until = async (fn, ms) => { const t0 = Date.now(); for (;;) { const r = await t.eval(fn); if (r || Date.now() - t0 > ms) return r; await t.wait(60); } };

const s0 = await t.eval(() => { const X = PG.gta; return { mode: PG.game.mode, cars: X.cars.length, path: X.cars.filter(c => c.ctrl === 'path').length, parked: X.cars.filter(c => c.ctrl === 'parked').length, places: Object.keys(X.places), p: X.playerPos() }; });
check('GTA mode starts with traffic, parked cars and places', s0.mode === 'gta' && s0.path > 10 && s0.parked > 5 && s0.places.length >= 8, s0);
await t.shot('core-1-start');
const p0 = s0.p;
await t.hold(['KeyW', 'KeyD'], 900);
const s1 = await t.eval(() => PG.gta.playerPos());
check('the player walks', Math.hypot(s1.x - p0.x, s1.y - p0.y) > 2, s1);
// teleport next to the nearest parked car and get in
const got = await t.eval(() => {
  const X = PG.gta, P = X.player; const c = X.cars.filter(c => c.ctrl === 'parked' && !c.wrecked).sort((a, b) => Math.hypot(a.x - P.ped.x, a.y - P.ped.y) - Math.hypot(b.x - P.ped.x, b.y - P.ped.y))[0];
  if (!c) return null; const d = X.doorSpot(c, -1); P.ped.x = d.x; P.ped.y = d.y; window.__c = c; return c.model.name;
});
await t.wait(100); await t.press('KeyF');
const inCar = await until(() => PG.gta.player.car === window.__c, 2000);
check('F at the door of a parked car gets you in', !!got && inCar, got);
const c0 = await t.eval(() => ({ x: window.__c.x, y: window.__c.y }));
await t.hold(['ShiftLeft'], 2500);
const drv = await t.eval(c0 => { const c = PG.gta.player.car; return c && { kmh: Math.round(c.speed * 3.6), moved: +Math.hypot(c.x - c0.x, c.y - c0.y).toFixed(1) }; }, c0);
check('it drives', drv && (drv.kmh > 20 || drv.moved > 4), drv);
await t.shot('core-2-driving');
await t.hold(['ShiftLeft', 'KeyD'], 1200);
await t.hold(['ShiftLeft'], 2500);
await t.shot('core-3-more');
console.log('car hp', await t.eval(() => PG.gta.player.car && Math.round(PG.gta.player.car.hp)));
await t.hold(['KeyS'], 1500);
await t.eval(() => { const c = PG.gta.player.car; if (c && c.dv) { c.dv.vx = c.dv.vy = 0; } });
await t.press('KeyF');
const out = await until(() => { const P = PG.gta.player; return !P.car && !P.entering && !P.ped.hidden; }, 1500);
check('F gets you out, standing beside the car', out);
// from the far side of a parked car: round it to the driver's door, never through it
const far = await t.eval(() => new Promise(res => {
  const X = PG.gta, P = X.player, C = X.city;
  const j = Math.floor(C.ys.length / 2), i = Math.floor(C.xs.length / 2), x = (C.xs[i] + C.xs[i + 1]) / 2, y = C.ys[j] + 3.75;
  for (const c of X.cars) if (Math.hypot(c.x - x, c.y - y) < 25) X.removeCar(c);
  X.trafficRules.push(c => Math.abs(c.x - x) < 60 && Math.abs(c.y - y) < 60 ? 0 : null);
  const c = X.makeCar('comet', x, y, 0, { ctrl: 'parked' });
  P.ped.x = x + 0.3; P.ped.y = y + c.wid / 2 + 1.4; P.ped.vx = P.ped.vy = 0; X.cam.x = x; X.cam.y = y;
  let minGap = 9;
  const t0 = performance.now();
  X.enterCar(c);
  (function f() {
    const cs = Math.cos(c.th), sn = Math.sin(c.th), dx = P.ped.x - c.x, dy = P.ped.y - c.y, lx = dx * cs + dy * sn, ly = -dx * sn + dy * cs;
    if (P.entering && P.entering.phase === 'walk') minGap = Math.min(minGap, Math.hypot(Math.max(0, Math.abs(lx) - c.len / 2), Math.max(0, Math.abs(ly) - c.wid / 2)));
    if (P.car === c) return res({ s: +((performance.now() - t0) / 1000).toFixed(2), minGap: +minGap.toFixed(2) });
    if (performance.now() - t0 > 5000) return res({ s: -1, minGap: +minGap.toFixed(2), entering: P.entering && P.entering.phase });
    requestAnimationFrame(f);
  })();
}));
check('from the far side the player walks round the car to the driver\'s door (never through it) and gets in', far.s > 0 && far.s < 3.2 && far.minGap > 0.25, far);
await t.hold(['Tab'], 800); await t.shot('core-4-map');
const fps = await t.eval(() => new Promise(r => { let n = 0; const t0 = performance.now(); (function f() { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); })(); }));
console.log('fps', fps, 'cars', await t.eval(() => PG.gta.cars.length));
check('no console errors', t.errors.length === 0, t.errors.slice(0, 5).join(' | '));
console.log(fails ? `${fails} check(s) FAILED` : 'all core checks passed');
await t.close();
process.exit(fails ? 1 : 0);
