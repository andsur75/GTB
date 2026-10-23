// HUD module test: car radio (stations, switching, memory per car, police scanner, ducking, stops on exit /
// pause / mute / stop), speedometer, wanted badges, vignette + heartbeat, combos, money deltas, district
// banner, big map + legend, pause rap sheet, second game, fps; then touch controls on an emulated phone.
// Usage: node tests/hud.test.mjs <built.html> <shotDir>
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { launch, fpsSkip } from './harness.mjs';

const html = path.resolve(process.argv[2] || 'Take_the_Bus_Drift.html');
const out = path.resolve(process.argv[3] || '/tmp/gta-shots/hud');
fs.mkdirSync(out, { recursive: true });
let fails = 0;
const check = (name, ok, info) => { if (fpsSkip(name, ok, info)) return; console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); if (!ok) fails++; };

// ---------------------------------------------------------------- desktop
const t = await launch({ html, out });
const ev = (fn, a) => t.eval(fn, a);
await t.wait(500);
const mods = await ev(() => PG.gta.modules.map(m => m.name));
console.log('modules:', mods.join(', '));
const solo = mods.length <= 2;

check('hud module loaded', mods.includes('hud'));
const dom = await ev(() => { const q = s => document.querySelector(s); const disp = s => q(s) ? getComputedStyle(q(s)).display : 'missing';
  return { dash: !!q('#gta-hud .h-dash'), card: !!q('#gta-hud .h-card'), vig: !!q('#gta-hud .h-vig'), kills: !!q('#gta-hud .g-tr .h-kills'), legend: !!q('#gta-hud .h-legend'), bmap: !!q('#gta-hud .h-bmap'), touch: disp('#gta-hud .h-touch'), pstats: !!q('#scr-pause .h-pstats.gta-only') }; });
check('HUD elements built', dom.dash && dom.card && dom.vig && dom.kills && dom.legend && dom.bmap && dom.pstats, dom);
check('touch controls hidden on desktop', dom.touch === 'none', dom.touch);

// audio on: the harness starts muted; the click on the GTA button unlocked the context
const audio = await ev(() => { PG.audio.setMuted(false); const c = PG.audio.ctx(); return { state: c && c.state, kit: !!PG.audio.kit() }; });
check('audio unlocked and unmuted', audio.kit, audio);

const enterNearest = (kind) => ev(k => {
  const X = PG.gta, P = X.player;
  let c;
  if (k) { const pt = X.nearestRoadPoint(P.ped.x + 30, P.ped.y + 30); c = X.makeCar(k, pt.x, pt.y, pt.horiz ? 0 : Math.PI / 2, { keep: true }); }
  else c = X.cars.filter(c => c.ctrl === 'parked' && !c.wrecked).sort((a, b) => Math.hypot(a.x - P.ped.x, a.y - P.ped.y) - Math.hypot(b.x - P.ped.x, b.y - P.ped.y))[0];
  if (!c) return null;
  const d = X.doorSpot(c, -1) || X.doorSpot(c, 1); if (!d) return null;
  P.ped.x = d.x; P.ped.y = d.y; P.ped.vx = P.ped.vy = 0; X.cam.x = d.x; X.cam.y = d.y;
  c.hudTag = Math.random(); window.__car = c;
  X.enterCar(c); return { model: c.model.id, tag: c.hudTag };
}, kind);
const R = () => ev(() => { const r = PG.gta.radio; return { step: r.step, st: r.station, on: r.on, notes: r.stats.notes, lines: r.stats.lines, songs: r.stats.songs, lcd: r.lcd, duck: r.duck, song: r.song, dial: r.dial(), linked: r._A.linked, hiss: !!r._A.hiss }; });

