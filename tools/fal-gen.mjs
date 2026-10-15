// fal-gen.mjs — generate the redesign's industry imagery with fal, optionally cut out the subject
// (transparent PNG) so it can break out of its frame. Node builtins only.
//
//   node tools/fal-gen.mjs --plan src/content/image-plan.json --key-file <path> [--only id1,id2] [--dry]
//        [--force id1,id2] [--concurrency 3] [--cap-ultra 140] [--cap-cutout 4] [--seed-from <n>]
//
// The key is NEVER read from, or written into, the project tree: pass --key-file (outside the
// project) or set FAL_KEY. Every result is recorded in audit/generated-images.json with its prompt,
// model, seed and request id, plus a running spend tally (spend.ultraCalls / spend.cutoutCalls); a call is counted
// when it is submitted, so a failed or rejected attempt still counts against the cap.
// Lane IMG changes (2026-10-12):
//   - the final file is plan item.file (default assets/generated/<id lower-case>.<jpg|png>);
//   - the raw fal output is kept in tmp/img/raw/ (never under assets/generated/, where every file must carry the AI
//     label, R-40), and a regenerated file is archived to tmp/img/rejected/ (never deleted, never shipped);
//   - the IPTC trainedAlgorithmicMedia XMP (tools/ai-label.xmp) is embedded in the final file at once
//     (tools/ai-label.mjs), and a sidecar <file>.json is written with review.verdict PENDING: a slot is filled only
//     after the by-eye review sets ACCEPT (tmp/img/review.mjs);
//   - --concurrency runs several items at once (the record is written by this one process, so nothing races);
//   - --cap-ultra / --cap-cutout stop the run before a call that would pass the lane budget.
// A plan entry already present on disk is skipped (resumable; generated images cost money).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { embedFile, checkFile, DST_URI } from './ai-label.mjs';

const PROJ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]]) : a), []));
if (args['key-file'] && path.resolve(args['key-file']).toLowerCase().startsWith(PROJ.toLowerCase())) { console.error('refusing a key file inside the project tree'); process.exit(2); }
const KEY = (process.env.FAL_KEY || (args['key-file'] ? fs.readFileSync(args['key-file'], 'utf8') : '')).trim();
if (!KEY) { console.error('no fal key: set FAL_KEY or pass --key-file'); process.exit(2); }

const plan = JSON.parse(fs.readFileSync(path.resolve(PROJ, args.plan || 'src/content/image-plan.json'), 'utf8'));
if (!plan.defaults || !Array.isArray(plan.images)) { console.error('plan needs defaults and images[]'); process.exit(2); }
const RAWDIR = path.join(PROJ, 'tmp/img/raw');
const REJDIR = path.join(PROJ, 'tmp/img/rejected');
const RECORD = path.join(PROJ, 'audit/generated-images.json');
const rec = fs.existsSync(RECORD) ? JSON.parse(fs.readFileSync(RECORD, 'utf8'))
  : { schema: 'site-reforge/generated-images@2', provider: 'fal.ai', note: 'Illustrative industry imagery ADDED by the redesign. None stands in for a real person, place, product, brand or result of Highway 90 (thehighway90.com); every alt describes what is depicted.', images: [], failures: [] };
rec.spend = rec.spend || { ultraCalls: 0, cutoutCalls: 0, otherCalls: 0, calls: [] };
const CAP_ULTRA = Number(args['cap-ultra'] || 140), CAP_CUT = Number(args['cap-cutout'] || 4);
const PRICE = { ultra: 0.06, cutout: 0.005 };   // fal list prices as recorded in tmp/panel/kit/README.md; UNVERIFIED against the invoice
const only = args.only ? new Set(String(args.only).split(',')) : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const relp = (p) => path.relative(PROJ, p).split(path.sep).join('/');
const saveRecord = () => {
  rec.spend.estUSD = +(rec.spend.ultraCalls * PRICE.ultra + rec.spend.cutoutCalls * PRICE.cutout).toFixed(3);
  rec.spend.priceBasis = 'about $0.06 per flux-pro ultra call and $0.005 per birefnet cut-out (fal list prices, UNVERIFIED against the invoice)';
  rec.spend.caps = { ultra: CAP_ULTRA, cutout: CAP_CUT, lane: 'IMG' };
  const tmp = RECORD + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(rec, null, 2));
  fs.renameSync(tmp, RECORD);
};

