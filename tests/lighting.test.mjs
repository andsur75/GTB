// Lighting test: the day/night curve, the darkness and its light sources measured in real pixels (street
// lamps and broken ones, headlight beams, a battered car's single eye, sirens, X.addLight points and cones,
// the explosion sky flash, the torch), dusk/dawn sun glow, interiors by ambient, L key, automatic headlights,
// neon/signs/beacons, lightAt, the light cap, pause, restart, dayPhase events, the HUD clock icon, fps in
// a busy night scene, the quality levels (off / low / medium / high) and the WebGL light engine.
// Usage: node tests/lighting.test.mjs <built.html> <screenshot dir>
import { launch } from './harness.mjs';
const t = await launch({ html: process.argv[2], out: process.argv[3] });
let failed = 0;
const check = (name, ok, info) => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info !== undefined ? ' — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`); };
const freeze = () => t.eval(() => { PG.game.status = 'freeze'; });
const play = () => t.eval(() => { PG.game.status = 'play'; });
const settle = (ms) => t.wait(ms || 160);

await t.eval(() => {
  const X = PG.gta, W = window;
  W.__ev = { phase: [] };
  X.on('dayPhase', e => W.__ev.phase.push(e.phase + (e.first ? '*' : '')));
  W.__calm = () => { const P = X.player; if (X.police && X.police.clear) X.police.clear(); P.wanted = 0; if (P.ped) { P.ped.hp = P.ped.maxHp; } };
  W.__onFoot = () => { const P = X.player; if (P.car) { const c = P.car; c.driver = null; P.car = null; P.ped.car = null; P.ped.hidden = false; } if (X.scene) X.leaveScene(); P.entering = null; };
  // teleport the player (on foot) and clear the area of cars and people
  W.__tp = (x, y, clearR) => {
    const P = X.player; W.__onFoot();
    for (const c of X.cars) if (Math.hypot(c.x - x, c.y - y) < (clearR || 45)) X.removeCar(c);
    for (const p of X.peds) if (!p.isPlayer && Math.hypot(p.x - x, p.y - y) < (clearR || 45)) p.removed = true;
    P.ped.x = x; P.ped.y = y; P.ped.vx = P.ped.vy = 0; P.ped.th = 0; P.ped.aim = 0; P.state = 'play';
    X.cam.x = x; X.cam.y = y; X.cam.span = 30; X.cam.mode = 'fixed'; W.__calm();
  };
  // a point in the middle of a road, far from every street lamp
  W.__dark = (seed) => {
    const C = X.city; let s = seed || 7;
    const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 600; k++) {
      const i = 1 + Math.floor(R() * (C.xs.length - 3)), j = 1 + Math.floor(R() * (C.ys.length - 2));
      const x = C.xs[i] + 22 + R() * (C.xs[i + 1] - C.xs[i] - 44), y = C.ys[j];
      if (C.lamps.some(l => Math.hypot(l.x + l.nx * 2.6 - x, l.y + l.ny * 2.6 - y) < 19)) continue;
      return { x, y };
    }
    return null;
  };
  // mean luminance (and colour) of the frame around a world point; r in CSS pixels
  W.__lum = (x, y, r) => {
    const cv = document.getElementById('game'), dpr = cv.width / cv.clientWidth, s = X.toScreen(x, y), R = Math.max(1, Math.round((r || 5) * dpr));
    const d = cv.getContext('2d').getImageData(Math.round(s.x * dpr) - R, Math.round(s.y * dpr) - R, 2 * R + 1, 2 * R + 1).data;
    let l = 0, rr = 0, gg = 0, bb = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { rr += d[i]; gg += d[i + 1]; bb += d[i + 2]; n++; }
    rr /= n; gg /= n; bb /= n; l = 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
    return { l: +l.toFixed(1), r: Math.round(rr), g: Math.round(gg), b: Math.round(bb) };
  };
  // average over a grid of screen points: [{l, r, g, b}] per column band
  W.__screen = () => {
    const cv = document.getElementById('game'), g = cv.getContext('2d'), w = cv.width, h = cv.height, out = { l: 0, left: 0, right: 0, lrb: 0, rrb: 0 };
    let n = 0, nl = 0, nr = 0;
    for (let iy = 1; iy < 9; iy++) for (let ix = 1; ix < 16; ix++) {
      const d = g.getImageData(Math.round(ix * w / 16), Math.round(iy * h / 9 * 0.8), 1, 1).data;
      const l = 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]; out.l += l; n++;
      if (ix < 6) { out.left += l; out.lrb += d[0] - d[2]; nl++; } else if (ix > 10) { out.right += l; out.rrb += d[0] - d[2]; nr++; }
    }
    out.l /= n; out.left /= nl; out.right /= nr; out.lrb /= nl; out.rrb /= nr;
    for (const k in out) out[k] = +out[k].toFixed(1);
    return out;
  };
  W.__testLights = [];
  X.mod('lighttest', { order: 1, render: { ground() { for (const l of W.__testLights) X.addLight(l.x, l.y, l.r, l.c, l.i, l.o); } } });
});

