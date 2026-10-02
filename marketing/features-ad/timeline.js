/* Noxsea AI tools ad: the real /app, frame by frame. Images, Deep Research, screenshots, contract audits,
   voice and Claude Opus 5.5. Outputs are illustrative; the contract is fictional (the end card says so). */
(() => {
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const P = (t, a, b) => clamp((t - a) / (b - a));
  const E = {
    out: (x) => 1 - Math.pow(1 - x, 3),
    io: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    expo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
    back: (x) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  };
  const lerp = (a, b, x) => a + (b - a) * x;
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  window.DURATION = 48;

  const A = document.getElementById('fA').contentDocument;
  const camA = document.getElementById('camA');
  const fA = document.getElementById('fA');
  const $ = (s, r = document) => r.querySelector(s);
  const bg = $('#adbg');
  bg.insertAdjacentHTML('beforeend', '<div class="grid"></div>');

  /* ---------- artwork (illustrative outputs) ---------- */
  const DROP = 'M32 8.5S14.5 27.2 14.5 39.2C14.5 48.6 22.3 56 32 56s17.5-7.4 17.5-16.8C49.5 27.2 32 8.5 32 8.5z';
  const KEY = 'M29.4 40.03A4.8 4.8 0 1 1 34.6 40.03L36.1 47.5H27.9Z';
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const bubbles = Array.from({ length: 46 }, () => `<circle cx="${(rnd() * 1344).toFixed(0)}" cy="${(rnd() * 768).toFixed(0)}" r="${(0.8 + rnd() * 3.2).toFixed(1)}" fill="#BFF3FF" opacity="${(0.15 + rnd() * 0.5).toFixed(2)}"/>`).join('');
  const rays = [0, 1, 2, 3, 4, 5].map((i) => { const x = 380 + i * 120 + rnd() * 40; return `<polygon points="${x},-10 ${x + 60},-10 ${x + 220 - i * 30},800 ${x + 40 - i * 20},800" fill="url(#gr)" opacity="${(0.25 + rnd() * 0.3).toFixed(2)}"/>`; }).join('');
  const ART = `<svg class="genimg s-landscape" id="art" viewBox="0 0 1344 768" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Generated image">
    <defs>
      <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16246B"/><stop offset=".45" stop-color="#0A1342"/><stop offset="1" stop-color="#030616"/></linearGradient>
      <linearGradient id="gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9FE9FF" stop-opacity=".55"/><stop offset="1" stop-color="#9FE9FF" stop-opacity="0"/></linearGradient>
      <linearGradient id="dg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#C9BFFF"/><stop offset=".5" stop-color="#6B78FF"/><stop offset="1" stop-color="#4FD6EC"/></linearGradient>
      <radialGradient id="halo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#7C8BFF" stop-opacity=".75"/><stop offset=".45" stop-color="#5B6CFF" stop-opacity=".25"/><stop offset="1" stop-color="#5B6CFF" stop-opacity="0"/></radialGradient>
      <filter id="soft"><feGaussianBlur stdDeviation="14"/></filter>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 .7  0 0 0 0 .75  0 0 0 0 1  0 0 0 .09 0"/></filter>
    </defs>
    <rect width="1344" height="768" fill="url(#sea)"/>
    <g filter="url(#soft)">${rays}</g>
    <ellipse cx="672" cy="330" rx="430" ry="300" fill="url(#halo)"/>
    ${[1, 2, 3].map((i) => `<ellipse cx="672" cy="530" rx="${150 + i * 120}" ry="${26 + i * 18}" fill="none" stroke="#7FD9F2" stroke-opacity="${0.42 - i * 0.11}" stroke-width="2"/>`).join('')}
    <path d="M0 640 C 180 600 320 660 470 630 S 760 590 900 628 S 1180 660 1344 612 V768 H0Z" fill="#050A26"/>
    <path d="M0 690 C 220 660 420 708 640 684 S 1060 650 1344 690 V768 H0Z" fill="#03061A"/>
    ${bubbles}
    <g transform="translate(497,148) scale(5.5)" filter="url(#glow)">
      <path d="${DROP}" fill="url(#dg)"/>
      <path d="${KEY}" fill="#0A1240"/>
      <path d="M24 20c-3 4.6-5.2 9.2-5.6 13" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.6" stroke-linecap="round"/>
    </g>
    <text x="672" y="608" text-anchor="middle" font-family="var(--sans), sans-serif" font-size="92" font-weight="600" letter-spacing="-3" fill="#fff">Noxsea</text>
    <text x="672" y="648" text-anchor="middle" font-family="var(--mono), monospace" font-size="18" letter-spacing="9" fill="#A9B4FF" opacity=".85">PRIVATE AI</text>
    <rect width="1344" height="768" filter="url(#grain)"/>
  </svg>`;

  // A candlestick chart screenshot for the vision demo.
  const chartSvg = (() => {
    seed = 21;
    let p = 120, out = '', vol = '';
    const N = 30;
    for (let i = 0; i < N; i++) {
      const drift = i < 20 ? 2.4 : i < 26 ? 0.9 : -0.3;
      const o = p, c = p + drift + (rnd() - 0.45) * 6;
      const hi = Math.max(o, c) + rnd() * 4, lo = Math.min(o, c) - rnd() * 4;
      const x = 30 + i * 18, Y = (v) => 330 - (v - 100) * 2.6;
      const up = c >= o, col = up ? '#3DDC97' : '#FF6B7A';
      out += `<line x1="${x}" x2="${x}" y1="${Y(hi)}" y2="${Y(lo)}" stroke="${col}" stroke-width="2"/><rect x="${x - 5}" y="${Math.min(Y(o), Y(c))}" width="10" height="${Math.max(2, Math.abs(Y(o) - Y(c)))}" fill="${col}" rx="1"/>`;
      const v = (i < 20 ? 40 + rnd() * 40 : 55 - (i - 20) * 3.5 + rnd() * 10);
      vol += `<rect x="${x - 5}" y="${470 - v}" width="10" height="${v}" fill="${col}" opacity=".45"/>`;
      p = c;
    }
    const rsi = Array.from({ length: N }, (_, i) => `${30 + i * 18},${i < 22 ? 560 - i * 2.4 : 507 + (i - 22) * 6}`).join(' ');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><rect width="600" height="600" fill="#0B0F1E"/>${[80, 160, 240, 320, 400].map((y) => `<line x1="0" x2="600" y1="${y}" y2="${y}" stroke="#1C2340"/>`).join('')}${out}${vol}<line x1="0" x2="600" y1="490" y2="490" stroke="#1C2340"/><line x1="0" x2="600" y1="512" y2="512" stroke="#FF6B7A" stroke-dasharray="4 4" opacity=".5"/><polyline points="${rsi}" fill="none" stroke="#B3A8FF" stroke-width="2.5"/></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  })();

  /* ---------- copy ---------- */
  const QA = 'A banner for Noxsea: the deep sea at night, a glowing sealed drop';
  const QB = 'What should I check before bridging to a new L2?';
  const QUERIES = ['L2 bridge security risks', 'verify official L2 bridge', 'L2BEAT rollup stages', 'bridge exploit causes'];
  const ANS_B = [
    { t: 'p', b: 'Short answer:', x: 'use the official bridge, check who can upgrade it, and test with a small amount first.' },
    { t: 'ol', b: 'Get the bridge link from the chain’s own docs,', x: 'never from ads or DMs [1].' },
    { t: 'ol', b: 'Check its risk stage on L2BEAT:', x: 'who can upgrade the contracts, and how fast [2].' },
    { t: 'ol', b: 'Know the withdrawal delay', x: 'before moving money you may need soon [1].' },
    { t: 'ol', b: 'Send a small test first,', x: 'then the rest [3].' },
    { t: 'p', x: 'Sources: [1] ethereum.org [2] l2beat.com [3] rekt.news + 9 more' },
  ];
  const QC = 'What does this chart say?';
  const ANS_C = [
    { t: 'p', b: 'An uptrend that is losing steam.', x: 'Higher lows all the way, but the last push came on falling volume and RSI is rolling over from 70.' },
    { t: 'p', b: 'Watch the last higher low.', x: 'A close below it would end the trend. Not financial advice.' },
  ];
  const CA = '0x4f2A9c7E81b3D05a6F1e2C3b4A5d6E7f8A91c19E';
  const QD = `Audit this contract on Base: ${CA}`;
  const ANS_D = [
    { t: 'p', b: 'No critical issues found.', x: 'Two things to know before you deposit:' },
    { t: 'ol', b: 'The owner can pause withdrawals', x: '(pause(), line 212). Check who holds that key.' },
    { t: 'ol', b: 'The fee can be raised to 10%', x: '(setFee(), line 340), with no timelock.' },
    { t: 'p', x: 'Automated review of the public source code, not a professional audit.' },
  ];
  const QE = 'Explain restaking like I’m five';

  /* ---------- overlay ---------- */
  const ov = document.createElement('div');
  ov.id = 'ov';
  ov.innerHTML = `
    <div class="hook" id="h1"><div><small>Noxsea</small>Your AI just<br>learned new tricks.</div></div>
    <div class="hook" id="h2"><div>It still <span class="grad">forgets you.</span></div></div>
    <div id="wcap"><span class="grad">6 new AI tools</span> <span class="dim">· same zero-log privacy</span></div>
    <div id="cap"><div class="n"></div><div class="t"></div><div class="s"></div></div>
    <div id="pchip"><img src="${chartSvg}" alt=""></div>
    <div id="flash"></div>
    <svg id="cur" viewBox="0 0 24 24"><path d="M5 3l14 7.5-6.2 1.7L10 18.5z" fill="#fff" stroke="#0A0E30" stroke-width="1.4"/></svg>
    <div id="ring"></div>
    <div id="endc">
      <svg class="lg" viewBox="0 0 64 64"><use href="#mk"/></svg>
      <div class="k">Noxsea</div>
      <h2>Private AI that<br><span class="grad">does more.</span></h2>
      <div class="feats">${['Create images', 'Deep Research', 'Reads screenshots', 'Contract audits', 'Voice', 'Private memory'].map((f) => `<span><i></i>${f}</span>`).join('')}<span class="prem"><i></i>Claude Opus 5.5</span></div>
      <div class="adcta">noxsea.xyz/app</div>
      <div class="fine">Prompts never logged · 25 free credits to start<br>Illustrative outputs · Demo contract</div>
    </div>
    <div id="fade"></div>`;
  document.body.appendChild(ov);

  /* ---------- app ---------- */
  const thread = $('.thread', A);
  const threadIn = $('.thread-in', A);
  const ta = $('.composer textarea', A);
  const composer = $('.composer', A);
  const send = $('.send', A);
  const toolsChip = $('[aria-label="Tools"]', A);
  const mic = $('.chip.mic', A);
  const balEls = [$('.bal span', A), $('.wallet-card b', A)];
  const menu = $('.menu.modelmenu', A);
  const menuItems = [...menu.querySelectorAll('button')];
  const opusItem = menuItems.find((b) => b.textContent.includes('Opus'));
  const modelBtn = $('.model-btn', A);
  const modelLogo0 = modelBtn.firstElementChild.outerHTML;
  const nameEl = [...modelBtn.children].find((c) => c.tagName === 'SPAN' && !c.classList.contains('mlogo'));
  const modelName0 = nameEl.innerHTML;
  // Same element as the button's own logo (size, class), with the Opus mark inside.
  const opusLogo = modelBtn.firstElementChild.cloneNode(true);
  opusLogo.innerHTML = opusItem.firstElementChild.innerHTML;
  opusLogo.style.background = opusItem.firstElementChild.style.background;
  nameEl.style.whiteSpace = 'nowrap';
  const SUGGEST = threadIn.innerHTML;
  const pre = A.createElement('div');
  composer.insertBefore(pre, ta);
  const PH = ta.placeholder;

  const IC = '<div class="ic"><svg aria-hidden="true"><use href="#mk"></use></svg></div>';
  const you = (t, img) => `<div class="m you" style="white-space:pre-wrap">${img ? `<span class="imgrow"><img src="${img}" alt=""></span>` : ''}${esc(t)}</div>`;
  const meta = (model, cr) =>
    `<div class="meta"><span>${model}</span><span>${cr} credits</span><span class="ok"><svg aria-hidden="true"><use href="#shield"></use></svg>Not logged</span><button class="mact">Copy</button><button class="mact">Regenerate</button><button class="mact">Listen</button></div>`;
  const SHIELD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z"></path><path d="M9 12l2 2 4-4"></path></svg>';
  const toolrun = (txt) => `<div class="toolrun">${SHIELD}<span class="shim">${txt}</span></div>`;
  function md(blocks, n) {
    let left = Math.floor(n);
    const out = [];
    let list = null, done = true;
    for (const bl of blocks) {
      if (left <= 0) { done = false; break; }
      const words = ((bl.b ? bl.b + ' ' : '') + bl.x).trim().split(' ');
      const take = Math.min(words.length, left);
      left -= take;
      const boldWords = bl.b ? bl.b.split(' ').length : 0;
      const shown = words.slice(0, take);
      const bPart = shown.slice(0, boldWords).join(' ');
      const rest = shown.slice(boldWords).join(' ');
      const inner = (bPart ? `<strong>${esc(bPart)}</strong>${rest ? ' ' : ''}` : '') + esc(rest).replace(/\[(\d)\]/g, '<sup style="color:#B3A8FF">[$1]</sup>');
      const listTag = bl.t === 'ol' ? 'ol' : null;
      if (list && list.tag !== listTag) { out.push(`<${list.tag}>${list.items.join('')}</${list.tag}>`); list = null; }
      if (listTag) (list ||= { tag: listTag, items: [] }).items.push(`<li>${inner}</li>`);
      else out.push(`<p>${inner}</p>`);
      if (take < words.length) { done = false; break; }
    }
    if (list) out.push(`<${list.tag}>${list.items.join('')}</${list.tag}>`);
    return { html: `<div class="md">${out.join('')}</div>`, done };
  }
  const stream = (blocks, t, t0, wps = 24) => {
    if (t < t0) return { html: '', done: false };
    const r = md(blocks, (t - t0) * wps);
    return { html: `<div>${r.html}${r.done ? '' : '<span class="caret"></span>'}</div>`, done: r.done };
  };
  const typed = (s, t, a, b) => s.slice(0, Math.round(s.length * P(t, a, b)));

  const sizebar = (land) =>
    `<div class="sizebar" role="radiogroup" aria-label="Image shape">${[['square', 'Square'], ['landscape', 'Landscape'], ['portrait', 'Portrait']]
      .map(([k, l]) => { const on = (k === 'landscape') === land; return `<button type="button" role="radio" aria-checked="${on}" class="${on ? 'on' : ''}"><i class="shape s-${k}" aria-hidden="true"></i>${l}</button>`; })
      .join('')}<span class="sizenote">3 credits per image · never stored</span></div>`;
  const voicebar = (t, a) => {
    const bars = Array.from({ length: 24 }, (_, i) => {
      const v = 0.25 + 0.75 * Math.abs(Math.sin(t * 9 + i * 0.7) * Math.sin(t * 3.1 + i * 0.31));
      return `<i style="height:${Math.max(3, Math.round(v * 22 * P(t, a, a + 0.3)))}px"></i>`;
    }).join('');
    return `<div class="voicebar" role="status"><span class="vdot"></span><span class="vlabel">Listening</span><span class="vlang">EN</span><span class="vclock">0:0${Math.min(9, Math.floor((t - a) * 1.6) + 1)}</span><span class="vwave">${bars}</span><span class="vnote">Audio stays on this device</span><span class="sp"></span><button class="mact">Cancel</button><button class="vdone">Done</button></div>`;
  };
  const VWORK = '<div class="voicebar" role="status"><span class="vdot busy"></span><span class="shim">Transcribing on your device…</span></div>';
  const attach = `<div class="attach-row"><span class="imgchip"><img src="${chartSvg}" alt=""><button>×</button></span></div>`;

  let lastThread = null, lastPre = null;
  function setThread(html) {
    if (html !== lastThread) { threadIn.innerHTML = html; lastThread = html; }
    thread.scrollTop = thread.scrollHeight;
  }
  function setPre(html) { if (html !== lastPre) { pre.innerHTML = html; lastPre = html; } }
  function setTa(text, ph = PH) {
    if (ta.value !== text) ta.value = text;
    ta.placeholder = ph;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }
  function setBal(v) { balEls[0].textContent = v; balEls[1].firstChild.textContent = v + ' '; }

  // Scene times
  const A0 = 7.9, A_SEND = 12.0, A_IMG = 13.7;
  const B0 = 16.4, B_SEND = 18.4;
  const C0 = 25.0, C_SEND = 27.3;
  const D0 = 31.2, D_SEND = 32.9;
  const V0 = 37.0, V_REC = 37.75, V_WORK = 39.0, V_TEXT = 39.45;
  const M0 = 39.8, M_OPEN = 40.35, M_PICK = 41.45;
  const END = 42.7;

  function app(t) {
    let html = SUGGEST, text = '', ph = PH, preH = '', tool = 'Tools', pressed = false, bal = '24.83';
    if (t >= A0 + 0.8 && t < B0) {
      tool = 'Image'; pressed = true; ph = 'Describe the image you want…';
      preH = sizebar(t >= 9.95);
      text = typed(QA, t, 10.05, 11.55);
      if (t >= A_SEND) {
        text = '';
        const img = t >= A_IMG
          ? `${ART}${t >= A_IMG + 1.0 ? `<div class="meta"><span>Image</span><span>3.00 credits</span><span class="ok"><svg aria-hidden="true"><use href="#shield"></use></svg>Not logged</span><a class="mact">Download</a></div>` : ''}`
          : '<div class="genimg wait s-landscape"><span class="shim">Generating your image privately…</span></div>';
        html = you(QA) + `<div class="m ai">${IC}<div class="b">${img}</div></div>`;
        if (t >= A_IMG + 1.0) bal = '21.83';
      }
    } else if (t >= B0 && t < C0) {
      bal = '21.83'; tool = 'Research'; pressed = true;
      text = typed(QB, t, B0 + 0.35, B0 + 1.55);
      if (t >= B_SEND) {
        text = '';
        const st = t < B_SEND + 0.7 ? 0 : t < B_SEND + 2.2 ? 1 : t < B_SEND + 2.75 ? 2 : t < 24.0 ? 3 : 4;
        const qn = Math.min(4, Math.floor(P(t, B_SEND + 0.75, B_SEND + 1.9) * 4.99));
        const steps = [
          ['Planning the research', null],
          [st >= 1 ? 'Searching the web · 4 searches' : 'Searching the web', st >= 1 ? QUERIES.slice(0, st > 1 ? 4 : qn) : null],
          [st >= 2 ? 'Reading 12 sources · your IP stayed hidden' : 'Reading sources', null],
          ['Writing the report', null],
        ];
        const rs = `<div class="rsteps">${steps.map(([l, d], i) => `<div class="rstep${i < st ? ' ok' : i === st ? ' on' : ''}"><i>${i < st ? '✓' : ''}</i><div><span class="${i === st ? 'shim' : ''}">${l}</span>${d && d.length ? `<ul>${d.map((q) => `<li>${q}</li>`).join('')}</ul>` : ''}</div></div>`).join('')}</div>`;
        const r = stream(ANS_B, t, B_SEND + 2.85, 26);
        html = you(QB) + `<div class="m ai">${IC}<div class="b">${rs}${r.html}${r.done ? meta('DeepSeek V4 Pro', '4.31') : ''}</div></div>`;
        if (r.done) bal = '17.52';
      }
    } else if (t >= C0 && t < D0) {
      bal = '17.52';
      preH = t >= C0 + 0.75 && t < C_SEND ? attach : '';
      text = typed(QC, t, C0 + 1.0, C0 + 1.9);
      if (t >= C_SEND) {
        text = '';
        const r = stream(ANS_C, t, C_SEND + 0.55, 24);
        const wait = t < C_SEND + 0.55 ? '<span class="shim" style="font-size:14px">Reading your image privately…</span>' : '';
        html = you(QC, chartSvg) + `<div class="m ai">${IC}<div class="b">${wait}${r.html}${r.done ? meta('Qwen3.5 397B Vision', '0.05') : ''}</div></div>`;
        if (r.done) bal = '17.47';
      }
    } else if (t >= D0 && t < V0) {
      bal = '17.47';
      text = typed(QD, t, D0 + 0.25, D0 + 1.35);
      if (t >= D_SEND) {
        text = '';
        const card = `<div class="auditcard" id="aud"><div class="ah"><span class="ak">Contract audit · Base</span><a class="mact">Explorer ↗</a></div><b>TideVault</b><div class="am"><span>Verified on Sourcify</span><span>1,284 lines · 6 files</span></div><p>Automated review of the public source code. Not a professional audit, not financial advice.</p></div>`;
        const pre1 = t < D_SEND + 0.35 ? '<span class="shim" style="font-size:14px">Answering privately…</span>' : t < D_SEND + 1.25 ? toolrun('Reading the verified source code on Base…') : card;
        const r = stream(ANS_D, t, D_SEND + 1.75, 25);
        html = you(QD) + `<div class="m ai">${IC}<div class="b">${pre1}${r.html}${r.done ? meta('DeepSeek V4 Pro', '0.92') : ''}</div></div>`;
        if (r.done) bal = '16.55';
      }
    } else if (t >= V0) {
      bal = '16.55';
      preH = t >= V_REC && t < V_WORK ? voicebar(t, V_REC) : t >= V_WORK && t < V_TEXT ? VWORK : '';
      text = t >= V_TEXT ? QE : '';
    }
    setThread(html);
    setPre(preH);
    setTa(text, ph);
    setBal(bal);
    toolsChip.querySelector('.cl').textContent = tool;
    toolsChip.setAttribute('aria-pressed', String(pressed));
    send.disabled = !text;
    mic.setAttribute('aria-pressed', String(t >= V_REC && t < V_WORK));

    // Feature cards light up in turn before the first tool is picked.
    A.querySelectorAll('.feat').forEach((el, i) => {
      const a = 6.15 + i * 0.2;
      const g = Math.sin(Math.PI * P(t, a, a + 0.75));
      const pick = el.classList.contains('f-image') ? P(t, A0 + 0.55, A0 + 0.7) * (1 - P(t, A0 + 1.0, A0 + 1.6)) : 0;
      const k = Math.max(g, pick);
      el.style.boxShadow = k > 0.01 ? `0 0 0 ${1.5 * k}px rgba(179,168,255,${0.7 * k}), 0 0 ${40 * k}px rgba(139,124,255,${0.5 * k})` : '';
      el.style.transform = k > 0.01 ? `translateY(${-3 * g}px) scale(${1 - 0.03 * pick})` : '';
    });
    // Generated image: a diffusion-style reveal, from blur and noise to sharp.
    const art = A.getElementById('art');
    if (art) {
      const k = E.out(P(t, A_IMG, A_IMG + 1.3));
      art.style.filter = k < 1 ? `blur(${(1 - k) * 22}px) saturate(${0.4 + 0.6 * k}) brightness(${0.75 + 0.25 * k})` : 'none';
      art.style.transform = `scale(${0.985 + 0.015 * k})`;
    }
    const aud = A.getElementById('aud');
    if (aud) { const k = E.expo(P(t, D_SEND + 1.25, D_SEND + 1.8)); aud.style.opacity = String(k); aud.style.transform = `translateY(${(1 - k) * 18}px)`; }
    A.querySelectorAll('.rstep li').forEach((li, i) => {
      const k = E.back(P(t, B_SEND + 0.75 + i * 0.29, B_SEND + 1.05 + i * 0.29));
      li.style.transform = `scale(${0.6 + 0.4 * k})`;
      li.style.display = 'inline-block';
    });
    // Model menu: open, hover Opus 5.5, pick it.
    const open = t >= M_OPEN && t < M_PICK + 0.12;
    menu.classList.toggle('open', open);
    const hov = P(t, 40.95, 41.1);
    opusItem.style.background = open && hov ? `rgba(139,124,255,${0.16 * hov})` : '';
    const picked = t >= M_PICK + 0.12;
    menuItems.forEach((b) => b.setAttribute('aria-checked', String(b === opusItem ? picked : b === menuItems[0] && !picked)));
    if (String(picked) !== modelBtn.dataset.p) {
      modelBtn.dataset.p = String(picked);
      modelBtn.firstElementChild.outerHTML = picked ? opusLogo.outerHTML : modelLogo0;
      nameEl.innerHTML = picked ? 'Claude Opus 5.5' : modelName0;
    }
    const pf = P(t, A0 + 1.1, A0 + 1.3) * (1 - P(t, A_SEND - 0.5, A_SEND));
    composer.style.boxShadow = pf ? `0 0 0 ${2 * pf}px rgba(179,168,255,.6), 0 0 50px rgba(139,124,255,${0.4 * pf})` : '';
  }

  /* ---------- camera ---------- */
  const rc = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
  const PA = { composer: rc(composer), feats: rc($('.feats', A)), tin: rc(threadIn), model: rc(modelBtn) };
  const MENU_X = PA.model.x + 120, MENU_Y = PA.model.top + 330;
  // Shot: content point (x,y) shown at screen point (sx, sy) with scale s.
  const shot = (x, y, s, sx = 1240, sy = 540, w = 0) => ({ cx: x - (sx - 960) / s, cy: y - (sy - 540) / s, s, w });
  const lastAi = () => { const m = [...A.querySelectorAll('.m.ai')].pop(); return m ? rc(m) : null; };
  const follow = (s, sy = 560) => () => {
    const m = lastAi();
    const y = m ? Math.max(PA.tin.top + (sy - 40) / s, m.bottom - 300 / s) : PA.tin.top + 400;
    return shot(PA.tin.x, y, s, 1240, sy);
  };
  const SHOTS = [
    [0, () => ({ cx: 960, cy: 540, s: 0.74, w: 1 })],
    [7.3, () => ({ cx: 960, cy: 540, s: 0.74, w: 1 })],
    [8.1, () => shot(PA.feats.x, PA.feats.y + 60, 1.45)],
    [8.95, () => shot(PA.feats.x, PA.feats.y + 60, 1.45)],
    [9.7, () => shot(PA.composer.x, PA.composer.y, 1.65, 1240, 700)],
    [A_SEND + 0.1, () => shot(PA.composer.x, PA.composer.y, 1.65, 1240, 700)],
    [A_SEND + 0.9, follow(1.5)],
    [A_IMG + 0.2, follow(1.5)],
    [A_IMG + 1.4, follow(1.85, 600)],
    [B0 - 0.05, follow(1.85, 600)],
    [B0 + 0.35, () => shot(PA.composer.x, PA.composer.y, 1.65, 1240, 700)],
    [B_SEND + 0.1, () => shot(PA.composer.x, PA.composer.y, 1.65, 1240, 700)],
    [B_SEND + 0.8, follow(1.42)],
    [C0 - 0.05, follow(1.42)],
    [C0 + 0.35, () => shot(PA.composer.x, PA.composer.y, 1.65, 1240, 700)],
    [C_SEND + 0.1, () => shot(PA.composer.x, PA.composer.y, 1.65, 1240, 700)],
    [C_SEND + 0.8, follow(1.5)],
    [D0 - 0.05, follow(1.5)],
    [D0 + 0.35, () => shot(PA.composer.x, PA.composer.y, 1.65, 1240, 700)],
    [D_SEND + 0.1, () => shot(PA.composer.x, PA.composer.y, 1.65, 1240, 700)],
    [D_SEND + 0.8, follow(1.5)],
    [V0 - 0.05, follow(1.5)],
    [V0 + 0.4, () => shot(PA.composer.x, PA.composer.y, 1.7, 1240, 640)],
    [M0, () => shot(PA.composer.x, PA.composer.y, 1.7, 1240, 640)],
    [M0 + 0.5, () => shot(MENU_X, MENU_Y, 1.45, 1180, 520)],
    [END - 0.3, () => shot(MENU_X, MENU_Y, 1.45, 1180, 520)],
    [END + 0.5, () => ({ cx: 960, cy: 540, s: 0.74, w: 1 })],
  ];
  const CUTS = [B0, C0, D0, V0]; // hard scene changes get a quick whip
  function camAt(t) {
    let i = 0;
    while (i < SHOTS.length - 1 && SHOTS[i + 1][0] <= t) i++;
    const a = { w: 0, ...SHOTS[i][1]() };
    if (i === SHOTS.length - 1) return a;
    const b = { w: 0, ...SHOTS[i + 1][1]() };
    const x = E.io(P(t, SHOTS[i][0], SHOTS[i + 1][0]));
    return { cx: lerp(a.cx, b.cx, x), cy: lerp(a.cy, b.cy, x), s: lerp(a.s, b.s, x), w: lerp(a.w, b.w, x) };
  }
  let camSm = null;
  function place(cam, c, { dx = 0, dy = 0, op = 1, rx = 0, blur = 0, extraScale = 1 }) {
    let tx = c.s * (960 - c.cx), ty = c.s * (540 - c.cy);
    if (c.s >= 1) { tx = clamp(tx, 960 - 960 * c.s, 960 * c.s - 960); ty = clamp(ty, 540 - 540 * c.s, 540 * c.s - 540); }
    cam.style.opacity = String(op);
    cam.style.visibility = op > 0.001 ? 'visible' : 'hidden';
    cam.style.transform = `translate(${tx + dx}px, ${ty + dy}px) scale(${c.s * extraScale}) perspective(2400px) rotateX(${rx}deg)`;
    cam.style.borderRadius = `${c.w * 22}px`;
    cam.style.boxShadow = c.w > 0.01 ? `0 ${60 * c.w}px ${160 * c.w}px -30px rgba(0,0,0,.9), 0 0 0 ${c.w}px rgba(255,255,255,.12)` : 'none';
    cam.style.filter = blur > 0.05 ? `blur(${blur}px)` : 'none';
  }
  function cameras(t) {
    const enter = E.expo(P(t, 5.0, 6.3));
    const leave = E.io(P(t, END + 0.2, END + 0.9));
    const c = camAt(t);
    // Smooth the stream-following shots so the camera glides instead of stepping per word.
    if (!camSm || Math.abs(t - camSm.t) > 0.05) camSm = { ...c, t };
    else { const k = 0.18; camSm = { cx: lerp(camSm.cx, c.cx, k), cy: lerp(camSm.cy, c.cy, k), s: lerp(camSm.s, c.s, 0.35), w: c.w, t }; }
    const whip = CUTS.reduce((m, x) => Math.max(m, Math.sin(Math.PI * P(t, x - 0.18, x + 0.32))), 0);
    place(camA, camSm, {
      dy: (1 - enter) * 90 + Math.sin(t * 0.5) * 4 * c.w,
      dx: CUTS.reduce((m, x) => m + (t > x - 0.18 && t < x + 0.32 ? (P(t, x - 0.18, x + 0.32) - 0.5) * -160 : 0), 0),
      op: t < 5 ? 0 : enter * (1 - leave),
      rx: c.w * (6 * (1 - enter) + 2),
      blur: whip * 10,
      extraScale: 1 - leave * 0.06,
    });
  }

  /* ---------- cursor ---------- */
  const toScreen = (x, y) => { const r = fA.getBoundingClientRect(); return [r.left + (x * r.width) / 1920, r.top + (y * r.height) / 1080]; };
  const centerOf = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return toScreen(r.left + r.width / 2, r.top + r.height / 2); };
  const sizeBtn = () => pre.querySelectorAll('.sizebar button')[1];
  // [window, move start, click time, target]
  const CLICKS = [
    [0, A0, A0 + 0.65, () => centerOf($('.feat.f-image', A))],
    [0, 9.3, 9.95, () => centerOf(sizeBtn())],
    [0, 11.45, A_SEND, () => centerOf(send)],
    [1, B_SEND - 0.6, B_SEND, () => centerOf(send)],
    [2, C_SEND - 0.6, C_SEND, () => centerOf(send)],
    [3, D_SEND - 0.6, D_SEND, () => centerOf(send)],
    [4, V0 + 0.35, V_REC, () => centerOf(mic)],
    [5, M0 + 0.05, M_OPEN, () => centerOf(modelBtn)],
    [5, 40.7, M_PICK, () => centerOf(opusItem)],
  ];
  const WIN = [[A0 - 0.2, A_SEND + 0.5], [B_SEND - 0.9, B_SEND + 0.5], [C_SEND - 0.9, C_SEND + 0.5], [D_SEND - 0.9, D_SEND + 0.5], [V0 + 0.2, V_REC + 0.5], [M0, M_PICK + 0.6]];
  function cursor(t) {
    const cur = $('#cur'), ring = $('#ring');
    const w = WIN.findIndex(([a, b]) => t >= a && t < b);
    if (w < 0) { cur.style.opacity = '0'; ring.style.opacity = '0'; return; }
    const list = CLICKS.filter((c) => c[0] === w);
    const first = list[0][3]() ?? [1300, 800];
    let prev = [first[0] + 240, first[1] + 170], pos = prev, clickK = -1;
    for (const [, ms, ct, get] of list) {
      const target = get() ?? prev;
      if (t < ms) { pos = prev; break; }
      const k = E.io(P(t, ms, ct - 0.08));
      pos = [lerp(prev[0], target[0], k), lerp(prev[1], target[1], k)];
      if (t >= ct - 0.05 && t < ct + 0.45) clickK = P(t, ct - 0.05, ct + 0.45);
      prev = target;
    }
    const fade = P(t, WIN[w][0], WIN[w][0] + 0.2) * (1 - P(t, WIN[w][1] - 0.2, WIN[w][1]));
    cur.style.opacity = String(fade);
    cur.style.transform = `translate(${pos[0] - 4}px, ${pos[1] - 2}px) scale(${clickK > 0 && clickK < 0.25 ? 0.86 : 1})`;
    ring.style.opacity = clickK >= 0 ? String(1 - clickK) : '0';
    ring.style.transform = `translate(${pos[0] - 30}px, ${pos[1] - 30}px) scale(${0.4 + clickK * 1.1})`;
  }
  // The chart screenshot flies into the composer (paste).
  function pasteChip(t) {
    const el = $('#pchip');
    const a = C0 + 0.1, b = C0 + 0.75;
    if (t < a - 0.1 || t > b + 0.2) { el.style.opacity = '0'; return; }
    const r = composer.getBoundingClientRect();
    const [ix, iy] = toScreen(r.left + 44, r.top + 44);
    const m = E.io(P(t, a, b));
    const sc = lerp(1.6, 0.42, m);
    el.style.opacity = String(P(t, a - 0.1, a + 0.1) * (1 - P(t, b, b + 0.15)));
    el.style.transform = `translate(${lerp(1500, ix - 75, m)}px, ${lerp(760, iy - 75, m)}px) scale(${sc}) rotate(${(1 - m) * -6}deg)`;
  }

  /* ---------- overlay text ---------- */
  const CAPS = [
    { a: 8.95, b: 16.0, n: '01', t: 'Create images', s: 'Memes, banners, logos. Ask for a Noxsea banner and it knows our look.' },
    { a: B0 + 0.3, b: C0 - 0.3, n: '02', t: 'Deep Research', s: 'Several web searches, one report with sources. Your IP stays hidden.' },
    { a: C0 + 0.3, b: D0 - 0.3, n: '03', t: 'Reads your screenshots', s: 'Charts, tweets, documents. Images are never stored.' },
    { a: D0 + 0.3, b: V0 - 0.3, n: '04', t: 'Audits smart contracts', s: 'Reads the verified source, function by function.' },
    { a: V0 + 0.3, b: M0 - 0.1, n: '05', t: 'Talk to it', s: 'Speech is transcribed on your device. Audio never leaves it.' },
    { a: M0 + 0.2, b: END, n: '06', t: 'Claude Opus 5.5', s: 'Premium model, right next to the best open ones.' },
  ];
  function rise(el, t, a, b, dy = 30) {
    const i = E.expo(P(t, a, a + 0.9)), o = E.io(P(t, b - 0.5, b));
    el.style.opacity = String(i * (1 - o));
    el.style.transform = `translateY(${(1 - i) * dy - o * dy * 0.4}px)`;
    el.style.filter = (1 - i) * 10 + o * 10 > 0.05 ? `blur(${(1 - i) * 10 + o * 10}px)` : 'none';
  }
  function hook(el, t, a, b) {
    const i = E.expo(P(t, a, a + 0.8)), o = E.io(P(t, b - 0.45, b));
    el.style.opacity = String(i * (1 - o));
    el.style.transform = `scale(${1.08 - 0.08 * i + o * 0.04}) translateY(${(1 - i) * 26}px)`;
    el.style.letterSpacing = `${-0.055 + (1 - i) * 0.04}em`;
    el.style.filter = (1 - i) * 14 + o * 16 > 0.05 ? `blur(${(1 - i) * 14 + o * 16}px)` : 'none';
  }
  function overlay(t) {
    hook($('#h1'), t, 0.35, 2.6);
    hook($('#h2'), t, 2.7, 4.95);
    rise($('#wcap'), t, 5.4, 7.6, 20);
    const cap = $('#cap');
    const c = CAPS.find((x) => t >= x.a - 0.1 && t <= x.b + 0.1);
    if (c) {
      $('.n', cap).textContent = c.n;
      $('.t', cap).textContent = c.t;
      $('.s', cap).textContent = c.s;
      rise(cap, t, c.a, c.b, 24);
    } else cap.style.opacity = '0';
    const fl = Math.max(0.75 * Math.sin(Math.PI * P(t, A_IMG - 0.1, A_IMG + 0.5)), ...CUTS.map((x) => 0.6 * Math.sin(Math.PI * P(t, x - 0.15, x + 0.35))));
    $('#flash').style.opacity = String(fl);
    rise($('#endc'), t, END + 0.4, 99, 30);
    document.querySelectorAll('#endc .feats span').forEach((el, i) => {
      const q = E.back(P(t, END + 1.0 + i * 0.1, END + 1.45 + i * 0.1));
      el.style.opacity = String(P(t, END + 1.0 + i * 0.1, END + 1.15 + i * 0.1));
      el.style.transform = `scale(${0.6 + 0.4 * q}) translateY(${(1 - q) * 10}px)`;
    });
    $('#endc .lg').style.transform = `scale(${0.6 + 0.4 * E.expo(P(t, END + 0.3, END + 1.4))})`;
    $('#fade').style.opacity = String(Math.max(1 - P(t, 0, 0.45), P(t, 47.1, 48)));
    bg.querySelector('.a1').style.transform = `translate(${Math.sin(t * 0.22) * 120}px, ${Math.cos(t * 0.18) * 70}px)`;
    bg.querySelector('.a2').style.transform = `translate(${Math.cos(t * 0.2) * 140}px, ${Math.sin(t * 0.25) * 80}px)`;
    bg.querySelector('.a3').style.transform = `translate(${Math.sin(t * 0.3 + 1) * 160}px, ${Math.cos(t * 0.26) * 60}px)`;
    bg.querySelector('.grid').style.transform = `translateY(${(t * 14) % 80}px)`;
  }

  window.render = (t) => {
    app(t);
    cameras(t);
    cursor(t);
    pasteChip(t);
    overlay(t);
    for (const d of [document, A]) d.getAnimations().forEach((an) => { try { an.pause(); an.currentTime = (t * 1000) % 100000; } catch {} });
  };
  window.render(0);
})();