function countCall(kind, id, model) {
  if (kind === 'ultra' && rec.spend.ultraCalls >= CAP_ULTRA) throw new Error('BUDGET: ultra cap ' + CAP_ULTRA + ' reached');
  if (kind === 'cutout' && rec.spend.cutoutCalls >= CAP_CUT) throw new Error('BUDGET: cut-out cap ' + CAP_CUT + ' reached');
  if (kind === 'ultra') rec.spend.ultraCalls++; else if (kind === 'cutout') rec.spend.cutoutCalls++; else rec.spend.otherCalls++;
  rec.spend.calls.push({ kind, id, model, at: new Date().toISOString() });
  saveRecord();
}

async function falRun(model, input) {
  // queue API: submit, poll status, fetch result — survives long generations
  const sub = await fetch('https://queue.fal.run/' + model, {
    method: 'POST', headers: { Authorization: 'Key ' + KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  if (!sub.ok) throw new Error(model + ' submit HTTP ' + sub.status + ' ' + (await sub.text()).slice(0, 300));
  const s = await sub.json();
  const t0 = Date.now();
  for (;;) {
    await sleep(1500);
    const st = await fetch(s.status_url, { headers: { Authorization: 'Key ' + KEY } });
    const sj = await st.json().catch(() => ({}));
    if (sj.status === 'COMPLETED') break;
    if (sj.status === 'FAILED' || sj.error) throw new Error(model + ' failed: ' + JSON.stringify(sj).slice(0, 300));
    if (Date.now() - t0 > 240000) throw new Error(model + ' timed out');
  }
  const r = await fetch(s.response_url, { headers: { Authorization: 'Key ' + KEY } });
  if (!r.ok) throw new Error(model + ' result HTTP ' + r.status + ' ' + (await r.text()).slice(0, 300));
  return { requestId: s.request_id, result: await r.json() };
}

async function download(url, file) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('download HTTP ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(file, buf);
  return buf.length;
}

const byId = new Map(rec.images.map((i) => [i.id, i]));
let made = 0, skipped = 0, budgetStop = false;
const todo = [];
for (const item of plan.images) {
  if (only && !only.has(item.id)) continue;
  if (!only && item.optional) continue;   // optional entries run only when named
  if (item.reuse) continue;   // a stand-in that reuses an already generated image: nothing to generate
  todo.push(item);
}

async function one(item) {
  const ext = item.cutout ? 'png' : 'jpg';
  const finalRel = item.file || ('assets/generated/' + item.id.toLowerCase() + '.' + ext);
  const finalAbs = path.join(PROJ, finalRel);
  const force = args.force && (args.force === true || String(args.force).split(',').includes(item.id));
  if (fs.existsSync(finalAbs) && !force) { skipped++; console.log('skip', item.id, '(on disk: ' + finalRel + ')'); return; }
  const model = item.model || plan.defaults.model;
  // An EDIT (item.editFrom) keeps the style suffix off: the instruction must describe only the change.
  const prompt = item.prompt + (plan.defaults.style && !item.editFrom ? ', ' + plan.defaults.style : '');
  const input = item.editFrom
    ? { prompt, ...(item.input || {}) }
    : { prompt, ...(plan.defaults.input || {}), ...(item.input || {}) };
  // werollup 2026-10-13: default safety_tolerance '5' for flux pro generations (tolerance '2' returned billed black
  // frames for legitimate macros on academyvisionnj); a plan or item value always wins.
  if (!item.editFrom && /flux-pro/.test(model) && input.safety_tolerance === undefined) input.safety_tolerance = '5';
  if (item.editFrom) {
    const src = path.resolve(PROJ, item.editFrom);
    const mime = /\.png$/i.test(src) ? 'image/png' : 'image/jpeg';
    input.image_url = 'data:' + mime + ';base64,' + fs.readFileSync(src).toString('base64');
  }
  if (args.dry) { console.log('[dry]', item.id, '->', finalRel, model, JSON.stringify({ ...input, image_url: input.image_url ? '(data uri)' : undefined }).slice(0, 200)); return; }
  if (budgetStop) return;
  try {
    countCall(/ultra/.test(model) ? 'ultra' : 'other', item.id, model);
    const gen = await falRun(model, input);
    const img = (gen.result.images || [])[0];
    if (!img || !img.url) throw new Error('no image in result: ' + JSON.stringify(gen.result).slice(0, 200));
    const rawExt = /png/i.test(img.content_type || img.url) ? 'png' : 'jpg';
    fs.mkdirSync(RAWDIR, { recursive: true });
    const stamp = Date.now();
    const rawFile = path.join(RAWDIR, item.id + '.' + stamp + (item.editFrom ? '.edit' : '') + '.' + rawExt);
    const rawBytes = await download(img.url, rawFile);
    // werollup 2026-10-13: a safety-filtered result is a billed black frame that used to log 'ok'. The call is already
    // booked (countCall above); the raw file stays in RAWDIR as evidence and the slot is recorded as a failure.
    const nsfw = Array.isArray(gen.result.has_nsfw_concepts) && gen.result.has_nsfw_concepts.some(Boolean);
    const longSide = Math.max(img.width || 0, img.height || 0);
    if (nsfw || rawBytes < 40000 || (/ultra/.test(model) && longSide > 0 && longSide < 2048)) {
      throw new Error('FILTERED: ' + (nsfw ? 'nsfw flag, ' : '') + rawBytes + ' B, ' + (img.width || '?') + 'x' + (img.height || '?') + ' (raw kept: ' + relp(rawFile) + ')');
    }
    // Produce the new file under a temp name; the old one is archived only once this succeeded,
    // so a failed regeneration can never leave the slot empty.
    const tmpFinal = finalAbs + '.new.' + ext;
    fs.mkdirSync(path.dirname(finalAbs), { recursive: true });   // werollup: tmpFinal is written here before the later mkdir (ENOENT on a fresh tree)
    let cut = null;
    if (item.cutout) {
      countCall('cutout', item.id, plan.defaults.cutoutModel);
      const bg = await falRun(plan.defaults.cutoutModel, { image_url: img.url, ...(plan.defaults.cutoutInput || {}) });
      const bimg = bg.result.image || (bg.result.images || [])[0];
      if (!bimg || !bimg.url) throw new Error('no cutout in result: ' + JSON.stringify(bg.result).slice(0, 200));
      await download(bimg.url, tmpFinal);
      fs.copyFileSync(tmpFinal, path.join(RAWDIR, item.id + '.' + stamp + '.cut.png'));
      cut = { model: plan.defaults.cutoutModel, requestId: bg.requestId };
    } else {
      fs.copyFileSync(rawFile, tmpFinal);
    }
    embedFile(tmpFinal);   // the AI label goes in before the file reaches assets/generated/
    if (!checkFile(tmpFinal).ok) throw new Error('AI label did not verify on ' + relp(tmpFinal));
    fs.mkdirSync(path.dirname(finalAbs), { recursive: true });
    if (fs.existsSync(finalAbs)) {
      // A rejected image is ARCHIVED, never deleted: it was paid for, and the rejection is evidence.
      fs.mkdirSync(REJDIR, { recursive: true });
      const arch = path.join(REJDIR, item.id + '.' + stamp + '.' + ext);
      fs.renameSync(finalAbs, arch);
      if (fs.existsSync(finalAbs + '.json')) fs.renameSync(finalAbs + '.json', arch + '.json');
      rec.rejected = (rec.rejected || []).concat({ ...(byId.get(item.id) || { id: item.id }), archivedAs: relp(arch), reason: item.rejectReason || 'regenerated on review (--force)', at: new Date().toISOString() });
    }
    fs.renameSync(tmpFinal, finalAbs);
    const entry = {
      id: item.id, file: finalRel, raw: relp(rawFile), rawBytes,
      role: item.role, alt: item.alt, usedFor: item.usedFor || [], prompt, model, input: { ...input, prompt: undefined, image_url: item.editFrom ? '(data uri of ' + item.editFrom + ')' : undefined },
      editOf: item.editFrom || null,
      seed: gen.result.seed ?? null, requestId: gen.requestId, width: img.width || null, height: img.height || null,
      cutout: cut, sha256: crypto.createHash('sha256').update(fs.readFileSync(finalAbs)).digest('hex'),
      aiLabel: 'IPTC trainedAlgorithmicMedia XMP embedded (tools/ai-label.mjs)',
      generatedAt: new Date().toISOString(),
    };
    entry.attempt = rec.spend.calls.filter((c) => c.id === item.id && c.kind !== 'cutout').length;   // generation calls for this slot so far
    rec.images = rec.images.filter((i) => i.id !== item.id).concat(entry);
    byId.set(item.id, entry);
    rec.failures = (rec.failures || []).filter((f) => f.id !== item.id);
    // the sidecar: provenance + the review slot (PENDING until the by-eye review)
    const sidecar = {
      tool: 'tools/fal-gen.mjs', slot: item.id, file: finalRel, iptcDigitalSourceType: DST_URI,
      provenance: 'AI-generated (fal.ai). Illustrative only: never a photograph of Highway 90 (thehighway90.com), its store, staff, customers, products or brands.',
      model, prompt, input: entry.input, seed: entry.seed, requestId: entry.requestId, cutout: cut, width: entry.width, height: entry.height,
      sha256: entry.sha256, raw: entry.raw, attempt: entry.attempt, generatedAt: entry.generatedAt,
      review: { verdict: 'PENDING', reason: null },
    };
    fs.writeFileSync(finalAbs + '.json', JSON.stringify(sidecar, null, 2));
    made++;
    console.log('ok  ', item.id, '->', finalRel, (rawBytes / 1024).toFixed(0) + 'KB', (img.width || '?') + 'x' + (img.height || '?'), cut ? '+cutout' : '', 'attempt', entry.attempt, gen.requestId);
  } catch (e) {
    if (/^BUDGET/.test(String(e.message))) budgetStop = true;
    rec.failures = (rec.failures || []).filter((f) => f.id !== item.id).concat({ id: item.id, reason: String(e.message || e), at: new Date().toISOString() });
    console.log('FAIL', item.id, String(e.message || e).slice(0, 240));
  }
  rec.generated = new Date().toISOString();
  saveRecord();   // incremental: a crash loses nothing paid for
}

const conc = Math.max(1, Math.min(6, Number(args.concurrency || 1)));
let next = 0;
await Promise.all(Array.from({ length: conc }, async () => { while (next < todo.length) { const it = todo[next++]; await one(it); } }));
console.log('made', made, 'skipped (on disk)', skipped, 'failures', (rec.failures || []).length, 'spend', JSON.stringify({ ultra: rec.spend.ultraCalls, cutout: rec.spend.cutoutCalls, estUSD: rec.spend.estUSD }), budgetStop ? 'BUDGET STOP' : '');
process.exitCode = 0;   // set, never forced: exiting while undici closes sockets aborts Node on Windows (libuv UV_HANDLE_CLOSING)
