// Weapons test: arsenal, firing (player input, aim assist, drive-by, NPCs), damage to peds and cars, rockets,
// grenades, molotovs, flamethrower, electro chains, melee, ammo, switching, pickups, kill frenzy, lamps,
// helicopter gunners, water on fire pools, cop-car crimes, drop merging and caps, night glow, sound paths,
// restart and fps in a busy firefight.
// Usage: node tests/weapons.test.mjs <built.html> <screenshot dir>
import { launch } from './harness.mjs';
const t = await launch({ html: process.argv[2], out: process.argv[3] });
let failed = 0;
const check = (name, ok, info) => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info !== undefined ? ' — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`); };
const frames = n => t.eval(k => new Promise(r => { let i = 0; (function f() { if (++i >= k) r(); else requestAnimationFrame(f); })(); }), n);
// freeze the simulation (render keeps going) so short-lived effects can be photographed
const snap = async name => { await t.eval(() => { PG.game.status = 'freeze'; }); await t.wait(120); await t.shot(name); await t.eval(() => { PG.game.status = 'play'; }); };

// test helpers inside the page: an open arena on a junction, cleared of cars and people
await t.eval(() => {
  const X = PG.gta, W = window;
  W.__ev = { gunfire: 0, crime: [], explosion: [], carDestroyed: 0, pedKilled: [], pickup: [] };
  X.on('gunfire', () => W.__ev.gunfire++);
  X.on('crime', e => W.__ev.crime.push(e.type));
  X.on('explosion', e => W.__ev.explosion.push({ x: Math.round(e.x), y: Math.round(e.y), source: typeof e.source === 'string' ? e.source : e.source && e.source.kind }));
  X.on('carDestroyed', () => W.__ev.carDestroyed++);
  X.on('pedKilled', e => W.__ev.pedKilled.push({ id: e.ped.id, kind: e.kind, byPlayer: X.byPlayer(e.by) }));
  X.on('pickup', e => W.__ev.pickup.push(e.kind));
  W.__calm = () => { const P = X.player; if (X.police && X.police.clear) X.police.clear(); P.wanted = 0; if (P.ped) { P.ped.hp = P.ped.maxHp; P.ped.armor = 100; } };
  W.__arena = (dx) => {
    const P = X.player, C = X.city;
    if (P.car) { const c = P.car; c.driver = null; P.car = null; P.ped.car = null; P.ped.hidden = false; }
    if (X.scene) X.leaveScene();
    const i = Math.max(1, Math.min(C.xs.length - 3, Math.floor(C.xs.length / 2) + (dx || 0))), j = Math.max(1, Math.min(C.ys.length - 2, Math.floor(C.ys.length / 2)));
    const x = C.xs[i], y = C.ys[j];
    for (const c of X.cars) if (Math.hypot(c.x - x, c.y - y) < 160) X.removeCar(c);
    for (const p of X.peds) if (!p.isPlayer && Math.hypot(p.x - x, p.y - y) < 160) p.removed = true;
    for (const pk of X.weapons.pickups) if (Math.hypot(pk.x - x, pk.y - y) < 40) pk.removed = true;
    X.weapons.projectiles.length = 0; X.weapons.fires.length = 0;
    P.ped.x = x; P.ped.y = y; P.ped.vx = P.ped.vy = 0; P.ped.th = 0; P.ped.knock = 0; P.ped.fireCd = 0;
    P.state = 'play'; P.entering = null;
    X.cam.x = x; X.cam.y = y;
    W.__calm();
    return { x, y };
  };
  W.__ped = (x, y, o) => PG.gta.makePed(Object.assign({ x, y, th: Math.PI, ai: { owner: 'test' } }, o));
  // fire n times with the shooter's cooldown honoured, one try per frame
  W.__fire = (shooter, id, ang, n, o) => new Promise(r => { let k = 0, f = 0; (function g() { if (PG.gta.fireWeapon(shooter, id, typeof ang === 'function' ? ang() : ang, o)) k++; if (k >= n || ++f > n * 90) r(k); else requestAnimationFrame(g); })(); });
});

// ---------- 1. registry ----------
const reg = await t.eval(() => {
  const X = PG.gta, ids = Object.keys(X.WEAPONS);
  const bad = ids.filter(id => { const w = X.WEAPONS[id]; return !w.name || !(w.rate > 0) || !(w.range > 0) || w.ammo == null || w.max == null || w.loud == null || !w.kind; });
  return { ids, bad, alias: X.WEAPONS.machinegun === X.WEAPONS.rifle && X.WEAPONS.smg === X.WEAPONS.uzi, fire: typeof X.fireWeapon, give: typeof X.giveWeapon, spawn: typeof X.spawnPickup };
});
check('arsenal has 10+ weapons with full specs', reg.ids.length >= 10 && !reg.bad.length, reg.ids.join(','));
check('aliases resolve (machinegun, smg) and services exist', reg.alias && reg.fire === 'function' && reg.give === 'function' && reg.spawn === 'function');

// ---------- 2. give / select / max ammo ----------
const give = await t.eval(() => {
  const X = PG.gta, P = X.player;
  const a = X.giveWeapon('pistol', 30), w1 = P.weapon;
  X.giveWeapon('pistol', 99999); const capped = P.inv.pistol;
  const none = X.giveWeapon('pistol', 10);
  X.giveWeapon('uzi'); const w2 = P.weapon;
  return { a, w1, capped, none, w2, max: X.WEAPONS.pistol.max };
});
check('giveWeapon adds ammo and selects it when only fists were owned', give.a === 30 && give.w1 === 'pistol', give);
check('giveWeapon respects max ammo', give.capped === give.max && give.none === 0, give);
check('giving a second weapon keeps the current one', give.w2 === 'pistol');

const odd = await t.eval(async () => {
  const X = PG.gta, P = X.player, w0 = P.weapon;
  P.inv.knife = 3; P.weapon = 'knife';            // a module puts something unknown in the player's hands
  await new Promise(r => setTimeout(r, 100));
  const a = P.weapon; delete P.inv.knife;
  P.inv.machinegun = 20; P.weapon = 'machinegun';  // or an alias
  await new Promise(r => setTimeout(r, 100));
  const b = P.weapon, rifle = P.inv.rifle; delete P.inv.rifle;
  X.weapons.select(w0);
  return { a, b, rifle, nonsense: X.giveWeapon('constructor') + (X.spawnPickup('toString', 0, 0) ? 1 : 0) + (X.fireWeapon(P.ped, 'hasOwnProperty', 0) ? 1 : 0) };
});
check('unknown or alias weapon ids from other modules are handled', odd.a !== 'knife' && odd.b === 'rifle' && odd.rifle === 20 && odd.nonsense === 0, odd);

