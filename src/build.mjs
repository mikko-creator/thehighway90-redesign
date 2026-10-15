// build.mjs - Highway 90 redesign: src/content page models -> dist/ (Node builtins + cwebp/webpmux on PATH).
//   node src/build.mjs [--out dist] [--cache assets/optimized] [--only /a/,/b/] [--strict]
// Every live URL is written at its own path (/x/ -> dist/x/index.html); the live redirects become refresh stubs plus
// _redirects; images become hashed WebP variants; loops are copied byte for byte (AI label required).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, readJSON, exists, cmp, LIVE_ORIGIN } from './lib/site.mjs';
import { ImagePipeline, makeImg, makeImgSrc, makeVideo } from './lib/images.mjs';
import { renderPage, render404 } from './theme/index.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]]) : a), []));
const OUT = path.resolve(ROOT, args.out || 'dist');
const CACHE = path.resolve(ROOT, args.cache || 'assets/optimized');
const STRICT = !!args.strict || process.env.THEME_STRICT === '1';
if (!OUT.startsWith(ROOT + path.sep) || OUT === ROOT) { console.error('refusing --out outside the project: ' + OUT); process.exit(2); }
const t0 = Date.now();

// ---------- media plan: fal stills + loops ----------
const plan = {};
for (const im of readJSON('src/content/image-plan.json').images) plan[im.id] = { file: im.file || ('assets/generated/' + im.id.toLowerCase() + (im.cutout ? '.png' : '.jpg')), alt: im.alt || '' };
for (const [id, base] of Object.entries({ 'V-HERO': 'v-hero', 'V-SMOKE': 'v-smoke', 'V-NIGHT': 'v-night' })) {
  const d = 'assets/generated/video/' + base;
  plan[id] = { kind: 'video', alt: '', video: { mp4: d + '.mp4', webm: d + '.webm', ...(exists(d + '-phone.mp4') ? { mp4Phone: d + '-phone.mp4' } : {}), poster: d + '-poster.webp' } };
}

// ---------- output dir ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// ---------- assets: css + js bundles, fonts, icons ----------
const ORDER = ['tokens.css', 'base.css', 'components.css', 'chrome.css', 'motion.css', 'home.css', 'pages.css', 'mobile.css'];
const cssFiles = fs.readdirSync(path.join(ROOT, 'src/styles')).filter((f) => f.endsWith('.css')).sort((a, b) => { const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || cmp(a, b); });
const css = cssFiles.map((f) => '/* ' + f + ' */\n' + fs.readFileSync(path.join(ROOT, 'src/styles', f), 'utf8')).join('\n');
const jsFiles = fs.readdirSync(path.join(ROOT, 'src/scripts')).filter((f) => f.endsWith('.js')).sort((a, b) => (a === 'site.js' ? -1 : b === 'site.js' ? 1 : cmp(a, b)));
const js = jsFiles.map((f) => fs.readFileSync(path.join(ROOT, 'src/scripts', f), 'utf8')).join('\n;\n');
const h8 = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 10);
fs.mkdirSync(path.join(OUT, 'assets/css'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'assets/js'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'assets/fonts'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'assets/css/site.css'), css);
fs.writeFileSync(path.join(OUT, 'assets/js/site.js'), js);
for (const f of fs.readdirSync(path.join(ROOT, 'assets/fonts'))) fs.copyFileSync(path.join(ROOT, 'assets/fonts', f), path.join(OUT, 'assets/fonts', f));
for (const f of ['favicon.png', 'apple-touch-icon.png']) if (exists('assets/brand/' + f)) fs.copyFileSync(path.join(ROOT, 'assets/brand', f), path.join(OUT, f));
fs.mkdirSync(path.join(OUT, 'assets/brand'), { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, 'assets/brand')).filter((x) => /.(webp|svg)$/i.test(x))) fs.copyFileSync(path.join(ROOT, 'assets/brand', f), path.join(OUT, 'assets/brand', f));

