// Renders the launch ad: the real landing, /app (before and after sign-in) and /scan (captured DOM + real CSS)
// in four iframes, driven frame by frame by timeline.js. Usage: still <out.png> <t,t,...> | one <out.png> <t> | video <out.mp4> <from> <to>
import { chromium } from 'playwright';
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

const b = await chromium.launch({ args: ['--force-color-profile=srgb', '--run-all-compositor-stages-before-draw', '--disable-checker-imaging', '--disable-threaded-animation', '--disable-threaded-scrolling', '--disable-partial-raster', '--disable-zero-copy'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto(ORIGIN + 'robots.txt'); // same origin as the app, so next/font files load
await p.setContent(stage, { waitUntil: 'networkidle' });
await p.evaluate(async (pages) => {
  await Promise.all(Object.entries(pages).map(([id, html]) => new Promise((r) => { const f = document.getElementById(id); f.onload = r; f.srcdoc = html; })));
  const docs = [document, ...Object.keys(pages).map((id) => document.getElementById(id).contentDocument)];
  await Promise.all(docs.map(async (d) => {
    const fams = [...d.fonts].map((f) => f.family);
    await Promise.all([...new Set(fams)].flatMap((f) => ['400', '500', '600', '700'].map((w) => d.fonts.load(`${w} 40px ${f}`).catch(() => null))));
    await d.fonts.ready;
  }));
}, PAGES);
await p.waitForTimeout(500);
await p.addScriptTag({ content: read(process.env.TL ?? 'timeline.js') });
if (process.env.RAF_WAIT) await p.evaluate((n) => { window.RAF_WAIT = n; }, +process.env.RAF_WAIT);
const cdp = await p.context().newCDPSession(p);
const shot = async (t, fmt = 'png') => {
  await p.evaluate((t) => window.render(t), t);
  // Let the compositor raster newly exposed areas (big scroll jumps) before the capture.
  await p.evaluate(() => new Promise((r) => { let n = 0; const f = () => (++n >= Number(window.RAF_WAIT || 2) ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }));
  return Buffer.from((await cdp.send('Page.captureScreenshot', { format: fmt, ...(fmt === 'jpeg' ? { quality: 82 } : {}), optimizeForSpeed: !process.env.SLOWCAP })).data, 'base64');
};
if (mode === 'still') {
  const ts = a2.split(',').map(Number);
  const imgs = [];
  // Warm up on nearby frames, as a video render would, so big jumps in time are fully painted.
  for (const t of ts) { for (const d of [0.3, 0.2, 0.1]) await shot(Math.max(0, t - d), 'jpeg'); imgs.push(await shot(t, 'jpeg')); }
  const s = await b.newPage({ viewport: { width: 1920, height: Math.ceil(ts.length / 2) * 556 } });
  await s.setContent(`<body style="margin:0;background:#222;display:grid;grid-template-columns:1fr 1fr;gap:6px;font:20px sans-serif;color:#fff">${imgs.map((im, i) => `<div style="position:relative"><img style="width:957px;display:block" src="data:image/jpeg;base64,${im.toString('base64')}"><b style="position:absolute;left:8px;top:6px;background:#000a;padding:2px 8px">${ts[i]}s</b></div>`).join('')}</body>`);
  await s.screenshot({ path: a1, fullPage: true });
} else if (mode === 'one') {
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
}
await b.close();
