/* Noxsea launch ad v2 (premium): cinematic logo intro, film finish, light-sweep dissolves, editorial captions.
   Noxsea launch ad: "Noxsea is live" + a tour of the product, on the real UI (landing, sign-in, chat, compare,
   Token Scanner, AI tools, models). The token, contract and AI outputs are illustrative (the end card says so). */
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
  window.DURATION = 60;

  const $ = (s, r = document) => r.querySelector(s);
  const L = $('#fL').contentDocument, G = $('#fG').contentDocument, S = $('#fS').contentDocument, A = $('#fA').contentDocument;
  const CAM = { L: $('#camL'), G: $('#camG'), S: $('#camS'), A: $('#camA') };
  const FR = { L: $('#fL'), G: $('#fG'), S: $('#fS'), A: $('#fA') };
  const bg = $('#adbg');
  bg.insertAdjacentHTML('beforeend', '<div class="grid"></div><canvas id="parts" width="1920" height="1080"></canvas>');
  for (const id of ['camL', 'camG', 'camS', 'camA']) document.getElementById(id).insertAdjacentHTML('beforeend', '<div class="sheen"></div>');

  /* ================= timing ================= */
  const T = {
    L0: 5.0, G0: 11.4, CONNECT: 12.55, SIGN: 13.8, X: 14.25, CH0: 16.6, CH_SEND: 18.1, BURN: 22.25,
    CMP0: 23.6, CMP_CLICK: 24.2, CMP_SEND: 25.5, S0: 29.8, SCAN: 31.45, IMG0: 36.8, RES0: 40.6, VIS0: 44.6,
    AUD0: 48.0, MOD0: 51.4, M_OPEN: 51.95, M_PICK: 53.35, END: 54.8,
  };
  const CAM_CUTS = [T.G0, T.S0, T.IMG0]; // camera switches (whip between iframes)
  const RESETS = [T.CH0, T.CMP0, T.RES0, T.VIS0, T.AUD0, T.MOD0]; // same-camera scene changes

  /* ================= artwork (illustrative) ================= */
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
  const chartSvg = (() => {
    seed = 21;
    let p = 120, out = '', vol = '';
    const N = 30;
    for (let i = 0; i < N; i++) {
      const drift = i < 20 ? 2.4 : i < 26 ? 0.9 : -0.3;
      const o = p, c = p + drift + (rnd() - 0.45) * 6;
      const hi = Math.max(o, c) + rnd() * 4, lo = Math.min(o, c) - rnd() * 4;
      const x = 30 + i * 18, Y = (v) => 330 - (v - 100) * 2.6;
      const col = c >= o ? '#3DDC97' : '#FF6B7A';
      out += `<line x1="${x}" x2="${x}" y1="${Y(hi)}" y2="${Y(lo)}" stroke="${col}" stroke-width="2"/><rect x="${x - 5}" y="${Math.min(Y(o), Y(c))}" width="10" height="${Math.max(2, Math.abs(Y(o) - Y(c)))}" fill="${col}" rx="1"/>`;
      const v = i < 20 ? 40 + rnd() * 40 : 55 - (i - 20) * 3.5 + rnd() * 10;
      vol += `<rect x="${x - 5}" y="${470 - v}" width="10" height="${v}" fill="${col}" opacity=".45"/>`;
      p = c;
    }
    const rsi = Array.from({ length: N }, (_, i) => `${30 + i * 18},${i < 22 ? 560 - i * 2.4 : 507 + (i - 22) * 6}`).join(' ');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><rect width="600" height="600" fill="#0B0F1E"/>${[80, 160, 240, 320, 400].map((y) => `<line x1="0" x2="600" y1="${y}" y2="${y}" stroke="#1C2340"/>`).join('')}${out}${vol}<line x1="0" x2="600" y1="490" y2="490" stroke="#1C2340"/><line x1="0" x2="600" y1="512" y2="512" stroke="#FF6B7A" stroke-dasharray="4 4" opacity=".5"/><polyline points="${rsi}" fill="none" stroke="#B3A8FF" stroke-width="2.5"/></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  })();
  // Demo token (fictional), as in the scanner ad.
  const MHI_LOGO = `<svg class="tlogo" viewBox="0 0 64 64"><defs><linearGradient id="lgM" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF9BD2"/><stop offset="1" stop-color="#FF5A5F"/></linearGradient></defs><circle cx="32" cy="32" r="32" fill="url(#lgM)"/><path d="M38 14a19 19 0 1 0 12 30A15 15 0 0 1 38 14z" fill="#fff"/><path d="M41 24l3-6 2 7z" fill="#fff"/><circle cx="40" cy="31" r="2" fill="#FF5A5F"/></svg>`;
  const TOKEN = { sym: 'MHI', name: 'Moon Hood Inu', ca: '0x9F3c6B2e8A1d4C7f5E0b9A2c3D4e5F6a7B8c41aB', v: 'high', verdict: '3 red flags',
    stats: [['Holders', '212'], ['Top 10 hold', '64.2%'], ['Supply', '1T'], ['Price', '$0.0000003'], ['Source', 'Not verified'], ['Owner', '0x9f3c…41aB']],
    flags: [
      ['high', 'High risk', 'Source code is not verified on the explorer, so nobody can check what the contract does.'],
      ['high', 'High risk', 'Has a mint function: new tokens can be created, diluting holders.'],
      ['high', 'High risk', 'One wallet holds 31.2% of supply.'],
      ['medium', 'Caution', 'The top 10 holders own 64.2% of supply.'],
      ['info', 'Note', 'Has an active owner (0x9f3c…41aB) who can call owner-only functions.'],
    ] };
  const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  const tcard = (k) => `<div class="tcard v-${k.v}"><div class="tcard-hd"><div><div class="tcard-k">Token Safety Check · Robinhood Chain</div><div class="tcard-t">${k.name} (${k.sym})</div><div class="tcard-a"><span class="mono">${short(k.ca)}</span><button class="mact">Copy</button><a class="mact">Explorer ↗</a></div></div><span class="tbadge b-${k.v}">${k.verdict}</span></div><div class="tstats">${k.stats.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('')}</div><ul class="tflags">${k.flags.map(([l, n, x]) => `<li class="f-${l}"><i aria-hidden="true"></i><span><em>${n}</em> ${x}</span></li>`).join('')}</ul><div class="tcard-ft">Automatic checks of public data on Robinhood Chain. They can miss honeypots, liquidity pulls and other tricks. Not financial advice.</div></div>`;
  const ACTIONS = '<div class="scan-actions"><a class="btn btn-dark">Ask Noxsea AI about this token</a><button class="btn btn-light">Copy link to this scan</button></div>';

  /* ================= copy ================= */
  const Q1 = 'How do I keep my seed phrase safe?';
  const ANS1 = [
    { t: 'p', b: 'Keep it offline, and never type it into a website or an app.', x: '' },
    { t: 'ol', b: 'Write it on paper or steel', x: 'and store two copies in separate places.' },
    { t: 'ol', b: 'Never share it.', x: 'No real support team will ever ask for it.' },
    { t: 'ol', b: 'Use a hardware wallet', x: 'for anything you can’t afford to lose.' },
  ];
  const Q2 = 'Explain proof of stake in two sentences';
  const CMP_L = [{ t: 'p', x: 'Validators lock up coins as collateral and take turns proposing and checking blocks. If they cheat, part of their stake is slashed, so honesty pays better than attacks.' }];
  const CMP_R = [{ t: 'p', x: 'Instead of burning energy like mining, proof of stake picks block producers by the coins they lock up. Misbehave and you lose part of that stake.' }];
  const QA = 'A banner for Noxsea: the deep sea at night, a glowing sealed drop';
  const QB = 'What should I check before bridging to a new L2?';
  const QUERIES = ['L2 bridge security risks', 'verify official L2 bridge', 'L2BEAT rollup stages', 'bridge exploit causes'];
  const ANS_B = [
    { t: 'p', b: 'Short answer:', x: 'use the official bridge, check who can upgrade it, and send a small test first.' },
    { t: 'ol', b: 'Get the bridge link from the chain’s own docs', x: '[1].' },
    { t: 'ol', b: 'Check its risk stage on L2BEAT', x: '[2].' },
    { t: 'p', x: 'Sources: [1] ethereum.org [2] l2beat.com [3] rekt.news + 9 more' },
  ];
  const QC = 'What does this chart say?';
  const ANS_C = [
    { t: 'p', b: 'An uptrend that is losing steam.', x: 'Higher lows all the way, but the last push came on falling volume and RSI is rolling over from 70.' },
    { t: 'p', b: 'Watch the last higher low.', x: 'Not financial advice.' },
  ];
  const QD = 'Audit this contract on Base: 0x4f2A9c7E81b3D05a6F1e2C3b4A5d6E7f8A91c19E';
  const ANS_D = [
    { t: 'p', b: 'No critical issues found.', x: 'Two things to know before you deposit:' },
    { t: 'ol', b: 'The owner can pause withdrawals', x: '(pause(), line 212).' },
    { t: 'ol', b: 'The fee can be raised to 10%', x: '(setFee(), line 340), with no timelock.' },
  ];

  /* ================= overlay ================= */
  const ov = document.createElement('div');
  ov.id = 'ov';
  const BIG = (id) => `<svg class="big" viewBox="0 0 64 64"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#C9BFFF"/><stop offset=".5" stop-color="#6B78FF"/><stop offset="1" stop-color="#4FD6EC"/></linearGradient></defs><path class="dropS" d="${DROP}" fill="none" stroke="url(#${id})" stroke-width="1.2" stroke-linejoin="round"/><path class="dropF" d="${DROP}" fill="url(#${id})" opacity="0"/><path class="keyF" d="${KEY}" fill="#070A22" opacity="0"/><path class="hl" d="M24 20c-3 4.6-5.2 9.2-5.6 13" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.4" stroke-linecap="round" opacity="0"/></svg>`;
  ov.innerHTML = `
    <div id="leak"><i class="l1"></i><i class="l2"></i></div>
    <div id="intro">
      <div class="lgw"><div class="rings"><i></i><i></i><i></i></div>${BIG('gI')}</div>
      <div class="word">${[...'Noxsea'].map((c) => `<span>${c}</span>`).join('')}</div>
      <div class="live"><i></i>Now live</div>
      <div class="tagline">The AI that forgets you, on purpose.</div>
    </div>
    <div id="dip"></div>
    <div id="capbg"></div>
    <div id="cap2"><div class="n"><span></span><i></i></div><div class="t"></div><div class="s"></div></div>
    <div id="wallet">
      <div class="wh"><i></i>Wallet</div>
      <h4>Signature request</h4>
      <span class="site"><svg viewBox="0 0 64 64"><use href="#mk"/></svg>noxsea.xyz</span>
      <div class="msg">noxsea.xyz wants you to sign in with your Ethereum account.<br><br>Sign in to Noxsea.</div>
      <div class="gas"><i></i>No transaction · No gas fee</div>
      <div class="btns"><b class="c">Cancel</b><b class="s" id="wsign">Sign</b></div>
    </div>
    <div id="counter">+25 free credits</div>
    <div id="pchip">${MHI_LOGO}<b>${TOKEN.name}</b><span>${short(TOKEN.ca)}</span></div>
    <div id="flash"></div>
    <svg id="cur" viewBox="0 0 24 24"><path d="M5 3l14 7.5-6.2 1.7L10 18.5z" fill="#fff" stroke="#0A0E30" stroke-width="1.4"/></svg>
    <div id="ring"></div>
    <div id="endc">
      <div class="lgw"><div class="rings"><i></i><i></i><i></i></div>${BIG('gE')}</div>
      <div class="live"><i></i>Now live</div>
      <h2>The AI that<br><span class="grad">forgets you.</span></h2>
      <div class="feats">${['Private chat', 'Compare models', 'Token Scanner', 'Create images', 'Deep Research', 'Contract audits', 'Voice'].map((f) => `<span><i></i>${f}</span>`).join('')}<span class="prem"><i></i>Claude Opus 5.5</span></div>
      <div class="adcta">noxsea.xyz<span class="sh"></span></div>
      <div class="fine">25 free credits · No email, no KYC · Zero prompt logs<br>Illustrative outputs · Demo token and contract</div>
    </div>
    <div id="vig"></div>
    <div id="sweep"></div>
    <canvas id="grain" width="960" height="540"></canvas>
    <div id="fade"></div>`;
  document.body.appendChild(ov);

  /* ================= landing ================= */
  L.querySelectorAll('.up,.rv').forEach((e) => e.classList.add('in'));
  const lDoc = L.scrollingElement;
  const lHdr = $('#hdr', L);
  const secTop = (id) => { const el = L.getElementById(id); return el ? el.getBoundingClientRect().top + lDoc.scrollTop - 70 : 0; };
  const Y_TOOLS = secTop('tools'), Y_MODELS = secTop('models');
  function landing(t) {
    const y = lerp(0, Y_TOOLS, E.io(P(t, 7.5, 8.4))) + (Y_MODELS - Y_TOOLS) * E.io(P(t, 9.3, 10.2));
    lDoc.scrollTop = y;
    lHdr.classList.toggle('scrolled', y > 8);
  }

  /* ================= gate ================= */
  const gateBtn = [...G.querySelectorAll('button, a')].filter((b) => b.textContent.trim() === 'Connect wallet').sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0];
  function gate(t) {
    const press = P(t, T.CONNECT - 0.05, T.CONNECT + 0.05) * (1 - P(t, T.CONNECT + 0.1, T.CONNECT + 0.3));
    gateBtn.style.transform = `scale(${1 - 0.05 * press})`;
    const glow = Math.sin(Math.PI * P(t, 11.9, 12.7));
    gateBtn.style.boxShadow = glow > 0.01 ? `0 0 0 ${4 * glow}px rgba(139,124,255,.35), 0 18px 50px -12px rgba(91,108,255,${0.9 * glow})` : '';
  }

  /* ================= scanner ================= */
  const sDoc = S.scrollingElement;
  const sHdr = $('#hdr', S);
  const sInput = $('.scan-form input', S);
  const sBtn = $('.scan-form button[type=submit]', S);
  const sWrap = $('.scan-result .wrap', S);
  const rcS = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 + sDoc.scrollTop, top: r.top + sDoc.scrollTop, bottom: r.bottom + sDoc.scrollTop }; };
  sWrap.innerHTML = tcard(TOKEN) + ACTIONS;
  const PS = { form: rcS($('.scan-form', S)), card: rcS($('.tcard', S)) };
  sWrap.innerHTML = '';
  const SCR = Math.round(PS.form.top - 120);
  let lastS = null;
  function scanner(t) {
    sDoc.scrollTop = SCR;
    sHdr.classList.toggle('scrolled', true);
    const filled = t >= T.SCAN - 0.4;
    sInput.value = filled ? TOKEN.ca : '';
    const g = P(t, T.SCAN - 0.4, T.SCAN - 0.3) * (1 - P(t, T.SCAN, T.SCAN + 0.5));
    $('.scan-form', S).style.boxShadow = g ? `0 0 0 ${3 * g}px rgba(139,124,255,.55), 0 0 60px rgba(139,124,255,${0.45 * g})` : '';
    const loading = t >= T.SCAN && t < T.SCAN + 0.6;
    sBtn.textContent = loading ? 'Scanning…' : 'Scan';
    const state = loading ? 'load' : t >= T.SCAN + 0.6 ? 'card' : 'idle';
    if (state !== lastS) {
      sWrap.innerHTML = loading ? '<div class="scan-loading glass"><span class="shim">Reading the token on Robinhood Chain…</span></div>' : state === 'card' ? tcard(TOKEN) + ACTIONS : '';
      lastS = state;
    }
    if (state === 'card') {
      const t0 = T.SCAN + 0.6;
      const c = $('.tcard', S);
      const k = E.expo(P(t, t0, t0 + 0.55));
      c.style.opacity = String(k);
      c.style.transform = `translateY(${(1 - k) * 34}px) scale(${0.97 + 0.03 * k})`;
      c.style.boxShadow = `0 0 ${80 * P(t, t0, t0 + 0.6)}px -10px rgba(255,107,122,.5)`;
      S.querySelectorAll('.tstats > div').forEach((d, i) => { const q = E.out(P(t, t0 + 0.1 + i * 0.05, t0 + 0.45 + i * 0.05)); d.style.opacity = String(q); d.style.transform = `translateY(${(1 - q) * 10}px)`; });
      const badge = $('.tbadge', S);
      const bq = E.back(P(t, t0 + 0.4, t0 + 0.8));
      badge.style.transform = `scale(${0.4 + 0.6 * bq})`;
      badge.style.opacity = String(P(t, t0 + 0.4, t0 + 0.5));
      S.querySelectorAll('.tflags li').forEach((li, i) => {
        const q = E.out(P(t, t0 + 0.35 + i * 0.1, t0 + 0.75 + i * 0.1));
        li.style.opacity = String(q);
        li.style.transform = `translateX(${(1 - q) * -16}px)`;
        const hl = i < 3 ? P(t, 33.7 + i * 0.25, 34.0 + i * 0.25) : 0;
        li.style.background = hl ? `rgba(255,107,122,${0.13 * hl})` : '';
        li.style.boxShadow = hl ? `0 0 0 1px rgba(255,107,122,${0.35 * hl})` : '';
        li.style.borderRadius = '10px';
        li.style.margin = '0 -10px';
        li.style.padding = '5px 10px';
      });
      $('.tcard-ft', S).style.opacity = String(P(t, t0 + 0.9, t0 + 1.2));
      const act = $('.scan-actions', S);
      if (act) act.style.opacity = String(E.out(P(t, t0 + 1.0, t0 + 1.5)));
    }
  }

  /* ================= app ================= */
  const thread = $('.thread', A), threadIn = $('.thread-in', A), ta = $('.composer textarea', A), composer = $('.composer', A), send = $('.send', A);
  const toolsChip = $('[aria-label="Tools"]', A), cmpChip = $('[aria-label="Compare two models"]', A);
  const balEls = [$('.bal span', A), $('.wallet-card b', A)];
  const burnSel = $('.burnpill select', A), burnPill = $('.burnpill', A);
  const menu = $('.menu.modelmenu', A);
  const menuItems = [...menu.querySelectorAll('button')];
  const itemOf = (s) => menuItems.find((b) => b.textContent.includes(s));
  const opusItem = itemOf('Opus');
  const modelBtn = $('.model-btn', A);
  const nameEl = [...modelBtn.children].find((c) => c.tagName === 'SPAN' && !c.classList.contains('mlogo'));
  nameEl.style.whiteSpace = 'nowrap';
  const modelLogo0 = modelBtn.firstElementChild.outerHTML, modelName0 = nameEl.innerHTML;
  const opusLogo = modelBtn.firstElementChild.cloneNode(true);
  opusLogo.innerHTML = opusItem.firstElementChild.innerHTML;
  opusLogo.style.background = opusItem.firstElementChild.style.background;
  const logo18 = (s) => itemOf(s).firstElementChild.outerHTML.replace(/width: \d+px; height: \d+px; border-radius: \d+px/, 'width: 18px; height: 18px; border-radius: 6px');
  const addr = ($('.addr .ad', A)?.textContent || '').trim();
  const SUGGEST = threadIn.innerHTML;
  const pre = A.createElement('div');
  composer.insertBefore(pre, ta);
  const PH = ta.placeholder;

  const IC = '<div class="ic"><svg aria-hidden="true"><use href="#mk"></use></svg></div>';
  const you = (t, img) => `<div class="m you" style="white-space:pre-wrap">${img ? `<span class="imgrow"><img src="${img}" alt=""></span>` : ''}${esc(t)}</div>`;
  const meta = (model, cr) => `<div class="meta"><span>${model}</span><span>${cr} credits</span><span class="ok"><svg aria-hidden="true"><use href="#shield"></use></svg>Not logged</span><button class="mact">Copy</button><button class="mact">Regenerate</button><button class="mact">Listen</button></div>`;
  const SHIELD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z"></path><path d="M9 12l2 2 4-4"></path></svg>';
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
  const stream = (blocks, t, t0, wps = 24, style = '') => {
    if (t < t0) return { html: '', done: false };
    const r = md(blocks, (t - t0) * wps);
    return { html: `<div${style ? ` style="${style}"` : ''}>${r.html}${r.done ? '' : '<span class="caret"></span>'}</div>`, done: r.done };
  };
  const typed = (s, t, a, b) => s.slice(0, Math.round(s.length * P(t, a, b)));
  const sizebar = `<div class="sizebar" role="radiogroup" aria-label="Image shape">${[['square', 'Square'], ['landscape', 'Landscape'], ['portrait', 'Portrait']].map(([k, l]) => `<button type="button" role="radio" aria-checked="${k === 'landscape'}" class="${k === 'landscape' ? 'on' : ''}"><i class="shape s-${k}" aria-hidden="true"></i>${l}</button>`).join('')}<span class="sizenote">3 credits per image · never stored</span></div>`;

  let lastThread = null, lastPre = null;
  const setThread = (html) => { if (html !== lastThread) { threadIn.innerHTML = html; lastThread = html; } thread.scrollTop = thread.scrollHeight; };
  const setPre = (html) => { if (html !== lastPre) { pre.innerHTML = html; lastPre = html; } };
  function setTa(text, ph = PH) {
    if (ta.value !== text) ta.value = text;
    ta.placeholder = ph;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }
  const setBal = (v) => { const s = typeof v === 'number' ? v.toFixed(2) : v; balEls[0].textContent = s; balEls[1].firstChild.textContent = s + ' '; };

  function app(t) {
    let html = SUGGEST, text = '', ph = PH, preH = '', tool = 'Tools', pressed = false, cmp = false, bal = 25, model = 'base', burn = 'off';
    if (t < T.CH0) {
      bal = 25 * E.io(P(t, T.X + 0.45, T.X + 1.45));
      html = `<div class="m note"><svg aria-hidden="true"><use href="#shield"></use></svg>Signed in as ${addr} · 25 free credits added</div>` + SUGGEST;
    } else if (t < T.CMP0) {
      text = typed(Q1, t, T.CH0 + 0.25, T.CH_SEND - 0.35);
      if (t >= T.CH_SEND) {
        text = '';
        const r = stream(ANS1, t, T.CH_SEND + 0.55, 22);
        const wait = t < T.CH_SEND + 0.55 ? '<span class="shim" style="font-size:14px">Answering privately…</span>' : '';
        html = you(Q1) + `<div class="m ai">${IC}<div class="b">${wait}${r.html}${r.done ? meta('DeepSeek V4 Pro', '0.06') : ''}</div></div>`;
        if (r.done) bal = 24.94;
      }
      if (t >= T.BURN) burn = '1h';
    } else if (t < T.S0) {
      bal = 24.94; burn = '1h';
      cmp = t >= T.CMP_CLICK;
      text = typed(Q2, t, T.CMP_CLICK + 0.2, T.CMP_SEND - 0.4);
      if (t >= T.CMP_SEND) {
        text = '';
        const l = stream(CMP_L, t, T.CMP_SEND + 0.5, 21, 'font-size:14px');
        const r = stream(CMP_R, t, T.CMP_SEND + 0.8, 17, 'font-size:14px');
        const col = (name, s, cr) => `<div><h5><span class="mname">${logo18(name)}${name}</span><small>${s.done ? cr + ' cr' : ''}</small></h5>${s.html || '<span class="shim" style="font-size:14px">Answering privately…</span>'}</div>`;
        html = you(Q2) + `<div class="m ai">${IC}<div><div class="cmp">${col('DeepSeek V4 Pro', l, '0.03')}${col('Kimi K3', r, '0.08')}</div></div></div>`;
        if (l.done && r.done) bal = 24.83;
      }
    } else if (t >= T.IMG0 && t < T.RES0) {
      bal = 24.83; tool = 'Image'; pressed = true; ph = 'Describe the image you want…'; preH = sizebar;
      const img = t >= T.IMG0 + 0.5 ? `${ART}${t >= T.IMG0 + 1.6 ? `<div class="meta"><span>Image</span><span>3.00 credits</span><span class="ok"><svg aria-hidden="true"><use href="#shield"></use></svg>Not logged</span><a class="mact">Download</a></div>` : ''}` : '<div class="genimg wait s-landscape"><span class="shim">Generating your image privately…</span></div>';
      html = you(QA) + `<div class="m ai">${IC}<div class="b">${img}</div></div>`;
      if (t >= T.IMG0 + 1.6) bal = 21.83;
    } else if (t >= T.RES0 && t < T.VIS0) {
      bal = 21.83; tool = 'Research'; pressed = true;
      const t0 = T.RES0 + 0.2;
      const st = t < t0 + 0.4 ? 0 : t < t0 + 1.3 ? 1 : t < t0 + 1.6 ? 2 : t < T.VIS0 - 0.6 ? 3 : 4;
      const qn = Math.min(4, Math.floor(P(t, t0 + 0.45, t0 + 1.2) * 4.99));
      const steps = [
        ['Planning the research', null],
        [st >= 1 ? 'Searching the web · 4 searches' : 'Searching the web', st >= 1 ? QUERIES.slice(0, st > 1 ? 4 : qn) : null],
        [st >= 2 ? 'Reading 12 sources · your IP stayed hidden' : 'Reading sources', null],
        ['Writing the report', null],
      ];
      const rs = `<div class="rsteps">${steps.map(([l, d], i) => `<div class="rstep${i < st ? ' ok' : i === st ? ' on' : ''}"><i>${i < st ? '✓' : ''}</i><div><span class="${i === st ? 'shim' : ''}">${l}</span>${d && d.length ? `<ul>${d.map((q) => `<li>${q}</li>`).join('')}</ul>` : ''}</div></div>`).join('')}</div>`;
      const r = stream(ANS_B, t, t0 + 1.7, 30);
      html = you(QB) + `<div class="m ai">${IC}<div class="b">${rs}${r.html}${r.done ? meta('DeepSeek V4 Pro', '4.31') : ''}</div></div>`;
      if (r.done) bal = 17.52;
    } else if (t >= T.VIS0 && t < T.AUD0) {
      bal = 17.52;
      const r = stream(ANS_C, t, T.VIS0 + 0.5, 26);
      const wait = t < T.VIS0 + 0.5 ? '<span class="shim" style="font-size:14px">Reading your image privately…</span>' : '';
      html = you(QC, chartSvg) + `<div class="m ai">${IC}<div class="b">${wait}${r.html}${r.done ? meta('Qwen3.5 397B Vision', '0.05') : ''}</div></div>`;
      if (r.done) bal = 17.47;
    } else if (t >= T.AUD0 && t < T.MOD0) {
      bal = 17.47;
      const card = `<div class="auditcard" id="aud"><div class="ah"><span class="ak">Contract audit · Base</span><a class="mact">Explorer ↗</a></div><b>TideVault</b><div class="am"><span>Verified on Sourcify</span><span>1,284 lines · 6 files</span></div><p>Automated review of the public source code. Not a professional audit, not financial advice.</p></div>`;
      const pre1 = t < T.AUD0 + 0.25 ? '<span class="shim" style="font-size:14px">Answering privately…</span>' : t < T.AUD0 + 0.85 ? `<div class="toolrun">${SHIELD}<span class="shim">Reading the verified source code on Base…</span></div>` : card;
      const r = stream(ANS_D, t, T.AUD0 + 1.2, 26);
      html = you(QD) + `<div class="m ai">${IC}<div class="b">${pre1}${r.html}${r.done ? meta('DeepSeek V4 Pro', '0.92') : ''}</div></div>`;
      if (r.done) bal = 16.55;
    } else if (t >= T.MOD0) {
      bal = 16.55;
    }
    setThread(html);
    setPre(preH);
    setTa(text, ph);
    setBal(bal);
    toolsChip.querySelector('.cl').textContent = tool;
    toolsChip.setAttribute('aria-pressed', String(pressed));
    cmpChip.setAttribute('aria-pressed', String(cmp));
    send.disabled = !text;
    if (burnSel) burnSel.value = burn;
    const bp = Math.sin(Math.PI * P(t, T.BURN - 0.1, T.BURN + 0.8));
    if (burnPill) burnPill.style.boxShadow = bp > 0.01 ? `0 0 0 ${2 * bp}px rgba(255,140,90,.6), 0 0 40px rgba(255,120,80,${0.5 * bp})` : '';
    const cp = Math.sin(Math.PI * P(t, T.CMP_CLICK - 0.1, T.CMP_CLICK + 0.6));
    cmpChip.style.boxShadow = cp > 0.01 ? `0 0 0 ${2 * cp}px rgba(92,225,230,.5), 0 0 30px rgba(92,225,230,${0.4 * cp})` : '';

    const art = A.getElementById('art');
    if (art) {
      const k = E.out(P(t, T.IMG0 + 0.5, T.IMG0 + 1.7));
      art.style.filter = k < 1 ? `blur(${(1 - k) * 22}px) saturate(${0.4 + 0.6 * k}) brightness(${0.75 + 0.25 * k})` : 'none';
    }
    const aud = A.getElementById('aud');
    if (aud) { const k = E.expo(P(t, T.AUD0 + 0.85, T.AUD0 + 1.3)); aud.style.opacity = String(k); aud.style.transform = `translateY(${(1 - k) * 18}px)`; }
    A.querySelectorAll('.rstep li').forEach((li, i) => { const k = E.back(P(t, T.RES0 + 0.65 + i * 0.19, T.RES0 + 0.9 + i * 0.19)); li.style.transform = `scale(${0.6 + 0.4 * k})`; li.style.display = 'inline-block'; });

    // Model button and menu.
    let label = modelName0, logo = modelLogo0, mkey = 'base';
    if (cmp && t < T.S0) { label = `${modelName0} <span style="color:var(--mute);font-weight:400">vs</span> Kimi K3`; mkey = 'cmp'; }
    const picked = t >= T.M_PICK + 0.12;
    if (picked) { label = 'Claude Opus 5.5'; logo = opusLogo.outerHTML; mkey = 'opus'; }
    if (modelBtn.dataset.k !== mkey) { modelBtn.dataset.k = mkey; modelBtn.firstElementChild.outerHTML = logo; nameEl.innerHTML = label; }
    const open = t >= T.M_OPEN && t < T.M_PICK + 0.12;
    menu.classList.toggle('open', open);
    const hov = P(t, 52.85, 53.0);
    opusItem.style.background = open && hov ? `rgba(139,124,255,${0.16 * hov})` : '';
    menuItems.forEach((b) => b.setAttribute('aria-checked', String(b === opusItem ? picked : b === menuItems[0] && !picked)));
    const pf = P(t, T.CH0 + 0.1, T.CH0 + 0.3) * (1 - P(t, T.CH_SEND - 0.4, T.CH_SEND));
    composer.style.boxShadow = pf ? `0 0 0 ${2 * pf}px rgba(179,168,255,.6), 0 0 50px rgba(139,124,255,${0.4 * pf})` : '';
  }

  /* ================= cameras ================= */
  const rc = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, bottom: r.bottom }; };
  const PA = { composer: rc(composer), tin: rc(threadIn), model: rc(modelBtn), burn: burnPill ? rc(burnPill) : rc(modelBtn) };
  const PG = { btn: rc(gateBtn) };
  const shot = (x, y, s, sx = 1240, sy = 540, w = 0) => ({ cx: x - (sx - 960) / s, cy: y - (sy - 540) / s, s, w });
  const lastAi = () => { const m = [...A.querySelectorAll('.m.ai')].pop(); return m ? rc(m) : null; };
  const follow = (s, sy = 560) => () => {
    const m = lastAi();
    const y = m ? Math.max(PA.tin.top + (sy - 40) / s, m.bottom - 300 / s) : PA.tin.top + 400;
    return shot(PA.tin.x, y, s, 1240, sy);
  };
  const WIDE = () => ({ cx: 960, cy: 540, s: 0.74, w: 1 });
  const COMPOSER = () => shot(PA.composer.x, PA.composer.y, 1.65, 1240, 700);
  const LWIN = () => ({ cx: 960 - 150 / 0.84, cy: 540, s: 0.84, w: 1 });
  const SIGNIN = () => ({ cx: 960 - 140 / 0.8, cy: 540, s: 0.8, w: 1 });
  const MENU = () => shot(PA.model.x + 120, PA.model.top + 330, 1.45, 1330, 520);
  const SHOTS = {
    L: [[0, LWIN], [11.4, () => ({ ...LWIN(), s: 0.88, cx: 960 - 150 / 0.88 })]],
    G: [[0, () => ({ cx: PG.btn.x, cy: PG.btn.y - 80, s: 1.35, w: 0 })], [T.SIGN + 0.1, () => ({ cx: PG.btn.x, cy: PG.btn.y - 80, s: 1.35, w: 0 })], [T.X + 0.3, SIGNIN]],
    S: [[0, () => shot(PS.form.x, PS.form.top - SCR + 60, 1.4, 1240, 420)], [T.SCAN + 0.7, () => shot(PS.form.x, PS.form.top - SCR + 60, 1.4, 1240, 420)],
      [T.SCAN + 1.5, () => shot(PS.card.x, (PS.form.top - SCR + PS.card.bottom - SCR) / 2, 1.15, 1240, 560)]],
    A: [
      [0, SIGNIN], [T.CH0 - 0.05, SIGNIN], [T.CH0 + 0.35, COMPOSER], [T.CH_SEND + 0.1, COMPOSER], [T.CH_SEND + 0.8, follow(1.6)],
      [21.3, follow(1.6)], [21.9, () => shot(PA.burn.x, PA.burn.y + 230, 1.6, 1240, 460)], [T.CMP0 - 0.05, () => shot(PA.burn.x, PA.burn.y + 230, 1.6, 1240, 460)],
      [T.CMP0 + 0.35, COMPOSER], [T.CMP_SEND + 0.1, COMPOSER], [T.CMP_SEND + 0.8, follow(1.7)], [T.S0, follow(1.7)],
      [T.IMG0, follow(1.8, 600)], [T.RES0 - 0.05, follow(1.8, 600)], [T.RES0 + 0.3, follow(1.45)], [T.VIS0 - 0.05, follow(1.45)],
      [T.VIS0 + 0.3, follow(1.55)], [T.AUD0 - 0.05, follow(1.55)], [T.AUD0 + 0.3, follow(1.5)], [T.MOD0 - 0.05, follow(1.5)],
      [T.MOD0 + 0.4, MENU], [T.END - 0.3, MENU], [T.END + 0.5, WIDE],
    ],
  };
  function camAt(list, t) {
    let i = 0;
    while (i < list.length - 1 && list[i + 1][0] <= t) i++;
    const a = { w: 0, ...list[i][1]() };
    if (i === list.length - 1) return a;
    const b = { w: 0, ...list[i + 1][1]() };
    const x = E.io(P(t, list[i][0], list[i + 1][0]));
    return { cx: lerp(a.cx, b.cx, x), cy: lerp(a.cy, b.cy, x), s: lerp(a.s, b.s, x), w: lerp(a.w, b.w, x) };
  }
  const sm = {};
  function smooth(k, c, t) {
    const p = sm[k];
    sm[k] = !p || Math.abs(t - p.t) > 0.05 ? { ...c, t } : { cx: lerp(p.cx, c.cx, 0.18), cy: lerp(p.cy, c.cy, 0.18), s: lerp(p.s, c.s, 0.35), w: c.w, t };
    return sm[k];
  }
  function place(cam, c, { dx = 0, dy = 0, op = 1, rx = 0, ry = 0, blur = 0, extraScale = 1, t = 0 }) {
    let tx = c.s * (960 - c.cx), ty = c.s * (540 - c.cy);
    if (c.s >= 1) { tx = clamp(tx, 960 - 960 * c.s, 960 * c.s - 960); ty = clamp(ty, 540 - 540 * c.s, 540 * c.s - 540); }
    cam.style.opacity = String(op);
    cam.style.visibility = op > 0.001 ? 'visible' : 'hidden';
    // 2D only: a perspective tilt makes Chrome depth-sort the window plane against the overlay, so parts of it
    // draw over the captions on some frames. A tiny 2D rotation keeps the floating feel.
    cam.style.transform = `translate(${tx + dx}px, ${ty + dy}px) scale(${c.s * extraScale}) rotate(${ry * 0.12}deg)`;
    cam.style.borderRadius = `${c.w * 26}px`;
    cam.style.boxShadow = c.w > 0.01
      ? `0 ${70 * c.w}px ${180 * c.w}px -30px rgba(0,0,0,.95), 0 0 0 ${c.w}px rgba(190,200,255,.22), 0 0 ${120 * c.w}px -20px rgba(110,100,255,${0.35 * c.w})`
      : 'none';
    cam.style.filter = blur > 0.05 ? `blur(${blur}px)` : 'none';
    const sh = cam.querySelector('.sheen');
    const ph = ((t * 0.16) % 1) * 3200 - 700;
    sh.style.opacity = String(c.w);
    sh.style.transform = `translateX(${ph}px) rotate(18deg)`;
  }
  // Which iframe is on screen: [from, to] per camera; switches whip across.
  const ON = { L: [[T.L0, T.G0]], G: [[T.G0, T.X + 0.45]], S: [[T.S0, T.IMG0]], A: [[T.X, T.S0], [T.IMG0, 99]] };
  const dip = (t) => Math.max(...RESETS.map((x) => Math.sin(Math.PI * P(t, x - 0.3, x + 0.3))));
  function cameras(t) {
    const enter = E.expo(P(t, 4.7, 6.0));
    const leave = E.io(P(t, T.END + 0.2, T.END + 1.0));
    const push = 1 + 0.012 * Math.sin(t * 0.45);
    for (const k of ['L', 'G', 'S', 'A']) {
      const span = ON[k].find(([a, b]) => t >= a - 0.45 && t < b + 0.45);
      if (!span) { CAM[k].style.opacity = '0'; CAM[k].style.visibility = 'hidden'; continue; }
      const [a, b] = span;
      let op = 1, sc = push;
      // Camera switches: the outgoing page grows and dissolves, the incoming one settles in from slightly small.
      if (CAM_CUTS.includes(a)) { const w = E.io(P(t, a - 0.2, a + 0.4)); op *= w; sc *= 0.95 + 0.05 * w; }
      if (CAM_CUTS.includes(b)) { const w = E.io(P(t, b - 0.35, b + 0.25)); op *= 1 - w; sc *= 1 + 0.05 * w; }
      // Gate -> app is a crossfade: same layout, the app just signs in.
      if (k === 'G') op *= 1 - P(t, T.X, T.X + 0.45);
      if (k === 'A' && a === T.X) op *= P(t, T.X, T.X + 0.45);
      if (k === 'L') { op *= enter; sc *= 0.92 + 0.08 * enter; }
      if (k === 'A' && a === T.IMG0) { op *= 1 - leave; sc *= 1 - 0.05 * leave; }
      const c = smooth(k, camAt(SHOTS[k], t), t);
      place(CAM[k], c, {
        op,
        dy: (k === 'L' ? (1 - enter) * 60 : 0) + Math.sin(t * 0.5) * 5 * c.w,
        rx: c.w * (k === 'L' ? 5 * (1 - enter) + 3 : 2.5),
        ry: c.w * Math.sin(t * 0.33 + (k === 'L' ? 0 : 1.3)) * 3.5,
        extraScale: sc,
        t,
      });
    }
  }

  /* ================= cursor ================= */
  const toScreen = (fr, x, y) => { const r = fr.getBoundingClientRect(); return [r.left + (x * r.width) / 1920, r.top + (y * r.height) / 1080]; };
  const centerIn = (k, el) => { if (!el) return null; const r = el.getBoundingClientRect(); return toScreen(FR[k], r.left + r.width / 2, r.top + r.height / 2); };
  const centerOv = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const CLICKS = [
    [0, 12.0, T.CONNECT, () => centerIn('G', gateBtn)],
    [0, 13.25, T.SIGN, () => centerOv($('#wsign'))],
    [1, 17.6, T.CH_SEND, () => centerIn('A', send)],
    [2, 21.7, T.BURN, () => centerIn('A', burnSel || burnPill)],
    [3, 23.85, T.CMP_CLICK, () => centerIn('A', cmpChip)],
    [3, 25.0, T.CMP_SEND, () => centerIn('A', send)],
    [4, 31.0, T.SCAN, () => centerIn('S', sBtn)],
    [5, 51.55, T.M_OPEN, () => centerIn('A', modelBtn)],
    [5, 52.4, T.M_PICK, () => centerIn('A', opusItem)],
  ];
  const WIN = [[11.85, 14.2], [17.4, 18.6], [21.5, 22.8], [23.75, 26.0], [30.85, 31.95], [51.45, 53.9]];
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
    cur.style.opacity = String(P(t, WIN[w][0], WIN[w][0] + 0.2) * (1 - P(t, WIN[w][1] - 0.2, WIN[w][1])));
    cur.style.transform = `translate(${pos[0] - 4}px, ${pos[1] - 2}px) scale(${clickK > 0 && clickK < 0.25 ? 0.86 : 1})`;
    ring.style.opacity = clickK >= 0 ? String(1 - clickK) : '0';
    ring.style.transform = `translate(${pos[0] - 30}px, ${pos[1] - 30}px) scale(${0.4 + clickK * 1.1})`;
  }
  function chips(t) {
    // Wallet signature popup.
    const wl = $('#wallet');
    const wi = E.back(P(t, T.CONNECT + 0.15, T.CONNECT + 0.55)), wo = E.io(P(t, T.SIGN + 0.15, T.SIGN + 0.45));
    wl.style.opacity = String(P(t, T.CONNECT + 0.15, T.CONNECT + 0.3) * (1 - wo));
    wl.style.transform = `translateY(${(1 - wi) * 30 + wo * 20}px) scale(${0.92 + 0.08 * wi - wo * 0.04})`;
    const sb = $('#wsign');
    const press = P(t, T.SIGN - 0.05, T.SIGN + 0.05) * (1 - P(t, T.SIGN + 0.1, T.SIGN + 0.3));
    sb.style.transform = `scale(${1 - 0.05 * press})`;
    // +25 credits pill, under the balance.
    const ct = $('#counter');
    const ci = E.back(P(t, T.X + 0.55, T.X + 0.95)), co = E.io(P(t, 16.0, 16.4));
    if (t > T.X + 0.4 && t < 16.5) {
      const p = centerIn('A', balEls[0]) ?? [1600, 120];
      ct.style.opacity = String(P(t, T.X + 0.55, T.X + 0.7) * (1 - co));
      ct.style.transform = `translate(${p[0] - 150}px, ${p[1] + 40 + (1 - ci) * 20}px) scale(${0.7 + 0.3 * ci})`;
    } else ct.style.opacity = '0';
    // Token address flies into the scanner.
    const pc = $('#pchip');
    const a = T.SCAN - 1.05, b = T.SCAN - 0.45;
    if (t < a - 0.1 || t > b + 0.2) { pc.style.opacity = '0'; return; }
    const r = sInput.getBoundingClientRect();
    const [ix, iy] = toScreen(FR.S, r.left + 40, r.top + r.height / 2);
    const m = E.io(P(t, a, b));
    pc.style.opacity = String(P(t, a - 0.1, a + 0.1) * (1 - P(t, b, b + 0.15)));
    pc.style.transform = `translate(${lerp(1380, ix, m)}px, ${lerp(iy + 260, iy - 34, m)}px) scale(${lerp(1.5, 0.95, m)}) rotate(${(1 - m) * -4}deg)`;
  }

  /* ================= overlay text ================= */
  const CAPS = [
    { a: 5.9, b: 11.1, n: 'noxsea.xyz', t: 'Now live.', s: 'Private AI on the best open models, plus Claude Opus 5.5. No prompt logs, ever.' },
    { a: 12.0, b: 16.4, n: '01', t: 'Sign in with your wallet', s: 'One signature. No email, no KYC, no gas. 25 free credits.' },
    { a: T.CH0 + 0.35, b: T.CMP0 - 0.2, n: '02', t: 'Private by design', s: 'Prompts are never logged. Any chat can self-destruct.' },
    { a: T.CMP0 + 0.35, b: T.S0 - 0.2, n: '03', t: 'Compare the best models', s: 'DeepSeek, Kimi, Qwen and Claude Opus 5.5, side by side.' },
    { a: T.S0 + 0.35, b: T.IMG0 - 0.2, n: '04', t: 'Token Scanner', s: 'Red flags on Robinhood Chain, Solana, Base and more. Free, no wallet needed.' },
    { a: T.IMG0 + 0.35, b: T.RES0 - 0.15, n: '05', t: 'Create images', s: 'Memes, banners, logos. Charged only when the image arrives.' },
    { a: T.RES0 + 0.3, b: T.VIS0 - 0.15, n: '06', t: 'Deep Research', s: 'Many searches, one report with sources. Your IP stays hidden.' },
    { a: T.VIS0 + 0.3, b: T.AUD0 - 0.15, n: '07', t: 'Reads your screenshots', s: 'Charts, tweets, documents. Never stored.' },
    { a: T.AUD0 + 0.3, b: T.MOD0 - 0.15, n: '08', t: 'Audits smart contracts', s: 'Reads the verified source, function by function.' },
    { a: T.MOD0 + 0.3, b: T.END, n: '09', t: 'Claude Opus 5.5', s: 'A premium model, right next to the best open ones.' },
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
  const INTRO = $('#intro');
  const dropLen = 150; // generous: the drop path is ~140 units long
  INTRO.querySelectorAll('.dropS').forEach((p) => { p.style.strokeDasharray = String(dropLen); });
  function logo(root, t, t0) {
    const sP = root.querySelector('.dropS'), fP = root.querySelector('.dropF'), kP = root.querySelector('.keyF'), hl = root.querySelector('.hl');
    sP.style.strokeDasharray = String(dropLen);
    sP.style.strokeDashoffset = String(dropLen * (1 - E.io(P(t, t0, t0 + 1.2))));
    sP.style.opacity = String(1 - P(t, t0 + 1.4, t0 + 1.9));
    fP.style.opacity = String(E.out(P(t, t0 + 0.9, t0 + 1.5)));
    kP.style.opacity = String(E.out(P(t, t0 + 1.2, t0 + 1.6)));
    hl.style.opacity = String(E.out(P(t, t0 + 1.4, t0 + 1.9)));
    const bloom = Math.sin(Math.PI * P(t, t0 + 0.9, t0 + 2.1));
    root.querySelector('svg.big').style.filter = `drop-shadow(0 0 ${18 + 50 * bloom}px rgba(107,120,255,${0.55 + 0.4 * bloom}))`;
    root.querySelectorAll('.rings i').forEach((r, i) => {
      const q = P(t, t0 + 1.3 + i * 0.32, t0 + 2.9 + i * 0.32);
      r.style.opacity = String(q > 0 && q < 1 ? (1 - q) * 0.8 : 0);
      r.style.transform = `scale(${1 + q * 2.4})`;
    });
  }
  function intro(t) {
    logo(INTRO, t, 0.25);
    INTRO.querySelectorAll('.word span').forEach((el, i) => {
      const q = E.expo(P(t, 1.75 + i * 0.07, 2.45 + i * 0.07));
      el.style.opacity = String(q);
      el.style.transform = `translateY(${(1 - q) * 40}px)`;
      el.style.filter = q < 0.99 ? `blur(${(1 - q) * 14}px)` : 'none';
    });
    const live = $('.live', INTRO), tag = $('.tagline', INTRO);
    const lq = E.back(P(t, 2.55, 3.0));
    live.style.opacity = String(P(t, 2.55, 2.7));
    live.style.transform = `scale(${0.6 + 0.4 * lq})`;
    rise(tag, t, 3.05, 99, 18);
    const out = E.io(P(t, 4.3, 5.05));
    INTRO.style.opacity = String(1 - out);
    INTRO.style.transform = `scale(${1 + 0.14 * out})`;
    INTRO.style.filter = out > 0.01 ? `blur(${out * 14}px)` : 'none';
    INTRO.style.visibility = out >= 1 ? 'hidden' : 'visible';
  }
  let lastCap = null;
  function caption(t) {
    const cap = $('#cap2'), bgc = $('#capbg');
    const c = CAPS.find((x) => t >= x.a - 0.1 && t <= x.b + 0.1);
    if (!c) { cap.style.opacity = '0'; bgc.style.opacity = String(Math.max(0, parseFloat(bgc.style.opacity || '0') * 0)); return; }
    if (c !== lastCap) {
      $('.n span', cap).textContent = c.n;
      $('.t', cap).innerHTML = c.t.split(' ').map((w) => `<span>${w}</span>`).join('');
      $('.s', cap).textContent = c.s;
      lastCap = c;
    }
    const o = E.io(P(t, c.b - 0.45, c.b));
    cap.style.opacity = String(1 - o);
    cap.style.filter = o > 0.01 ? `blur(${o * 10}px)` : 'none';
    bgc.style.opacity = String(E.out(P(t, c.a - 0.2, c.a + 0.4)) * (1 - o));
    $('.n', cap).style.opacity = String(E.out(P(t, c.a, c.a + 0.4)));
    $('.n i', cap).style.transform = `scaleX(${E.expo(P(t, c.a, c.a + 0.8))})`;
    cap.querySelectorAll('.t span').forEach((el, i) => {
      const q = E.expo(P(t, c.a + 0.08 + i * 0.07, c.a + 0.7 + i * 0.07));
      el.style.opacity = String(q);
      el.style.transform = `translateY(${(1 - q) * 30}px)`;
      el.style.filter = q < 0.99 ? `blur(${(1 - q) * 12}px)` : 'none';
    });
    const sq = E.out(P(t, c.a + 0.35, c.a + 0.95));
    $('.s', cap).style.opacity = String(sq);
    $('.s', cap).style.transform = `translateY(${(1 - sq) * 14}px)`;
  }
  // Film grain: deterministic per frame.
  const gctx = $('#grain').getContext('2d');
  const gimg = gctx.createImageData(960, 540);
  function grain(t) {
    let x = (Math.floor(t * 60) * 2654435761) >>> 0;
    const d = gimg.data;
    for (let i = 0; i < d.length; i += 4) {
      x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
      const v = x & 255;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    gctx.putImageData(gimg, 0, 0);
  }
  // Rising bubbles behind everything (deterministic in t).
  const pctx = $('#parts').getContext('2d');
  const PARTS = Array.from({ length: 150 }, () => ({ x: rnd() * 1920, y: rnd() * 1180, v: 18 + rnd() * 55, r: 0.6 + rnd() * 2.4, a: 0.15 + rnd() * 0.5, w: rnd() * 6 }));
  function parts(t) {
    pctx.clearRect(0, 0, 1920, 1080);
    const vis = Math.max(1 - P(t, 4.6, 5.6), P(t, T.END + 0.2, T.END + 1.2), 0.35);
    for (const q of PARTS) {
      const y = ((((q.y - q.v * t) % 1180) + 1180) % 1180) - 50;
      const x = q.x + Math.sin(t * 0.6 + q.w) * 14;
      pctx.globalAlpha = q.a * vis;
      pctx.fillStyle = '#BFE9FF';
      pctx.beginPath();
      pctx.arc(x, y, q.r, 0, Math.PI * 2);
      pctx.fill();
    }
  }
  function overlay(t) {
    intro(t);
    caption(t);
    // Dips hide same-page scene changes; light sweeps ride every transition.
    $('#dip').style.opacity = String(0.92 * dip(t));
    const sw = [4.85, ...CAM_CUTS, ...RESETS, T.END + 0.35].map((x) => P(t, x - 0.45, x + 0.45)).find((q) => q > 0 && q < 1);
    $('#sweep').style.opacity = sw !== undefined ? String(Math.sin(Math.PI * sw) * 0.9) : '0';
    $('#sweep').style.transform = `translateX(${sw !== undefined ? lerp(-1400, 1400, E.io(sw)) : -2000}px)`;
    $('#flash').style.opacity = String(Math.max(0.6 * Math.sin(Math.PI * P(t, T.IMG0 + 0.45, T.IMG0 + 1.05)), 0.7 * Math.sin(Math.PI * P(t, T.SCAN + 0.5, T.SCAN + 0.95))));
    // End card.
    const endc = $('#endc');
    rise(endc, t, T.END + 0.5, 99, 26);
    logo(endc, t, T.END + 0.4);
    const lv = $('.live', endc), lq = E.back(P(t, T.END + 1.3, T.END + 1.7));
    lv.style.opacity = String(P(t, T.END + 1.3, T.END + 1.45));
    lv.style.transform = `scale(${0.6 + 0.4 * lq})`;
    document.querySelectorAll('#endc .feats span').forEach((el, i) => {
      const q = E.back(P(t, T.END + 1.5 + i * 0.09, T.END + 1.95 + i * 0.09));
      el.style.opacity = String(P(t, T.END + 1.5 + i * 0.09, T.END + 1.65 + i * 0.09));
      el.style.transform = `scale(${0.6 + 0.4 * q}) translateY(${(1 - q) * 10}px)`;
    });
    const sh = $('#endc .adcta .sh');
    sh.style.transform = `translateX(${lerp(-150, 520, ((t - T.END - 2.2) / 2.2) % 1 < 0 ? 0 : ((t - T.END - 2.2) / 2.2) % 1)}px) skewX(-20deg)`;
    $('#fade').style.opacity = String(Math.max(1 - P(t, 0, 0.6), P(t, 59.0, 60)));
    // Light leaks and the background drift.
    $('#leak .l1').style.transform = `translate(${-300 + Math.sin(t * 0.17) * 500}px, ${-200 + Math.cos(t * 0.13) * 160}px)`;
    $('#leak .l2').style.transform = `translate(${1300 + Math.cos(t * 0.15) * 420}px, ${650 + Math.sin(t * 0.19) * 150}px)`;
    bg.querySelector('.a1').style.transform = `translate(${Math.sin(t * 0.22) * 120}px, ${Math.cos(t * 0.18) * 70}px)`;
    bg.querySelector('.a2').style.transform = `translate(${Math.cos(t * 0.2) * 140}px, ${Math.sin(t * 0.25) * 80}px)`;
    bg.querySelector('.a3').style.transform = `translate(${Math.sin(t * 0.3 + 1) * 160}px, ${Math.cos(t * 0.26) * 60}px)`;
    bg.querySelector('.grid').style.transform = `translateY(${(t * 14) % 80}px)`;
    parts(t);
    grain(t);
  }

  window.render = (t) => {
    landing(t);
    gate(t);
    scanner(t);
    app(t);
    cameras(t);
    cursor(t);
    chips(t);
    overlay(t);
    for (const d of [document, L, G, S, A]) d.getAnimations().forEach((an) => { try { an.pause(); an.currentTime = (t * 1000) % 100000; } catch {} });
  };
  window.render(0);
})();
