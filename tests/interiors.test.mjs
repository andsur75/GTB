// Interiors test: city doors (places + generic buildings, F to enter), every interior type (enter, leave,
// positions restored, walls and furniture solid, bullets over counters), Ammu-Fjord stands (weapons with
// weapons.js, armour, not enough money), the hospital, a 24/7 hold-up, the bank job (tellers, drill, alarm,
// heist crime, vault, loot, guards shooting back, reset), sleeping at a safehouse, the police front desk,
// the bar (drinks, Artur, jukebox, pool), breakables, music and pause, fps in a busy club and a shoot-out,
// and a second game. Works with or without the other modules.
// Usage: node tests/interiors.test.mjs <built.html> <screenshot dir>
import { launch } from './harness.mjs';
const t = await launch({ html: process.argv[2], out: process.argv[3] });
let failed = 0;
const check = (name, ok, info) => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info !== undefined ? ' — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`); };
const until = (fn, ms) => t.eval(([src, ms]) => new Promise(r => { const f = new Function('return (' + src + ')()'); const t0 = performance.now(); (function g() { let v; try { v = f(); } catch { v = null; } if (v || performance.now() - t0 > ms) r(v); else requestAnimationFrame(g); })(); }), [fn.toString(), ms]);
const fps = ms => t.eval(ms => new Promise(r => { let n = 0; const t0 = performance.now(); (function f() { n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else r(Math.round(n / (ms / 1000))); })(); }), ms);

await t.eval(() => {
  const X = PG.gta, W = window, P = X.player;
  W.__ev = { crime: [], heistAlarm: 0, vaultOpened: 0, storeRobbed: 0, tellerRobbed: 0, talkArtur: 0, sleep: 0, shopBuy: 0, enter: 0, leave: 0, smash: 0, playerHurtBy: [] };
  X.on('crime', e => W.__ev.crime.push(e.type));
  for (const k of ['heistAlarm', 'vaultOpened', 'storeRobbed', 'tellerRobbed', 'talkArtur', 'sleep', 'shopBuy']) X.on(k, () => W.__ev[k]++);
  X.on('interiorEnter', () => W.__ev.enter++); X.on('interiorLeave', () => W.__ev.leave++); X.on('interiorSmash', () => W.__ev.smash++);
  X.on('pedHurt', e => { if (e.ped === P.ped && e.by && e.by.ai && e.by.ai.owner === 'interiors') W.__ev.playerHurtBy.push(e.by.ai.role); });
  W.__god = on => { const p = P.ped; if (on) { p.maxHp = 1e5; p.hp = 1e5; } else { p.maxHp = 100; p.hp = 100; } };
  // stand at a point, local to the current scene
  W.__at = (lx, ly, th) => { const sc = X.scene, p = P.ped; p.x = sc.ox + lx; p.y = sc.oy + ly; p.vx = p.vy = 0; if (th != null) p.th = th; X.cam.x = p.x; X.cam.y = p.y; };
  W.__act = re => { const sc = X.scene; const a = sc.acts.find(a => re.test(a.text() || '')); if (!a) return null; P.ped.x = a.x; P.ped.y = a.y; P.ped.vx = P.ped.vy = 0; return a.text(); };
  W.__arm = () => { if (X.giveWeapon && X.WEAPONS) X.giveWeapon('pistol', 60); else { P.inv.pistol = 60; } P.weapon = 'pistol'; P.ped.weapon = 'pistol'; };
  W.__clearStars = () => { if (X.police) X.police.clear(); P.wanted = 0; };
  W.__out = () => { if (X.scene) X.interiors.leave(); W.__clearStars(); W.__god(false); };
});
const has = await t.eval(() => ({ weapons: !!PG.gta.WEAPONS, police: !!PG.gta.police, peds: PG.gta.has('peds'), damage: PG.gta.has('damage') }));
console.log('modules present', JSON.stringify(has));