// ---------- 3. switching ----------
await t.eval(() => { const X = PG.gta; for (const id of ['bat', 'shotgun', 'rifle', 'grenade']) X.giveWeapon(id); X.weapons.select('pistol'); });
await t.press('KeyE'); const sw1 = await t.eval(() => PG.gta.player.weapon);
await t.press('KeyQ'); const sw2 = await t.eval(() => PG.gta.player.weapon);
await t.press('Digit4'); const sw3 = await t.eval(() => PG.gta.player.weapon);
await t.press('Digit1'); const sw4 = await t.eval(() => PG.gta.player.weapon);
await t.press('Digit1'); const sw5 = await t.eval(() => PG.gta.player.weapon);
await t.press('Digit7'); const sw6 = await t.eval(() => PG.gta.player.weapon);
check('E/Q cycle owned weapons', sw1 === 'uzi' && sw2 === 'pistol', [sw1, sw2]);
check('digits select slots and toggle within a slot, unowned slots ignored', sw3 === 'shotgun' && [sw4, sw5].sort().join() === 'bat,fists' && sw6 === sw5, [sw3, sw4, sw5, sw6]);
await t.shot('w01-hud-strip');

// ---------- 4. pistol kills a ped, blood, crime, ammo ----------
const kill = await t.eval(async () => {
  const X = PG.gta, P = X.player, A = window.__arena(0), E = window.__ev;
  X.giveWeapon('pistol', 300);
  const tg = window.__ped(A.x + 9, A.y);
  const ammo0 = P.inv.pistol, dec0 = X.decals.length, gf0 = E.gunfire, cr0 = E.crime.length;
  const shots = await window.__fire(P.ped, 'pistol', () => Math.atan2(tg.y - P.ped.y, tg.x - P.ped.x), 8);
  await new Promise(r => setTimeout(r, 200));
  const k = E.pedKilled.find(e => e.id === tg.id);
  return { dead: tg.dead, shots, used: ammo0 - P.inv.pistol, blood: X.decals.slice(dec0).filter(d => d.kind === 'blood').length, gunfire: E.gunfire - gf0, crimes: E.crime.slice(cr0), kind: k && k.kind, byPlayer: k && k.byPlayer, lastBy: tg.lastBy === P.ped };
});
check('pistol kills a ped (by the player, kind bullet)', kill.dead && kill.kind === 'bullet' && kill.byPlayer && kill.lastBy, kill);
check('ammo depletes one per shot', kill.used === kill.shots && kill.shots > 0, kill);
check('blood decals on hits', kill.blood > 0, kill.blood);
check('gunfire events and shoot/killPed crimes reported', kill.gunfire > 0 && kill.crimes.includes('shoot') && kill.crimes.includes('killPed'), kill.crimes);

// ---------- 5. real input: keyboard aim assist, then mouse aim ----------
const kb = await t.eval(() => {
  const X = PG.gta, P = X.player, A = window.__arena(0);
  X.giveWeapon('uzi', 200); X.weapons.select('uzi');
  const tg = window.__ped(A.x + 10, A.y + 3, { hp: 400, maxHp: 400 }); window.__tg = tg;
  P.ped.th = 0;   // ~17 degrees off: aim assist must pull onto the target
  return { mouse: X.input.mouseActive() };
});
await t.page.keyboard.down('KeyJ'); await t.wait(150);
await snap('w02-uzi-assist-burst');
await t.wait(500); await t.page.keyboard.up('KeyJ');
const kb2 = await t.eval(() => ({ hp: window.__tg.hp, assist: PG.gta.weapons.assist === window.__tg, th: PG.gta.player.ped.th }));
check('keyboard fire (J) with aim assist hits a ped off-axis', !kb.mouse && kb2.hp < 400, kb2);
const ms = await t.eval(() => {
  const X = PG.gta, P = X.player, A = window.__arena(0);
  X.weapons.select('pistol');
  const tg = window.__ped(A.x - 4, A.y - 8, { hp: 400, maxHp: 400 }); window.__tg = tg;
  return X.toScreen(tg.x, tg.y);
});
await t.mouse(ms.x, ms.y); await t.wait(150);
const ms1 = await t.eval(() => { const X = PG.gta; return X.toScreen(window.__tg.x, window.__tg.y); });
await t.mouse(ms1.x, ms1.y); await t.wait(100);
await t.page.mouse.down(); await t.wait(700); await t.page.mouse.up();
const ms2 = await t.eval(() => ({ hp: window.__tg.hp, th: PG.gta.player.ped.th, want: Math.atan2(window.__tg.y - PG.gta.player.ped.y, window.__tg.x - PG.gta.player.ped.x) }));
check('mouse aim + click fires toward the cursor', ms2.hp < 400 && Math.abs(ms2.th - ms2.want) < 0.2, ms2);

// ---------- 6. shotgun knockback + uzi destroys a car ----------
const car = await t.eval(async () => {
  const X = PG.gta, P = X.player, A = window.__arena(0), E = window.__ev;
  const c = X.makeCar('hatch', A.x + 9, A.y, Math.PI / 2, { ctrl: 'parked' });
  X.giveWeapon('uzi', 500);
  const d0 = E.carDestroyed, hp0 = c.hp;
  await window.__fire(P.ped, 'uzi', 0, 6);
  const hp1 = c.hp;
  let n = 0; while (!c.wrecked && !(c.burning > 0) && n < 300) { P.ped.fireCd = 0; P.inv.uzi = 300; X.fireWeapon(P.ped, 'uzi', 0); n++; if (n % 10 === 0) await new Promise(r => requestAnimationFrame(r)); }
  // with damage.js a dead car burns for a few seconds before it blows
  for (let k = 0; k < 80 && !c.wrecked; k++) await new Promise(r => setTimeout(r, 100));
  return { hp0, hp1, wrecked: c.wrecked, destroyed: E.carDestroyed - d0, shots: n };
});
check('bullets damage a car', car.hp1 < car.hp0, car);
check('sustained uzi fire destroys the car', car.wrecked && car.destroyed > 0, car);
await t.wait(300); await t.shot('w03-car-destroyed');