// ---- radio in a civilian car
const car1 = await enterNearest();
await t.wait(1600);
const inCar = await ev(() => !!PG.gta.player.car);
check('entered a car', inCar && !!car1, car1);
let r0 = await R();
await t.wait(1000);
let r1 = await R();
check('radio plays on entering a car', r0.on && r0.st && r0.st !== 'scanner' && r1.notes > r0.notes + 2, { st: r0.st, notes: [r0.notes, r1.notes] });
check('dial has 5 stations + off', r1.dial.length === 6 && r1.dial.includes('off') && ['fjord', 'pillar', 'bass', 'classics', 'artur'].every(s => r1.dial.includes(s)), r1.dial);
const vis = await ev(() => ({ car: document.getElementById('gta-hud').classList.contains('h-car'), card: document.querySelector('#gta-hud .h-card').classList.contains('on'), cardText: document.querySelector('#gta-hud .h-card b').textContent }));
check('station card + dashboard shown in car', vis.car && vis.card && vis.cardText.length > 2, vis);
check('LCD shows the station', r1.lcd.length > 5, r1.lcd);
const carBar = await ev(() => { const r = document.querySelector('#gta-hud .g-bar.car').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
check('car health bar is a slim bar (not a car-picker card)', carBar.h > 4 && carBar.h <= 14 && carBar.w >= 100, carBar);
await t.shot('hud-01-car-radio');

// drive a bit: speedometer
await t.hold(['KeyW'], 1500);
const speedo = await ev(() => { const cv = document.querySelector('#gta-hud .h-speedo'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 0) n++; return { n, kmh: Math.round(PG.gta.player.car.speed * 3.6) }; });
check('speedometer drawn while driving', speedo.n > 500 && speedo.kmh > 5, speedo);
await t.shot('hud-02-driving');

// switch through every station with R
const seen = new Set([r1.st]);
let notesOk = true, cardOk = true; const notesInfo = [];
for (let i = 0; i < 6; i++) {
  await t.press('KeyR'); await t.wait(900);
  const a = await R(); seen.add(a.st);
  const card = await ev(() => document.querySelector('#gta-hud .h-card').classList.contains('on'));
  cardOk = cardOk && card;
  if (a.st === 'off') {
    await t.wait(400); const b = await R();
    check('radio off: silent', !b.on && b.notes - a.notes <= 2 && /OFF/.test(b.lcd), { notes: [a.notes, b.notes], lcd: b.lcd });
  } else if (a.st === 'artur') {
    await t.wait(2600); const b = await R();
    check('Artur Talk speaks (yap lines)', b.lines > a.lines && b.notes > a.notes + 10 && b.lcd.length > 10, { lines: [a.lines, b.lines], lcd: b.lcd });
    await t.shot('hud-03-artur-talk');
  } else {
    await t.wait(1200); const b = await R();
    const ok = b.on && b.notes > a.notes + 1 && b.step > a.step + 3 && !!b.song;
    if (!ok) notesInfo.push({ st: a.st, on: b.on, notes: [a.notes, b.notes], step: [a.step, b.step], song: b.song, state: await ev(() => ({ s: PG.gta.player.state, car: !!PG.gta.player.car, status: PG.game.status, call: !!(PG.gta.missions && PG.gta.missions.call) })) });
    notesOk = notesOk && ok;
    if (a.st === 'classics') await t.shot('hud-04-classics');
  }
}
check('R cycles through all 6 dial positions', seen.size === 6, [...seen]);
check('music stations schedule notes + have songs', notesOk, notesInfo.length ? notesInfo : undefined);
check('station card pops on every switch', cardOk);
await t.press('KeyR'); await t.wait(300);
await ev(() => { if (PG.gta.radio.station === 'off') PG.gta.radio.next(); });
const prevSt = (await R()).st;
await t.page.keyboard.down('ShiftLeft'); await t.press('KeyR'); await t.page.keyboard.up('ShiftLeft'); await t.wait(200);
const back = await R();
await ev(() => PG.gta.radio.next()); await t.wait(200);
check('Shift+R steps back', back.st !== prevSt && (await R()).st === prevSt, { prevSt, back: back.st });

// ducking under the pager
await ev(() => PG.gta.radio.set('fjord'));
await t.wait(400);
await ev(() => PG.gta.pager('HUD test: the radio should duck under this pager message.', 1500));
await t.wait(300);
const ducked = await R();
await t.wait(1800);
const unducked = await R();
check('radio ducks under the pager', ducked.duck < 0.5 && unducked.duck > 0.9, { ducked: ducked.duck, after: unducked.duck });

// pause stops it, resume brings it back
await ev(() => PG.gta.radio.set('pillar'));
await t.wait(500);
await t.press('KeyP'); await t.wait(500);
const p1 = await R(); await t.wait(600); const p2 = await R();
check('pause halts the radio', !p1.on && p2.notes === p1.notes, { on: p1.on, notes: [p1.notes, p2.notes] });
await t.shot('hud-05-pause-rapsheet');
const sheet = await ev(() => { const e = document.querySelector('#scr-pause .h-pstats'); return { vis: getComputedStyle(e).display !== 'none' && e.offsetHeight > 50, text: e.textContent }; });
check('pause screen rap sheet', sheet.vis && /Rap sheet/.test(sheet.text) && /Kills/.test(sheet.text) && /Top speed/.test(sheet.text), sheet.text.slice(0, 120));
await t.press('KeyP'); await t.wait(700);
const p3 = await R(); await t.wait(500); const p4 = await R();
check('radio resumes after pause', p3.on && p4.notes > p3.notes, { notes: [p3.notes, p4.notes] });

// mute stops it
await ev(() => PG.audio.setMuted(true)); await t.wait(400);
const m1 = await R(); await t.wait(500); const m2 = await R();
check('mute halts the radio', !m1.on && m2.notes === m1.notes, { on: m1.on, notes: [m1.notes, m2.notes] });
await ev(() => PG.audio.setMuted(false)); await t.wait(500);
check('unmute restarts the radio', (await R()).on);

// each car remembers its station; exiting stops the music
await ev(() => PG.gta.radio.set('classics')); await t.wait(200);
await ev(() => { const c = PG.gta.player.car; if (c.dv) { c.dv.vx = c.dv.vy = 0; c.dv.v = 0; } });
await t.wait(300);
await t.press('KeyF'); await t.wait(500);
const ex1 = await R(); await t.wait(500); const ex2 = await R();
check('exiting the car stops the radio', !ex1.on && ex2.notes - ex1.notes <= 1 && !ex2.linked && ex2.st === null, { notes: [ex1.notes, ex2.notes], linked: ex2.linked });
check('dashboard hidden on foot', await ev(() => !document.getElementById('gta-hud').classList.contains('h-car')));
const car1Tag = await ev(() => window.__car.hudStation);
check('car remembers its station', car1Tag === 'classics', car1Tag);
// police car: scanner
const pc = await enterNearest('police');
await t.wait(1800);
const sc = await R();
check('police car gets the police scanner', sc.st === 'scanner' && sc.on && sc.hiss && sc.dial.join() === 'scanner,off', sc);
await t.wait(2000);
check('scanner chatter on the LCD', /DISPATCH|POLICE/.test((await R()).lcd), (await R()).lcd);
await t.shot('hud-06-scanner');
await ev(() => { const c = PG.gta.player.car; if (c.dv) { c.dv.vx = c.dv.vy = 0; } });
await t.press('KeyF'); await t.wait(500);
check('scanner hiss stops on exit', !(await R()).hiss);
// back into car 1
await ev(() => { const X = PG.gta, P = X.player, c = window.__car0 || null; return !!c; });
const back1 = await ev(tag => { const X = PG.gta, P = X.player; const c = X.cars.find(c => c.hudStation === 'classics' && !c.removed); if (!c) return null; const d = X.doorSpot(c, -1) || X.doorSpot(c, 1); P.ped.x = d.x; P.ped.y = d.y; X.enterCar(c); return c.model.id; });
await t.wait(1600);
check('re-entering the first car tunes its old station', back1 && (await R()).st === 'classics', back1);

// ---- HUD extras on foot
await ev(() => { const c = PG.gta.player.car; if (c && c.dv) { c.dv.vx = c.dv.vy = 0; } });
await t.press('KeyF'); await t.wait(600);
await ev(() => { const P = PG.gta.player; P.wanted = 3; P.wantedFlash = false; if (PG.gta.police) PG.gta.police.setWanted(3); });
await t.wait(400);
const wanted = await ev(() => { const on = [...document.querySelectorAll('#gta-hud .g-wanted i.on')]; return { n: on.length, bg: on[0] ? getComputedStyle(on[0]).backgroundImage.slice(0, 30) : '', w: on[0] ? on[0].getBoundingClientRect().width : 0 }; });
check('wanted level shows cop-head badges', wanted.n === 3 && /data:image\/png/.test(wanted.bg) && wanted.w >= 18, wanted);
await ev(() => { PG.gta.player.wanted = 0; if (PG.gta.police) PG.gta.police.clear(); });

// damage vignette
await ev(() => { const P = PG.gta.player; P.ped.hp = 100; P.ped.armor = 0; PG.gta.damagePed(P.ped, 30, null, 'bullet'); });
await t.wait(150);
const vig1 = await ev(() => +getComputedStyle(document.querySelector('#gta-hud .h-vig')).opacity);
await t.wait(1600);
const vig2 = await ev(() => +getComputedStyle(document.querySelector('#gta-hud .h-vig')).opacity);
check('damage vignette flashes then fades', vig1 > 0.35 && vig2 < vig1 * 0.4, { vig1, vig2 });
// low-health heartbeat
await ev(() => { PG.gta.player.ped.hp = 12; });
await t.wait(2200);
const hb = await ev(() => ({ beats: PG.gta.hudx.V.beats, low: document.querySelector('#gta-hud .g-bar.hp').classList.contains('h-low'), vig: +getComputedStyle(document.querySelector('#gta-hud .h-vig')).opacity }));
check('low-health heartbeat + pulse', hb.beats >= 2 && hb.low && hb.vig > 0.25, hb);
await t.shot('hud-07-low-health');
await ev(() => { PG.gta.player.ped.hp = 100; });

// kill combo + kill counter + money delta
await ev(() => {
  const X = PG.gta, P = X.player;
  for (let i = 0; i < 3; i++) { const q = X.makePed({ x: P.ped.x + 3 + i, y: P.ped.y + 2, ai: { owner: 'hudtest' } }); X.killPed(q, P.ped, i ? 'bullet' : 'car'); }
  X.money(500, 'test');
});
await t.wait(250);
const combo = await ev(() => ({ text: document.querySelector('#gta-hud .h-combo').textContent, go: /\bgo(-b)?\b/.test(document.querySelector('#gta-hud .h-combo').className), kills: document.querySelector('#gta-hud .h-kills').textContent, hidden: document.querySelector('#gta-hud .h-kills').hidden, md: [...document.querySelectorAll('#gta-hud .h-md')].map(e => e.textContent) }));
check('kill combo popup', combo.go && /TRIPLE KILL/.test(combo.text), combo.text);
const kills = await ev(() => PG.gta.player.kills);
check('kill counter matches P.kills', !combo.hidden && kills >= 3 && combo.kills.trim() === String(kills), { shown: combo.kills, kills });
check('money delta next to the money', combo.md.some(s => s === '+$500'), combo.md);
await t.shot('hud-08-combo');
const dk = await ev(() => document.querySelector('#gta-hud .g-district').dataset.k);
check('district banner labelled', dk === 'DISTRICT' || dk === 'INSIDE', dk);
const wicon = await ev(() => ({ mine: !!document.querySelector('#gta-hud .h-wicon'), theirs: !!document.querySelector('#gta-hud .w-icon'), weapons: PG.gta.has('weapons') }));
check('weapon icon present (own fallback without weapons.js)', wicon.weapons ? wicon.theirs && !wicon.mine : wicon.mine, wicon);

// big map with legend
await t.page.keyboard.down('Tab'); await t.wait(700);
const bm = await ev(() => { const c = document.querySelector('#gta-hud .h-bmap'), r = c.getBoundingClientRect(), lg = document.querySelector('#gta-hud .h-legend'), lr = lg.getBoundingClientRect(); return { big: document.getElementById('gta-hud').classList.contains('h-bigmap'), w: Math.round(r.width), x: Math.round(r.x), legend: lg.querySelectorAll('canvas').length, places: Object.keys(PG.gta.places).length, overlap: !(lr.left >= r.right || lr.top >= r.bottom), cw: c.width }; });
await t.shot('hud-09-bigmap');
await t.page.keyboard.up('Tab'); await t.wait(300);
check('big map opens on Tab', bm.big && bm.w > 400 && bm.cw > 400, bm);
check('legend lists every place, beside the map', bm.legend >= bm.places + 3 && !bm.overlap, bm);
check('big map closes on release', await ev(() => !document.getElementById('gta-hud').classList.contains('h-bigmap')));

// minimap place icons: pixel at the hideout icon is coloured
await t.shot('hud-10-foot');

// ---- fps in a busy scenario: car, loud station, traffic, combo popups, big map toggled
await enterNearest(); await t.wait(1500);
await ev(() => { PG.gta.radio.set('pillar'); PG.gta.player.wanted = 2; });
await t.page.keyboard.down('KeyW');
const perf = await ev(() => new Promise(r => {
  const m = PG.gta.modules.find(m => m.name === 'hud'), oh = m.hud, ot = m.tick; let ms = 0, n = 0;
  m.hud = function (...a) { const t0 = performance.now(); const v = oh.apply(this, a); ms += performance.now() - t0; return v; };
  m.tick = function (...a) { const t0 = performance.now(); const v = ot.apply(this, a); ms += performance.now() - t0; return v; };
  const t0 = performance.now();
  (function f() { n++; if (performance.now() - t0 < 2500) requestAnimationFrame(f); else { m.hud = oh; m.tick = ot; r({ fps: Math.round(n / 2.5), hudMs: +(ms / n).toFixed(3) }); } })();
}));
await t.page.keyboard.up('KeyW');
console.log('fps', perf.fps, 'hud ms/frame', perf.hudMs);
check('HUD + radio cost per frame < 1.5 ms (fps unaffected)', perf.hudMs < 1.5, perf);
check('fps with radio + HUD busy ' + (solo ? '>= 45' : '>= 25 (all modules, shared CPU)'), perf.fps >= (solo ? 45 : 25), perf.fps);

// ---- second game: stop + start resets everything
await ev(() => { PG.gta.stop(); PG.startLevel(PG.GTA_DEF); });
await t.wait(800);
const g2 = await ev(() => ({ st: PG.gta.radio.station, on: PG.gta.radio.on, car: document.getElementById('gta-hud').classList.contains('h-car'), kills: document.querySelector('#gta-hud .h-kills').hidden, vig: +getComputedStyle(document.querySelector('#gta-hud .h-vig')).opacity, beats: PG.gta.hudx.V.beats, combo: PG.gta.hudx.CB.n }));
check('second game starts clean', g2.st === null && !g2.on && !g2.car && g2.kills && g2.vig < 0.05 && g2.beats === 0 && g2.combo === 0, g2);
await enterNearest(); await t.wait(1600);
const g2r = await R(); await t.wait(600); const g2r2 = await R();
check('radio works in the second game', g2r.on && g2r2.notes > g2r.notes, { st: g2r.st, notes: [g2r.notes, g2r2.notes] });
await ev(() => PG.gta.stop()); await t.wait(400);
const st = await R();
check('stop() silences and unlinks the radio', !st.on && !st.linked, st);
check('no console errors (desktop)', t.errors.length === 0, t.errors.slice(0, 5).join('\n'));
await t.close();

// ---------------------------------------------------------------- phone (touch)
const pw = await import(execSync('npm root -g').toString().trim() + '/playwright/index.js');
const chromium = pw.chromium || pw.default.chromium;
async function phone(vw, vh) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('file://' + html);
  await page.evaluate(() => localStorage.setItem('ttb.v1', JSON.stringify({ nick: 'Tester', gtaIntroSeen: true, muted: true })));
  await page.reload(); await page.waitForTimeout(400);
  await page.tap('#btn-gta');
  await page.waitForSelector('#scr-ready:not([hidden])', { timeout: 8000 });
  await page.tap('#ready-go'); await page.waitForTimeout(700);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  return { browser, page, errors, touch, ev: (fn, a) => page.evaluate(fn, a), shot: n => page.screenshot({ path: path.join(out, n + '.png') }) };
}
const ph = await phone(412, 915);
// Overlap check between HUD blocks that are visible right now (core's and ours).
const layout = p => p.ev(() => {
  const box = s => { const e = document.querySelector(s); if (!e || e.hidden || getComputedStyle(e).display === 'none' || +getComputedStyle(e).opacity < 0.05 || !e.textContent && e.tagName !== 'CANVAS' && !e.children.length) return null; const r = e.getBoundingClientRect(); return r.width ? r : null; };
  const els = { map: box('#gta-hud .g-map'), dash: box('#gta-hud .h-dash'), card: box('#gta-hud .h-card'), district: box('#gta-hud .g-district'), tr: box('#gta-hud .g-tr'), tl: box('#gta-hud .g-tl'), pager: box('#gta-hud .g-pager'), hint: box('#gta-hud .g-hint'), popup: box('#gta-hud .g-popup'), radio: box('#gta-hud .pol-radio.on'), fire: box('#gta-hud .h-tb.fire'), mapb: box('#gta-hud .h-tb.map'), use: box('#gta-hud .h-tb.use') };
  const hit = (a, b) => a && b && !(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1);
  const bad = []; const k = Object.keys(els);
  for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) if (hit(els[k[i]], els[k[j]])) bad.push(k[i] + '/' + k[j]);
  const off = k.filter(n => els[n] && (els[n].left < -1 || els[n].right > innerWidth + 1)).map(n => n + ':' + Math.round(els[n].left) + '..' + Math.round(els[n].right));
  return { bad, off, shown: k.filter(n => els[n]), fit: !off.length };
});
const center = sel => ph.ev(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);
const tst = await ph.ev(() => ({ touch: PG.input.touchActive, ht: getComputedStyle(document.querySelector('#gta-hud .h-touch')).display, base: getComputedStyle(document.getElementById('touch')).display }));
check('phone: GTA touch controls shown, base wheel/pedals hidden', tst.touch && tst.ht === 'block' && tst.base === 'none', tst);
await ph.ev(() => { PG.gta.popup('Grand Theft Bus'); PG.gta.pager('Artur: HUD test. The pager must sit clear of the money, the wanted heads and the health bars.', 4000); });
await ph.page.waitForTimeout(400);
await ph.shot('hud-11-phone-foot');
const lay0 = await layout(ph);
check('phone layout on foot: no overlaps, nothing off screen', lay0.bad.length === 0 && lay0.fit, lay0);
// joystick moves the player (drag up the sidewalk / road)
const jz = await ph.ev(() => { const r = document.querySelector('#gta-hud .h-joy').getBoundingClientRect(); return { x: r.x + 100, y: r.y + r.height - 110 }; });
const pos0 = await ph.ev(() => { const P = PG.gta.player; const pt = PG.gta.nearestRoadPoint(P.ped.x, P.ped.y); P.ped.x = pt.x; P.ped.y = pt.y; return { x: pt.x, y: pt.y }; });
await ph.page.waitForTimeout(100);
await ph.touch('touchStart', [{ x: jz.x, y: jz.y, id: 1 }]);
for (let i = 1; i <= 6; i++) { await ph.touch('touchMove', [{ x: jz.x, y: jz.y - i * 12, id: 1 }]); await ph.page.waitForTimeout(25); }
await ph.page.waitForTimeout(1000);
const mv = await ph.ev(() => PG.gta.touch.move && { x: +PG.gta.touch.move.x.toFixed(2), y: +PG.gta.touch.move.y.toFixed(2) });
await ph.shot('hud-12-phone-joystick');
await ph.touch('touchEnd', []);
await ph.page.waitForTimeout(150);
const pos1 = await ph.ev(() => ({ x: PG.gta.player.ped.x, y: PG.gta.player.ped.y, move: PG.gta.touch.move }));
const walked = Math.hypot(pos1.x - pos0.x, pos1.y - pos0.y);
check('joystick writes X.touch.move', mv && mv.y < -0.8, mv);
check('joystick moves the player', walked > 2 && pos1.y < pos0.y, { walked: +walked.toFixed(2) });
check('releasing the joystick clears move', pos1.move === null);
// fire: tap = auto-aim at the nearest ped in front, drag = aim stick
await ph.ev(() => { const X = PG.gta, P = X.player; P.ped.th = 0; const near = !(X.WEAPONS && X.WEAPONS[P.weapon] && X.WEAPONS[P.weapon].range > 4); window.__tgt = X.makePed({ x: P.ped.x + (near ? 1.6 : 5), y: P.ped.y + (near ? 0.5 : 1.2), ai: { owner: 'hudtest' } }); });
const fb = await center('#gta-hud .h-tb.fire');
await ph.touch('touchStart', [{ x: fb.x, y: fb.y, id: 2 }]);
await ph.page.waitForTimeout(200);
const aim1 = await ph.ev(() => ({ fire: PG.gta.touch.fire, aim: PG.gta.touch.aim, want: Math.atan2(window.__tgt.y - PG.gta.player.ped.y, window.__tgt.x - PG.gta.player.ped.x), marker: document.querySelector('#gta-hud .h-aim').classList.contains('on') }));
await ph.shot('hud-13-phone-autoaim');
for (let i = 1; i <= 4; i++) { await ph.touch('touchMove', [{ x: fb.x, y: fb.y + i * 10, id: 2 }]); await ph.page.waitForTimeout(25); }
await ph.page.waitForTimeout(100);
const aim2 = await ph.ev(() => ({ fire: PG.gta.touch.fire, aim: PG.gta.touch.aim }));
await ph.touch('touchEnd', []);
await ph.page.waitForTimeout(100);
const aim3 = await ph.ev(() => ({ fire: PG.gta.touch.fire, aim: PG.gta.touch.aim }));
check('fire button: tap auto-aims at the target', aim1.fire && aim1.aim != null && Math.abs(aim1.aim - aim1.want) < 0.05 && aim1.marker, aim1);
check('fire button: drag aims (down = +90deg)', aim2.fire && aim2.aim != null && Math.abs(aim2.aim - Math.PI / 2) < 0.15, aim2);
check('fire released clears fire + aim', !aim3.fire && aim3.aim === null, aim3);
await ph.ev(() => { if (window.__tgt) window.__tgt.removed = true; });
// sprint toggle feeds Shift
const sb = await center('#gta-hud .h-tb.sprint');
await ph.page.touchscreen.tap(sb.x, sb.y); await ph.page.waitForTimeout(100);
const spr = await ph.ev(() => PG.gta.input.any('ShiftLeft', 'ShiftRight'));
await ph.page.touchscreen.tap(sb.x, sb.y); await ph.page.waitForTimeout(100);
check('sprint button toggles Shift', spr && !(await ph.ev(() => PG.gta.input.any('ShiftLeft', 'ShiftRight'))));
// map: hold for the big map
const mb = await center('#gta-hud .h-tb.map');
await ph.touch('touchStart', [{ x: mb.x, y: mb.y, id: 3 }]);
await ph.page.waitForTimeout(600);
const pbig = await ph.ev(() => ({ big: document.getElementById('gta-hud').classList.contains('h-bigmap'), tab: PG.gta.input.down('Tab'), w: Math.round(document.querySelector('#gta-hud .h-bmap').getBoundingClientRect().width) }));
await ph.shot('hud-14-phone-bigmap');
await ph.touch('touchEnd', []); await ph.page.waitForTimeout(250);
check('MAP button held = big map', pbig.big && pbig.tab && pbig.w > 300, pbig);
check('MAP released closes it', await ph.ev(() => !document.getElementById('gta-hud').classList.contains('h-bigmap')));
// use: get into a car
await ph.ev(() => { const X = PG.gta, P = X.player, C = X.city; const pt = X.nearestRoadPoint(P.ped.x, P.ped.y); const x = pt.horiz ? pt.x : C.xs[pt.idx] + C.wx[pt.idx] / 4, y = pt.horiz ? C.ys[pt.idx] - C.wy[pt.idx] / 4 : pt.y; const c = X.makeCar('hatch', x, y, pt.horiz ? Math.PI : Math.PI / 2, { keep: true }); const d = X.doorSpot(c, -1) || X.doorSpot(c, 1); P.ped.x = d.x; P.ped.y = d.y; X.cam.x = d.x; X.cam.y = d.y; });
await ph.page.waitForTimeout(150);
const ub = await center('#gta-hud .h-tb.use');
await ph.page.touchscreen.tap(ub.x, ub.y);
await ph.page.waitForTimeout(1700);
const inc = await ph.ev(() => ({ car: !!PG.gta.player.car, mode: document.querySelector('#gta-hud .h-touch').className, use: document.querySelector('#gta-hud .h-tb.use').textContent, radio: getComputedStyle(document.querySelector('#gta-hud .h-tb.radio')).display, weap: getComputedStyle(document.querySelector('#gta-hud .h-tb.weap')).display }));
check('USE button enters a car', inc.car, inc);
check('car button set (EXIT, RADIO shown, WPN hidden)', /car/.test(inc.mode) && inc.use === 'EXIT' && inc.radio !== 'none' && inc.weap === 'none', inc);
await ph.ev(() => PG.audio.setMuted(false));
await ph.page.waitForTimeout(400);
const st0 = await ph.ev(() => PG.gta.radio.station);
const rb = await center('#gta-hud .h-tb.radio');
await ph.page.touchscreen.tap(rb.x, rb.y); await ph.page.waitForTimeout(300);
const st1 = await ph.ev(() => PG.gta.radio.station);
check('RADIO button switches station', st0 && st1 && st0 !== st1, { st0, st1 });
const hb2 = await center('#gta-hud .h-tb.hand');
await ph.touch('touchStart', [{ x: hb2.x, y: hb2.y, id: 4 }]); await ph.page.waitForTimeout(150);
const hand = await ph.ev(() => PG.gta.touch.hand);
await ph.touch('touchEnd', []); await ph.page.waitForTimeout(100);
check('BRAKE button = handbrake while held', hand === true && (await ph.ev(() => PG.gta.touch.hand)) === false);
// drive with the joystick (up = gas)
await ph.touch('touchStart', [{ x: jz.x, y: jz.y, id: 5 }]);
for (let i = 1; i <= 6; i++) { await ph.touch('touchMove', [{ x: jz.x, y: jz.y - i * 12, id: 5 }]); await ph.page.waitForTimeout(25); }
await ph.page.waitForTimeout(1500);
const drv = await ph.ev(() => Math.round(PG.gta.player.car.speed * 3.6));
await ph.shot('hud-15-phone-driving');
await ph.touch('touchEnd', []);
check('joystick drives the car', drv > 10, drv + ' km/h');
const lay = await layout(ph);
check('phone layout in car: no overlaps, nothing off screen', lay.bad.length === 0 && lay.fit, lay);
// contextual JOB button (jobs.js): appears in a taxi, starts and stops the job
if (await ph.ev(() => !!PG.gta.jobs)) {
  await ph.ev(() => { const X = PG.gta, P = X.player; if (P.car) { if (P.car.dv) { P.car.dv.vx = P.car.dv.vy = 0; } X.exitCar(); } });
  await ph.page.waitForTimeout(300);
  await ph.ev(() => { const X = PG.gta, P = X.player, pt = X.nearestRoadPoint(P.ped.x, P.ped.y); const c = X.makeCar('taxi', pt.x, pt.y, pt.horiz ? 0 : Math.PI / 2, { keep: true }); const d = X.doorSpot(c, -1) || X.doorSpot(c, 1); P.ped.x = d.x; P.ped.y = d.y; X.enterCar(c); });
  await ph.page.waitForTimeout(1700);
  const jb = await ph.ev(() => ({ hint: PG.gta.jobs.hint, disp: getComputedStyle(document.querySelector('#gta-hud .h-tb.job')).display, label: document.querySelector('#gta-hud .h-tb.job').textContent }));
  check('JOB button shows in a taxi', !!jb.hint && jb.disp !== 'none' && jb.label === 'JOB', jb);
  const jc = await center('#gta-hud .h-tb.job');
  await ph.page.touchscreen.tap(jc.x, jc.y); await ph.page.waitForTimeout(400);
  const ja = await ph.ev(() => ({ active: !!PG.gta.jobs.active, label: document.querySelector('#gta-hud .h-tb.job').textContent }));
  await ph.shot('hud-17-phone-taxi-job');
  await ph.page.touchscreen.tap(jc.x, jc.y); await ph.page.waitForTimeout(400);
  check('JOB button starts and stops the job', ja.active && ja.label === 'STOP' && !(await ph.ev(() => !!PG.gta.jobs.active)), ja);
}
check('no console errors (phone)', ph.errors.length === 0, ph.errors.slice(0, 5).join('\n'));
await ph.browser.close();

// landscape phone layout screenshot
const ls = await phone(915, 412);
await ls.ev(() => { const X = PG.gta, P = X.player; const c = X.cars.filter(c => c.ctrl === 'parked' && !c.wrecked).sort((a, b) => Math.hypot(a.x - P.ped.x, a.y - P.ped.y) - Math.hypot(b.x - P.ped.x, b.y - P.ped.y))[0]; const d = X.doorSpot(c, -1) || X.doorSpot(c, 1); P.ped.x = d.x; P.ped.y = d.y; X.enterCar(c); });
await ls.page.waitForTimeout(1600);
await ls.shot('hud-16-landscape-car');
check('no console errors (landscape)', ls.errors.length === 0, ls.errors.slice(0, 5).join('\n'));
await ls.browser.close();

console.log(fails ? `${fails} check(s) FAILED` : 'all hud checks passed');
process.exit(fails ? 1 : 0);