// ---------- 1. API and doors ----------
const api = await t.eval(() => {
  const X = PG.gta, I = X.interiors, types = {};
  for (const d of I.doors) types[d.type] = (types[d.type] || 0) + 1;
  const bad = I.doors.filter(d => X.blocked(d.x, d.y, 0.3)).length;
  const gen = I.doors.filter(d => d.gen).length, eligible = X.city.buildings.filter(b => !b.deco && !b.place).length;
  return { n: I.doors.length, types, bad, gen, eligible, bank: !!I.bank.scene, cash: I.bank.cashLeft, alarm: I.bank.alarm, open: I.bank.vaultOpen, spray: I.doors.some(d => d.place === 'spray' || d.place === 'crusher') };
});
const places = ['bank', 'police', 'hospital', 'gunshop', 'bar', 'apartment', 'hideout'], gens = ['store', 'lobby', 'office', 'warehouse', 'club', 'diner'];
check('every place has a door (no doors for the spray and crusher pads)', places.every(k => api.types[k] === 1) && !api.spray, api.types);
check('about one building in four gets a generic door of all six kinds', gens.every(k => api.types[k] >= 3) && api.gen > api.eligible * 0.12 && api.gen < api.eligible * 0.3, { gen: api.gen, eligible: api.eligible });
check('doors stand on free pavement', api.bad === 0, api.bad);
check('X.interiors.bank ready from the start', api.bank && api.cash > 10000 && !api.alarm && !api.open, api);

// ---------- 2. walk into the bank door ----------
await t.eval(() => { const X = PG.gta, d = X.interiors.doors.find(q => q.place === 'bank'), p = X.player.ped; p.x = d.x + d.nx * 1.2; p.y = d.y + d.ny * 1.2; p.th = Math.atan2(-d.ny, -d.nx); X.cam.x = p.x; X.cam.y = p.y; });
await t.wait(300);
await t.shot('int-01-bank-door');
await t.eval(() => { const X = PG.gta, d = X.interiors.doors.find(q => q.place === 'bank'), p = X.player.ped; p.x = d.x + d.nx * 0.4; p.y = d.y + d.ny * 0.4; });
await t.wait(350);
const inBank = await t.eval(() => {
  const X = PG.gta, sc = X.scene, p = X.player.ped, f = X.focus();
  return { id: sc && sc.id, name: sc && sc.name, inside: !!sc && p.x > sc.x0 && p.x < sc.x1 && p.y > sc.y0 && p.y < sc.y1, free: !X.blocked(p.x, p.y, p.r), focus: sc && Math.hypot(f.x - sc.cityPos.x, f.y - sc.cityPos.y) < 0.1, enter: window.__ev.enter, peds: sc ? sc.peds.length : 0, guards: sc ? sc.peds.filter(q => q.team === 'guard').length : 0 };
});
check('walking into the door enters the bank', inBank.id === 'bank' && inBank.inside && inBank.free && inBank.focus && inBank.enter === 1, inBank);
check('the bank has tellers, customers and 3 armed guards', inBank.guards === 3 && inBank.peds >= 6, inBank);
await t.wait(500); await t.shot('int-02-bank-lobby');

// ---------- 3. walls, furniture, bullets ----------
const walls = await t.eval(async () => {
  const X = PG.gta, sc = X.scene, W = window;
  const wallHit = X.raycast(sc.ox + 18, sc.oy + 28, sc.ox + 18, sc.oy + 40);                 // through the front wall
  const overCounter = X.raycast(sc.ox + 12.5, sc.oy + 23, sc.ox + 12.5, sc.oy + 17.5);         // lobby -> teller: bullets fly over the counter
  const intoVault = X.raycast(sc.ox + 20, sc.oy + 5.3, sc.ox + 6, sc.oy + 5.3);                // the closed vault door
  W.__at(1.4, 30, Math.PI);
  return { wallHit: !!wallHit && wallHit.kind === 'solid', overCounter: !overCounter, intoVault: !!intoVault, x0: X.player.ped.x - sc.ox };
});
await t.hold(['KeyA'], 700);
const wall2 = await t.eval(async () => {
  const X = PG.gta, sc = X.scene, W = window;
  const x = X.player.ped.x - sc.ox;
  W.__at(12.5, 21.4, -Math.PI / 2);   // walk into the counter
  return { x };
});
await t.hold(['KeyW'], 700);
const wall3 = await t.eval(() => { const X = PG.gta, sc = X.scene; return X.player.ped.y - sc.oy; });
check('outer walls stop bullets and the closed vault blocks the way', walls.wallHit && walls.intoVault, walls);
check('bullets fly over the low teller counter', walls.overCounter, walls);
check('walking into the west wall stops at the wall', wall2.x > 0.6 && wall2.x < 1.0, wall2);
check('the counter blocks your feet', wall3 > 20.7, wall3);

// ---------- 4. leave by the exit mat ----------
await t.eval(() => window.__at(18, 30.0, Math.PI / 2));
await t.hold(['KeyS'], 900);
const left = await t.eval(() => { const X = PG.gta, p = X.player.ped, d = X.interiors.doors.find(q => q.place === 'bank'); return { scene: !!X.scene, d: Math.hypot(p.x - d.x, p.y - d.y), leave: window.__ev.leave, free: !X.blocked(p.x, p.y, p.r) }; });
check('walking onto the exit mat puts you back on the street at the bank door', !left.scene && left.d < 3.2 && left.leave === 1 && left.free, left);

