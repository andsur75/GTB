// Core smoke test: start GTA mode, walk, enter the nearest car, drive, crash, get out.
import { launch } from './harness.mjs';
const t = await launch({ html: process.argv[2], out: process.argv[3] });
const s0 = await t.eval(() => { const X = PG.gta; return { mode: PG.game.mode, cars: X.cars.length, path: X.cars.filter(c => c.ctrl === 'path').length, parked: X.cars.filter(c => c.ctrl === 'parked').length, places: Object.keys(X.places), p: X.playerPos() }; });
console.log('start', JSON.stringify(s0));
await t.shot('core-1-start');
await t.hold(['KeyW', 'KeyD'], 900);
const s1 = await t.eval(() => PG.gta.playerPos());
console.log('walked to', JSON.stringify(s1));
// teleport next to the nearest parked car and get in
const got = await t.eval(() => {
  const X = PG.gta, P = X.player; const c = X.cars.filter(c => c.ctrl === 'parked').sort((a, b) => Math.hypot(a.x - P.ped.x, a.y - P.ped.y) - Math.hypot(b.x - P.ped.x, b.y - P.ped.y))[0];
  if (!c) return null; const d = X.doorSpot(c, -1); P.ped.x = d.x; P.ped.y = d.y; return c.model.name;
});
console.log('nearest parked', got);
await t.wait(100); await t.press('KeyF'); await t.wait(1200);
console.log('in car', await t.eval(() => PG.gta.player.car ? PG.gta.player.car.model.name : null));
await t.hold(['ShiftLeft'], 2500);
console.log('speed kmh', await t.eval(() => PG.gta.player.car && Math.round(PG.gta.player.car.speed * 3.6)));
await t.shot('core-2-driving');
await t.hold(['ShiftLeft', 'KeyD'], 1200);
await t.hold(['ShiftLeft'], 2500);
await t.shot('core-3-more');
console.log('car hp', await t.eval(() => PG.gta.player.car && Math.round(PG.gta.player.car.hp)));
await t.hold(['KeyS'], 1500);
await t.press('KeyF'); await t.wait(400);
console.log('on foot', await t.eval(() => !PG.gta.player.car));
await t.hold(['Tab'], 800); await t.shot('core-4-map');
const fps = await t.eval(() => new Promise(r => { let n = 0; const t0 = performance.now(); (function f() { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); })(); }));
console.log('fps', fps, 'cars', await t.eval(() => PG.gta.cars.length));
console.log(t.errors.join('\n') || 'no errors');
await t.close();
