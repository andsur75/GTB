// Engine test: settings store (presets, Custom, persistence, listeners), the settings menu (title, pause and
// O, Back, live changes, phone width), FPS counter (default on, ` toggles), backing-store size from
// renderScale and maxDpr, adaptive resolution, the 30 fps cap, the fast renderer against the classic one
// (same city, pixel for pixel within filtering noise, with and without the turning camera), tile
// invalidation, particle / decal caps, camera shake, wheel setting, traffic setting, second game.
// Usage: node tests/engine.test.mjs <built.html> <shotDir>
import path from 'node:path';
import fs from 'node:fs';
import { launch } from './harness.mjs';

const html = path.resolve(process.argv[2] || 'Take_the_Bus_Drift.html');
const out = path.resolve(process.argv[3] || '/tmp/gta-shots/engine');
fs.mkdirSync(out, { recursive: true });
let fails = 0;
const check = (name, ok, info) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); if (!ok) fails++; };

// ---------------------------------------------------------------- title screen
const t = await launch({ html, out, start: false });
const ev = (fn, a) => t.eval(fn, a);
await t.wait(600);

const api = await ev(() => ({ s: !!PG.settings, on: typeof PG.onSettings, set: typeof PG.setSetting, ap: typeof PG.applyPreset, presets: Object.keys(PG.QUALITY_PRESETS || {}), q: PG.settings.quality, d: Object.assign({}, PG.settings), sprites: !!(PG.sprites && PG.sprites.get && PG.sprites.glow && PG.sprites.disc), rs: !!PG.renderStats }));
check('settings API present', api.s && api.on === 'function' && api.set === 'function' && api.ap === 'function' && api.sprites && api.rs, api);
check('presets low/medium/high/ultra', ['low', 'medium', 'high', 'ultra'].every(p => api.presets.includes(p)), api.presets);
const d = api.d;
check('defaults: high preset + showFps, fpsCap 0, wheel zoom, radio, shake, no light engine setting', d.quality === 'high' && d.renderScale === 1 && d.maxDpr === 1.5 && d.adaptive === true && d.fastRender === false && d.lighting === 'high' && d.particles === 'high' && d.decals === 'high' && d.detail === 'high' && d.traffic === 1 && d.pedDensity === 1 && d.policeMax === 8 && d.showFps === true && d.fpsCap === 0 && d.wheel === 'zoom' && d.radio === true && d.cameraShake === true && !('lightEngine' in d), d);

// presets, Custom, listeners
const pr = await ev(() => {
  const seen = [];
  const off = PG.onSettings((s, keys) => seen.push(keys.slice()));
  PG.applyPreset('low');
  const low = Object.assign({}, PG.settings);
  PG.setSetting('showFps', false); const q2 = PG.settings.quality; PG.setSetting('showFps', true);
  PG.setSetting('particles', 'high');
  const custom = PG.settings.quality;
  const bad = PG.setSetting('renderScale', 'banana'), clamp = (PG.setSetting('renderScale', 0.1), PG.settings.renderScale);
  PG.applyPreset('ultra'); const ultra = Object.assign({}, PG.settings);
  PG.applyPreset('high');
  off();
  return { low, custom, q2, bad, clamp, ultra, seen: seen.length, firstKeys: seen[0] };
});
const L = pr.low;
check('low preset values', L.quality === 'low' && L.renderScale === 0.6 && L.maxDpr === 1 && L.adaptive && L.lighting === 'low' && L.shadows === false && L.particles === 'low' && L.decals === 'low' && L.skidMarks === false && L.weather === false && L.ambientLife === false && L.detail === 'low' && L.screenFx === false && L.traffic === 0.6 && L.pedDensity === 0.5 && L.policeMax === 4, L);
check('ultra preset values', pr.ultra.maxDpr === 2 && pr.ultra.adaptive === false && pr.ultra.traffic === 1.25 && pr.ultra.pedDensity === 1.25 && pr.ultra.policeMax === 10, pr.ultra);
check('changing a preset option switches to Custom', pr.custom === 'custom', pr.custom);
check('non-preset option (FPS counter) keeps the preset', pr.q2 === 'low', pr.q2);
check('bad values rejected, numbers clamped', pr.bad === false && pr.clamp === 0.5, { bad: pr.bad, clamp: pr.clamp });
check('onSettings fires with the changed keys', pr.seen >= 4 && Array.isArray(pr.firstKeys) && pr.firstKeys.includes('renderScale') && pr.firstKeys.includes('quality'), { n: pr.seen, first: pr.firstKeys });

