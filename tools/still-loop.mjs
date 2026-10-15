// still-loop.mjs — a calm periodic camera drift (slow zoom "breath" plus a sideways drift) rendered from ONE still with
// ffmpeg, for a banner whose image the video model refused or barely moved. No AI motion: the frames are the still's own
// pixels. Node builtins + ffmpeg on PATH.
//
//   node tools/still-loop.mjs --in <still> --out tmp/x/drift.mp4 [--width 1920 --height 1080] [--period 10] [--fade 1.5]
//        [--zoom 1.08 --zoom-amp 0.04] [--drift 0.6] [--hflip] [--crop-x 0.5]
//
// The motion is periodic with --period seconds and the clip runs period + fade seconds, so tools/make-loop.mjs (same
// --fade) crossfades frames that are identical (clip(P + s) = clip(s)): the loop is seamless with no ghosting.
//   zoom(n) = zoom - amp * cos(2 pi n / P)            (never below 1: the frame always stays inside the still)
//   x(n)    = x0 * (1 + drift * sin(2 pi n / P))      (x0 = the centred offset; drift < 1 keeps it inside)
// The still is first cropped to the output aspect (at --crop-x across the frame) and upscaled 4x, so zoompan's integer
// offsets move in quarter output pixels (no visible jitter).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const PROJ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const k = argv[i].slice(2);
  args[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
}
if (!args.in || !args.out) { console.error('need --in and --out'); process.exit(2); }
const FF = process.env.FFMPEG || 'ffmpeg';
const W = Number(args.width || 1920), H = Number(args.height || 1080);
const P = Number(args.period || 10), fade = Number(args.fade || 1.5), fps = 24;
const Z = Number(args.zoom || 1.08), A = Number(args['zoom-amp'] || 0.04), D = Number(args.drift ?? 0.6);
const cx = Math.min(1, Math.max(0, Number(args['crop-x'] ?? 0.5)));
if (Z - A < 1) { console.error('zoom - zoom-amp must stay >= 1'); process.exit(2); }
if (D < 0 || D >= 1) { console.error('--drift must be in [0, 1)'); process.exit(2); }
const Pf = Math.round(P * fps), N = Math.round((P + fade) * fps);
const inp = path.resolve(PROJ, String(args.in)), out = path.resolve(PROJ, String(args.out));
fs.mkdirSync(path.dirname(out), { recursive: true });
const th = `2*PI*on/${Pf}`;
const vf = [
  args.hflip ? 'hflip' : null,
  // crop the still to the output aspect, then upscale 4x
  `crop='min(iw,ih*${W}/${H})':'min(ih,iw*${H}/${W})':'(iw-ow)*${cx}':'(ih-oh)/2'`,
  `scale=${W * 4}:${H * 4}:flags=lanczos`,
  `zoompan=z='${Z}-${A}*cos(${th})':x='(iw-iw/zoom)/2*(1+${D}*sin(${th}))':y='(ih-ih/zoom)/2':d=${N}:s=${W}x${H}:fps=${fps}`,
  // a JPEG still decodes full range (yuvj420p, pc): convert the levels to limited range, or Chrome's VP9 decoder
  // rejects the WebM (PIPELINE_ERROR_DECODE) while ffmpeg decodes it fine
  'scale=out_range=tv',
  'format=yuv420p',
].filter(Boolean).join(',');
const r = spawnSync(FF, ['-y', '-loglevel', 'error', '-i', inp, '-vf', vf, '-frames:v', String(N), '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-color_range', 'tv', out], { encoding: 'utf8', maxBuffer: 1 << 26 });
if (r.status !== 0) { console.error(r.stderr || 'ffmpeg failed'); process.exit(1); }
const rec = { tool: 'tools/still-loop.mjs', input: path.relative(PROJ, inp).split(path.sep).join('/'), out: path.relative(PROJ, out).split(path.sep).join('/'), width: W, height: H, fps, periodSeconds: P, fadeSeconds: fade, frames: N, zoom: Z, zoomAmp: A, drift: D, hflip: !!args.hflip, cropX: cx, aiMotion: false };
fs.writeFileSync(out + '.json', JSON.stringify(rec, null, 2) + '\n');
console.log('ok ' + rec.out + ' ' + W + 'x' + H + ' ' + N + ' frames (period ' + P + ' s + fade ' + fade + ' s)');
