// Damage, fire & explosions: car damage stages -> fire -> explosion -> wreck, dents/glass/bullet holes,
// weaker engine and repair, the burning-car HUD warning (bail out / stay in), a 10-car chain reaction
// with fps, barrels (shot, rammed, rippling clusters, flying propane), fireworks crates, people on fire
// and spreading, ground fires, burning trees, fuel trails, blast knockback, live audio, pause, a second game.
// Review additions: unpausing right after a blast, who gets blamed for ember fires, merged fire lights,
// lamps knocked out by blasts, nothing spawning indoors, prop density, tidying our own bodies, the
// chain banner handing over to the hud module, and the module's own frame cost during the chain.
// Usage: node tests/damage.test.mjs <built.html> <screenshot dir>
import { launch } from './harness.mjs';
const t = await launch({ html: process.argv[2], out: process.argv[3] });
let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info !== undefined ? ' ' + JSON.stringify(info) : ''}`); if (!ok) fails++; };
const waitFor = async (fn, ms, arg) => { const t0 = Date.now(); for (;;) { const r = await t.eval(fn, arg); if (r || Date.now() - t0 > ms) return r; await t.wait(100); } };
const fps = ms => t.eval(ms => new Promise(r => { let n = 0; const t0 = performance.now(); (function f() { n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else r(Math.round(n / (ms / 1000))); })(); }), ms);

// ---- in-page helpers: a long straight empty road ("arena"), cleanup, spawning ----
await t.eval(() => {
  const X = PG.gta, C = X.city, P = X.player;
  const T = window.T = { ev: [], A: null };
  X.on('explosion', e => T.ev.push({ x: e.x, y: e.y, power: e.power }));
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
  T.clean = function () {
    const A = T.A;
    if (P.car) { const c = P.car; X.exitCar(); X.removeCar(c); }
    for (const c of X.cars) if (Math.abs(c.x - A.x) < 120 && Math.abs(c.y - A.y) < 120) X.removeCar(c);
    for (const pr of X.props.slice()) if (Math.abs(pr.x - A.x) < 80 && Math.abs(pr.y - A.y) < 80) X.removeProp(pr);
    for (const p of X.peds) if (!p.isPlayer && Math.abs(p.x - A.x) < 80 && Math.abs(p.y - A.y) < 80) p.removed = true;
    X.damage.fires.length = 0; X.damage.fuel.length = 0;
    T.heal(); T.put(A.x, A.y + A.w / 2 + 2.5);
  };
  T.heal = function () { const p = P.ped; p.maxHp = p.hp = 100; p.armor = 0; p.onFire = 0; p.knock = 0; p.vx = p.vy = 0; };
  T.god = function () { P.ped.maxHp = P.ped.hp = 1e5; };   // stand close to the action for the screenshots (HUD bar stays sane)
  // this module's heavy render layers (lights + fire beds, smoke, flames) timed with their raster work: a
  // forced flush before and after each
  const HEAVY = ['ground', 'air', 'overlay'];
  T.layerMs = frames => new Promise(res => {
    const m = X.modules.find(q => q.name === 'damage'), cx = document.getElementById('game').getContext('2d'), orig = m.render, wrapped = {};
    let ms = 0, n = 0;
    for (const k in orig) wrapped[k] = HEAVY.includes(k) ? function () { cx.getImageData(0, 0, 1, 1); const t0 = performance.now(); const r = orig[k].apply(this, arguments); cx.getImageData(0, 0, 1, 1); ms += performance.now() - t0; return r; } : orig[k];
    m.render = wrapped;
    (function f() { if (++n <= frames) requestAnimationFrame(f); else { m.render = orig; res(+(ms / frames).toFixed(2)); } })();
  });
  T.put = function (x, y) { const p = P.ped; p.x = x; p.y = y; p.vx = p.vy = 0; X.cam.x = x; X.cam.y = y; };
  T.park = (id, x, y, th, o) => X.makeCar(id, x, y, th || 0, Object.assign({ ctrl: 'parked' }, o));
  T.ped = (x, y) => X.makePed({ x, y, th: 0, ai: { owner: 'test' } });
});

// ---- 1. module present, services replaced, props spawned around the player ----
const s1 = await t.eval(() => {
  const X = PG.gta, f = X.focus(), pr = X.props;
  const solid = pr.filter(p => { const b = X.blocked(p.x, p.y, 0); return b && b.prop === p; }).length;
  return { has: X.has('damage'), stage: typeof X.carDamageStage, hit: typeof X.hitProp, fire: typeof X.fireAt, props: pr.length, solid, clusters: X.damage.clusters.length,
    near: pr.filter(p => Math.hypot(p.x - f.x, p.y - f.y) < 420).length, types: [...new Set(pr.map(p => p.type))],
    close: X.damage.clusters.filter(k => Math.hypot(k.x - f.x, k.y - f.y) < 320).length };
});
check('module loaded and API exported', s1.has && s1.stage === 'function' && s1.hit === 'function' && s1.fire === 'function', s1);
check('explosive prop clusters placed around the player', s1.clusters >= 5 && s1.near >= 10 && s1.solid === s1.props, s1);
// 12 clusters spread over 420 m meant about one sighting per kilometre driven; keep them within ~300 m
check('prop clusters stay close enough to run into', s1.close >= 8, s1);
const A = await t.eval(() => T.arena());
console.log('arena', JSON.stringify(A));

// ---- 2. damage stages: smoke -> black smoke -> fire -> explosion -> wreck ----
await t.eval(() => {
  const X = PG.gta, A = T.A; T.clean();
  T.put(A.x, A.y + 3);
  T.car = T.park('hatch', A.x, A.y - 3.75, 0, { color: '#4a6fa5' });
  T.ev.length = 0;
});
const stageAt = async frac => { await t.eval(f => { const c = T.car; PG.gta.damageCar(c, c.hp - c.maxHp * f, PG.gta.player.ped, 'bullet'); }, frac); await t.wait(700); return t.eval(() => PG.gta.carDamageStage(T.car)); };
check('car at 60 % looks fine', (await stageAt(0.6)) === 'ok');
const st40 = await stageAt(0.4); await t.shot('damage-01-smoke');
check('car below 45 % smokes grey', st40 === 'smoke', st40);
const st20 = await stageAt(0.2); await t.shot('damage-02-black-smoke');
check('car below 25 % smokes black', st20 === 'black', st20);
const st10 = await stageAt(0.1); await t.shot('damage-03-burning');
const burn = await t.eval(() => ({ st: PG.gta.carDamageStage(T.car), b: T.car.burning, max: T.car.burnMax }));
check('car below 12 % burns with a 4-6 s fuse', burn.st === 'fire' && burn.max >= 4 && burn.max <= 6, burn);
await t.eval(() => T.god());
const boom = await waitFor(() => T.car.wrecked, 7500);
await t.wait(250); await t.shot('damage-04-explosion');
const w = await t.eval(() => ({ wrecked: T.car.wrecked, removed: T.car.removed, ev: T.ev.length, smoulder: T.car.smoulder, hp: T.car.hp, x: T.car.x }));
check('burning car explodes and leaves a smouldering wreck', boom && w.ev >= 1 && !w.removed && w.smoulder > 0, w);
await t.wait(1500); await t.shot('damage-05-wreck');
const pushed = await t.eval(() => new Promise(r => { const c = T.car, x0 = c.x; c.dv.vx = 6; setTimeout(() => r(Math.abs(c.x - x0)), 400); }));
await t.eval(() => T.heal());
check('the wreck can still be pushed', pushed > 0.5, pushed);

// ---- 3. dents, cracked glass, dead lights, loose bumper, bullet holes ----
const dm = await t.eval(() => {
  const X = PG.gta, A = T.A; T.clean(); T.put(A.x, A.y + 1.5);
  const c = T.dent = T.park('comet', A.x - 2.5, A.y - 2, 0, { color: '#c9ccd1' });
  const b = T.dent2 = T.park('voltage', A.x + 3.5, A.y - 2, Math.PI, { color: '#b0151a' });
  X.emit('carImpact', { car: c, other: null, speed: 16, at: { x: c.x + 2.2, y: c.y - 0.5 } });
  X.emit('carImpact', { car: c, other: null, speed: 20, at: { x: c.x - 2.2, y: c.y + 0.3 } });
  X.emit('carImpact', { car: b, other: null, speed: 12, at: { x: b.x, y: b.y + 1 } });
  X.emit('carImpact', { car: b, other: null, speed: 21, at: { x: b.x - 2.4, y: b.y } });
  for (let k = 0; k < 6; k++) X.damageCar(c, 5, X.player.ped, 'bullet');
  const d = c.dmg;
  return { f: d.f, b: d.b, glass: d.glass, lights: d.lights, tails: d.tails, bumperB: d.bumperB, holes: d.holes.length, dents: d.dents.length, side: b.dmg.l + b.dmg.r };
});
await t.wait(300); await t.shot('damage-06-dents');
check('impacts dent the panel that was hit', dm.f > 0.3 && dm.b > 0.5 && dm.side > 0.2 && dm.dents >= 2, dm);
check('front crash cracks the windscreen and knocks out a headlight', dm.glass > 0.3 && dm.lights > 0, dm);
check('rear crash leaves a loose bumper and dead tail light', dm.bumperB !== 0 && dm.tails > 0, dm);
check('bullets leave holes', dm.holes >= 5, dm);

// ---- 4. heavy damage weakens the engine; a repair makes it like new ----
await t.eval(() => {
  const X = PG.gta, A = T.A; T.clean();
  const c = T.slow = T.park('hatch', A.x - 30, A.y + 3.75, 0, { color: '#3e5c4a' });
  c.hp = c.maxHp * 0.2;
  const d = X.doorSpot(c, -1); T.put(d.x, d.y);
});
await t.wait(100); await t.press('KeyF');
await waitFor(() => !!PG.gta.player.car, 2500);
await t.wait(200);
const weak = await t.eval(() => { const c = T.slow, d = c.dv.dyn; return { kw: d.kw, base: d._base && d._base.kw, inCar: PG.gta.player.car === c }; });
check('damaged engine has less power', weak.inCar && weak.base > 0 && weak.kw < weak.base * 0.8, weak);
const drive = async () => { await t.hold(['KeyW'], 1600); return t.eval(() => { const c = T.slow, v = c.speed; PG.gta.placeCar(c, T.A.x - 30, T.A.y + 3.75, 0); return v; }); };
const v1 = await drive();
await t.eval(() => { const c = T.slow; c.hp = c.maxHp; c.dmg = null; PG.gta.emit('carRepaired', { car: c }); });
await t.wait(200);
const fixed = await t.eval(() => { const c = T.slow, d = c.dv.dyn; return { kw: d.kw, base: PG.DYN.golf.kw, b: d._base, burning: c.burning, stage: PG.gta.carDamageStage(c), dmg: c.dmg }; });
const v2 = await drive();
check('repair restores full power and clean looks', fixed.kw === fixed.base && !fixed.b && !fixed.dmg && fixed.stage === 'ok', fixed);
check('repaired car accelerates harder', v2 > v1 * 1.08, { v1, v2 });

// ---- 5. your car on fire: HUD warning, bail out and survive ----
await t.eval(() => { const c = T.slow; c.hp = c.maxHp * 0.1; PG.gta.pager('Artur: That car is smoking. So are you. Get out of it before it gets out of you, and do not bring it to my garage.', 0); });
await t.wait(400);
const warn = await t.eval(() => {
  const el = document.querySelector('#gta-hud .g-dmgwarn'), pg = document.querySelector('#gta-hud .g-pager');
  const a = el.getBoundingClientRect(), b = pg.getBoundingClientRect();
  return { vis: !!el && !el.hidden && el.offsetParent !== null, text: el && el.textContent, burning: T.slow.burning, overlap: !pg.hidden && a.top < b.bottom && b.top < a.bottom && a.left < b.right && b.left < a.right };
});
await t.shot('damage-07-hud-warning');
await t.eval(() => PG.gta.pager(''));
check('HUD warns that your car is on fire', warn.vis && /ON FIRE/.test(warn.text) && warn.burning > 0, warn);
check('the fire warning stacks below a pager message instead of covering it', !warn.overlap, warn);
await t.press('KeyF'); await t.wait(250);
await t.eval(() => T.put(T.A.x - 30, T.A.y + T.A.w / 2 + 3.5));
const bailed = await t.eval(() => !PG.gta.player.car);
await waitFor(() => T.slow.wrecked, 7000);
await t.wait(300);
const surv = await t.eval(() => ({ wrecked: T.slow.wrecked, state: PG.gta.player.state, hp: PG.gta.player.ped.hp, warn: document.querySelector('#gta-hud .g-dmgwarn').hidden }));
check('bailing out of a burning car saves you', bailed && surv.wrecked && surv.state === 'play' && surv.hp > 0 && surv.warn, surv);

// ---- 6. stay in a burning car: wasted ----
await t.eval(() => { const A = T.A; T.clean(); const c = T.stay = T.park('bambino', A.x + 20, A.y + 3.75, 0); const d = PG.gta.doorSpot(c, -1); T.put(d.x, d.y); });
await t.wait(100); await t.press('KeyF');
await waitFor(() => !!PG.gta.player.car, 2500);
await t.eval(() => PG.gta.setOnFire(T.stay, 0.8, null));
const wasted = await waitFor(() => PG.gta.player.state === 'wasted', 3000);
check('staying in a car that blows up gets you wasted', wasted, await t.eval(() => ({ state: PG.gta.player.state, wrecked: T.stay.wrecked })));
await waitFor(() => PG.gta.player.state === 'play', 6000);
await t.eval(() => T.arena());

// ---- 7. chain reaction: ten parked cars in a row ----
const chain0 = await t.eval(() => {
  const X = PG.gta, A = T.A; T.clean();
  const ids = ['hatch', 'comet', 'bambino', 'taxi', 'hatch', 'fjord', 'comet', 'voltage', 'hatch', 'regret'];
  T.row = ids.map((id, k) => T.park(id, A.x - 26 + k * 5.7, A.y - 3.75, 0));
  T.put(A.x - 18, A.y + 4.5); T.god(); T.ev.length = 0; T.money0 = X.player.money;
  T.chainFloat = false; T.sampling = true;
  (function f() { if (X.floats.some(q => q.chain)) T.chainFloat = true; if (T.sampling) requestAnimationFrame(f); })();
  X.destroyCar(T.row[0], X.player.ped, 'bomb');
  return T.row.length;
});
await t.wait(1500); await t.shot('damage-08-chain-start');
await t.eval(() => T.put(T.A.x - 4, T.A.y + 4.5));
const chainFps = await fps(2000);
const chainMs = await t.eval(() => T.layerMs(40));
await t.shot('damage-09-chain-middle');
await t.eval(() => T.put(T.A.x + 16, T.A.y + 4.5));
await waitFor(() => T.row.every(c => c.wrecked), 11000);
await t.wait(600);
await t.shot('damage-10-chain-end');
const ch = await t.eval(() => { T.sampling = false; return { wrecked: T.row.filter(c => c.wrecked).length, ev: T.ev.length, chain: PG.gta.damage.stats.chainMax, money: PG.gta.player.money - T.money0, parts: PG.gta.damage.particles(), wanted: PG.gta.player.wanted, hud: PG.gta.has('hud'), float: T.chainFloat, alone: PG.gta.modules.length === 1 }; });
check('one bomb sets off the whole row (chain reaction)', ch.wrecked >= 9, ch);
check('chain multiplier counted and mayhem paid', ch.chain >= 5 && ch.money > 0, ch);
// one banner at a time: the hud module's CHAIN REACTION banner replaces our floating CHAIN xN
check(ch.hud ? 'the hud module shows the car chain banner (no second CHAIN text)' : 'a CHAIN xN text counts the chain', ch.hud ? !ch.float : ch.float, ch);
// Whole-frame fps on a shared machine with software canvas also measures every other module; with them
// in the build, judge this module by its own per-frame cost (raster included) and keep the frame playable.
// Alone, the frame has room to spare, so the particle quality stays high and fps is the measure.
const perf = { fps: chainFps, damageMs: chainMs, cars: chain0, particles: ch.parts };
if (ch.alone) check('fps stays at 40+ during the chain', chainFps >= 40, perf);
else check('the chain stays playable (30+ fps) and this module costs under 10 ms a frame', chainFps >= 30 && chainMs <= 10, perf);
await t.eval(() => T.heal());

// ---- 8. barrels: a shot cluster ripples, rammed barrel, bullets along the aim, propane ----
const br = await t.eval(() => {
  const X = PG.gta, A = T.A; T.clean(); T.ev.length = 0;
  const y = A.y - A.w / 2 - 2.5, x = A.x - 10;
  T.put(x + 1, A.y - 1); T.god();
  T.bar = [X.addProp('barrel', x, y), X.addProp('barrel', x + 0.95, y), X.addProp('barrel', x + 0.48, y - 0.82), X.addProp('gas', x + 1.9, y)];
  T.victim = T.park('hatch', x + 3, A.y - A.w / 2 + 1.2, 0);
  T.walker = T.ped(x + 1, y + 2.2);
  return { n: T.bar.length, solid: T.bar.every(p => { const b = X.blocked(p.x, p.y, 0); return b && b.prop === p; }) };
});
check('props are solid', br.solid, br);
await t.eval(() => PG.gta.hitProp(T.bar[0], 100, PG.gta.player.ped));
await t.wait(160); await t.shot('damage-11-barrels');
await waitFor(() => T.bar.every(p => p.dead), 2000);
const br2 = await t.eval(() => ({ dead: T.bar.filter(p => p.dead).length, ev: T.ev.length, solidLeft: T.bar.filter(p => PG.gta.blocked(p.x, p.y, 0)).length, inList: T.bar.filter(p => PG.gta.props.includes(p)).length, carHp: Math.round(T.victim.hp / T.victim.maxHp * 100), knocked: T.walker.dead || T.walker.knock > 0 || T.walker.hp < 100 }));
check('shooting one barrel blows the whole cluster in a ripple', br2.dead === 4 && br2.ev >= 4 && br2.solidLeft === 0 && br2.inList === 0, br2);
check('the blast hurts the parked car and the passer-by', br2.carHp < 80 && br2.knocked, br2);
await t.eval(() => T.heal());
const ram = await t.eval(() => new Promise(res => {
  const X = PG.gta, A = T.A; T.clean();
  const pr = X.addProp('barrel', A.x + 10, A.y + 3.75), c = T.park('hatch', A.x - 6, A.y + 3.75, 0);
  X.toPhys(c); c.dv.vx = 16;
  T.put(A.x - 12, A.y + A.w / 2 + 3);
  setTimeout(() => res({ dead: pr.dead, carX: c.x - pr.x, hp: Math.round(c.hp), maxHp: c.maxHp, wrecked: c.wrecked }), 1600);
}));
check('ramming a barrel at speed blows it up and the car ploughs through', ram.dead && ram.carX > 0 && ram.hp < ram.maxHp, ram);
const shot = await t.eval(() => new Promise(res => {
  const X = PG.gta, A = T.A, P = X.player; T.clean();
  const pr = X.addProp('barrel', A.x - 20, A.y - A.w / 2 - 2.5);
  T.put(A.x - 20, A.y + 2); P.ped.th = P.ped.aim = Math.atan2(pr.y - P.ped.y, pr.x - P.ped.x);
  const real = !!(X.giveWeapon && X.WEAPONS && X.WEAPONS.pistol);
  if (real) { X.giveWeapon('pistol', 30); P.weapon = 'pistol'; P.ped.fireCd = 0; X.fireWeapon(P.ped, 'pistol', P.ped.aim); }   // weapons calls X.hitProp
  else X.emit('gunfire', { x: P.ped.x, y: P.ped.y, by: P.ped, weapon: 'pistol' });                                         // our own raycast fallback
  setTimeout(() => res({ dead: pr.dead, real }), 600);
}));
check('a bullet along your aim sets off a barrel', shot.dead, shot);
await t.eval(() => T.heal());
// with the weapons module: its molotov fire pools heat our barrels too
const wfire = await t.eval(() => {
  const X = PG.gta, A = T.A;
  if (!X.weapons || !Array.isArray(X.weapons.fires)) return null;
  T.clean(); T.put(A.x - 12, A.y + 3);
  T.wb = X.addProp('barrel', A.x + 2, A.y - 1);
  X.weapons.fires.push({ x: A.x + 2.6, y: A.y - 1, r: 1.4, life: 6, max: 6, by: null, t: 0, hitT: 0, small: false, cars: [] });
  return true;
});
if (wfire) check('a molotov fire pool (weapons) cooks off a barrel', await waitFor(() => T.wb.dead, 5000));
else console.log('SKIP weapons fire pools (weapons module not in this build)');
await t.eval(() => T.heal());
const pro = await t.eval(() => {
  const X = PG.gta, A = T.A; T.clean();
  T.pro = X.addProp('propane', A.x + 25, A.y); T.put(A.x + 18, A.y + 2);
  const rnd = Math.random; Math.random = () => 0.1;   // force the valve to blow off
  try { X.hitProp(T.pro, 100, X.player.ped, 'bullet'); } finally { Math.random = rnd; }
  return { fly: !!T.pro.fly };
});
await t.wait(350); await t.shot('damage-12-propane-rocket');
const pro2 = await waitFor(() => T.pro.dead, 2500);
check('a shot propane tank takes off and then explodes', pro.fly && pro2, pro);
const pro3 = await t.eval(() => new Promise(res => {
  const X = PG.gta, A = T.A; T.clean();
  const pr = X.addProp('propane', A.x + 20, A.y), tg = X.addProp('barrel', A.x + 23.5, A.y);
  T.put(A.x + 12, A.y + 3); T.god();
  const rnd = Math.random; Math.random = () => 0.1;
  try { X.hitProp(pr, 100, X.player.ped, 'bullet'); } finally { Math.random = rnd; }
  if (pr.fly) { pr.fly.a = 0; pr.fly.life = 5; }   // straight at the barrel, and no fizzling out on the way
  setTimeout(() => res({ fly: !!pr.fly, tank: pr.dead, barrel: tg.dead || tg.armed, bounces: pr.fly ? pr.fly.b : -1 }), 900);
}));
check('a flying propane tank that hits a barrel sets it off', pro3.fly && pro3.tank && pro3.barrel && pro3.bounces === 0, pro3);
const fw = await t.eval(() => {
  const X = PG.gta, A = T.A; T.clean();
  T.fw = X.addProp('fireworks', A.x + 6, A.y); T.put(A.x - 3, A.y + 3); T.god();
  X.hitProp(T.fw, 50, X.player.ped, 'bullet');
  return { armed: T.fw.armed };
});
await t.wait(1000); await t.shot('damage-12b-fireworks');
const fwDone = await waitFor(() => T.fw.dead, 6000);
const fws = await t.eval(() => ({ rockets: PG.gta.damage.stats.rockets, dead: T.fw.dead, solid: !!PG.gta.blocked(T.fw.x, T.fw.y, 0), inList: PG.gta.props.includes(T.fw) }));
check('a fireworks crate fires off whistling rockets, then burns out', fw.armed && fwDone && fws.rockets >= 5 && !fws.solid && !fws.inList, fws);
await t.eval(() => T.heal());

// ---- 9. people on fire: burn, spread, die charred; ground fire ignites; blast knocks people down ----
const pf = await t.eval(() => {
  const X = PG.gta, A = T.A; T.clean();
  T.p1 = T.ped(A.x, A.y + A.w / 2 + 1.5); T.p2 = T.ped(A.x + 0.5, A.y + A.w / 2 + 1.5);
  T.put(A.x - 6, A.y + A.w / 2 + 2);
  return X.setOnFire(T.p1, 6, X.player.ped);
});
await t.wait(500); await t.shot('damage-13-ped-fire');
const spread = await waitFor(() => T.p2.onFire > 0, 2500);
check('a person catches fire and it spreads to the one next to them', pf && spread, await t.eval(() => ({ f1: T.p1.onFire, f2: T.p2.onFire })));
await waitFor(() => T.p1.dead, 7000);
const p1 = await t.eval(() => ({ dead: T.p1.dead, hp: Math.round(T.p1.hp), charred: T.p1.look.shirt === '#26211d' }));
check('burning hurts until dead, leaving a charred body', p1.dead && p1.charred, p1);
const gf = await t.eval(() => new Promise(res => {
  const X = PG.gta, A = T.A; T.clean();
  const p = T.ped(A.x + 12, A.y + A.w / 2 + 2);
  const f = X.fireAt(A.x + 12, A.y + A.w / 2 + 2.3, { r: 1.2, life: 5 });
  T.put(A.x + 4, A.y + A.w / 2 + 2);
  setTimeout(() => res({ fire: !!f, onFire: p.onFire > 0, light: PG.gta.damage.fires.length }), 700);
}));
check('a ground fire sets people standing in it on fire', gf.fire && gf.onFire, gf);
const kb = await t.eval(() => new Promise(res => {
  const X = PG.gta, A = T.A; T.clean();
  const p = T.ped(A.x + 4, A.y), q = T.ped(A.x + 8.5, A.y), c = T.park('hatch', A.x - 3.5, A.y - 3.75, 0);
  T.put(A.x - 4, A.y + A.w / 2 + 6);
  X.explode(A.x, A.y, { power: 1, by: null });
  res({ knock: p.knock, sp: Math.hypot(p.vx, p.vy), hp: Math.round(p.hp), dead: p.dead, farKnock: q.knock, farHp: q.hp, carV: Math.hypot(c.dv ? c.dv.vx : 0, c.dv ? c.dv.vy : 0), carHp: c.hp < c.maxHp, scorch: X.decals.some(d => d.kind === 'scorch' && Math.hypot(d.x - A.x, d.y - A.y) < 1) });
}));
check('explosion knocks people down and flings them, with falloff', kb.knock > 0.5 && kb.sp > 3 && (kb.dead || kb.hp < 100) && kb.farKnock > 0 && kb.farHp >= 100, kb);
check('explosion shoves nearby cars, damages them and scorches the street', kb.carV > 1 && kb.carHp && kb.scorch, kb);

// ---- 10. trees burn; fuel trails ----
const tree = await t.eval(() => {
  const X = PG.gta, P = X.player, f = X.focus();
  const tr = X.city.trees.filter(q => !q.burnt && !q.burning).sort((a, b) => Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y))[0];
  if (!tr) return null;
  T.tree = tr; T.heal();
  const spot = [[9, 9], [-9, 9], [9, -9], [-9, -9], [12, 0], [-12, 0], [0, 12], [0, -12]].find(([dx, dy]) => !X.blocked(tr.x + dx, tr.y + dy, 0.5)) || [9, 9];
  T.put(tr.x + spot[0], tr.y + spot[1]);
  X.explode(tr.x + 1.5, tr.y, { power: 0.6 });
  return { burning: !!tr.burning };
});
if (tree) {
  await t.wait(1200); await t.shot('damage-14-tree-fire');
  const burnt = await waitFor(() => T.tree.burnt, 6000);
  check('explosions set trees on fire and they burn out', tree.burning && burnt, tree);
} else console.log('SKIP no trees in this city');
await t.eval(() => { T.heal(); T.arena(); });
const fuel = await t.eval(() => new Promise(res => {
  const X = PG.gta, A = T.A; T.clean();
  const c = T.leak = T.park('hatch', A.x - 20, A.y + 3.75, 0); c.hp = c.maxHp * 0.22;
  X.toPhys(c); c.dv.vx = 9;
  T.put(A.x - 15, A.y + A.w / 2 + 3);
  setTimeout(() => { const s = X.damage.fuel; res({ spots: s.length, first: s[0] && { x: s[0].x, y: s[0].y } }); }, 1800);
}));
let fuelOk = false;
if (fuel.spots >= 3) {
  await t.eval(f => PG.gta.fireAt(f.x, f.y, { r: 0.6, life: 3 }), fuel.first);
  await t.wait(1000); await t.shot('damage-15-fuel-trail');
  fuelOk = await waitFor(() => T.leak.burning > 0 || T.leak.wrecked, 6000);
}
check('a leaking car leaves a fuel trail that burns back to the car', fuel.spots >= 3 && fuelOk, fuel);

// ---- 11. every sound with audio live; pause freezes fire; a second game starts clean ----
const snd = await t.eval(() => new Promise(res => {
  const X = PG.gta, A = T.A, P = X.player; T.clean();
  PG.audio.unlock(); PG.audio.setMuted(false);
  const live = !!PG.audio.kit();
  T.god(); T.put(A.x, A.y + 3);
  const c = T.park('hatch', A.x + 5, A.y - 3.75, 0); c.hp = c.maxHp * 0.15;   // smoke, then fire (whoomp, crackle)
  X.toPhys(c); c.npcDriver = X.randomNpc(); c.dv.thr = 1;                       // coughing engine: backfires
  const b = X.addProp('barrel', A.x - 6, A.y - 1); X.hitProp(b, 5, P.ped, 'bullet');   // ping
  X.addProp('fireworks', A.x - 9, A.y + 2);
  X.hitProp(X.props[X.props.length - 1], 50, P.ped, 'bullet');                 // whistles and pops
  const pr = X.addProp('propane', A.x + 12, A.y); const rnd = Math.random; Math.random = () => 0.1;
  try { X.hitProp(pr, 100, P.ped, 'bullet'); } finally { Math.random = rnd; }   // hiss
  setTimeout(() => { X.explode(A.x - 6, A.y - 1, { by: P.ped }); }, 400);         // boom
  setTimeout(() => { PG.audio.setMuted(true); res({ live }); }, 2600);
}));
check('every fire and explosion sound plays without errors', t.errors.length === 0, snd.live ? 'audio live' : 'audio context unavailable here');
await t.eval(() => T.heal());
const paused = await t.eval(() => new Promise(res => {
  const X = PG.gta, A = T.A; T.clean();
  const c = T.park('hatch', A.x, A.y - 3.75, 0); X.setOnFire(c, 3, null);
  PG.pause(true); const b0 = c.burning;
  setTimeout(() => { const b1 = c.burning; PG.pause(false); res({ b0, b1 }); }, 600);
}));
check('pause freezes a burning fuse', paused.b0 === paused.b1 && paused.b0 > 0, paused);
const ext = await t.eval(() => new Promise(res => {
  const X = PG.gta, A = T.A; T.clean();
  const c = T.park('hatch', A.x - 10, A.y - 3.75, 0); X.setOnFire(c, 4, null);
  const p = T.ped(A.x + 10, A.y + 2); X.setOnFire(p, 6, null);
  const f = X.fireAt(A.x + 10, A.y - 2, { r: 1, life: 8 });
  setTimeout(() => {
    const n = X.extinguish(c) + X.extinguish(A.x + 10, A.y, 3);
    setTimeout(() => res({ n, burning: c.burning, wrecked: c.wrecked, ped: p.onFire, fire: X.damage.fires.includes(f) }), 2500);
  }, 500);
}));
check('X.extinguish puts out a burning car, a person and a ground fire', ext.n >= 3 && !ext.burning && !ext.wrecked && !ext.ped && !ext.fire, ext);
// PG.pause(false) sets last = performance.now(), so the next frame's rAF timestamp is usually earlier:
// one negative dt, X.time steps back and a fresh blast briefly has a negative age. Reproduced exactly.
const e0 = t.errors.length;
await t.eval(() => { const X = PG.gta, A = T.A; T.clean(); T.god(); X.explode(A.x + 6, A.y, { power: 1 }); PG.pause(true); });
await t.wait(300);
await t.eval(() => { PG.pause(false); PG.gta.time -= 1 / 60; });
await t.wait(500);
check('unpausing right after an explosion draws cleanly', t.errors.length === e0, t.errors.slice(e0, e0 + 2));
// embers carry their own explosion's culprit, not whoever blew something up last
const emb = await t.eval(() => new Promise(res => {
  const X = PG.gta, A = T.A, P = X.player; T.clean(); T.god();
  X.explode(A.x - 30, A.y, { power: 1, by: P.ped });
  for (let k = 0; k < 6; k++) X.explode(A.x + 8 + k * 3, A.y + (k % 2 ? 2 : -2), { power: 1.4, by: null });
  setTimeout(() => { const f = X.damage.fires.filter(q => q.x > A.x); res({ fires: f.length, blamed: f.filter(q => X.byPlayer(q.by)).length }); }, 1600);
}));
check('fires from a blast nobody caused are not blamed on the player', emb.fires >= 3 && emb.blamed === 0, emb);
const lamp = await t.eval(() => {
  const X = PG.gta, A = T.A; T.clean(); T.god();
  const l = X.city.lamps.filter(q => !q.broken).sort((a, b) => Math.hypot(a.x - A.x, a.y - A.y) - Math.hypot(b.x - A.x, b.y - A.y))[0];
  let ev = 0; X.on('lampBroken', e => { if (e.lamp === l) ev++; });
  X.explode(l.x + l.nx * 1.2, l.y + l.ny * 1.2, { power: 0.6 });
  return { broken: !!l.broken, ev };
});
check('a blast knocks out a street lamp and says so (lampBroken)', lamp.broken && lamp.ev === 1, lamp);
// a dozen fires in one spot light the night with one light, not twelve overlapping ones
const glow = await t.eval(() => new Promise(res => {
  const X = PG.gta, A = T.A; T.clean(); T.heal();
  for (let k = 0; k < 12; k++) X.fireAt(A.x + 6 + (k % 4) * 1.2, A.y + Math.floor(k / 4) * 1.2, { r: 0.8, life: 6 });
  const L = X.addLight; let n = 0, fr = 0;
  X.addLight = function (x, y, r, col) { if (col === '#ff8a30') n++; return L.apply(this, arguments); };
  (function f() { if (++fr <= 10) requestAnimationFrame(f); else { X.addLight = L; res({ fires: X.damage.fires.length, perFrame: +(n / 10).toFixed(1) }); } })();
}));
check('fires close together share one light', glow.fires >= 10 && glow.perFrame <= 2, glow);
// indoors: the city simulation holds still around the street outside, nothing spawns at the interior
const inside = await t.eval(() => new Promise(res => {
  const X = PG.gta, A = T.A; T.clean(); X.damage.fires.length = 0;
  const pos = X.playerPos(), c0 = X.damage.clusters.length;
  X.enterScene({ id: 'dmgtest', name: 'Test Room', cityPos: { x: pos.x, y: pos.y }, camSpan: 20, bg: '#202020', ambient: 0.5 }, 3600, 3600, 0);
  for (const k of X.damage.clusters.slice(0, 3)) for (const pr of k.props) X.removeProp(pr);
  setTimeout(() => { const r = { c0, c1: X.damage.clusters.length, indoors: X.props.filter(p => p.x > 3000).length }; X.leaveScene(pos.x, pos.y, 0); res(r); }, 1300);
}));
check('nothing spawns while the player is indoors', inside.c1 < inside.c0 && inside.indoors === 0, inside);
// the bodies pulled out of an exploded car: peds.js clears corpses, we tidy our own when it is absent
const bod = await t.eval(() => new Promise(res => {
  const X = PG.gta, A = T.A; T.clean(); T.god();
  const c = T.park('hatch', A.x + 10, A.y - 3.75, 0); c.npcDriver = X.randomNpc(); c.npcDriver.extra = 0;
  X.destroyCar(c, null, 'bomb');
  const b = X.peds.filter(p => p.dmgBody && !p.removed);
  for (const p of b) p.x += 320;   // out of sight and far from the action
  setTimeout(() => res({ bodies: b.length, dead: b.every(p => p.dead), left: b.filter(p => !p.removed).length, peds: X.has('peds') }), 2300);
}));
check(bod.peds ? 'bodies come out of an exploded car (peds.js clears them)' : 'bodies come out of an exploded car and are tidied away later', bod.bodies >= 1 && bod.dead && (bod.peds || bod.left === 0), bod);
await t.eval(() => T.heal());
const g2 = await t.eval(() => {
  const X = PG.gta; X.stop(); X.start(X.def);
  return { props: X.props.length, fires: X.damage.fires.length, parts: X.damage.particles(), exp: X.damage.stats.explosions };
});
await t.wait(500);
const g2b = await t.eval(() => new Promise(res => {
  const X = PG.gta, P = X.player, c = X.makeCar('hatch', P.ped.x + 6, P.ped.y, 0, { ctrl: 'parked' });
  P.ped.hp = 1e6;
  X.destroyCar(c, null, 'bomb');
  setTimeout(() => { P.ped.hp = P.ped.maxHp; res({ wrecked: c.wrecked, exp: X.damage.stats.explosions }); }, 300);
}));
check('second game starts clean and works', g2.props > 0 && g2.fires === 0 && g2.parts === 0 && g2.exp === 0 && g2b.wrecked && g2b.exp >= 1, { g2, g2b });

const setS = (k, v) => t.eval(([k, v]) => { if (PG.setSetting) PG.setSetting(k, v); else (PG.settings = PG.settings || {})[k] = v; }, [k, v]);
const presetHigh = () => t.eval(() => { if (PG.applyPreset) PG.applyPreset('high'); else Object.assign(PG.settings = PG.settings || {}, { lighting: 'high', particles: 'high', detail: 'high', shadows: true, decals: 'high', pedDensity: 1, policeMax: 8, wheel: 'zoom' }); });
// ---- PG.settings.particles thins the smoke and flames of a blast ----
const puff = async lvl => { await setS('particles', lvl); return t.eval(async () => {
  const X = PG.gta, f = X.focus(), n0 = X.damage.particles(), pp = X.player.ped, hp = pp.hp;
  pp.hp = 1e6; X.explode(f.x + 11, f.y + 3, { power: 1, noFire: true });
  const n1 = X.damage.particles();   // the blast emits right away
  await new Promise(r => setTimeout(r, 120));
  pp.hp = Math.min(hp, pp.maxHp);
  return n1 - n0;
}); };
const pHigh = await puff('high'); await t.wait(2500);
const pLow = await puff('low');
await presetHigh();
check('particles low: a blast throws much less smoke and fire than on high', pLow < pHigh * 0.65 && pHigh > 10, { high: pHigh, low: pLow });

check('no console errors', t.errors.length === 0, t.errors.slice(0, 5));
await t.close();
console.log(fails ? `${fails} check(s) failed` : 'all damage checks passed');
process.exit(fails ? 1 : 0);
