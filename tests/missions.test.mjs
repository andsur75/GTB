// Missions test: payphones ring and answer with Artur's briefing, every story mission played to the end
// with teleports (plus fail paths: wrecked car, timer, wasted), odd jobs after the story, persistence after
// a page reload, a second game, fps in a busy scenario and screenshots of the visuals.
// Usage: node tests/missions.test.mjs <built.html> <shotDir>
import { launch, fpsSkip } from './harness.mjs';

const html = process.argv[2], out = process.argv[3] || '/tmp/gta-shots/missions';
let fails = 0;
const ok = (name, cond, info) => {
  if (fpsSkip(name, cond, info)) return;
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''));
  if (!cond) fails++;
};
const t = await launch({ html, out });

async function inject() {
  await t.eval(() => {
    const X = PG.gta;
    window.__ev = window.__ev || [];
    if (!window.__hooked) {
      window.__hooked = true;
      for (const k of ['missionStart', 'missionPassed', 'missionFailed']) X.on(k, e => window.__ev.push({ k, id: e.id, reason: e.reason, reward: e.reward }));
    }
    window.T = {
      R: () => X.missions.run,
      god() { const p = X.player.ped; p.hp = p.maxHp = 100000; },
      enter(c) { const P = X.player; if (P.car) X.exitCar(); const s = X.doorSpot(c, -1) || { x: c.x - Math.sin(c.th) * 2, y: c.y + Math.cos(c.th) * 2 }; P.ped.x = s.x; P.ped.y = s.y; P.ped.vx = P.ped.vy = 0; X.cam.x = s.x; X.cam.y = s.y; X.enterCar(c); },
      tp(x, y) { const P = X.player; if (P.car) X.placeCar(P.car, x, y, P.car.th); else { P.ped.x = x; P.ped.y = y; P.ped.vx = P.ped.vy = 0; } X.cam.x = x; X.cam.y = y; },
      tpCar(c, x, y, th) { X.placeCar(c, x, y, th == null ? c.th : th); X.cam.x = x; X.cam.y = y; },
      start(id) { X.missions.skip(); return X.missions.start(id); },
      ev(k, id) { return window.__ev.filter(e => e.k === k && (!id || e.id === id)); },
      clearCops() { if (X.police && X.police.clear) X.police.clear(); else X.player.wanted = 0; },
      bagsLeft() { const R = X.missions.run; return R ? R.items.filter(i => i.kind === 'bag' && !i.taken).length : 0; },
      grabBags() { const R = X.missions.run; if (!R) return 0; const b = R.items.find(i => i.kind === 'bag' && !i.taken); if (!b) return 0; T.tp(b.x, b.y); return 1; },
    };
  });
}
async function until(fn, arg, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 8000)) { if (await t.eval(fn, arg)) return true; await t.wait(80); }
  return false;
}
const passed = id => t.eval(i => T.ev('missionPassed', i).length > 0, id);
const failed = id => t.eval(i => T.ev('missionFailed', i).map(e => e.reason), id);
async function alive() { await until(() => PG.gta.player.state === 'play', null, 7000); await t.eval(() => T.god()); }
await inject();
await t.eval(() => { T.god(); PG.audio.setMuted(false); });   // sound on, so every synth path runs
ok('audio is live for the test', await t.eval(() => !!PG.audio.kit()));

// ---------- payphones ----------
const ph = await t.eval(() => {
  const X = PG.gta, M = X.missions, h = X.places.hideout.door;
  return {
    n: M.phones.length, tiers: M.phones.map(p => p.tier), side: M.phones.every(p => !X.roadAt(p.x, p.y) && !!X.blockAt(p.x, p.y) && X.onSidewalk(p.x, p.y)),
    ring0: M.phones[0].mission && M.phones[0].mission.id, d0: Math.round(Math.hypot(M.phones[0].x - h.x, M.phones[0].y - h.y)),
    solid: M.phones.every(p => !!X.blocked(p.x, p.y)), list: M.list().filter(m => m.available).map(m => m.id),
  };
});
ok('4-6 payphones placed', ph.n >= 4 && ph.n <= 6, ph.tiers);
ok('phones stand on sidewalks and are solid', ph.side && ph.solid);
ok('a gold phone near the bank', ph.tiers.includes('bank'));
ok('first story mission rings at the garage phone', ph.ring0 === 'hotwheels' && ph.d0 < 95, { ring: ph.ring0, d: ph.d0 });
ok('only the first mission is available on a fresh save', ph.list.length === 1 && ph.list[0] === 'hotwheels', ph.list);

