// make-pages-preview.mjs - turn dist/ into a copy that works under a GitHub Pages PROJECT subpath (werollup).
// Derived from sunnydayz-reforge/src/tools/make-pages-preview.mjs (2026-09-24), generalised 2026-10-13.
// dist/ is built for a domain root: every reference is root-absolute ("/about-us/", "/assets/..."), and at
// https://<user>.github.io/<repo>/ each would resolve against the domain root and 404 (<base href> only affects
// RELATIVE URLs). This copies dist/ and prefixes every root-absolute reference:
//   HTML  any href / src / action / poster / data-* attribute value starting with one "/" (the store switcher's
//         data-menu-url etc. included); srcset / imagesrcset candidate by candidate; <meta http-equiv="refresh">
//         targets (the alias stubs); inline style url(); &quot;url|image|href|src|path&quot; JSON inside attributes
//   CSS   url()
//   JS    (files and inline <script> without a JSON type) ONLY the literals listed in tools/preview-literals.json
//         (measured on the real build); any other root-absolute string literal stops the run (exit 3), never guessed.
// Left verbatim: <script type="application/json"> and <script type="application/ld+json"> blocks (the Jane config,
// settings and secrets; the vendor embed cannot work off werollup.com anyway: OPEN-DECISIONS B13).
// The preview never competes with the live site: every page gets <meta name="robots" content="noindex, nofollow">,
// robots.txt becomes disallow-all, _redirects (Netlify/Cloudflare) is dropped, sitemap.xml is kept (live URLs only).
// After writing, the tool RE-SCANS the output: any root-absolute reference outside the prefix left in HTML attributes,
// CSS url() or meta refresh fails the run (exit 4). --control proves that re-scan fires on a planted reference.
//   node tools/make-pages-preview.mjs --prefix /werollup-redesign --out <dir> [--dist dist] [--control]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]]) : a), []));
const P = String(args.prefix || '').replace(/\/+$/, '');
if (!/^\/[A-Za-z0-9._-]+$/.test(P)) { console.error('--prefix must look like /Repo-Name'); process.exit(2); }
const LITERALS_FILE = path.join(ROOT, 'tools', 'preview-literals.json');
const LITERALS = fs.existsSync(LITERALS_FILE) ? JSON.parse(fs.readFileSync(LITERALS_FILE, 'utf8')).literals || [] : [];