// ---------- 1. API ----------
const api = await t.eval(() => {
  const X = PG.gta, L = X.lighting, m = X.modules.find(m => m.name === 'lighting');
  return { has: !!L, fns: ['darkness', 'isNight', 'lightAt', 'flash', 'records', 'sky'].every(k => typeof L[k] === 'function'), amb: typeof L.ambient, order: m && m.order, layer: !!(m && m.render && m.render.light), modules: X.modules.map(m => m.name).join(',') };
});
check('X.lighting API and the light layer are registered', api.has && api.fns && api.amb === 'number' && api.order === 90 && api.layer, api);

// ---------- 2. the clock ----------
const curve = await t.eval(() => {
  const X = PG.gta, L = X.lighting, at = m => { X.clock = m; return { d: +L.darkness().toFixed(3), night: L.isNight(), warm: +L.sky().warm.toFixed(2), amb: +L.ambient.toFixed(2) }; };
  const r = { n2300: at(23 * 60), n0300: at(3 * 60), d1200: at(12 * 60), dusk: at(19.5 * 60), dawn: at(6.5 * 60), m0730: at(7.5 * 60), e2100: at(21 * 60) };
  X.clock = 23 * 60; return r;
});
check('23:00 and 03:00 are full night', curve.n2300.d >= 0.95 && curve.n2300.night && curve.n0300.d >= 0.99, curve.n2300);
check('12:00 has no darkness at all', curve.d1200.d === 0 && !curve.d1200.night && curve.d1200.amb === 1, curve.d1200);
check('19:30 is warm dusk, half dark', curve.dusk.d > 0.25 && curve.dusk.d < 0.6 && curve.dusk.warm > 0.4, curve.dusk);
check('06:30 is warm dawn, getting light', curve.dawn.d > 0.3 && curve.dawn.d < 0.8 && curve.dawn.warm > 0.4 && curve.m0730.d < curve.dawn.d, { dawn: curve.dawn, m0730: curve.m0730 });
check('21:00 is already mostly dark', curve.e2100.d > 0.75, curve.e2100);

// ---------- 3. fps in a busy night scene (before any canvas readback) ----------
const busy = await t.eval(() => {
  const X = PG.gta, P = X.player, C = X.city, W = window;
  const x = C.xs[4] + 40, y = C.ys[4];
  W.__tp(x, y, 1); X.clock = 23 * 60;
  const c = X.makeCar('furia', x, y + 3, 0, {}); X.toPhys(c); c.driver = P.ped; P.ped.car = c; P.ped.hidden = true; P.car = c; c.lightsOn = true;
  // 40 lit NPC cars in two lanes around you (some braking), plus the usual traffic
  let n = 0;
  for (let k = 0; k < 40; k++) { const row = k % 2, q = X.makeCar(k % 7 === 0 ? 'bus' : 'hatch', x - 70 + Math.floor(k / 2) * 7 + (k % 7 === 0 ? 4 : 0), y + (row ? 3.5 : -3.5), row ? 0 : Math.PI, { npcDriver: X.randomNpc() }); q.lightsOn = true; q.braking = k % 3 === 0; n++; }
  const pc = X.makeCar('police', x + 18, y - 4, Math.PI, { npcDriver: X.randomNpc('cop'), siren: true });
  const cols = ['#ff8a30', '#ffd08a', '#ff2a2a', '#3c6cff', '#9fd0ff', '#ffffff'];
  W.__testLights = [];
  for (let i = 0; i < 150; i++) { const a = i * 2.4, r = 5 + (i % 25) * 1.4; W.__testLights.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, r: 2 + (i % 7), c: cols[i % 6], i: 0.4 + (i % 5) * 0.12, o: i % 9 === 0 ? { cone: { dir: a, spread: 0.4 } } : undefined }); }
  return { placed: n, police: !!pc };
});
await t.wait(1500);
const fps = await t.eval(() => new Promise(r => { let n = 0; const t0 = performance.now(); (function f() { n++; if (performance.now() - t0 < 2500) requestAnimationFrame(f); else { const s = PG.gta.lighting.stats; r({ fps: Math.round(n / ((performance.now() - t0) / 1000)), lights: s.lights, submitted: s.submitted, litCars: s.cars, lamps: s.lamps, ms: +s.ms.toFixed(2), res: +(s.res || 1).toFixed(2) }); } })(); }));
check('busy night (40 lit cars, police siren, 150 submitted lights) keeps ~60 fps', fps.fps >= 45 && fps.submitted >= 150 && fps.lights >= 150 && fps.litCars >= 20, Object.assign(fps, busy));
await freeze(); await settle(); await t.shot('lighting-1-busy-night'); await play();
await t.eval(() => { window.__testLights = []; });

