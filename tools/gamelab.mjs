// Packages the game for GameLab (https://gamelab.attensi.com): builds the single-file game into
// dist/gamelab/index.html next to gamelab/gamelab.json and gamelab/media, zips it to dist/grand-theft-bus.zip,
// and uploads it when GAMELAB_TOKEN is set (create one at https://gamelab.attensi.com/settings).
// Usage: node tools/gamelab.mjs [--no-upload] [--notes "what changed"]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const dist = path.join(root, 'dist/gamelab'), zip = path.join(root, 'dist/grand-theft-bus.zip');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
execFileSync('node', [path.join(root, 'tools/build.mjs'), '--out', path.join(dist, 'index.html')], { stdio: 'inherit' });
fs.cpSync(path.join(root, 'gamelab/media'), path.join(dist, 'media'), { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'gamelab/gamelab.json'), 'utf8'));
if (opt('--notes')) manifest.patchNotes = opt('--notes');
fs.writeFileSync(path.join(dist, 'gamelab.json'), JSON.stringify(manifest, null, 2) + '\n');
fs.rmSync(zip, { force: true });
execFileSync('zip', ['-qr', zip, '.'], { cwd: dist });
console.log(`packed ${path.relative(process.cwd(), zip)} (${fs.statSync(zip).size} bytes)`);

if (args.includes('--no-upload')) process.exit(0);
const token = process.env.GAMELAB_TOKEN;
if (!token) { console.log('GAMELAB_TOKEN not set: upload the zip at https://gamelab.attensi.com/upload'); process.exit(0); }
const res = await fetch('https://gamelab.attensi.com/api/games', {
  method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/zip' }, body: fs.readFileSync(zip),
});
const text = await res.text();
console.log(res.status, text);
if (!res.ok) process.exit(1);
