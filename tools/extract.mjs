// extract.mjs - write src/content/pages/<key>.json for every crawled page + src/content/site.json (chrome), then a
// coverage check: the visible words of each page's Elementor document (or <main> for theme archives) must be found in
// the model (word-multiset recall). Pages below 0.985 are listed with their missing words, and the run exits 1.
//   node tools/extract.mjs [--min 0.985]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractPage, extractSite, htmlToText } from '../src/lib/extract.mjs';
import { parse, findFirst, findAll, textOf, squash } from '../src/lib/html-util.mjs';

const PROJ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]]) : a), []));
const MIN = Number(args.min || 0.985);
const crawl = JSON.parse(fs.readFileSync(path.join(PROJ, 'audit/crawl.json'), 'utf8'));
const OUT = path.join(PROJ, 'src/content/pages');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const keyOf = (p) => (p === '/' ? 'index' : p.replace(/^\/|\/$/g, '').replace(/\//g, '__'));

// every text string a model carries
function modelText(node, acc = []) {
  if (node == null) return acc;
  if (typeof node === 'string') return acc;
  if (Array.isArray(node)) { for (const x of node) modelText(x, acc); return acc; }
  if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (['html', 'caption', 'h1Html'].includes(k) && typeof v === 'string') acc.push(htmlToText(v));
      else if (['text', 'q', 'title', 'name', 'label', 'heading', 'excerpt', 'date', 'more', 'submit', 'value', 'alt', 'placeholder'].includes(k) && typeof v === 'string') acc.push(v);
      else if (k === 'notes' && Array.isArray(v)) acc.push(...v);
      else if (k === 'options' && Array.isArray(v)) acc.push(...v);
      else if (typeof v === 'object') modelText(v, acc);
    }
  }
  return acc;
}
const words = (s) => (squash(s).toLowerCase().normalize('NFKC').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').match(/[\p{L}\p{N}][\p{L}\p{N}'’$%.-]*/gu) || []).map((w) => w.replace(/[.'-]+$/, ''));
function recall(src, got) {
  const bag = new Map(); for (const w of words(got)) bag.set(w, (bag.get(w) || 0) + 1);
  const miss = []; let hit = 0; const all = words(src);
  for (const w of all) { const c = bag.get(w) || 0; if (c > 0) { bag.set(w, c - 1); hit++; } else miss.push(w); }
  return { n: all.length, hit, r: all.length ? hit / all.length : 1, miss };
}

const report = { generated: new Date().toISOString(), min: MIN, pages: [], unknownWidgets: {} };
const redirects = [];
let bad = 0;
for (const rec of crawl.records) {
  if (rec.chain && rec.chain.length) { redirects.push({ from: new URL(rec.url).pathname, to: new URL(rec.finalUrl).pathname, status: rec.chain[0].status }); continue; }
  if (!rec.file || rec.status !== 200) continue;
  const m = extractPage(rec, PROJ);
  const key = keyOf(m.path);
  fs.writeFileSync(path.join(OUT, key + '.json'), JSON.stringify(m, null, 1));
  for (const u of m.unknownWidgets) report.unknownWidgets[u] = (report.unknownWidgets[u] || 0) + 1;
  // source text: the Elementor document (wp-page / wp-post), else the theme <main>
  const html = fs.readFileSync(path.join(PROJ, rec.file), 'utf8');
  const root = parse(html);
  // the same document the extractor reads: the page's own Elementor doc (not one nested in a theme template), else the
  // theme-builder template, else The Events Calendar container; joint_* widgets are client-side app shells, not copy
  const inTpl = (x) => { for (let p = x.parent; p; p = p.parent) if (p.attrs && p.attrs['data-elementor-type'] === 'single-post') return true; return false; };
  const doc = findFirst(root, (x) => /^wp-(page|post)$/.test(x.attrs['data-elementor-type'] || '') && !inTpl(x))
    || findFirst(root, (x) => /^(single-post|single-page|single|archive|search-results)$/.test(x.attrs['data-elementor-type'] || ''))
    || findFirst(root, (x) => x.attrs.id === 'tribe-events-content' || /tribe-events-l-container/.test(x.attrs.class || ''))
    || findFirst(root, (x) => x.tag === 'main');
  // Swiper loop duplicates and screen-reader-only labels are not page copy; the theme's archive excerpts are kept
  const srcText = doc ? textOf(doc, { skip: (x) => /swiper-slide-duplicate|elementor-screen-only|screen-reader-text|ti-widget|tribe-events-c-(events-bar|subscribe|view-selector|top-bar|nav|ical|search)|tribe-events-header__(events-bar|top-bar)|tribe-common-c-loader|tribe-events-sub-nav|tribe-events-c-small-cta/.test(x.attrs.class || '') && !/ti-review/.test(x.attrs.class || '') || /^joint_|^(search-form|mega-menu|theme-site-logo)\./.test(x.attrs['data-widget_type'] || '') || x.tag === 'svg' || x.tag === 'form' }) : '';
  const tiText = findAll(doc || root, (x) => /\bti-(name|review-content|footer)\b/.test(x.attrs.class || '')).map((x) => textOf(x)).join(' ');
  const got = modelText(m).join(' ');
  const r = recall(srcText + ' ' + tiText, got);
  const row = { path: m.path, key, kind: m.kind, h1: m.h1, words: r.n, recall: +r.r.toFixed(4), sections: m.sections.length };
  if (r.r < MIN) { row.missing = r.miss.slice(0, 40); bad++; }
  report.pages.push(row);
}
// positive control: the same recall on the home model minus its 3 largest sections must fall below MIN
{
  const rec = crawl.records.find((r) => new URL(r.url).pathname === '/' && r.file);
  const m = extractPage(rec, PROJ);
  const html = fs.readFileSync(path.join(PROJ, rec.file), 'utf8');
  const doc = findFirst(parse(html), (x) => x.attrs['data-elementor-type'] === 'wp-page');
  const src = textOf(doc, { skip: (x) => /swiper-slide-duplicate|elementor-screen-only|screen-reader-text/.test(x.attrs.class || '') });
  const sized = m.sections.map((s, i) => [i, modelText(s).join(' ').length]).sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]);
  const cut = { ...m, sections: m.sections.filter((_, i) => !sized.includes(i)) };
  const full = recall(src, modelText(m).join(' ')).r, ctl = recall(src, modelText(cut).join(' ')).r;
  report.control = { full: +full.toFixed(4), withoutThreeLargestSections: +ctl.toFixed(4), fired: ctl < MIN };
  console.log('control: home recall', full.toFixed(4), '-> without its 3 largest sections', ctl.toFixed(4), ctl < MIN ? '(fires)' : '(DID NOT FIRE)');
  if (!(ctl < MIN)) bad++;
}
report.redirects = redirects;
// site chrome
const home = crawl.records.find((r) => new URL(r.url).pathname === '/' && r.file);
const site = extractSite(home.file, PROJ);
fs.writeFileSync(path.join(PROJ, 'src/content/site.json'), JSON.stringify({ ...site, redirects }, null, 1));
fs.mkdirSync(path.join(PROJ, 'audit'), { recursive: true });
fs.writeFileSync(path.join(PROJ, 'audit/extract-coverage.json'), JSON.stringify(report, null, 1));
const low = report.pages.filter((p) => p.recall < MIN);
console.log('pages', report.pages.length, '| redirects', redirects.length, '| below', MIN + ':', low.length, '| unknown widgets', JSON.stringify(report.unknownWidgets));
console.log('recall min', Math.min(...report.pages.map((p) => p.recall)), 'median', report.pages.map((p) => p.recall).sort()[Math.floor(report.pages.length / 2)]);
for (const p of low.slice(0, 15)) console.log(' LOW', p.recall, p.path, (p.missing || []).join(' ').slice(0, 220));
process.exitCode = bad ? 1 : 0;
