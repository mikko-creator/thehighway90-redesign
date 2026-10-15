// harvest-assets.mjs - download the live site's per-page Elementor CSS and every image it uses (Node builtins only).
//   node tools/harvest-assets.mjs [--gap 250]
// 1. per-page CSS: every uploads/elementor/css/post-*.css linked from audit/raw/*.html -> audit/css/ (backgrounds live there)
// 2. images: <img src|data-src|data-lazy-src>, every srcset candidate, inline style url(), and url() in those CSS files,
//    on the site's own host. Size variants (-300x200) are grouped under one "original" key; the LARGEST candidate seen is
//    downloaded (the -WxH-less original when any page references it). Saved as assets/source/<yyyy>-<mm>-<name>.
// Breakers: one connection, --gap ms apart; a 401/403/429 stops the run (never retried). Failures are recorded, not hidden.
// Writes docs/data/images.json: { images: [{ key, url, file, bytes, width, height, aliases[], pages[] }], failures[] }.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, findAll } from '../src/lib/html-util.mjs';

const PROJ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]]) : a), []));
const GAP = Number(args.gap || 250);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const HOST = /^https?:\/\/(www\.)?thehighway90\.com/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const crawl = JSON.parse(fs.readFileSync(path.join(PROJ, 'audit/crawl.json'), 'utf8'));
const pages = crawl.records.filter((r) => r.file && r.status === 200 && !(r.chain && r.chain.length));
fs.mkdirSync(path.join(PROJ, 'audit/css'), { recursive: true });
fs.mkdirSync(path.join(PROJ, 'assets/source'), { recursive: true });
let stopped = null;

async function fetchBuf(u) {
  const res = await fetch(u, { headers: { 'user-agent': UA, referer: 'https://www.thehighway90.com/' } });
  if ([401, 403, 429].includes(res.status)) { stopped = res.status + ' at ' + u; throw new Error('REFUSED ' + res.status); }
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buf, type: res.headers.get('content-type') || '' };
}
const absol = (u, base) => { try { const x = new URL(u.replace(/&amp;/g, '&').trim(), base); x.protocol = 'https:'; x.hostname = 'www.thehighway90.com'; return x.toString(); } catch { return null; } };
const IMG_EXT = /\.(png|jpe?g|webp|gif|svg|avif)(\.webp)?(\?|$)/i;
// the original of a WordPress size variant: name-300x200.ext -> name.ext ; logo-4.png-300x66.webp -> logo-4.png.webp
const origKey = (u) => {
  const x = new URL(u); let p = decodeURIComponent(x.pathname);
  p = p.replace(/-\d{2,5}x\d{2,5}(?=\.[a-z]{3,4}$)/i, '').replace(/\.png-\d{2,5}x\d{2,5}\.webp$/i, '.png.webp').replace(/\/elementor\/thumbs\/([^/]+?)-[a-z0-9]{20,}(\.[a-z]{3,4})$/i, '/$1$2');
  return p.toLowerCase();
};
const variantWidth = (u) => { const m = /-(\d{2,5})x(\d{2,5})(?=\.[a-z]{3,4}$)|\.png-(\d{2,5})x\d{2,5}\.webp$/i.exec(new URL(u).pathname); return m ? Number(m[1] || m[3]) : Infinity; };

