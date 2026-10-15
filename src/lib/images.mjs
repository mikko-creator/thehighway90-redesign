// images.mjs - image resolution, WebP variants and ctx.img (PIPELINE). Node builtins + cwebp/webpmux on PATH.
// BUILD-CONTRACT 3.3 and 4.10.
//  - resolve(ref): a live image URL (https://werollup.com/media/...), a local file (assets/source|generated|brand/...),
//    or an image-plan slot id -> { file, width, height } | { slot, missing } (declared slot, not generated yet) |
//    { missing } (anything else unresolved: ctx.img and ctx.imgSrc throw) | throws (fail closed) for an unknown URL or a
//    platform UI image (NEVER_SHIP, src/lib/policy.mjs; 4.10).
//  - variants are made with `cwebp -metadata none` (never upscaled: widths are capped at the intrinsic width), cached in
//    the cache dir (assets/optimized by default, --cache <dir> moves it) as <sha12>-<w>-<settings>.webp, and copied to
//    <out>/assets/img/<sha12>-<w>.webp. Names carry the content hash only, so no source path reaches the output.
//  - files under assets/generated/ are AI-generated: after cwebp, tools/ai-label.xmp is attached with
//    `webpmux -set xmp` on EVERY variant (cwebp -metadata none strips metadata), and the label is proven present
//    before the variant is cached (4.10). Their output names end in -ai.webp.
//  - video slots (image-plan kind "video", WF3b): resolveVideo(id) checks the declaration; ctx.video(id) copies the
//    loop files byte for byte to <out>/assets/video/<sha12>-ai.<mp4|webm> (no re-encode: IMAGERY labels them with
//    tools/ai-label.mjs embed, and a file without the label fails the build) and returns their URLs plus the poster as a
//    labelled -ai.webp variant from the pipeline above.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { ROOT, readJSON, exists, cmp } from './site.mjs';
import { NEVER_SHIP } from './policy.mjs';

export const WIDTHS = [160, 320, 480, 640, 960, 1280, 1600, 1920];
export const CWEBP_ARGS = ['-quiet', '-q', '80', '-alpha_q', '90', '-m', '4', '-metadata', 'none'];
const SETTINGS_TAG = 'q80a90m4';
export const AI_XMP = path.join(ROOT, 'tools', 'ai-label.xmp');
export const AI_NEEDLE = 'trainedAlgorithmicMedia';
const AI_TAG = fs.existsSync(AI_XMP) ? 'xmp' + crypto.createHash('sha256').update(fs.readFileSync(AI_XMP)).digest('hex').slice(0, 8) : 'xmp-missing';
export const isGenerated = (file) => String(file || '').replace(/\\/g, '/').startsWith('assets/generated/');
/** platform UI images that never ship (4.10): defined in src/lib/policy.mjs; refused by resolve() below */
export { NEVER_SHIP };

/** the platform UI source files (assets/source names matching NEVER_SHIP) with their sha256, for content checks */
export function platformUiSources() {
  const dir = path.join(ROOT, 'assets', 'source');
  return fs.readdirSync(dir).sort(cmp).filter((f) => NEVER_SHIP.test(f)).map((f) => ({ file: 'assets/source/' + f, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex') }));
}

/* ---------- dimensions from file headers (PNG, JPEG, WebP, GIF) ---------- */
export function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), format: 'png' };
  if (buf.length > 10 && buf.toString('ascii', 0, 3) === 'GIF') return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8), format: 'gif' };
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const k = buf.toString('ascii', 12, 16);
    if (k === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3), format: 'webp' };
    if (k === 'VP8L') { const b = buf.readUInt32LE(21); return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff), format: 'webp' }; }
    if (k === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, format: 'webp' };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2;
    while (o + 9 < buf.length) {
      if (buf[o] !== 0xff) { o++; continue; }
      const m = buf[o + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { width: buf.readUInt16BE(o + 7), height: buf.readUInt16BE(o + 5), format: 'jpeg' };
      o += 2 + buf.readUInt16BE(o + 2);
    }
  }
  return null;
}

