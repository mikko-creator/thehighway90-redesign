// hashdir.mjs - aggregate sha256 of one or more directory trees (sorted relative paths + each file's sha256), to
// prove two builds byte-identical. Positive control (--control): one byte appended to one file IN MEMORY must change
// the aggregate and the tool must name that file.
//   node tools/hashdir.mjs <dir> [<dir> ...] [--control]   -> exit 1 when the trees differ or the control fails
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2).filter((a) => a !== '--control');
const control = process.argv.includes('--control');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
function list(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) list(p, base, out); else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}
function tree(dir, mutate) {
  const files = list(dir);
  const per = new Map();
  for (const f of files) { let b = fs.readFileSync(path.join(dir, f)); if (mutate && mutate === f) b = Buffer.concat([b, Buffer.from(' ')]); per.set(f, sha(b)); }
  const agg = sha(files.map((f) => f + '\0' + per.get(f)).join('\n'));
  return { files, per, agg };
}
if (!args.length) { console.error('usage: node tools/hashdir.mjs <dir> [<dir> ...] [--control]'); process.exit(2); }
const trees = args.map((d) => ({ dir: d, ...tree(path.resolve(d)) }));
for (const t of trees) console.log(t.agg, String(t.files.length).padStart(5), 'files', t.dir);
const same = trees.every((t) => t.agg === trees[0].agg);
if (trees.length > 1) {
  console.log(same ? 'IDENTICAL' : 'DIFFERENT');
  if (!same) {
    const a = trees[0];
    for (const t of trees.slice(1)) {
      const names = new Set([...a.files, ...t.files]);
      let shown = 0;
      for (const f of [...names].sort()) if (a.per.get(f) !== t.per.get(f) && shown++ < 20) console.log('  differs:', f, 'in', t.dir);
    }
  }
}
let fired = true;
if (control) {
  const t = trees[0];
  const victim = t.files.find((f) => /\.html$/.test(f)) || t.files[0];
  const m = tree(path.resolve(t.dir), victim);
  const named = [...m.per].filter(([f, h]) => t.per.get(f) !== h).map(([f]) => f);
  fired = m.agg !== t.agg && named.length === 1 && named[0] === victim;
  console.log('control:', fired ? 'fired (one byte appended to ' + victim + ' changes the aggregate and names the file)' : 'DID NOT FIRE');
}
if (!same || !fired) process.exit(1);