const sg = await t.eval(async () => {
  const X = PG.gta, P = X.player, A = window.__arena(0);
  X.giveWeapon('shotgun', 40);
  const tg = window.__ped(A.x + 4, A.y, { hp: 1000, maxHp: 1000 });
  P.ped.fireCd = 0;
  const ok = X.fireWeapon(P.ped, 'shotgun', 0);
  return { ok, hp: tg.hp, vx: tg.vx, knock: tg.knock };
});
check('shotgun pellets hit hard and knock back (without stacking per pellet)', sg.ok && sg.hp < 1000 - 40 && sg.vx > 2 && sg.vx < 12, sg);
await frames(2); await snap('w04-shotgun');

// ---------- 7. rocket ----------
const rk = await t.eval(async () => {
  const X = PG.gta, P = X.player, A = window.__arena(0), E = window.__ev;
  const c = X.makeCar('voltage', A.x + 24, A.y, Math.PI / 2, { ctrl: 'parked' }); window.__rc = c;
  X.giveWeapon('rocket', 5); P.ped.fireCd = 0;
  const ex0 = E.explosion.length, cr0 = E.crime.length;
  const ok = X.fireWeapon(P.ped, 'rocket', 0);
  window.__ex0 = ex0; window.__cr0 = cr0;
  return { ok, proj: X.weapons.projectiles.length };
});
await t.wait(250); await snap('w05-rocket-flight');
await t.wait(500);
await snap('w06-rocket-explosion');
const rk2 = await t.eval(async () => {
  for (let k = 0; k < 40 && !window.__rc.wrecked; k++) await new Promise(r => setTimeout(r, 100));
  const E = window.__ev; return { wrecked: window.__rc.wrecked, ex: E.explosion.slice(window.__ex0), crimes: E.crime.slice(window.__cr0) };
});
check('rocket flies as a projectile and destroys a car', rk.ok && rk.proj === 1 && rk2.wrecked, rk2);
check('rocket explosion event (source rocket), explosion crime never doubled', rk2.ex.some(e => e.source === 'rocket') && rk2.crimes.includes('explosion') && rk2.crimes.filter(c => c === 'explosion').length <= rk2.ex.length, rk2);

// ---------- 8. grenade arc ----------
const gr = await t.eval(async () => {
  const X = PG.gta, P = X.player, A = window.__arena(0), E = window.__ev;
  X.giveWeapon('grenade', 6); P.ped.fireCd = 0;
  const ex0 = E.explosion.length;
  X.fireWeapon(P.ped, 'grenade', 0, { dist: 12 });
  const g = X.weapons.projectiles[X.weapons.projectiles.length - 1];
  let maxZ = 0, landedAt = null;
  await new Promise(r => { (function f() { maxZ = Math.max(maxZ, g.z); if (!landedAt && g.z <= 0) landedAt = { x: g.x - A.x, y: g.y - A.y }; if (g.dead) r(); else requestAnimationFrame(f); })(); });
  const ex = E.explosion.slice(ex0).find(e => e.source === 'grenade');
  return { maxZ, landedAt, ex: ex && { dx: ex.x - A.x, dy: ex.y - A.y }, inv: P.inv.grenade };
});
check('grenade flies an arc (height > 1.5 m) and lands near the aim point', gr.maxZ > 1.5 && gr.landedAt && Math.abs(gr.landedAt.x - 12) < 3, gr);
check('grenade explodes after its fuse', !!gr.ex && gr.ex.dx > 8, gr.ex);
// photograph one mid-air
await t.eval(() => { const X = PG.gta, P = X.player; P.ped.fireCd = 0; X.fireWeapon(P.ped, 'grenade', -0.4, { dist: 16 }); });
await t.wait(300); await snap('w07-grenade-arc');
await t.wait(2200);

// landing marker while aiming a grenade with the mouse
const gm = await t.eval(() => { const X = PG.gta, P = X.player, A = window.__arena(0); X.weapons.select('grenade'); return X.toScreen(A.x + 9, A.y - 5); });
await t.mouse(gm.x, gm.y); await t.wait(120); await t.mouse(gm.x + 2, gm.y); await t.wait(120);
await t.shot('w07b-grenade-aim-marker');

// ---------- 9. molotov ----------
const mo = await t.eval(async () => {
  const X = PG.gta, P = X.player, A = window.__arena(0);
  X.giveWeapon('molotov', 6); P.ped.fireCd = 0;
  const tg = window.__ped(A.x + 10, A.y, { hp: 300, maxHp: 300 }); window.__mt = tg;
  X.fireWeapon(P.ped, 'molotov', 0, { dist: 10 });
  await new Promise(r => setTimeout(r, 1300));
  return { fires: X.weapons.fires.length, hp: tg.hp, onFire: tg.onFire };
});
check('molotov shatters into a fire pool that burns people', mo.fires > 0 && mo.hp < 300 && mo.onFire > 0, mo);
await snap('w08-molotov-fire');

// ---------- 10. flamethrower ----------
const fl = await t.eval(async () => {
  const X = PG.gta, P = X.player, A = window.__arena(0);
  X.giveWeapon('flamer', 400);
  const tg = window.__ped(A.x + 5, A.y + 0.5, { hp: 400, maxHp: 400 }); window.__ft = tg;
  const ammo0 = P.inv.flamer;
  const n = await window.__fire(P.ped, 'flamer', 0, 24);
  return { n, hp: tg.hp, onFire: tg.onFire, used: ammo0 - P.inv.flamer };
});
await snap('w09-flamethrower');
check('flamethrower burns a ped in its cone and uses fuel', fl.hp < 400 - 40 && fl.onFire > 0 && fl.used === fl.n, fl);
const flWall = await t.eval(() => {   // the stream stops at walls: nobody behind a building gets hurt
  const X = PG.gta, P = X.player, C = X.city;
  const b = C.buildings.find(b => !b.deco && b.x1 - b.x0 > 14 && b.y1 - b.y0 > 14 && Math.abs((b.x0 + b.x1) / 2 - P.ped.x) < 400);
  const y = (b.y0 + b.y1) / 2, x = b.x0 - 1.5;
  P.ped.x = x; P.ped.y = y;
  const tg = window.__ped(b.x0 + 3, y, { hp: 400, maxHp: 400 });
  for (let i = 0; i < 10; i++) { P.ped.fireCd = 0; X.fireWeapon(P.ped, 'flamer', 0); }
  tg.removed = true;
  return { hp: tg.hp };
});
check('flames do not pass through buildings', flWall.hp === 400, flWall);

