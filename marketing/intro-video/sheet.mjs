import { chromium } from 'playwright';
import fs from 'node:fs';
const times = process.argv.slice(2).map(Number);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto('file://' + process.cwd() + '/ad.html');
await p.evaluate(() => document.fonts.ready);
const imgs = [];
for (const t of times) { await p.evaluate(t => render(t), t); imgs.push(await p.screenshot({ type: 'jpeg', quality: 80 })); }
const s = await b.newPage({ viewport: { width: 1920, height: Math.ceil(times.length / 2) * 560 } });
await s.setContent(`<body style="margin:0;background:#222;display:grid;grid-template-columns:1fr 1fr;gap:6px;font:20px sans-serif;color:#fff">${imgs.map((im, i) => `<div style="position:relative"><img style="width:957px;display:block" src="data:image/jpeg;base64,${im.toString('base64')}"><b style="position:absolute;left:8px;top:6px;background:#000a;padding:2px 8px">${times[i]}s</b></div>`).join('')}</body>`);
await s.screenshot({ path: 'sheet.png', fullPage: true });
await b.close();