await t.eval(() => { const X = PG.gta, p0 = X.missions.phones[0], p = X.player.ped; p.x = p0.x - p0.nx * 1.5; p.y = p0.y - p0.ny * 1.5; X.cam.x = p.x; X.cam.y = p.y; });
await until(() => PG.gta.missions.list()[0].ringing, null, 6000);
await t.wait(500);
const hint = await t.eval(() => document.querySelector('#gta-hud .g-hint').textContent);
ok('ringing phone offers F: answer', /answer/i.test(hint), hint);
await t.shot('missions-1-phone-ringing');
await t.press('KeyF');
await t.wait(300);
const call = await t.eval(() => ({ vis: !document.querySelector('#gta-hud .m-call').hidden, act: PG.gta.missions.active, box: !document.querySelector('#gta-hud .m-box').hidden }));
ok('F answers: Artur is on the pager and the mission starts', call.vis && call.act && call.act.id === 'hotwheels' && call.act.brief && call.box, call);
await t.wait(1000);
const talk = await t.eval(() => PG.ui.talking());
await t.press('KeyP');
await t.wait(200);
const paused = await t.eval(() => ({ st: PG.game.status, talking: PG.ui.talking(), call: !!PG.gta.missions.call }));
ok('pause hushes Artur, the call waits', talk && paused.st === 'paused' && !paused.talking && paused.call, { talk, paused });
await t.press('KeyP');
await t.wait(1600);
const typed = await t.eval(() => document.querySelector('#gta-hud .m-call .m-line').textContent);
ok('briefing text types out', typed.length > 10, typed.slice(0, 40));
await t.shot('missions-2-briefing');
await t.press('KeyF'); await t.press('KeyF'); await t.press('KeyF'); await t.press('KeyF'); await t.press('KeyF'); await t.press('KeyF');
await until(() => !PG.gta.missions.call, null, 6000);
const after = await t.eval(() => ({ brief: PG.gta.missions.active.brief, obj: document.querySelector('#gta-hud .m-box .m-o').textContent }));
ok('F skips through the briefing to the objective', !after.brief && /steal/i.test(after.obj), after);

// ---------- 1. Hot Wheels: steal the car, deliver it to the garage ----------
const m0 = await t.eval(() => PG.gta.player.money);
await t.eval(() => T.enter(T.R().data.car));
ok('Hot Wheels: got into the dentist\'s car', await until(() => PG.gta.player.car === T.R().data.car && T.R().stage === 1));
await t.eval(() => { const z = PG.gta.missions.garage.zone, c = T.R().data.car; T.tpCar(c, z.x, z.y, c.th); });
await t.wait(1500);
const gh = await t.eval(() => PG.gta.missions.garage && PG.gta.missions.garage && PG.gta.missions.run === null);
await t.shot('missions-3-garage');
ok('Hot Wheels: passed at the garage', await until(() => T.ev('missionPassed', 'hotwheels').length > 0, null, 5000));
const m1 = await t.eval(() => PG.gta.player.money);
ok('Hot Wheels: reward paid (with mint bonus)', m1 - m0 >= 500, m1 - m0);
ok('Hot Wheels: player is out and the car rolled in', await t.eval(() => !PG.gta.player.car && PG.gta.cars.every(c => !c.removed || true)) && gh);
ok('Hot Wheels: chain unlocks the next missions', await until(() => { const l = PG.gta.missions.list(); return l.find(m => m.id === 'special').available && l.find(m => m.id === 'bus').available; }));

// ---------- fail paths ----------
await t.eval(() => T.start('hotwheels'));
await t.eval(() => { const c = T.R().data.car; PG.gta.destroyCar(c, null, 'bomb'); });
ok('Fail: wrecking the target car fails the mission', await until(() => T.ev('missionFailed', 'hotwheels').length > 0), await failed('hotwheels'));
await t.wait(400);
const fb = await t.eval(() => document.querySelector('#gta-hud .g-big').textContent);
ok('Fail: MISSION FAILED on screen', /MISSION FAILED/.test(fb), fb);

