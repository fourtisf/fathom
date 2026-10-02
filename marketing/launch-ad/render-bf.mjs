// Deterministic renderer: same stage as render.mjs, but every frame is produced with
// HeadlessExperimental.beginFrame (headless shell, begin-frame control), so each capture is a fully
// rastered frame of exactly the state render(t) set. Screenshots of a free-running compositor can show
// stale tiles while the camera zooms; this cannot.
// Usage: still <out.jpg> <t,t,...> | one <out.png> <t> | video <out.mp4> <from> <to>   (TL, OV select files)
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const [,, mode, a1, a2, a3] = process.argv;
const ORIGIN = 'http://127.0.0.1:3300/';
const read = (f) => fs.readFileSync(f, 'utf8');
const inner = (f) => read(f).replace('<head>', `<head><base href="${ORIGIN}"><style>${read('frame.css')}</style>`);
const PAGES = { fL: inner('landing.html'), fG: inner('gate.html'), fS: inner('scan.html'), fA: inner('app.html') };
const head = read('app.html').match(/<link rel="stylesheet"[^>]*>/g).join('');
const htmlClass = read('app.html').match(/<html[^>]*class="([^"]*)"/)[1];
const stage = `<!DOCTYPE html><html lang="en" class="${htmlClass}"><head><meta charset="utf-8"><base href="${ORIGIN}">${head}<style>${read(process.env.OV ?? 'overlay.css')}</style></head>
<body>${read('sprite.html')}<div id="adbg"><i class="a1"></i><i class="a2"></i><i class="a3"></i></div>
${Object.keys(PAGES).map((k) => `<div class="cam" id="cam${k[1]}"><iframe id="${k}" scrolling="no"></iframe></div>`).join('')}</body></html>`;

const browser = await puppeteer.launch({
  executablePath: process.env.SHELL_BIN ?? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  headless: 'shell',
  defaultViewport: null,
  args: ['--no-sandbox', '--force-color-profile=srgb', '--deterministic-mode', '--enable-begin-frame-control', '--disable-new-content-rendering-timeout',
    '--run-all-compositor-stages-before-draw', '--disable-threaded-animation', '--disable-threaded-scrolling', '--disable-checker-imaging', '--hide-scrollbars'],
});
const bs = await browser.target().createCDPSession();
const { targetId } = await bs.send('Target.createTarget', { url: 'about:blank', enableBeginFrameControl: true, width: 1920, height: 1080 });
const target = await browser.waitForTarget((t) => t._targetId === targetId);
const page = await target.page();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
const cdp = await page.createCDPSession();
const frame = (fmt) => cdp.send('HeadlessExperimental.beginFrame', fmt ? { screenshot: { format: fmt } } : {});
// Drive frames while the page loads (nothing paints without them).
let pumping = true;
const pump = (async () => { while (pumping) { await frame().catch(() => null); await new Promise((r) => setTimeout(r, 20)); } })();
await page.goto(ORIGIN + 'robots.txt'); // same origin as the app, so next/font files load
await page.setContent(stage, { waitUntil: 'load' });
await page.evaluate(async (pages) => {
  await Promise.all(Object.entries(pages).map(([id, html]) => new Promise((r) => { const f = document.getElementById(id); f.onload = r; f.srcdoc = html; })));
  const docs = [document, ...Object.keys(pages).map((id) => document.getElementById(id).contentDocument)];
  await Promise.all(docs.map(async (d) => {
    const fams = [...d.fonts].map((f) => f.family);
    await Promise.all([...new Set(fams)].flatMap((f) => ['400', '500', '600', '700'].map((w) => d.fonts.load(`${w} 40px ${f}`).catch(() => null))));
    await d.fonts.ready;
  }));
}, PAGES);
await new Promise((r) => setTimeout(r, 800));
await page.addScriptTag({ content: read(process.env.TL ?? 'timeline.js') });
pumping = false;
await pump;

let last = null;
const shot = async (t, fmt = 'png') => {
  await page.evaluate((t) => window.render(t), t);
  // Layout + raster at the new state; extra frames let every layer settle before the captured one.
  for (let i = 0; i < Number(process.env.SETTLE ?? 3); i++) await frame();
  const r = await frame(fmt);
  if (r.screenshotData) last = Buffer.from(r.screenshotData, 'base64');
  return last;
};
if (mode === 'still') {
  const ts = a2.split(',').map(Number);
  const imgs = [];
  for (const t of ts) { for (const d of [0.2, 0.1]) await shot(Math.max(0, t - d), 'jpeg'); imgs.push(await shot(t, 'jpeg')); }
  // Contact sheet: two columns, each frame scaled to half size.
  const list = imgs.map((im, i) => { const f = `${a1}.${i}.jpg`; fs.writeFileSync(f, im); return f; });
  const rows = Math.ceil(list.length / 2);
  const inputs = list.flatMap((f) => ['-i', f]);
  const pads = list.length % 2 ? ['-f', 'lavfi', '-i', 'color=c=0x222222:s=1920x1080'] : [];
  const n = list.length + (pads.length ? 1 : 0);
  const filter = Array.from({ length: n }, (_, i) => `[${i}]scale=957:-1,pad=963:542:0:0:0x222222[v${i}]`).join(';') +
    ';' + Array.from({ length: rows }, (_, r) => `[v${2 * r}][v${2 * r + 1}]hstack[r${r}]`).join(';') + ';' + Array.from({ length: rows }, (_, r) => `[r${r}]`).join('') + `vstack=${rows}`;
  const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, ...pads, '-filter_complex', rows > 1 ? filter : filter.replace(`[r0]vstack=1`, '[r0]null'), '-frames:v', '1', a1], { stdio: 'inherit' });
  await new Promise((r) => ff.on('close', r));
  list.forEach((f) => fs.unlinkSync(f));
} else if (mode === 'one') {
  for (const d of [0.2, 0.1]) await shot(Math.max(0, +a2 - d));
  fs.writeFileSync(a1, await shot(+a2));
} else {
  const FPS = 60, from = +a2, to = +a3, frames = Math.round((to - from) * FPS);
  const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', a1], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    const buf = await shot(from + i / FPS);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 300 === 0) console.log(`frame ${i}/${frames} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log('done', ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
await browser.close();