// ---------- 4. night vs noon, and noon leaves the picture alone ----------
const spot = await t.eval(() => window.__dark(11));
check('found a dark stretch of road away from the lamps', !!spot, spot);
await t.eval(s => { window.__tp(s.x, s.y, 60); PG.gta.clock = 23 * 60; }, spot);
await freeze(); await settle(300);
const night = await t.eval(() => window.__screen());
const nightRoad = await t.eval(s => window.__lum(s.x + 8, s.y - 4, 10).l, spot);
await t.shot('lighting-2-night');
await t.eval(() => { PG.gta.clock = 12 * 60; }); await settle();
const noon = await t.eval(() => window.__screen());
const noonRoad = await t.eval(s => window.__lum(s.x + 8, s.y - 4, 10).l, spot);
await t.eval(() => { const m = PG.gta.modules.find(m => m.name === 'lighting'); window.__lr = m.render.light; m.render.light = null; }); await settle();
const raw = await t.eval(() => window.__screen());
await t.eval(() => { const m = PG.gta.modules.find(m => m.name === 'lighting'); m.render.light = window.__lr; });
check('night is much darker than noon on the same spot', night.l < noon.l * 0.7 && nightRoad < noonRoad * 0.5, { screen: [night.l, noon.l], unlitRoad: [nightRoad, noonRoad] });
check('at noon the light layer changes (almost) nothing', Math.abs(noon.l - raw.l) < 3, { withLayer: noon.l, without: raw.l });
await t.shot('lighting-3-noon');

// ---------- 5. street lamps ----------
const lamp = await t.eval(() => {
  const X = PG.gta, C = X.city, p = X.player.ped;
  const l = C.lamps.filter(l => !l.broken && Math.hypot(l.x - p.x, l.y - p.y) < 400).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
  const px = l.x + l.nx * 2.6, py = l.y + l.ny * 2.6;
  window.__tp(px - l.nx * 3, py - l.ny * 3, 40); X.clock = 23 * 60; window.__lampRef = l;
  return { px, py };
});
await settle(300);
const lampOn = await t.eval(s => ({ pool: window.__lum(s.px, s.py, 8), lightAt: +PG.gta.lighting.lightAt(s.px, s.py).toFixed(2) }), lamp);
const farLight = await t.eval(s => +PG.gta.lighting.lightAt(s.x, s.y).toFixed(2), spot);
await t.shot('lighting-4-lamp');
await t.eval(() => { window.__lampRef.broken = true; }); await settle();
const lampOff = await t.eval(s => ({ pool: window.__lum(s.px, s.py, 8), lightAt: +PG.gta.lighting.lightAt(s.px, s.py).toFixed(2) }), lamp);
await t.eval(() => { window.__lampRef.broken = false; });
check('a street lamp lights its pool; a broken one does not', lampOn.pool.l > lampOff.pool.l * 1.4 && lampOn.lightAt > lampOff.lightAt + 0.3, { on: lampOn, off: lampOff });
check('lightAt: under a lamp vs a dark road', lampOn.lightAt > 0.6 && farLight < 0.4, { lamp: lampOn.lightAt, dark: farLight });