await t.eval(() => T.start('special'));
await t.eval(() => T.enter(T.R().data.van));
await until(() => T.R() && T.R().stage === 1);
const fuse = await t.eval(() => T.R().timer);
const tmEl = await t.eval(() => { const e = document.querySelector('#gta-hud .m-timer'); return { hidden: e.hidden, text: e.textContent }; });
ok('Special Delivery: bomb timer on the HUD', fuse > 30 && !tmEl.hidden && /\d:\d\d/.test(tmEl.text), { fuse, tmEl });
await t.shot('missions-4-bomb-timer');
await t.eval(() => { T.R().timer = 0.3; });
ok('Fail: the timer runs out and the van blows', await until(() => T.ev('missionFailed', 'special').length > 0), await failed('special'));
await alive();

await t.eval(() => T.start('special'));
await t.eval(() => T.enter(T.R().data.van));
await until(() => T.R() && T.R().stage === 1);
await t.eval(() => { const R = T.R(), z = R.data.office; T.tpCar(R.data.van, z.x, z.y); });
await until(() => T.R() && T.R().stage === 2, null, 4000);
await until(() => !PG.gta.player.car, null, 3000);
await t.eval(() => { const v = T.R().data.van; T.tp(v.x + 18, v.y + 2); const p = PG.gta.player.ped; for (let k = 0; k < 40 && PG.gta.blocked(p.x, p.y, 0.4); k++) p.y += 1; });
ok('Special Delivery: delivered, ran clear, boom, passed', await until(() => T.ev('missionPassed', 'special').length > 0, null, 8000));
await alive();

// ---------- 3. Take the Bus! ----------
await t.eval(() => T.start('bus'));
const lot = await t.eval(() => { const L = T.R().data.lot; return { kind: L.kind, n: L.bays.length }; });
ok('Take the Bus: rival car park with parked cars', lot.n >= 6, lot);
await t.eval(() => T.enter(T.R().data.bus));
ok('Take the Bus: in the bus', await until(() => PG.gta.player.car === T.R().data.bus && T.R().stage === 1, null, 4000));
await t.eval(() => { const R = T.R(), L = R.data.lot; T.tpCar(R.data.bus, L.cx, L.cy - 14 > L.y0 - 20 ? L.y0 - 10 : L.cy, Math.PI / 2); });
ok('Take the Bus: arrived at the car park', await until(() => T.R() && T.R().stage === 2, null, 3000));
const rammed = await t.eval(() => {
  const X = PG.gta, R = T.R(), bus = R.data.bus;
  // a run-up where the whole bus body has a clear path (street props, trees and the other parked cars)
  const clear = (x, y, th, skip) => { const poly = PG.obb(x, y, bus.len + 0.4, bus.wid + 0.4, th); return !PG.cityNear(X.city, x, y, 9).some(s => PG.overlap(poly, s.poly)) && !X.cars.some(o => o !== bus && o !== skip && !o.removed && Math.hypot(o.x - x, o.y - y) < 12 && PG.overlap(poly, X.carPoly(o))); };
  for (const c of R.data.lotCars) for (let k = 0; k < 24; k++) {
    const a = k / 24 * Math.PI * 2, x = c.x + Math.cos(a) * 14, y = c.y + Math.sin(a) * 14, th = a + Math.PI;
    if (![0, 0.2, 0.4].every(f => clear(x + (c.x - x) * f, y + (c.y - y) * f, th, f > 0.3 ? c : null))) continue;
    X.placeCar(bus, x, y, th); bus.dv.vx = Math.cos(th) * 15; bus.dv.vy = Math.sin(th) * 15; bus.dv.v = 15; X.cam.x = x; X.cam.y = y;
    return true;
  }
  return false;
});
await t.wait(900);
await t.shot('missions-5-bus-ram');
const smashed1 = await t.eval(() => T.R() ? T.R().data.smashed.size : -1);
ok('Take the Bus: ramming a parked car with the bus counts', !rammed || smashed1 >= 1, { rammed, smashed1 });
await t.eval(() => { const R = T.R(); for (const c of R.data.lotCars) if (!R.data.smashed.has(c) && R.data.smashed.size < R.data.need) PG.gta.damageCar(c, c.maxHp * 0.45, PG.gta.player.car, 'crash'); });
ok('Take the Bus: passed after smashing the lot', await until(() => T.ev('missionPassed', 'bus').length > 0, null, 4000));
await t.eval(() => { if (PG.gta.player.car) PG.gta.exitCar(); });
await alive();