// ---------- 11. electro chain ----------
const el = await t.eval(() => {
  const X = PG.gta, P = X.player, A = window.__arena(0);
  X.giveWeapon('electro', 50); P.ped.fireCd = 0;
  const ps = [window.__ped(A.x + 6, A.y), window.__ped(A.x + 9, A.y + 2.5), window.__ped(A.x + 12, A.y - 1)];
  X.fireWeapon(P.ped, 'electro', 0);
  return ps.map(p => Math.round(p.hp));
});
check('electro gun arcs from one person to the next', el.filter(h => h < 100).length >= 2, el);
await frames(2); await snap('w10-electro');

// ---------- 12. melee ----------
// (with brawl.js the blow lands a moment later, when the fist or bat gets there: wait for it)
const me = await t.eval(async () => {
  const X = PG.gta, P = X.player, A = window.__arena(0), E = window.__ev;
  const a = window.__ped(A.x + 0.9, A.y), b = window.__ped(A.x - 1.2, A.y + 0.2);
  const cr0 = E.crime.length, wait = ms => new Promise(r => setTimeout(r, ms));
  P.ped.fireCd = 0; X.fireWeapon(P.ped, 'fists', 0); await wait(350);
  P.ped.fireCd = 0; X.fireWeapon(P.ped, 'bat', Math.PI); await wait(450);
  P.ped.fireCd = 0; const miss = X.fireWeapon(P.ped, 'fists', Math.PI / 2); await wait(350);
  return { a: a.hp, b: b.hp, crimes: E.crime.slice(cr0), miss };
});
check('fists and bat hurt the person in front', me.a < 100 && me.a >= 85 && me.b <= 100 - 30, me);
check('punching people reports assault', me.crimes.filter(c => c === 'assault').length >= 2, me.crimes);
await frames(1); await snap('w11-melee');

// ---------- 13. NPC (cop) firing ----------
const npc = await t.eval(async () => {
  const X = PG.gta, A = window.__arena(0), E = window.__ev;
  const cop = window.__ped(A.x + 2, A.y - 6, { team: 'cop', weapon: 'pistol', look: { skin: '#e0ac7e', hair: '#222', shirt: '#2c4f8a', pants: '#1f2a44', hat: '#1b2a4a' } });
  const civ = window.__ped(A.x + 12, A.y - 6, { hp: 100 });
  const gf0 = E.gunfire, cr0 = E.crime.length;
  const first = X.fireWeapon(cop, 'pistol', 0), second = X.fireWeapon(cop, 'pistol', 0);
  const n = await window.__fire(cop, 'pistol', () => Math.atan2(civ.y - cop.y, civ.x - cop.x), 6);
  const alias = X.fireWeapon(Object.assign(cop, { fireCd: 0 }), 'machinegun', 0);
  return { first, second, n, hp: civ.hp, lastByCop: civ.lastBy === cop, gunfire: E.gunfire - gf0, shootCrime: E.crime.slice(cr0).includes('shoot'), alias };
});
check('NPC fires through X.fireWeapon, honours fireCd', npc.first && !npc.second && npc.n === 6, npc);
check('NPC bullets hurt others (by = the cop), emit gunfire, no player crime', npc.hp < 100 && npc.lastByCop && npc.gunfire > 0 && !npc.shootCrime, npc);
check('NPC weapon aliases work', npc.alias);
await frames(1); await snap('w12-npc-cop');

// ---------- 14. drive-by ----------
await t.eval(() => {
  const X = PG.gta, P = X.player, A = window.__arena(0);
  const c = X.makeCar('furia', A.x, A.y, 0, { ctrl: 'parked' }); window.__dc = c;
  const d = X.doorSpot(c, -1); P.ped.x = d.x; P.ped.y = d.y;
  X.enterCar(c);
});
await t.wait(1700);
const db0 = await t.eval(() => {
  const X = PG.gta, P = X.player, c = window.__dc;
  X.giveWeapon('uzi', 200); X.weapons.select('bat');
  const tg = window.__ped(c.x + 2, c.y - 7, { hp: 400, maxHp: 400 }); window.__dt = tg;
  return { inCar: P.car === c, hp: c.hp, mouse: X.input.mouseActive() };
});
await t.wait(2600);   // let the earlier mouse go idle: keyboard drive-by aims out of the side windows
await t.page.keyboard.down('KeyJ'); await t.wait(200); await snap('w13-driveby');
await t.wait(500); await t.page.keyboard.up('KeyJ');
const db1 = await t.eval(() => ({ hp: window.__dt.hp, carHp: window.__dc.hp, inCar: PG.gta.player.car === window.__dc, weapon: PG.gta.player.weapon, hud: (document.querySelector('#gta-hud .w-db') || {}).textContent }));
check('HUD shows the drive-by gun and icon next to the weapon name', /^DRIVE-BY (Machine Gun|Uzi)/.test(db1.hud || '') && (await t.eval(() => !!document.querySelector('#gta-hud .g-weap canvas.w-icon'))), db1.hud);
check('drive-by: keyboard fire from the car hits a ped beside it', db0.inCar && db1.inCar && db1.hp < 400, db1);
check('drive-by never hits your own car; melee in hand falls back to a gun', db1.carHp === db0.hp && db1.weapon === 'bat', db1);
const dm = await t.eval(() => { const X = PG.gta, c = window.__dc, tg = window.__ped(c.x + 4, c.y + 7, { hp: 400, maxHp: 400 }); window.__dt2 = tg; return X.toScreen(tg.x, tg.y); });
await t.mouse(dm.x, dm.y); await t.wait(80); await t.mouse(dm.x + 1, dm.y); await t.page.mouse.down(); await t.wait(250); await snap('w13b-driveby-mouse'); await t.wait(250); await t.page.mouse.up();
const dm1 = await t.eval(() => ({ hp: window.__dt2.hp }));
check('drive-by with the mouse shoots toward the cursor', dm1.hp < 400, dm1);
// rocket out of the window
const dr = await t.eval(async () => {
  const X = PG.gta, P = X.player, c = window.__dc;
  X.giveWeapon('rocket', 3); P.ped.fireCd = 0; const hp0 = c.hp;
  const ok = X.fireWeapon(P.ped, 'rocket', c.th - Math.PI / 2);
  await new Promise(r => setTimeout(r, 900));
  return { ok, hp: c.hp, hp0, alive: !c.wrecked };
});
check('rocket from a car window leaves your own car alone', dr.ok && dr.alive && dr.hp === dr.hp0, dr);

