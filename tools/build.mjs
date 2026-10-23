// Builds the single-file game: src/game.html with every src/gta/*.js module inlined.
// Usage: node tools/build.mjs [--out path] [--only core,peds,...]
// Modules load in this order: core first, then the rest alphabetically. Each module is its own
// <script> so a syntax error in one module never takes down the base game.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const out = path.resolve(opt('--out') || path.join(root, 'Take_the_Bus_Drift.html'));
const only = opt('--only') ? opt('--only').split(',').map(s => s.trim()).filter(Boolean) : null;

const dir = path.join(root, 'src/gta');
let files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3));
files.sort((a, b) => (a === 'core' ? -1 : b === 'core' ? 1 : a.localeCompare(b)));
if (only) {
  const missing = only.filter(m => !files.includes(m));
  if (missing.length) { console.error('unknown module(s): ' + missing.join(', ')); process.exit(1); }
  files = files.filter(f => only.includes(f) || f === 'core');
}
const base = fs.readFileSync(path.join(root, 'src/game.html'), 'utf8');
const MARK = '<!-- GTA_MODULES -->';
if (!base.includes(MARK)) { console.error('marker missing in src/game.html'); process.exit(1); }
const scripts = files.map(f => {
  const src = fs.readFileSync(path.join(dir, f + '.js'), 'utf8');
  if (src.includes('</script')) { console.error(f + '.js contains "</script"'); process.exit(1); }
  return `<script>\n// ---- gta/${f}.js ----\n${src.trimEnd()}\n</script>`;
}).join('\n');
// The title logo picture (tools/logo-maker.html makes it), when there is one, goes in as a data URI.
const logoPng = path.join(root, 'src/assets/title-logo.png');
const logo = fs.existsSync(logoPng) ? `<img class="logo-img" alt="" src="data:image/png;base64,${fs.readFileSync(logoPng).toString('base64')}">` : '';
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, base.replace(MARK, () => scripts).replace('<!-- TITLE_LOGO -->', () => logo));
console.log(`built ${path.relative(process.cwd(), out)} with [${files.join(', ')}] (${fs.statSync(out).size} bytes)`);
