// crawl-preview.mjs — verify a deployed (or locally served) subpath preview from what the server
// actually returns: start at <base>/, follow every same-origin link, request every href/src/srcset/
// poster/action and CSS url() reference, and report non-200s and references outside the prefix.
// JSON-LD is ignored (inert). Redirects are followed (Pages 301s /dir to /dir/).
//   node src/tools/crawl-preview.mjs --base https://<user>.github.io/<Repo>/ [--concurrency 8]
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]]) : a), []));
const BASE = new URL(String(args.base));
const PREFIX = BASE.pathname.replace(/\/$/, '');
const C = Number(args.concurrency || 8);
const seenPages = new Set(), seenRefs = new Map(), outside = new Map(), bad = [];
const pageQ = [BASE.href];
// --pages-from <dir>: also request every .html file of the local copy (pages nothing links to)
if (args['pages-from']) {
  const fs = await import('node:fs'), path = await import('node:path');
  const root = path.resolve(String(args['pages-from']));
  const walk = (d) => fs.readdirSync(d).flatMap((f) => { const p = path.join(d, f); return fs.statSync(p).isDirectory() ? walk(p) : f.endsWith('.html') ? [path.relative(root, p).split(path.sep).join('/')] : []; });
  // extensionless like the site links them — except a name whose stem ends in '.', which no host maps
  // back ('Real Flavor..html'); that one is requested by its real file name
  const seed = (rel) => { const r = rel.replace(/(^|\/)index\.html$/, '$1'); const bare = r.replace(/\.html$/, ''); return bare.endsWith('.') ? r : bare; };
  for (const rel of walk(root)) pageQ.push(new URL(seed(rel).split('/').map(encodeURIComponent).join('/'), BASE).href);
}
const strip = (u) => { const x = new URL(u); x.hash = ''; return x.href; };
function refsOf(html, pageUrl) {
  html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
  const out = [];
  for (const m of html.matchAll(/\s(href|src|action|poster|data-src(?:-[a-z]+)?)="([^"]+)"/g)) out.push([m[1], m[2]]);
  for (const m of html.matchAll(/\s(?:srcset|imagesrcset)="([^"]+)"/g)) for (const p of m[1].split(',')) { const u = p.trim().split(/\s+/)[0]; if (u) out.push(['srcset', u]); }
  for (const m of html.matchAll(/&quot;(?:url|image)&quot;:&quot;([^&]+)&quot;/g)) out.push(['data-add', m[1]]);
  for (const m of html.matchAll(/url\(\s*['"]?([^'")]+)/g)) out.push(['style-url', m[1]]);
  return out.filter(([, u]) => !/^(mailto:|tel:|sms:|javascript:|data:|#)/.test(u)).map(([k, u]) => { try { return [k, strip(new URL(u.replace(/&amp;/g, '&'), pageUrl).href)]; } catch { return null; } }).filter(Boolean);
}
// polite against a real host: a small delay between requests per worker, and a 429 (rate limit) is
// waited out (Retry-After, else exponential backoff) and retried — it is the host, not the preview
const DELAY = Number(args.delay || 0);
async function get(u) {
  for (let i = 0; i < 6; i++) {
    try {
      if (DELAY) await new Promise((res) => setTimeout(res, DELAY));
      const r = await fetch(u, { redirect: 'follow' });
      if (r.status === 429 && i < 5) { const ra = Number(r.headers.get('retry-after')) || 0; await r.arrayBuffer().catch(() => {}); await new Promise((res) => setTimeout(res, Math.max(ra * 1000, 2000 * 2 ** i))); continue; }
      const ct = r.headers.get('content-type') || ''; const body = /text\/(html|css)/.test(ct) ? await r.text() : (await r.arrayBuffer(), null); return { status: r.status, ct, body, final: r.url };
    }
    catch (e) { if (i === 5) return { status: 0, err: String(e) }; await new Promise((res) => setTimeout(res, 500 * (i + 1))); }
  }
  return { status: 429 };
}
async function pool(items, fn) { let i = 0; await Promise.all(Array.from({ length: C }, async () => { while (i < items.length) { const k = i++; await fn(items[k]); } })); }
while (pageQ.length) {
  const batch = [...new Set(pageQ.splice(0))].filter((u) => !seenPages.has(u)); // one request per URL, however many pages link it
  batch.forEach((u) => seenPages.add(u));
  await pool(batch, async (u) => {
    const r = await get(u);
    if (r.status !== 200) { bad.push([r.status, u, 'page']); return; }
    if (!/text\/html/.test(r.ct)) return;
    for (const [k, ref] of refsOf(r.body, r.final)) {
      const x = new URL(ref);
      if (x.origin !== BASE.origin) continue; // off-site (canonical, maps …) — not the preview's concern
      if (!(x.pathname === PREFIX || x.pathname.startsWith(PREFIX + '/'))) { outside.set(ref, `${k} on ${u}`); continue; }
      if (k === 'href' && !/\.(css|js|webp|png|jpe?g|svg|ico|woff2?|mp4|webm|xml|txt|json|webmanifest)(\?|$)/i.test(x.pathname)) { if (!seenPages.has(ref)) pageQ.push(ref); }
      else if (!seenRefs.has(ref)) seenRefs.set(ref, `${k} on ${u}`);
    }
  });
}
const refs = [...seenRefs.keys()];
const cssRefs = [];
await pool(refs, async (u) => {
  const r = await get(u);
  if (r.status !== 200) bad.push([r.status, u, seenRefs.get(u)]);
  // comments first: browsers never fetch a url() written inside /* */ (the neo fonts.css header names "url(<file>)")
  else if (/text\/css/.test(r.ct) && r.body) for (const m of r.body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/url\(\s*(['"])data:[\s\S]*?\1\s*\)/g, '').matchAll(/url\(\s*['"]?([^'")]+)/g)) if (!m[1].startsWith('data:')) cssRefs.push([strip(new URL(m[1], r.final).href), u]);
});
await pool(cssRefs, async ([u, from]) => {
  const x = new URL(u);
  if (!(x.pathname.startsWith(PREFIX + '/'))) { outside.set(u, 'css url() in ' + from); return; }
  const r = await get(u); if (r.status !== 200) bad.push([r.status, u, 'css url() in ' + from]);
});
console.log(`base ${BASE.href}\n  pages 200: ${seenPages.size - bad.filter((b) => b[2] === 'page').length}/${seenPages.size} · assets checked ${refs.length + cssRefs.length} · non-200 ${bad.length} · references outside ${PREFIX}/ ${outside.size}`);
for (const b of bad.slice(0, 20)) console.log('  BAD', b[0], b[1], '<-', b[2]);
for (const [u, w] of [...outside].slice(0, 20)) console.log('  OUTSIDE', u, '<-', w);
process.exit(bad.length || outside.size ? 1 : 0);