/* ---------- live URL -> local file index (docs/data/images.json: every size alias + the original key) ---------- */
const keyOf = (u) => { let s = String(u).trim().split('#')[0].split('?')[0].replace(/^(?:https?:)?\/\/(?:www\.)?thehighway90\.com/i, ''); try { s = decodeURIComponent(s); } catch { /* keep */ } return s.toLowerCase(); };
// the original of a WordPress size variant (same rule as tools/harvest-assets.mjs)
const origKey = (u) => keyOf(u).replace(/-\d{2,5}x\d{2,5}(?=\.[a-z]{3,4}$)/i, '').replace(/\.png-\d{2,5}x\d{2,5}\.webp$/i, '.png.webp').replace(/\/elementor\/thumbs\/([^/]+?)-[a-z0-9]{20,}(\.[a-z]{3,4})$/i, '/$1$2');
let INDEX = null;
export function imageIndex() {
  if (INDEX) return INDEX;
  const map = new Map();
  const im = readJSON('docs/data/images.json');
  for (const r of [...im.images].sort((a, b) => cmp(a.url || '', b.url || ''))) {
    if (!r.file || !exists(r.file)) continue;
    for (const u of [r.url, ...(r.aliases || [])]) if (u && !map.has(keyOf(u))) map.set(keyOf(u), r.file);
    if (r.key && !map.has('orig:' + r.key)) map.set('orig:' + r.key, r.file);
  }
  INDEX = map;
  return map;
}
export function fileForUrlLoose(u) { const ix = imageIndex(); return ix.get(keyOf(u)) || ix.get('orig:' + origKey(u)) || null; }

/** a live image URL -> workspace-relative local file, or null */
export function fileForUrl(u) { return fileForUrlLoose(u); }

const META = new Map();
/** { width, height, format, hash } of a local file (header read + sha256), memoised */
export function fileInfo(file) {
  if (META.has(file)) return META.get(file);
  const buf = fs.readFileSync(path.join(ROOT, file));
  let d = imageSize(buf) || {};
  if (!d.width && /\.svg$/i.test(file)) {
    // SVG: the root element's width/height (px or unitless), else its viewBox
    const root = (/<svg\b[^>]*>/i.exec(buf.toString('utf8')) || [''])[0];
    const num = (k) => { const m = new RegExp('\\s' + k + '\\s*=\\s*["\']\\s*([\\d.]+)(px)?\\s*["\']', 'i').exec(root); return m ? Math.round(Number(m[1])) : null; };
    const vb = /\sviewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i.exec(root);
    d = { width: num('width') || (vb ? Math.round(Number(vb[1])) : null), height: num('height') || (vb ? Math.round(Number(vb[2])) : null), format: 'svg' };
  }
  const m = { width: d.width || null, height: d.height || null, format: d.format || (file.endsWith('.svg') ? 'svg' : null), hash: crypto.createHash('sha256').update(buf).digest('hex') };
  META.set(file, m);
  return m;
}

/* ---------- video (image-plan kind "video") ---------- */
export const VIDEO_KEYS = ['mp4', 'webm', 'mp4Phone', 'webmPhone'];
const VIDEO_EXT = { mp4: '.mp4', webm: '.webm', mp4Phone: '.mp4', webmPhone: '.webm' };
/**
 * the presentation size of an MP4 (the first track header with a non-zero width: moov > trak > tkhd, 16.16 fixed
 * point), or null. Node only, no ffprobe: the build stays cwebp/webpmux-only.
 */
export function mp4Size(buf) {
  const walk = (s, e) => {
    let o = s;
    while (o + 8 <= e) {
      let size = buf.readUInt32BE(o), h = 8;
      const type = buf.toString('latin1', o + 4, o + 8);
      if (size === 1) { if (o + 16 > e) return null; size = Number(buf.readBigUInt64BE(o + 8)); h = 16; } else if (size === 0) size = e - o;
      if (size < h || o + size > e) return null;
      if (type === 'moov' || type === 'trak') { const r = walk(o + h, o + size); if (r) return r; }
      else if (type === 'tkhd') {
        const at = o + h + 4 + (buf[o + h] === 1 ? 32 : 20) + 16 + 36;
        if (at + 8 <= o + size) { const w = Math.round(buf.readUInt32BE(at) / 65536), hh = Math.round(buf.readUInt32BE(at + 4) / 65536); if (w > 0 && hh > 0) return { width: w, height: hh }; }
      }
      o += size;
    }
    return null;
  };
  return walk(0, buf.length);
}

