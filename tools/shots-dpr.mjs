#!/usr/bin/env node
// shots-dpr.mjs — screenshots at the operator's real review windows, at their true device pixel ratio.
//   node tools/shots-dpr.mjs --url http://127.0.0.1:8791/ --out tmp/shots/home
//        [--sizes 1280x585@1.5,1600x662@1.2,390x844@3,1440x900@1] [--full] [--scroll-steps 8]
//        [--init "<js run before any page script>"] [--reduced-motion] [--json <report.json>]
// For each size it writes <out>.<W>x<H>@<dpr>.png = the FIRST SCREEN at the true DPR (what the operator sees, and
// what a sharpness check needs); with --full also <out>.<W>x<H>.full.png = the whole page at DPR 1 (layout review;
// a full page at DPR 3 would be tens of thousands of pixels tall).
// Desktop sizes (W >= 1024) run with a REAL classic scrollbar (tools/cdp-realsb.mjs launches Chrome without
// --hide-scrollbars), because the operator reviews in Windows Chrome with a 15px scrollbar: the layout width is
// innerWidth minus the scrollbar. Phone/tablet sizes (W < 1024) are emulated as mobile (overlay scrollbars, touch).
// Assertions (a screenshot of the wrong state is worse than none): innerWidth equals the requested width, the
// document status is 200, fonts are ready, and broken images are listed. The report records clientWidth (scrollbar
// measured), scrollWidth (horizontal overflow) and the page height.
import fs from 'node:fs';
import path from 'node:path';
import { launch, sleep } from './cdp-realsb.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i];
  if (!k.startsWith('--')) continue;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) args[k.slice(2)] = true; else { args[k.slice(2)] = v; i++; }
}
if (!args.url) { console.error('need --url'); process.exit(2); }
const sizes = String(args.sizes || '1280x585@1.5,1600x662@1.2,390x844@3,1440x900@1').split(',').map((s) => {
  const m = s.trim().match(/^(\d+)x(\d+)(?:@([\d.]+))?$/);
  if (!m) throw new Error('bad size ' + s);
  return { w: Number(m[1]), h: Number(m[2]), dpr: Number(m[3] || 1) };
});
const out = path.resolve(args.out || 'tmp/shots/shot');
fs.mkdirSync(path.dirname(out), { recursive: true });
const report = { url: args.url, generated: new Date().toISOString(), shots: [] };
let failed = 0;
const b = await launch({ port: 0 });
try {
  for (const s of sizes) {
    const mobile = s.w < 1024;
    const p = await b.newPage({ width: s.w, height: s.h, mobile });
    await p.send('Emulation.setDeviceMetricsOverride', { width: s.w, height: s.h, deviceScaleFactor: s.dpr, mobile });
    if (mobile) await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    if (args.init) await p.send('Page.addScriptToEvaluateOnNewDocument', { source: String(args.init) });
    if (args['reduced-motion']) await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const href = await p.goto(args.url, { settle: 700, timeout: 60000 });
    const rec = { size: `${s.w}x${s.h}@${s.dpr}`, mobile, href };
    try {
      const iw = await p.eval('innerWidth');
      if (iw !== s.w) throw new Error(`viewport not applied: wanted ${s.w} got ${iw}`);
      const status = await p.eval("(performance.getEntriesByType('navigation')[0] || {}).responseStatus || 0");
      if (status !== 200) throw new Error(`document status ${status}`);
      await p.eval('document.fonts.ready.then(() => true)');
      const steps = Number(args['scroll-steps'] || 0);
      if (steps) {
        const H = await p.eval('document.documentElement.scrollHeight');
        for (let i = 1; i <= steps; i++) { await p.eval(`scrollTo(0, ${Math.round((H * i) / steps)})`); await sleep(280); }
        await p.eval('scrollTo(0, 0)'); await sleep(500);
      }
      await p.eval(`Promise.all([...document.images].filter(i => i.loading !== 'lazy' || i.getBoundingClientRect().top < innerHeight * 2).map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 8000); })))`);
      await sleep(Number(args.settle || 600));
      Object.assign(rec, await p.eval(`({ innerWidth, clientWidth: document.documentElement.clientWidth, scrollbar: innerWidth - document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, title: document.title, broken: [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.getAttribute('src')).map(i => i.getAttribute('src')).slice(0, 10) })`));
      rec.overflow = rec.scrollWidth > rec.clientWidth;
      const first = `${out}.${s.w}x${s.h}@${s.dpr}.png`;
      const r = await p.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(first, Buffer.from(r.data, 'base64'));
      rec.first = path.relative(process.cwd(), first);
      if (args.full) {
        const H = Math.min(rec.height, 20000);
        await p.send('Emulation.setDeviceMetricsOverride', { width: s.w, height: s.h, deviceScaleFactor: 1, mobile });
        await sleep(300);
        const fr = await p.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: s.w, height: H, scale: 1 }, captureBeyondViewport: true });
        const full = `${out}.${s.w}x${s.h}.full.png`;
        fs.writeFileSync(full, Buffer.from(fr.data, 'base64'));
        rec.full = path.relative(process.cwd(), full);
      }
      console.log(`${rec.size.padEnd(14)} cw ${rec.clientWidth} (scrollbar ${rec.scrollbar}) sw ${rec.scrollWidth}${rec.overflow ? ' OVERFLOW' : ''} h ${rec.height} broken ${rec.broken.length} -> ${rec.first}${rec.full ? ' + full' : ''}`);
    } catch (e) {
      rec.error = String(e.message || e); failed++;
      console.log(`${rec.size.padEnd(14)} ERROR ${rec.error}`);
    }
    report.shots.push(rec);
    try { await b.send('Target.closeTarget', { targetId: p.targetId }); } catch {}
  }
} finally { await b.close(); }
if (args.json) fs.writeFileSync(path.resolve(args.json), JSON.stringify(report, null, 1));
process.exit(failed ? 1 : 0);
