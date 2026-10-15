// crawl-linked.mjs - fetch pages the build links to but the crawl skipped, ONLY when the live sitemap lists them
// (so no guessed URL is ever requested: a dead link on the live site stays a declared, inherited dead link).
//   node tools/crawl-linked.mjs --report tmp/linkcheck.json [--gap 700] [--brands-all]
// --brands-all also fetches every brand page in the sitemap (the brand archive links all of them).
// Same breakers as tools/crawl.mjs: one connection, first 401/403/429/503 stops, 5 x 404 inside 300 s stops.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]]) : a), []));
const GAP = Number(args.gap || 700);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const ORIGIN = 'https://www.thehighway90.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const crawl = JSON.parse(fs.readFileSync(path.join(PROJ, 'audit/crawl.json'), 'utf8'));
const inv = JSON.parse(fs.readFileSync(path.join(PROJ, 'audit/sitemap-inventory.json'), 'utf8'));
const listed = new Set(inv.urls.map((u) => u.url.replace(/^http:/, 'https:')));
const have = new Set(crawl.records.map((r) => r.url));
const want = new Set();
if (args.report) {
  const rep = JSON.parse(fs.readFileSync(path.resolve(PROJ, args.report), 'utf8'));
  for (const b of rep.broken) {
    if (b.attr !== 'href') continue;
    const v = b.value.startsWith('/') ? ORIGIN + b.value : b.value;
    if (!v.startsWith(ORIGIN)) continue;
    const u = v.split('#')[0];
    if (listed.has(u) && !have.has(u)) want.add(u);
  }
}
if (args['brands-all']) for (const u of inv.urls) if (u.type === 'brands' && /\/brands\/[^/]+\/$/.test(u.url) && !have.has(u.url)) want.add(u.url);
const list = [...want].sort();
console.log('to fetch', list.length);
const keyOf = (u) => decodeURIComponent(new URL(u).pathname).replace(/^\/|\/$/g, '').replace(/\//g, '__').replace(/[^\p{L}\p{N}_.-]+/gu, '_').toLowerCase().slice(0, 150) || 'index';
const recent404 = [];
let stopped = null, added = 0;
for (const u of list) {
  let res;
  try { res = await fetch(u, { redirect: 'manual', headers: { 'user-agent': UA, accept: 'text/html' } }); } catch (e) { crawl.records.push({ url: u, status: 0, error: String(e.message || e), added: 'linked' }); await sleep(GAP); continue; }
  const rec = { url: u, status: res.status, chain: [], finalUrl: u, contentType: res.headers.get('content-type') || '', added: 'linked' };
  if ([401, 403, 429, 503].includes(res.status)) { rec.refused = true; crawl.records.push(rec); stopped = 'refusal ' + res.status + ' at ' + u; break; }
  if (res.status >= 300 && res.status < 400) { rec.chain.push({ from: u, status: res.status, to: new URL(res.headers.get('location'), u).toString() }); rec.finalUrl = rec.chain[0].to; await res.arrayBuffer().catch(() => {}); crawl.records.push(rec); await sleep(GAP); continue; }
  const buf = Buffer.from(await res.arrayBuffer());
  if (res.status === 404) { const now = Date.now(); recent404.push(now); while (recent404.length && now - recent404[0] > 300000) recent404.shift(); crawl.records.push(rec); if (recent404.length >= 5) { stopped = '5 x 404 inside 300 s'; break; } await sleep(GAP); continue; }
  const file = 'audit/raw/' + keyOf(u) + '.html';
  fs.writeFileSync(path.join(PROJ, file), buf);
  rec.file = file; rec.bytes = buf.length; crawl.records.push(rec); added++;
  if (added % 20 === 0) console.log(added, res.status, u);
  await sleep(GAP);
}
crawl.linked = { at: new Date().toISOString(), tool: 'tools/crawl-linked.mjs', wanted: list.length, fetched: added, stopped };
crawl.counts = { total: crawl.records.length, ok: crawl.records.filter((r) => r.status === 200).length, redirected: crawl.records.filter((r) => r.chain && r.chain.length).length, notFound: crawl.records.filter((r) => r.status === 404).length };
fs.writeFileSync(path.join(PROJ, 'audit/crawl.json'), JSON.stringify(crawl, null, 2));
console.log('fetched', added, 'of', list.length, 'stopped:', stopped, JSON.stringify(crawl.counts));
process.exitCode = stopped ? 1 : 0;
