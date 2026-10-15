// fal-one.mjs — one fal.ai generation (or edit), saved to a file you name, with a sidecar record.
// Node builtins only. For panel/prototype work; the production set goes through tools/fal-gen.mjs
// (which keeps audit/generated-images.json). This tool never touches that shared record.
//
//   node tools/fal-one.mjs --key-file <path> --out tmp/panel/a/img/hero.jpg \
//        --prompt "..." [--model fal-ai/flux-pro/v1.1-ultra] [--input '{"aspect_ratio":"16:9"}'] \
//        [--image <local file>  (edit models: sent as image_url data URI)] [--cutout] [--dry]
//
// --cutout runs fal-ai/birefnet/v2 on the result and writes a transparent PNG next to it (<out>.cut.png).
// The key is NEVER read from, or written into, the project tree: pass --key-file (outside it) or set FAL_KEY.
// Writes <out>.json: model, prompt, input (data URIs elided), request ids, seed, size, sha256, time.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const PROJ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const k = argv[i].slice(2);
  const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  args[k] = v;
}
const keyFile = args['key-file'];
if (keyFile && path.resolve(keyFile).toLowerCase().startsWith(PROJ.toLowerCase())) { console.error('refusing a key file inside the project tree'); process.exit(2); }
const KEY = (process.env.FAL_KEY || (keyFile ? fs.readFileSync(keyFile, 'utf8') : '')).trim();
if (!KEY && !args.dry) { console.error('no fal key: set FAL_KEY or pass --key-file'); process.exit(2); }
if (!args.out || !args.prompt) { console.error('need --out and --prompt'); process.exit(2); }

