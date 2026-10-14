// Jobs test: the job fleet (taxi, bus, ambulance, fire truck near the start, ambulance at the hospital, fire
// truck downtown), the G hint and start/stop, Taxi (a waving fare, boarding, a crash-happy driver losing the
// fare, a paid ride with the streak bonus), leaving the vehicle ends the job, no jobs during a mission, Bus
// Route (shelters, boarding, alighting, timetable bonus, a whole route), Paramedic (siren, loading, delivery,
// level up), Firefighter (the water cannon puts out a car fire and bowls a pedestrian over, no drive-by
// shots), Vigilante (a fleeing suspect, boxed in and arrested, then wrecked without a wanted level), the job
// vehicle blowing up, pause, fps while hosing, a second game and screenshots.
// Usage: node tests/jobs.test.mjs <built.html> <screenshot dir>
import { launch } from './harness.mjs';

const t = await launch({ html: process.argv[2], out: process.argv[3] });
let fails = 0;
const ok = (name, cond, info) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info !== undefined ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`);
  if (!cond) fails++;
};
const until = async (fn, ms, arg) => { const t0 = Date.now(); for (;;) { const v = await t.eval(fn, arg); if (v || Date.now() - t0 > ms) return v; await t.wait(80); } };
const fpsOf = ms => t.eval(ms => new Promise(r => { let n = 0; const t0 = performance.now(); (function f() { n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else r(Math.round(n / (ms / 1000))); })(); }), ms);

// ---- in-page helpers (on window, so they survive a second game) ----
const setup = () => t.eval(() => {
  const X = PG.gta, P = X.player;
  window.JT = {
    ev: [], money: [],
    run: () => X.jobs.run,
    fleet: m => X.jobs.fleet.find(c => c.model.id === m && !c.removed && !c.wrecked),
    seat(c) {
      if (P.car && P.car !== c) X.exitCar();
      const fx = Math.cos(c.th), fy = Math.sin(c.th);
      P.ped.x = c.x + fy * (c.wid / 2 + 0.45) + fx * 0.3; P.ped.y = c.y - fx * (c.wid / 2 + 0.45) + fy * 0.3; P.ped.vx = P.ped.vy = 0;
      X.enterCar(c); window.JC = c; return c.id;
    },
    behind(k, d) { const tx = Math.cos(k.th), ty = Math.sin(k.th); X.placeCar(P.car, k.rx - tx * d, k.ry - ty * d, k.th); },
    hint() { const e = document.querySelector('#gta-hud .j-hint'); return e && !e.hidden ? e.textContent : ''; },
    box() { const e = document.querySelector('#gta-hud .j-box'); return e && !e.hidden ? e.textContent : ''; },
    quiet() { if (X.police) { const T = X.police.tune; T.maxCars = 0; T.maxCops = 0; T.patrolCars = 0; T.patrolFoot = 0; X.police.clear(); } },
  };
  if (!window.JTL) {
    window.JTL = true;
    for (const ev of ['jobStart', 'jobEnd', 'jobPaid', 'jobDoused']) X.on(ev, e => JT.ev.push(Object.assign({ ev, t: +X.time.toFixed(2) }, e, { car: e.car ? e.car.id : undefined })));
    X.on('carDestroyed', e => JT.ev.push({ ev: 'carDestroyed', t: +X.time.toFixed(2), car: e.car.id }));
    X.on('money', e => JT.money.push(e));
  }
  return { mods: X.modules.map(m => m.name), start: { x: P.ped.x, y: P.ped.y } };
});
const info = await setup();
console.log('modules', info.mods.join(','));
await t.eval(() => JT.quiet());

// ---------- 1. the fleet ----------
const fl = await t.eval(s => {
  const X = PG.gta, C = X.city, out = {};
  for (const c of X.jobs.fleet) (out[c.model.id] = out[c.model.id] || []).push({ d: Math.round(Math.hypot(c.x - s.x, c.y - s.y)), keep: c.keep, label: c.jobFleet, hosp: X.places.hospital ? Math.round(Math.hypot(c.x - X.places.hospital.door.x, c.y - X.places.hospital.door.y)) : -1, mid: Math.round(Math.hypot(c.x - C.W / 2, c.y - C.H / 2)) });
  return out;
}, info.start);
const near = m => (fl[m] || []).some(o => o.d < 130 && o.keep);
ok('taxi, bus, ambulance and fire truck parked near the start', near('taxi') && near('bus') && near('ambulance') && near('firetruck'), fl);
ok('an ambulance waits at the hospital', (fl.ambulance || []).some(o => o.hosp >= 0 && o.hosp < 90), fl.ambulance);
ok('a fire truck waits downtown', (fl.firetruck || []).some(o => o.mid < 220), fl.firetruck);
const overlaps = await t.eval(() => { const X = PG.gta; let n = 0; for (const c of X.jobs.fleet) { const pc = X.carPoly(c); for (const s of PG.cityNear(X.city, c.x, c.y, c.len)) if (PG.overlap(pc, s.poly)) n++; for (const o of X.cars) if (o !== c && !o.removed && Math.hypot(o.x - c.x, o.y - c.y) < 14 && PG.overlap(pc, X.carPoly(o))) n++; } return n; });
ok('fleet parked clear of buildings and cars', overlaps === 0, overlaps);
await t.eval(() => { const X = PG.gta, c = JT.fleet('bus'); X.player.ped.x = c.x - Math.sin(c.th) * 6; X.player.ped.y = c.y + Math.cos(c.th) * 6; });
await t.wait(700);
await t.shot('jobs-01-fleet');

// ---------- 2. taxi ----------
await t.eval(() => JT.seat(JT.fleet('taxi')));
ok('in the taxi', await until(() => PG.gta.player.car === window.JC, 3000));
await t.wait(150);
ok('hint: G: start Taxi job', (await t.eval(() => JT.hint())) === 'G: start Taxi job' && (await t.eval(() => PG.gta.jobs.hint)) === 'G: start Taxi job', await t.eval(() => JT.hint()));
await t.press('KeyG');
const a1 = await t.eval(() => PG.gta.jobs.active);
ok('G starts the taxi job', a1 && a1.id === 'taxi', a1);
await t.wait(150);
ok('job HUD shows TAXI DRIVER, hint gone', /TAXI DRIVER/.test(await t.eval(() => JT.box())) && !(await t.eval(() => JT.hint())), await t.eval(() => JT.box()));
const f1 = await until(() => { const J = JT.run(), f = J && J.d.fare; return f && { d: Math.round(Math.hypot(f.x - J.car.x, f.y - J.car.y)), owner: f.ai.owner, side: !!PG.gta.blockAt(f.x, f.y) }; }, 6000);
ok('a fare appears at the kerb nearby', f1 && f1.d >= 40 && f1.d <= 160 && f1.owner === 'jobs' && f1.side, f1);
await t.eval(() => JT.behind(JT.run().d.kerb, 11));
await t.wait(700);
ok('the fare waves at the taxi', await t.eval(() => JT.run().d.fare.pose === 'wave'));
await t.shot('jobs-02-taxi-fare');
await t.eval(() => JT.behind(JT.run().d.kerb, 0));
const r1 = await until(() => { const J = JT.run(); return J.d.stage === 'ride' && { hidden: J.d.fare.hidden, dest: J.d.dest.name, timer: Math.round(J.timer), len: Math.round(J.d.len) }; }, 8000);
ok('the fare walks over and gets in', r1 && r1.hidden && r1.timer > 10 && !!r1.dest, r1);
await t.wait(300);
await t.shot('jobs-03-taxi-ride');
// a crash-happy driver: the fare bails out
const bailed = await t.eval(() => {
  const X = PG.gta, J = JT.run(); J.d.type = Object.assign({}, J.d.type, { temper: 1 });
  const f = J.d.fare; for (let k = 0; k < 3; k++) X.emit('carImpact', { car: J.car, speed: 16 });
  return { stage: J.d.stage, hidden: f.hidden, streak: J.streak, fare: !!J.d.fare };
});
ok('crashing makes the fare bail out', bailed.stage === 'seek' && !bailed.hidden && !bailed.fare, bailed);
// a proper ride, with a 4-fare streak going in
const f2 = await until(() => !!JT.run().d.fare, 8000);
await t.eval(() => JT.behind(JT.run().d.kerb, 0));
const r2 = await until(() => JT.run().d.stage === 'ride', 8000);
ok('second fare boards', f2 && r2);
const m0 = await t.eval(() => { const J = JT.run(); J.streak = 4; JT.money = []; return PG.gta.player.money; });
await t.eval(() => { const X = PG.gta, d = JT.run().d.dest; X.placeCar(X.player.car, d.rx, d.ry, d.th); });
const paid = await until(() => { const J = JT.run(); return J.count === 1 && { count: J.count, earned: J.earned, streak: J.streak, stage: J.d.stage, money: PG.gta.player.money, reasons: JT.money.map(m => m.reason) }; }, 5000);
ok('drop-off pays fare + tip', paid && paid.money > m0 && paid.earned > 0 && paid.stage === 'seek', paid);
ok('five in a row pays the streak bonus', paid && paid.streak === 5 && paid.reasons.some(r => /streak/.test(r)), paid && paid.reasons);
await t.wait(250);
await t.shot('jobs-04-taxi-paid');
await t.press('KeyG');
const st1 = await t.eval(() => ({ a: PG.gta.jobs.active, box: JT.box(), rec: PG.gta.jobs.records.taxi, end: JT.ev.filter(e => e.ev === 'jobEnd').pop() }));
ok('G again ends the shift, record saved', !st1.a && !st1.box && st1.rec && st1.rec.best >= 1 && st1.rec.shifts >= 1, st1);

// ---------- 3. leaving the vehicle ends the job ----------
await t.press('KeyG');
ok('taxi job restarted', (await t.eval(() => PG.gta.jobs.active && PG.gta.jobs.active.id)) === 'taxi');
await t.eval(() => PG.gta.exitCar());
await t.wait(200);
const lv = await t.eval(() => ({ a: PG.gta.jobs.active, car: !!PG.gta.player.car, end: JT.ev.filter(e => e.ev === 'jobEnd').pop() }));
ok('getting out ends the job', !lv.a && !lv.car && /left/i.test(lv.end && lv.end.reason), lv);

// ---------- 4. no side jobs while Artur has you on a mission ----------
await t.eval(() => JT.seat(JT.fleet('taxi')));
await until(() => PG.gta.player.car === window.JC, 3000);
await t.eval(() => { window.realMissions = PG.gta.missions; PG.gta.missions = { active: { id: 'test', title: 'Test' } }; });
await t.wait(100);
await t.press('KeyG');
const mb = await t.eval(() => ({ a: PG.gta.jobs.active, hint: JT.hint() }));
ok('no job (and no hint) during a mission', !mb.a && !mb.hint, mb);
await t.eval(() => { PG.gta.missions = window.realMissions; });
await t.press('KeyG');
const mb2 = await t.eval(() => !!PG.gta.jobs.active);
await t.eval(() => { PG.gta.missions = { active: { id: 'test', title: 'Test' } }; });
await t.wait(200);
const mb3 = await t.eval(() => ({ a: PG.gta.jobs.active, end: JT.ev.filter(e => e.ev === 'jobEnd').pop() }));
await t.eval(() => { PG.gta.missions = window.realMissions; });
ok('a mission starting ends the job', mb2 && !mb3.a, mb3);

// ---------- 5. bus route ----------
await t.eval(() => JT.seat(JT.fleet('bus')));
ok('in the bus', await until(() => PG.gta.player.car === window.JC, 3000));
await t.press('KeyG');
const b0 = await t.eval(() => { const J = JT.run(); return J && { id: J.id, n: J.d.stops.length, num: J.d.num, names: J.d.stops.map(s => s.name), onSide: J.d.stops.every(s => !!PG.gta.blockAt(s.x, s.y) && !PG.gta.blocked(s.x, s.y, 0.5)) }; });
ok('G starts a bus route with 4-6 stops on the sidewalk', b0 && b0.id === 'bus' && b0.n >= 4 && b0.n <= 6 && b0.onSide, b0);
await t.eval(() => { const J = JT.run(), st = J.d.stops[0]; JT.behind({ rx: st.rx, ry: st.ry, th: st.th }, 15); });
await t.wait(900);
const q0 = await t.eval(() => JT.run().d.stops[0].waiting.length);
ok('people wait at the first stop', q0 >= 1, q0);
await t.shot('jobs-05-bus-stop');
const mb0 = await t.eval(() => { JT.money = []; return PG.gta.player.money; });
await t.eval(() => { const J = JT.run(), st = J.d.stops[0]; JT.behind({ rx: st.rx, ry: st.ry, th: st.th }, 0); });
ok('doors open at the stop', await until(() => JT.run().d.phase === 'dwell', 3000));
await t.wait(900);
await t.shot('jobs-06-bus-doors');
const bs1 = await until(() => { const J = JT.run(); return J.d.next === 1 && { aboard: J.d.aboard.length, pax: J.d.passengers, onTime: J.d.onTime, money: PG.gta.player.money, reasons: JT.money.map(m => m.reason) }; }, 9000);
ok('passengers board and pay, on-time bonus', bs1 && bs1.pax >= 1 && bs1.aboard >= 1 && bs1.onTime === 1 && bs1.money > mb0 && bs1.reasons.some(r => /ticket/.test(r)), bs1);
await t.eval(() => { PG.gta.jobs.tune.busDwell = 0.5; });
let lastNext = 1;
for (let k = 1; k < b0.n; k++) {
  await t.eval(() => { const J = JT.run(), st = J.d.stops[J.d.next]; JT.behind({ rx: st.rx, ry: st.ry, th: st.th }, 0); });
  const r = await until(k => { const J = JT.run(); return J && (J.d.next > k || J.count >= 1); }, 9000, k);
  if (!r) break;
  lastNext = k + 1;
}
const bdone = await t.eval(() => { const J = JT.run(); return J && { count: J.count, level: J.level, alighted: J.alighted || 0, newStops: J.d.stops.length, earned: J.earned, aboard: J.d.aboard.length, hidden: PG.gta.jobs.mine.filter(p => p.hidden).length }; });
ok('every stop served, route bonus, next route', lastNext === b0.n && bdone && bdone.count === 1 && bdone.level === 2 && bdone.newStops >= 3, { lastNext, bdone });
ok('passengers got off at their stops (nobody left inside)', bdone && bdone.alighted >= 1 && bdone.aboard === 0 && bdone.hidden === 0, bdone);
await t.eval(() => { PG.gta.jobs.tune.busDwell = 2; });
await t.press('KeyG');

// ---------- 6. paramedic ----------
await t.eval(() => JT.seat(JT.fleet('ambulance')));
ok('in the ambulance', await until(() => PG.gta.player.car === window.JC, 3000));
await t.press('KeyH');
const sir = await t.eval(() => PG.gta.player.car.siren);
await t.press('KeyH');
ok('H toggles the siren', sir === true && (await t.eval(() => PG.gta.player.car.siren)) === false);
await t.press('KeyG');
const p0 = await t.eval(() => { const J = JT.run(); return J && { id: J.id, pats: J.d.pats.map(q => ({ st: q.st, pose: q.p.pose, life: Math.round(q.life) })) }; });
ok('G starts paramedic: a casualty lies on the pavement', p0 && p0.id === 'medic' && p0.pats.length === 1 && p0.pats[0].pose === 'lie' && p0.pats[0].life > 30, p0);
await t.eval(() => JT.behind(JT.run().d.pats[0].k, 14));
await t.wait(600);
await t.shot('jobs-07-medic-patient');
await t.eval(() => JT.behind(JT.run().d.pats[0].k, 0));
await t.wait(800);
await t.shot('jobs-08-medic-loading');
ok('the patient climbs into the back', await until(() => JT.run().d.pats[0].st === 'aboard', 9000));
const hp0 = await t.eval(() => { const P = PG.gta.player; P.ped.hp = 50; JT.money = []; return P.money; });
await t.eval(() => { const X = PG.gta, h = JT.run().d.hosp; X.placeCar(X.player.car, h.rx, h.ry, h.th); });
const dl = await until(() => { const J = JT.run(); return J.count === 1 && { count: J.count, level: J.level, money: PG.gta.player.money, hp: PG.gta.player.ped.hp, max: PG.gta.player.ped.maxHp }; }, 4000);
ok('delivered to St. Bussby: paid, level 2, health topped up', dl && dl.money > hp0 && dl.level === 2 && dl.hp === dl.max, dl);
await t.wait(300);
await t.shot('jobs-09-medic-delivered');
await t.press('KeyG');

// ---------- 7. firefighter ----------
await t.eval(() => JT.seat(JT.fleet('firetruck')));
ok('in the fire truck', await until(() => PG.gta.player.car === window.JC, 3000));
ok('hint mentions the water cannon', /start Firefighter job/.test(await t.eval(() => JT.hint())), await t.eval(() => JT.hint()));
await t.press('KeyG');
const ff = await until(() => { const J = JT.run(); if (!J || !J.d.fires.length) return null; window.JF = J.d.fires[0].c; return J.d.fires.map(f => ({ id: f.c.id, m: f.c.model.id, burning: Math.round(f.c.burning), d: Math.round(Math.hypot(f.c.x - J.car.x, f.c.y - J.car.y)) })); }, 4000);
ok('a car is on fire somewhere', ff && ff.length >= 1 && ff[0].burning > 20, ff);
await t.wait(300);
const ff2 = await t.eval(() => ({ burning: window.JF.burning, hp: window.JF.hp, fires: JT.run().d.fires.length, ev: JT.ev.slice(-4) }));
ok('...and keeps burning until someone comes', ff2.burning > 20 && ff2.fires >= 1, ff2);
const guns = await t.eval(() => { const X = PG.gta, P = X.player; if (!X.giveWeapon) return null; X.giveWeapon('pistol', 30); P.weapon = 'pistol'; return P.inv.pistol; });
const victim = await t.eval(() => {
  const X = PG.gta, o = window.JF, tx = Math.cos(o.th), ty = Math.sin(o.th);
  X.placeCar(X.player.car, o.x - tx * (o.len / 2 + 9), o.y - ty * (o.len / 2 + 9), o.th);
  const p = X.makePed({ x: o.x - tx * (o.len / 2 + 2.5), y: o.y - ty * (o.len / 2 + 2.5), ai: { owner: 'test' } });
  window.JV = p; return p.id;
});
await t.wait(1000);   // let the title card clear for the screenshot
await t.page.keyboard.down('ControlLeft');
await t.wait(450);
await t.shot('jobs-10-fire-hose');
await t.wait(250);
const spray = await t.eval(() => ({ on: PG.gta.jobs.jet.on, drops: PG.gta.jobs.drops(), knock: window.JV.knock, soak: window.JF.jobWater }));
const out = await until(() => !(window.JF.burning > 0), 7000);
await t.page.keyboard.up('ControlLeft');
const fo = await t.eval(() => { const J = JT.run(); return { count: J.count, earned: J.earned, level: J.level, ammo: PG.gta.player.inv.pistol }; });
ok('the water cannon sprays (jet + drops)', spray.on && spray.drops > 20, spray);
ok('the jet bowls a pedestrian over', spray.knock > 0, spray);
ok('the fire goes out and pays', out && fo.count >= 1 && fo.earned > 0, fo);
ok('fire button is the hose, not a drive-by', guns == null || fo.ammo === guns, { guns, after: fo.ammo });
await t.wait(400);
await t.shot('jobs-11-fire-out');
await t.press('KeyG');

// ---------- 8. vigilante ----------
await t.eval(() => { const X = PG.gta, P = X.player; if (P.car) X.exitCar(); const c = X.makeCar('police', P.ped.x, P.ped.y, P.car ? 0 : 0, { ctrl: 'parked' }); const q = X.nearestRoadPoint(P.ped.x, P.ped.y); X.placeCar(c, q.x, q.y, q.horiz ? 0 : Math.PI / 2); JT.seat(c); });
ok('in a police car', await until(() => PG.gta.player.car === window.JC, 3000));
await t.eval(() => JT.quiet());
await t.press('KeyG');
const v0 = await until(() => { const J = JT.run(), tg = J && J.d.target; return tg && { m: tg.model.id, x: tg.x, y: tg.y, ai: tg.ai && tg.ai.owner, desc: J.d.desc }; }, 5000);
ok('G starts vigilante: a suspect car appears', v0 && v0.ai === 'jobs', v0);
await t.wait(2500);
const v1 = await t.eval(v => { const tg = JT.run().d.target; return tg && { moved: Math.round(Math.hypot(tg.x - v.x, tg.y - v.y)), speed: Math.round(tg.speed) }; }, v0);
ok('the suspect drives off', v1 && v1.moved > 8, v1);
await t.eval(() => { const X = PG.gta, J = JT.run(), tg = J.d.target, c = J.car; X.placeCar(tg, c.x + Math.cos(c.th) * 16, c.y + Math.sin(c.th) * 16, c.th); });
await t.wait(500);
await t.shot('jobs-12-vigil-suspect');
await t.eval(() => { const X = PG.gta, J = JT.run(), tg = J.d.target, c = J.car; X.placeCar(tg, c.x + Math.cos(c.th) * 8, c.y + Math.sin(c.th) * 8, c.th); tg.ai.drive = () => ({ hand: true }); });
const ar = await until(() => { const J = JT.run(); return J.count === 1 && { count: J.count, level: J.level, earned: J.earned, perps: PG.gta.jobs.mine.filter(p => p.ai.role === 'perp' && !p.dead).map(p => p.pose) }; }, 5000);
ok('boxed in: suspect arrested, hands up', ar && ar.level === 2 && ar.perps.length >= 1 && ar.perps.every(p => p === 'surrender' || p === 'kneel'), ar);
await t.wait(400);
await t.shot('jobs-13-vigil-arrest');
const v2 = await until(() => !!JT.run().d.target, 8000);
await t.eval(() => JT.quiet());
await t.eval(() => { const X = PG.gta, J = JT.run(), tg = J.d.target, c = J.car; X.placeCar(tg, c.x + Math.cos(c.th) * 30, c.y + Math.sin(c.th) * 30, c.th); X.damageCar(tg, 1e6, X.player.ped, 'bullet'); });
const td = await until(() => { const J = JT.run(); return J && J.count === 2 && { count: J.count, wanted: PG.gta.player.wanted }; }, 8000);
ok('wrecked suspect counts (dead or alive)', v2 && td && td.count === 2, td);
ok('taking down a suspect is not a crime', td && td.wanted === 0, td);
await t.press('KeyG');

// ---------- 9. the job vehicle blows up ----------
await t.eval(() => { const X = PG.gta, P = X.player; if (P.car) X.exitCar(); const q = X.nearestRoadPoint(P.ped.x + 30, P.ped.y); const c = X.makeCar('taxi', q.x, q.y, q.horiz ? 0 : Math.PI / 2, { ctrl: 'parked' }); JT.seat(c); });
await until(() => PG.gta.player.car === window.JC, 3000);
await t.press('KeyG');
const tx0 = await t.eval(() => !!PG.gta.jobs.active);
await t.eval(() => PG.gta.damageCar(PG.gta.player.car, 1e6, null, 'crash'));
const boom = await until(() => !PG.gta.jobs.active && { end: JT.ev.filter(e => e.ev === 'jobEnd').pop() }, 8000);
ok('the job ends when the vehicle is destroyed', tx0 && boom, boom);
await until(() => PG.gta.player.state === 'play' && PG.gta.player.ped.hp > 0, 6000);
await t.wait(300);
const amb = await t.eval(() => { const X = PG.gta, h = X.places.hospital.door; return X.cars.some(c => !c.removed && !c.wrecked && c.model.kind === 'ambulance' && Math.hypot(c.x - h.x, c.y - h.y) < 150); });
ok('an ambulance stands by at the hospital', amb);

// ---------- 10. pause, and fps while hosing in traffic ----------
await t.eval(() => { const X = PG.gta, P = X.player; if (P.car) X.exitCar(); const q = X.nearestRoadPoint(P.ped.x + 20, P.ped.y + 20); const c = X.makeCar('firetruck', q.x, q.y, q.horiz ? 0 : Math.PI / 2, { ctrl: 'parked' }); JT.seat(c); });
await until(() => PG.gta.player.car === window.JC, 3000);
await t.press('KeyG');
await until(() => { const J = JT.run(); return J && J.d.fires.length; }, 4000);
const pz = await t.eval(async () => { const J = JT.run(), c = J.d.fires[0].c, b0 = c.burning; PG.pause(true); await new Promise(r => setTimeout(r, 700)); const b1 = c.burning; PG.pause(false); return { b0, b1, status: PG.game.status }; });
ok('pause freezes the job', pz.b0 === pz.b1 && pz.status === 'play', pz);
await t.eval(() => { const X = PG.gta, J = JT.run(), o = J.d.fires[0].c, tx = Math.cos(o.th), ty = Math.sin(o.th); X.placeCar(X.player.car, o.x - tx * (o.len / 2 + 9), o.y - ty * (o.len / 2 + 9), o.th); for (let k = 0; k < 12; k++) X.makePed({ x: o.x - tx * 6 + (k % 4 - 1.5) * 2, y: o.y - ty * 6 + (k >> 2) * 2 - 2 }); });
await t.page.keyboard.down('ControlLeft');
await t.wait(300);
const fps = await fpsOf(2000);
await t.page.keyboard.up('ControlLeft');
const busy = await t.eval(() => ({ cars: PG.gta.cars.length, peds: PG.gta.peds.length, drops: PG.gta.jobs.drops(), parts: PG.game.particles.length }));
ok('fps while hosing a fire in traffic', fps >= 40, { fps, busy });
await t.press('KeyG');

// ---------- 11. a second game ----------
await t.eval(() => { const X = PG.gta; X.stop(); X.start(PG.GTA_DEF); });
await t.wait(400);
const g2 = await t.eval(() => { const X = PG.gta; return { a: X.jobs.active, fleet: X.jobs.fleet.map(c => c.model.id), mine: X.jobs.mine.length, box: JT.box(), rec: X.jobs.records.taxi }; });
ok('second game: fresh fleet, no job, records kept', !g2.a && ['taxi', 'bus', 'ambulance', 'firetruck'].every(m => g2.fleet.includes(m)) && g2.mine === 0 && !g2.box && g2.rec && g2.rec.best >= 1, g2);
await t.eval(() => JT.seat(JT.fleet('taxi')));
await until(() => PG.gta.player.car === window.JC, 3000);
await t.press('KeyG');
ok('second game: taxi job starts', (await t.eval(() => PG.gta.jobs.active && PG.gta.jobs.active.id)) === 'taxi');
await t.press('KeyG');

ok('no console errors', t.errors.length === 0, t.errors.slice(0, 5));
console.log(fails ? `${fails} check(s) failed` : 'all jobs checks passed');
await t.close();
process.exit(fails ? 1 : 0);