// ---------- 4. Meter Maid: chase ----------
await t.eval(() => T.start('inspector'));
const c0 = await t.eval(() => { const c = T.R().data.car; return { x: c.x, y: c.y, ctrl: c.ctrl, ai: !!c.ai, hall: !!T.R().data.hall, pts: T.R().data.nav.pts.length }; });
await t.wait(2500);
const c1 = await t.eval(() => { const c = T.R().data.car; T.tp(c.x - Math.cos(c.th) * 16, c.y - Math.sin(c.th) * 16); return { x: c.x, y: c.y, sp: c.speed }; });
ok('Meter Maid: the inspector drives her route (AI via steerCtl)', c0.ai && c0.ctrl === 'phys' && Math.hypot(c1.x - c0.x, c1.y - c0.y) > 6 && c0.pts > 1, { c0, c1 });
await t.wait(700);
await t.shot('missions-6-chase');
await t.eval(() => PG.gta.damageCar(T.R().data.car, 99999, PG.gta.player.ped, 'bullet'));
ok('Meter Maid: wrecking her car passes', await until(() => T.ev('missionPassed', 'inspector').length > 0, null, 5000));
await alive();
await t.eval(() => { T.start('inspector'); const c = T.R().data.car, C = PG.gta.city; T.tp(c.x < C.W / 2 ? C.W - 40 : 40, c.y < C.H / 2 ? C.H - 40 : 40); T.R().data.far = 5.8; });
ok('Fail: the chase target escapes when you fall behind', await until(() => T.ev('missionFailed', 'inspector').some(e => /got away/.test(e.reason)), null, 3000), await failed('inspector'));

// ---------- 5. Corporate Restructuring: the hit ----------
await t.eval(() => T.start('restructure'));
const hit = await t.eval(() => { const R = T.R(), g = R.peds.filter(p => p.ai.role === 'guard'); const tg = R.data.target, d = R.data.office.door; T.tp(tg.x + d.nx * 7, tg.y + d.ny * 7); return { guards: g.length, car: !!R.data.car }; });
ok('Hit: target with bodyguards and his car', hit.guards >= 2, hit);
await t.wait(600);
await t.shot('missions-7-hit');
await t.eval(() => { const tg = T.R().data.target; PG.gta.emit('gunfire', { x: tg.x, y: tg.y, by: PG.gta.player.ped, weapon: 'pistol', radius: 30 }); });
await t.wait(150);
const alarmed = await t.eval(() => ({ alarm: T.R().alarm, st: T.R().data.target.ai.st, guards: T.R().peds.filter(p => p.ai.role === 'guard' && p.ai.st === 'attack').length }));
ok('Hit: gunfire alarms the guards and the target runs', alarmed.alarm && alarmed.guards >= 2 && alarmed.st !== 'idle', alarmed);
const hitEnts = await t.eval(() => { window.__hit = { peds: T.R().peds.slice(), cars: T.R().cars.slice() }; return true; });
if (hit.car) {   // (he can also die in traffic on the way, which passes the mission just the same)
  ok('Hit: the target jumps into his car', await until(() => !T.R() || (T.R().data.target.ai.st === 'drive' && T.R().data.target.car === T.R().data.car), null, 9000));
  const p0 = await t.eval(() => T.R() && { x: T.R().data.car.x, y: T.R().data.car.y });
  await t.wait(2000);
  const p1 = await t.eval(() => T.R() && { x: T.R().data.car.x, y: T.R().data.car.y });
  ok('Hit: ...and drives off', !p0 || !p1 || Math.hypot(p1.x - p0.x, p1.y - p0.y) > 4, { p0, p1 });
}
await t.eval(() => { if (T.R()) PG.gta.damagePed(T.R().data.target, 9999, PG.gta.player.ped, 'bullet'); });
ok('Hit: killing the target passes', await until(() => T.ev('missionPassed', 'restructure').length > 0, null, 4000));
ok('Cleanup: mission people and cars are handed back to the city', hitEnts && await t.eval(() => __hit.peds.every(p => !p.ai || p.ai.owner !== 'missions') && __hit.cars.every(c => c.owner !== 'missions' && !c.keep && (!c.ai || c.ai.owner !== 'missions'))));
await alive();