// ---------- 1. CSS ----------
const cssUrls = new Set();
for (const r of pages) {
  const html = fs.readFileSync(path.join(PROJ, r.file), 'utf8');
  for (const m of html.matchAll(/href=['"]([^'"]*\/uploads\/elementor\/css\/post-\d+\.css)[^'"]*['"]/g)) cssUrls.add(absol(m[1], r.url));
  for (const m of html.matchAll(/href=['"]([^'"]*\/uploads\/trustindex-google-widget\.css)[^'"]*['"]/g)) cssUrls.add(absol(m[1], r.url));
}
const cssFiles = [];
for (const u of [...cssUrls].sort()) {
  const name = u.split('/').pop();
  const out = path.join(PROJ, 'audit/css', name);
  if (!fs.existsSync(out)) {
    try { const r = await fetchBuf(u); if (r.status === 200) fs.writeFileSync(out, r.buf); else console.log('css', r.status, u); } catch (e) { console.log('css FAIL', u, e.message); if (stopped) break; }
    await sleep(GAP);
  }
  if (fs.existsSync(out)) cssFiles.push({ url: u, file: 'audit/css/' + name });
}
console.log('css files', cssFiles.length, 'of', cssUrls.size);

// ---------- 2. image references ----------
const groups = new Map(); // origKey -> { urls:Set, pages:Set }
const addImg = (u, page) => {
  if (!u || !HOST.test(u) || !IMG_EXT.test(u) || /\/plugins\/|\/themes\//i.test(u)) return;
  const k = origKey(u);
  if (!groups.has(k)) groups.set(k, { urls: new Set(), pages: new Set() });
  groups.get(k).urls.add(u.split('?')[0]); if (page) groups.get(k).pages.add(page);
};
for (const r of pages) {
  const html = fs.readFileSync(path.join(PROJ, r.file), 'utf8');
  const root = parse(html);
  const pg = new URL(r.url).pathname;
  for (const n of findAll(root, (x) => x.tag === 'img' || x.tag === 'source' || x.tag === 'a' || x.attrs.style || x.attrs['data-settings'])) {
    for (const k of ['src', 'data-src', 'data-lazy-src', 'href']) if (n.attrs[k]) addImg(absol(n.attrs[k], r.url), pg);
    for (const k of ['srcset', 'data-srcset', 'data-lazy-srcset']) if (n.attrs[k]) for (const c of n.attrs[k].split(',')) addImg(absol(c.trim().split(/\s+/)[0], r.url), pg);
    if (n.attrs.style) for (const m of n.attrs.style.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) addImg(absol(m[1], r.url), pg);
    if (n.attrs['data-settings']) for (const m of n.attrs['data-settings'].matchAll(/"url":"([^"]+)"/g)) addImg(absol(m[1].replace(/\\\//g, '/'), r.url), pg);
  }
  for (const m of html.matchAll(/url\(\s*['"]?(https?:\/\/(?:www\.)?thehighway90\.com\/wp-content\/uploads\/[^'")]+)['"]?\s*\)/g)) addImg(absol(m[1], r.url), pg);
}
const cssPageOf = new Map(); // post-<id>.css -> pages linking it
for (const r of pages) {
  const html = fs.readFileSync(path.join(PROJ, r.file), 'utf8');
  for (const m of html.matchAll(/\/uploads\/elementor\/css\/(post-\d+\.css)/g)) { if (!cssPageOf.has(m[1])) cssPageOf.set(m[1], new Set()); cssPageOf.get(m[1]).add(new URL(r.url).pathname); }
}
for (const c of cssFiles) {
  const css = fs.readFileSync(path.join(PROJ, c.file), 'utf8');
  const pg = cssPageOf.get(path.basename(c.file));
  for (const m of css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) { const u = absol(m[1], c.url); if (pg) for (const p of pg) addImg(u, p); else addImg(u, null); }
}
// declared extras: background images that live only in LiteSpeed's per-page UCSS (one URL per line, page after a tab)
if (fs.existsSync(path.join(PROJ, 'audit/extra-images.txt'))) {
  for (const line of fs.readFileSync(path.join(PROJ, 'audit/extra-images.txt'), 'utf8').split(/\r?\n/)) {
    const [u, pg] = line.trim().split(/\t/);
    if (u && !u.startsWith('#')) addImg(u, pg || '/');
  }
}
console.log('image groups', groups.size);

// ---------- 3. download (largest candidate per group) ----------
const out = { generated: new Date().toISOString(), note: 'Real Highway 90 imagery harvested from thehighway90.com; one file per original (largest candidate seen).', images: [], failures: [] };
const used = new Set();
const sizeOf = (buf) => {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const k = buf.toString('ascii', 12, 16);
    if (k === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
    if (k === 'VP8L') { const b = buf.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)]; }
    if (k === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) { let o = 2; while (o + 9 < buf.length) { if (buf[o] !== 0xff) { o++; continue; } const m = buf[o + 1]; if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [buf.readUInt16BE(o + 7), buf.readUInt16BE(o + 5)]; o += 2 + buf.readUInt16BE(o + 2); } }
  if (buf.length > 10 && buf.toString('ascii', 0, 3) === 'GIF') return [buf.readUInt16LE(6), buf.readUInt16LE(8)];
  return [null, null];
};
for (const [k, g] of [...groups].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
  if (stopped) break;
  const cands = [...g.urls].sort((a, b) => variantWidth(b) - variantWidth(a));
  const m = /\/uploads\/(\d{4})\/(\d{2})\/([^/]+)$/.exec(k);
  let base = m ? m[1] + '-' + m[2] + '-' + m[3] : k.replace(/^\/+/, '').replace(/[\/]+/g, '-');
  base = base.replace(/[^a-z0-9._-]+/gi, '-').slice(-120);
  let name = base, i = 2; while (used.has(name)) name = base.replace(/(\.[a-z0-9]+)+$/i, '') + '-' + (i++) + (base.match(/(\.[a-z0-9]+)+$/i) || [''])[0];
  used.add(name);
  const file = 'assets/source/' + name;
  let got = null;
  if (fs.existsSync(path.join(PROJ, file))) got = { url: '(cached)', buf: fs.readFileSync(path.join(PROJ, file)) };
  for (const u of got ? [] : cands) {
    try { const r = await fetchBuf(u); await sleep(GAP); if (r.status === 200 && r.buf.length > 0) { got = { url: u, buf: r.buf }; break; } out.failures.push({ url: u, status: r.status }); } catch (e) { out.failures.push({ url: u, error: e.message }); if (stopped) break; }
  }
  if (!got) continue;
  if (got.url !== '(cached)') fs.writeFileSync(path.join(PROJ, file), got.buf);
  const [w, h] = /\.svg$/i.test(name) ? [null, null] : sizeOf(got.buf);
  out.images.push({ key: k, url: got.url === '(cached)' ? cands[0] : got.url, file, bytes: got.buf.length, width: w, height: h, aliases: cands, pages: [...g.pages].sort() });
  process.stdout.write('.');
}
out.stopped = stopped;
fs.mkdirSync(path.join(PROJ, 'docs/data'), { recursive: true });
fs.writeFileSync(path.join(PROJ, 'docs/data/images.json'), JSON.stringify(out, null, 1));
console.log('\nimages', out.images.length, 'failures', out.failures.length, 'stopped', stopped);