// FPS counter: on by default, backquote toggles
await t.wait(800);
const fps0 = await ev(() => ({ hidden: document.getElementById('fps').hidden, v: document.getElementById('fps-v').textContent, txt: document.getElementById('fps-t').textContent, fps: PG.renderStats.fps }));
check('FPS counter visible by default with numbers', !fps0.hidden && /^\d+$/.test(fps0.v) && /ms/.test(fps0.txt) && fps0.fps > 5, fps0);
await t.press('Backquote'); await t.wait(150);
const fps1 = await ev(() => ({ hidden: document.getElementById('fps').hidden, set: PG.settings.showFps, q: PG.settings.quality }));
await t.press('Backquote'); await t.wait(150);
const fps2 = await ev(() => document.getElementById('fps').hidden);
check('` hides and shows the FPS counter (preset untouched)', fps1.hidden && fps1.set === false && fps1.q === 'high' && !fps2, fps1);

// menu from the title
await t.page.click('#btn-settings'); await t.wait(250);
const m1 = await ev(() => ({ screen: PG.ui.screen(), rows: document.querySelectorAll('#scr-settings .set-row').length, secs: [...document.querySelectorAll('#scr-settings .set-sec h3')].map(h => h.textContent), q: document.querySelector('#scr-settings .seg.big [aria-pressed="true"]').textContent }));
check('settings opens from the title', m1.screen === 'settings', m1.screen);
check('menu has Graphics / Effects / World / Controls / Audio and 22 options', ['Graphics', 'Effects', 'World', 'Controls', 'Audio'].every(s => m1.secs.includes(s)) && m1.rows >= 22, m1);
check('current preset shown', m1.q === 'High', m1.q);
await t.shot('engine-1-settings-title');
// touch an option: switches to Custom, applies live; then pick a preset back
await t.page.click('#scr-settings .set-row:has(#set-detail-l) button[data-v="low"]'); await t.wait(150);
const m2 = await ev(() => ({ detail: PG.settings.detail, q: PG.settings.quality, shown: document.querySelector('#scr-settings .seg.big [aria-pressed="true"]').textContent, val: document.querySelector('#set-detail-l').nextElementSibling.textContent }));
check('option click applies and shows Custom', m2.detail === 'low' && m2.q === 'custom' && m2.shown === 'Custom' && m2.val === 'Low', m2);
await t.page.click('#scr-settings .seg.big button[data-v="medium"]'); await t.wait(150);
const m3 = await ev(() => ({ q: PG.settings.quality, rs: PG.settings.renderScale, slider: document.getElementById('set-renderScale').value }));
check('preset button applies the preset and moves the slider', m3.q === 'medium' && m3.rs === 0.8 && +m3.slider === 0.8, m3);
check('fast renderer is gone: no toggle, cannot be turned on', await ev(() => !document.getElementById('set-fastRender') && PG.setSetting('fastRender', true) === false && PG.settings.fastRender === false));
await t.page.click('#set-shadows'); await t.wait(100);
const m4 = await ev(() => ({ f: PG.settings.shadows, aria: document.getElementById('set-shadows').getAttribute('aria-checked') }));
await t.page.click('#set-shadows'); await t.wait(100);
check('toggle switches flip the option', m4.f === false && m4.aria === 'false', m4);
// slider by keyboard
await t.page.focus('#set-traffic'); await t.page.keyboard.press('ArrowLeft'); await t.wait(100);
const m5 = await ev(() => PG.settings.traffic);
check('slider works from the keyboard', Math.abs(m5 - 0.75) < 1e-6, m5);
await t.page.click('#set-back'); await t.wait(200);
check('Back returns to the title', await ev(() => PG.ui.screen()) === 'title');

