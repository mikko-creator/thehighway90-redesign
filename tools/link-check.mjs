#!/usr/bin/env node
// link-check.mjs - every internal reference in dist/ resolves to a file in dist/ (PIPELINE role). Offline: external
// links are listed per host, never fetched. Adapted from the capecodcannabis-reforge tool for werollup.com, where
// pages use ROOT-ABSOLUTE paths (/x/y/) as the source does (BUILD-CONTRACT 4.3), so a root-absolute link is normal.
// Checks, in every .html file: href, src, poster, action, formaction, cite, data-* URL values (data-lax-url,
// data-sanpedro-url, data-menu-url, data-src, ...), every srcset candidate, url() in style attributes and <style>
// blocks, and <meta content> / <link href> values that are absolute URLs on the site's own origin
// (https://werollup.com/...: canonical, og:url, og:image); in every .css file: url() and @import. Script bodies and
// comments are not read (the Jane JSON blocks hold vendor URLs, not site links).
//   - a local reference resolves to an existing file (a directory path to its index.html), never outside dist/;
//   - a reference to a directory must end in "/" (the trailing-slash output form, 4.3);
//   - "#id" must name an element id on the same page, and "page#id" an id on the target page;
//   - the form placeholder action /__form-endpoint-not-configured__ (4.7) is listed, not counted as broken.
// Positive controls (in memory, against the real file set): a missing page, a dead fragment, a missing srcset
// candidate, a missing CSS url(), a directory link without its slash, a missing og:image on the own origin, a missing
// <video poster> and a missing <source src> video (WF3b loops) must each be reported; a valid page link, an existing
// stylesheet and image, "/" and (when the tree serves one) an existing video must not be; otherwise the run fails.
//   node tools/link-check.mjs [--dir dist] [--json <report.json>]     exit 1 on any broken reference or a dead control
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN_RE = /^https?:\/\/(www\.)?thehighway90\.com(?=\/|$)/i;
const SCHEME = /^(mailto|tel|sms|data|javascript|about|blob):/i;
const EXTERNAL = /^(https?:)?\/\//i;
const FORM_PLACEHOLDER = '/__form-endpoint-not-configured__';
const decodeAttr = (s) => String(s).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const URL_ATTRS = new Set(['href', 'src', 'poster', 'action', 'formaction', 'cite']);
const SRCSET_ATTRS = new Set(['srcset', 'imagesrcset', 'data-srcset']);
const TAG_RE = /<[a-zA-Z](?:"[^"]*"|'[^']*'|[^'">])*>/g;
const ATTR_RE = /\s([^\s"'>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^'")\s]+))\s*\)/gi;

