// Fist fights (brawl.js): every strike type animates (the fist / foot / bat really travels out and back), the
// player's jab-cross-hook-uppercut chain and its knockdown, the sprint haymaker and the backing-off kick, hits
// only when the fist reaches, blocks, hit-stop, knockdown -> dazed -> get-up, the 75% fight-back rate, the
// fighting AI hurting the player, giving up and fleeing, pounding on a car the player sits in, the ring of
// bystanders, NPC vs NPC brawls (a stray punch), a second game and fps with ~10 fights at once. Screenshot
// sequences at street zoom and zoomed in. Also: keyboard square-up, stomps on people who are down (punches pass
// over them), trading blows with a mashing player, and a punch that never lands when its thrower is sent flying.
// Usage: node tests/brawl.test.mjs <built.html> <screenshot dir>
import { launch, fpsSkip } from './harness.mjs';
const t = await launch({ html: process.argv[2], out: process.argv[3] });
let fails = 0;
const check = (name, ok, info) => { if (fpsSkip(name, ok, info)) return; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info !== undefined ? ' ' + JSON.stringify(info) : ''}`); if (!ok) fails++; };
const snap = name => t.shot('brawl-' + name);
const frames = n => t.eval(k => new Promise(r => { let i = 0; (function f() { if (++i >= k) r(); else requestAnimationFrame(f); })(); }), n);

// ---- in-page helpers ----
await t.eval(() => {
  const X = PG.gta, P = X.player, C = X.city;
  const T = window.T = { ev: { hit: [], kd: [], end: [], crime: [] } };
  X.on('brawlHit', e => T.ev.hit.push({ by: e.by.id, ped: e.ped.id, type: e.type, dmg: e.dmg, blocked: e.blocked, kd: e.knockdown, at: e.by.act ? e.by.act.t : -1, now: performance.now() }));
  X.on('brawlKnockdown', e => T.ev.kd.push(e.ped.id));
  X.on('brawlEnd', e => T.ev.end.push({ id: e.ped.id, reason: e.reason }));
  X.on('crime', e => T.ev.crime.push(e.type));
  const v = X.view; X.view = function (...a) { if (T.span) X.cam.span = T.span; return v.apply(this, a); };
  setInterval(() => { if (T.calm && X.police && P.wanted) X.police.clear(); }, 150);
  T.calm = true;
  T.put = (x, y, th) => { const p = P.ped; p.x = x; p.y = y; p.vx = p.vy = 0; if (th != null) p.th = th; X.cam.x = x; X.cam.y = y; };
  T.heal = () => { const p = P.ped; p.hp = p.maxHp = 100000; p.armor = 0; p.knock = 0; if (p.act) p.act.on = false; };
  // A stretch of the top sidewalk of a long city block near the player with no street furniture on it,
  // traffic stopped around it.
  T.arena = function () {
    const pp = P.ped, cands = [];
    for (const b of C.blocks) if (b.kind === 'city' && b.x1 - b.x0 >= 90) cands.push({ b, d: Math.hypot((b.x0 + b.x1) / 2 - pp.x, b.y0 - pp.y) });
    cands.sort((u, v) => u.d - v.d);
    const clear = (x, y) => { for (let dx = -8; dx <= 8; dx += 0.7) for (const dy of [-1.2, 0, 1.4]) if (X.blocked(x + dx, y + dy, 0.45)) return false; return true; };
    let pick = null;
    for (const c of cands) {
      const b = c.b, y = b.y0 + 2.6;
      for (let k = 0; k < 24 && !pick; k++) { const x = (b.x0 + b.x1) / 2 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 3; if (x > b.x0 + 12 && x < b.x1 - 12 && clear(x, y)) pick = { b, x, y }; }
      if (pick) break;
    }
    const b = pick ? pick.b : cands[0].b; T.A = pick || { b, x: (b.x0 + b.x1) / 2, y: b.y0 + 2.6 };
    X.trafficRules.push(c => Math.abs(c.x - T.A.x) < 160 && Math.abs(c.y - T.A.y) < 160 ? 0 : null);
    return { x: T.A.x, y: T.A.y };
  };
  T.clean = function (r) {
    const A = T.A; r = r || 45;
    if (P.car) { const c = P.car; X.exitCar(); X.removeCar(c); }
    if (X.police && X.police.clear) X.police.clear();
    for (const c of X.cars) if (Math.abs(c.x - A.x) < 70 && Math.abs(c.y - A.y) < 70) X.removeCar(c);
    for (const p of X.peds) if (!p.isPlayer && Math.abs(p.x - A.x) < r && Math.abs(p.y - A.y) < r) p.removed = true;
    if (X.crowd) for (const d of X.crowd.dogs) if (Math.abs(d.x - A.x) < r && Math.abs(d.y - A.y) < r) d.removed = true;
    T.heal(); T.put(A.x, A.y, 0);
    X.weapons && X.weapons.select && X.weapons.select('fists', true);
  };
  T.civ = (dx, dy, type) => {
    const p = X.crowd.spawn(type || 'walker', T.A.x + dx, T.A.y + (dy || 0));
    p.x = T.A.x + dx; p.y = T.A.y + (dy || 0); p.ai.nextIdle = 999; if (type) p.ai.type = type; p.look.scale = 1;
    return p;
  };
  T.freeze = p => { p.ai.st = 'idle'; p.ai.idle = 'look'; p.ai.t = 999; p.ai.face = p.th; };
  T.dummy = (dx, dy, o) => X.makePed(Object.assign({ x: T.A.x + dx, y: T.A.y + (dy || 0), th: Math.PI, ai: { owner: 'test' }, hp: 1e4, maxHp: 1e4 }, o));
  T.until = (fn, ms) => new Promise(r => { const t0 = performance.now(); (function f() { const v = fn(); if (v || performance.now() - t0 > ms) r(v); else requestAnimationFrame(f); })(); });
  T.local = (p, q) => { const dx = q.x - p.x, dy = q.y - p.y, c = Math.cos(p.th), s = Math.sin(p.th); return { f: dx * c + dy * s, l: -dx * s + dy * c }; };
});

// ---- 1. module and API ----
const s1 = await t.eval(() => {
  const X = PG.gta, B = X.brawl;
  return { has: X.has('brawl'), api: ['strike', 'provoke', 'fight', 'stopFight', 'armPose', 'isFighting'].every(k => typeof (B && B[k]) === 'function'), peds: X.has('peds'), weapons: X.has('weapons'), draw: X.drawPed.owner };
});
check('brawl module loaded with X.brawl.{strike, provoke, fight, stopFight, armPose, isFighting}', s1.has && s1.api, s1);
const A0 = await t.eval(() => { const A = T.arena(); T.clean(60); return A; });
console.log('arena', JSON.stringify(A0));

// ---- 2. every strike type animates: the fist (foot, bat) winds up, flies out ~0.6-0.75 m and comes back ----
const s2 = await t.eval(async () => {
  const X = PG.gta, out = {};
  for (const type of ['jab', 'cross', 'hook', 'uppercut', 'haymaker', 'kick', 'bat']) {
    T.clean(30);
    const p = T.dummy(0, 0, { th: 0, weapon: type === 'bat' ? 'bat' : null, hp: 100, maxHp: 100 });
    p.ai = { owner: 'test' };
    X.brawl.strike(p, type);
    const a = p.act, dur = a.dur, ds = [], poses = new Set(); let minF = 9, maxF = 0, maxFist = 0;
    await T.until(() => {
      if (!a.on) return true;
      const L = X.brawl.limbAt(p), pose = X.brawl.armPose(p);
      if (L) { const q = T.local(p, L); ds.push(q.f); maxF = Math.max(maxF, q.f); minF = Math.min(minF, q.f); }
      if (pose) { poses.add([pose.lx, pose.ly, pose.rx, pose.ry, pose.kx || 0].map(v => v.toFixed(2)).join()); maxFist = Math.max(maxFist, pose.lx, pose.rx); }
      return false;
    }, 2000);
    out[type] = { dur: +dur.toFixed(2), poses: poses.size, reach: +maxF.toFixed(2), back: +minF.toFixed(2), samples: ds.length, fistX: +maxFist.toFixed(2), done: !a.on };
    p.removed = true;
  }
  return out;
});
for (const [type, r] of Object.entries(s2)) {
  const reachOk = type === 'kick' ? r.reach >= 0.85 && r.reach <= 1.3 : type === 'bat' ? r.reach >= 0.9 : r.reach >= 0.55 && r.reach <= 0.9;
  check(`${type}: the pose changes frame to frame and the ${type === 'kick' ? 'foot' : type === 'bat' ? 'bat' : 'fist'} reaches forward (m)`, r.poses >= 6 && reachOk && r.done && r.back < r.reach - 0.25, r);
}

// ---- 3. screenshot sequences: one of each strike, frozen at several moments, street zoom and zoomed in ----
async function sequence(tag, span, types) {
  await t.eval(sp => { T.span = sp; T.clean(30); }, span);
  await t.wait(500);
  for (const type of types) {
    await t.eval(type => {
      const X = PG.gta;
      for (const p of X.peds) if (p.ai && p.ai.owner === 'test') p.removed = true;
      const P = X.player;
      const v = T.dummy(type === 'bat' || type === 'kick' || type === 'haymaker' ? 1.15 : 0.98, 0, { th: Math.PI, look: X.randomLook() });
      v.look.shirt = '#3e8e5a'; T.v = v;
      P.ped.th = 0; if (type === 'bat') { X.giveWeapon && X.giveWeapon('bat'); X.weapons && X.weapons.select('bat', true); P.ped.weapon = 'bat'; }
      else { X.weapons && X.weapons.select('fists', true); P.ped.weapon = 'fists'; }
      P.ped.bw && (P.ped.bw.guard = 1);
      X.brawl.strike(P.ped, type, { side: type === 'jab' || type === 'hook' ? -1 : 1 });
      PG.game.status = 'freeze';
    }, type);
    const marks = await t.eval(() => { const a = PG.gta.player.ped.act; return [0.4 * a.w, a.w, a.w + a.s * 0.5, a.w + a.s, a.w + a.s + a.r * 0.5]; });
    for (let i = 0; i < marks.length; i++) {
      await t.eval(tt => { const a = PG.gta.player.ped.act; a.t = tt; a.res = 2; }, marks[i]);
      await t.wait(60);
      await snap(`${tag}-${type}-${i}`);
    }
    await t.eval(() => { PG.game.status = 'play'; const a = PG.gta.player.ped.act; a.on = false; });
  }
  await t.eval(() => { const X = PG.gta; X.weapons && X.weapons.select('fists', true); X.player.ped.weapon = 'fists'; });
}
await sequence('zoom', 10, ['jab', 'cross', 'hook', 'uppercut', 'haymaker', 'kick', 'bat']);
await sequence('street', 27, ['jab', 'hook', 'uppercut', 'kick']);

// ---- 4. the player's combo: jab -> cross -> hook -> uppercut, and the uppercut floors them ----
const s4 = await t.eval(() => { T.span = 14; T.clean(30); const v = T.dummy(0.95, 0, { th: Math.PI, hp: 1e4, maxHp: 1e4 }); T.v = v; T.ev.hit.length = 0; T.ev.kd.length = 0; return { ok: true }; });
await t.wait(300);
const tap = async () => { await t.page.keyboard.down('KeyJ'); await t.wait(45); await t.page.keyboard.up('KeyJ'); };
const chain = [];
for (let i = 0; i < 4; i++) {
  await tap();
  chain.push(await t.eval(() => { const a = PG.gta.player.ped.act; return a && a.on ? a.type : null; }));
  await t.wait(i === 3 ? 160 : 260);
  if (i === 3) await snap('combo-uppercut');
}
const s4b = await t.eval(() => ({ hits: T.ev.hit.filter(h => h.ped === T.v.id).map(h => h.type), kd: T.ev.kd.includes(T.v.id), vAct: T.v.act && T.v.act.type, crimes: T.ev.crime.filter(c => c === 'assault').length }));
check('the player chains jab -> cross -> hook -> uppercut', chain.join() === 'jab,cross,hook,uppercut', chain);
check('every blow of the chain lands and the uppercut knocks them down', s4b.hits.join() === 'jab,cross,hook,uppercut' && s4b.kd, s4b);
check('punching people still reports assault', s4b.crimes >= 4, s4b.crimes);
await t.wait(400);
await snap('combo-down');

// ---- 5. sprint + fire = haymaker; fire while backing off = kick ----
await t.eval(() => { T.clean(30); });
await t.page.keyboard.down('ShiftLeft'); await t.page.keyboard.down('KeyD'); await t.wait(450);
await t.press('KeyJ');
const hay = await t.eval(() => { const p = PG.gta.player.ped; return { type: p.act && p.act.on ? p.act.type : null, speed: +p.speed.toFixed(1) }; });
await t.page.keyboard.up('KeyD'); await t.page.keyboard.up('ShiftLeft');
check('sprint + fire throws a lunging haymaker', hay.type === 'haymaker', hay);
await t.wait(800);
const scr = await t.eval(() => { T.clean(30); const p = PG.gta.player.ped; return PG.gta.toScreen(p.x, p.y); });
await t.mouse(scr.x + 220, scr.y + 3); await t.wait(80); await t.mouse(scr.x + 230, scr.y);
await t.page.keyboard.down('KeyA'); await t.wait(320);
await t.press('KeyJ');
const kick = await t.eval(() => { const p = PG.gta.player.ped; return { type: p.act && p.act.on ? p.act.type : null, th: +p.th.toFixed(2), vx: +p.vx.toFixed(1) }; });
await t.page.keyboard.up('KeyA');
check('fire while backing away from the aim is a kick', kick.type === 'kick', kick);
await t.mouse(5, 5); await t.wait(2600);   // let the mouse go idle again (keyboard facing)

// ---- 5b. keyboard only: squared up to whoever fights you, so the move keys circle them and backing off kicks ----
const s5b = await t.eval(() => {
  const X = PG.gta, P = X.player; T.clean(30);
  const v = T.civ(1.6, 0, 'tough'); v.hp = v.maxHp = 1e4; T.v5 = v;
  X.brawl.fight(v, P.ped); Object.assign(v.ai, { alertT: 0, skill: 0, aggr: 0.01, nextT: 99 });   // a passive sparring partner
  P.ped.th = 0; return { mouse: X.input.mouseActive() };
});
await t.wait(300);
await t.page.keyboard.down('KeyW'); await t.wait(600);
const circ = await t.eval(() => { const p = PG.gta.player.ped, v = T.v5; return { off: +Math.abs(Math.atan2(Math.sin(Math.atan2(v.y - p.y, v.x - p.x) - p.th), Math.cos(Math.atan2(v.y - p.y, v.x - p.x) - p.th))).toFixed(2), away: v.x > p.x ? 'KeyA' : 'KeyD' }; });
await t.page.keyboard.up('KeyW');
// back in the clear stretch of pavement (the circle may have ended at a lamp post), still squared up
await t.eval(() => { const p = PG.gta.player.ped, v = T.v5; v.x = T.A.x + 0.8; v.y = T.A.y; p.x = T.A.x - 0.8; p.y = T.A.y; p.vx = p.vy = 0; });
await t.wait(150);
await t.page.keyboard.down('KeyA'); await t.wait(250);
const kb5v = await t.eval(() => { const p = PG.gta.player.ped; return { v: +(p.vx * Math.cos(p.th) + p.vy * Math.sin(p.th)).toFixed(1), th: +p.th.toFixed(2) }; });
await t.press('KeyJ');
const kb5 = await t.eval(() => { const p = PG.gta.player.ped; return p.act && p.act.on ? p.act.type : null; });
await t.page.keyboard.up('KeyA');
check('keyboard: walking around a fighter keeps you facing them, and backing off + fire kicks', !s5b.mouse && circ.off < 0.35 && kb5 === 'kick', { s5b, circ, kb5, kb5v });
await t.wait(500);
await t.eval(() => { T.v5.removed = true; });

// ---- 6. a blow only lands when the fist reaches the body ----
const s6 = await t.eval(async () => {
  const X = PG.gta; T.clean(30);
  const att = T.dummy(-6, 0, { th: 0 }), far = T.dummy(-6 + 2.0, 0), back = T.dummy(-6 - 0.9, 0);
  const h0 = far.hp, b0 = back.hp;
  X.brawl.strike(att, 'cross');
  await new Promise(r => setTimeout(r, 600));
  const missFar = far.hp === h0 && back.hp === b0;
  far.x = att.x + 0.95;
  X.brawl.strike(att, 'cross');
  let tHit = null; const t0 = performance.now(), at = [];
  await T.until(() => { at.push(att.act.t); if (far.hp < h0 && tHit == null) tHit = att.act.t; return tHit != null || performance.now() - t0 > 800; }, 900);
  const a = att.act;
  const hitAtFrame = tHit != null && tHit >= a.w + a.s * 0.3 - 0.02 && tHit <= a.w + a.s + 0.05;
  // 1.3 m: out of reach of a jab, not of a kick
  await new Promise(r => setTimeout(r, 400));
  far.x = att.x + 1.3; const h1 = far.hp;
  X.brawl.strike(att, 'jab'); await new Promise(r => setTimeout(r, 450));
  const jab13 = +(h1 - far.hp).toFixed(1), h2 = far.hp;
  X.brawl.strike(att, 'kick', { v: 0 }); await new Promise(r => setTimeout(r, 600));
  return { missFar, hpFar: +(h0 - far.hp + 0).toFixed(1), first: +(h0 - h1).toFixed(1), tHit: tHit == null ? null : +tHit.toFixed(3), w: +a.w.toFixed(3), s: a.s, hitAtFrame, jab13, kick13: +(h2 - far.hp).toFixed(1) };
});
check('a cross at a body 2 m away (or behind) whiffs', s6.missFar, s6);
check('at 0.95 m it lands, at the frame the fist arrives (NPCs ~70% damage)', s6.first > 5 && s6.first < 8 && s6.hitAtFrame, s6);
check('at 1.3 m a jab falls short but the longer kick connects', s6.jab13 === 0 && s6.kick13 > 8, s6);

// ---- 6b. punches pass over somebody lying on the ground; the player stomps them, once per knockdown ----
const s6b = await t.eval(async () => {
  const X = PG.gta, P = X.player, p = P.ped; T.clean(30);
  const v = T.dummy(0.95, 0, { th: Math.PI }); X.brawl.knockdown(v, 0, p);
  await new Promise(r => setTimeout(r, 350));
  const h0 = v.hp; p.th = 0;
  X.brawl.strike(p, 'cross'); await new Promise(r => setTimeout(r, 350));
  const cross = +(h0 - v.hp).toFixed(1); p.fireCd = 0; if (p.act) p.act.on = false;
  X.fireWeapon(p, 'fists', 0); const first = p.act.type;
  await new Promise(r => setTimeout(r, 450));
  const stomp = +(h0 - v.hp).toFixed(1); p.fireCd = 0; if (p.act) p.act.on = false;
  X.fireWeapon(p, 'fists', 0); const second = p.act.type;
  await new Promise(r => setTimeout(r, 350));
  const after = +(h0 - v.hp).toFixed(1); v.removed = true;
  return { cross, first, stomp, second, after };
});
check('a punch passes over somebody on the ground, the player stomps them instead (once per knockdown)', s6b.cross === 0 && s6b.first === 'stomp' && s6b.stomp >= 9 && s6b.second !== 'stomp' && s6b.after === s6b.stomp, s6b);

// ---- 7. blocking takes 70% off ----
const s7 = await t.eval(async () => {
  const X = PG.gta; T.clean(30);
  const att = T.dummy(-5, 0, { th: 0 }), v = T.dummy(-5 + 0.95, 0, { th: Math.PI });
  X.brawl.strike(att, 'hook', { side: -1 });
  await new Promise(r => setTimeout(r, 500));
  const open = 1e4 - v.hp; const h1 = v.hp;
  X.brawl.react(v, 'block');
  X.brawl.strike(att, 'hook', { side: -1 });
  await new Promise(r => setTimeout(r, 500));
  const blk = h1 - v.hp;
  return { open: +open.toFixed(2), blocked: +blk.toFixed(2), ratio: +(blk / open).toFixed(2), ev: T.ev.hit.slice(-1)[0].blocked };
});
check('a block takes 70% off the blow', s7.open > 0 && Math.abs(s7.ratio - 0.3) < 0.03 && s7.ev, s7);

// ---- 8. hit-stop: attacker and victim freeze ~50 ms on impact ----
const s8 = await t.eval(async () => {
  const X = PG.gta; T.clean(30);
  const att = T.dummy(-5, 0, { th: 0 }), v = T.dummy(-5 + 0.95, 0, { th: Math.PI });
  const n0 = T.ev.hit.length;
  X.brawl.strike(att, 'cross');
  await T.until(() => T.ev.hit.length > n0, 1000);
  const t0 = att.act.t, hs = att.bw.hs, vhs = v.bw.hs, vt0 = v.act.t, p0 = performance.now();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const t1 = att.act.t, vt1 = v.act.t, dt1 = performance.now() - p0;
  await new Promise(r => setTimeout(r, 120));
  return { hs: +hs.toFixed(3), vhs: +vhs.toFixed(3), froze: t1 === t0 && vt1 === vt0, ms: Math.round(dt1), after: +(att.act.t - t0).toFixed(3) };
});
check('hit-stop: attacker and victim freeze for ~50 ms, then carry on', s8.hs >= 0.04 && s8.hs <= 0.1 && s8.vhs >= 0.04 && s8.froze && s8.after > 0.05, s8);

// ---- 9. knockdown -> dazed on the ground (stars) -> a visible get-up ----
const s9 = await t.eval(async () => {
  const X = PG.gta; T.clean(30); T.span = 10;
  const v = T.civ(1.2, 0); T.freeze(v); v.th = Math.PI; T.kv = v;
  X.crowd.opts.fightChance = 0;
  X.brawl.knockdown(v, 0, X.player.ped);
  const seen = []; let lie = 0, last = null; const t0 = performance.now(); let tLie0 = 0;
  await T.until(() => {
    const b = X.brawl.armPose(v), body = b ? b.body : 'up';
    if (body !== last) { seen.push(body); last = body; if (body === 'lie') tLie0 = performance.now(); if (last === 'getup') lie = (performance.now() - tLie0) / 1000; }
    return (body === 'up' && seen.includes('getup')) || performance.now() - t0 > 5000;
  }, 6000);
  X.crowd.opts.fightChance = 0.75;
  return { seen, lie: +lie.toFixed(2), st: v.ai.st };
});
check('knockdown: falls, lies dazed 1.2-2 s, gets up visibly', s9.seen.slice(0, 4).join() === 'fall,lie,getup,up' && s9.lie >= 1.1 && s9.lie <= 2.3, s9);
await t.eval(() => { const X = PG.gta; T.kv.removed = true; const v = T.civ(1.2, 0); T.freeze(v); X.brawl.knockdown(v, 0.3, X.player.ped); T.kv = v; });
await t.wait(200); await snap('ko-fall');
await t.wait(500); await snap('ko-dazed-stars');
await t.wait(1600); await snap('ko-getup');
await t.eval(() => { T.span = 0; });

// ---- 10. the fight-back rate: 3 in 4 ordinary civilians fight back ----
const s10 = await t.eval(async () => {
  const X = PG.gta; T.clean(40);
  const att = T.dummy(-3, 0, { th: 0, hp: 1e6, maxHp: 1e6 });
  const rate = async (type, n) => {
    let fought = 0, fled = 0;
    for (let i = 0; i < n; i++) {
      const v = T.civ(-2, 0, type); v.look.scale = 1;
      X.damagePed(v, 3, att, 'melee');
      if (X.brawl.isFighting(v)) fought++; else if (/flee|cower/.test(v.ai.st)) fled++;
      X.brawl.stopFight(v); v.removed = true;
      if (i % 20 === 19) await new Promise(r => requestAnimationFrame(r));
    }
    return { n, fought, fled, rate: +(fought / n).toFixed(3) };
  };
  const walker = await rate('walker', 400), old = await rate('old', 80), tough = await rate('tough', 60);
  att.removed = true;
  return { walker, old, tough };
});
check('ordinary civilians fight back 75% +- 7% of the time (400 provocations), the rest flee', Math.abs(s10.walker.rate - 0.75) <= 0.07 && s10.walker.fought + s10.walker.fled === s10.walker.n, s10.walker);
check('pensioners mostly run, tough guys nearly always fight', s10.old.rate < 0.45 && s10.tough.rate > 0.85, { old: s10.old.rate, tough: s10.tough.rate });

// ---- 11. a fighter closes in, guards, mixes strikes and actually hurts the player ----
const s11 = await t.eval(async () => {
  const X = PG.gta, P = X.player; T.clean(40); T.span = 12;
  const v = T.civ(3, 0); T.f11 = v;
  const ok = X.brawl.provoke(v, P.ped);
  const hp0 = P.ped.hp, n0 = T.ev.hit.length; let minD = 9, guard = 0;
  const t0 = performance.now();
  await T.until(() => { minD = Math.min(minD, Math.hypot(v.x - P.ped.x, v.y - P.ped.y)); if (v.bw && v.bw.guard > 0.9) guard++; return performance.now() - t0 > 6000; }, 7000);
  const hits = T.ev.hit.slice(n0).filter(h => h.by === v.id);
  return { ok, fighting: X.brawl.isFighting(v), owner: v.ai.owner, hurt: Math.round(hp0 - P.ped.hp), hits: hits.length, types: [...new Set(hits.map(h => h.type))], minD: +minD.toFixed(2), guardFrames: guard, playerFights: X.brawl.isFighting(P.ped) };
});
check('a provoked civilian fights: brawl owns its AI, it closes in with its guard up', s11.ok && s11.owner === 'brawl' && s11.minD < 1.3 && s11.guardFrames > 60, s11);
check('the fighting AI lands punches on the player', s11.hurt > 8 && s11.hits >= 3, s11);
await snap('ai-vs-player');

// ---- 12. hurt badly: gives up, begs or runs, and peds.js gets them back ----
const s12 = await t.eval(async () => {
  const X = PG.gta, P = X.player, v = T.f11;
  v.hp = v.maxHp * 0.22;
  await T.until(() => !X.brawl.isFighting(v), 4500);
  const st = v.ai && v.ai.st, owner = v.ai && v.ai.owner, end = T.ev.end.filter(e => e.id === v.id).map(e => e.reason);
  const d0 = Math.hypot(v.x - P.ped.x, v.y - P.ped.y);
  await new Promise(r => setTimeout(r, 1500));
  return { owner, st, end, ran: +(Math.hypot(v.x - P.ped.x, v.y - P.ped.y) - d0).toFixed(1), begged: X.brawl.stats.begged };
});
check('at low health the fighter gives up and flees (peds.js owns them again)', s12.owner === 'peds' && s12.end.includes('flee') && s12.ran > 2, s12);

// ---- 12b. trading blows: a tough guy hits back even while the player keeps punching ----
const s12b = await t.eval(async () => {
  const X = PG.gta, P = X.player, p = P.ped; T.clean(40);
  const v = T.civ(1.0, 0, 'tough'); v.th = Math.PI; T.freeze(v); v.hp = v.maxHp = 1e4;
  p.th = 0; p.hp = p.maxHp = 1e4;
  X.brawl.provoke(v, p);
  const n0 = T.ev.hit.length, t0 = performance.now(); let next = 0, mine = 0;
  await T.until(() => {
    const now = performance.now();
    if (now >= next && !(p.fireCd > 0)) { next = now + 170; if (X.fireWeapon(p, 'fists', Math.atan2(v.y - p.y, v.x - p.x))) mine++; }
    if (Math.hypot(v.x - p.x, v.y - p.y) > 1.6) T.put(v.x - Math.cos(p.th) * 1.0, v.y - Math.sin(p.th) * 1.0);
    return now - t0 > 8000;
  }, 9000);
  const hits = T.ev.hit.slice(n0);
  const r = { swings: mine, landed: hits.filter(h => h.by === p.id && !h.blocked).length, blocked: hits.filter(h => h.by === p.id && h.blocked).length, back: hits.filter(h => h.by === v.id).length, fighting: X.brawl.isFighting(v) };
  X.brawl.stopFight(v); v.removed = true; T.heal();
  return r;
});
check('a fist fight is an exchange: mashing the player still eats blows back and some get blocked', s12b.back >= 2 && s12b.landed >= 5 && s12b.blocked + s12b.back >= 3, s12b);
await t.eval(() => { T.span = 0; });

// ---- 13. the player in a car: they pound on it, the window cracks and breaks ----
const s13 = await t.eval(async () => {
  const X = PG.gta, P = X.player; T.clean(40);
  const c = X.makeCar('hatch', T.A.x, T.A.y - 5.5, 0, { ctrl: 'parked' }); T.car13 = c;
  T.put(c.x, c.y + 2); X.enterCar(c);
  await T.until(() => P.car === c, 2500);
  const v = T.civ(3, 0); X.crowd.opts.fightChance = 1;
  X.damagePed(v, 2, P.ped, 'melee');
  X.crowd.opts.fightChance = 0.75;
  const hp0 = c.hp, php0 = P.ped.hp;
  await new Promise(r => setTimeout(r, 6000));
  return { inCar: P.car === c, fighting: X.brawl.isFighting(v), carHurt: Math.round(hp0 - c.hp), cracks: (c._bwCr || []).length, broke: !!c._bwBroke, driverHurt: Math.round(php0 - P.ped.hp), carHits: X.brawl.stats.carHits };
});
check('a fighter pounds on the car the player sits in, cracking the window', s13.inCar && s13.carHurt > 20 && s13.cracks >= 2 && s13.carHits >= 3, s13);
await t.eval(() => { T.span = 10; }); await t.wait(500); await snap('car-pound');
await t.eval(() => { T.span = 0; const X = PG.gta; X.exitCar(); });

// ---- 14. a street fight draws a ring of bystanders: watching, cheering, filming, phoning ----
const s14 = await t.eval(async () => {
  const X = PG.gta, P = X.player; T.clean(45); T.span = 22;
  const crowd = [];
  for (let i = 0; i < 18; i++) { const p = T.civ(-14 + i * 1.65, i % 2 ? 1.5 : -0.4); p.ai.st = 'walk'; p.ai.spd = 0.4; crowd.push(p); }
  const a = T.civ(0, 0.4), b = T.civ(1.1, 0.4); T.freeze(a); T.freeze(b);
  X.crowd.opts.fightChance = 1;
  X.brawl.fight(a, b); X.brawl.fight(b, a);
  T.ring = { a, b, crowd };
  await new Promise(r => setTimeout(r, 3500));
  const f = X.brawl.fights()[0];
  const w = crowd.filter(p => p.ai.st === 'watch');
  const ring = w.filter(p => { const d = Math.hypot(p.x - f.x, p.y - f.y); return d >= 2.2 && d <= 6.5; });
  const ds = w.map(p => +Math.hypot(p.x - f.x, p.y - f.y).toFixed(1));
  const facing = ring.filter(p => Math.abs(((Math.atan2(f.y - p.y, f.x - p.x) - p.th + 9 * Math.PI) % (2 * Math.PI)) - Math.PI) < 0.9).length;
  X.crowd.opts.fightChance = 0.75;
  return { fights: X.brawl.fights().length, watching: w.length, ring: ring.length, ds, poses: [...new Set(w.map(p => p.ai.wpose))], facing, both: X.brawl.isFighting(a) && X.brawl.isFighting(b) };
});
check('bystanders within 15 m stop and form a loose ring (2-6.5 m) around the fight, facing it', s14.ring >= 5 && s14.ring >= s14.watching * 0.7 && s14.facing >= s14.ring - 1, s14);
check('some cheer, others film it or watch with arms crossed', s14.poses.includes('cheer') && s14.poses.length >= 2, s14.poses);
await snap('ring');

// ---- 15. NPC vs NPC: the two fight it out; a stray punch drags in a bystander ----
const s15 = await t.eval(async () => {
  const X = PG.gta; const { a, b } = T.ring;
  await new Promise(r => setTimeout(r, 2500));
  const hits = T.ev.hit.filter(h => (h.by === a.id && h.ped === b.id) || (h.by === b.id && h.ped === a.id));
  const both = { aLanded: hits.filter(h => h.by === a.id).length, bLanded: hits.filter(h => h.by === b.id).length, aHurt: Math.round(a.maxHp - a.hp), bHurt: Math.round(b.maxHp - b.hp) };
  // stray: a cross thrown at someone 1.9 m away lands on the bystander who stepped in between
  T.clean(45); X.crowd.opts.fightChance = 1;
  const att = T.dummy(0, 0, { th: 0, hp: 100, maxHp: 100 }), tgt = T.civ(1.9, 0), by = T.civ(0.92, 0.05);
  T.freeze(tgt); T.freeze(by); by.th = Math.PI;
  X.brawl.strike(att, 'cross');
  await new Promise(r => setTimeout(r, 400));
  X.crowd.opts.fightChance = 0.75;
  return Object.assign(both, { strayHit: by.hp < by.maxHp, tgtHit: tgt.hp < tgt.maxHp, joined: X.brawl.isFighting(by) && by.ai.target === att });
});
check('NPC vs NPC: both fighters land blows', s15.aLanded >= 1 && s15.bLanded >= 1 && s15.aLanded + s15.bLanded >= 4, s15);
check('a stray punch hits the bystander in the way (not its target), who joins the brawl', s15.strayHit && !s15.tgtHit && s15.joined, s15);

// ---- 15b. knocked flying mid-punch (a car, a blast): that punch never lands, and the fighter goes down and gets up ----
const s15b = await t.eval(async () => {
  const X = PG.gta; T.clean(40);
  const v = T.civ(3, 0), d = T.dummy(4, 0);
  X.brawl.fight(v, d); v.ai.alertT = 0; v.ai.nextT = 0;
  await T.until(() => v.act && v.act.on && v.act.type !== 'block' && v.act.type !== 'dodge' && v.act.t < v.act.w, 4000);
  const before = v.act.type;
  v.knock = 0.9; v.vx = 0; v.vy = -6;   // as a car hit would
  const h0 = d.hp; let kd = false;
  await T.until(() => { kd = kd || (v.act.on && v.act.type === 'knockdown'); return false; }, 450);
  return { before, dummyHurt: +(h0 - d.hp).toFixed(1), kd };
});
check('a fighter sent flying mid-punch lands nothing and goes into a knockdown', /jab|cross|hook|uppercut|haymaker|kick/.test(s15b.before) && s15b.dummyHurt === 0 && s15b.kd, s15b);
await t.eval(() => { T.span = 0; });

// ---- 16. sounds (unmuted) and the remaining reactions: block spark, dodge, taunt, beg, stagger ----
const s16 = await t.eval(async () => {
  const X = PG.gta; T.clean(40); T.span = 10;
  PG.audio.unlock && PG.audio.unlock(); PG.audio.setMuted(false);
  const ps = [];
  ['block', 'dodge', 'taunt', 'stagger', 'hitReact'].forEach((k, i) => { const p = T.dummy(-5 + i * 1.6, -1, { th: Math.PI / 2, hp: 100, maxHp: 100 }); X.brawl.react(p, k, 1, 1); ps.push(p); });
  const g = T.civ(4, -1); g.th = Math.PI / 2; X.brawl.fight(g, X.player.ped); X.brawl.react(g, 'beg', 1, 1);
  const att = T.dummy(-2, 1.2, { th: 0 }), v = T.dummy(-2 + 0.95, 1.2, { th: Math.PI }); X.brawl.react(v, 'block'); X.brawl.strike(att, 'hook', { side: -1 });
  await new Promise(r => setTimeout(r, 140));
  return { kit: !!PG.audio.kit(), acts: ps.map(p => p.act.on && p.act.type), beg: g.act.type, pose: X.brawl.armPose(g).body };
});
await snap('reactions');
await t.eval(() => { PG.audio.setMuted(true); T.span = 0; });
check('block, dodge, taunt, stagger, hit reaction and begging poses render (sound on) without errors', s16.acts.every(Boolean) && s16.beg === 'beg' && s16.pose === 'kneel' && !t.errors.length, s16);

// ---- 17. fps with ~10 fights at once and a crowd ----
const s17 = await t.eval(async () => {
  const X = PG.gta; T.clean(50); T.span = 0;
  const fighters = [];
  for (let i = 0; i < 10; i++) {
    const a = T.civ(-22 + i * 4.6, -0.5), b = T.civ(-22 + i * 4.6 + 1.2, 1.2);
    X.brawl.fight(a, b); X.brawl.fight(b, a); fighters.push(a, b);
  }
  for (let i = 0; i < 20; i++) { const q = X.crowd.spot(T.A.x, T.A.y, 3, 20); if (q) X.crowd.spawn('walker', q.x, q.y); }
  await new Promise(r => setTimeout(r, 400));
  let n = 0; const t0 = performance.now();
  await new Promise(r => { (function f() { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(); })(); });
  const fps = Math.round(n / ((performance.now() - t0) / 1000));
  return { fps, fighting: fighters.filter(p => X.brawl.isFighting(p)).length, fights: X.brawl.fights().length, peds: X.peds.length, inView: X.peds.filter(p => !p.removed && !p.dead && X.inView(p.x, p.y, 0)).length, hits: X.brawl.stats.hits };
});
check('~10 simultaneous fights plus a crowd keep ~60 fps', s17.fps >= 45 && s17.fights >= 6, s17);
await snap('ten-fights');

// ---- 18. a second game starts clean and fists still work ----
const s18 = await t.eval(async () => {
  const X = PG.gta;
  X.stop(); PG.startLevel ? PG.startLevel(PG.GTA_DEF) : X.start(PG.GTA_DEF); PG.game.status = 'play';
  await new Promise(r => setTimeout(r, 1200));
  const st = Object.assign({}, X.brawl.stats), P = X.player;
  T.arena(); T.clean(30);
  const v = T.dummy(0.95, 0, { th: Math.PI });
  P.ped.th = 0; P.ped.fireCd = 0;
  const fired = X.fireWeapon(P.ped, 'fists', 0);
  await new Promise(r => setTimeout(r, 400));
  return { strikes0: st.strikes === 0 && st.hits === 0, fights: X.brawl.fights().length, fired, hurt: v.hp < v.maxHp, peds: X.peds.length };
});
check('a second game starts clean and punches still land', s18.strikes0 && s18.fired && s18.hurt, s18);

check('no console errors', !t.errors.length, t.errors.slice(0, 5).join(' | '));
console.log(fails ? `${fails} check(s) failed` : 'all brawl checks passed');
await t.close();
process.exit(fails ? 1 : 0);
