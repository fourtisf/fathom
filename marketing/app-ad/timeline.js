/* Noxsea product ad: the real app UI (captured DOM + real CSS), driven frame by frame by render(t). */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const P = (t, a, b) => clamp((t - a) / (b - a));
  const E = {
    out: (x) => 1 - Math.pow(1 - x, 3),
    io: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    expo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
    back: (x) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  };
  const lerp = (a, b, x) => a + (b - a) * x;
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  window.DURATION = 48;

  /* ---------- stage setup ---------- */
  const shell = $('.shell');
  const cam = document.createElement('div');
  cam.id = 'cam';
  shell.parentNode.insertBefore(cam, shell);
  cam.appendChild(shell);
  const bg = document.createElement('div');
  bg.id = 'adbg';
  bg.innerHTML = '<i class="a1"></i><i class="a2"></i><i class="a3"></i>';
  document.body.insertBefore(bg, cam);
  const ov = document.createElement('div');
  ov.id = 'ov';
  ov.innerHTML = `
    <div id="intro"><svg class="lg" viewBox="0 0 64 64"><use href="#mk"/></svg><div class="wm">Noxsea</div><div class="tg">Private AI chat</div></div>
    <div id="wcap"><span class="grad">Private AI</span> that forgets you.</div>
    <div id="cap"><div class="n"></div><div class="t"></div><div class="s"></div></div>
    <svg id="cur" viewBox="0 0 24 24"><path d="M5 3l14 7.5-6.2 1.7L10 18.5z" fill="#fff" stroke="#0A0E30" stroke-width="1.4"/></svg>
    <div id="ring"></div>
    <div id="endc">
      <svg class="lg" viewBox="0 0 64 64"><use href="#mk"/></svg>
      <h2>Private AI that<br><span class="grad">forgets you.</span></h2>
      <div class="adcta">noxsea.xyz</div>
      <div class="fine">Follow @noxseadotai</div>
    </div>
    <div id="fade"></div>`;
  document.body.appendChild(ov);

  const thread = $('.thread');
  const threadIn = $('.thread-in');
  const ta = $('.composer textarea');
  const composer = $('.composer');
  const chips = [...document.querySelectorAll('.cbar > .chip')];
  const chip = { compare: chips[0], attach: chips[1], token: chips[2] };
  const modewrap = $('.modewrap');
  const modeChip = $('.modewrap .chip');
  const send = $('.send');
  const burnSel = $('.burnpill select');
  const chint = $('.chint .l span');
  const balEls = [$('.bal span'), $('.wallet-card b')];
  const SUGGEST = threadIn.innerHTML;

  // Natural (untransformed) positions of key UI, for the camera.
  const rc = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r }; };
  const POS = { composer: rc(composer), burn: rc($('.burnpill')), mode: rc(modewrap), thread: rc(thread), tin: rc(threadIn) };

  /* ---------- markup helpers (same classes the app renders) ---------- */
  const IC = '<div class="ic"><svg aria-hidden="true"><use href="#mk"></use></svg></div>';
  const SPARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z"></path><path d="M9 12l2 2 4-4"></path></svg>';
  const DOC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><path d="M14 3v5h5"></path></svg>';
  const you = (t, doc) => `<div class="m you" style="white-space:pre-wrap">${doc ? `<span class="docchip">${DOC}<b>${doc}</b><small>18 pages</small></span>` : ''}${esc(t)}</div>`;
  const meta = (model, cr) =>
    `<div class="meta"><span>${model}</span><span>${cr} credits</span><span class="ok"><svg aria-hidden="true"><use href="#shield"></use></svg>Not logged</span><button class="mact">Copy</button><button class="mact">Regenerate</button></div>`;
  const tool = (txt, running) => `<div class="toolrun">${SPARK}<span${running ? ' class="shim"' : ''}>${txt}</span></div>`;
  const WAIT = '<span class="shim" style="font-size:14px">Answering privately…</span>';

  /** Streams structured markdown: blocks of {t:'p'|'h'|'ul'|'ol', b?:bold lead, x:text}. */
  function md(blocks, n) {
    let left = Math.floor(n);
    const out = [];
    let list = null;
    let done = true;
    for (const bl of blocks) {
      if (left <= 0) { done = false; break; }
      const words = ((bl.b ? bl.b + ' ' : '') + bl.x).split(' ');
      const take = Math.min(words.length, left);
      left -= take;
      const boldWords = bl.b ? bl.b.split(' ').length : 0;
      const shown = words.slice(0, take);
      const bPart = shown.slice(0, boldWords).join(' ');
      const rest = shown.slice(boldWords).join(' ');
      const inner = (bPart ? `<strong>${esc(bPart)}</strong>${rest ? ' ' : ''}` : '') + esc(rest);
      const listTag = bl.t === 'ul' ? 'ul' : bl.t === 'ol' ? 'ol' : null;
      if (list && list.tag !== listTag) { out.push(`<${list.tag}>${list.items.join('')}</${list.tag}>`); list = null; }
      if (listTag) { (list ||= { tag: listTag, items: [] }).items.push(`<li>${inner}</li>`); }
      else out.push(bl.t === 'h' ? `<h3>${inner}</h3>` : `<p>${inner}</p>`);
      if (take < words.length) { done = false; break; }
    }
    if (list) out.push(`<${list.tag}>${list.items.join('')}</${list.tag}>`);
    return { html: `<div class="md">${out.join('')}</div>`, done };
  }
  const total = (blocks) => blocks.reduce((n, b) => n + ((b.b ? b.b + ' ' : '') + b.x).split(' ').length, 0);
  const aiStream = (blocks, t0, wps, t, model, cr) => {
    if (t < t0) return `<div class="m ai">${IC}<div class="b">${WAIT}</div></div>`;
    const n = (t - t0) * wps;
    const r = md(blocks, n);
    return `<div class="m ai">${IC}<div class="b"><div>${r.html}${r.done ? '' : '<span class="caret"></span>'}</div>${r.done ? meta(model, cr) : ''}</div></div>`;
  };

  /* ---------- content ---------- */
  const Q1 = 'How do I bridge ETH to Robinhood Chain safely?';
  const A1 = [
    { t: 'p', x: "Here's a safe way to do it, step by step:" },
    { t: 'ol', b: 'Use the official bridge.', x: 'Open it from the link in Robinhood’s own docs and bookmark it. Phishing sites copy the design.' },
    { t: 'ol', b: 'Send a small test first.', x: 'Bridge a tiny amount and wait until it arrives before moving the rest.' },
    { t: 'ol', b: 'Check every approval.', x: 'Never sign unlimited approvals on a site you reached from a DM or an ad.' },
    { t: 'p', b: 'Common mistake:', x: 'sending tokens to a contract address instead of your own wallet.' },
  ];
  const ADDR = '0x7a3F9c21E04b5D6a8F1e2C3b4A5d6E7f8A9b91cE';
  const Q2 = 'Check this token for red flags: ' + ADDR;
  const TCARD = `<div class="tcard v-high"><div class="tcard-hd"><div><div class="tcard-k">Token Safety Check</div><div class="tcard-t">Pepe Hood (PHOOD)</div><div class="tcard-a"><span class="mono">0x7a3F…91cE</span><button class="mact">Copy</button><a class="mact">Explorer ↗</a></div></div><span class="tbadge b-high">2 red flags</span></div><div class="tstats"><div><span>Holders</span><b>2,481</b></div><div><span>Top 10 hold</span><b>50%</b></div><div><span>Supply</span><b>1B</b></div><div><span>Price</span><b>$0.00042</b></div><div><span>Source</span><b>Verified</b></div><div><span>Owner</span><b>0x5555…5555</b></div></div><ul class="tflags"><li class="f-high"><i aria-hidden="true"></i><span><em>High risk</em> Has a mint function: new tokens can be created, diluting holders.</span></li><li class="f-high"><i aria-hidden="true"></i><span><em>High risk</em> One wallet holds 22% of supply.</span></li><li class="f-medium"><i aria-hidden="true"></i><span><em>Caution</em> Buy/sell fees or taxes can be changed after launch.</span></li><li class="f-medium"><i aria-hidden="true"></i><span><em>Caution</em> Trading can be switched on or off by a privileged account.</span></li><li class="f-info"><i aria-hidden="true"></i><span><em>Note</em> Has an active owner (0x5555…5555) who can call owner-only functions.</span></li></ul><div class="tcard-ft">Automatic checks of public data on Robinhood Chain. They can miss honeypots, liquidity pulls and other tricks. Not financial advice.</div></div>`;
  const A2 = [
    { t: 'p', b: 'Two red flags stand out.', x: 'The owner can still mint new tokens, and a single wallet holds 22% of the supply, enough to crash the price in one sale.' },
    { t: 'p', x: 'Before buying, check whether liquidity is locked and who that top wallet is. This is not financial advice.' },
  ];
  const Q3 = 'BTC, ETH and SOL price today?';
  const PSTRIP = `<div class="pstrip" aria-label="Live prices"><div class="pchip"><span class="psym">BTC</span><b>$64,210.55</b><span class="up">▲ 1.84%</span><small>MC $1.27T</small></div><div class="pchip"><span class="psym">ETH</span><b>$3,120.40</b><span class="up">▲ 2.48%</span><small>MC $375.00B</small></div><div class="pchip"><span class="psym">SOL</span><b>$151.32</b><span class="down">▼ 0.61%</span><small>MC $71.00B</small></div></div>`;
  const A3 = [{ t: 'p', x: 'Live as of now: BTC is $64,210 (+1.84% in 24h), ETH is $3,120 (+2.48%) and SOL is $151.32 (−0.61%). ETH is leading today.' }];
  const Q4 = 'What are the risks in this tokenomics?';
  const A4 = [
    { t: 'p', x: 'Contract auditor mode · findings by severity:' },
    { t: 'ul', b: 'High:', x: 'the team holds 35% with no vesting, so they can sell at any time.' },
    { t: 'ul', b: 'High:', x: 'liquidity is locked for only 7 days.' },
    { t: 'ul', b: 'Medium:', x: 'the treasury wallet is a single key, not a multisig.' },
  ];
  const Q5 = 'Explain impermanent loss in two sentences.';
  const C5a = [{ t: 'p', x: 'Impermanent loss is the gap between holding two tokens and providing them as liquidity when their prices move apart. The bigger the move, the more you lose compared with simply holding.' }];
  const C5b = [{ t: 'p', x: 'When you add liquidity, the pool rebalances your tokens as prices change, so you end up with more of the one that fell. It only becomes a real loss if you withdraw before prices return.' }];

  /* ---------- scenes ---------- */
  const SC = [
    // [start, end] of each app scene (camera/caption handled separately)
    { id: 'ask', a: 7.2, b: 15.0 },
    { id: 'token', a: 15.0, b: 23.0 },
    { id: 'price', a: 23.0, b: 28.6 },
    { id: 'mode', a: 28.6, b: 34.2 },
    { id: 'cmp', a: 34.2, b: 39.2 },
    { id: 'burn', a: 39.2, b: 44.0 },
  ];
  const CAPS = [
    { a: 8.0, b: 14.6, n: '01', t: 'Zero prompt logs', s: 'Nothing you ask is stored in readable form.' },
    { a: 15.4, b: 22.6, n: '02', t: 'Token Safety Check', s: 'Red flags in seconds, before you buy.' },
    { a: 23.4, b: 28.2, n: '03', t: 'Live prices', s: 'Real-time data, not stale training data.' },
    { a: 29.0, b: 33.8, n: '04', t: 'Expert modes · Private PDFs', s: 'Read in your browser, never uploaded.' },
    { a: 34.6, b: 38.8, n: '05', t: 'Compare models', s: 'Two open models, side by side.' },
    { a: 39.6, b: 42.8, n: '06', t: 'Chats that forget you', s: 'Burn after 1h or 24h, or forget instantly.' },
  ];

  const typed = (txt, t, t0, cps = 30) => txt.slice(0, Math.max(0, Math.floor((t - t0) * cps)));
  function setTa(text) {
    if (ta.value !== text) ta.value = text;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }
  function setBal(v) { balEls[0].textContent = v; balEls[1].firstChild.textContent = v + ' '; }

  let lastThread = null;
  function setThread(html) {
    if (html !== lastThread) { threadIn.innerHTML = html; lastThread = html; }
    thread.scrollTop = thread.scrollHeight;
  }
  function setAttach(on) {
    let row = $('.attach-row', composer);
    if (on && !row) {
      row = document.createElement('div');
      row.className = 'attach-row';
      row.innerHTML = `<span class="docchip">${DOC}<b>MoonDAO-whitepaper.pdf</b><small>18 pages</small><button>×</button></span>`;
      composer.insertBefore(row, ta);
    } else if (!on && row) row.remove();
  }
  const MENU = `<div class="modemenu" role="menu">${[
    ['Default', 'Balanced, helpful answers'], ['Contract auditor', 'Reviews smart contracts for risks'],
    ['Memecoin researcher', 'Tokens, holders, liquidity and hype'], ['Explain simply', 'Plain words for crypto newcomers'],
    ['Web3 developer', 'Solidity, Foundry, viem and wagmi'], ['Crypto writer', 'Threads, posts and announcements'],
  ].map(([b, s], i) => `<button data-i="${i}"><b>${b}</b><span>${s}</span></button>`).join('')}</div>`;
  function setMode(open, hl, label) {
    let menu = $('.modemenu', modewrap);
    if (open && !menu) { modewrap.insertAdjacentHTML('beforeend', MENU); menu = $('.modemenu', modewrap); }
    if (!open && menu) menu.remove();
    if (menu) menu.querySelectorAll('button').forEach((b) => b.classList.toggle('on', Number(b.dataset.i) === hl));
    $('.cl', modeChip).textContent = label;
    modeChip.setAttribute('aria-pressed', label !== 'Mode' ? 'true' : 'false');
  }

  function app(t) {
    // defaults
    let html = SUGGEST, text = '', bal = '25', attach = false, mode = { open: false, hl: 0, label: 'Mode' };
    let cmpOn = false, tokenGlow = 0, burn = 'off';
    chint.textContent = 'Never logged · saved encrypted to your wallet';

    if (t >= 7.2 && t < 15) {
      const send1 = 10.2;
      if (t < send1) text = typed(Q1, t, 8.4);
      else html = you(Q1) + aiStream(A1, 11.0, 24, t, 'DeepSeek V3.1', '0.06');
      if (t > 14.2) bal = '24.94';
    } else if (t >= 15 && t < 23) {
      bal = '24.94';
      tokenGlow = P(t, 15.9, 16.2) * (1 - P(t, 16.9, 17.3));
      const fill = 16.2;
      const send2 = 17.6;
      if (t < fill) text = '';
      else if (t < send2) text = t < 16.9 ? 'Check this token for red flags: ' : Q2;
      else {
        const tk = t < 18.4 ? tool('Checking on-chain data on Robinhood Chain…', true) : TCARD;
        const ans = t < 18.4 ? '' : (() => {
          const r = md(A2, (t - 19.6) * 21);
          if (t < 19.6) return '';
          return `<div>${r.html}${r.done ? '' : '<span class="caret"></span>'}</div>${r.done ? meta('DeepSeek V3.1', '0.06') : ''}`;
        })();
        html = you(Q2) + `<div class="m ai">${IC}<div class="b">${tk}${ans}</div></div>`;
        if (t > 22.3) bal = '24.88';
      }
    } else if (t >= 23 && t < 28.6) {
      bal = '24.88';
      const send3 = 24.6;
      if (t < send3) text = typed(Q3, t, 23.6);
      else {
        const tl = t < 25.3 ? tool('Fetching live prices…', true) : tool('Live prices from CoinGecko · your IP stayed hidden', false) + PSTRIP;
        const ans = t < 25.7 ? '' : (() => { const r = md(A3, (t - 25.7) * 16); return `<div>${r.html}${r.done ? '' : '<span class="caret"></span>'}</div>${r.done ? meta('DeepSeek V3.1', '0.04') : ''}`; })();
        html = you(Q3) + `<div class="m ai">${IC}<div class="b">${tl}${ans}</div></div>`;
        if (t > 27.6) bal = '24.84';
      }
    } else if (t >= 28.6 && t < 34.2) {
      bal = '24.84';
      if (t < 29.4) mode = { open: false, hl: 0, label: 'Mode' };
      else if (t < 30.7) mode = { open: true, hl: t < 30.1 ? 0 : 1, label: 'Mode' };
      else mode = { open: false, hl: 1, label: 'Contract auditor' };
      attach = t >= 31.3;
      const send4 = 32.7;
      if (t < send4) text = typed(Q4, t, 31.6, 34);
      else html = you(Q4, 'MoonDAO-whitepaper.pdf') + aiStream(A4, 33.0, 22, t, 'DeepSeek V3.1', '0.09');
      if (t >= send4) attach = false;
    } else if (t >= 34.2 && t < 39.2) {
      bal = '24.84';
      mode = { open: false, hl: 1, label: 'Contract auditor' };
      cmpOn = t > 34.8;
      const send5 = 36.0;
      if (t < send5) text = typed(Q5, t, 35.0, 40);
      else {
        const col = (name, blocks, t0, wps, cr) => {
          const r = md(blocks, t < t0 ? 0 : (t - t0) * wps);
          const body = t < t0 ? '<span class="shim" style="font-size:14px">Answering privately…</span>' : `${r.html}${r.done ? '' : '<span class="caret"></span>'}`;
          return `<div><h5>${name}<small>${r.done ? cr : ''}</small></h5><div style="font-size:14px">${body}</div></div>`;
        };
        html = you(Q5) + `<div class="m ai">${IC}<div><div class="cmp">${col('DeepSeek V3.1', C5a, 36.4, 17, '0.05 cr')}${col('Qwen3 235B', C5b, 36.7, 15, '0.04 cr')}</div></div></div>`;
        if (t > 38.6) bal = '24.75';
      }
    } else if (t >= 39.2) {
      bal = '24.75';
      cmpOn = false;
      mode = { open: false, hl: 1, label: 'Contract auditor' };
      html = you(Q5) + `<div class="m ai">${IC}<div><div class="cmp"><div><h5>DeepSeek V3.1<small>0.05 cr</small></h5><div style="font-size:14px">${md(C5a, 99).html}</div></div><div><h5>Qwen3 235B<small>0.04 cr</small></h5><div style="font-size:14px">${md(C5b, 99).html}</div></div></div></div></div>`;
      if (t > 40.4) {
        burn = '24h';
        html += '<div class="m note"><svg aria-hidden="true"><use href="#shield"></use></svg>This chat will self-destruct in 24 hours</div>';
        chint.textContent = 'Encrypted · this chat self-destructs 24 hours after it started';
      }
    }

    setThread(html);
    setTa(text);
    setBal(bal);
    setAttach(attach);
    setMode(mode.open, mode.hl, mode.label);
    chip.compare.setAttribute('aria-pressed', cmpOn ? 'true' : 'false');
    chip.token.style.boxShadow = tokenGlow ? `0 0 0 ${2 * tokenGlow}px rgba(179,168,255,.7), 0 0 30px rgba(139,124,255,${0.6 * tokenGlow})` : '';
    burnSel.value = burn;
    send.disabled = !text;

    // Forget: messages dissolve (41.6–42.6), then an empty chat.
    const f = P(t, 41.6, 42.5);
    if (f > 0) {
      threadIn.querySelectorAll('.m').forEach((m, i) => {
        const k = E.io(clamp(f * 1.3 - i * 0.12));
        m.style.opacity = String(1 - k);
        m.style.filter = `blur(${k * 14}px)`;
        m.style.transform = `translateY(${-k * 18}px) scale(${1 - k * 0.03})`;
      });
      if (f >= 1) setThread('<div class="m note"><svg aria-hidden="true"><use href="#shield"></use></svg>Chat forgotten. Nothing was kept.</div>');
    }
  }

  /* ---------- camera ---------- */
  const C0 = POS.composer, T0 = POS.thread, B = POS.burn, M = POS.mode;
  const C = { x: C0.x - 110, y: 1000 }; // clamped to the bottom edge: composer sits low, thread visible above
  // Thread views: content centered at screen x≈1100, clear of the caption on the left.
  const TX = (sc) => POS.tin.x - 140 / sc;
  const KEYS = [
    // t, center x, center y, scale, window amount (1 = floating window)
    [3.0, 960, 540, 0.74, 1],
    [7.4, 960, 540, 0.74, 1],
    [8.4, C.x, C.y, 1.38, 0],
    [10.1, C.x, C.y, 1.38, 0],
    [11.0, TX(1.6), 300, 1.6, 0],
    [12.4, TX(1.6), 300, 1.6, 0],
    [14.6, TX(1.5), 380, 1.5, 0],
    [15.5, C.x, C.y, 1.38, 0],
    [17.5, C.x, C.y, 1.38, 0],
    [18.3, TX(1.5), 330, 1.5, 0],
    [19.2, TX(1.6), 360, 1.6, 0],
    [22.6, TX(1.55), 400, 1.55, 0],
    [23.4, C.x, C.y, 1.38, 0],
    [24.5, C.x, C.y, 1.38, 0],
    [25.3, TX(1.85), 270, 1.85, 0],
    [28.4, TX(1.85), 270, 1.85, 0],
    [29.2, M.x + 120, C.y - 200, 1.4, 0],
    [32.6, M.x + 120, C.y - 200, 1.4, 0],
    [33.4, TX(1.75), 280, 1.75, 0],
    [34.6, TX(1.75), 280, 1.75, 0],
    [35.2, C.x, C.y, 1.32, 0],
    [35.9, C.x, C.y, 1.32, 0],
    [36.6, TX(1.65), 280, 1.65, 0],
    [39.2, TX(1.65), 280, 1.65, 0],
    [40.0, B.x - 140, B.y + 120, 1.5, 0],
    [41.0, B.x - 140, B.y + 120, 1.5, 0],
    [41.7, TX(1.5), 320, 1.5, 0],
    [42.6, TX(1.5), 320, 1.5, 0],
    [43.5, 960, 540, 0.74, 1],
  ];
  function camAt(t) {
    let k0 = KEYS[0], k1 = KEYS[0];
    for (let i = 0; i < KEYS.length; i++) { if (KEYS[i][0] <= t) { k0 = KEYS[i]; k1 = KEYS[i + 1] ?? KEYS[i]; } }
    const x = k1 === k0 ? 1 : E.io(P(t, k0[0], k1[0]));
    return { cx: lerp(k0[1], k1[1], x), cy: lerp(k0[2], k1[2], x), s: lerp(k0[3], k1[3], x), w: lerp(k0[4], k1[4], x) };
  }
  function camera(t) {
    const c = camAt(t);
    // keep the zoomed app covering the screen
    // transform-origin is the screen center: a point p lands at 960 + s * (p - 960) + tx.
    let tx = c.s * (960 - c.cx), ty = c.s * (540 - c.cy);
    if (c.s >= 1) { tx = clamp(tx, 960 - 960 * c.s, 960 * c.s - 960); ty = clamp(ty, 540 - 540 * c.s, 540 * c.s - 540); }
    const enter = E.expo(P(t, 3.0, 4.4));
    const leave = E.io(P(t, 43.6, 44.4));
    const drift = Math.sin(t * 0.5) * 4 * c.w;
    const rx = c.w * (6 * (1 - enter) + 2) * (1 - leave);
    cam.style.opacity = String(enter * (1 - leave));
    cam.style.transform = `translate(${tx}px, ${ty + (1 - enter) * 90 + drift}px) scale(${c.s * (1 - leave * 0.06)}) perspective(2400px) rotateX(${rx}deg)`;
    cam.style.borderRadius = `${c.w * 22}px`;
    cam.style.boxShadow = c.w > 0.01 ? `0 ${60 * c.w}px ${160 * c.w}px -30px rgba(0,0,0,.9), 0 0 0 ${c.w}px rgba(255,255,255,.12)` : 'none';
  }

  /* ---------- cursor ---------- */
  const center = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const CLICKS = [
    // [move start, click time, target getter]
    [9.6, 10.2, () => send],
    [15.6, 16.2, () => chip.token],
    [17.1, 17.6, () => send],
    [24.1, 24.6, () => send],
    [28.9, 29.4, () => modeChip],
    [29.9, 30.6, () => $('.modemenu button[data-i="1"]') ?? modeChip],
    [30.8, 31.3, () => chip.attach],
    [32.2, 32.7, () => send],
    [34.4, 34.8, () => chip.compare],
    [35.6, 36.0, () => send],
    [39.8, 40.4, () => $('.burnpill')],
    [41.1, 41.6, () => $('.chint-r button:last-child')],
  ];
  function cursor(t) {
    const cur = $('#cur'), ring = $('#ring');
    const vis = t > 8.6 && t < 42.4;
    cur.style.opacity = vis ? '1' : '0';
    if (!vis) { ring.style.opacity = '0'; return; }
    let prev = [1500, 1000], pos = prev, clickK = -1;
    for (let i = 0; i < CLICKS.length; i++) {
      const [ms, ct, get] = CLICKS[i];
      const el = get();
      const target = el ? center(el) : prev;
      if (t < ms) { pos = prev; break; }
      const k = E.io(P(t, ms, ct - 0.08));
      pos = [lerp(prev[0], target[0], k), lerp(prev[1], target[1], k)];
      if (t >= ct - 0.05 && t < ct + 0.45) clickK = P(t, ct - 0.05, ct + 0.45);
      prev = target;
    }
    cur.style.transform = `translate(${pos[0] - 4}px, ${pos[1] - 2}px) scale(${clickK > 0 && clickK < 0.25 ? 0.86 : 1})`;
    ring.style.opacity = clickK >= 0 ? String(1 - clickK) : '0';
    ring.style.transform = `translate(${pos[0] - 30}px, ${pos[1] - 30}px) scale(${0.4 + clickK * 1.1})`;
  }

  /* ---------- overlay text ---------- */
  function rise(el, t, a, b, dy = 30) {
    const i = E.expo(P(t, a, a + 0.9)), o = E.io(P(t, b - 0.5, b));
    el.style.opacity = String(i * (1 - o));
    el.style.transform = `translateY(${(1 - i) * dy - o * dy * 0.4}px)`;
    el.style.filter = (1 - i) * 10 + o * 10 > 0.05 ? `blur(${(1 - i) * 10 + o * 10}px)` : 'none';
  }
  function overlay(t) {
    rise($('#intro'), t, 0.3, 3.2, 24);
    const lg = $('#intro .lg');
    const a = E.expo(P(t, 0.2, 1.4));
    lg.style.transform = `scale(${0.6 + 0.4 * a})`;
    rise($('#wcap'), t, 4.0, 7.4, 20);
    const cap = $('#cap');
    const c = CAPS.find((x) => t >= x.a - 0.1 && t <= x.b + 0.1);
    if (c) {
      $('.n', cap).textContent = c.n;
      $('.t', cap).textContent = c.t;
      $('.s', cap).textContent = c.s;
      rise(cap, t, c.a, c.b, 24);
    } else cap.style.opacity = '0';
    rise($('#endc'), t, 44.2, 99, 30);
    const el = $('#endc .lg');
    const e = E.expo(P(t, 44.0, 45.2));
    el.style.transform = `scale(${0.6 + 0.4 * e})`;
    $('#fade').style.opacity = String(Math.max(1 - P(t, 0, 0.5), P(t, 47.2, 48)));
    bg.querySelector('.a1').style.transform = `translate(${Math.sin(t * 0.22) * 120}px, ${Math.cos(t * 0.18) * 70}px)`;
    bg.querySelector('.a2').style.transform = `translate(${Math.cos(t * 0.2) * 140}px, ${Math.sin(t * 0.25) * 80}px)`;
    bg.querySelector('.a3').style.transform = `translate(${Math.sin(t * 0.3 + 1) * 160}px, ${Math.cos(t * 0.26) * 60}px)`;
  }

  window.render = (t) => {
    app(t);
    camera(t);
    cursor(t);
    overlay(t);
    // CSS animations (shimmer, caret) follow the timeline, not the wall clock.
    document.getAnimations().forEach((an) => { try { an.pause(); an.currentTime = (t * 1000) % 100000; } catch {} });
  };
  window.render(0);
})();
