import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const [,, out, fps = '60', from = '0', to] = process.argv;
const FPS = +fps;
const b = await chromium.launch({ args: ['--force-color-profile=srgb'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto('file://' + process.cwd() + '/ad.html');
await p.evaluate(() => document.fonts.ready);
const dur = to ? +to : await p.evaluate(() => DURATION);
const frames = Math.round((dur - +from) * FPS);
const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-tune', 'film', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
const cdp = await p.context().newCDPSession(p);
const t0 = Date.now();
for (let i = 0; i < frames; i++) {
  await p.evaluate(t => render(t), +from + i / FPS);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
  const buf = Buffer.from(data, 'base64');
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  if (i % 300 === 0) console.log(`frame ${i}/${frames} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
ff.stdin.end();
await new Promise(r => ff.on('close', r));
await b.close();
console.log('done', ((Date.now() - t0) / 1000).toFixed(0) + 's');