// ---------- 6. headlights ----------
const hl = await t.eval(s => {
  const X = PG.gta; window.__tp(s.x, s.y + 9, 60); X.clock = 23 * 60;
  const c = X.makeCar('hatch', s.x, s.y, 0, { npcDriver: X.randomNpc() }); c.lightsOn = true; window.__hc = c;
  return { x: c.x, y: c.y };
}, spot);
await settle(250);
const beam = await t.eval(c => ({ ahead: window.__lum(c.x + 10, c.y, 8), behind: window.__lum(c.x - 10, c.y, 8), cones: PG.gta.lighting.records().filter(r => r.cone > 0 && Math.hypot(r.x - c.x, r.y - c.y) < 4).length }), hl);
await t.shot('lighting-5-headlights');
await t.eval(() => { window.__hc.lightsOn = false; }); await settle();
const dark = await t.eval(c => ({ ahead: window.__lum(c.x + 10, c.y, 8) }), hl);
check('headlights light the road ahead, not behind', beam.ahead.l > beam.behind.l * 1.6 && beam.cones === 1, beam);
check('lights off: the road ahead goes dark', dark.ahead.l < beam.ahead.l * 0.6, { on: beam.ahead.l, off: dark.ahead.l });
const eyes = await t.eval(() => {
  const X = PG.gta, c = window.__hc; c.lightsOn = true; c.hp = c.maxHp * 0.3;
  return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => { const n = X.lighting.records().filter(q => q.cone > 0 && Math.hypot(q.x - c.x, q.y - c.y) < 4).length; c.hp = c.maxHp; r(n); })));
});
check('a battered car is down to one headlight', eyes === 1, eyes);

// ---------- 7. sirens, X.addLight points and cones ----------
const sir = await t.eval(s => {
  const X = PG.gta; X.removeCar(window.__hc); window.__tp(s.x, s.y + 8, 60);
  const c = X.makeCar('police', s.x, s.y, 0, { npcDriver: X.randomNpc('cop'), siren: false }); c.lightsOn = false; window.__pc = c;
  return { x: c.x, y: c.y };
}, spot);
const ring = c => { const a = []; for (let k = 0; k < 4; k++) a.push(window.__lum(c.x + [5, -5, 0, 0][k], c.y + [0, 0, 5, -5][k], 6)); return a; };
await settle(250);
const quiet = await t.eval(`(${ring})(${JSON.stringify(sir)})`);
await t.eval(() => { window.__pc.siren = true; }); await settle(250);
const loud = await t.eval(`(${ring})(${JSON.stringify(sir)})`);
await t.shot('lighting-6-siren');
const tinted = loud.filter((q, k) => q.r - quiet[k].r > 18 || q.b - quiet[k].b > 18).length;
check('a police siren washes the street red/blue', tinted >= 3, { quiet, loud });
await t.eval(() => { PG.gta.removeCar(window.__pc); });
const before = await t.eval(s => { window.__tp(s.x, s.y + 12, 60); return window.__lum(s.x, s.y, 8); }, spot);
await settle();
const base = await t.eval(s => window.__lum(s.x, s.y, 8), spot);
await t.eval(s => { window.__testLights = [{ x: s.x, y: s.y, r: 12, c: '#ffb050', i: 1.4 }]; }, spot); await settle();
const lit = await t.eval(s => window.__lum(s.x, s.y, 8), spot);
await t.shot('lighting-7-addlight');
await t.eval(s => { window.__testLights = [{ x: s.x, y: s.y, r: 14, c: '#e8f0ff', i: 1, o: { cone: { dir: 0, spread: 0.35 } } }]; }, spot); await settle();
const cone = await t.eval(s => ({ east: window.__lum(s.x + 7, s.y, 6), west: window.__lum(s.x - 7, s.y, 6), recs: PG.gta.lighting.records().filter(r => r.cone > 0).length }), spot);
await t.eval(() => { window.__testLights = []; });
check('X.addLight lights a dark spot (and tints it warm)', lit.l > base.l * 2 && lit.r > lit.b, { before: base, after: lit });
check('X.addLight cone shines one way', cone.east.l > cone.west.l * 1.8 && cone.recs >= 1, cone);

