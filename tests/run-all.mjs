// Builds the full game (all modules) to a private path and runs every tests/*.test.mjs against it.
// Usage: node tests/run-all.mjs [outDir]
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const out = path.resolve(process.argv[2] || '/tmp/gta-all');
fs.mkdirSync(out, { recursive: true });
const html = path.join(out, 'game.html');
execFileSync('node', ['tools/build.mjs', '--out', html], { stdio: 'inherit' });
const tests = fs.readdirSync('tests').filter(f => f.endsWith('.test.mjs')).sort();
let failed = 0;
for (const f of tests) {
  const t0 = Date.now();
  const r = spawnSync('node', [path.join('tests', f), html, path.join(out, 'shots', f.replace('.test.mjs', ''))], { encoding: 'utf8', timeout: 240000 });
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${f} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  if (!ok) console.log((r.stdout || '').split('\n').filter(l => /FAIL|rror/.test(l)).slice(0, 15).join('\n') + '\n' + (r.stderr || '').slice(-1500));
}
console.log(failed ? `${failed} test file(s) failed` : 'all tests passed');
process.exit(failed ? 1 : 0);