const needs = (u) => typeof u === 'string' && u.startsWith('/') && !u.startsWith('//') && u !== P && !u.startsWith(P + '/');
const ATTR = /(\s(?:href|src|action|poster|data-[a-z0-9-]+)=)(["'])([^"']*)\2/gi;
const SRCSET = /(\s(?:srcset|imagesrcset)=)(["'])([^"']*)\2/gi;
const REFRESH = /(<meta\s[^>]*http-equiv=["']refresh["'][^>]*content=["']\s*\d+\s*;\s*url=)([^"']+)/gi;
const STYLEURL = /(url\(\s*['"]?)(\/[^'")]+)/g;
const QJSON = /(&quot;(?:url|image|href|src|path)&quot;\s*:\s*&quot;)(\/[^&]*)(&quot;)/g;
const JSONBLOCK = /<script\b[^>]*type=["']application\/(?:ld\+)?json["'][^>]*>[\s\S]*?<\/script>/gi;
const INLINEJS = /(<script\b(?![^>]*\btype=["']application\/(?:ld\+)?json["'])(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi;
const JSLIT = /(['"`])(\/[A-Za-z0-9_\-./?=&%#]*)\1/g;

const ANCHORS = fs.existsSync(LITERALS_FILE) ? JSON.parse(fs.readFileSync(LITERALS_FILE, 'utf8')).regexAnchors || [] : [];
const BS = String.fromCharCode(92);
// "/werollup-redesign" as it must appear inside a regex literal: "\/werollup-redesign"
const ESCP = P.split('/').filter(Boolean).map((seg) => BS + '/' + seg).join('');
function rewriteJs(s, rel, stats) {
  // 2026-10-14: regex literals anchored at the domain root (the theme's store detection
  // /^\/location\/(culver-city|san-pedro)(\/|$)/ tested against location.pathname) never match under a subpath. Rewrite
  // the anchors measured in tools/preview-literals.json "regexAnchors"; any other root-anchored regex stops the run.
  for (const seg of ANCHORS) {
    const from = '^' + BS + '/' + seg, to = '^' + ESCP + BS + '/' + seg;
    const n = s.split(from).length - 1;
    if (n) { s = s.split(from).join(to); stats.refs += n; stats.regexAnchors = (stats.regexAnchors || 0) + n; }
  }
  const rootRegex = [];
  for (let i = s.indexOf('^' + BS + '/'); i >= 0; i = s.indexOf('^' + BS + '/', i + 1)) {
    const next = s.charAt(i + 3);
    if (/[A-Za-z]/.test(next) && !s.startsWith(ESCP, i + 1)) rootRegex.push(s.slice(i, i + 40));
  }
  if (rootRegex.length) { console.error('unhandled root-anchored regex in ' + rel + ': ' + rootRegex.join(' | ') + '\n  measure it, then list its first path segment in tools/preview-literals.json "regexAnchors"'); process.exit(3); }
  const left = [];
  s = s.replace(JSLIT, (m, q, u) => {
    if (!needs(u)) return m;
    if (LITERALS.some((l) => u === l || (l.endsWith('*') && u.startsWith(l.slice(0, -1))))) { stats.refs++; stats.jsLiterals++; return q + P + u + q; }
    left.push(u);
    return m;
  });
  if (left.length) { console.error('unhandled root-absolute JS literals in ' + rel + ': ' + [...new Set(left)].join(', ') + '\n  measure them, then list them in tools/preview-literals.json'); process.exit(3); }
  return s;
}
function rewriteHtml(s, rel, stats) {
  const keep = [];
  s = s.replace(JSONBLOCK, (m) => { keep.push(m); return '\u0000KEEP' + (keep.length - 1) + '\u0000'; });
  s = s.replace(INLINEJS, (m, a, body, z) => a + rewriteJs(body, rel + ' (inline script)', stats) + z);
  s = s.replace(ATTR, (m, a, q, u) => { if (!needs(u)) return m; stats.refs++; return a + q + P + u + q; });
  s = s.replace(SRCSET, (m, a, q, list) => a + q + list.split(',').map((part) => part.replace(/^(\s*)(\S+)/, (mm, sp, u) => { if (!needs(u)) return mm; stats.refs++; return sp + P + u; })).join(',') + q);
  s = s.replace(REFRESH, (m, a, u) => { if (!needs(u)) return m; stats.refs++; return a + P + u; });
  s = s.replace(STYLEURL, (m, a, u) => { if (!needs(u)) return m; stats.refs++; return a + P + u; });
  s = s.replace(QJSON, (m, a, u, z) => { if (!needs(u)) return m; stats.refs++; return a + P + u + z; });
  s = s.replace(/<meta name="robots" content="[^"]*">/g, '<meta name="robots" content="noindex, nofollow">');
  if (!/<meta name="robots"/.test(s)) s = s.replace(/<head>/i, '<head>\n<meta name="robots" content="noindex, nofollow">');
  return s.replace(/\u0000KEEP(\d+)\u0000/g, (m, i) => keep[Number(i)]);
}
const rewriteCss = (s, stats) => s.replace(STYLEURL, (m, a, u) => { if (!needs(u)) return m; stats.refs++; return a + P + u; });

/** re-scan a built preview: every root-absolute reference outside the prefix that is left (JSON blocks excluded) */
export function rescan(dir) {
  const left = [];
  (function walk(d) {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f), rel = path.relative(dir, p).split(path.sep).join('/');
      if (fs.statSync(p).isDirectory()) { if (f !== '.git') walk(p); continue; }
      if (/\.html$/.test(f)) {
        const s = fs.readFileSync(p, 'utf8').replace(JSONBLOCK, '');
        for (const re of [ATTR, REFRESH, STYLEURL]) { re.lastIndex = 0; let m; while ((m = re.exec(s))) { const u = re === ATTR ? m[3] : m[2]; if (needs(u)) left.push(rel + ': ' + u); } }
        SRCSET.lastIndex = 0; let m;
        while ((m = SRCSET.exec(s))) for (const part of m[3].split(',')) { const u = part.trim().split(/\s+/)[0]; if (needs(u)) left.push(rel + ': srcset ' + u); }
      } else if (/\.css$/.test(f)) {
        const s = fs.readFileSync(p, 'utf8'); STYLEURL.lastIndex = 0; let m;
        while ((m = STYLEURL.exec(s))) if (needs(m[2])) left.push(rel + ': url(' + m[2] + ')');
      }
    }
  }(dir));
  return left;
}

function build(SRC, OUT) {
  const stats = { html: 0, css: 0, js: 0, copied: 0, refs: 0, jsLiterals: 0, dropped: [] };
  // 2026-10-14: keep OUT/.git. The preview folder is its own git repo (the gh-pages branch); wiping it whole deleted
  // that repo, and a later "git commit" inside it fell through to the parent workspace repo.
  fs.mkdirSync(OUT, { recursive: true });
  for (const e of fs.readdirSync(OUT)) if (e !== '.git') fs.rmSync(path.join(OUT, e), { recursive: true, force: true });
  (function walk(d) {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f), rel = path.relative(SRC, p).split(path.sep).join('/'), o = path.join(OUT, rel);
      if (fs.statSync(p).isDirectory()) { walk(p); continue; }
      if (rel === '_redirects') { stats.dropped.push(rel); continue; }
      fs.mkdirSync(path.dirname(o), { recursive: true });
      if (rel === 'robots.txt') { fs.writeFileSync(o, 'User-agent: *\nDisallow: /\n'); continue; }
      const ext = path.extname(f);
      if (ext === '.html') { fs.writeFileSync(o, rewriteHtml(fs.readFileSync(p, 'utf8'), rel, stats)); stats.html++; }
      else if (ext === '.css') { fs.writeFileSync(o, rewriteCss(fs.readFileSync(p, 'utf8'), stats)); stats.css++; }
      else if (ext === '.js') { fs.writeFileSync(o, rewriteJs(fs.readFileSync(p, 'utf8'), rel, stats)); stats.js++; }
      else { fs.copyFileSync(p, o); stats.copied++; }
    }
  }(SRC));
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
  return stats;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) {
  const SRC = path.resolve(ROOT, args.dist || 'dist');
  if (args.control) {
    // plant one root-absolute href that the rewrite never saw into a copy of a written preview: the re-scan must report it
    const t = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-preview-ctl-'));
    const out = path.join(t, 'out');
    build(SRC, out);
    const clean = rescan(out).length;
    const page = path.join(out, 'index.html');
    fs.writeFileSync(page, fs.readFileSync(page, 'utf8').replace('</body>', '<a href="/planted-root-absolute/">x</a></body>'));
    const planted = rescan(out).filter((x) => /planted-root-absolute/.test(x)).length;
    fs.rmSync(t, { recursive: true, force: true });
    const ok = clean === 0 && planted === 1;
    console.log('control ' + (ok ? 'FIRED' : 'DID NOT FIRE') + ': clean preview re-scan ' + clean + ' left, planted href found ' + planted + 'x');
    process.exitCode = ok ? 0 : 1;
  } else {
    const OUT = args.out ? path.resolve(args.out) : null;
    if (!OUT) { console.error('--out <dir> is required'); process.exit(2); }
    if (OUT === SRC || OUT.startsWith(SRC + path.sep)) { console.error('--out must not be inside the dist it reads'); process.exit(2); }
    const stats = build(SRC, OUT);
    const left = rescan(OUT);
    console.log('preview for ' + P + '/ -> ' + OUT + '\n  html ' + stats.html + ' | css ' + stats.css + ' | js ' + stats.js + ' | other files ' + stats.copied + ' | references prefixed ' + stats.refs + ' (JS literals ' + stats.jsLiterals + ') | dropped ' + (stats.dropped.join(', ') || 'none') + ' | root-absolute references left outside the prefix: ' + left.length);
    for (const x of left.slice(0, 20)) console.log('  LEFT ' + x);
    process.exitCode = left.length ? 4 : 0;
  }
}
