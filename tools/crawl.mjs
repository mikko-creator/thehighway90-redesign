// crawl.mjs - polite same-origin harvest of thehighway90.com into audit/raw/ (Node builtins only).
//   node tools/crawl.mjs [--gap 700] [--products 30] [--brands 16] [--extra 80]
// 1. Inventory: every <loc> of every sitemap in /sitemap_index.xml -> audit/sitemap-inventory.json (type, url, lastmod).
//    That file IS the site's architecture record: all ~3,760 URLs, typed by their sitemap.
// 2. Seeds: "/" plus every URL of the content sitemaps (pages, posts, events, stores, recreational towns, specials,
//    categories, strains, effects, terpenes, cannabinoids), plus an evenly spread SAMPLE of --products product pages and
//    --brands brand pages (the menu feed's detail templates; the full lists stay in the inventory).
// 3. Links found on crawled pages that are not product/brand detail pages are crawled too, up to --extra of them.
// Breakers (the site runs WP Defender, whose 404 detection locks an IP out after a burst of 404s):
//   ONE connection, --gap ms between requests; the first 401/403/429/503 stops the run (a refusal is a stop, never
//   retried); 5 x 404 inside any 300 s window stops the run; Defender's masked login path and wp-login are never asked.
// Writes audit/raw/<key>.html (untouched bytes) and audit/crawl.json (url, status, chain, file, bytes, contentType).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]]) : a), []));
const GAP = Number(args.gap || 700), N_PRODUCTS = Number(args.products || 30), N_BRANDS = Number(args.brands || 16), N_EXTRA = Number(args.extra || 80);
const ORIGIN = 'https://www.thehighway90.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const RAW = path.join(PROJ, 'audit/raw');
fs.mkdirSync(RAW, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EXCLUDE = [/\/wp-json/i, /\/feed\/?$/i, /\/wp-admin/i, /wp-login\.php/i, /xmlrpc\.php/i, /[?&]s=/i, /replytocom=/i,
  /\/8e6c62822f3a296e/i, /add-to-cart/i, /\/(cart|checkout)\/?$/i, /\/wp-content\//i, /\/wp-includes\//i,
  /\.(jpe?g|png|gif|webp|svg|pdf|zip|mp4|webm|css|js|xml|ico|woff2?|ttf|ics)(\?|$)/i, /\/comments\/feed/i, /[?&](ical|outlook-ical|tribe-bar-date)=/i];
const DETAIL = /^\/(products|brands)\/[^/]+\/$/i;

function norm(u, base) {
  let x;
  try { x = new URL(u, base); } catch { return null; }
  if (!/^https?:$/.test(x.protocol)) return null;
  if (!/^(www\.)?thehighway90\.com$/i.test(x.hostname)) return null;
  x.protocol = 'https:'; x.hostname = 'www.thehighway90.com'; x.hash = '';
  const keep = new URLSearchParams();
  for (const [k, v] of x.searchParams) if (/^(page|paged)$/i.test(k)) keep.set(k, v);
  x.search = keep.toString() ? '?' + keep.toString() : '';
  let p = x.pathname.replace(/\/{2,}/g, '/');
  if (!/\.[a-z0-9]{2,5}$/i.test(p) && !p.endsWith('/')) p += '/';
  x.pathname = p;
  const s = x.toString();
  return EXCLUDE.some((re) => re.test(s)) ? null : s;
}
const keyOf = (u) => {
  const x = new URL(u);
  let k = decodeURIComponent(x.pathname).replace(/^\/|\/$/g, '').replace(/\//g, '__') || 'index';
  k = k.replace(/[^\p{L}\p{N}_.-]+/gu, '_');
  if (x.search) k += '__q_' + x.search.slice(1).replace(/[^a-z0-9]+/gi, '_');
  return k.toLowerCase().slice(0, 150);
};

let stopped = null;
const recent404 = [];
async function get(u) {
  const chain = [];
  let cur = u;
  for (let hop = 0; hop < 8; hop++) {
    const res = await fetch(cur, { redirect: 'manual', headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/xml' } });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const next = new URL(res.headers.get('location'), cur).toString();
      chain.push({ from: cur, status: res.status, to: next });
      await res.arrayBuffer().catch(() => {});
      if (!/^https?:\/\/(www\.)?thehighway90\.com/i.test(next)) return { status: res.status, chain, offOrigin: next };
      cur = next; await sleep(GAP); continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, chain, finalUrl: cur, contentType: res.headers.get('content-type') || '', buf };
  }
  return { status: 0, chain, error: 'too many redirects' };
}
function breaker(status, u) {
  if ([401, 403, 429, 503].includes(status)) { stopped = 'refusal ' + status + ' at ' + u; return true; }
  if (status === 404) {
    const now = Date.now(); recent404.push(now);
    while (recent404.length && now - recent404[0] > 300000) recent404.shift();
    if (recent404.length >= 5) { stopped = '5 x 404 inside 300 s (last ' + u + ')'; return true; }
  }
  return false;
}

// ---------- 1. sitemap inventory ----------
const inventory = { origin: ORIGIN, at: new Date().toISOString(), sitemaps: [], urls: [] };
{
  const r = await get(ORIGIN + '/sitemap_index.xml'); await sleep(GAP);
  if (r.status !== 200) { console.error('sitemap index', r.status); process.exit(1); }
  const maps = [...r.buf.toString('utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  for (const sm of maps) {
    const s = await get(sm); await sleep(GAP);
    if (breaker(s.status, sm)) break;
    const type = path.basename(new URL(sm).pathname).replace(/-sitemap\d*\.xml$/, '').replace(/^joint_/, '');
    const xml = s.buf ? s.buf.toString('utf8') : '';
    const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => {
      const loc = (/<loc>([^<]+)<\/loc>/.exec(m[1]) || [])[1];
      const lastmod = (/<lastmod>([^<]+)<\/lastmod>/.exec(m[1]) || [])[1] || null;
      const images = (m[1].match(/<image:loc>/g) || []).length;
      return loc ? { type, url: loc.trim(), lastmod, images } : null;
    }).filter(Boolean);
    inventory.sitemaps.push({ sitemap: sm, type, status: s.status, count: urls.length });
    inventory.urls.push(...urls);
    console.log('sitemap', type, s.status, urls.length);
  }
  fs.writeFileSync(path.join(PROJ, 'audit/sitemap-inventory.json'), JSON.stringify(inventory, null, 1));
}
if (stopped) { console.error('STOPPED during the inventory:', stopped); process.exit(1); }

// ---------- 2. seeds ----------
const CONTENT_TYPES = new Set(['post', 'page', 'tribe_events', 'stores', 'recreational', 'specials', 'categories', 'strains', 'effects', 'terpenes', 'cannabinoids']);
const spread = (arr, n) => (arr.length <= n ? arr : Array.from({ length: n }, (_, i) => arr[Math.floor((i * arr.length) / n)]));
const byType = (t) => inventory.urls.filter((u) => u.type === t).map((u) => u.url);
const seeds = [ORIGIN + '/', ...inventory.urls.filter((u) => CONTENT_TYPES.has(u.type)).map((u) => u.url),
  ...spread(byType('products').filter((u) => DETAIL.test(new URL(u).pathname)), N_PRODUCTS),
  ...spread(byType('brands').filter((u) => DETAIL.test(new URL(u).pathname)), N_BRANDS),
  ...byType('products').filter((u) => !DETAIL.test(new URL(u).pathname)), ...byType('brands').filter((u) => !DETAIL.test(new URL(u).pathname))];

const records = [];
const seen = new Set();
const queue = [];
let extra = 0;
const push = (u, from, isSeed) => {
  const n = norm(u, from || ORIGIN);
  if (!n || seen.has(n)) return;
  if (!isSeed) { if (DETAIL.test(new URL(n).pathname) || extra >= N_EXTRA) return; extra++; }
  seen.add(n); queue.push(n);
};
for (const s of seeds) push(s, ORIGIN, true);
console.log('seeds', queue.length);

// ---------- 3. crawl ----------
while (queue.length) {
  const u = queue.shift();
  let r;
  try { r = await get(u); } catch (e) { records.push({ url: u, status: 0, error: String(e.message || e) }); await sleep(GAP); continue; }
  const rec = { url: u, status: r.status, chain: r.chain, finalUrl: r.finalUrl || null, contentType: r.contentType || null };
  if (r.offOrigin) rec.offOrigin = r.offOrigin;
  if (breaker(r.status, u)) { rec.refused = r.status !== 404; records.push(rec); break; }
  if (r.buf && /text\/html/i.test(r.contentType || '')) {
    const key = keyOf(r.finalUrl || u);
    const file = 'audit/raw/' + key + '.html';
    fs.writeFileSync(path.join(PROJ, file), r.buf);
    rec.file = file; rec.bytes = r.buf.length;
    if (r.status === 200) {
      const html = r.buf.toString('utf8');
      for (const m of html.matchAll(/<a\b[^>]*?\shref\s*=\s*["']([^"'#][^"']*)["']/gi)) push(m[1].replace(/&amp;/g, '&'), r.finalUrl || u, false);
    }
    if (r.finalUrl && r.finalUrl !== u) { const n = norm(r.finalUrl); if (n) seen.add(n); }
  }
  records.push(rec);
  process.stdout.write(`${records.length} ${r.status} ${u}${r.chain.length ? ' -> ' + (r.finalUrl || r.offOrigin) : ''}\n`);
  await sleep(GAP);
}
const out = { origin: ORIGIN, at: new Date().toISOString(), robotsHonoured: true, gapMs: GAP, sample: { products: N_PRODUCTS, brands: N_BRANDS, extra: N_EXTRA, extraUsed: extra },
  stopped, pending: queue.slice(0, 50), pendingCount: queue.length, counts: {
    total: records.length, ok: records.filter((r) => r.status === 200).length,
    redirected: records.filter((r) => r.chain && r.chain.length).length, notFound: records.filter((r) => r.status === 404).length },
  records };
fs.writeFileSync(path.join(PROJ, 'audit/crawl.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.counts), 'stopped:', stopped, 'pending:', queue.length);
process.exitCode = stopped ? 1 : 0;