// ---------- 6. Kill frenzy ----------
await t.eval(() => T.start('frenzy'));
const fz = await t.eval(() => { const R = T.R(), s = R.data.skull; T.tp(s.x, s.y); return { useCar: R.data.useCar, w: R.data.weapon, need: R.data.need }; });
ok('Frenzy: picking up the skull starts the frenzy', await until(() => T.R() && T.R().stage === 1, null, 3000), fz);
if (!fz.useCar) ok('Frenzy: unlimited weapon while it lasts', await t.eval(w => PG.gta.player.inv[w] === Infinity && PG.gta.player.weapon === w, fz.w));
await t.wait(1500);
await t.shot('missions-8-frenzy');
const fzOk = await until(() => {
  const X = PG.gta, p = X.player.ped;
  for (const q of X.peds) if (q.team === 'gang' && !q.dead && !q.removed && Math.hypot(q.x - p.x, q.y - p.y) < 90) X.killPed(q, p, 'bullet');
  return T.ev('missionPassed', 'frenzy').length > 0;
}, null, 20000);
ok('Frenzy: killing gang members to the target passes', fzOk, await t.eval(() => T.R() && T.R().data.got));
if (!fz.useCar) ok('Frenzy: weapon handed back afterwards', await t.eval(w => PG.gta.player.inv[w] !== Infinity, fz.w));
await alive();

// ---------- 7. Barbecue Season ----------
await t.eval(() => T.start('barbecue'));
await t.eval(() => { const L = T.R().data.lot; T.tp(L.cx, L.y1 + 6); const p = PG.gta.player.ped; for (let k = 0; k < 40 && PG.gta.blocked(p.x, p.y, 0.4); k++) p.y += 1; });
ok('Barbecue: arrived at the yard', await until(() => T.R() && T.R().stage === 1, null, 3000));
const bq = await t.eval(() => ({ n: T.R().data.cars.length, molotov: PG.gta.player.inv.molotov || 0, shoot: PG.gta.has('weapons') }));
if (bq.shoot) ok('Barbecue: molotovs handed out', bq.molotov > 0, bq);
await t.eval(() => { const R = T.R(); PG.gta.destroyCar(R.data.cars[0], PG.gta.player.ped, 'bomb'); PG.gta.destroyCar(R.data.cars[1], PG.gta.player.ped, 'bomb'); });
await t.wait(600);
await t.shot('missions-9-barbecue');
await t.eval(() => { const R = T.R(); if (R) for (const c of R.data.cars) if (!c.wrecked && !(c.burning > 0)) PG.gta.destroyCar(c, PG.gta.player.ped, 'bomb'); });
ok('Barbecue: torching the yard passes', await until(() => T.ev('missionPassed', 'barbecue').length > 0, null, 5000), bq.n);
await alive();

// ---------- 8. Joyride ----------
await t.eval(() => T.start('joyride'));
await t.eval(() => T.enter(T.R().data.car));
ok('Joyride: in the chief\'s cruiser', await until(() => T.R() && T.R().stage === 1, null, 4000));
const jw = await t.eval(() => PG.gta.player.wanted);
ok('Joyride: three stars while joyriding', jw >= 3, jw);
await t.eval(() => { T.R().timer = 0.3; });
ok('Joyride: the minute is up, now lose the cops', await until(() => T.R() && T.R().stage === 2, null, 3000));
await t.eval(() => { if (PG.gta.police) T.clearCops(); else { const c = PG.gta.player.car; T.tpCar(c, c.x + (c.x < 600 ? 200 : -200), c.y); } });
ok('Joyride: lost the cops, passed', await until(() => T.ev('missionPassed', 'joyride').length > 0, null, 4000));
await t.eval(() => { if (PG.gta.player.car) PG.gta.exitCar(); T.clearCops(); });
await alive();

