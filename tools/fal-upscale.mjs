// fal-upscale.mjs — run one fal image upscaler on a local file and save the result. Node builtins only.
//   node tools/fal-upscale.mjs --in <image> --model fal-ai/esrgan --input '{"scale":4}' --out <file> --key-file <path>
// The source image travels as a data URI (image_url); --input is merged over it. The key is NEVER read from, or
// written into, the project tree (same rule as fal-gen.mjs). Prints the request id and the output size.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1]]]) : a), []));
if (args['key-file'] && path.resolve(args['key-file']).startsWith(PROJ)) { console.error('refusing a key file inside the project tree'); process.exit(2); }
const KEY = (process.env.FAL_KEY || (args['key-file'] ? fs.readFileSync(args['key-file'], 'utf8') : '')).trim();
if (!KEY) { console.error('no fal key: set FAL_KEY or pass --key-file'); process.exit(2); }
if (!args.in || !args.model || !args.out) { console.error('need --in, --model and --out'); process.exit(2); }

const ext = path.extname(args.in).slice(1).toLowerCase().replace('jpg', 'jpeg');
const input = { image_url: `data:image/${ext};base64,` + fs.readFileSync(args.in).toString('base64'), ...JSON.parse(args.input || '{}') };
const H = { Authorization: 'Key ' + KEY, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sub = await fetch('https://queue.fal.run/' + args.model, { method: 'POST', headers: H, body: JSON.stringify(input) });
const subj = await sub.json();
if (!sub.ok) { console.error('submit', sub.status, JSON.stringify(subj).slice(0, 600)); process.exit(1); }
let st;
for (let t = 0; t < 180; t++) {
  st = await (await fetch(subj.status_url, { headers: H })).json();
  if (st.status === 'COMPLETED') break;
  await sleep(2000);
}
const res = await fetch(subj.response_url, { headers: H });
const out = await res.json();
if (!res.ok) { console.error('result', res.status, JSON.stringify(out).slice(0, 600)); process.exit(1); }
const url = (out.image && out.image.url) || (out.images && out.images[0] && out.images[0].url);
if (!url) { console.error('no image in result', JSON.stringify(out).slice(0, 600)); process.exit(1); }
const bin = Buffer.from(await (await fetch(url)).arrayBuffer());
fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
fs.writeFileSync(args.out, bin);
fs.writeFileSync(args.out + '.json', JSON.stringify({ model: args.model, input: { ...input, image_url: '<data uri of ' + path.basename(args.in) + '>' }, request_id: subj.request_id, output: { ...out, image: out.image ? { ...out.image } : undefined } }, null, 1));
console.log(args.model, 'request', subj.request_id, '->', args.out, bin.length, 'bytes');
