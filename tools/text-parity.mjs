// text-parity.mjs - every word of every page model must appear in its BUILT page (word-multiset recall).
//   node tools/text-parity.mjs [--dir dist] [--min 0.99]
// The model side is the same text set tools/extract.mjs proves against the live site; the built side is the visible
// text of dist/<path>/index.html (tags, scripts, styles and JSON removed; entities decoded). A positive control removes
// the largest section's words from one built page and requires that page's recall to fall below --min.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode, squash } from '../src/lib/html-util.mjs';
import { htmlToText } from '../src/lib/extract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]]) : a), []));
const DIR = path.resolve(ROOT, args.dir || 'dist');
const MIN = Number(args.min || 0.99);
const RESIDUE = /^Get ready for liftoff!\s*ORDER DELIVERY\s*/i;   // D8: excerpt template residue, removed on purpose

function modelText(node, acc = [], key = '') {
  if (node == null || typeof node !== 'object') return acc;
  if (Array.isArray(node)) { for (const x of node) modelText(x, acc, key); return acc; }
  const both = typeof node.html === 'string' && typeof node.text === 'string';   // headings and list items carry the same words twice
  for (const [k, v] of Object.entries(node)) {
    if (k === 'head' || k === 'unknownWidgets' || k === 'img' || k === 'alt') continue;
    if (both && k === 'text') continue;
    if (['html', 'caption', 'h1Html'].includes(k) && typeof v === 'string') acc.push(htmlToText(v));
    else if (k === 'excerpt' && typeof v === 'string') acc.push(v.replace(RESIDUE, ''));
    else if (['text', 'q', 'title', 'name', 'heading', 'date', 'more', 'submit', 'label', 'placeholder'].includes(k) && typeof v === 'string') acc.push(v);
    else if (k === 'notes' && Array.isArray(v)) acc.push(...v);
    else if (typeof v === 'object') modelText(v, acc, k);
  }
  return acc;
}
const words = (s) => (squash(s).toLowerCase().normalize('NFKC').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').match(/[\p{L}\p{N}][\p{L}\p{N}'$%.-]*/gu) || []).map((w) => w.replace(/[.'-]+$/, ''));
function builtText(html) {
  return decode(html.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\splaceholder="([^"]*)"/gi, ' >$1< ').replace(/<[^>]+>/g, ' '));
}
function recall(src, got) {
  const bag = new Map(); for (const w of words(got)) bag.set(w, (bag.get(w) || 0) + 1);
  const miss = []; let hit = 0; const all = words(src);
  for (const w of all) { const c = bag.get(w) || 0; if (c > 0) { bag.set(w, c - 1); hit++; } else miss.push(w); }
  return { n: all.length, r: all.length ? hit / all.length : 1, miss };
}
const pagesDir = path.join(ROOT, 'src/content/pages');
const rows = [];
let low = 0;
for (const f of fs.readdirSync(pagesDir).filter((x) => x.endsWith('.json')).sort()) {
  const m = JSON.parse(fs.readFileSync(path.join(pagesDir, f), 'utf8'));
  const out = path.join(DIR, m.path === '/' ? 'index.html' : m.path.replace(/^\/|\/$/g, '') + '/index.html');
  if (!fs.existsSync(out)) { rows.push({ path: m.path, r: 0, missingPage: true }); low++; continue; }
  const r = recall(modelText(m).join(' '), builtText(fs.readFileSync(out, 'utf8')));
  rows.push({ path: m.path, words: r.n, r: +r.r.toFixed(4), miss: r.r < MIN ? r.miss.slice(0, 25) : undefined });
  if (r.r < MIN) low++;
}
// positive control: the home page minus its largest section's words must fall below MIN
const home = JSON.parse(fs.readFileSync(path.join(pagesDir, 'index.json'), 'utf8'));
const big = home.sections.map((s, i) => [i, modelText(s).join(' ')]).sort((a, b) => b[1].length - a[1].length)[0];
let built = builtText(fs.readFileSync(path.join(DIR, 'index.html'), 'utf8'));
for (const w of new Set(words(big[1]))) built = built.replace(new RegExp('(^|[^\\p{L}\\p{N}])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[^\\p{L}\\p{N}])', 'giu'), '$1');
const ctl = recall(modelText(home).join(' '), built).r;
const fired = ctl < MIN;
console.log('text-parity', DIR, '| pages', rows.length, '| below', MIN + ':', low, '| min', Math.min(...rows.map((x) => x.r)).toFixed(4), '| control (home minus its largest section):', ctl.toFixed(4), fired ? 'fires' : 'DID NOT FIRE');
for (const x of rows.filter((y) => y.r < MIN).slice(0, 20)) console.log('  LOW', x.r, x.path, x.missingPage ? '(no built page)' : (x.miss || []).join(' '));
process.exitCode = low || !fired ? 1 : 0;
