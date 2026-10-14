// Pedestrians & gangs: population around the player on the sidewalks (never inside buildings), walking
// and zebra crossings, fleeing gunfire and explosions, diving away from a car, a car hit (death, blood
// pool, cash), carjack victims fleeing or fighting back, burning people, witnesses, mugging, gang
// retaliation and respect, corpse cleanup, crowd spacing, the X.drawPed lineup (with sound on), fps in a
// busy scene, doors, horns and pointed guns, and a second game. Works with or without the other modules.
// Usage: node tests/peds.test.mjs <built.html> <screenshot dir>
import { launch } from './harness.mjs';
const t = await launch({ html: process.argv[2], out: process.argv[3] });
let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info !== undefined ? ' ' + JSON.stringify(info) : ''}`); if (!ok) fails++; };
const waitFor = async (fn, ms, arg) => { const t0 = Date.now(); for (;;) { const r = await t.eval(fn, arg); if (r || Date.now() - t0 > ms) return r; await t.wait(100); } };
const snap = name => t.shot('peds-' + name);

// ---- in-page helpers ----
await t.eval(() => {
  const X = PG.gta, P = X.player, C = X.city;
  const T = window.T = { ev: {} };
  for (const k of ['witness', 'witnessCall', 'gangProvoked', 'pedDive', 'mugged', 'crime', 'pedKilled', 'gangRespect']) { T.ev[k] = []; X.on(k, e => T.ev[k].push(e)); }
  const v = X.view; X.view = function (...a) { if (T.span) X.cam.span = T.span; return v.apply(this, a); };
  T.mine = () => X.peds.filter(p => p.ai && p.ai.owner === 'peds' && !p.dead && !p.removed);
  T.civs = () => T.mine().filter(p => p.ai.type !== 'gang');
  T.put = (x, y) => { const p = P.ped; p.x = x; p.y = y; p.vx = p.vy = 0; X.cam.x = x; X.cam.y = y; };
  T.heal = () => { const p = P.ped; p.hp = p.maxHp = 100000; p.armor = 0; p.onFire = 0; p.knock = 0; };
  // A long top edge of a city block near the player: the sidewalk runs along y = b.y0 + 2.5.
  T.arena = function () {
    const pp = P.ped; let best = null;
    for (const b of C.blocks) {
      if (b.kind !== 'city' || b.x1 - b.x0 < 90) continue;
      const d = Math.hypot((b.x0 + b.x1) / 2 - pp.x, b.y0 - pp.y);
      if (!best || d < best.d) best = { d, b };
    }
    const b = best.b; T.A = { b, x: (b.x0 + b.x1) / 2, y: b.y0 + 2.6 };
    X.trafficRules.push(c => Math.abs(c.x - T.A.x) < 160 && Math.abs(c.y - T.A.y) < 160 ? 0 : null);
    return { x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, x: T.A.x, y: T.A.y };
  };
  T.clean = function (r) {
    const A = T.A; r = r || 45;
    if (P.car) { const c = P.car; X.exitCar(); X.removeCar(c); }
    for (const c of X.cars) if (Math.abs(c.x - A.x) < 70 && Math.abs(c.y - A.y) < 70) X.removeCar(c);
    for (const p of X.peds) if (!p.isPlayer && Math.abs(p.x - A.x) < r && Math.abs(p.y - A.y) < r) p.removed = true;
    for (const d of X.crowd.dogs) if (Math.abs(d.x - A.x) < r && Math.abs(d.y - A.y) < r) d.removed = true;
    T.heal(); T.put(A.x, A.y);
  };
  T.civ = (dx, type) => { const p = X.crowd.spawn(type || 'walker', T.A.x + dx, T.A.y); p.ai.nextIdle = 999; p.ai.type = type || 'walker'; return p; };
  T.freeze = p => { p.ai.st = 'idle'; p.ai.idle = 'look'; p.ai.t = 999; p.ai.face = p.th; };
});

// ---- 1. module, services, gangs ----
const s1 = await t.eval(() => {
  const X = PG.gta;
  return { has: X.has('peds'), draw: X.drawPed.owner, crowd: typeof X.crowd.spawn, gangs: X.gangs.list.map(g => ({ id: g.id, d: g.district, blocks: g.blocks.length })) };
});
check('module loaded, X.drawPed replaced, X.crowd and X.gangs exported', s1.has && s1.draw === 'peds' && s1.crowd === 'function', s1);
check('three gangs own a district each', s1.gangs.length === 3 && new Set(s1.gangs.map(g => g.d)).size === 3 && s1.gangs.every(g => g.blocks > 0), s1.gangs);

// ---- 2. population ----
await t.wait(2500);
const s2 = await t.eval(() => {
  const X = PG.gta, f = X.focus(), civs = T.civs();
  const types = {}; for (const p of civs) types[p.ai.type] = (types[p.ai.type] || 0) + 1;
  const inB = T.mine().filter(p => { const b = X.blocked(p.x, p.y, 0); return b && b.kind === 'building'; }).length;
  const off = civs.filter(p => !X.onSidewalk(p.x, p.y) && !/cross|wait|toKerb|flee|stroll|idle|fight/.test(p.ai.st)).map(p => [p.ai.st, Math.round(p.x), Math.round(p.y)]);
  const far = civs.filter(p => Math.hypot(p.x - f.x, p.y - f.y) > 200).length;
  return { n: civs.length, types, inB, off: off.length, offs: off.slice(0, 4), far, dogs: X.crowd.dogs.length, couples: civs.filter(p => p.ai.lead).length, groups: X.crowd.groups.length };
});
check('about 70 civilians around the player', s2.n >= 55 && s2.n <= 95 && s2.far === 0, s2);
check('a mix of people: types, couples and dogs', Object.keys(s2.types).length >= 6 && s2.couples >= 1 && s2.dogs >= 1, s2.types);
check('nobody inside a building, everyone on a sidewalk', s2.inB === 0 && s2.off <= 2, { inB: s2.inB, off: s2.off, offs: s2.offs });
await snap('01-crowd');

// ---- 3. walking along the rings ----
const w0 = await t.eval(() => { T.w = T.civs().filter(p => p.ai.st === 'walk').slice(0, 30).map(p => ({ p, x: p.x, y: p.y })); return T.w.length; });
await t.wait(2000);
const s3 = await t.eval(() => {
  const X = PG.gta, moved = T.w.filter(o => !o.p.removed).map(o => Math.hypot(o.p.x - o.x, o.p.y - o.y));
  const inB = T.mine().filter(p => { const b = X.blocked(p.x, p.y, 0); return b && b.kind === 'building'; }).length;
  return { n: moved.length, mean: +(moved.reduce((s, v) => s + v, 0) / Math.max(1, moved.length)).toFixed(2), inB };
});
check('walkers walk (and still not inside buildings)', w0 >= 10 && s3.mean > 1.5 && s3.inB === 0, s3);

// ---- 4. a zebra crossing ----
const A = await t.eval(() => { const A = T.arena(); T.clean(60); return A; });
console.log('arena', JSON.stringify(A));
const s4a = await t.eval(() => {
  const X = PG.gta, b = T.A.b, p = X.crowd.spawn('walker', b.x0 + 3, b.y0 + 3);
  p.ai.spd = 3.5; p.ai.nextIdle = 999; p.ai.ci = 0; p.ai.li = 3; p.ai.dir = 1; p.ai.join = false;
  T.cr = p; T.crB = b;
  const ok = X.crowd.forceCross(p);
  return { ok, st: p.ai.st, to: [Math.round(p.ai.cx1), Math.round(p.ai.cy1)] };
});
const s4 = await waitFor(() => { const p = T.cr; return p.ai.blk !== T.crB && p.ai.st === 'walk' ? { st: p.ai.st, on: PG.gta.onSidewalk(p.x, p.y), crossings: PG.gta.crowd.stats.crossings } : null; }, 16000);
check('a pedestrian waits at the kerb and crosses at the zebra to the next block', s4a.ok && !!s4 && s4.on && s4.crossings >= 1, { s4a, s4 });

// ---- 5. gunfire: people within ~25 m flee, panic spreads, far ones stay calm ----
await t.eval(() => { T.clean(60); for (const p of PG.gta.peds) if (!p.isPlayer && p.ai && p.ai.owner === 'peds' && Math.hypot(p.x - T.A.x, p.y - T.A.y) < 120) p.removed = true; });
const s5a = await t.eval(() => {
  const X = PG.gta, A = T.A, near = [], far = [];
  for (let i = 0; i < 8; i++) { const p = T.civ(-16 + i * 4); T.freeze(p); near.push(p); }
  const b = T.A.b;
  for (let i = 0; i < 3; i++) { const p = X.crowd.spawn('walker', b.x0 + 3, b.y0 + 10 + i * 4); if (Math.hypot(p.x - A.x, p.y - A.y) > 45) { T.freeze(p); far.push(p); } }
  T.near = near; T.far = far;
  T.d0 = near.map(p => Math.hypot(p.x - A.x, p.y - A.y));
  X.emit('gunfire', { x: A.x, y: A.y, by: X.player.ped, weapon: 'pistol', radius: 34 });
  return { fleeing: near.filter(p => p.ai.st === 'flee' || p.ai.st === 'cower').length, n: near.length, far: far.length };
});
await t.wait(1400);
await snap('02-panic');
await t.wait(1600);
const s5 = await t.eval(() => {
  const A = T.A, d1 = T.near.map(p => Math.hypot(p.x - A.x, p.y - A.y));
  const further = d1.filter((d, i) => d > T.d0[i] + 2).length;
  return { further, calmFar: T.far.filter(p => p.ai.st === 'idle').length, far: T.far.length, fled: PG.gta.crowd.stats.fled };
});
check('gunfire: everyone within 25 m flees away from the shot', s5a.fleeing === s5a.n && s5.further >= s5a.n - 1, { s5a, s5 });
check('people far from the shot stay calm', s5.calmFar === s5.far, s5);

// ---- 6. explosion panic ----
const s6 = await t.eval(() => {
  const X = PG.gta, A = T.A; T.clean(60);
  const ps = []; for (let i = 0; i < 6; i++) { const p = T.civ(-30 + i * 12); T.freeze(p); ps.push(p); }
  X.emit('explosion', { x: A.x, y: A.y - 20, power: 1 });
  return { fled: ps.filter(p => p.ai.st === 'flee' || p.ai.st === 'cower').length, n: ps.length };
});
check('an explosion 20-40 m away scares everyone', s6.fled === s6.n, s6);

// ---- 7. dive out of the way of a car on the sidewalk ----
await t.eval(() => { T.clean(60); PG.gta.crowd.opts.diveChance = 1; });
const s7 = await t.eval(async () => {
  const X = PG.gta, A = T.A, p = T.civ(8); T.freeze(p); T.put(A.x - 16, A.y + 1);
  const c = X.makeCar('hatch', A.x - 12, A.y, 0, { ctrl: 'parked' }); X.toPhys(c); c.dv.vx = 15; c.dv.v = 15; c.dv.speed = 15; c.keep = true; T.car7 = c;
  let dove = false; const t0 = performance.now();
  await new Promise(r => { (function f() { if (p.ai.st === 'dive') dove = true; if (performance.now() - t0 < 1600) requestAnimationFrame(f); else r(); })(); });
  return { dove, alive: !p.dead, st: p.ai.st, dives: X.crowd.stats.dives, events: T.ev.pedDive.length };
});
check('a pedestrian dives away from a car speeding along the sidewalk', s7.dove && s7.alive && s7.events >= 1, s7);
await snap('03-dive');

// ---- 8. hit by a car: death, a blood pool, cash ----
await t.eval(() => { T.clean(60); PG.gta.crowd.opts.diveChance = 0; });
const s8a = await t.eval(async () => {
  const X = PG.gta, A = T.A, p = T.civ(6); T.freeze(p); T.victim = p; T.put(A.x - 16, A.y + 1);
  const c = X.makeCar('furia', A.x - 10, A.y, 0, { ctrl: 'parked' }); X.toPhys(c); c.dv.vx = 24; c.dv.v = 24; c.dv.speed = 24; c.keep = true;
  await new Promise(r => setTimeout(r, 1500));
  X.removeCar(c);
  const pk = X.weapons ? X.weapons.pickups.filter(k => k.kind === 'cash' && Math.hypot(k.x - p.x, k.y - p.y) < 3) : [];
  const cash = X.crowd.cash.filter(k => Math.hypot(k.x - p.x, k.y - p.y) < 3);
  const pool = X.crowd.pools.find(pl => pl.ped === p);
  const decal = X.decals.filter(d => d.kind === 'blood' && Math.hypot(d.x - p.x, d.y - p.y) < 20).length;
  return { dead: p.dead, pool: !!pool, decal, cash: cash.length + pk.length, amount: (cash[0] || pk[0] || {}).amount, x: p.x, y: p.y };
});
await t.wait(4500);
await t.eval(() => { const p = T.victim; T.put(p.x + 2, p.y + 1.2); T.span = 9; });
await t.wait(500);
await snap('04-body');
const s8 = await t.eval(async () => {
  const X = PG.gta, P = X.player, p = T.victim, m0 = P.money;
  const all = X.crowd.cash.concat(X.weapons ? X.weapons.pickups.filter(k => k.kind === 'cash' && !k.ambient) : []).filter(k => Math.hypot(k.x - p.x, k.y - p.y) < 3);
  const cash = all[0];
  if (cash) T.put(cash.x, cash.y);
  await new Promise(r => setTimeout(r, 400));
  const pool = X.crowd.pools.find(pl => pl.ped === p);
  return { cash: all.length, amount: cash && cash.amount, gained: P.money - m0, slid: +Math.hypot(p.x - T.A.x - 6, p.y - T.A.y).toFixed(1), poolSize: pool ? +(pool.size).toFixed(2) : 0, grown: pool ? X.time - pool.t0 > 3 : false };
});
await t.eval(() => { T.span = 0; });
check('a car kills a pedestrian: corpse, growing blood pool and splatter', s8a.dead && s8a.pool && s8a.decal >= 1 && s8.grown, { s8a, s8 });
check('the body drops $5-60 that the player can pick up', s8.cash >= 1 && s8.amount >= 5 && s8.amount <= 60 && s8.gained === s8.amount, s8);

// ---- 9. carjack victims: flee, or fight back ----
await t.eval(() => { T.clean(60); PG.gta.crowd.opts.fightChance = 0; });
const s9a = await t.eval(async () => {
  const X = PG.gta, A = T.A, P = X.player;
  const c = X.makeCar('hatch', A.x, A.y - 4.2, 0, { ctrl: 'parked', npcDriver: X.randomNpc() }); c.npcDriver.extra = 0; T.jack = c;
  T.put(c.x, c.y + 2.0); X.enterCar(c);
  await new Promise(r => setTimeout(r, 1700));
  const v = X.peds.find(p => p.fromCar === c), st = v && v.ai && v.ai.st;
  await new Promise(r => setTimeout(r, 1000));
  return { inCar: P.car === c, victim: !!v, owner: v && v.ai && v.ai.owner, st, d: v ? +Math.hypot(v.x - c.x, v.y - c.y).toFixed(1) : 0 };
});
check('a carjacked driver is adopted and runs away from the car', s9a.inCar && s9a.victim && s9a.owner === 'peds' && /flee|cower/.test(s9a.st) && s9a.d > 4, s9a);
const s9b = await t.eval(async () => {
  const X = PG.gta, A = T.A, P = X.player;
  X.exitCar(); X.removeCar(T.jack); X.crowd.opts.fightChance = 1;
  const c = X.makeCar('comet', A.x + 10, A.y - 4.2, 0, { ctrl: 'parked', npcDriver: X.randomNpc() }); c.npcDriver.extra = 0; T.jack2 = c;
  T.put(c.x, c.y + 2.0); X.enterCar(c);
  await new Promise(r => setTimeout(r, 1500));
  const v = X.peds.find(p => p.fromCar === c), hp0 = c.hp;
  await new Promise(r => setTimeout(r, 2500));
  const kicked = c.hp < hp0;
  X.exitCar();
  const php0 = P.ped.hp;
  await new Promise(r => setTimeout(r, 3500));
  return { victim: !!v, st: v && v.ai.st, target: v && v.ai.target === P.ped, kicked, carHp: Math.round(hp0 - c.hp), hurt: Math.round(php0 - P.ped.hp) };
});
check('a carjacked driver can fight back: kicks the car, then punches the player', s9b.victim && s9b.kicked && s9b.hurt > 0, s9b);
await snap('05-fight');
await t.eval(() => { PG.gta.crowd.opts.fightChance = 0.75; });   // the default: 3 in 4 fight back

// ---- 10. a burning pedestrian runs around wildly ----
const s10 = await t.eval(async () => {
  T.clean(60);
  const p = T.civ(4); T.freeze(p); p.onFire = 3; p.hp = p.maxHp = 1e5;
  let path = 0, lx = p.x, ly = p.y, st = null; const t0 = performance.now();
  await new Promise(r => { (function f() {
    path += Math.hypot(p.x - lx, p.y - ly); lx = p.x; ly = p.y;
    if (!st && performance.now() - t0 > 900) st = p.ai.st;
    if (performance.now() - t0 < 2400) requestAnimationFrame(f); else r();
  })(); });
  await new Promise(r => setTimeout(r, 1300));
  return { st, path: +path.toFixed(1), after: p.ai.st, fire: +p.onFire.toFixed(1) };
});
check('a person on fire runs around screaming, then calms down', s10.st === 'burn' && s10.path > 7 && s10.after !== 'burn', s10);
await snap('06-burn');

// ---- 11. witnesses ----
const s11 = await t.eval(async () => {
  const X = PG.gta, A = T.A; T.clean(60);
  const w = T.civ(9); T.freeze(w); w.ai.st = 'walk'; w.ai.t = 0;
  T.ev.witness.length = 0; T.ev.witnessCall.length = 0;
  X.crime('killPed', A.x, A.y, {});
  const got = T.ev.witness.length, ped = T.ev.witness[0] && T.ev.witness[0].ped === w;
  const st = w.ai.st;
  await new Promise(r => setTimeout(r, 5600));
  return { got, ped, st, calls: T.ev.witnessCall.length, stats: X.crowd.stats.witnesses };
});
check('a civilian who sees a crime emits witness and flees or phones it in', s11.got >= 1 && s11.ped && /flee|cower|call/.test(s11.st), s11);

// ---- 12. mugging ----
const s12 = await t.eval(() => {
  const X = PG.gta, A = T.A, P = X.player; T.clean(60);
  X.crowd.opts.mugFight = 0; X.crowd.opts.mugFightFists = 0;
  const v = T.civ(1.1); T.freeze(v); v.ai.st = 'walk';
  T.freeze(v);
  P.ped.th = 0;
  const best = X.interactions.map(it => it.test(P)).filter(Boolean)[0];
  const m0 = P.money; T.ev.crime.length = 0;
  if (best) best.run();
  return { text: best && best.text, gained: P.money - m0, crime: T.ev.crime.some(e => e.type === 'robbery'), st: v.ai.st };
});
check('mugging a pedestrian: hint, cash, a robbery crime, hands up', /Mug/.test(s12.text || '') && s12.gained > 0 && s12.crime && s12.st === 'hands', s12);

// ---- 13. gangs: neutral until punched, then the corner fights back ----
const s13a = await t.eval(() => {
  const X = PG.gta, A = T.A, P = X.player; T.clean(60);
  const g = X.gangs.get('mafia'); g.respect = 0;
  const gr = X.gangs.spawnGroup('mafia', A.x + 5, A.y, 3); T.gr = gr;
  return { n: gr.members.length, st: gr.members.map(m => m.ai.st), at: X.gangs.at((g.rect.x0 + g.rect.x1) / 2, (g.rect.y0 + g.rect.y1) / 2) === g };
});
await t.wait(1500);
const s13b = await t.eval(() => ({ st: T.gr.members.map(m => m.ai.st), hp: PG.gta.player.ped.hp }));
check('a gang corner hangs out and ignores a passer-by', s13a.n >= 2 && s13a.at && s13b.st.every(s => s === 'hang' || s === 'return') && s13b.hp === 100000, { s13a, s13b });
await t.eval(() => { T.span = 12; });
await t.wait(400);
await snap('07-gang-corner');
const s13 = await t.eval(async () => {
  const X = PG.gta, P = X.player, gr = T.gr, g = gr.gang, r0 = g.respect;
  T.ev.gangProvoked.length = 0;
  X.damagePed(gr.members[0], 5, P.ped, 'melee');
  const st = gr.members.map(m => m.ai.st), hp0 = P.ped.hp;
  await new Promise(r => setTimeout(r, 4500));
  return { st, prov: T.ev.gangProvoked.length, hurt: Math.round(hp0 - P.ped.hp), respect: +(g.respect - r0).toFixed(1), targets: gr.members.filter(m => m.ai.target === P.ped).length };
});
check('punch one member and the whole corner attacks the player', s13.st.every(s => s === 'attack') && s13.prov >= 1 && s13.hurt > 0 && s13.respect < 0, s13);
await snap('08-gang-fight');
const s13c = await t.eval(() => {
  const X = PG.gta, P = X.player, gr = T.gr, g = gr.gang, r0 = g.respect, others = X.gangs.list.filter(o => o !== g).map(o => o.respect);
  X.killPed(gr.members[0], P.ped, 'bullet');
  return { drop: +(g.respect - r0).toFixed(1), rivals: X.gangs.list.filter(o => o !== g).map((o, i) => +(o.respect - others[i]).toFixed(1)) };
});
check('killing a member costs respect with that gang and earns it with the rivals', s13c.drop <= -9 && s13c.rivals.every(v => v > 0), s13c);
await t.eval(() => { T.span = 0; for (const m of T.gr.members) m.removed = true; });

// ---- 14. corpse cleanup ----
const s14 = await t.eval(async () => {
  const X = PG.gta, A = T.A; T.clean(60);
  const far = T.civ(5); X.killPed(far, null, 'impact'); far.x = A.x + 400;
  const old = T.civ(-5); X.killPed(old, null, 'impact'); old.deadT = 50;
  const fresh = T.civ(-8); X.killPed(fresh, null, 'impact');
  await new Promise(r => setTimeout(r, 1200));
  const r1 = { far: far.removed, oldInView: old.removed };
  old.x = A.x - 150; old.y = A.y;    // out of view, still near
  fresh.x = A.x - 150; fresh.y = A.y + 2;
  await new Promise(r => setTimeout(r, 1200));
  return Object.assign(r1, { oldOut: old.removed, freshOut: fresh.removed });
});
check('corpses are cleaned up out of view after 45 s or beyond 260 m', s14.far && !s14.oldInView && s14.oldOut && !s14.freshOut, s14);

// ---- 15. the player is never moved by the crowd; separation keeps people apart ----
const s15 = await t.eval(async () => {
  const X = PG.gta, A = T.A, P = X.player; T.clean(60);
  for (let i = 0; i < 6; i++) { const p = T.civ(-1.5 + i * 0.25); p.ai.st = 'walk'; }
  const x0 = P.ped.x, y0 = P.ped.y;
  await new Promise(r => setTimeout(r, 1200));
  let minD = 9; const ps = T.civs().filter(p => Math.hypot(p.x - A.x, p.y - A.y) < 10);
  for (const a of ps) for (const b of ps) if (a !== b && a.ai.lead !== b && b.ai.lead !== a) minD = Math.min(minD, Math.hypot(a.x - b.x, a.y - b.y));
  return { moved: +Math.hypot(P.ped.x - x0, P.ped.y - y0).toFixed(3), minD: +minD.toFixed(2), n: ps.length };
});
check('the crowd never moves the player and keeps its spacing', s15.moved < 0.01 && s15.minD > 0.35, s15);

// ---- 16. sound paths (unmuted) and the drawPed lineup ----
const s16 = await t.eval(async () => {
  const X = PG.gta, A = T.A, P = X.player; T.clean(60);
  PG.audio.setMuted(false);
  const mk = (dx, dy, o) => X.makePed(Object.assign({ x: A.x + dx, y: A.y + dy, th: -Math.PI / 2, ai: { owner: 'test' } }, o));
  const types = ['walker', 'business', 'jogger', 'old', 'shopper', 'tourist', 'drunk', 'dogwalker'];
  types.forEach((ty, i) => { const p = X.crowd.spawn(ty, A.x - 7 + i * 1.7, A.y - 1.6); p.ai.owner = 'test'; p.th = -Math.PI / 2; p.speed = 1.5; });
  const outs = [{ team: 'cop' }, { team: 'cop', look: { skin: '#c68a5c', outfit: 'swat' } }, { team: 'guard' }, { look: { skin: '#e0ac7e', shirt: '#f2f2f2', pants: '#ddd', outfit: 'medic' } }, { look: { skin: '#e0ac7e', shirt: '#3a3226', pants: '#3a3226', outfit: 'fire' } }, { team: 'army', look: { skin: '#c68a5c', shirt: '#4d5b34', pants: '#3b4729', hat: '#3f4b2b', hatType: 'helmet', outfit: 'army' }, weapon: 'rifle' }, { team: 'gang', look: X.gangs.list[0].def.look() }, { team: 'gang', look: X.gangs.list[1].def.look() }, { team: 'gang', look: X.gangs.list[2].def.look() }];
  outs.forEach((o, i) => mk(-8 + i * 1.7, 0.3, o));
  const poses = ['phone', 'smoke', 'punch', 'hands', 'photo', 'cower', 'sit', 'dive'];
  poses.forEach((ps, i) => { const p = mk(-7 + i * 1.7, 2.6, { weapon: i === 2 ? null : null }); p.pose = ps; });
  const d1 = mk(-6, 5.5, {}); d1.dead = true; d1.th = 0.4; const d2 = mk(-2.5, 5.5, { look: X.gangs.list[2].def.look() }); d2.dead = true; d2.th = 2.2;
  const kn = mk(1, 5.5, {}); kn.knock = 99; const fi = mk(3.5, 5.5, {}); fi.onFire = 99;
  const ar = mk(6, 5.5, { weapon: 'pistol' });
  X.crowd.panic(A.x + 40, A.y, 5);
  T.put(A.x, A.y + 2); P.ped.hidden = true; T.span = 13;
  await new Promise(r => setTimeout(r, 900));
  return { kit: !!PG.audio.kit() };
});
await snap('09-lineup');
await t.eval(() => { const X = PG.gta; PG.audio.setMuted(true); X.player.ped.hidden = false; T.span = 0; for (const p of X.peds) if (p.ai && p.ai.owner === 'test') p.removed = true; });
check('drawPed lineup renders every look and pose without errors', !t.errors.length, { kit: s16.kit, errors: t.errors.slice(0, 3) });

// ---- 17. fps: a full crowd, panic, a gang fight ----
const s17 = await t.eval(async () => {
  const X = PG.gta, A = T.A, P = X.player;
  T.heal(); T.put(A.x, A.y);
  for (let i = 0; i < 40; i++) {   // pack the screen
    const q = X.crowd.spot(A.x, A.y, 3, 26); if (!q) continue;
    const p = X.crowd.spawn(['walker', 'business', 'jogger', 'old', 'couple', 'dogwalker', 'tourist', 'shopper'][i % 8], q.x, q.y);
  }
  await new Promise(r => setTimeout(r, 600));
  const inView = X.peds.filter(p => !p.removed && !p.dead && X.inView(p.x, p.y, 0)).length;
  const gr = X.gangs.spawnGroup('russ', A.x - 10, A.y + 1, 4);
  X.gangs.provoke('russ', P.ped);
  let n = 0, k = 0; const t0 = performance.now();
  await new Promise(r => { (function f() {
    n++; k++;
    if (k % 45 === 0) X.emit('gunfire', { x: A.x + (k % 90 ? 15 : -15), y: A.y, by: P.ped, weapon: 'pistol', radius: 34 });
    if (performance.now() - t0 < 2500) requestAnimationFrame(f); else r();
  })(); });
  const fps = Math.round(n / ((performance.now() - t0) / 1000));
  T.gr17 = gr;
  return { fps, peds: X.peds.length, civs: T.civs().length, inView, fled: X.crowd.stats.fled };
});
check('a busy street keeps ~60 fps', s17.fps >= 45 && s17.civs >= 60 && s17.inView >= 25, s17);
await snap('10-busy');
await t.eval(() => { for (const m of T.gr17.members) m.removed = true; });

// ---- 18. doors, horns and guns pointed at people ----
const s18a = await t.eval(async () => {
  const X = PG.gta, A = T.A, P = X.player; T.clean(60);
  const ds = X.crowd.doors(A.x, A.y + 8).filter(d => !d.place);
  if (!ds.length) return { doors: 0 };
  const d = ds[0];
  T.put(d.x + d.nx * 3, d.y + d.ny * 3);
  await new Promise(r => setTimeout(r, 300));
  X.crowd.opts.enterChance = 1;
  const e0 = X.crowd.stats.entered, x0 = X.crowd.stats.exited;
  const along = Math.abs(d.nx) > 0.5 ? [0, 1.2] : [1.2, 0];
  const p = X.crowd.spawn('walker', d.x + along[0], d.y + along[1]); p.ai.nextIdle = 999;
  await new Promise(r => setTimeout(r, 3500));
  const out = X.crowd.fromDoor(d);
  await new Promise(r => setTimeout(r, 1200));
  X.crowd.opts.enterChance = 0.14;
  return { doors: ds.length, entered: X.crowd.stats.entered - e0, gone: p.removed, exited: X.crowd.stats.exited - x0, out };
});
check('people walk into building doors and step out of them', s18a.doors > 0 && s18a.entered >= 1 && s18a.gone && s18a.exited >= 1, s18a);
const s18b = await t.eval(() => {
  const X = PG.gta, A = T.A, P = X.player; T.clean(60);
  const p = T.civ(6); p.ai.st = 'walk';
  const c = X.makeCar('hatch', A.x, A.y - 5, 0, { ctrl: 'parked' });
  c.th = Math.atan2(p.y - c.y, p.x - c.x);
  X.emit('honk', { car: c });
  const r = { brisk: p.ai.brisk > 0, jump: p.ai.jumpT > 0 };
  X.removeCar(c);
  if (X.WEAPONS && X.WEAPONS.pistol) {
    const q = T.civ(4); T.freeze(q); q.ai.st = 'walk'; q.ai.witT = 0;
    P.inv.pistol = 30; P.weapon = 'pistol'; P.ped.weapon = 'pistol'; P.ped.th = 0; P.ped.aim = 0;
    r.aimed = true;
    return new Promise(res => setTimeout(() => { r.st = q.ai.st; P.weapon = 'fists'; P.ped.weapon = 'fists'; delete P.inv.pistol; res(r); }, 600));
  }
  return r;
});
check('a honking car hurries people along' + (s18b.aimed ? '; a pointed gun raises hands or scatters them' : ''), s18b.brisk && s18b.jump && (!s18b.aimed || /hands|flee|cower/.test(s18b.st)), s18b);

// ---- 19. a second game starts clean ----
const s18 = await t.eval(async () => {
  const X = PG.gta;
  X.stop(); X.start(PG.GTA_DEF);
  await new Promise(r => setTimeout(r, 1200));
  return { civs: T.civs().length, pools: X.crowd.pools.length, cash: X.crowd.cash.length, groups: X.crowd.groups.length, spawned: X.crowd.stats.spawned, fled: X.crowd.stats.fled, gangs: X.gangs.list.length, resp: X.gangs.list.map(g => g.respect) };
});
check('a second game starts clean and repopulates', s18.civs >= 55 && s18.pools === 0 && s18.cash === 0 && s18.gangs === 3 && s18.resp.every(r => r === 0), s18);

check('no console errors', !t.errors.length, t.errors.slice(0, 5).join(' | '));
console.log(fails ? `${fails} check(s) failed` : 'all peds checks passed');
await t.close();
process.exit(fails ? 1 : 0);