/* ---------- variants ---------- */
export class ImagePipeline {
  constructor({ cacheDir, outDir, imagePlan = {} }) {
    this.cacheDir = cacheDir; this.outDir = outDir; this.imagePlan = imagePlan;
    this.jobs = new Map();   // cache name -> job
    this.used = new Map();   // output name -> cache name
    this.aiNames = new Set();
    this.copies = new Map(); // output name -> source file (verbatim copies: svg)
    this.videos = new Map(); // output name (assets/video/<sha12>-ai.<ext>) -> source file (verbatim copies)
  }
  /**
   * the state of an image-plan slot of kind "video":
   *   { error }   the declaration is wrong (not declared, not kind "video", no mp4/webm, a path outside assets/generated/,
   *               a wrong extension, no poster): ctx.video throws, and the build fails on it up front;
   *   { absent }  declared, but none of its video files exists yet: ctx.video returns null (render the still or the frame);
   *   { partial } some declared files exist and some do not (or the poster is missing): null with a build warning, fatal
   *               under THEME_STRICT=1;
   *   { files: { mp4, webm, mp4Phone?, webmPhone? }, poster }  every declared file exists.
   */
  resolveVideo(id) {
    const s = String(id || '').trim();
    if (!Object.prototype.hasOwnProperty.call(this.imagePlan, s) || !this.imagePlan[s]) return { error: 'unknown video slot "' + s + '": not declared in src/content/image-plan.json' };
    const slot = this.imagePlan[s];
    if (slot.kind !== 'video') return { error: 'slot "' + s + '" is not kind "video" (a still: use ctx.img)' };
    const v = slot.video && typeof slot.video === 'object' ? slot.video : {};
    const bad = [];
    for (const k of ['mp4', 'webm']) if (typeof v[k] !== 'string' || !v[k]) bad.push('video.' + k + ' is not declared');
    const files = {};
    for (const k of VIDEO_KEYS) {
      if (v[k] == null || v[k] === '') continue;
      const f = String(v[k]).replace(/\\/g, '/');
      if (!isGenerated(f)) bad.push('video.' + k + ' ' + f + ' is not under assets/generated/ (every loop is generated media and must carry the AI label)');
      else if (!f.toLowerCase().endsWith(VIDEO_EXT[k])) bad.push('video.' + k + ' ' + f + ' does not end in ' + VIDEO_EXT[k]);
      else files[k] = f;
    }
    const poster = String(v.poster || slot.file || '').replace(/\\/g, '/');
    if (!poster) bad.push('no poster (video.poster or file)');
    else if (!isGenerated(poster)) bad.push('poster ' + poster + ' is not under assets/generated/ (it ships as a labelled -ai.webp)');
    if (bad.length) return { error: 'video slot "' + s + '": ' + bad.join('; ') };
    const have = Object.keys(files).filter((k) => exists(files[k]));
    if (!have.length) return { absent: true, slot: s };
    const missing = Object.keys(files).filter((k) => !exists(files[k])).map((k) => 'video.' + k + ' ' + files[k]);
    if (!exists(poster)) missing.push('poster ' + poster);
    if (missing.length) return { partial: missing, slot: s };
    return { slot: s, files, poster, alt: slot.alt };
  }
  /** register one loop file for publishing (memoised per file); throws when it does not carry the AI label (4.10) */
  videoUrl(file) {
    this.videoNames = this.videoNames || new Map();
    if (!this.videoNames.has(file)) {
      const buf = fs.readFileSync(path.join(ROOT, file));
      if (!buf.includes(AI_NEEDLE)) throw new Error('video ' + file + ' does not carry the AI label (' + AI_NEEDLE + '): run node tools/ai-label.mjs embed ' + file);
      const name = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12) + '-ai' + path.extname(file).toLowerCase();
      this.videoNames.set(file, { name, size: /\.mp4$/i.test(file) ? mp4Size(buf) : null });
    }
    const v = this.videoNames.get(file);
    this.videos.set(v.name, file);
    return '/assets/video/' + v.name;
  }
  /** the MP4 presentation size of a registered loop file (videoUrl first), or null */
  videoSize(file) { const v = this.videoNames && this.videoNames.get(file); return v ? v.size : null; }
  /**
   * resolve a ref to { file, width, height, format } | { missing, slot } (a DECLARED image-plan slot whose file does not
   * exist yet: the only "missing" that callers may render as a frame) | { missing } (anything else: callers throw).
   * Throws for a platform UI image (NEVER_SHIP, 4.10): every entry point (ctx.img, ctx.imgSrc, og:image) comes here.
   */
  resolve(ref) {
    const s = String(ref || '').trim();
    if (!s) return { missing: 'empty reference' };
    if (NEVER_SHIP.test(s)) throw new Error('platform UI image never ships (BUILD-CONTRACT 4.10): ' + s);
    if (/^assets\/(source|generated|brand)\//.test(s)) {
      if (!exists(s)) return { missing: 'local file not found: ' + s };
      const m = fileInfo(s);
      return { file: s, width: m.width, height: m.height, format: m.format };
    }
    if (/^https?:|^\/\//.test(s)) {
      const f = fileForUrl(s);
      if (!f) throw new Error('image URL not in the harvest: ' + s);
      return this.resolve(f);
    }
    if (Object.prototype.hasOwnProperty.call(this.imagePlan, s) && this.imagePlan[s]) {
      const slot = this.imagePlan[s];
      const f = slot.file || slot.path || slot.output || (slot.video && slot.video.poster);
      if (f && exists(f)) return { ...this.resolve(f), slot: s, alt: slot.alt };
      return { missing: 'image-plan slot not generated yet', slot: s };
    }
    return { missing: 'unknown image ref "' + s + '": not a file under assets/source|generated|brand/, not a harvested live URL, not a slot id declared in src/content/image-plan.json' };
  }
  /** plan the WebP variants of a file: [{ w, h, url }] ascending; widths never above the intrinsic width */
  variants(file, widths) {
    const m = fileInfo(file);
    if (m.format === 'svg') {
      const name = m.hash.slice(0, 12) + '.svg';
      this.copies.set(name, file);
      return [{ w: m.width || 0, h: m.height || 0, url: '/assets/img/' + name }];
    }
    if (!m.width || m.format === 'gif') throw new Error('cannot make variants of ' + file);
    const cap = m.width;
    let ws = (widths && widths.length ? widths : WIDTHS).filter((w) => w < cap);
    ws.push(cap);
    ws = [...new Set(ws)].sort((a, b) => a - b);
    const ai = isGenerated(file);
    return ws.map((w) => {
      const name = m.hash.slice(0, 12) + '-' + w + (ai ? '-ai' : '') + '.webp';
      const cache = m.hash.slice(0, 12) + '-' + w + '-' + SETTINGS_TAG + (ai ? '-' + AI_TAG : '') + '.webp';
      this.jobs.set(cache, { src: file, width: w, full: w >= m.width, ai });
      this.used.set(name, cache);
      if (ai) this.aiNames.add(name);
      return { w, h: Math.round((m.height * w) / m.width), url: '/assets/img/' + name };
    });
  }
  /** run every planned cwebp job not cached yet (a small worker pool; outputs do not depend on the order) */
  async run(concurrency = Math.max(1, Math.min(8, os.cpus().length - 1))) {
    fs.mkdirSync(this.cacheDir, { recursive: true });
    const todo = [...this.jobs].filter(([c]) => !fs.existsSync(path.join(this.cacheDir, c))).sort((x, y) => cmp(x[0], y[0]));
    const stats = { planned: this.jobs.size, cached: this.jobs.size - todo.length, made: 0, failed: [] };
    const sh = (cmd, args) => new Promise((res) => { const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] }); let err = ''; p.stderr.on('data', (d) => { err += d; }); p.on('error', (e) => res({ code: -1, err: String(e) })); p.on('close', (code) => res({ code, err })); });
    let i = 0;
    const worker = async () => {
      while (i < todo.length) {
        const [cache, job] = todo[i++];
        const tmp = path.join(this.cacheDir, cache + '.' + process.pid + '.part');
        let r = await sh('cwebp', [...CWEBP_ARGS, ...(job.full ? [] : ['-resize', String(job.width), '0']), path.join(ROOT, job.src), '-o', tmp]);
        let ok = r.code === 0 && fs.existsSync(tmp);
        if (ok && job.ai) {
          const tmp2 = path.join(this.cacheDir, cache + '.' + process.pid + '.xmp.part');
          r = await sh('webpmux', ['-set', 'xmp', AI_XMP, tmp, '-o', tmp2]);
          try { fs.unlinkSync(tmp); } catch { /* none */ }
          ok = r.code === 0 && fs.existsSync(tmp2) && fs.readFileSync(tmp2).includes(AI_NEEDLE);
          if (ok) fs.renameSync(tmp2, tmp); else { try { fs.unlinkSync(tmp2); } catch { /* none */ } }
        }
        if (ok) { fs.renameSync(tmp, path.join(this.cacheDir, cache)); stats.made++; }
        else { try { fs.unlinkSync(tmp); } catch { /* none */ } stats.failed.push({ src: job.src, width: job.width, err: String(r.err || '').slice(0, 200) }); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, todo.length || 1) }, worker));
    return stats;
  }
  /** copy the used variants from the cache (and verbatim svgs) into <out>/assets/img/ */
  publish() {
    const dir = path.join(this.outDir, 'assets', 'img');
    fs.mkdirSync(dir, { recursive: true });
    const missing = [];
    const refused = []; // second layer behind resolve(): a platform UI source is never copied (4.10)
    let n = 0;
    for (const name of [...this.used.keys()].sort(cmp)) {
      const job = this.jobs.get(this.used.get(name));
      if (job && NEVER_SHIP.test(job.src)) { refused.push(name + ' <- ' + job.src); continue; }
      const src = path.join(this.cacheDir, this.used.get(name));
      if (!fs.existsSync(src)) { missing.push(name); continue; }
      fs.copyFileSync(src, path.join(dir, name)); n++;
    }
    for (const name of [...this.copies.keys()].sort(cmp)) {
      if (NEVER_SHIP.test(this.copies.get(name))) { refused.push(name + ' <- ' + this.copies.get(name)); continue; }
      fs.copyFileSync(path.join(ROOT, this.copies.get(name)), path.join(dir, name)); n++;
    }
    if (this.videos.size) {
      const vdir = path.join(this.outDir, 'assets', 'video');
      fs.mkdirSync(vdir, { recursive: true });
      for (const name of [...this.videos.keys()].sort(cmp)) {
        const src = path.join(ROOT, this.videos.get(name));
        if (!fs.existsSync(src)) { missing.push('assets/video/' + name); continue; }
        fs.copyFileSync(src, path.join(vdir, name)); n++;
      }
    }
    return { copied: n, missing, refused, aiVariants: [...this.aiNames].sort(cmp).map((x) => 'assets/img/' + x), videos: [...this.videos.keys()].sort(cmp).map((x) => 'assets/video/' + x) };
  }
}

