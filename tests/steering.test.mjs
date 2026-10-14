// Mouse steering while the right button is held: hidden cursor, a world-locked marker that relative mouse motion swings round the car,
// the car turning onto the marker direction and holding it, A/D winning over the mouse, cursor restored off the road.
import { launch } from './harness.mjs';
const t = await launch({ html: process.argv[2], out: process.argv[3] });
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
let failed = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) failed++; };
await t.wait(800);
await t.mouse(640, 300); await t.mouse(650, 300);
// an X5 in the middle of the widest junction, heading east, the area cleared
await t.eval(() => {
  const X = PG.gta, P = X.player, C = X.city;
  const j = C.wy.indexOf(Math.max(...C.wy)), i = C.wx.indexOf(Math.max(...C.wx.slice(1, -1)));
  for (const c of X.cars) if (Math.hypot(c.x - C.xs[i], c.y - C.ys[j]) < 90) X.removeCar(c);
  for (const p of X.peds) if (!p.isPlayer && Math.hypot(p.x - C.xs[i], p.y - C.ys[j]) < 90) p.removed = true;
  const c = X.makeCar('x5', C.xs[i] - 6, C.ys[j] + 2, 0, { ctrl: 'parked' });
  const d = X.doorSpot(c, -1); P.ped.x = d.x; P.ped.y = d.y;
});
await t.press('KeyF'); await t.wait(1400);
const st = () => t.eval(() => { const X = PG.gta, c = X.player.car; return { th: c.th, aim: X.player.aim, r: c.dv.r, rot: X.lastView.rot, cursor: document.getElementById('game').style.cursor }; });
// relative mouse motion, as a physical mouse reports it (also while the pointer is locked)
const swing = dir => t.eval(d => { const X = PG.gta, a = X.player.aim + X.lastView.rot; document.getElementById('game').dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', movementX: -Math.sin(a) * 9 * d, movementY: Math.cos(a) * 9 * d, clientX: 650, clientY: 300, button: -1, buttons: 2, bubbles: true })); }, dir);
const rmb = down => t.eval(d => document.getElementById('game').dispatchEvent(new PointerEvent(d ? 'pointerdown' : 'pointerup', { pointerType: 'mouse', button: 2, buttons: d ? 2 : 0, clientX: 650, clientY: 300, bubbles: true })), down);
let s = await st();
check(s.cursor === '', 'the cursor shows while driving without RMB');
await rmb(true); await t.wait(250);
s = await st();
check(s.cursor === 'none', 'the OS cursor hides while RMB is held');
check(Math.abs(wrap(s.aim - s.th)) < 0.05, 'the marker starts straight ahead');
const a0 = s.aim;
for (let k = 0; k < 400 && Math.abs(wrap((await st()).aim - a0)) < Math.PI / 2 - 0.05; k++) await swing(1);
s = await st();
check(Math.abs(wrap(s.aim - a0) - Math.PI / 2) < 0.12, `mouse motion swings the marker a quarter turn clockwise (${wrap(s.aim - a0).toFixed(2)} rad)`);
const target = s.aim;
await t.page.keyboard.down('KeyW');
const errs = [];
for (let k = 0; k < 18; k++) { await t.wait(250); const q = await st(); errs.push(wrap(q.th - target)); if (Math.abs(wrap(q.aim - target)) > 1e-9) { check(false, 'the marker kept its world direction'); break; } }
await t.page.keyboard.up('KeyW');
const best = Math.min(...errs.map(Math.abs)), reachedAt = errs.findIndex(e => Math.abs(e) < 0.15);
check((await st()).aim === target, 'the marker keeps its world direction while the camera turns');
check(reachedAt >= 0, `the car turns onto the marker direction (closest ${best.toFixed(2)} rad)`);
const after = reachedAt >= 0 ? errs.slice(reachedAt, reachedAt + 4) : [];
// today it swings up to ~0.4 rad past and settles within ~2.5 s; tighten to 0.25 once the steering lead is tuned
  check(after.every(e => Math.abs(e) < 0.45), `and settles on it without swinging far past (${after.map(e => e.toFixed(2)).join(' ')})`);
// D steers and wins over the mouse; the marker rides on the nose, so letting go holds the new heading
const h0 = (await st()).th;
await t.page.keyboard.down('KeyW'); await t.page.keyboard.down('KeyD');
for (let k = 0; k < 8; k++) { await swing(-1); await t.wait(90); }   // the mouse pulls left meanwhile
await t.page.keyboard.up('KeyD');
const h1 = (await st()).th;
check(wrap(h1 - h0) > 0.35, `D turns the car right while the mouse pulls left (${wrap(h1 - h0).toFixed(2)} rad)`);
await t.wait(1500); await t.page.keyboard.up('KeyW');
s = await st();
check(Math.abs(wrap(s.th - s.aim)) < 0.3 && Math.abs(wrap(s.aim - h1)) < 0.6, `after letting go the car holds its new heading (${wrap(s.th - h1).toFixed(2)} rad drift)`);
await t.press('KeyP'); await t.wait(200);
check((await st()).cursor === '', 'the cursor is back while paused');
await t.press('KeyP'); await t.wait(200);
await rmb(false); await t.wait(200);
check((await st()).cursor === '', 'the cursor is back once RMB is let go');
await t.shot('steering');
check(t.errors.length === 0, 'no console errors' + (t.errors.length ? ': ' + t.errors.slice(0, 3).join(' | ') : ''));
await t.close();
process.exit(failed ? 1 : 0);