// ---------- 15. pickups ----------
const pk = await t.eval(async () => {
  const X = PG.gta, P = X.player, A = window.__arena(2), S = X.weapons, E = window.__ev;
  await new Promise(r => setTimeout(r, 4000));   // ambient crates respawn out of view
  const amb = S.pickups.filter(q => q.ambient).length;
  P.ped.hp = 40; const m0 = P.money;
  delete P.inv.shotgun;
  X.spawnPickup('health', A.x + 0.4, A.y);
  X.spawnPickup('cash', A.x - 0.4, A.y, { amount: 250 });
  X.spawnPickup('shotgun', A.x, A.y + 0.4);
  X.spawnPickup('armor', A.x, A.y - 0.4);
  P.ped.armor = 0;
  await new Promise(r => setTimeout(r, 300));
  return { amb, hp: P.ped.hp, money: P.money - m0, shotgun: P.inv.shotgun, armor: P.ped.armor, kinds: E.pickup.slice(-4).sort() };
});
check('about 18 ambient pickups live around the player', pk.amb >= 15 && pk.amb <= 20, pk.amb);
check('health, cash, armour and weapon crates are collected on foot', pk.hp === 100 && pk.money === 250 && pk.shotgun === 12 && pk.armor === 50, pk);
const pkFull = await t.eval(async () => {
  const X = PG.gta, P = X.player, A = window.__arena(2);
  P.inv.pistol = X.WEAPONS.pistol.max; P.ped.hp = P.ped.maxHp;
  const a = X.spawnPickup('pistol', A.x + 0.3, A.y), b = X.spawnPickup('health', A.x - 0.3, A.y);
  await new Promise(r => setTimeout(r, 300));
  const left = X.weapons.pickups.includes(a) && X.weapons.pickups.includes(b);
  a.removed = b.removed = true;
  return left;
});
check('full ammo / full health leaves the pickup lying there', pkFull);
await t.eval(() => {   // a showroom of crates for the screenshot
  const X = PG.gta, P = X.player, A = window.__arena(2);
  ['pistol', 'uzi', 'shotgun', 'rifle', 'flamer', 'electro', 'rocket', 'grenade', 'molotov', 'bat', 'health', 'armor', 'cash', 'double', 'fast', 'frenzy'].forEach((k, i) => X.spawnPickup(k, A.x - 9 + (i % 8) * 2.6, A.y + 4 + Math.floor(i / 8) * 2.8, { keep: true }));
  P.ped.y = A.y - 2;
});
await t.wait(300); await t.shot('w14-pickups');
const pkCar = await t.eval(async () => {
  const X = PG.gta, P = X.player, A = window.__arena(2);
  for (const q of X.weapons.pickups) if (q.keep) q.removed = true;
  const c = X.makeCar('hatch', A.x, A.y + 8, 0, { ctrl: 'parked' });
  const d = X.doorSpot(c, -1); P.ped.x = d.x; P.ped.y = d.y; X.enterCar(c);
  await new Promise(r => setTimeout(r, 1700));
  const m0 = P.money;
  X.spawnPickup('cash', c.x + 1, c.y, { amount: 100 });
  const gun = X.spawnPickup('rifle', c.x - 1, c.y);
  await new Promise(r => setTimeout(r, 300));
  const r = { inCar: P.car === c, money: P.money - m0, gunLeft: X.weapons.pickups.includes(gun) };
  gun.removed = true;
  return r;
});
check('cash is collected from a car, weapon crates are not', pkCar.inCar && pkCar.money === 100 && pkCar.gunLeft, pkCar);
const drop = await t.eval(async () => {
  const X = PG.gta, A = window.__arena(2);
  const g = window.__ped(A.x + 30, A.y, { team: 'gang', weapon: 'uzi' });
  X.damagePed(g, 500, X.player.ped, 'bullet');
  const d = X.weapons.pickups.find(q => q.id === 'uzi' && Math.hypot(q.x - g.x, q.y - g.y) < 2);
  return { dropped: !!d, ttl: d && d.ttl };
});
check('armed NPCs drop their gun when killed', drop.dropped && drop.ttl > 0, drop);

// ---------- 16. ammo runs out -> auto switch ----------
const dry = await t.eval(async () => {
  const X = PG.gta, P = X.player; window.__arena(0);
  delete P.inv.rocket; X.giveWeapon('rocket', 2); X.weapons.select('rocket');
  const n = await window.__fire(P.ped, 'rocket', Math.PI / 2, 3);
  await new Promise(r => requestAnimationFrame(r));
  return { n, has: 'rocket' in P.inv, weapon: P.weapon };
});
check('running dry drops the weapon and switches to another', dry.n === 2 && !dry.has && dry.weapon !== 'rocket', dry);
await t.wait(2500);

// ---------- 17. street lamps can be shot out ----------
const lamp = await t.eval(() => {
  const X = PG.gta, P = X.player, A = window.__arena(0);
  const l = X.city.lamps.filter(l => !l.broken).sort((a, b) => Math.hypot(a.x - A.x, a.y - A.y) - Math.hypot(b.x - A.x, b.y - A.y))[0];
  const hx = l.x + l.nx * 1.2, hy = l.y + l.ny * 1.2;
  P.ped.x = hx - l.nx * 6 - l.ny * 0.01; P.ped.y = hy - l.ny * 6 + l.nx * 0.01;   // stand in the road, facing the lamp
  P.ped.fireCd = 0;
  const ang = Math.atan2(hy - P.ped.y, hx - P.ped.x);
  X.weapons.select('pistol'); P.inv.pistol = 50;
  for (let i = 0; i < 3 && !l.broken; i++) { P.ped.fireCd = 0; X.fireWeapon(P.ped, 'pistol', ang); }
  return { broken: !!l.broken };
});
check('a bullet through a lamp head breaks the street lamp', lamp.broken);