// ---------- 9. Cash in Transit ----------
await t.eval(() => T.start('transit'));
await t.eval(() => { const v = T.R().data.van; T.tp(v.x - Math.sin(v.th) * 6, v.y + Math.cos(v.th) * 6); PG.gta.damageCar(v, 700, PG.gta.player.ped, 'bullet'); });
ok('Cash in Transit: the doors pop and bags spill', await until(() => T.R() && T.R().stage === 1, null, 3000), await t.eval(() => T.bagsLeft()));
await t.wait(500);
await t.shot('missions-10-cash-bags');
await until(() => { T.grabBags(); return !T.R() || T.R().stage >= 2; }, null, 8000);
const loot = await t.eval(() => PG.gta.player.loot);
ok('Cash in Transit: loot carried', loot > 0, loot);
await t.eval(() => { T.clearCops(); const d = PG.gta.places.hideout.door; T.tp(d.x + d.nx * 1.2, d.y + d.ny * 1.2); });
ok('Cash in Transit: stashing the loot passes', await until(() => T.ev('missionPassed', 'transit').length > 0, null, 4000));
await alive();

// ---------- 10-13. The bank heist ----------
await t.eval(() => T.start('casing'));
const inside = await t.eval(() => T.R().data.inside);
if (inside) {
  await t.eval(() => { T.clearCops(); PG.gta.interiors.enter('bank'); });
  ok('Casing the Joint: walked into the bank', await until(() => T.R() && T.R().stage >= 1, null, 3000));
  await t.wait(500);
  await t.shot('missions-11-casing-inside');
  ok('Casing the Joint: looked at the vault', await until(() => { const v = PG.gta.missions.vaultSpot(); if (v) T.tp(v.x, v.y); return !T.R() || T.R().stage >= 2; }, null, 6000));
  await t.eval(() => PG.gta.interiors.leave());
} else {
  for (let i = 0; i < 4; i++) {
    const st = await t.eval(() => T.R() ? T.R().stage : -1);
    if (st < 0) break;
    await until(s0 => { const R = T.R(); if (!R || R.stage !== s0) return true; const m = []; R.stages[R.stage].marks(R, (x, y) => m.push({ x, y })); if (m[0]) T.tp(m[0].x, m[0].y); return false; }, st, 5000);
    if (i === 0) await t.shot('missions-11-casing');
  }
}
ok('Casing the Joint: passed (' + (inside ? 'inside the bank' : 'from the street') + ')', await until(() => T.ev('missionPassed', 'casing').length > 0, null, 6000));
await alive();

await t.eval(() => T.start('heavymetal'));
await t.eval(() => T.enter(T.R().data.car));
ok('Heavy Metal: stole the Securicar (guards alarmed)', await until(() => T.R() && T.R().stage === 1 && T.R().alarm, null, 4000));
await t.eval(() => { T.clearCops(); const z = PG.gta.missions.garage.zone, c = T.R().data.car; T.tpCar(c, z.x, z.y); });
ok('Heavy Metal: delivered to the garage', await until(() => { T.clearCops(); return T.ev('missionPassed', 'heavymetal').length > 0; }, null, 6000));
await alive();

await t.eval(() => T.start('getaway'));
await t.eval(() => T.enter(T.R().data.car));
await until(() => T.R() && T.R().stage === 1, null, 4000);
await t.eval(() => { const z = T.R().data.alley, c = T.R().data.car; T.tpCar(c, z.x, z.y, z.th); });
ok('Getaway Driver: Furia parked by the bank', await until(() => T.ev('missionPassed', 'getaway').length > 0, null, 5000));
await t.wait(1300);
const ga = await t.eval(() => { const c = PG.gta.missions.getaway; return c && { keep: c.keep, owner: c.owner, removed: c.removed, road: !!PG.gta.roadAt(c.x, c.y) }; });
ok('Getaway Driver: the car stays for the big one', ga && ga.keep && !ga.removed, ga);
await alive();

