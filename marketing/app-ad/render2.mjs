import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const [,, mode, a1, a2, a3] = process.argv; // still <out.png> <t,t,...> | video <out.mp4> <from> <to>
const html = fs.readFileSync('base.html', 'utf8').replace('<head>', '<head><base href="http://127.0.0.1:3300/">');
const b = await chromium.launch({ args: ['--force-color-profile=srgb'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
// Same origin as the app, so next/font files load (an about:blank page would be blocked by CORS).
await p.goto('http://127.0.0.1:3300/robots.txt');
await p.setContent(html, { waitUntil: 'networkidle' });
await p.addStyleTag({ content: fs.readFileSync('overlay.css', 'utf8') });
await p.addScriptTag({ content: fs.readFileSync('timeline.js', 'utf8') });
await p.evaluate(async () => {
  // next/font faces load lazily: request every weight used before the first frame.
  const fams = [...document.fonts].map((f) => f.family);
  await Promise.all([...new Set(fams)].flatMap((f) => ['400', '500', '600', '700'].map((w) => document.fonts.load(`${w} 40px ${f}`).catch(() => null))));
  await document.fonts.ready;
});
await p.waitForTimeout(300);
const cdp = await p.context().newCDPSession(p);
const shot = async (t, fmt = 'png') => { await p.evaluate((t) => window.render(t), t); return Buffer.from((await cdp.send('Page.captureScreenshot', { format: fmt, ...(fmt === 'jpeg' ? { quality: 80 } : {}), optimizeForSpeed: true })).data, 'base64'); };
if (mode === 'still') {
  const ts = a2.split(',').map(Number);
  const imgs = [];
  for (const t of ts) imgs.push(await shot(t, 'jpeg'));
  const s = await b.newPage({ viewport: { width: 1920, height: Math.ceil(ts.length / 2) * 556 } });
  await s.setContent(`<body style="margin:0;background:#222;display:grid;grid-template-columns:1fr 1fr;gap:6px;font:20px sans-serif;color:#fff">${imgs.map((im, i) => `<div style="position:relative"><img style="width:957px;display:block" src="data:image/jpeg;base64,${im.toString('base64')}"><b style="position:absolute;left:8px;top:6px;background:#000a;padding:2px 8px">${ts[i]}s</b></div>`).join('')}</body>`);
  await s.screenshot({ path: a1, fullPage: true });
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
await b.close();