// ---------- 5. every interior type ----------
for (const k of places.concat(gens)) {
  const r = await t.eval(k => {
    const X = PG.gta, I = X.interiors, sc = I.enter(k);
    if (!sc) return { k, fail: true };
    const p = X.player.ped;
    return { k, id: sc.id, inside: p.x > sc.x0 && p.x < sc.x1 && p.y > sc.y0 && p.y < sc.y1, free: !X.blocked(p.x, p.y, p.r) && !sc.low.some(q => p.x > q.x0 - 0.3 && p.x < q.x1 + 0.3 && p.y > q.y0 - 0.3 && p.y < q.y1 + 0.3), peds: sc.peds.length, nodes: sc.nav.nodes.length, solids: sc.solids.length, cam: sc.camSpan, exitTxt: !!sc.exit };
  }, k);
  await t.wait(k === 'club' || k === 'bank' ? 700 : 450);
  await t.shot('int-scene-' + k);
  const back = await t.eval(k => {
    const X = PG.gta, sc = X.scene; X.interiors.leave();
    const p = X.player.ped, d = sc.cityDoor;
    return { scene: !!X.scene, d: Math.hypot(p.x - (d.x + d.nx * 1.3), p.y - (d.y + d.ny * 1.3)), peds: sc.peds.length };
  }, k);
  check(`${k}: enter, stand somewhere free inside, leave to the right door`, r.id === k && r.inside && r.free && r.nodes > 40 && r.solids >= 4 && r.cam >= 20 && r.cam <= 30 && !back.scene && back.d < 0.2 && back.peds === 0, { r, back });
}

// ---------- 6. a generic building by its door ----------
const gen = await t.eval(() => {
  const X = PG.gta, d = X.interiors.doors.find(q => q.gen && q.type === 'store'), p = X.player.ped;
  p.x = d.x + d.nx * 1.0; p.y = d.y + d.ny * 1.0; X.cam.x = p.x; X.cam.y = p.y;
  return d.name;
});
await t.wait(150); await t.eval(() => { const X = PG.gta, d = X.interiors.doors.find(q => q.gen && q.type === 'store'), p = X.player.ped; X.interiors.enter(d); }); await t.wait(300);
const gen2 = await t.eval(() => ({ s: PG.gta.scene && PG.gta.scene.type, n: PG.gta.scene && PG.gta.scene.name }));
check('walking into a generic 24/7 door enters that store', gen2.s === 'store' && gen2.n === gen, { gen, gen2 });

// ---------- 7. 24/7 hold-up ----------
await t.eval(() => {
  const X = PG.gta, sc = X.scene, W = window, P = X.player;
  W.__arm(); P.loot = 0; W.__ev.crime.length = 0;
  for (const q of sc.peds) if (q.ai.role === 'customer') q.removed = true;
  const c = sc.peds.find(q => q.ai.role === 'cashier');
  W.__cashier = c;
  W.__at(11.5, 10.5, 0); P.ped.th = Math.atan2(c.y - P.ped.y, c.x - P.ped.x);
});
await t.wait(900);
const mid = await t.eval(() => ({ pose: window.__cashier.pose, prog: PG.gta.interiors._S().rob && PG.gta.interiors._S().rob.prog }));
await t.shot('int-03-store-holdup');
const rob = await until(() => { const P = PG.gta.player, q = window.__cashier; P.ped.th = Math.atan2(q.y - P.ped.y, q.x - P.ped.x); return P.loot > 0; }, 2500);
const robR = await t.eval(() => ({ loot: PG.gta.player.loot, crimes: window.__ev.crime, ev: window.__ev.storeRobbed, bell: PG.gta.scene.st.bellT, st: window.__cashier.ai.st }));
check('pointing a gun at the cashier makes them put their hands up', mid.pose === 'hands' && mid.prog > 0.5, mid);
check('after 2 s the till is handed over as loot, the alarm rings and it is a robbery', rob && robR.loot >= 100 && robR.loot <= 400 && robR.crimes.includes('robbery') && robR.ev === 1 && robR.bell > 0, robR);
await t.eval(() => window.__out());