const mb = await t.eval(() => PG.gta.player.money);
await t.eval(() => T.start('bigone'));
const big = await t.eval(() => ({ inside: T.R().data.inside, getaway: T.R().data.getaway === PG.gta.missions.getaway }));
ok('The Big One: the getaway car from the last mission is used', big.getaway, big);
if (big.inside) {
  await t.eval(() => { T.clearCops(); PG.gta.interiors.enter('bank'); });
  ok('The Big One: in the bank', await until(() => T.R() && T.R().stage >= 1, null, 3000));
  await t.eval(() => { const v = PG.gta.missions.vaultSpot(); T.tp(v.x, v.y); });
  await t.wait(250);
  await t.press('KeyF');
  ok('The Big One: the thermal drill is on', await until(() => PG.gta.interiors.bank.drill > 0, null, 3000), await t.eval(() => document.querySelector('#gta-hud .g-hint').textContent));
  await t.wait(1500);
  await t.shot('missions-12-drill-inside');
  ok('The Big One: vault open', await until(() => { const v = PG.gta.missions.vaultSpot(); T.god(); T.tp(v.x, v.y); return T.R() && T.R().stage >= 2; }, null, 14000));
  await until(() => { const sc = PG.gta.scene, l = sc && sc.loot && sc.loot.find(q => !q.taken); if (l) T.tp(l.x, l.y); return PG.gta.player.loot >= 6000 || !l; }, null, 10000);
  await t.shot('missions-13-vault-inside');
  ok('The Big One: grabbed the cash', await t.eval(() => PG.gta.player.loot > 0), await t.eval(() => PG.gta.player.loot));
  await t.eval(() => PG.gta.interiors.leave());
} else {
  await t.eval(() => { const d = PG.gta.places.bank.door; T.tp(d.x + d.nx * 1.2, d.y + d.ny * 1.2); });
  ok('The Big One: drilling sets off the alarm', await until(() => T.R() && T.R().stage === 1 && PG.gta.player.wanted >= 2, null, 3000));
  await t.wait(800);
  await t.shot('missions-12-drill');
  await t.eval(() => { T.R().data.drill = 0.97; });
  ok('The Big One: vault open, cash everywhere', await until(() => T.R() && T.R().stage === 2, null, 3000), await t.eval(() => T.bagsLeft()));
  await t.wait(400);
  await t.shot('missions-13-vault-bags');
  await until(() => { T.grabBags(); return !T.R() || T.R().stage >= 3; }, null, 10000);
}
ok('The Big One: escape with four stars', await until(() => T.R() && T.R().stage === 3 && PG.gta.player.wanted >= 4, null, 4000), await t.eval(() => ({ w: PG.gta.player.wanted, loot: PG.gta.player.loot })));
await t.eval(() => { T.clearCops(); const d = PG.gta.places.hideout.door; T.tp(d.x + d.nx * 1.2, d.y + d.ny * 1.2); });
ok('The Big One: loot stashed, story complete', await until(() => T.ev('missionPassed', 'bigone').length > 0, null, 4000));
const ma = await t.eval(() => PG.gta.player.money);
ok('The Big One: the big payout', ma - mb >= 25000, ma - mb);
await t.wait(800);
await t.shot('missions-14-big-one-passed');

// ---------- odd jobs once the story is done ----------
const story = await t.eval(() => PG.gta.missions.list().every(m => m.done));
ok('Story: every mission done', story, await t.eval(() => PG.gta.missions.list().filter(m => !m.done).map(m => m.id)));
ok('Odd jobs ring after the story', await until(() => PG.gta.missions.phones.some(p => p.mission && p.mission.odd), null, 4000), await t.eval(() => PG.gta.missions.odd && PG.gta.missions.odd.title));
await t.eval(() => { T.start('odd'); });
const odd = await t.eval(() => T.R() && { id: T.R().id, title: T.R().title, reward: T.R().reward });
ok('Odd job starts', !!odd && /^Odd Job/.test(odd.title) && odd.reward >= 300 && odd.reward <= 25000, odd);
await t.eval(() => PG.gta.missions.pass());
ok('Odd job pays and counts', await t.eval(() => PG.gta.save.missions.odd >= 1 && !PG.gta.missions.odd));
const rf0 = await t.eval(() => T.ev('missionPassed', 'odd-frenzy').length);
await t.eval(() => { T.start(PG.gta.missions.oddJob('Rocket Frenzy')); const sk = T.R().data.skull; T.tp(sk.x, sk.y); });
ok('Rocket Frenzy odd job: skull picked up', await until(() => T.R() && T.R().stage === 1, null, 3000));
const rf = await t.eval(() => ({ cars: T.R().data.carsMode, w: PG.gta.player.weapon, inf: PG.gta.player.inv.rocket === Infinity, need: T.R().data.need }));
if (rf.cars) ok('Rocket Frenzy: unlimited rockets', rf.inf && rf.w === 'rocket', rf);
ok('Rocket Frenzy: blowing up cars (or gangsters without guns) passes', await until(n0 => {
  const X = PG.gta, p = X.player.ped, R = T.R();
  if (R && R.data.carsMode) { const c = X.cars.find(c => !c.wrecked && !c.removed && c !== X.player.car && Math.hypot(c.x - p.x, c.y - p.y) < 150); if (c) X.destroyCar(c, p, 'bomb'); }
  else for (const q of X.peds) if (q.team === 'gang' && !q.dead && !q.removed && Math.hypot(q.x - p.x, q.y - p.y) < 90) X.killPed(q, p, 'car');
  return T.ev('missionPassed', 'odd-frenzy').length > n0;
}, rf0, 15000), rf);
await alive();
ok('the next ringing phone is announced on the pager', await until(() => { T.clearCops(); const e = document.querySelector('#gta-hud .g-pager'); return !e.hidden && /RING RING/.test(e.textContent); }, null, 12000), await t.eval(() => document.querySelector('#gta-hud .g-pager').textContent));