const escA = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * ctx.img(ref, opts) - BUILD-CONTRACT 3.3. Returns an <img> with a WebP srcset (widths never above the intrinsic
 * width), width and height (intrinsic, so the aspect ratio is reserved: CLS 0) and sizes.
 * opts: { alt (required, '' only for decorative), sizes ('100vw' default), cls, loading ('lazy' default),
 *         fetchpriority, decoding ('async' default), widths ([...] candidate widths), attrs ({...} extra attributes) }
 * A ref that is a slot DECLARED in image-plan.json but not generated yet renders <div class="img-slot" data-slot="<id>"
 * role="img" aria-label="<alt>"> (a styled empty frame, never a broken <img>). Any other unresolved ref (an undeclared
 * slot id, a typo, a missing local file) throws, and so does a platform UI image (resolve()).
 */
export function makeImg(pipeline) {
  return function img(ref, opts = {}) {
    const r = pipeline.resolve(ref);
    const alt = opts.alt == null ? (r.alt || '') : opts.alt;
    if (r.missing) {
      if (r.slot) return '<div class="img-slot' + (opts.cls ? ' ' + escA(opts.cls) : '') + '" data-slot="' + escA(r.slot) + '" role="img" aria-label="' + escA(alt) + '"></div>';
      throw new Error('ctx.img: ' + r.missing);
    }
    const vs = pipeline.variants(r.file, opts.widths);
    const largest = vs[vs.length - 1];
    const srcset = vs.map((v) => v.url + ' ' + v.w + 'w').join(', ');
    let at = ' src="' + escA(largest.url) + '"';
    if (vs.length > 1 || !largest.url.endsWith('.svg')) at += ' srcset="' + escA(srcset) + '" sizes="' + escA(opts.sizes || '100vw') + '"';
    at += ' width="' + (r.width || largest.w) + '" height="' + (r.height || largest.h) + '"';
    at += ' alt="' + escA(alt) + '"';
    if (opts.cls) at += ' class="' + escA(opts.cls) + '"';
    at += ' loading="' + escA(opts.loading || 'lazy') + '"';
    at += ' decoding="' + escA(opts.decoding || 'async') + '"';
    if (opts.fetchpriority) at += ' fetchpriority="' + escA(opts.fetchpriority) + '"';
    for (const [k, v] of Object.entries(opts.attrs || {})) at += ' ' + k + '="' + escA(v) + '"';
    return '<img' + at + '>';
  };
}