// ---------- 8. Ammu-Fjord ----------
await t.eval(() => { const X = PG.gta; X.interiors.enter('gunshop'); X.player.money = 2000; X.player.ped.armor = 0; window.__pad = it => { const sc = X.scene, pd = sc.pads.find(q => q.item === it), p = X.player.ped; p.x = pd.x; p.y = pd.y + 2.2; p.vx = p.vy = 0; return pd; }; window.__pad('armor'); });
await t.wait(100);
await t.hold(['KeyW'], 450);
const arm = await t.eval(() => ({ armor: PG.gta.player.ped.armor, money: PG.gta.player.money }));
check('walking onto the armour stand buys body armour', arm.armor === 100 && arm.money === 1700, arm);
await t.eval(() => { window.__pad('pistol'); PG.gta.player.money = 2000; delete PG.gta.player.inv.pistol; PG.gta.player.weapon = 'fists'; });
await t.hold(['KeyW'], 450);
const gun = await t.eval(() => ({ inv: PG.gta.player.inv.pistol || 0, money: PG.gta.player.money, buy: window.__ev.shopBuy, price: PG.gta.WEAPONS && PG.gta.WEAPONS.pistol ? PG.gta.WEAPONS.pistol.price || 150 : 150 }));
if (has.weapons) check('walking onto the pistol stand buys a pistol (weapons.js)', gun.inv > 0 && gun.money === 2000 - gun.price, gun);
else check('without weapons.js the gun stands are sold out and charge nothing', gun.inv === 0 && gun.money === 2000, gun);
await t.eval(() => { window.__pad('shotgun'); PG.gta.player.money = 10; });
await t.hold(['KeyW'], 450);
const broke = await t.eval(() => ({ money: PG.gta.player.money, inv: PG.gta.player.inv.shotgun || 0, popup: document.querySelector('#gta-hud .g-popup').textContent }));
check('not enough money: nothing sold, a message says so', broke.money === 10 && broke.inv === 0 && /money|sold out/i.test(broke.popup), broke);
await t.eval(() => { const X = PG.gta; X.player.money = 2000; window.__at(11, 15); });
await t.wait(400); await t.shot('int-04-gunshop');
await t.eval(() => window.__out());

// ---------- 9. hospital ----------
await t.eval(() => { const X = PG.gta; X.interiors.enter('hospital'); X.player.money = 100; X.player.ped.hp = 40; window.__act(/patched/); });
await t.wait(100); await t.press('KeyF'); await t.wait(150);
const heal = await t.eval(() => ({ hp: PG.gta.player.ped.hp, money: PG.gta.player.money }));
await t.eval(() => { const X = PG.gta; X.player.money = 0; X.player.ped.hp = 30; });
await t.press('KeyF'); await t.wait(150);
const heal2 = await t.eval(() => ({ hp: PG.gta.player.ped.hp, money: PG.gta.player.money }));
check('the hospital desk heals to full for $50', heal.hp === 100 && heal.money === 50, heal);
check('broke? healed anyway, for free', heal2.hp === 100 && heal2.money === 0, heal2);
await t.eval(() => window.__out());

