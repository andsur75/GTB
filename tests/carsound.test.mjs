// Car sound lab: title button opens the screen, W revs the engine through the gears, sliders change
// params and persist, presets apply, Esc goes back to the title.
// Usage: node tests/carsound.test.mjs <built.html> <shotDir>
import path from 'node:path';
import { launch } from './harness.mjs';

const html = path.resolve(process.argv[2] || 'Take_the_Bus_Drift.html');
const out = path.resolve(process.argv[3] || '/tmp/gta-shots/carsound');
let fails = 0;
const check = (name, ok, info) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); if (!ok) fails++; };

const t = await launch({ html, out, start: false });
await t.wait(300);
await t.page.click('#btn-carsound');
await t.wait(200);
check('screen opens', await t.eval(() => PG.ui.screen() === 'carsound' && !document.getElementById('scr-carsound').hidden));
check('sliders built', await t.eval(() => document.querySelectorAll('#cs-grid input[type=range]').length >= 25));
const idle = await t.eval(() => PG.carSound.sim.rpm);
await t.page.keyboard.down('KeyW'); await t.wait(1500);
const rev = await t.eval(() => ({ rpm: PG.carSound.sim.rpm, kmh: PG.carSound.sim.kmh }));
await t.wait(2500);
const later = await t.eval(() => ({ gear: PG.carSound.sim.gear, kmh: PG.carSound.sim.kmh }));
await t.shot('revving');
await t.page.keyboard.up('KeyW'); await t.wait(1500);
const lift = await t.eval(() => PG.carSound.sim.rpm);
check('W raises rpm and speed', rev.rpm > idle + 1000 && rev.kmh > 5, { idle, rev });
check('gearbox shifts up', later.gear > 1, later);
check('lifting drops rpm', lift < rev.rpm, { lift });
await t.eval(() => { const i = document.getElementById('cs-cyl'); i.value = 12; i.dispatchEvent(new Event('input')); });
check('slider sets param and saves', await t.eval(() => PG.carSound.P.cyl === 12 && JSON.parse(localStorage.getItem('gtb-carsound-v1')).cyl === 12));
await t.eval(() => { const s = document.getElementById('cs-preset'); s.value = 'Bus'; s.dispatchEvent(new Event('change')); });
check('preset applies', await t.eval(() => PG.carSound.P.redline === 2800 && document.getElementById('cs-redline').value === '2800'));
await t.press('Escape');
check('Esc back to title', await t.eval(() => PG.ui.screen() === 'title'));
check('no page errors', t.errors.length === 0, t.errors);
await t.close();
process.exit(fails ? 1 : 0);