function listFiles(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(p, base, out); else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

export function refsOfHtml(html) {
  const out = [];
  const body = html.replace(/<!--[\s\S]*?-->/g, '').replace(/(<script\b(?:"[^"]*"|'[^']*'|[^'">])*>)[\s\S]*?<\/script\s*>/gi, '$1</script>');
  for (const t of body.match(TAG_RE) || []) {
    const isMeta = /^<meta\b/i.test(t);
    for (const m of t.matchAll(ATTR_RE)) {
      const name = m[1].toLowerCase();
      const val = decodeAttr(m[2] !== undefined ? m[2] : m[3]);
      if (SRCSET_ATTRS.has(name)) { for (const part of val.split(',')) { const u = part.trim().split(/\s+/)[0]; if (u) out.push({ attr: name, value: u }); } }
      else if (URL_ATTRS.has(name)) out.push({ attr: name, value: val });
      else if (name.startsWith('data-') && /^(\/|\.\.?\/|https?:\/\/)/.test(val)) out.push({ attr: name, value: val });
      else if (name === 'style') for (const u of val.matchAll(CSS_URL)) out.push({ attr: 'style-url', value: (u[1] ?? u[2] ?? u[3]).trim() });
      else if (isMeta && name === 'content' && ORIGIN_RE.test(val)) out.push({ attr: 'meta-content', value: val });
    }
  }
  for (const s of body.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) for (const u of s[1].matchAll(CSS_URL)) out.push({ attr: 'style-block-url', value: (u[1] ?? u[2] ?? u[3]).trim() });
  return out;
}
export function refsOfCss(css) {
  const out = [];
  const c = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of c.matchAll(CSS_URL)) out.push({ attr: 'css-url', value: (m[1] ?? m[2] ?? m[3]).trim() });
  for (const m of c.matchAll(/@import\s+(?:url\(\s*)?['"]([^'"]+)['"]/gi)) out.push({ attr: 'css-import', value: m[1].trim() });
  return out;
}
const idsOf = (html) => new Set([...html.matchAll(/\sid\s*=\s*(?:"([^"]+)"|'([^']+)')/gi)].map((m) => m[1] ?? m[2]));

function checkFile(rel, text, env) {
  const problems = [];
  const isHtml = /\.html?$/i.test(rel);
  const refs = isHtml ? refsOfHtml(text) : refsOfCss(text);
  const ids = isHtml ? idsOf(text) : null;
  let local = 0;
  for (const r of refs) {
    let v = r.value.trim();
    if (!v) { if (r.attr === 'href' || r.attr === 'src') problems.push({ kind: 'empty', attr: r.attr, value: v }); continue; }
    if (ORIGIN_RE.test(v)) { env.ownOrigin++; v = v.replace(ORIGIN_RE, '') || '/'; }
    else if (EXTERNAL.test(v)) { let host = '(unparsed)'; try { host = new URL(v.startsWith('//') ? 'https:' + v : v).host; } catch { /* keep */ } env.hosts[host] = (env.hosts[host] || 0) + 1; if (env.external) env.external.add(v); continue; }
    if (SCHEME.test(v)) { const s = v.split(':')[0].toLowerCase(); env.schemes[s] = (env.schemes[s] || 0) + 1; continue; }
    if (v.startsWith('#')) {
      if (isHtml && v.length > 1 && !ids.has(decodeURIComponent(v.slice(1)))) problems.push({ kind: 'dead-fragment', attr: r.attr, value: v });
      env.fragments++;
      continue;
    }
    if (v === FORM_PLACEHOLDER) { env.placeholders++; continue; }
    local++;
    let clean;
    try { clean = decodeURIComponent(v.split('#')[0].split('?')[0]); } catch { problems.push({ kind: 'bad-encoding', attr: r.attr, value: v }); continue; }
    const frag = v.includes('#') ? v.slice(v.indexOf('#') + 1) : '';
    const target = v.startsWith('/') ? path.posix.normalize(clean.replace(/^\/+/, '') || '.') : path.posix.normalize(path.posix.join(path.posix.dirname(rel), clean || '.'));
    if (target.startsWith('..')) { problems.push({ kind: 'escapes-root', attr: r.attr, value: v }); continue; }
    let cands;
    if (clean === '' && !v.startsWith('/')) cands = [rel];
    else if (clean.endsWith('/') || clean === '' || target === '.') cands = [(target === '.' ? '' : target.replace(/\/?$/, '/')) + 'index.html'];
    else cands = [target, target + '/index.html'];
    const hit = cands.find((c) => env.exists(c));
    if (!hit) { problems.push({ kind: 'missing', attr: r.attr, value: r.value, resolved: cands[0] }); continue; }
    if (hit !== target && hit.endsWith('/index.html') && !clean.endsWith('/') && clean !== '' && target !== '.') { problems.push({ kind: 'dir-without-slash', attr: r.attr, value: v }); continue; }
    if (frag && /\.html$/.test(hit)) {
      const tids = env.idsOfFile(hit);
      if (tids && !tids.has(decodeURIComponent(frag))) problems.push({ kind: 'dead-fragment', attr: r.attr, value: v });
    }
  }
  return { problems, local };
}

export function checkDist(dist) {
  const files = listFiles(dist);
  const set = new Set(files.map((f) => f.normalize('NFC')));
  const idCache = new Map();
  const env = {
    hosts: {}, schemes: {}, fragments: 0, ownOrigin: 0, placeholders: 0, external: new Set(),
    exists: (p) => set.has(p.replace(/^\.\//, '').normalize('NFC')),
    idsOfFile: (p) => { if (!idCache.has(p)) idCache.set(p, set.has(p) ? idsOf(fs.readFileSync(path.join(dist, p), 'utf8')) : null); return idCache.get(p); },
  };
  let local = 0, checked = 0;
  const broken = [];
  for (const rel of files) {
    if (!/\.(html?|css)$/i.test(rel)) continue;
    checked++;
    const r = checkFile(rel, fs.readFileSync(path.join(dist, rel), 'utf8'), env);
    local += r.local;
    for (const p of r.problems) broken.push({ file: rel, ...p });
  }
  /* positive controls, in memory, against the real file set (their counts do not enter the totals) */
  const cenv = { ...env, hosts: {}, schemes: {}, fragments: 0, ownOrigin: 0, placeholders: 0, external: null };
  const anyCss = files.find((f) => /\.css$/.test(f));
  const anyImg = files.find((f) => /\.webp$/.test(f));
  const anyDir = files.find((f) => /^[^/]+\/index\.html$/.test(f));
  const anyVideo = files.find((f) => /\.(mp4|webm)$/.test(f));
  const page = 'ctl/page/index.html';
  const dirNoSlash = anyDir ? '/' + anyDir.replace(/\/index\.html$/, '') : null;
  const ctlHtml = '<a href="/nope-control/">a</a><a href="#missing-id">c</a><img src="/' + (anyImg || 'x.webp') + '" srcset="/none-1.webp 1w, /' + (anyImg || 'none-2.webp') + ' 2w" alt="">'
    + '<a href="/">ok</a>' + (anyDir ? '<a href="/' + anyDir.replace(/index\.html$/, '') + '">ok2</a>' : '') + (anyCss ? '<link rel="stylesheet" href="/' + anyCss + '">' : '')
    + (dirNoSlash ? '<a href="' + dirNoSlash + '">d</a>' : '') + '<meta property="og:image" content="https://www.thehighway90.com/assets/img/none-control.webp">'
    + '<video preload="none" poster="/assets/img/none-poster-control.webp"><source src="/assets/video/none-control.mp4" type="video/mp4">' + (anyVideo ? '<source src="/' + anyVideo + '">' : '') + '</video>';
  const p1 = checkFile(page, ctlHtml, cenv).problems;
  const p2 = checkFile('ctl/x.css', '.a{background:url("/none-3.webp")}.b{background:url(data:image/png;base64,AAAA)}', cenv).problems;
  const has = (ps, kind, value) => ps.some((p) => p.kind === kind && p.value === value);
  const control = {
    missingPage: has(p1, 'missing', '/nope-control/'),
    deadFragment: has(p1, 'dead-fragment', '#missing-id'),
    missingSrcsetCandidate: has(p1, 'missing', '/none-1.webp'),
    missingCssUrl: has(p2, 'missing', '/none-3.webp'),
    dirWithoutSlash: dirNoSlash ? has(p1, 'dir-without-slash', dirNoSlash) : false,
    missingOwnOriginOgImage: has(p1, 'missing', 'https://www.thehighway90.com/assets/img/none-control.webp'),
    missingVideoPoster: has(p1, 'missing', '/assets/img/none-poster-control.webp'),
    missingVideoSource: has(p1, 'missing', '/assets/video/none-control.mp4'),
    validNotReported: !p1.some((p) => p.value === '/' || (anyCss && p.value === '/' + anyCss) || (anyImg && p.value === '/' + anyImg) || (anyDir && p.value === '/' + anyDir.replace(/index\.html$/, '')) || (anyVideo && p.value === '/' + anyVideo)),
  };
  control.fired = Object.values(control).every(Boolean);
  const byKind = broken.reduce((a, b) => { a[b.kind] = (a[b.kind] || 0) + 1; return a; }, {});
  const hosts = Object.fromEntries(Object.entries(env.hosts).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)));
  return { dist, files: files.length, servedVideos: files.filter((f) => /\.(mp4|webm)$/.test(f)).length, filesChecked: checked, localRefs: local, ownOriginRefs: env.ownOrigin, formPlaceholders: env.placeholders, fragmentsChecked: env.fragments, externalHosts: hosts, externalUrls: [...env.external].sort(), schemes: env.schemes, broken, byKind, control };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i === -1 ? null : process.argv[i + 1]; };
  const dist = path.resolve(arg('--dir') || path.join(ROOT, 'dist'));
  const r = checkDist(dist);
  console.log('link-check ' + dist);
  console.log('files ' + r.files + ' | html+css checked ' + r.filesChecked + ' | local refs ' + r.localRefs + ' (of which own-origin absolute ' + r.ownOriginRefs + ') | form placeholder actions ' + r.formPlaceholders + ' | fragments ' + r.fragmentsChecked + ' | broken ' + r.broken.length + ' ' + JSON.stringify(r.byKind));
  console.log('external (listed, not fetched): ' + r.externalUrls.length + ' distinct URLs on ' + Object.keys(r.externalHosts).length + ' hosts: ' + Object.entries(r.externalHosts).map(([h, n]) => h + ' ' + n).join(', '));
  console.log('schemes: ' + JSON.stringify(r.schemes));
  for (const b of r.broken.slice(0, 25)) console.log('  BROKEN ' + b.file + '  ' + b.kind + ' ' + b.attr + '=' + b.value);
  console.log('control: ' + (r.control.fired ? 'fired (8 planted defects reported, a missing video poster and video source included; "/", a page dir, a stylesheet, an image' + (r.servedVideos ? ' and a served video' : '') + ' not reported)' : 'DID NOT FIRE ' + JSON.stringify(r.control)));
  if (arg('--json')) fs.writeFileSync(path.resolve(arg('--json')), JSON.stringify(r, null, 1));
  process.exitCode = r.broken.length || !r.control.fired ? 1 : 0;
}
