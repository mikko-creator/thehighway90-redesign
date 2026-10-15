// crawl-add.mjs - fetch an extra, named set of product pages and merge them into audit/crawl.json (Node builtins only).
//   node tools/crawl-add.mjs [--per 12] [--gap 700]
// Picks product URLs from audit/sitemap-inventory.json by slug keyword per menu category (vapes, pre-rolls, flower,
// edibles, concentrates), evenly spread over the sitemap order, skipping URLs already crawled. Same breakers as
// tools/crawl.mjs: one connection, --gap ms apart, first 401/403/429/503 stops, 5 x 404 inside 300 s stops.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]]) : a), []));
const PER = Number(args.per || 12), GAP = Number(args.gap || 700);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const crawl = JSON.parse(fs.readFileSync(path.join(PROJ, 'audit/crawl.json'), 'utf8'));
const inv = JSON.parse(fs.readFileSync(path.join(PROJ, 'audit/sitemap-inventory.json'), 'utf8'));
const have = new Set(crawl.records.map((r) => r.url));
const products = inv.urls.filter((u) => u.type === 'products' && /\/products\/[^/]+\/$/.test(u.url)).map((u) => u.url);
const GROUPS = {
  vapes: /-(cart|carts|cartridge|disposable|vape|pod|pods|aio|all-in-one)-/,
  prerolls: /-(pre-roll|pre-rolls|preroll|prerolls|blunt|blunts|minis|joints|dogwalker|dogwalkers)-/,
  flower: /-(3-5g|eighth|7g|14g|28g|flower|smalls|popcorn|shake)-/,
  edibles: /-(gummies|gummy|chocolate|chews|chew|bar|drink|seltzer|soda|lemonade|tablets|mints|cookies-edible|bites)-/,
  concentrates: /-(rosin|badder|batter|wax|shatter|diamonds|sauce|live-resin|budder|sugar|hash|crumble)-/,
};
const spread = (arr, n) => (arr.length <= n ? arr : Array.from({ length: n }, (_, i) => arr[Math.floor((i * arr.length) / n)]));
const pick = [];
for (const [g, re] of Object.entries(GROUPS)) {
  const pool = products.filter((u) => re.test(new URL(u).pathname.replace(/\/$/, '-')) && !have.has(u) && !pick.includes(u));
  const chosen = spread(pool, PER);
  console.log(g, 'pool', pool.length, 'chosen', chosen.length);
  pick.push(...chosen);
}
const keyOf = (u) => {
  const x = new URL(u);
  let k = decodeURIComponent(x.pathname).replace(/^\/|\/$/g, '').replace(/\//g, '__') || 'index';
  return k.replace(/[^\p{L}\p{N}_.-]+/gu, '_').toLowerCase().slice(0, 150);
};
const recent404 = [];
let stopped = null, added = 0;
for (const u of pick) {
  let res;
  try { res = await fetch(u, { redirect: 'manual', headers: { 'user-agent': UA, accept: 'text/html' } }); } catch (e) { crawl.records.push({ url: u, status: 0, error: String(e.message || e), added: true }); await sleep(GAP); continue; }
  const rec = { url: u, status: res.status, chain: [], finalUrl: u, contentType: res.headers.get('content-type') || '', added: true };
  if ([401, 403, 429, 503].includes(res.status)) { rec.refused = true; crawl.records.push(rec); stopped = 'refusal ' + res.status + ' at ' + u; break; }
  if (res.status >= 300 && res.status < 400) { rec.chain.push({ from: u, status: res.status, to: new URL(res.headers.get('location'), u).toString() }); rec.finalUrl = null; await res.arrayBuffer().catch(() => {}); crawl.records.push(rec); await sleep(GAP); continue; }
  const buf = Buffer.from(await res.arrayBuffer());
  if (res.status === 404) {
    const now = Date.now(); recent404.push(now); while (recent404.length && now - recent404[0] > 300000) recent404.shift();
    crawl.records.push(rec);
    if (recent404.length >= 5) { stopped = '5 x 404 inside 300 s'; break; }
    await sleep(GAP); continue;
  }
  const file = 'audit/raw/' + keyOf(u) + '.html';
  fs.writeFileSync(path.join(PROJ, file), buf);
  rec.file = file; rec.bytes = buf.length;
  crawl.records.push(rec); added++;
  process.stdout.write(added + ' ' + res.status + ' ' + u + '\n');
  await sleep(GAP);
}
crawl.added = { at: new Date().toISOString(), tool: 'tools/crawl-add.mjs', per: PER, picked: pick.length, fetched: added, stopped };
crawl.counts = { total: crawl.records.length, ok: crawl.records.filter((r) => r.status === 200).length, redirected: crawl.records.filter((r) => r.chain && r.chain.length).length, notFound: crawl.records.filter((r) => r.status === 404).length };
fs.writeFileSync(path.join(PROJ, 'audit/crawl.json'), JSON.stringify(crawl, null, 2));
console.log('added', added, 'of', pick.length, 'stopped:', stopped, JSON.stringify(crawl.counts));
process.exitCode = stopped ? 1 : 0;