// ---------- 8. explosion: light + sky flash ----------
const boom = await t.eval(s => {
  const X = PG.gta, L = X.lighting; X.clock = 23 * 60;
  window.__tp(s.x - 4, s.y + 5, 60); window.__testLights = [];
  const d0 = L.darkness(); X.explode(s.x + 18, s.y, { power: 1, noFire: true }); const d1 = L.darkness();
  return { d0: +d0.toFixed(2), d1: +d1.toFixed(2) };
}, spot);
await settle(60);
const boomLit = await t.eval(s => ({ l: window.__lum(s.x + 18, s.y, 10), big: PG.gta.lighting.records().some(r => r.r >= 6 && Math.hypot(r.x - s.x - 18, r.y - s.y) < 2) }), spot);
await t.shot('lighting-8-explosion');
check('an explosion lights the street and flashes the sky', boom.d1 < boom.d0 - 0.1 && boomLit.big && boomLit.l.l > base.l * 2, { boom, lum: boomLit.l, big: boomLit.big });
await play(); await t.wait(1600);
const after = await t.eval(() => +PG.gta.lighting.darkness().toFixed(2));
check('the sky flash fades', after > 0.9, after);

// ---------- 9. L key: headlights in a car, torch on foot ----------
const keyCar = await t.eval(s => {
  const X = PG.gta, P = X.player; window.__tp(s.x - 3, s.y + 3, 30); X.clock = 23 * 60;
  const c = X.makeCar('voltage', s.x, s.y, 0, {}); window.__kc = c;
  const d = X.doorSpot(c, -1); P.ped.x = d.x; P.ped.y = d.y; X.enterCar(c);
  return true;
}, spot);
await t.wait(1500);
const inCar = await t.eval(() => ({ car: !!PG.gta.player.car, on: PG.gta.player.car && PG.gta.player.car.lightsOn }));
await t.press('KeyL'); await t.wait(120);
const off1 = await t.eval(() => PG.gta.player.car && PG.gta.player.car.lightsOn);
await t.press('KeyL'); await t.wait(120);
const on1 = await t.eval(() => PG.gta.player.car && PG.gta.player.car.lightsOn);
check('L toggles the headlights of your car', inCar.car && inCar.on === true && off1 === false && on1 === true, { inCar, off1, on1 });
const twin = await t.eval(() => { const c = PG.gta.player.car; return PG.gta.lighting.records().filter(r => r.cone > 0 && Math.hypot(r.x - c.x, r.y - c.y) < 4).length; });
check('your own car gets a beam per headlight', twin === 2, twin);
// leaving the car: follow-me-home lights, then off
await t.eval(() => PG.gta.exitCar()); await t.wait(1000);
const stay = await t.eval(() => ({ on: window.__kc.lightsOn, offAt: +(window.__kc._lgoff - PG.gta.time).toFixed(1) }));
await t.eval(() => { window.__kc._lgoff = PG.gta.time + 0.3; }); await t.wait(700);
const gone = await t.eval(() => window.__kc.lightsOn);
check('headlights stay on a few seconds after you leave, then switch off', stay.on === true && stay.offAt > 3 && stay.offAt < 6 && gone === false, { stay, gone });
await t.eval(() => { const P = PG.gta.player; P.ped.th = 0; P.ped.aim = 0; });
await t.press('KeyL'); await t.wait(150);
const torch = await t.eval(() => { const X = PG.gta, p = X.player.ped; return { on: X.lighting.torch, cones: X.lighting.records().filter(r => r.cone > 0 && Math.hypot(r.x - p.x, r.y - p.y) < 1.5).length }; });
await freeze(); await settle(); await t.shot('lighting-9-torch'); await play();
await t.press('KeyL'); await t.wait(100);
const torchOff = await t.eval(() => PG.gta.lighting.torch);
check('L on foot toggles a pocket torch', torch.on === true && torch.cones === 1 && torchOff === false, { torch, torchOff });

// ---------- 10. automatic headlights ----------
await t.wait(400);
const auto = await t.eval(() => new Promise(r => {
  const X = PG.gta, P = X.player, p = P.ped, mine = [];
  for (let k = 0; k < 60 && mine.length < 6; k++) { const c = X.spawnParked(p.x, p.y, 15, 140); if (c) mine.push(c); }
  const born = mine.filter(c => c.lightsOn).length;   // makeCar switches them on
  setTimeout(() => {
    const traffic = X.cars.filter(c => !c.removed && !c.wrecked && c.ctrl === 'path');
    r({ parked: mine.length, bornOn: born, parkedOff: mine.filter(c => !c.removed && !c.lightsOn).length, traffic: traffic.length, trafficOn: traffic.filter(c => c.lightsOn).length });
  }, 300);
}));
check('parked cars sit dark, traffic drives with its lights on', auto.parked >= 3 && auto.parkedOff === auto.parked && auto.traffic > 5 && auto.trafficOn >= auto.traffic * 0.9, auto);

