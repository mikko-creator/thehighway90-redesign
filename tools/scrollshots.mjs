// scrollshots.mjs — viewport-sized screenshots taken while scrolling a page at a FIXED viewport.
// Full-height rasterising stretches any vh-sized block to the document height; this does not.
//   node tools/scrollshots.mjs --url <url> --width 1440 --height 900 --out tmp/shots/x [--max 12]
// Writes <out>.<width>.v00.png, v01 … one per viewport step.
import fs from 'node:fs';
import path from 'node:path';
import { launch, sleep } from './cdp.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]]) : a), []));
const w = Number(args.width || 1440), h = Number(args.height || 900), max = Number(args.max || 12);
const out = path.resolve(args.out || 'tmp/shots/scroll');
fs.mkdirSync(path.dirname(out), { recursive: true });
const b = await launch({ port: 0 });
try {
  const p = await b.newPage({ width: w, height: h });
  // --init "<js>" runs before any page script (e.g. pre-set the 21+ consent so the gate stays closed)
  if (args.init) await p.send('Page.addScriptToEvaluateOnNewDocument', { source: String(args.init) });
  if (args['reduced-motion']) await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await p.goto(args.url, { settle: 1200, timeout: 60000 });
  const iw = await p.eval('innerWidth');
  if (iw !== w) throw new Error(`viewport not applied: wanted ${w} got ${iw}`);
  await p.eval('document.fonts.ready.then(() => true)');
  const H = await p.eval('document.documentElement.scrollHeight');
  const step = Math.round(h * 0.92);
  let k = 0;
  for (let y = 0; y < H && k < max; y += step, k++) {
    await p.eval(`scrollTo({ top: ${y}, behavior: 'instant' })`);
    await sleep(Number(args.settle || 900));
    const r = await p.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${out}.${w}.v${String(k).padStart(2, '0')}.png`, Buffer.from(r.data, 'base64'));
  }
  console.log(`${args.url} ${w}x${h} docHeight ${H} -> ${k} shots at ${path.relative(process.cwd(), out)}.${w}.vNN.png`);
} finally { await b.close(); process.exit(0); }