// ---------- 18. kill frenzy ----------
const fz = await t.eval(async () => {
  const X = PG.gta, P = X.player, A = window.__arena(1), S = X.weapons;
  const m0 = P.money, w0 = P.weapon;
  X.spawnPickup('frenzy', A.x, A.y);
  await new Promise(r => setTimeout(r, 250));
  const F = S.frenzy; if (!F) return { started: false };
  const info = { started: true, weapon: P.weapon, inf: P.inv[P.weapon] === Infinity, need: F.need, cars: F.cars };
  for (let i = 0; i < F.need; i++) {
    if (F.cars) { const c = X.makeCar('hatch', A.x + 20 + i * 7, A.y + 30, 0, { ctrl: 'parked' }); X.damageCar(c, 1e5, P.ped, 'explosion'); }
    else { const p = window.__ped(A.x + 20 + i, A.y + 30); X.damagePed(p, 500, P.ped, 'bullet'); }
  }
  for (let k = 0; k < 50 && S.frenzy; k++) await new Promise(r => setTimeout(r, 100));   // burning cars blow after a fuse
  await new Promise(r => setTimeout(r, 200));
  return Object.assign(info, { done: !S.frenzy, money: P.money - m0, after: P.weapon, restored: !(P.inv[info.weapon] === Infinity) });
});
check('kill frenzy skull starts a frenzy with infinite ammo', fz.started && fz.inf, fz);
check('meeting the frenzy target pays out and restores the inventory', fz.done && fz.money > 0 && fz.restored, fz);
await t.wait(1500);

// ---------- 18b. review fixes ----------
const fm = await t.eval(async () => {   // a mission starting mid-frenzy takes over: our frenzy ends quietly, ammo bought meanwhile is kept
  const X = PG.gta, P = X.player, A = window.__arena(1), S = X.weapons;
  for (const id of ['uzi', 'flamer', 'rocket', 'electro', 'shotgun']) delete P.inv[id];
  X.giveWeapon('pistol', 30); X.weapons.select('pistol');
  X.spawnPickup('frenzy', A.x, A.y);
  await new Promise(r => setTimeout(r, 250));
  const F = S.frenzy; if (!F) return { started: false };
  const w = F.w, bought = X.giveWeapon(w, 10), stillInf = P.inv[w] === Infinity;
  // the frenzy readout keeps clear of a long pager message
  X.pager('Artur: A long message to check the layout. The frenzy counter must sit below this box, never on top of it, whatever the screen.', 0);
  await new Promise(r => setTimeout(r, 450));
  const a = document.querySelector('#gta-hud .g-pager').getBoundingClientRect(), b = document.querySelector('#gta-hud .w-frenzy').getBoundingClientRect();
  const overlap = !(b.top >= a.bottom || b.bottom <= a.top || b.left >= a.right || b.right <= a.left);
  X.pager('');
  X.emit('missionStart', { id: 'test' });
  return { started: true, w, bought, stillInf, ended: !S.frenzy, ammo: P.inv[w], weapon: P.weapon, overlap };
});
check('a mission start ends a skull frenzy; ammo bought mid-frenzy is kept', fm.started && fm.bought === 10 && fm.stillInf && fm.ended && fm.ammo === 10 && fm.weapon === 'pistol', fm);
check('the frenzy readout never covers the pager', fm.started && !fm.overlap, fm);

const nan = await t.eval(() => { const X = PG.gta, P = X.player, a = P.inv.pistol, u = P.inv.uzi; return { got: X.giveWeapon('pistol', 'lots') + X.giveWeapon('uzi', NaN), same: P.inv.pistol === a && P.inv.uzi === u, pk: X.spawnPickup('cash', NaN, 3) }; });
check('nonsense ammo or positions are refused', nan.got === 0 && nan.same && nan.pk === null, nan);

const dropsFps = await t.eval(async () => {   // a massacre's worth of drops: same things merge, the rest is capped, frame rate holds
  const X = PG.gta, P = X.player, A = window.__arena(2), S = X.weapons;
  P.ped.y = A.y - 12;
  const a = X.spawnPickup('cash', A.x, A.y, { amount: 20, ttl: 30 }), b = X.spawnPickup('cash', A.x + 0.6, A.y + 0.4, { amount: 35, ttl: 30 });
  for (let i = 0; i < 120; i++) X.spawnPickup(['cash', 'uzi', 'pistol'][i % 3], A.x - 13 + (i % 12) * 2.2, A.y + 2 + Math.floor(i / 12) * 2.1, { amount: 5, ttl: 30 });
  await new Promise(r => requestAnimationFrame(r));
  const live = S.pickups.filter(q => !q.removed && q.ttl).length;
  let n = 0; const t0 = performance.now();
  await new Promise(r => { (function f() { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(f); else r(); })(); });
  const fps = Math.round(n / ((performance.now() - t0) / 1000));
  for (const q of S.pickups) if (q.ttl) q.removed = true;
  return { merged: a === b && a.amount === 55, live, fps };
});
check('dropped pickups merge and stay capped (36), fps holds with a street full of them', dropsFps.merged && dropsFps.live <= 36 && dropsFps.fps >= 45, dropsFps);

const air = await t.eval(() => {   // the police helicopter's door gunner fires down past the rooftops; a gunner on the ground is stopped by the wall
  const X = PG.gta, P = X.player, C = X.city;
  window.__arena(0);
  const b = C.buildings.find(b => !b.deco && b.x1 - b.x0 > 16 && b.x1 - b.x0 < 40 && b.y1 - b.y0 > 16 && Math.abs((b.x0 + b.x1) / 2 - P.ped.x) < 500 && !X.blocked(b.x0 - 2, (b.y0 + b.y1) / 2, 0.5));
  const y = (b.y0 + b.y1) / 2, hx = (b.x0 + b.x1) / 2;
  for (const p of X.peds) if (!p.isPlayer && Math.hypot(p.x - hx, p.y - y) < 45) p.removed = true;
  for (const c of X.cars) if (Math.hypot(c.x - hx, c.y - y) < 45) X.removeCar(c);
  P.ped.x = b.x0 - 2; P.ped.y = y; P.ped.hp = P.ped.maxHp = 1000; P.ped.armor = 0; X.cam.x = P.ped.x; X.cam.y = y;
  const ground = { kind: 'gunner', x: hx, y, th: Math.PI, fireCd: 0, inaccuracy: 0 };
  for (let i = 0; i < 10; i++) { ground.fireCd = 0; X.fireWeapon(ground, 'pistol', Math.PI); }
  const hpGround = P.ped.hp;
  const heli = { kind: 'heli', team: 'cop', x: hx, y, z: 24, th: Math.PI, fireCd: 0, inaccuracy: 0 };
  for (let i = 0; i < 10; i++) { heli.fireCd = 0; X.fireWeapon(heli, 'pistol', Math.PI); }
  const r = { overRoof: !!X.blocked(hx, y), hpGround, hpAir: P.ped.hp, alive: !P.ped.dead && P.state === 'play' };
  P.ped.maxHp = 100; P.ped.hp = 100; window.__calm();
  return r;
});
check('air shooters (helicopter) hit people past rooftops; ground shooters do not shoot through walls', air.overRoof && air.hpGround === 1000 && air.hpAir < 1000 && air.alive, air);