// persistence across reload
await ev(() => { PG.setSetting('renderScale', 0.75); PG.setSetting('wheel', 'weapon'); });
await t.page.reload(); await t.wait(600);
const per = await ev(() => ({ rs: PG.settings.renderScale, w: PG.settings.wheel, q: PG.settings.quality, stored: JSON.parse(localStorage.getItem('ttb.v1')).settings }));
check('settings persist across a reload', per.rs === 0.75 && per.w === 'weapon' && per.q === 'custom' && per.stored && per.stored.renderScale === 0.75, per);
// a partial save (another tool, an older version) keeps its values and reads as Custom; a save naming a preset gets that preset
await ev(() => { const st = JSON.parse(localStorage.getItem('ttb.v1')); st.settings = { lighting: 'off', adaptive: false }; localStorage.setItem('ttb.v1', JSON.stringify(st)); });
await t.page.reload(); await t.wait(500);
const part = await ev(() => ({ l: PG.settings.lighting, a: PG.settings.adaptive, q: PG.settings.quality, rs: PG.settings.renderScale }));
await ev(() => { const st = JSON.parse(localStorage.getItem('ttb.v1')); st.settings = { quality: 'low', particles: 'high' }; localStorage.setItem('ttb.v1', JSON.stringify(st)); });
await t.page.reload(); await t.wait(500);
const named = await ev(() => ({ q: PG.settings.quality, p: PG.settings.particles, rs: PG.settings.renderScale }));
check('partial saved settings load as Custom; a named preset loads its values', part.l === 'off' && part.a === false && part.q === 'custom' && part.rs === 1 && named.q === 'low' && named.p === 'low' && named.rs === 0.6, { part, named });
await ev(() => { PG.applyPreset('high'); PG.setSetting('wheel', 'zoom'); });

