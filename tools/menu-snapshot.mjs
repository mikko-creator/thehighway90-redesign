// menu-snapshot.mjs - a static snapshot of the live menu for the redesign's product rails (Node builtins only).
//   node tools/menu-snapshot.mjs [--gap 150]
// Reads the schema.org Product JSON-LD that every crawled /products/<slug>/ page carries (name, brand, offers, image)
// and writes src/content/menu.json. Product photos are the live site's own (images.dutchie.com); a Joint
// "default/<category>.jpg" placeholder is recorded as no photo. Photos are downloaded once to assets/source/menu/.
// The live menu is rendered client-side by the Joint plugin and cannot run off the client's domain: this snapshot is
// what the rails show in the preview, and docs/DECISIONS.md says so.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const PROJ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]]) : a), []));
const GAP = Number(args.gap || 150);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const crawl = JSON.parse(fs.readFileSync(path.join(PROJ, 'audit/crawl.json'), 'utf8'));
const dec = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&#8217;/g, '’').replace(/&#8211;/g, '–').trim();

const CAT_RULES = [
  ['vaporizers', /\b(cart|carts|cartridge|disposable|vape|pod|pods|aio|all[- ]in[- ]one|510)\b/i],
  ['pre-rolls', /\b(pre-?rolls?|blunts?|minis|joints?|dogwalkers?|infused minis)\b/i],
  ['concentrates', /\b(rosin|badder|batter|wax|shatter|diamonds|sauce|live resin|budder|sugar|hash|crumble|concentrate)\b/i],
  ['edibles', /\b(gummies|gummy|chocolate|chews?|bar|drink|seltzer|soda|lemonade|tablets?|mints|bites|edible|syrup|tea)\b/i],
  ['tinctures', /\b(tincture|drops)\b/i],
  ['topicals', /\b(topical|balm|lotion|salve|roll-on|patch)\b/i],
  ['accessories', /\b(pipe|banger|battery|grinder|papers?|cones?|lighter|tray|rig|bong|torch)\b/i],
  ['flower', /\b(flower|smalls|popcorn|shake|3\.5g|eighth|7g|14g|28g|oz)\b/i],
];
const DEFAULT_CAT = { vaporizers: 'vaporizers', flower: 'flower', edibles: 'edibles', accessories: 'accessories', concentrates: 'concentrates', 'pre-rolls': 'pre-rolls', prerolls: 'pre-rolls', tinctures: 'tinctures', topicals: 'topicals' };

const products = [];
for (const r of crawl.records) {
  if (!r.file || r.status !== 200) continue;
  const p = new URL(r.url).pathname;
  if (!/^\/products\/[^/]+\/$/.test(p)) continue;
  const html = fs.readFileSync(path.join(PROJ, r.file), 'utf8');
  let prod = null;
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    let j; try { j = JSON.parse(m[1]); } catch { continue; }
    const walk = (o) => { if (!o || typeof o !== 'object' || prod) return; if (Array.isArray(o)) return o.forEach(walk); if (o['@type'] === 'Product') { prod = o; return; } for (const v of Object.values(o)) walk(v); };
    walk(j);
  }
  if (!prod) continue;
  const img = typeof prod.image === 'string' ? prod.image : Array.isArray(prod.image) ? prod.image[0] : prod.image && prod.image.url;
  const def = /joint-product-photos\.s3\.amazonaws\.com\/default\/([a-z-]+)\.jpg/i.exec(img || '') || /images\.dutchie\.com\/([a-z-]+)\.jpg$/i.exec(img || '');
  const name = dec(prod.name);
  let category = def ? (DEFAULT_CAT[def[1].toLowerCase()] || null) : null;
  if (!category) for (const [c, re] of CAT_RULES) if (re.test(name) || re.test(p.replace(/-/g, ' '))) { category = c; break; }
  // flower is sold by weight: an eighth/quarter/half/ounce offer with no other signal is flower
  if (!category && (Array.isArray(prod.offers) ? prod.offers : [prod.offers || {}]).some((o) => /^\d+\/\d+oz$|^1oz$/i.test(String(o && o.name || '').trim()))) category = 'flower';
  const offers = (Array.isArray(prod.offers) ? prod.offers : prod.offers ? [prod.offers] : []).map((o) => ({ size: dec(o.name), price: Number(o.price) })).filter((o) => Number.isFinite(o.price));
  const h1 = (/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html) || [])[1];
  products.push({
    path: p, name, h1: h1 ? dec(h1.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')) : name, brand: prod.brand && prod.brand.name ? dec(prod.brand.name) : null,
    category, description: dec(prod.description || ''), offers, price: offers.length ? Math.min(...offers.map((o) => o.price)) : null,
    inStock: (Array.isArray(prod.offers) ? prod.offers : [prod.offers || {}]).some((o) => /InStock/i.test(o && o.availability || '')),
    photoUrl: def ? null : img || null, photo: null,
  });
}
// download real photos
const dir = path.join(PROJ, 'assets/source/menu');
fs.mkdirSync(dir, { recursive: true });
let got = 0, failed = [];
for (const pr of products) {
  if (!pr.photoUrl) continue;
  const id = crypto.createHash('sha256').update(pr.photoUrl).digest('hex').slice(0, 12);
  const existing = fs.readdirSync(dir).find((f) => f.startsWith(id + '.'));
  if (existing) { pr.photo = 'assets/source/menu/' + existing; continue; }
  try {
    const res = await fetch(pr.photoUrl, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', referer: 'https://www.thehighway90.com/' } });
    const buf = Buffer.from(await res.arrayBuffer());
    if (res.status !== 200 || buf.length < 500) { failed.push({ url: pr.photoUrl, status: res.status }); await sleep(GAP); continue; }
    const ext = buf[0] === 0xff && buf[1] === 0xd8 ? 'jpg' : buf.readUInt32BE(0) === 0x89504e47 ? 'png' : buf.toString('ascii', 8, 12) === 'WEBP' ? 'webp' : 'jpg';
    fs.writeFileSync(path.join(dir, id + '.' + ext), buf);
    pr.photo = 'assets/source/menu/' + id + '.' + ext; got++;
  } catch (e) { failed.push({ url: pr.photoUrl, error: e.message }); }
  await sleep(GAP);
}
products.sort((a, b) => (a.path < b.path ? -1 : 1));
const byCat = {};
for (const p of products) byCat[p.category || 'other'] = (byCat[p.category || 'other'] || 0) + 1;
fs.writeFileSync(path.join(PROJ, 'src/content/menu.json'), JSON.stringify({ note: 'Static snapshot of products from the crawled /products/ pages (schema.org JSON-LD). Prices and stock as published on ' + (crawl.at || '').slice(0, 10) + '.', generated: new Date().toISOString(), counts: byCat, products, failures: failed }, null, 1));
console.log('products', products.length, 'with photo', products.filter((p) => p.photo).length, 'downloaded', got, 'failed', failed.length, JSON.stringify(byCat));