/**
 * ctx.video(slotId, { posterWidth = 1920 }) for an image-plan slot of kind "video" ->
 *   { slot, alt, mp4, webm, mp4Phone, webmPhone, poster, posterSrcset, width, height } (URLs; the phone fields are null
 *   when the plan declares no phone crop; poster = the largest labelled -ai.webp variant not wider than posterWidth;
 *   width/height = the MP4's presentation size, null when it cannot be read) | null while the slot's loop files do not
 *   exist yet (and, outside THEME_STRICT=1, while only some of them exist: a build warning names the missing files).
 * Throws for an undeclared slot, a slot that is not kind "video", a malformed declaration, a loop file without the AI
 * label, and (under THEME_STRICT=1) a partly generated slot.
 */
export function makeVideo(pipeline, { strict = false, warn = (m) => console.warn(m), warned = new Set() } = {}) {
  return function video(slotId, opts = {}) {
    const r = pipeline.resolveVideo(slotId);
    if (r.error) throw new Error('ctx.video: ' + r.error);
    if (r.absent) return null;
    if (r.partial) {
      const msg = 'video slot "' + r.slot + '" is partly generated (missing: ' + r.partial.join(', ') + ')';
      if (strict) throw new Error('ctx.video: ' + msg + ' (THEME_STRICT=1)');
      if (!warned.has(r.slot)) { warned.add(r.slot); warn('build: WARNING ' + msg + ': ctx.video returns null'); }
      return null;
    }
    const out = { slot: r.slot, alt: r.alt == null ? '' : r.alt };
    for (const k of VIDEO_KEYS) out[k] = r.files[k] ? pipeline.videoUrl(r.files[k]) : null;
    const pr = pipeline.resolve(r.poster);
    if (pr.missing) throw new Error('ctx.video: poster of "' + r.slot + '": ' + pr.missing);
    const vs = pipeline.variants(pr.file);
    const pw = opts.posterWidth || 1920;
    let pick = vs[0];
    for (const v of vs) if (v.w <= pw) pick = v;
    out.poster = pick.url;
    out.posterSrcset = vs.map((v) => v.url + ' ' + v.w + 'w').join(', ');
    const size = pipeline.videoSize(r.files.mp4);
    out.width = size ? size.width : null;
    out.height = size ? size.height : null;
    return out;
  };
}

/**
 * ctx.imgSrc(ref, width): URL of the largest variant not wider than `width` (for CSS backgrounds). null only for a slot
 * declared in image-plan.json but not generated yet; any other unresolved ref throws, as does a platform UI image.
 */
export function makeImgSrc(pipeline) {
  return function imgSrc(ref, width = 1920) {
    const r = pipeline.resolve(ref);
    if (r.missing) {
      if (r.slot) return null;
      throw new Error('ctx.imgSrc: ' + r.missing);
    }
    const vs = pipeline.variants(r.file);
    let pick = vs[0];
    for (const v of vs) if (v.w <= width) pick = v;
    return pick.url;
  };
}