// ---------------------------------------------------------------- in game
await t.page.click('#btn-gta'); await t.page.waitForSelector('#scr-ready:not([hidden])'); await t.page.click('#ready-go'); await t.wait(1200);
check('game running', await ev(() => PG.gta.active && PG.game.status === 'play'));
// O opens settings over a paused game, O closes it
await t.press('KeyO'); await t.wait(200);
const o1 = await ev(() => [PG.ui.screen(), PG.game.status]);
await t.shot('engine-2-settings-ingame');
await t.press('KeyO'); await t.wait(200);
const o2 = await ev(() => [PG.ui.screen(), PG.game.status]);
check('O opens settings (game paused) and closes it (game resumes)', o1[0] === 'settings' && o1[1] === 'paused' && o2[0] === null && o2[1] === 'play', { o1, o2 });
// from the pause screen, Back returns there; Esc too
await t.press('KeyP'); await t.wait(150);
await t.page.click('#pause-settings'); await t.wait(200);
const p1 = await ev(() => PG.ui.screen());
await t.page.click('#set-back'); await t.wait(150);
const p2 = await ev(() => [PG.ui.screen(), PG.game.status]);
await t.page.click('#pause-settings'); await t.wait(150);
await t.press('Escape'); await t.wait(150);
const p3 = await ev(() => [PG.ui.screen(), PG.game.status]);
check('pause → Settings → Back/Esc returns to pause', p1 === 'settings' && p2[0] === 'pause' && p2[1] === 'paused' && p3[0] === 'pause', { p1, p2, p3 });
const help = await ev(() => document.querySelector('#scr-pause .fine.gta-only').textContent + ' | ' + document.querySelector('#scr-title .controls').textContent);
check('pause help and title controls mention O and `', /O settings/.test(help) && /` FPS counter/.test(help) && /Settings: graphics/.test(help), help.slice(0, 80));
await t.page.click('#pause-resume'); await t.wait(200);

// backing store follows renderScale (adaptive off), FPS overlay numbers in game
const bs = await ev(async () => {
  PG.setSetting('adaptive', false);
  const cv = document.getElementById('game'), r = [];
  for (const s of [1, 0.5, 0.8]) { PG.setSetting('renderScale', s); await new Promise(q => setTimeout(q, 120)); r.push({ s, w: cv.width, h: cv.height, cw: cv.clientWidth, ch: cv.clientHeight, view: +(PG.gta.lastView.dpr).toFixed(3), stat: PG.renderStats.scale }); }
  return r;
});
check('backing store = CSS size × renderScale (dpr 1)', bs.every(b => Math.abs(b.w - Math.round(b.cw * b.s)) <= 1 && Math.abs(b.h - Math.round(b.ch * b.s)) <= 1 && Math.abs(b.view - b.s) < 0.01 && b.stat === b.s), bs);
await t.shot('engine-3-scale-0.8');
await ev(() => PG.setSetting('renderScale', 1));

// screen-space layers line up at a lower resolution: an objective arrow / crosshair use view.dpr
const align = await ev(async () => {
  const X = PG.gta, cv = document.getElementById('game');
  PG.setSetting('renderScale', 0.5); await new Promise(q => setTimeout(q, 150));
  const p = X.toScreen(X.player.ped.x, X.player.ped.y), v = X.lastView;
  return { px: Math.round(p.x), py: Math.round(p.y), ax: Math.round(v.ax), ay: Math.round(v.ay), cw: v.cw, w: cv.width, dpr: v.dpr };
});
check('world-to-screen mapping unchanged at half resolution', Math.abs(align.px - align.ax) < 40 && Math.abs(align.py - align.ay) < 40 && align.cw === 1280 && align.w === 640, align);
await t.shot('engine-4-scale-0.5');
await ev(() => PG.setSetting('renderScale', 1));

// fpsCap 30: every other display frame is drawn
// (paused: a still frame is cheap to draw, so the uncapped rate is the display's)
const lightLvl = await ev(() => { const l = PG.settings.lighting; PG.setSetting('lighting', 'off'); return l; });   // scheduler checks: light pass off (software WebGL on GPU-less test machines)
const cap = await ev(async () => {
  PG.pause(true);
  const count = () => new Promise(res => { let n = 0, f = 0; const orig = PG.render; PG.render = function () { n++; return orig.apply(this, arguments); }; const t0 = performance.now(); (function tick() { f++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else { PG.render = orig; res({ rps: +(n / 2).toFixed(1), fps: +(f / 2).toFixed(1) }); } })(); });
  await new Promise(q => setTimeout(q, 300));
  PG.setSetting('fpsCap', 0); const a = await count();
  PG.setSetting('fpsCap', 30); const b = await count();
  PG.setSetting('fpsCap', 0); PG.pause(false);
  return { a, b };
});
check('fpsCap 30 halves the frame rate', cap.b.rps <= 31.5 && cap.b.rps >= 20 && cap.a.rps >= 1.4 * cap.b.rps && cap.b.fps > 1.5 * cap.b.rps, cap);

// adaptive resolution: a frame slowed in proportion to its pixels (fill bound) makes it step down and keep
// the step; with the slowness gone it climbs back. A slowness fewer pixels do not cure is tried and reverted.
const ad = await ev(async () => {
  PG.setSetting('adaptive', true); PG.setSetting('renderScale', 1);
  const orig = PG.render, cv = document.getElementById('game'); let mode = 'fill';
  PG.render = function () {
    const ms = mode === 'fill' ? 34 * cv.width * cv.height / (1280 * 720) : mode === 'cpu' ? 30 : 0;
    const e = performance.now() + ms; while (performance.now() < e);
    return orig.apply(this, arguments);
  };
  const wait = ms => new Promise(q => setTimeout(q, ms));
  await wait(7000);
  const down = PG.renderStats.scale, w = cv.width, st1 = Object.assign({}, PG.renderStats.adaptive);
  mode = 'none'; PG.setSetting('fpsCap', 30);   // a 30 fps target this machine holds easily: room to climb
  await wait(7000);
  const up = PG.renderStats.scale;
  PG.setSetting('fpsCap', 0); PG.setSetting('adaptive', false); PG.setSetting('adaptive', true);   // fresh state
  mode = 'cpu'; await wait(6000);
  const cpu = PG.renderStats.scale, st2 = Object.assign({}, PG.renderStats.adaptive);
  PG.render = orig;
  return { down, w, up, cpu, st1, st2 };
});
check('adaptive resolution steps down when pixels are the cost, and back up with headroom', ad.down <= 0.9 && ad.w < 1280 && ad.st1.kept >= 1 && ad.up > ad.down, ad);
check('adaptive resolution reverts a step that does not help (script-bound frame)', ad.cpu === 1 && ad.st2.reverted > ad.st1.reverted, { cpu: ad.cpu, st2: ad.st2 });
await ev(l => PG.setSetting('lighting', l), lightLvl);
await ev(() => PG.applyPreset('high'));

// caps: particles and decals, camera shake, wheel, traffic
const caps = await ev(() => {
  const X = PG.gta, G = PG.game, p = X.player.ped;
  PG.setSetting('particles', 'low'); PG.burst(p.x, p.y, 'smoke', 400, 2, 3, 0.5); PG.tick(0.016);
  const parts = G.particles.length;
  PG.setSetting('decals', 'low'); for (let i = 0; i < 150; i++) X.decal(p.x + i * 0.1, p.y, 'blood', 0.8);
  const decals = X.decals.length;
  PG.setSetting('cameraShake', false); G.shake = 1; const v = X.view(1280, 720, G, 1, 0, 0.016); const still = v.ax === 640;
  PG.setSetting('cameraShake', true); const v2 = X.view(1280, 720, G, 1, 0, 0.016); G.shake = 0;
  return { parts, decals, still, shook: v2.ax !== 640 };
});
check('particle cap (low = 80)', caps.parts <= 80, caps.parts);
check('decal cap (low = 80)', caps.decals <= 80, caps.decals);
check('camera shake off / on', caps.still && caps.shook, caps);
const wheel = await ev(async () => {
  const X = PG.gta, cv = document.getElementById('game');
  const fire = () => cv.dispatchEvent(new WheelEvent('wheel', { deltaY: 300, bubbles: true, cancelable: true }));
  X.cam.zoom = 1; PG.setSetting('wheel', 'weapon'); fire(); const a = X.cam.zoom;
  PG.setSetting('wheel', 'zoom'); fire(); const b = X.cam.zoom; X.cam.zoom = 1;
  return { a, b };
});
check('mouse wheel zooms only when set to zoom', wheel.a === 1 && wheel.b > 1, wheel);
await ev(() => PG.applyPreset('low'));
await t.wait(4000);
const tr = await ev(() => ({ path: PG.gta.cars.filter(c => c.ctrl === 'path').length, bs: document.getElementById('game').width }));
check('low preset: fewer moving cars, smaller backing store', tr.path <= Math.round(48 * 0.6) + 6 && tr.bs <= 1280 * 0.6 + 1, tr);
await t.shot('engine-5-low');
await ev(() => PG.applyPreset('high'));
await t.wait(500);
await t.shot('engine-6-high');

// ---------------------------------------------------------------- fast renderer vs classic
// Frozen frame, fixed time; the GPU path (tiles, sprites) forced on so it is exercised even on a software canvas.
async function compare(label) {
  return ev(async () => {
    const X = PG.gta, G = PG.game, cv = document.getElementById('game'), ctx = cv.getContext('2d');
    PG.setSetting('adaptive', false);
    PG.pause(true); await new Promise(q => setTimeout(q, 100));
    const caps0 = Object.assign({}, PG.renderCaps);
    Object.assign(PG.renderCaps, { tiles: true, cars: true, trees: true, particles: true, decals: true, minimap: true });
    const view = X.lastView, parts = G.particles; G.particles = [];
    const shot = fast => { PG.settings.fastRender = fast; for (let i = 0; i < 80; i++) { PG.mainCtx = ctx; PG.renderPpm = view.scale * view.dpr; PG.render(ctx, G, view, 100); if (i >= 3 && (!fast || PG.cityDraw.tileStats().missing === 0)) break; } PG.render(ctx, G, view, 100); return ctx.getImageData(0, 0, cv.width, cv.height).data; };
    const a = shot(false), b = shot(true);
    // the city alone (ground + buildings + trees), on its own canvas: no module drawing
    const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height; const g2 = c2.getContext('2d', { alpha: false });
    const city = fast => { PG.settings.fastRender = fast; const CD = PG.cityDraw; PG.mainCtx = g2; for (let i = 0; i < 80; i++) { CD.begin(g2, view, '#0b0c0f'); CD.ground(g2, X.city, view); CD.buildings(g2, X.city, view, 100); CD.canopies(g2, X.city, view); if (i >= 2 && (!fast || CD.tileStats().missing === 0)) break; } PG.mainCtx = ctx; return g2.getImageData(0, 0, c2.width, c2.height).data; };
    const ca = city(false), cb = city(true);
    const diff = (p, q) => { let sum = 0, big = 0, n = p.length / 4; for (let i = 0; i < p.length; i += 4) { const d = Math.max(Math.abs(p[i] - q[i]), Math.abs(p[i + 1] - q[i + 1]), Math.abs(p[i + 2] - q[i + 2])); sum += d; if (d > 48) big++; } return { mean: +(sum / n).toFixed(2), bigPct: +(big / n * 100).toFixed(2) }; };
    const st = PG.cityDraw.tileStats();
    PG.settings.fastRender = false; Object.assign(PG.renderCaps, caps0); G.particles = parts;
    PG.pause(false);
    return { frame: diff(a, b), city: diff(ca, cb), tiles: st, rot: +(view.rot || 0).toFixed(2) };
  });
}
const c1 = await compare('north-up');
check('fast renderer = classic (city layers, north-up view)', c1.city.mean < 2.5 && c1.city.bigPct < 1.5 && c1.tiles.drawn > 0 && c1.tiles.missing === 0, c1);
check('fast renderer = classic (whole frame, north-up view)', c1.frame.mean < 4 && c1.frame.bigPct < 3, c1.frame);
// in a car, the camera turns with it: tiles drawn rotated must not show seams
await ev(() => { const X = PG.gta, P = X.player; const c = X.cars.filter(c => !c.wrecked && c.ctrl === 'parked').sort((a, b) => Math.hypot(a.x - P.ped.x, a.y - P.ped.y) - Math.hypot(b.x - P.ped.x, b.y - P.ped.y))[0]; const dd = X.doorSpot(c, -1) || X.doorSpot(c, 1); P.ped.x = dd.x; P.ped.y = dd.y; X.enterCar(c); });
await t.wait(1500);
await t.page.keyboard.down('KeyW'); await t.page.keyboard.down('KeyD'); await t.wait(1200); await t.page.keyboard.up('KeyD'); await t.wait(600); await t.page.keyboard.up('KeyW');
await t.wait(300);
const c3 = await compare('turned');
check('fast renderer = classic (city layers, turned camera)', Math.abs(c3.rot) > 0.05 && c3.city.mean < 2.5 && c3.city.bigPct < 1.5 && c3.tiles.missing === 0, c3);
check('fast renderer = classic (whole frame, turned camera)', c3.frame.mean < 4 && c3.frame.bigPct < 3, c3.frame);
await t.shot('engine-7-turned');

// tile invalidation: a structural solid removed (and put back), a recoloured building
const inv = await ev(async () => {
  const X = PG.gta, C = X.city, CD = PG.cityDraw;
  Object.assign(PG.renderCaps, { tiles: true });
  const raf = () => new Promise(q => requestAnimationFrame(() => q()));
  for (let i = 0; i < 20; i++) await raf();
  const before = CD.tileStats();
  const pos = X.playerPos();
  const o = C.obstacles.filter(o => o.kind === 'building').sort((a, b) => Math.hypot(a.bb.x0 - pos.x, a.bb.y0 - pos.y) - Math.hypot(b.bb.x0 - pos.x, b.bb.y0 - pos.y))[0];
  PG.cityRemove(C, o);
  const after = CD.tileStats();
  for (let i = 0; i < 4; i++) await raf();
  const rebuilt = CD.tileStats();
  PG.cityPut(C, o);
  // recolour the building nearest the screen centre and read the pixel there
  const cv = document.getElementById('game'), ctx = cv.getContext('2d'), k = cv.width / cv.clientWidth, W = cv.clientWidth, Hh = cv.clientHeight;
  const sc = b => X.toScreen((b.x0 + b.x1) / 2 + 1, (b.y0 + b.y1) / 2 + 1);
  const on = C.buildings.filter(b => { const q = sc(b); return q.x > 80 && q.y > 80 && q.x < W - 80 && q.y < Hh - 80; });
  const b = on.sort((p, q) => Math.hypot(sc(p).x - W / 2, sc(p).y - Hh / 2) - Math.hypot(sc(q).x - W / 2, sc(q).y - Hh / 2))[0];
  if (!b) return { before, after, rebuilt, p0: [0, 0, 0], p1: [0, 0, 0], p2: [0, 0, 0], none: true };
  const s = sc(b);
  const px = () => Array.from(ctx.getImageData(Math.round(s.x * k), Math.round(s.y * k), 1, 1).data.slice(0, 3));
  await raf(); const p0 = px(); const col = b.color;
  b.color = '#ff00ff'; await raf(); await raf(); const p1 = px();
  b.color = col; await raf(); await raf(); const p2 = px();
  Object.assign(PG.renderCaps, { tiles: PG.renderCaps.gpu });
  return { before, after, rebuilt, p0, p1, p2 };
});
check('removing a building solid drops its tiles, rebuilt next frames', inv.after.tiles < inv.before.tiles && inv.rebuilt.built > inv.after.built, inv);
const pd = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
check('a recoloured building is drawn in its new colour at once', pd(inv.p0, inv.p1) > 12 && pd(inv.p0, inv.p2) < 12, { p0: inv.p0, p1: inv.p1, p2: inv.p2 });

// presets screenshots (my own review)
for (const p of ['low', 'medium', 'high', 'ultra']) { await ev(q => PG.applyPreset(q), p); await t.wait(700); await t.shot('engine-preset-' + p); }
await ev(() => PG.applyPreset('high'));

// ---------------------------------------------------------------- second game
await t.press('KeyP'); await t.wait(150);
await t.page.click('#pause-map'); await t.wait(300);
await t.page.click('#btn-gta'); await t.page.waitForSelector('#scr-ready:not([hidden])'); await t.page.click('#ready-go'); await t.wait(1500);
const g2 = await ev(() => ({ active: PG.gta.active, status: PG.game.status, cars: PG.gta.cars.length, fps: PG.renderStats.fps, tiles: PG.cityDraw.tileStats().tiles }));
check('second game runs', g2.active && g2.status === 'play' && g2.cars > 10 && g2.fps > 5, g2);
check('no console errors', t.errors.length === 0, t.errors.slice(0, 5));
await t.close();

// ---------------------------------------------------------------- high-density phone: maxDpr, menu at 412 px
const t2 = await launch({ html, out, start: false, viewport: { width: 412, height: 915 } });
const page2 = await t2.browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
const errs2 = [];
page2.on('pageerror', e => errs2.push(e.message)); page2.on('console', m => { if (m.type() === 'error') errs2.push(m.text()); });
await page2.goto('file://' + html);
await page2.evaluate(() => localStorage.setItem('ttb.v1', JSON.stringify({ nick: 'Tester', gtaIntroSeen: true, muted: true })));
await page2.reload(); await page2.waitForTimeout(500);
const dp = await page2.evaluate(async () => {
  const cv = document.getElementById('game'), r = [];
  PG.setSetting('adaptive', false);
  for (const m of [1, 1.5, 2]) { PG.setSetting('maxDpr', m); await new Promise(q => setTimeout(q, 120)); r.push({ m, w: cv.width, cw: cv.clientWidth }); }
  PG.applyPreset('high');
  return r;
});
check('backing store follows maxDpr on a 2x screen', dp.every(x => Math.abs(x.w - Math.round(x.cw * Math.min(2, x.m))) <= 1), dp);
await page2.click('#btn-settings'); await page2.waitForTimeout(300);
const narrow = await page2.evaluate(() => { const s = document.getElementById('scr-settings'), p = s.querySelector('.panel'); return { sw: s.scrollWidth, cw: s.clientWidth, pw: Math.round(p.getBoundingClientRect().width), rows: [...s.querySelectorAll('.set-row')].every(r => r.getBoundingClientRect().right <= 412.5) }; });
check('settings menu fits a 412 px screen', narrow.sw <= narrow.cw + 1 && narrow.rows, narrow);
await page2.screenshot({ path: path.join(out, 'engine-8-phone-settings.png') });
await page2.evaluate(() => { document.getElementById('scr-settings').scrollTop = 1400; });
await page2.screenshot({ path: path.join(out, 'engine-9-phone-settings-2.png') });
check('no console errors on the phone page', errs2.length === 0 && t2.errors.length === 0, errs2.slice(0, 3));
await t2.close();

console.log(fails ? `${fails} check(s) FAILED` : 'all engine checks passed');
process.exit(fails ? 1 : 0);