const model = args.model || 'fal-ai/flux-pro/v1.1-ultra';
const out = path.resolve(PROJ, String(args.out));
fs.mkdirSync(path.dirname(out), { recursive: true });
const extra = args.input ? JSON.parse(String(args.input)) : {};
const input = { prompt: String(args.prompt), ...extra };
// werollup 2026-10-13: flux pro at safety_tolerance '2' answered legitimate macros with billed 1024x768 black frames
// (academyvisionnj, 2026-10-08/09). Default '5' for flux pro models unless the caller sets one.
if (/flux-pro/.test(model) && input.safety_tolerance === undefined && !args.image) input.safety_tolerance = '5';
if (args.image) {
  const src = path.resolve(PROJ, String(args.image));
  const mime = /\.png$/i.test(src) ? 'image/png' : /\.webp$/i.test(src) ? 'image/webp' : 'image/jpeg';
  input.image_url = 'data:' + mime + ';base64,' + fs.readFileSync(src).toString('base64');
}
const shown = { ...input, image_url: input.image_url ? '(data uri of ' + args.image + ')' : undefined };
if (args.dry) { console.log('[dry]', model, JSON.stringify(shown).slice(0, 400)); process.exit(0); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function falRun(m, inp) {
  const sub = await fetch('https://queue.fal.run/' + m, { method: 'POST', headers: { Authorization: 'Key ' + KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(inp) });
  if (!sub.ok) throw new Error(m + ' submit HTTP ' + sub.status + ' ' + (await sub.text()).slice(0, 300));
  const s = await sub.json();
  const t0 = Date.now();
  for (;;) {
    await sleep(1500);
    const st = await fetch(s.status_url, { headers: { Authorization: 'Key ' + KEY } });
    const sj = await st.json().catch(() => ({}));
    if (sj.status === 'COMPLETED') break;
    if (sj.status === 'FAILED' || sj.error) throw new Error(m + ' failed: ' + JSON.stringify(sj).slice(0, 300));
    if (Date.now() - t0 > 300000) throw new Error(m + ' timed out');
  }
  const r = await fetch(s.response_url, { headers: { Authorization: 'Key ' + KEY } });
  if (!r.ok) throw new Error(m + ' result HTTP ' + r.status + ' ' + (await r.text()).slice(0, 300));
  return { requestId: s.request_id, result: await r.json() };
}
async function download(url, file) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('download HTTP ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(file, buf);
  return buf;
}

try {
  const gen = await falRun(model, input);
  const img = gen.result.image || (gen.result.images || [])[0];
  if (!img || !img.url) throw new Error('no image in result: ' + JSON.stringify(gen.result).slice(0, 300));
  const buf = await download(img.url, out);
  // werollup 2026-10-13: a safety-filtered result is a billed black frame that used to log 'ok'. Reject tiny files, NSFW
  // flags and an ultra result whose long side is under 2048 px; keep the file as evidence and book the call anyway.
  const nsfw = Array.isArray(gen.result.has_nsfw_concepts) && gen.result.has_nsfw_concepts.some(Boolean);
  const longSide = Math.max(img.width || 0, img.height || 0);
  const filtered = nsfw || buf.length < 40000 || (/ultra/.test(model) && longSide > 0 && longSide < 2048);
  if (filtered) {
    const ev = out.replace(/(\.[a-z0-9]+)$/i, '.filtered$1');
    fs.renameSync(out, ev);
    fs.writeFileSync(ev + '.json', JSON.stringify({ tool: 'tools/fal-one.mjs', status: 'FILTERED', model, prompt: input.prompt, input: { ...shown, prompt: undefined }, requestId: gen.requestId, width: img.width || null, height: img.height || null, bytes: buf.length, nsfw, billed: true, file: path.relative(PROJ, ev).split(path.sep).join('/'), generatedAt: new Date().toISOString() }, null, 2));
    console.log('FILTERED', path.relative(PROJ, ev), (buf.length / 1024).toFixed(0) + 'KB', (img.width || '?') + 'x' + (img.height || '?'), nsfw ? 'nsfw-flag' : '', gen.requestId);
    process.exitCode = 3;
    throw Object.assign(new Error('filtered result kept as evidence'), { filtered: true });
  }
  const rec = {
    tool: 'tools/fal-one.mjs', status: 'ok', model, prompt: input.prompt, input: { ...shown, prompt: undefined },
    requestId: gen.requestId, seed: gen.result.seed ?? null, width: img.width || null, height: img.height || null,
    contentType: img.content_type || null, bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'),
    file: path.relative(PROJ, out).split(path.sep).join('/'), generatedAt: new Date().toISOString(),
    provenance: 'AI-generated (fal.ai). Illustrative only: never a photograph of Highway 90 (thehighway90.com), its store, staff, customers, products or brands.',
  };
  if (args.cutout) {
    const cutFile = out.replace(/\.[a-z0-9]+$/i, '') + '.cut.png';
    const bg = await falRun('fal-ai/birefnet/v2', { image_url: img.url, model: String(args['cutout-model'] || 'General Use (Heavy)'), operating_resolution: '2048x2048', output_format: 'png' });
    const bimg = bg.result.image || (bg.result.images || [])[0];
    if (!bimg || !bimg.url) throw new Error('no cutout in result: ' + JSON.stringify(bg.result).slice(0, 300));
    const cbuf = await download(bimg.url, cutFile);
    rec.cutout = { model: 'fal-ai/birefnet/v2', requestId: bg.requestId, file: path.relative(PROJ, cutFile).split(path.sep).join('/'), bytes: cbuf.length };
  }
  fs.writeFileSync(out + '.json', JSON.stringify(rec, null, 2));
  console.log('ok', rec.file, (buf.length / 1024).toFixed(0) + 'KB', rec.width + 'x' + rec.height, rec.cutout ? '+cutout ' + rec.cutout.file : '', gen.requestId);
  process.exitCode = 0;   // set, never forced: exiting while undici closes sockets aborts Node on Windows (libuv UV_HANDLE_CLOSING)
} catch (e) {
  if (e && e.filtered) { /* reported above; exitCode 3 */ } else {
  console.error('FAIL', String(e.message || e).slice(0, 400));
  process.exitCode = 1; }
}
