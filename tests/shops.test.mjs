// Shops test: Pay 'n' Spray (free first spray, paid auto-random spray, refusals, "they saw you" at 5 stars,
// car bomb purchase), remote and fused car bombs, export and crusher (pay, removal, bomb in the crusher),
// Artur's Garage (saved and respawned next game), a second game, pause, fps and screenshots.
// Usage: node tests/shops.test.mjs <built.html> <screenshot dir>
import { launch, fpsSkip } from './harness.mjs';

const t = await launch({ html: process.argv[2], out: process.argv[3] });
let fails = 0;
const ok = (name, cond, info) => {
  if (fpsSkip(name, cond, info)) return;
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${info !== undefined ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`);
  if (!cond) fails++;
};
const until = async (fn, ms, arg) => { const t0 = Date.now(); for (;;) { const v = await t.eval(fn, arg); if (v || Date.now() - t0 > ms) return v; await t.wait(80); } };

// ---- in-page helpers (they survive stop/start: they live on window) ----
const setup = () => t.eval(() => {
  const X = PG.gta, P = X.player;
  window.TT = {
    events: [],
    pose(shop, u, v) { const fr = shop === 'garage' ? X.shops.garage.fr : X.shops[shop].fr; return { x: fr.F.x + fr.T.x * u + fr.n.x * v, y: fr.F.y + fr.T.y * u + fr.n.y * v, th: Math.atan2(fr.T.y, fr.T.x) }; },
    car(model, shop, o) { const q = TT.pose(shop, 0, shop === 'garage' ? 3.3 : 3.4); const c = X.makeCar(model, q.x, q.y, q.th, Object.assign({ ctrl: 'parked' }, o)); window.TC = c; return c.id; },
    seat(c) {
      c = c || window.TC;
      if (P.car && P.car !== c) X.exitCar();
      const fx = Math.cos(c.th), fy = Math.sin(c.th);
      P.ped.x = c.x + fy * (c.wid / 2 + 0.45) + fx * 0.3; P.ped.y = c.y - fx * (c.wid / 2 + 0.45) + fy * 0.3; P.ped.vx = P.ped.vy = 0;
      X.enterCar(c);
    },
    // drive off the pad and back on (a fresh visit)
    revisit(c) { c = c || window.TC; const q = TT.pose('spray', 0, 3.4), fr = X.shops.spray.fr; X.placeCar(c, q.x + fr.n.x * 18, q.y + fr.n.y * 18, q.th); setTimeout(() => X.placeCar(c, q.x, q.y, q.th), 350); },
    out() { if (P.car) X.exitCar(); },
    foot(shop, d) { const q = TT.pose(shop, 0, d); if (P.car) X.exitCar(); P.ped.x = q.x; P.ped.y = q.y; P.ped.vx = P.ped.vy = 0; },
    wanted(n) { if (X.police && X.police.setWanted) { if (n) X.police.setWanted(n); else X.police.clear(); } else P.wanted = n; },
    offer() { const e = document.querySelector('#gta-hud .s-offer'); return e && !e.hidden ? e.textContent : ''; },
    picker() { const e = document.querySelector('#gta-hud .s-pick'); return !!e && !e.hidden; },
    bombChip() { const e = document.querySelector('#gta-hud .s-bomb'); return e && !e.hidden ? e.textContent : ''; },
    ev(name, id) { return TT.events.filter(e => e.ev === name && (id == null || e.id === id)); },
    onPad(c) {
      for (const k of ['spray', 'crusher', 'garage']) {
        const sh = X.shops[k]; if (!sh) continue;
        const fr = sh.fr, dx = c.x - fr.F.x, dy = c.y - fr.F.y, u = dx * fr.T.x + dy * fr.T.y, v = dx * fr.n.x + dy * fr.n.y;
        if (Math.abs(u) < 3.6 && v > 0.5 && v < 6) return k;
      }
      return null;
    },
  };
  if (!window.TTL) {
    window.TTL = true;
    for (const ev of ['carSprayed', 'carRepaired', 'carSold', 'explosion', 'carBomb']) X.on(ev, e => TT.events.push({ ev, id: e.car ? e.car.id : e.source ? e.source.id : null, price: e.price, export: e.export }));
  }
  return { spray: !!X.shops.spray, crusher: !!X.shops.crusher, garage: !!X.shops.garage, list: X.shops.exportList.models, mods: X.modules.map(m => m.name) };
});

const info = await setup();
console.log('modules', info.mods.join(','));
ok('shops set up (spray, crusher, garage, export list)', info.spray && info.crusher && info.garage && info.list.length === 3, info);
const police = info.mods.includes('police');
if (police) await t.eval(() => { const T = PG.gta.police.tune; T.maxCars = 0; T.maxCops = 0; T.patrolCars = 0; T.patrolFoot = 0; });   // keep the cops out of the way of the shop tests

const parkedOnPads = await t.eval(() => PG.gta.cars.filter(c => !c.removed && c.ctrl === 'parked' && !c.dv && TT.onPad(c)).map(c => TT.onPad(c)));
ok('no kerbside parked cars on the pads', parkedOnPads.length === 0, parkedOnPads);

// ---------- the shop at rest ----------
await t.eval(() => { TT.foot('spray', 10); PG.gta.player.money = 0; });
await t.wait(700);
await t.shot('shops-1-spray-idle');
const hintFoot = await t.eval(() => { TT.foot('spray', 4); return null; });
await t.wait(250);
ok('on-foot hint at the spray pad', /Pay 'n' Spray prices/i.test(await t.eval(() => document.querySelector('#gta-hud .g-hint').textContent)), await t.eval(() => document.querySelector('#gta-hud .g-hint').textContent));

// ---------- spray 1: free, chosen colour, repaired, wanted cleared ----------
const s1 = await t.eval(() => { const X = PG.gta; TT.car('hatch', 'spray'); X.damageCar(TC, 380, null, 'crash'); TC.burning = 0; TT.wanted(3); TT.seat(); return { id: TC.id, hp: TC.hp, max: TC.maxHp, color: TC.color }; });
const inPick = await until(() => PG.gta.shops.spray.phase === 'pick', 4000);
ok('booth closes and the picker opens', inPick && await t.eval(() => TT.picker()));
ok('wanted cleared when the door shuts', await t.eval(() => PG.gta.player.wanted === 0));
await t.wait(300);
await t.shot('shops-2-picker');
// pick: right arrow (skip the random slot)
let sel = await t.eval(() => PG.gta.shops.spray.sel);
await t.press('ArrowRight'); sel = (sel + 1) % 9;
if (sel === 8) { await t.press('ArrowRight'); sel = 0; }
const want1 = await t.eval(s => PG.gta.shops.PAINTS[s].c, sel);
ok('arrow keys move the selection', await t.eval(s => PG.gta.shops.spray.sel === s, sel));
// pause freezes the picker
const pk0 = await t.eval(() => { PG.pause(true); return PG.gta.shops.spray.pickT; });
await t.wait(500);
const pk1 = await t.eval(() => { const v = PG.gta.shops.spray.pickT; PG.pause(false); return v; });
ok('pause freezes the picker timer', pk0 === pk1, [pk0, pk1]);
await t.press('KeyF');
ok('F confirms (and does not get out)', await t.eval(() => PG.gta.shops.spray.phase === 'spray' && PG.gta.player.car === TC && !TT.picker()));
await t.wait(1200);
await t.shot('shops-3-spraying');
await until(() => PG.gta.shops.spray.phase === 'opening', 3000);
await t.wait(500);
await t.shot('shops-4-resprayed');
await until(() => PG.gta.shops.spray.phase === 'idle', 2000);
const r1 = await t.eval(id => { const X = PG.gta, c = TC; return { color: c.color, hp: c.hp, max: c.maxHp, money: X.player.money, wanted: X.player.wanted, inCar: X.player.car === c, sprayed: TT.ev('carSprayed', id).length, repaired: TT.ev('carRepaired', id).length, dmg: c.dmg == null, free: !!X.save.shops.freeUsed }; }, s1.id);
ok('colour is the chosen one', r1.color === want1, [r1.color, want1]);
ok('car fully repaired', r1.hp === r1.max && r1.dmg, r1);
ok('first spray is free', r1.money === 0 && r1.free, r1.money);
ok('carSprayed and carRepaired emitted', r1.sprayed === 1 && r1.repaired === 1, r1);
ok('still in the car, wanted 0', r1.inCar && r1.wanted === 0, r1);
// getting out and back in on the pad is not a second visit
await t.eval(() => { PG.gta.player.money = 600; TT.out(); });
await t.wait(250);
await t.eval(() => TT.seat());
await t.wait(1300);
ok('no second spray without leaving the pad', await t.eval(() => PG.gta.shops.spray.phase === 'idle' && PG.gta.player.money === 600 && PG.gta.player.car === TC));

// ---------- spray 2: paid, auto-random after 4 s ----------
await t.eval(() => { PG.gta.player.money = 600; PG.gta.damageCar(TC, 200, null, 'crash'); TT.revisit(); });
const inPick2 = await until(() => PG.gta.shops.spray.phase === 'pick', 4000);
ok('second visit opens the picker', inPick2);
const c2before = await t.eval(() => TC.color);
await until(() => PG.gta.shops.spray.phase === 'spray', 5000);
ok('auto-random after 4 s', await t.eval(() => PG.gta.shops.spray.phase === 'spray'));
await until(() => PG.gta.shops.spray.phase === 'idle', 5000);
const r2 = await t.eval(() => ({ color: TC.color, money: PG.gta.player.money, hp: TC.hp === TC.maxHp }));
ok('random colour differs, $250 charged, repaired', r2.color !== c2before && r2.money === 350 && r2.hp, { before: c2before, ...r2 });

// ---------- refusals ----------
await t.eval(() => { PG.gta.player.money = 100; TT.revisit(); });
await t.wait(1400);
const broke = await t.eval(() => ({ phase: PG.gta.shops.spray.phase, offer: TT.offer(), money: PG.gta.player.money }));
ok('broke: refused with "Come back with $250"', broke.phase === 'idle' && /come back with \$250/i.test(broke.offer) && broke.money === 100, broke);
await t.shot('shops-5-broke');
await t.eval(() => { PG.gta.player.money = 5000; TT.out(); TC.removed = true; TT.car('police', 'spray'); TT.seat(); });
await t.wait(1800);
const cop = await t.eval(() => ({ phase: PG.gta.shops.spray.phase, offer: TT.offer(), inCar: !!PG.gta.player.car, money: PG.gta.player.money }));
ok('police car refused', cop.phase === 'idle' && /cop/i.test(cop.offer) && cop.money === 5000, cop);
await t.eval(() => { TT.out(); TC.removed = true; TT.wanted(0); });
await t.wait(300);
await t.eval(() => { TT.car('bus', 'spray'); TT.seat(); });
await t.wait(1600);
const bus = await t.eval(() => ({ phase: PG.gta.shops.spray.phase, offer: TT.offer() }));
ok('bus refused', bus.phase === 'idle' && /bus/i.test(bus.offer), bus);
await t.eval(() => { TT.out(); TC.removed = true; });
await t.wait(200);

// ---------- spray 3: 5 stars with a cop watching + car bomb ----------
const s3 = await t.eval(() => {
  const X = PG.gta, P = X.player;
  P.money = 1500; TT.car('comet', 'spray');
  const q = TT.pose('spray', 1, 12); window.TCOP = X.makePed({ x: q.x, y: q.y, team: 'cop', ai: { owner: 'test' } });
  TT.wanted(5); TT.seat();
  return TC.id;
});
await until(() => PG.gta.shops.spray.phase === 'pick', 4000);
await t.press('KeyB');
const bombOn = await t.eval(() => PG.gta.shops.spray.bomb);
ok('B toggles the car bomb', bombOn);
await t.wait(150);
await t.shot('shops-6-picker-bomb');
await t.press('Enter');
await until(() => PG.gta.shops.spray.phase === 'idle', 5000);
const r3 = await t.eval(() => ({ wanted: PG.gta.player.wanted, money: PG.gta.player.money, bomb: PG.gta.shops.bombCar === TC, chip: TT.bombChip() }));
ok('seen at 5 stars: only dropped to 2', r3.wanted === 2, r3);
ok('spray + bomb charged ($1250)', r3.money === 250, r3);
ok('bomb fitted, HUD shows the bomb', r3.bomb && /light the fuse/i.test(r3.chip), r3);
await t.eval(() => { TT.wanted(0); TCOP.removed = true; });

// ---------- remote detonation ----------
await t.eval(() => { const X = PG.gta, P = X.player; TT.out(); const fr = X.shops.spray.fr; P.ped.x += fr.n.x * 24; P.ped.y += fr.n.y * 24; });
await t.wait(400);
ok('bomb chip says detonate when outside', /detonate/i.test(await t.eval(() => TT.bombChip())), await t.eval(() => TT.bombChip()));
await t.shot('shops-7-bomb-armed');
await t.press('KeyG');
await t.wait(650);
await t.shot('shops-8-bomb-boom');
const r4 = await t.eval(id => ({ wrecked: TC.wrecked, bombs: TT.ev('carBomb', id).length, boom: TT.events.some(e => e.ev === 'explosion'), chip: TT.bombChip(), alive: !PG.gta.player.ped.dead }), s3);
ok('G detonates the bomb remotely', r4.wrecked && r4.bombs === 1 && r4.boom, r4);
ok('player safe at 24 m, chip gone', r4.alive && !r4.chip, r4);
await t.wait(1200);

// ---------- fused bomb from inside the car ----------
await t.eval(() => { const X = PG.gta; X.player.ped.hp = 100; const q = TT.pose('crusher', 0, 16); window.TC = X.makeCar('x5', q.x, q.y, q.th, { ctrl: 'parked' }); X.shops.fitBomb(TC); TT.seat(); });
await until(() => PG.gta.player.car === TC, 2000);
await t.press('KeyG');
const fuse = await t.eval(() => ({ fuse: PG.gta.shops.bomb.fuse, chip: TT.bombChip() }));
ok('G in the car lights a 5 s fuse', fuse.fuse > 4 && /boom in/i.test(fuse.chip), fuse);
await t.wait(400);
await t.shot('shops-9-fuse');
await t.eval(() => { const X = PG.gta, P = X.player; TT.out(); P.ped.x += 26; });
await until(() => TC.wrecked, 6500);
ok('fuse runs out: boom', await t.eval(() => TC.wrecked && !PG.gta.player.ped.dead && !PG.gta.shops.bombCar));
await t.eval(() => { PG.gta.player.ped.hp = 100; });

// ---------- export ----------
const ex = await t.eval(() => {
  const X = PG.gta, m = X.shops.exportList.models[0];
  X.player.money = 1000; TT.car(m, 'crusher'); TT.seat(); return { id: TC.id, model: m };
});
await until(() => PG.gta.player.car === TC, 2000);
await t.wait(300);
const exOffer = await t.eval(() => ({ offer: TT.offer(), price: PG.gta.shops.exportPrice(TC) }));
ok('crusher pad offers export', /export/i.test(exOffer.offer) && exOffer.offer.includes(String(exOffer.price).replace(/\B(?=(\d{3})+(?!\d))/g, ',')), exOffer);
await t.shot('shops-10-export-offer');
await t.press('KeyF');
await until(() => PG.gta.shops.crusher.phase === 'container', 2500);
await t.wait(500);
await t.shot('shops-11-export-container');
await until(() => TC.removed, 4500);
const r5 = await t.eval(id => ({ removed: TC.removed, money: PG.gta.player.money, sold: TT.ev('carSold', id), done: PG.gta.shops.exportList.done.slice(), phase: PG.gta.shops.crusher.phase }), ex.id);
ok('export pays value x condition and removes the car', r5.removed && r5.money === 1000 + exOffer.price && r5.sold.length === 1 && r5.sold[0].export === true, { r5, price: exOffer.price });
ok('model ticked off the export list', r5.done.includes(ex.model), r5.done);
await t.wait(1000);

// ---------- crush for scrap ----------
const cr = await t.eval(() => {
  const X = PG.gta, L = X.shops.exportList.models;
  const m = ['hatch', 'bambino', 'comet', 'taxi', 'rancher', 'regret', 'fjord'].find(id => !L.includes(id));
  X.player.money = 0; TT.car(m, 'crusher'); X.damageCar(TC, TC.maxHp * 0.3, null, 'crash'); TT.seat(); return { id: TC.id, model: m };
});
await until(() => PG.gta.player.car === TC, 2000);
await t.wait(200);
const scrap = await t.eval(() => ({ offer: TT.offer(), price: PG.gta.shops.scrapPrice(TC), pile: PG.gta.shops.crusher.pile.length }));
ok('crusher pad offers scrap', /crush/i.test(scrap.offer), scrap);
await t.press('KeyF');
await until(() => PG.gta.shops.crusher.phase === 'crush', 2500);
await t.wait(900);
await t.shot('shops-12-crushing');
await until(() => PG.gta.shops.crusher.phase === 'lift', 2500);
await t.wait(450);
await t.shot('shops-13-cube-lift');
await until(() => TC.removed, 3000);
const r6 = await t.eval(id => ({ removed: TC.removed, money: PG.gta.player.money, sold: TT.ev('carSold', id), pile: PG.gta.shops.crusher.pile.length }), cr.id);
ok('scrap pays and the car is gone', r6.removed && r6.money === scrap.price && r6.sold.length === 1 && r6.sold[0].export === false, { r6, price: scrap.price });
ok('cube added to the scrap pile', r6.pile === scrap.pile + 1, r6.pile);
await t.wait(600);

// ---------- bomb in the crusher ----------
await t.eval(() => { const X = PG.gta; X.player.money = 0; TT.car('hatch', 'crusher'); X.shops.fitBomb(TC); TT.seat(); });
await until(() => PG.gta.player.car === TC, 2000);
await t.wait(200);
await t.eval(() => { const X = PG.gta, P = X.player; TT.out(); });
await t.eval(() => { const X = PG.gta, P = X.player, fr = X.shops.crusher.fr; P.ped.x += fr.n.x * 20; P.ped.y += fr.n.y * 20; });
await until(() => TC.wrecked, 4000);
const r7 = await t.eval(() => ({ wrecked: TC.wrecked, removed: TC.removed, sold: TT.ev('carSold', TC.id).length, money: PG.gta.player.money, phase: PG.gta.shops.crusher.phase }));
ok('a car bomb in the crusher goes off (no sale)', r7.wrecked && !r7.removed && r7.sold === 0 && r7.money < 100 && r7.phase === 'idle', r7);   // damage.js may pay a little mayhem money
await t.wait(500);

// ---------- Artur's garage ----------
await t.eval(() => { TT.car('furia', 'garage', { color: '#e0458f' }); TT.seat(); });
await until(() => PG.gta.player.car === TC, 2000);
await t.wait(300);
const gOffer = await t.eval(() => TT.offer());
ok('garage offers to store the car', /garage/i.test(gOffer), gOffer);
await t.press('KeyF');
await until(() => PG.gta.shops.garage.car === TC, 2000);
const gs = await t.eval(() => JSON.parse(JSON.stringify(PG.gta.save.shops.garage)));
ok('garage saves model and colour', gs && gs.model === 'furia' && gs.color === '#e0458f', gs);
await t.eval(() => { TT.foot('garage', 9); });
await t.wait(500);
await t.shot('shops-14-garage');

// ---------- the export list rolls over at midnight ----------
const day0 = await t.eval(() => { PG.gta.clock = 1439.9; return PG.gta.shops.exportList.day; });
await t.wait(300);
const day1 = await t.eval(() => ({ day: PG.gta.shops.exportList.day, n: PG.gta.shops.exportList.models.length, done: PG.gta.shops.exportList.done.length }));
ok('new export list every game day', day1.day === day0 + 1 && day1.n === 3 && day1.done === 0, { day0, ...day1 });

// ---------- every sound plays with audio on ----------
const snd = await t.eval(async () => {
  PG.audio.unlock(); PG.audio.setMuted(false);
  const c = PG.audio.ctx && PG.audio.ctx(); if (c && c.state !== 'running') { try { await c.resume(); } catch (e) { /* autoplay */ } }
  const live = !!PG.audio.kit();
  for (const k of ['door', 'hiss', 'buzz', 'click', 'done', 'cash', 'hydraulic', 'crunch', 'clank', 'beep', 'remote']) PG.gta.shops.sfx(k);
  PG.gta.shops.sfx('door', PG.gta.player.ped.x + 5, PG.gta.player.ped.y);
  await new Promise(r => setTimeout(r, 300));
  PG.audio.setMuted(true);
  return live;
});
ok('sounds play without errors', t.errors.length === 0, { audioLive: snd });

// ---------- crusher + spray screenshots at rest, then a second game ----------
await t.eval(() => TT.foot('crusher', 9));
await t.wait(600);
await t.shot('shops-15-crusher-idle');

const g2 = await t.eval(() => {
  const X = PG.gta; X.stop(); X.start(PG.GTA_DEF);
  const g = X.shops.garage, c = g && g.car;
  return { garage: !!g, car: c ? { model: c.model.id, color: c.color, keep: c.keep, d: Math.hypot(c.x - g.c.x, c.y - g.c.y) } : null, phase: X.shops.spray && X.shops.spray.phase, picker: TT.picker(), bomb: X.shops.bombCar, sprays: X.shops.stats.sprays };
});
ok('second game: state reset', g2.phase === 'idle' && !g2.picker && !g2.bomb && g2.sprays === 0, g2);
ok('second game: stored car respawned in the garage', !!g2.car && g2.car.model === 'furia' && g2.car.color === '#e0458f' && g2.car.keep && g2.car.d < 1, g2.car);
await t.wait(400);
await t.eval(() => { const X = PG.gta; X.player.money = 500; TT.car('voltage', 'spray'); TT.seat(); });
await until(() => PG.gta.shops.spray.phase === 'pick', 4000);
await t.press('ArrowLeft'); await t.press('KeyF');
// fps while spraying with traffic around
const fps = await t.eval(() => new Promise(r => { let n = 0; const t0 = performance.now(); (function f() { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); })(); }));
await until(() => PG.gta.shops.spray.phase === 'idle', 5000);
const r8 = await t.eval(() => ({ money: PG.gta.player.money, sprays: PG.gta.shops.stats.sprays, cars: PG.gta.cars.length }));
ok('second game: spray works', r8.sprays === 1 && r8.money === 250, r8);
console.log('fps', fps, 'cars', r8.cars);
ok('fps while spraying >= 45', fps >= 45, fps);
await t.eval(() => { TT.out(); });
await t.wait(300);

ok('no console errors', t.errors.length === 0, t.errors.slice(0, 5).join('\n'));
await t.close();
console.log(fails ? `${fails} check(s) failed` : 'all shops checks passed');
process.exit(fails ? 1 : 0);