const water = await t.eval(async () => {   // the fire truck's water (X.extinguish) puts molotov pools out
  const X = PG.gta, P = X.player, A = window.__arena(0), S = X.weapons;
  X.giveWeapon('molotov', 2); P.ped.fireCd = 0;
  X.fireWeapon(P.ped, 'molotov', 0, { dist: 8 });
  await new Promise(r => setTimeout(r, 1000));
  const f = S.fires.find(f => !f.small); if (!f) return { pool: false };
  const n = X.extinguish(f.x, f.y, 1.5);
  await new Promise(r => setTimeout(r, 500));
  return { pool: true, n, left: S.fires.filter(q => !q.small).length };
});
check('X.extinguish douses molotov fire pools', water.pool && water.n >= 1 && water.left === 0, water);

const copCar = await t.eval(async () => {   // shooting a police car is a crime even with nobody near it
  const X = PG.gta, P = X.player, A = window.__arena(0), E = window.__ev;
  const cop = X.makeCar('police', A.x + 8, A.y, Math.PI / 2, { ctrl: 'parked' });
  const civ = X.makeCar('hatch', A.x - 8, A.y, Math.PI / 2, { ctrl: 'parked' });
  const c0 = E.crime.length; P.ped.fireCd = 0; X.fireWeapon(P.ped, 'pistol', Math.PI);
  const civCrimes = E.crime.slice(c0);
  const c1 = E.crime.length; P.ped.fireCd = 0; X.fireWeapon(P.ped, 'pistol', 0);
  const r = { civCrimes, copCrimes: E.crime.slice(c1), copHurt: cop.hp < cop.maxHp, civHurt: civ.hp < civ.maxHp };
  X.removeCar(cop); X.removeCar(civ); window.__calm();
  return r;
});
check('bullets in a police car report hitCopCar; a civilian car with nobody near does not', copCar.copHurt && copCar.civHurt && copCar.copCrimes.includes('hitCopCar') && !copCar.civCrimes.length, copCar);

const wall = await t.eval(() => {   // a gun dropped by someone shot against a wall lands on the pavement, not inside the building
  const X = PG.gta, C = X.city, P = X.player;
  const b = C.buildings.find(b => !b.deco && b.x1 - b.x0 > 14 && Math.abs((b.x0 + b.x1) / 2 - P.ped.x) < 500 && !X.blocked(b.x0 - 0.4, (b.y0 + b.y1) / 2, 0.33));
  let inside = 0;
  for (let i = 0; i < 12; i++) {
    const g = window.__ped(b.x0 - 0.4, (b.y0 + b.y1) / 2 + i * 0.05, { team: 'gang', weapon: 'shotgun' });
    X.damagePed(g, 500, null, 'bullet');
    const d = X.weapons.pickups.filter(q => q.id === 'shotgun' && Math.hypot(q.x - g.x, q.y - g.y) < 1.5);
    for (const q of d) { if (X.blocked(q.x, q.y)) inside++; q.removed = true; }
    g.removed = true;
  }
  return { inside };
});
check('weapon drops never land inside walls', wall.inside === 0, wall);

const knocked = await t.eval(() => { const X = PG.gta, P = X.player; window.__arena(0); X.giveWeapon('uzi', 100); X.weapons.select('uzi'); P.ped.knock = 1.5; P.ped.fireCd = 0; return P.inv.uzi; });
await t.page.keyboard.down('KeyJ'); await t.wait(300); await t.page.keyboard.up('KeyJ');
const knocked2 = await t.eval(() => { const P = PG.gta.player; P.ped.knock = 0; return P.inv.uzi; });
check('a player knocked flat cannot fire', knocked2 === knocked, { before: knocked, after: knocked2 });

const strip = await t.eval(async () => {   // the weapon strip's ammo counts follow the shooting
  const X = PG.gta, P = X.player, cv = document.querySelector('#gta-hud .w-strip');
  window.__arena(0); X.weapons.select('pistol'); X.weapons.select('uzi');
  await new Promise(r => setTimeout(r, 120));
  const a = cv.toDataURL();
  for (let i = 0; i < 5; i++) { P.ped.fireCd = 0; X.fireWeapon(P.ped, 'uzi', 0); }
  await new Promise(r => setTimeout(r, 120));
  return { on: cv.classList.contains('on'), changed: cv.toDataURL() !== a };
});
check('weapon strip ammo redraws while firing', strip.on && strip.changed, strip);

// night: tracer heads, electro cores and rocket exhausts glow above the darkness (look at the screenshot)
await t.eval(() => new Promise(r => {
  const X = PG.gta, P = X.player, A = window.__arena(0); X.clock = 23 * 60 + 30;
  X.giveWeapon('rifle', 200); X.giveWeapon('rocket', 3);
  for (let k = 0; k < 3; k++) window.__ped(A.x + 10 + k * 1.5, A.y - 4 + k * 3, { hp: 3000, maxHp: 3000 });
  let k = 0;
  (function f() { k++; P.ped.fireCd = 0; X.fireWeapon(P.ped, k === 2 ? 'rocket' : 'rifle', k === 2 ? 2.6 : Math.sin(k) * 0.3); if (k < 6) requestAnimationFrame(f); else { PG.game.status = 'freeze'; r(); } })();
}));
await t.wait(100); await t.shot('w14b-night-tracers'); await t.eval(() => { PG.game.status = 'play'; });