// ---------- context ----------
const pipeline = new ImagePipeline({ cacheDir: CACHE, outDir: OUT, imagePlan: plan });
const warnings = [];
const warned = new Set();
const ctx = {
  site: { ...readJSON('src/content/site.json'), tagline: 'Recreational Cannabis, Daily Deals & Online Pickup' },
  menu: readJSON('src/content/menu.json'),
  exists,
  img: makeImg(pipeline), imgSrc: makeImgSrc(pipeline), video: makeVideo(pipeline, { strict: STRICT, warn: (m) => warnings.push(m), warned }),
  plan, origin: LIVE_ORIGIN,
  assets: { css: '/assets/css/site.css?v=' + h8(css), js: '/assets/js/site.js?v=' + h8(js) },
  warn: (m) => { if (!warned.has(ctx.cur + m)) { warned.add(ctx.cur + m); warnings.push((ctx.cur || '') + ' ' + m); } },
  cur: '',
};

// ---------- pages ----------
const dir = path.join(ROOT, 'src/content/pages');
const only = args.only ? new Set(String(args.only).split(',')) : null;
const pages = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort(cmp).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
ctx.pages = new Map(pages.map((p) => [p.path, { path: p.path, title: p.head.title, h1: p.h1, kind: p.kind }]));
// a static host decodes the request path before it looks for the file: /blog/%f0%9f%8e%83-x/ is served from "🎃-x/"
const outFile = (p) => { let d = p; try { d = decodeURIComponent(p); } catch { d = p; } return path.join(OUT, p === '/' ? 'index.html' : d.replace(/^\/|\/$/g, '') + '/index.html'); };
let written = 0;
for (const page of pages) {
  if (only && !only.has(page.path)) continue;
  ctx.cur = page.path;
  ctx.stores = 0;
  let html;
  try { html = renderPage(page, ctx); } catch (e) { console.error('RENDER FAIL', page.path, e.stack); process.exitCode = 1; continue; }
  const f = outFile(page.path);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, html);
  written++;
}
ctx.cur = '/404.html';
fs.writeFileSync(path.join(OUT, '404.html'), render404(ctx));

// ---------- redirects (B9): refresh stubs + _redirects ----------
const redirects = ctx.site.redirects || [];
for (const r of redirects) {
  const f = outFile(r.from);
  if (fs.existsSync(f)) continue;
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Redirecting</title><link rel="canonical" href="' + LIVE_ORIGIN + r.to + '"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0; url=' + r.to + '"></head><body><p><a href="' + r.to + '">' + r.to + '</a></p></body></html>');
}
fs.writeFileSync(path.join(OUT, '_redirects'), redirects.map((r) => r.from + ' ' + r.to + ' ' + r.status).join('\n') + '\n');

// ---------- robots + sitemap (live URLs) ----------
fs.writeFileSync(path.join(OUT, 'robots.txt'), 'User-agent: *\nDisallow:\n\nSitemap: ' + LIVE_ORIGIN + '/sitemap.xml\n');
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + pages.filter((p) => !/\/page\/\d+\/$/.test(p.path)).map((p) => '  <url><loc>' + LIVE_ORIGIN + p.path + '</loc></url>').join('\n') + '\n</urlset>\n');

// ---------- images ----------
const stats = await pipeline.run();
const pub = pipeline.publish();
const report = { built: new Date().toISOString(), pages: written, redirects: redirects.length, css: cssFiles, js: jsFiles, images: { planned: stats.planned, made: stats.made, cached: stats.cached, failed: stats.failed, copied: pub.copied, missing: pub.missing, refused: pub.refused, videos: pub.videos }, warnings, ms: Date.now() - t0 };
fs.writeFileSync(path.join(OUT, 'build-report.json'), JSON.stringify(report, null, 1));
console.log('build: pages', written, '| redirects', redirects.length, '| images planned', stats.planned, 'made', stats.made, 'failed', stats.failed.length, '| copied', pub.copied, '| missing', pub.missing.length, '| videos', pub.videos.length, '| warnings', warnings.length, '|', ((Date.now() - t0) / 1000).toFixed(1) + 's');
for (const w of warnings.slice(0, 25)) console.log('  warn', w);
if (stats.failed.length || pub.missing.length || (STRICT && warnings.length)) process.exitCode = 1;