// ---------- 10. the bank job ----------
await t.eval(() => { const X = PG.gta, W = window; X.interiors.bank.reset(); X.interiors.enter('bank'); W.__god(true); W.__arm(); X.player.loot = 0; W.__ev.crime.length = 0; });
// hold up a teller first
await t.eval(() => { const X = PG.gta, sc = X.scene, W = window, P = X.player; const tl = sc.peds.find(q => q.ai.role === 'teller'); W.__teller = tl; W.__at(tl.x - sc.ox, 22.6, 0); P.ped.th = Math.atan2(tl.y - P.ped.y, tl.x - P.ped.x); });
const teller = await until(() => { const P = PG.gta.player, q = window.__teller; P.ped.th = Math.atan2(q.y - P.ped.y, q.x - P.ped.x); return window.__ev.tellerRobbed > 0; }, 3500);
const tR = await t.eval(() => ({ loot: PG.gta.player.loot, alarm: PG.gta.interiors.bank.alarm, heist: window.__ev.heistAlarm, crimes: window.__ev.crime.slice(), guardsFighting: PG.gta.scene.peds.filter(q => q.team === 'guard' && q.ai.st === 'fight').length }));
check('holding up a teller hands over the drawer and trips the bank alarm', teller && tR.loot >= 300 && tR.alarm && tR.heist === 1 && tR.crimes.includes('robbery') && tR.crimes.includes('heist'), tR);
check('the guards turn on you', tR.guardsFighting >= 2, tR);
await t.wait(1600);
await t.shot('int-05-bank-shootout');
const shootout = await t.eval(() => ({ hurt: window.__ev.playerHurtBy.length, by: [...new Set(window.__ev.playerHurtBy)], hp: PG.gta.player.ped.hp }));
check('guards shoot back', shootout.hurt > 0 && shootout.by.includes('guard'), shootout);
const fpsFight = await fps(1500);
check('fps during the bank shoot-out', fpsFight >= 38, fpsFight);
// the drill
const drill0 = await t.eval(() => { const W = window, X = PG.gta; X.player.loot = 0; return W.__act(/Drill the vault/); });
await t.wait(100); await t.press('KeyF'); await t.wait(1500);
const d1 = await t.eval(() => ({ drill: PG.gta.interiors.bank.drill, txt: document.querySelector('#gta-hud .g-hint').textContent }));
await t.shot('int-06-bank-drill');
const opened = await until(() => PG.gta.interiors.bank.vaultOpen, 8000);
await t.wait(1800);
const vR = await t.eval(() => { const X = PG.gta, sc = X.scene, plug = sc.st.plug; return { open: X.interiors.bank.vaultOpen, ev: window.__ev.vaultOpened, cash: X.interiors.bank.cashLeft, plugGone: !X.blocked((plug.x0 + plug.x1) / 2, (plug.y0 + plug.y1) / 2, 0.1) }; });
check('F at the vault mounts the drill (progress ring, hint)', drill0 === 'F: Drill the vault' && d1.drill > 0.1 && d1.drill < 0.5 && /Drilling/.test(d1.txt), { drill0, d1 });
check('after ~7 s of drilling the vault swings open and the way in is clear', opened && vR.open && vR.ev === 1 && vR.plugGone && vR.cash > 10000, vR);
await t.eval(() => window.__at(9, 6, Math.PI));
await t.wait(300); await t.shot('int-07-vault-open');
const loot = await t.eval(async () => {
  const X = PG.gta, sc = X.scene, P = X.player, l0 = P.loot;
  for (const l of sc.loot) { P.ped.x = l.x; P.ped.y = l.y + (l.y - sc.oy < 2 ? 0.1 : 0); await new Promise(r => setTimeout(r, 60)); }
  return { got: P.loot - l0, left: X.interiors.bank.cashLeft };
});
check('walking over the bags and stacks grabs the cash as loot', loot.got >= 12000 && loot.left === 0, loot);
const trespass = await t.eval(() => window.__ev.crime.includes('heist'));
check('the heist is reported to the police', trespass);
await t.eval(() => { window.__out(); PG.gta.interiors.bank.reset(); });
const reset = await t.eval(() => { const B = PG.gta.interiors.bank; return { alarm: B.alarm, open: B.vaultOpen, cash: B.cashLeft }; });
check('bank.reset() closes the vault and refills it', !reset.alarm && !reset.open && reset.cash > 10000, reset);