// ---------- 19. sound paths (unmuted) ----------
const snd = await t.eval(async () => {
  const X = PG.gta, P = X.player, A = window.__arena(0);
  PG.audio.unlock(); PG.audio.setMuted(false);
  await new Promise(r => setTimeout(r, 200));
  const kit = !!PG.audio.kit();
  for (const id of Object.keys(X.WEAPONS)) X.giveWeapon(id, 50);
  const tg = window.__ped(A.x + 6, A.y, { hp: 5000, maxHp: 5000 });
  for (const id of ['fists', 'bat', 'pistol', 'uzi', 'shotgun', 'rifle', 'electro', 'rocket', 'grenade', 'molotov']) { P.ped.fireCd = 0; X.fireWeapon(P.ped, id, id === 'rocket' ? Math.PI / 2 : 0, { dist: 8 }); await new Promise(r => setTimeout(r, 120)); }
  X.weapons.select('flamer');
  return { kit };
});
await t.page.keyboard.down('KeyJ'); await t.wait(400);
const loopOn = await t.eval(() => PG.gta.weapons.flameActive());
await t.page.keyboard.up('KeyJ'); await t.wait(300);
const loopOff = await t.eval(() => !PG.gta.weapons.flameActive());
// pause while firing: the hiss must stop
await t.page.keyboard.down('KeyJ'); await t.wait(250);
const loopOn2 = await t.eval(() => PG.gta.weapons.flameActive());
await t.eval(() => { PG.game.status = 'paused'; }); await t.wait(200);
const loopPaused = await t.eval(() => !PG.gta.weapons.flameActive());
await t.eval(() => { PG.game.status = 'play'; }); await t.wait(200);
const loopOn3 = await t.eval(() => PG.gta.weapons.flameActive());
await t.eval(() => PG.audio.setMuted(true)); await t.wait(100);
const loopMuted = await t.eval(() => !PG.gta.weapons.flameActive());
await t.page.keyboard.up('KeyJ');
check('sound effects for every weapon play without errors', !t.errors.length, snd.kit ? 'audio live' : 'audio context unavailable here');
if (snd.kit) check('flamethrower hiss loop: on while held, off on release, pause and mute', loopOn && loopOff && loopOn2 && loopPaused && loopOn3 && loopMuted, { loopOn, loopOff, loopOn2, loopPaused, loopOn3, loopMuted });
else console.log('SKIP flamethrower loop check (no audio context)');

// ---------- 20. busy firefight fps ----------
const fps = await t.eval(async () => {
  const X = PG.gta, P = X.player, A = window.__arena(-1);
  for (const id of Object.keys(X.WEAPONS)) X.giveWeapon(id, 500);
  P.ped.hp = P.ped.maxHp = 100000;
  const peds = [];
  for (let i = 0; i < 40; i++) peds.push(window.__ped(A.x + 6 + (i % 10) * 1.6, A.y - 7 + Math.floor(i / 10) * 3.5, { hp: 2000, maxHp: 2000 }));
  const cops = [];
  for (let i = 0; i < 6; i++) cops.push(window.__ped(A.x - 8, A.y - 6 + i * 2.4, { team: 'cop', weapon: i % 2 ? 'uzi' : 'pistol' }));
  for (let i = 0; i < 4; i++) X.makeCar('hatch', A.x + 4 + i * 5, A.y + 6, 0, { ctrl: 'parked' });
  let n = 0; const t0 = performance.now(); let k = 0;
  await new Promise(r => { (function f() {
    n++; k++;
    const wid = ['uzi', 'rifle', 'flamer', 'shotgun'][Math.floor(k / 30) % 4];
    X.fireWeapon(P.ped, wid, (Math.random() - 0.5) * 0.8);
    if (k % 40 === 0) { P.ped.fireCd = 0; X.fireWeapon(P.ped, 'grenade', 0.6, { dist: 14 }); }
    for (const c of cops) X.fireWeapon(c, c.weapon, Math.atan2(peds[k % 40].y - c.y, peds[k % 40].x - c.x));
    if (performance.now() - t0 < 2500) requestAnimationFrame(f); else r();
  })(); });
  const fps = n / ((performance.now() - t0) / 1000);
  P.ped.maxHp = 100; P.ped.hp = 100;
  return { fps: Math.round(fps), particles: PG.game.particles.length, peds: X.peds.length };
});
check('busy firefight keeps ~60 fps', fps.fps >= 45, fps);
await snap('w15-firefight');

// ---------- 21. restart resets everything ----------
const rs = await t.eval(async () => {
  const X = PG.gta;
  X.stop(); X.start(PG.GTA_DEF);
  await new Promise(r => setTimeout(r, 500));
  const S = X.weapons;
  return { inv: Object.keys(X.player.inv), w: X.player.weapon, pk: S.pickups.length, proj: S.projectiles.length, fires: S.fires.length, frenzy: S.frenzy, pow: S.power.double + S.power.fast };
});
check('a second game starts clean', rs.inv.join() === 'fists' && rs.w === 'fists' && rs.pk >= 15 && !rs.proj && !rs.fires && !rs.frenzy && !rs.pow, rs);
await t.shot('w16-restart');

const setS = (k, v) => t.eval(([k, v]) => { if (PG.setSetting) PG.setSetting(k, v); else (PG.settings = PG.settings || {})[k] = v; }, [k, v]);
const presetHigh = () => t.eval(() => { if (PG.applyPreset) PG.applyPreset('high'); else Object.assign(PG.settings = PG.settings || {}, { lighting: 'high', particles: 'high', detail: 'high', shadows: true, decals: 'high', pedDensity: 1, policeMax: 8, wheel: 'zoom' }); });
// ---- the mouse wheel: zoom by default; PG.settings.wheel 'weapon' switches weapons ----
const wheel = async mode => { await setS('wheel', mode); return t.eval(async () => {
  const X = PG.gta, P = X.player; if (!P.inv.pistol) X.giveWeapon('pistol', 30); if (!P.inv.uzi) X.giveWeapon('uzi', 60);
  if (P.car) X.exitCar(); P.weapon = 'pistol'; if (P.ped) P.ped.weapon = 'pistol';
  await new Promise(r => setTimeout(r, 150));
  window.dispatchEvent(new WheelEvent('wheel', { deltaY: 120 }));
  await new Promise(r => setTimeout(r, 150));
  return P.weapon;
}); };
const wz = await wheel('zoom'), ww = await wheel('weapon');
await presetHigh();
check('mouse wheel: no weapon change in zoom mode, the next weapon in weapon mode', wz === 'pistol' && ww !== 'pistol', { zoom: wz, weapon: ww });

check('no console errors', !t.errors.length, t.errors.slice(0, 5).join(' | '));
console.log(failed ? `${failed} check(s) failed` : 'all weapons checks passed');
await t.close();
process.exit(failed ? 1 : 0);