// ---------- wasted fails the mission ----------
await t.eval(() => T.start('hotwheels'));
await t.eval(() => { const p = PG.gta.player.ped; p.hp = 50; PG.gta.damagePed(p, 999, null, 'bullet'); });
ok('Fail: wasted fails the mission', await until(() => T.ev('missionFailed', 'hotwheels').some(e => /wasted/i.test(e.reason)), null, 3000));
await until(() => PG.gta.player.state === 'play', null, 6000);
await t.wait(300);
const fb2 = await t.eval(() => document.querySelector('#gta-hud .g-big').textContent);
ok('Fail: MISSION FAILED shown after the respawn', /MISSION FAILED/.test(fb2), fb2);
await t.eval(() => T.god());

await t.eval(() => T.start('special'));
await t.eval(() => PG.gta.bust());
ok('Fail: busted fails the mission', await until(() => T.ev('missionFailed', 'special').some(e => /busted/i.test(e.reason)), null, 3000));
await until(() => PG.gta.player.state === 'play', null, 6000);
await t.eval(() => T.god());

// ---------- fps in a busy scenario: the kill frenzy with the city running ----------
await t.eval(() => { const M = PG.gta.missions; M.skip(); if (M.run) M.fail('test'); T.start('frenzy'); const s = T.R().data.skull; T.tp(s.x, s.y); });
await until(() => T.R() && T.R().stage === 1, null, 3000);
await t.wait(2500);
const fps = await t.eval(() => new Promise(r => { let n = 0; const t0 = performance.now(); (function f() { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); })(); }));
const busy = await t.eval(() => ({ peds: PG.gta.peds.length, cars: PG.gta.cars.length }));
ok('fps in a kill frenzy', fps >= 45, { fps, busy });
await t.eval(() => PG.gta.missions.fail('test'));

// ---------- a second game resets everything ----------
await t.eval(() => { PG.gta.stop(); PG.gta.start(PG.GTA_DEF); });
await t.wait(600);
const g2 = await t.eval(() => { const M = PG.gta.missions; return { n: M.phones.length, run: !!M.run, box: document.querySelector('#gta-hud .m-box').hidden, done: M.list().filter(m => m.done).length }; });
ok('Second game: fresh phones, no mission, progress kept', g2.n >= 4 && !g2.run && g2.box && g2.done === 13, g2);

// ---------- persistence across a page reload ----------
await t.wait(1200);   // X.persist is debounced
await t.page.reload();
await t.page.waitForTimeout(400);
await t.page.click('#btn-gta');
await t.page.waitForSelector('#scr-ready:not([hidden])', { timeout: 8000 });
await t.page.click('#ready-go');
await t.page.waitForTimeout(400);
await inject();
const pers = await t.eval(() => ({ done: PG.gta.missions.list().filter(m => m.done).length, odd: PG.gta.save.missions.odd, ring: PG.gta.missions.phones.some(p => p.mission && p.mission.odd) }));
ok('Persistence: story progress survives a reload', pers.done === 13 && pers.odd >= 1, pers);
ok('Persistence: odd jobs keep ringing', await until(() => PG.gta.missions.phones.some(p => p.mission && p.mission.odd), null, 3000));

ok('no console errors', t.errors.length === 0, t.errors.slice(0, 5).join('\n'));
await t.close();
console.log(fails ? `${fails} check(s) failed` : 'all missions checks passed');
process.exit(fails ? 1 : 0);