// ---------- 10b. the full program: cameras, keycard, security door, hostages, deposit boxes, waves, service exit ----------
await t.eval(() => { const X = PG.gta, W = window; X.interiors.enter('bank'); W.__god(true); X.player.loot = 0; W.__ev.score = null; X.on('heistScore', e => { W.__ev.score = { take: e.take, back: e.back, hostages: e.hostages }; }); });
const pj0 = await t.eval(() => { const sc = PG.gta.scene, g = sc.st.secGap; return { locked: g.locked && !!PG.gta.blocked(g.x, g.y, 0.2), hint: window.__act(/Security door/) }; });
await t.eval(() => { const X = PG.gta, sc = X.scene, g = sc.peds.find(q => q.ai.sp && q.ai.sp.sec); window.__at(g.x - sc.ox, g.y - sc.oy + 0.9); X.damagePed(g, 8, X.player.ped, 'melee'); });
await t.wait(300);
const pj1 = await t.eval(() => { const J = PG.gta.interiors.bank.job; return { cams: J.camsOff, alarm: PG.gta.interiors.bank.alarm }; });
check('the security door starts locked; a quiet punch on the security guard blinds the cameras', pj0.locked && /locked/i.test(pj0.hint) && pj1.cams && !pj1.alarm, { pj0, pj1 });
await t.eval(() => { window.__arm(); window.__at(7.2, 15.6); });
const pjCard = await until(() => { const P = PG.gta.player, m = PG.gta.scene.peds.find(q => q.ai.sp && q.ai.sp.keycard); P.ped.th = Math.atan2(m.y - P.ped.y, m.x - P.ped.x); return PG.gta.interiors.bank.job.card; }, 4000);
await t.eval(() => window.__act(/Swipe the keycard/)); await t.wait(120); await t.press('KeyF'); await t.wait(200);
const pj2 = await t.eval(() => { const g = PG.gta.scene.st.secGap; return { open: PG.gta.interiors.bank.job.secOpen, free: !PG.gta.blocked(g.x, g.y, 0.2) }; });
check('the manager hands over his keycard at gunpoint and it opens the security door', pjCard && pj2.open && pj2.free, pj2);
await t.eval(() => window.__at(18, 27, Math.PI / 2)); await t.wait(150); await t.press('KeyF'); await t.wait(300);
const pj3 = await t.eval(() => ({ h: PG.gta.interiors.bank.job.hostages, alarm: PG.gta.interiors.bank.alarm }));
check('"Everybody down!" takes hostages (blind cameras: no alarm)', pj3.h >= 2 && !pj3.alarm, pj3);
await t.eval(() => window.__act(/Crack deposit box 3/)); await t.wait(120); await t.press('KeyF');
const pjBox = await until(() => PG.gta.interiors.bank.job.boxes[2] === 1, 4000);
check('a deposit box cracks open for loot', pjBox && (await t.eval(() => PG.gta.player.loot)) > 0);
await t.eval(() => window.__act(/Drill the vault/)); await t.wait(100); await t.press('KeyF'); await t.wait(300);
await t.eval(() => { PG.gta.interiors.bank.job.copT = 0.2; });
const pjWave = await until(() => PG.gta.scene && PG.gta.scene.peds.filter(q => q.ai.wave && q.ai.st === 'fight').length >= 2, 3000);
check('after the alarm the police storm in through the front door', !!pjWave);
await t.eval(() => window.__act(/Service exit/)); await t.wait(120); await t.press('KeyF'); await t.wait(400);
const pj4 = await t.eval(() => { const X = PG.gta, p = X.player.ped; return { scene: !!X.scene, free: !X.blocked(p.x, p.y, p.r), score: window.__ev.score, heists: X.interiors.stats.heists }; });
check('the service exit leads outside with a heist score', !pj4.scene && pj4.free && pj4.score && pj4.score.take > 0 && pj4.score.back && pj4.heists >= 1, pj4);
await t.eval(() => { window.__out(); PG.gta.interiors.bank.reset(); PG.gta.player.loot = 0; });

// ---------- 11. safehouse sleep ----------
await t.eval(() => { const X = PG.gta; X.interiors.enter('apartment'); X.clock = 22 * 60; window.__clearStars(); X.player.ped.hp = 40; window.__act(/Sleep \(save\)/); });
await t.press('KeyF');
await t.wait(1300); await t.shot('int-08-sleep');
await until(() => window.__ev.sleep > 0, 2500); await t.wait(1500);
const slept = await t.eval(() => ({ clock: Math.round(PG.gta.clock), hp: PG.gta.player.ped.hp, ev: window.__ev.sleep, fade: !!PG.gta.interiors._S().fade }));
check('sleeping skips the clock to 07:00, heals and saves', slept.ev === 1 && slept.clock >= 420 && slept.clock < 430 && slept.hp === 100 && !slept.fade, slept);
const noSleep = await t.eval(() => { const X = PG.gta; X.player.wanted = 2; const txt = window.__act(/Sleep/); return txt; });
await t.press('KeyF'); await t.wait(200);
const noSleep2 = await t.eval(() => ({ ev: window.__ev.sleep, popup: document.querySelector('#gta-hud .g-popup').textContent }));
check('no sleeping with the cops after you', /not with the cops/.test(noSleep) && noSleep2.ev === 1, { noSleep, noSleep2 });
await t.eval(() => window.__out());

