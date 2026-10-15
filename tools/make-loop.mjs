// make-loop.mjs — turn one generated clip into a calm, seamless web loop. Node builtins + ffmpeg/ffprobe on PATH.
//
//   node tools/make-loop.mjs --in tmp/hf/aurora.mp4 --out assets/media/hero-aurora [--fade 1.5] [--width 1920]
//        [--phone-width 720 --phone-aspect 9:16 --phone-x 0.5] [--what "AI-generated still with a camera drift"] [--crf 26] [--label "Higgsfield kling-video/v3.0-turbo/image-to-video"]
//
// Seamless loop: L = xfade( clip[fade..T], clip[0..fade], offset = T - 2*fade, duration = fade ).
//   L(0) = clip(fade); at its end L crossfades back into clip(fade) — so the last frame flows into the first.
//   Duration of L = T - fade.
// Writes <out>.mp4 (H.264 yuv420p, no audio, +faststart), <out>.webm (VP9, no audio), <out>-poster.webp (frame 0 of L,
// which is also what the page shows before the video loads), optional <out>-phone.mp4 (centre crop) and <out>.json:
// durations, sizes, bitrates, and the CALMNESS measurement (ffmpeg signalstats YDIF = mean absolute luma change between
// consecutive frames, 0-255): max, p95, and the count of frames over 20 (an abrupt change). WCAG 2.3.1 demands no
// flashing; a slow aurora drift should stay in the low single digits. The seam itself is measured too (last->first frame).
// The AI label goes into the MP4/WebM metadata (comment + description), since XMP-in-WebP does not apply to video.
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
const FF = process.env.FFMPEG || 'ffmpeg', FP = process.env.FFPROBE || 'ffprobe';
const run = (bin, a) => {
  const r = spawnSync(bin, a, { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(bin + ' ' + a.join(' ').slice(0, 300) + '\n' + (r.stderr || '').slice(-1500));
  return r;
};
if (!args.in || !args.out) { console.error('need --in and --out'); process.exit(2); }
const inp = path.resolve(PROJ, String(args.in));
const out = path.resolve(PROJ, String(args.out));
fs.mkdirSync(path.dirname(out), { recursive: true });
const fade = Number(args.fade || 1.5);
const width = Number(args.width || 1920);
const crf = String(args.crf || 26);
const label = String(args.label || 'AI-generated video');
// the IPTC digital source type URI rides in the note so a byte grep for trainedAlgorithmicMedia (DESIGN-SPEC R-40) finds
// it in the container tags; tools/ai-label.mjs verify checks it there (lane IMG, 2026-10-12)
// --what: how the label opens; a camera drift over an AI still (tools/still-loop.mjs) is not AI motion
const what = String(args.what || 'AI-generated illustrative motion');
const aiNote = what + ' (' + label + '). IPTC digital source type: http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia. Not footage of Highway 90 (thehighway90.com), its store, staff, customers, products or brands.';

const probe = JSON.parse(run(FP, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_frames:format=duration', '-of', 'json', inp]).stdout);
const T = Number(probe.format.duration);
const [fn, fd] = String(probe.streams[0].r_frame_rate).split('/').map(Number);
const fps = fd ? fn / fd : fn;
if (!(T > 2 * fade + 1)) throw new Error('clip too short for a ' + fade + 's crossfade: ' + T + 's');
const offset = (T - 2 * fade).toFixed(3);
const loopGraph = `[0:v]trim=start=${fade}:end=${T},setpts=PTS-STARTPTS,fps=${fps}[a];[0:v]trim=start=0:end=${fade},setpts=PTS-STARTPTS,fps=${fps}[b];[a][b]xfade=transition=fade:duration=${fade}:offset=${offset},scale='min(${width},iw)':-2:flags=lanczos,format=yuv420p[v]`;

const mp4 = out + '.mp4', webm = out + '.webm', poster = out + '-poster.webp';
run(FF, ['-y', '-loglevel', 'error', '-i', inp, '-filter_complex', loopGraph, '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-profile:v', 'high', '-movflags', '+faststart', '-metadata', 'comment=' + aiNote, '-metadata', 'description=' + aiNote, mp4]);
run(FF, ['-y', '-loglevel', 'error', '-i', mp4, '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '36', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-metadata', 'comment=' + aiNote, webm]);
run(FF, ['-y', '-loglevel', 'error', '-i', mp4, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '82', poster]);
let phone = null;
if (args['phone-width']) {
  const pw = Number(args['phone-width']);
  const [aw, ah] = String(args['phone-aspect'] || '9:16').split(':').map(Number);
  // --phone-x 0..1: where the crop sits across the frame (0 left edge, 0.5 centre (default), 1 right edge), so a subject
  // composed off-centre for a wide banner stays in the phone cut
  const fx = Math.min(1, Math.max(0, Number(args['phone-x'] ?? 0.5)));
  phone = out + '-phone.mp4';
  run(FF, ['-y', '-loglevel', 'error', '-i', mp4, '-vf', `crop='min(iw,ih*${aw}/${ah})':ih:'(iw-ow)*${fx}':0,scale=${pw}:-2:flags=lanczos,format=yuv420p`, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', String(Number(crf) + 2), '-movflags', '+faststart', '-metadata', 'comment=' + aiNote, phone]);
}

// calmness: YDIF per frame over the loop played twice (so the seam is measured as an ordinary frame change)
function ydif(file) {
  const r = spawnSync(FF, ['-hide_banner', '-stream_loop', '1', '-i', file, '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YDIF', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const vals = [...String(r.stderr).matchAll(/lavfi\.signalstats\.YDIF=([0-9.]+)/g)].map((m) => Number(m[1]));
  return vals.slice(1);   // the first frame has no predecessor
}
const d = ydif(mp4);
const sorted = [...d].sort((x, y) => x - y);
const loopFrames = Math.round((T - fade) * fps);
const seam = d[loopFrames - 1] ?? null;   // the frame change from the loop's last frame to its first
const report = {
  tool: 'tools/make-loop.mjs', input: path.relative(PROJ, inp).split(path.sep).join('/'), inputDuration: T, fps, fade,
  loopDuration: +(T - fade).toFixed(3),
  outputs: Object.fromEntries([mp4, webm, poster, phone].filter(Boolean).map((f) => [path.relative(PROJ, f).split(path.sep).join('/'), fs.statSync(f).size])),
  calmness: {
    metric: 'ffmpeg signalstats YDIF (mean absolute luma change between consecutive frames, 0-255), measured over two plays of the loop',
    frames: d.length, max: sorted[sorted.length - 1], p95: sorted[Math.floor(sorted.length * 0.95)], mean: +(d.reduce((a, b) => a + b, 0) / (d.length || 1)).toFixed(3),
    framesOver20: d.filter((v) => v > 20).length, seamChange: seam,
  },
  aiLabel: aiNote, generatedAt: new Date().toISOString(),
};
fs.writeFileSync(out + '.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.calmness), JSON.stringify(report.outputs));
