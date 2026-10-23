// Shared Playwright harness for GTA-mode tests.
// import { launch } from './harness.mjs';
// const t = await launch({ html: 'path/to/built.html' });   // opens the game straight into GTA mode, playing
// await t.hold(['KeyW'], 1500); await t.press('KeyF'); await t.eval(() => PG.gta.player.money);
// await t.shot('name');  t.errors -> console errors + page errors; await t.close();
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
const pwPath = execSync('npm root -g').toString().trim() + '/playwright/index.js';
const pw = await import(pwPath); const chromium = pw.chromium || pw.default.chromium;

export async function launch(o = {}) {
  const html = path.resolve(o.html || 'Take_the_Bus_Drift.html');
  const outDir = path.resolve(o.out || '/tmp/gta-shots');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: o.viewport || { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message + (e.stack ? '\n' + e.stack.split('\n').slice(0, 3).join('\n') : '')));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('file://' + html);
  await page.evaluate(() => localStorage.setItem('ttb.v1', JSON.stringify({ nick: 'Tester', gtaIntroSeen: true, muted: true })));
  await page.reload();
  await page.waitForTimeout(400);
  if (o.start !== false) {
    await page.click('#btn-gta');
    await page.waitForSelector('#scr-ready:not([hidden])', { timeout: 8000 });
    await page.click('#ready-go');
    await page.waitForTimeout(300);
  }
  const t = {
    page, browser, errors,
    eval: (fn, arg) => page.evaluate(fn, arg),
    wait: ms => page.waitForTimeout(ms),
    async hold(keys, ms) { for (const k of keys) await page.keyboard.down(k); await page.waitForTimeout(ms); for (const k of keys) await page.keyboard.up(k); },
    async press(key) { await page.keyboard.press(key); await page.waitForTimeout(60); },
    async shot(name) { const f = path.join(outDir, name + '.png'); await page.screenshot({ path: f }); return f; },
    async mouse(x, y) { await page.mouse.move(x, y); },
    async click(x, y, ms) { await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(ms || 80); await page.mouse.up(); },
    close: () => browser.close(),
  };
  return t;
}