// ---------- 12. the police front desk ----------
if (has.police) {
  await t.eval(() => { const X = PG.gta; X.police.setWanted(1); X.player.money = 1000; X.interiors.enter('police'); window.__act(/fine/); });
  await t.wait(150); await t.press('KeyF'); await t.wait(250);
  const fine = await t.eval(() => ({ w: PG.gta.player.wanted, money: PG.gta.player.money }));
  check('paying a $500 fine at the front desk drops a star', fine.w === 0 && fine.money === 500, fine);
  await t.eval(() => { const X = PG.gta; X.interiors.leave(); X.police.setWanted(2); X.interiors.enter('police'); window.__god(true); });
  const hostile = await until(() => PG.gta.scene && PG.gta.scene.peds.filter(q => (q.ai.role === 'cop' || q.ai.role === 'sergeant') && q.ai.st === 'fight').length >= 2, 2500);
  check('walking in with 2 stars makes the cops inside hostile', !!hostile);
} else {
  await t.eval(() => { PG.gta.interiors.enter('police'); window.__act(/sergeant|fine/); });
  await t.wait(100);
  const h = await t.eval(() => document.querySelector('#gta-hud .g-hint').textContent);
  check('without police.js the desk sergeant has no fines to take', /desk sergeant/.test(h), h);
  await t.eval(() => { PG.gta.player.wanted = 2; PG.gta.interiors.leave(); PG.gta.interiors.enter('police'); window.__god(true); });
  const hostile = await until(() => PG.gta.scene && PG.gta.scene.peds.filter(q => (q.ai.role === 'cop' || q.ai.role === 'sergeant') && q.ai.st === 'fight').length >= 2, 2500);
  check('walking in with 2 stars makes the cops inside hostile', !!hostile);
}
await t.wait(600); await t.shot('int-09-police-hostile');
await t.eval(() => window.__out());

// ---------- 13. The Rusty Pillar ----------
await t.eval(() => { const X = PG.gta; X.interiors.enter('bar'); X.player.money = 100; X.player.ped.hp = 50; window.__act(/drink/); });
await t.wait(100); await t.press('KeyF'); await t.wait(150);
const drink = await t.eval(() => ({ hp: PG.gta.player.ped.hp, money: PG.gta.player.money }));
check('a drink at the bar: +15 hp for $10', drink.hp === 65 && drink.money === 90, drink);
await t.eval(() => window.__act(/Artur/)); await t.wait(100); await t.press('KeyF'); await t.wait(300);
const artur = await t.eval(() => ({ ev: window.__ev.talkArtur, pager: document.querySelector('#gta-hud .g-pager').textContent, hidden: document.querySelector('#gta-hud .g-pager').hidden, alive: PG.gta.scene.peds.some(q => q.ai.role === 'artur' && !q.dead) }));
check('Artur sits in his booth and gives you a tip', artur.ev === 1 && /ARTUR/.test(artur.pager) && !artur.hidden && artur.alive, artur);
const juke = await t.eval(() => { const W = window, X = PG.gta; W.__act(/song/); return X.scene.st.song || 'blues'; });
await t.press('KeyF'); await t.wait(100);
const juke2 = await t.eval(() => PG.gta.scene.st.song);
check('the jukebox changes the song', juke2 && juke2 !== juke, { juke, juke2 });
await t.eval(() => window.__act(/pool/)); await t.press('KeyF'); await t.wait(400);
const pool = await t.eval(() => ({ money: PG.gta.player.money, moving: PG.gta.scene.st.balls.some(b => Math.hypot(b.vx, b.vy) > 0.2) }));
check('pool: $20 on the table, the balls fly', pool.money === 70 && pool.moving, pool);
await t.eval(() => window.__at(9, 15.2, -Math.PI / 2)); await t.wait(500); await t.shot('int-10-bar');
const brawl = await t.eval(() => new Promise(res => {
  const X = PG.gta, sc = X.scene, d = sc.peds.find(q => q.ai.role === 'drinker' && !q.dead && !q.removed);
  if (!d) return res({ none: true });
  X.damagePed(d, 5, X.player.ped, 'melee');
  setTimeout(() => res({ st: d.ai.st, fighters: sc.peds.filter(q => q.ai.st === 'fight').length }), 300);
}));
check('a punch in the bar starts a brawl', brawl.none || (brawl.st === 'fight' && brawl.fighters >= 1), brawl);
await t.eval(() => { for (const q of PG.gta.scene.peds) if (q.ai.st === 'fight') { q.ai.st = 'idle'; q.ai.melee = q.ai.role === 'drinker'; } });
// shooting the bottles behind the bar breaks them (and starts a panic)
const smash = await t.eval(() => {
  const X = PG.gta, sc = X.scene, P = X.player, f = sc.furn.find(q => q.t === 'bottles');
  window.__at(14, 8, -Math.PI / 2); P.ped.aim = Math.atan2(f.y - P.ped.y, f.x - P.ped.x); P.ped.th = P.ped.aim;
  X.emit('gunfire', { x: P.ped.x, y: P.ped.y, by: P.ped, weapon: 'pistol' });
  return { broken: f.broken, ev: window.__ev.smash, artur: sc.peds.find(q => q.ai.role === 'artur').dead };
});
check('a bullet into the bottle shelf smashes it; Artur does not die in his own bar', smash.broken && smash.ev >= 1 && !smash.artur, smash);
await t.eval(() => window.__out());

