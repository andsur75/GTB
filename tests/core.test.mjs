// Core smoke test: start GTA mode, walk, enter the nearest car, drive, crash, get out, big map; the frame
// loop's stats and the settings it honours (traffic, decals) are wired. Fails on any console error.
import { launch } from './harness.mjs';
const t = await launch({ html: process.argv[2], out: process.argv[3] });
let fails = 0;
const check = (name, ok, info) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); if (!ok) fails++; };
const s0 = await t.eval(() => { const X = PG.gta; return { mode: PG.game.mode, cars: X.cars.length, path: X.cars.filter(c => c.ctrl === 'path').length, parked: X.cars.filter(c => c.ctrl === 'parked').length, places: Object.keys(X.places), p: X.playerPos() }; });
console.log('start', JSON.stringify(s0));
check('GTA mode with traffic, parked cars and places', s0.mode === 'gta' && s0.path > 20 && s0.parked > 5 && s0.places.includes('hideout'), { path: s0.path, parked: s0.parked });
await t.shot('core-1-start');
await t.hold(['KeyW', 'KeyD'], 900);
const s1 = await t.eval(() => PG.gta.playerPos());
console.log('walked to', JSON.stringify(s1));
check('player walks', Math.hypot(s1.x - s0.p.x, s1.y - s0.p.y) > 1, s1);
// teleport next to the nearest parked car and get in
const got = await t.eval(() => {
  const X = PG.gta, P = X.player; const c = X.cars.filter(c => c.ctrl === 'parked').sort((a, b) => Math.hypot(a.x - P.ped.x, a.y - P.ped.y) - Math.hypot(b.x - P.ped.x, b.y - P.ped.y))[0];
  if (!c) return null; const d = X.doorSpot(c, -1); P.ped.x = d.x; P.ped.y = d.y; return c.model.name;
});
console.log('nearest parked', got);
await t.wait(100); await t.press('KeyF'); await t.wait(1200);
const inCar = await t.eval(() => PG.gta.player.car ? PG.gta.player.car.model.name : null);
console.log('in car', inCar);
check('gets into a car', !!inCar, inCar);
const c0 = await t.eval(() => PG.gta.player.car && { x: PG.gta.player.car.x, y: PG.gta.player.car.y });
await t.hold(['ShiftLeft'], 2500);
const drv = await t.eval(c0 => { const c = PG.gta.player.car; return c && { kmh: Math.round(c.speed * 3.6), moved: Math.round(Math.hypot(c.x - c0.x, c.y - c0.y)) }; }, c0);
console.log('speed kmh', drv && drv.kmh);
check('drives', !!drv && (drv.kmh > 10 || drv.moved > 5), drv);
await t.shot('core-2-driving');
await t.hold(['ShiftLeft', 'KeyD'], 1200);
await t.hold(['ShiftLeft'], 2500);
await t.shot('core-3-more');
console.log('car hp', await t.eval(() => PG.gta.player.car && Math.round(PG.gta.player.car.hp)));
await t.hold(['KeyS'], 1500);
await t.press('KeyF'); await t.wait(400);
const onFoot = await t.eval(() => !PG.gta.player.car);
console.log('on foot', onFoot);
check('gets out', onFoot);
await t.hold(['Tab'], 800); await t.shot('core-4-map');
const fps = await t.eval(() => new Promise(r => { let n = 0; const t0 = performance.now(); (function f() { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); })(); }));
const st = await t.eval(() => ({ cars: PG.gta.cars.length, rs: PG.renderStats && { fps: Math.round(PG.renderStats.fps), frameMs: +PG.renderStats.frameMs.toFixed(1), jsMs: +PG.renderStats.jsMs.toFixed(1), scale: PG.renderStats.scale, drawnCars: PG.renderStats.cars, drawnPeds: PG.renderStats.peds } }));
console.log('fps', fps, JSON.stringify(st));
check('frame loop keeps render stats', !!st.rs && st.rs.fps > 5 && st.rs.frameMs > 0 && st.rs.jsMs > 0 && st.rs.drawnCars >= 0, st.rs);
// settings honoured by core: decal cap, traffic multiplier
const set = await t.eval(async () => {
  const X = PG.gta, p = X.player.ped;
  PG.setSetting('decals', 'low'); for (let i = 0; i < 120; i++) X.decal(p.x, p.y, 'oil', 1); const decals = X.decals.length;
  PG.setSetting('traffic', 0.5); await new Promise(r => setTimeout(r, 1500));
  const path = X.cars.filter(c => c.ctrl === 'path' && !c.owner && !c.keep).length;
  PG.applyPreset('high');
  return { decals, path };
});
check('core honours decal cap and traffic setting', set.decals <= 80 && set.path <= 26 + 4, set);
console.log(t.errors.join('\n') || 'no errors');
check('no console errors', t.errors.length === 0, t.errors.slice(0, 3));
await t.close();
console.log(fails ? `${fails} check(s) FAILED` : 'all core checks passed');
process.exit(fails ? 1 : 0);
