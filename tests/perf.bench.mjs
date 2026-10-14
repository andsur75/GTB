// Performance benchmark (not part of run-all). node tests/perf.bench.mjs <built.html> <outDir> [preset]
// preset (optional): a PG.settings quality preset name applied before measuring, e.g. low|medium|high|ultra.
// Prints one line per scenario and a JSON summary on the last line.
import { launch } from './harness.mjs';
const [html, out, preset] = process.argv.slice(2);
const t = await launch({ html, out: out || '/tmp/gta-perf' });
await t.wait(800);
if (preset) await t.eval(p => { if (PG.applyPreset) PG.applyPreset(p); else if (PG.settings) PG.settings.quality = p; }, preset);
await t.eval(() => {
  const T = window.__B = { js: 0, frames: 0 };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = cb => raf(ts => { const a = performance.now(); cb(ts); T.js += performance.now() - a; });
  (function f() { T.frames++; raf(f); })();
});
const results = {};
async function sample(key, label, ms) {
  await t.eval(() => { const T = window.__B; T.js = 0; T.frames = 0; T.t0 = performance.now(); });
  await t.wait(ms || 3000);
  const r = await t.eval(() => { const T = window.__B, el = performance.now() - T.t0, X = PG.gta; return { fps: +(T.frames / el * 1000).toFixed(1), frameMs: +(el / T.frames).toFixed(1), jsMs: +(T.js / T.frames).toFixed(1), span: Math.round(X.cam.span), cops: X.cars.filter(c => c.owner === 'police').length, particles: PG.game.particles.length }; });
  results[key] = r;
  console.log(`${label.padEnd(40)} ${String(r.fps).padStart(5)} fps | frame ${r.frameMs} ms, JS ${r.jsMs} ms | view ${r.span} m, ${r.cops} cops, ${r.particles} particles`);
}
await sample('calm', 'on foot, calm');
await t.eval(() => { const X = PG.gta, P = X.player; const c = X.cars.filter(c => !c.wrecked && c.ctrl === 'parked')[0]; const d = X.doorSpot(c, -1) || { x: c.x, y: c.y + 2 }; P.ped.x = d.x; P.ped.y = d.y; });
await t.press('KeyF'); await t.wait(1000);
await t.eval(() => { if (PG.gta.police) PG.gta.police.setWanted(6); });
await t.page.keyboard.down('ShiftLeft'); await t.page.keyboard.down('KeyD'); await t.wait(1000); await t.page.keyboard.up('KeyD'); await t.wait(5000);
await sample('chase', '6-star chase (live)', 5000);
await t.eval(() => { PG.gta.cam.zoom = 0.4; });
await sample('chaseZoom', '6-star chase, zoomed in (live)', 3000);
await t.eval(() => { PG.gta.cam.zoom = 1; });
await t.page.keyboard.up('ShiftLeft');
console.log(t.errors.slice(0, 5).join('\n') || 'no errors');
console.log(JSON.stringify({ preset: preset || 'default', results, errors: t.errors.length }));
await t.close();