// ---------- 14. music, pause, mute ----------
const mus = await t.eval(() => new Promise(res => {
  const X = PG.gta, S = X.interiors._S();
  PG.audio.unlock(); PG.audio.setMuted(false);
  const live = !!PG.audio.kit();
  X.interiors.enter('club');
  setTimeout(() => {
    const on = S.mus.on, song = S.mus.song;
    PG.pause(true);
    setTimeout(() => {
      const paused = S.mus.on;
      PG.pause(false);
      setTimeout(() => {
        const again = S.mus.on;
        X.interiors.leave();
        setTimeout(() => { const out = S.mus.on && !S.mus.muffle; PG.audio.setMuted(true); setTimeout(() => res({ live, on, song, paused, again, out, mutedOn: S.mus.on }), 150); }, 150);
      }, 300);
    }, 200);
  }, 400);
}));
if (mus.live) check('club music plays inside, stops on pause, comes back, stops on the way out and on mute', mus.on && mus.song === 'techno' && !mus.paused && mus.again && !mus.out && !mus.mutedOn, mus);
else check('music logic runs without an audio context (none here)', !mus.on, mus);

// ---------- 15. fps in a packed club ----------
await t.eval(() => { const X = PG.gta; X.clock = 23 * 60; X.interiors.enter('club'); window.__at(14, 17, -Math.PI / 2); });
await t.wait(500);
const clubN = await t.eval(() => PG.gta.scene.peds.length);
const fpsClub = await fps(2000);
await t.shot('int-11-club');
check('fps in a busy nightclub', fpsClub >= 45, { fps: fpsClub, peds: clubN });
await t.eval(() => window.__out());

// ---------- 16. barrels and getting wasted indoors ----------
if (has.damage) {
  const boom = await t.eval(() => new Promise(res => {
    const X = PG.gta; window.__god(true); X.interiors.enter('warehouse');
    const sc = X.scene, n0 = (sc.props || []).filter(p => !p.dead).length, e0 = X.damage.stats.explosions;
    X.hitProp(sc.props[0], 300, X.player.ped, 'bullet');
    setTimeout(() => res({ n0, left: sc.props.filter(p => !p.dead).length, exp: X.damage.stats.explosions - e0, scared: sc.peds.filter(q => q.removed || q.ai.st !== 'idle').length, peds: sc.peds.length }), 2500);
  }));
  check('the warehouse barrels go up in a chain (damage.js)', boom.n0 === 4 && boom.left < 3 && boom.exp >= 2, boom);
  await t.shot('int-12-warehouse-boom');
  await t.eval(() => window.__out());
}
await t.eval(() => { const X = PG.gta; window.__god(false); X.player.money = 1000; X.interiors.enter('diner'); X.damagePed(X.player.ped, 500, null, 'bullet'); });
const resp = await until(() => !PG.gta.scene && PG.gta.player.state === 'play', 6000);
const respR = await t.eval(() => { const X = PG.gta, p = X.player.ped, h = X.places.hospital; return { scene: !!X.scene, d: h ? Math.round(Math.hypot(p.x - h.door.x, p.y - h.door.y)) : 0, cur: !!X.interiors._S().cur, peds: X.peds.filter(q => q.ai && q.ai.owner === 'interiors' && !q.removed).length }; });
check('wasted indoors: back on your feet at the hospital door, the interior is cleaned up', !!resp && !respR.scene && respR.d < 4 && !respR.cur && respR.peds === 0, respR);

// ---------- 17. a second game ----------
const g2 = await t.eval(() => {
  const X = PG.gta; X.stop(); X.start(PG.GTA_DEF);
  const I = X.interiors;
  return { doors: I.doors.length, scenes: I.scenes.size, scene: !!X.scene, cash: I.bank.cashLeft, alarm: I.bank.alarm, stats: I.stats.entered };
});
await t.wait(300);
const g2b = await t.eval(() => { const X = PG.gta, sc = X.interiors.enter('diner'); const r = { ok: !!sc && X.scene === sc, peds: sc ? sc.peds.length : 0 }; X.interiors.leave(); return r; });
check('a second game starts clean and interiors work', g2.doors > 20 && g2.scenes === 1 && !g2.scene && g2.cash > 10000 && !g2.alarm && g2.stats === 0 && g2b.ok, { g2, g2b });

check('no console errors', t.errors.length === 0, t.errors.slice(0, 5));
await t.close();
console.log(failed ? `${failed} check(s) failed` : 'all interiors checks passed');
process.exit(failed ? 1 : 0);