// ---------- 11. dusk and dawn ----------
await t.eval(s => { window.__tp(s.x, s.y, 60); PG.gta.clock = 19.5 * 60; }, spot);
await freeze(); await settle(250);
const dusk = await t.eval(() => window.__screen());
await t.shot('lighting-10-dusk');
await t.eval(() => { PG.gta.clock = 6.5 * 60; }); await settle(250);
const dawn = await t.eval(() => window.__screen());
await t.shot('lighting-11-dawn');
check('the warm sun glow sits west at dusk and east at dawn', (dusk.lrb - dusk.rrb) - (dawn.lrb - dawn.rrb) > 20, { dusk, dawn });
check('dusk and dawn are lighter than the night', dusk.l > night.l * 1.3 && dawn.l > night.l * 1.3, { dusk: dusk.l, dawn: dawn.l, night: night.l });
await play();

// ---------- 12. neon, signs and beacons ----------
const neon = await t.eval(() => {
  const X = PG.gta, C = X.city; X.clock = 23 * 60;
  const recsNear = (x, y, R) => X.lighting.records().filter(r => r.roof && Math.hypot(r.x - x, r.y - y) < R).length;
  const b = C.buildings.filter(b => !b.deco && X.districtAt((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2) === 'Neon Mile' && b.h > 14 && b.x0 > 20 && b.y0 > 20).sort((a, c) => (c.x1 - c.x0) * (c.y1 - c.y0) - (a.x1 - a.x0) * (a.y1 - a.y0))[0]
    || C.buildings.find(b => !b.deco && b.neon >= 0 && b.h > 14);
  window.__tp((b.x0 + b.x1) / 2, b.y1 + 4, 50); X.cam.span = 70; window.__nb = b;
  return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
});
await freeze(); await settle(300);
const roofRecs = await t.eval(c => PG.gta.lighting.records().filter(r => r.roof).length, neon);
await t.shot('lighting-12-neon');
const tower = await t.eval(() => {
  const X = PG.gta, b = X.city.buildings.filter(b => !b.deco && b.h > 58 && b.x1 - b.x0 > 8 && b.y1 - b.y0 > 8)[0];
  if (!b) return { none: true };
  PG.game.status = 'play'; window.__tp(b.x1 - 1, b.y1 + 4, 40); X.cam.span = 40;
  return { h: Math.round(b.h), x: b.x1 - 1, y: b.y1 - 1 };
});
await t.wait(1600);
const beacon = tower.none ? 'no tower in this city' : await t.eval(b => new Promise(r => { let seen = 0, n = 0; (function f() { if (PG.gta.lighting.records().some(q => q.roof && q.color === '#ff2a1a' && Math.hypot(q.x - b.x, q.y - b.y) < 2)) seen++; if (++n < 150) requestAnimationFrame(f); else r(seen); })(); }), tower);
check('neon edges, rooftop signs and tower beacons light up the roofs', roofRecs >= 2 && (tower.none || beacon > 0), { roofRecs, tower, beaconFrames: beacon });

// ---------- 13. interiors ----------
const inside = await t.eval(() => {
  const X = PG.gta; X.clock = 23 * 60; window.__onFoot();
  if (X.interiors && X.interiors.enter) {
    X.interiors.enter('bar');
    return new Promise(r => { let n = 0; (function f() { const sc = X.scene; if (sc || ++n > 120) r(sc ? { real: true, entered: true, name: sc.name, amb: sc.ambient, d: +X.lighting.darkness().toFixed(3), want: +((1 - sc.ambient) * 0.96).toFixed(3) } : { real: true, entered: false }); else requestAnimationFrame(f); })(); });
  }
  const p = X.player.ped;
  const mk = a => ({ id: 'lt', name: 'Light Test Room', cityPos: { x: p.x, y: p.y }, camSpan: 22, bg: '#050507', ambient: a,
    drawFloor(ctx) { ctx.fillStyle = '#6b5a44'; ctx.fillRect(3990, 3990, 20, 20); ctx.fillStyle = '#4a3e30'; for (let i = 0; i < 20; i += 2) ctx.fillRect(3990 + i, 3990, 1, 20); } });
  X.enterScene(mk(0.95), 4000, 4000, 0); const bright = +X.lighting.darkness().toFixed(3);
  X.leaveScene(); X.enterScene(mk(0.3), 4000, 4000, 0); const dim = +X.lighting.darkness().toFixed(3);
  window.__testLights = [{ x: 3996, y: 3996, r: 6, c: '#ff3fd0', i: 0.9 }, { x: 4005, y: 4004, r: 7, c: '#3fd0ff', i: 0.9 }];
  return { real: false, entered: true, bright, dim };
});
await t.wait(900); await freeze(); await settle();
await t.shot('lighting-13-interior');
if (inside.real) check('indoors the darkness follows the scene ambient, not the clock', inside.entered && Math.abs(inside.d - inside.want) < 0.03, inside);
else check('indoors the darkness follows the scene ambient, not the clock', Math.abs(inside.bright - 0.048) < 0.02 && Math.abs(inside.dim - 0.672) < 0.02, inside);
await play();
await t.eval(() => { const X = PG.gta; window.__testLights = []; if (X.scene) { if (X.interiors && X.interiors.leave && X.scene._int) X.interiors.leave(); else X.leaveScene(X.scene.cityPos.x, X.scene.cityPos.y); } });
await t.wait(300);

// ---------- 14. light cap, pause, follow camera ----------
await t.eval(s => { window.__tp(s.x, s.y, 30); PG.gta.clock = 23 * 60; const a = []; for (let i = 0; i < 600; i++) a.push({ x: s.x + (i % 30) - 15, y: s.y + Math.floor(i / 30) - 10, r: 3, c: i % 2 ? '#ff5050' : '#50a0ff', i: 0.5 }); window.__testLights = a; }, spot);
await t.wait(500);
const cap = await t.eval(() => ({ lights: PG.gta.lighting.stats.lights, submitted: PG.gta.lighting.stats.submitted }));
await t.eval(() => { window.__testLights = []; PG.pause(true); });
await t.wait(400);
const paused = await t.eval(() => ({ status: PG.game.status, lights: PG.gta.lights.length }));
await t.eval(() => { PG.pause(false); });
check('600 submitted lights are capped, pause keeps rendering', cap.lights <= 380 && cap.submitted >= 300 && paused.status === 'paused' && paused.lights === 0, { cap, paused });
await t.eval(() => {
  const X = PG.gta, P = X.player, c = window.__kc && !window.__kc.removed ? window.__kc : X.makeCar('hatch', P.ped.x + 3, P.ped.y, 0.7, {});
  X.toPhys(c); c.driver = P.ped; P.ped.car = c; P.ped.hidden = true; P.car = c; c.lightsOn = true; X.cam.mode = 'follow';
});
await t.hold(['KeyW', 'KeyD'], 1200);
await freeze(); await settle(); await t.shot('lighting-14-follow-cam'); await play();
await t.eval(() => { PG.gta.cam.mode = 'fixed'; });

// ---------- 15. day phases and the HUD clock ----------
await t.eval(() => { window.__ev.phase = []; PG.gta.clock = 7 * 60 + 58; });
await t.wait(2600);
const sky1 = await t.eval(() => { const el = document.querySelector('#gta-hud .g-clock'); return el && el.getAttribute('data-sky'); });
await t.eval(() => { PG.gta.clock = 20 * 60 + 12; });
await t.wait(3000);
const sky2 = await t.eval(() => { const el = document.querySelector('#gta-hud .g-clock'); return el && el.getAttribute('data-sky'); });
const phases = await t.eval(() => window.__ev.phase.slice());
check('dawn and nightfall emit dayPhase and change the clock icon', phases.includes('day') && phases.includes('night') && sky1 === 'day' && sky2 === 'night', { phases, sky1, sky2 });

// ---------- 16. quality levels and light engines (PG.settings.lighting / lightEngine) ----------
const setS = (k, v) => t.eval(([k, v]) => { if (PG.setSetting) PG.setSetting(k, v); else (PG.settings = PG.settings || {})[k] = v; }, [k, v]);
await t.eval(l => {
  // a lit car on the road beside the lamp, pointing along the road
  const X = PG.gta, Lp = window.__lampRef, nx = Lp.nx, ny = Lp.ny, cx = l.px + nx * 4, cy = l.py + ny * 4, th = Math.atan2(nx, -ny);
  window.__tp(l.px, l.py, 40); X.clock = 23 * 60;
  const c = X.makeCar('hatch', cx, cy, th, { npcDriver: X.randomNpc() }); c.lightsOn = true; c.ctrl = 'parked'; window.__qc = c;
  window.__qb = { x: cx + Math.cos(th) * 10, y: cy + Math.sin(th) * 10, bx: cx - Math.cos(th) * 10, by: cy - Math.sin(th) * 10 };
}, lamp);
await t.wait(400); await freeze();
const looks = {};
for (const [eng, lvl] of [['canvas', 'high'], ['webgl', 'high'], ['canvas', 'medium'], ['webgl', 'low'], ['canvas', 'low'], ['canvas', 'off']]) {
  await setS('lightEngine', eng); await setS('lighting', lvl); await settle(250);
  // the brightest of a few frames: a lamp may be one of the flickering ones
  looks[eng + '-' + lvl] = await t.eval(async l => {
    const X = PG.gta, L = X.lighting, b = window.__qb, o = { pool: 0, beam: 0, behind: 0, screen: 0 };
    for (let k = 0; k < 4; k++) {
      await new Promise(r => setTimeout(r, 90));
      o.pool = Math.max(o.pool, window.__lum(l.px, l.py, 8).l); o.beam = Math.max(o.beam, window.__lum(b.x, b.y, 6).l);
      o.behind = Math.max(o.behind, window.__lum(b.bx, b.by, 6).l); o.screen = Math.max(o.screen, window.__screen().l);
    }
    return Object.assign(o, { engine: L.stats.engine, recs: L.records().length, night: L.isNight(), at: +L.lightAt(l.px, l.py).toFixed(2) });
  }, lamp);
  if (eng === 'webgl' || lvl !== 'high') await t.shot(`lighting-16-${eng}-${lvl}`);
}
const gl = await t.eval(() => { const c = document.createElement('canvas'); return !!(c.getContext('webgl') || c.getContext('experimental-webgl')); });
const H = looks['canvas-high'], WG = looks['webgl-high'];
if (gl) check('WebGL light engine draws the same night as the canvas engine', WG.engine === 'webgl' && Math.abs(WG.screen - H.screen) < H.screen * 0.15 && Math.abs(WG.pool - H.pool) < H.pool * 0.25 && WG.beam > WG.behind * 1.3, { canvas: H, webgl: WG });
else check('without WebGL the webgl setting falls back to the canvas engine', WG.engine === 'canvas', WG);
const M = looks['canvas-medium'], LO = looks['canvas-low'], LW = looks['webgl-low'], OFF = looks['canvas-off'];
check('medium and low lighting: still night, lamps and headlights still light the street, fewer lights', [M, LO, LW].every(q => q.screen < OFF.screen * 0.8 && q.pool > q.screen * 1.5 && q.beam > q.behind * 1.3) && LO.recs < H.recs && M.recs <= H.recs, { medium: M, low: LO, webglLow: LW, high: H.recs });
check('lighting off: no darkness at night, but the game still knows it is night', OFF.engine === 'off' && OFF.recs === 0 && OFF.screen > H.screen * 1.25 && OFF.night && OFF.at > 0.5, { off: OFF, high: H });
await setS('lighting', 'high'); await setS('lightEngine', 'auto'); await t.eval(() => { if (PG.applyPreset) PG.applyPreset('high'); });
const autoEng = await t.eval(() => new Promise(r => setTimeout(() => r(PG.gta.lighting.engineInfo()), 300)));
check('lightEngine auto: WebGL only with a hardware context, else the canvas engine', autoEng.engine === 'canvas' || (autoEng.engine === 'webgl' && autoEng.webgl === 'hardware'), autoEng);
await play();
await t.eval(() => { if (window.__qc) PG.gta.removeCar(window.__qc); });

// ---------- 17. a second game ----------
const again = await t.eval(() => new Promise(r => {
  const X = PG.gta; X.lighting.torch = true; X.lighting.flash(1);
  X.stop(); X.start(PG.GTA_DEF);
  setTimeout(() => { X.clock = 23 * 60; setTimeout(() => r({ active: X.active, lights: X.lighting.stats.lights, torch: X.lighting.torch, d: +X.lighting.darkness().toFixed(2), lamps: X.lighting.stats.lamps }), 600); }, 300);
}));
check('a second game starts clean and lit', again.active && again.lights > 0 && again.torch === false && again.d > 0.95, again);
await t.shot('lighting-15-second-game');

check('no console errors', t.errors.length === 0, t.errors.slice(0, 5).join(' | '));
await t.close();
console.log(failed ? `${failed} check(s) failed` : 'all lighting checks passed');
process.exit(failed ? 1 : 0);
