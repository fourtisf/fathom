/* Noxsea Token Scanner ad v2: Robinhood Chain demo tokens (fictional, with designed logos) on the real /scan page and /app. */
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
  window.DURATION = 41;

  const S = document.getElementById('fS').contentDocument;
  const A = document.getElementById('fA').contentDocument;
  const camS = document.getElementById('camS'), camA = document.getElementById('camA');
  const fS = document.getElementById('fS'), fA = document.getElementById('fA');
  const $ = (s, r = document) => r.querySelector(s);
  const bg = $('#adbg');
  bg.insertAdjacentHTML('beforeend', '<div class="grid"></div>');

  /* ---------- demo tokens (fictional) ---------- */
  const LOGO = {
    TIDE: `<svg class="tlogo" viewBox="0 0 64 64"><defs><linearGradient id="lgT" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5EE7F2"/><stop offset="1" stop-color="#2B6BFF"/></linearGradient></defs><circle cx="32" cy="32" r="32" fill="url(#lgT)"/><path d="M12 36c5 0 6-6 11-6s6 6 11 6 6-6 11-6 5 4 7 5" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/><path d="M14 45c4 0 5-4 9-4s5 4 9 4 5-4 9-4 5 3 8 4" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="3.5" stroke-linecap="round"/><path d="M20 24c3-5 8-8 14-8 5 0 9 2 12 5" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="3.5" stroke-linecap="round"/></svg>`,
    LUMN: `<svg class="tlogo" viewBox="0 0 64 64"><defs><linearGradient id="lgL" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFD66B"/><stop offset="1" stop-color="#FF7A3D"/></linearGradient></defs><circle cx="32" cy="32" r="32" fill="url(#lgL)"/><circle cx="32" cy="32" r="9" fill="#fff"/><g stroke="#fff" stroke-width="4" stroke-linecap="round">${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<line x1="32" y1="14" x2="32" y2="19" transform="rotate(${a} 32 32)"/>`).join('')}</g></svg>`,
    NSTR: `<svg class="tlogo" viewBox="0 0 64 64"><defs><linearGradient id="lgN" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#B9A8FF"/><stop offset="1" stop-color="#4B3BDB"/></linearGradient></defs><circle cx="32" cy="32" r="32" fill="url(#lgN)"/><path d="M32 11l5 16 16 5-16 5-5 16-5-16-16-5 16-5z" fill="#fff"/><circle cx="46" cy="18" r="2.5" fill="#fff" fill-opacity=".8"/></svg>`,
    MHI: `<svg class="tlogo" viewBox="0 0 64 64"><defs><linearGradient id="lgM" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF9BD2"/><stop offset="1" stop-color="#FF5A5F"/></linearGradient></defs><circle cx="32" cy="32" r="32" fill="url(#lgM)"/><path d="M38 14a19 19 0 1 0 12 30A15 15 0 0 1 38 14z" fill="#fff"/><path d="M41 24l3-6 2 7z" fill="#fff"/><circle cx="40" cy="31" r="2" fill="#FF5A5F"/></svg>`,
  };
  const ok3 = (top10, owner) => [
    ...(owner ? [['info', 'Note', `Has an active owner (${owner}) who can call owner-only functions.`]] : [['ok', 'Good sign', 'Ownership is renounced: no owner can call owner-only functions.']]),
    ['info', 'Note', 'Some top holders are contracts (often the liquidity pool or a locker). Check which ones on the explorer.'],
    ['ok', 'Good sign', `Supply is fairly spread out: the top 10 holders own ${top10}.`],
  ];
  const TOKENS = [
    { sym: 'TIDE', name: 'Tidal', ca: '0x4f2A9c7E81b3D05a6F1e2C3b4A5d6E7f8A91c19E', mc: '$1.42B', verdict: 'No red flags found', v: 'low', bad: 0,
      stats: [['Holders', '184,302'], ['Top 10 hold', '23.1%'], ['Supply', '500M'], ['Price', '$2.84'], ['Source', 'Verified'], ['Owner', 'Renounced']], flags: ok3('23.1%') },
    { sym: 'LUMN', name: 'Lumen', ca: '0x8B1c4E2f9A7d3C6b5E0a1F2d3C4b5A6e7D8f2a7C', mc: '$864M', verdict: 'No red flags found', v: 'low', bad: 0,
      stats: [['Holders', '97,551'], ['Top 10 hold', '31.4%'], ['Supply', '2B'], ['Price', '$0.432'], ['Source', 'Verified'], ['Owner', 'Renounced']], flags: ok3('31.4%') },
    { sym: 'NSTR', name: 'Northstar', ca: '0x2d7E5a1B9c3F8e4D6a0b7C1e2F3d4A5b6C7e5B3d', mc: '$512M', verdict: 'No red flags found', v: 'low', bad: 0,
      stats: [['Holders', '61,208'], ['Top 10 hold', '36.8%'], ['Supply', '100M'], ['Price', '$5.12'], ['Source', 'Verified'], ['Owner', '0x7cA1…e94F']], flags: ok3('36.8%', '0x7cA1…e94F') },
    { sym: 'MHI', name: 'Moon Hood Inu', ca: '0x9F3c6B2e8A1d4C7f5E0b9A2c3D4e5F6a7B8c41aB', mc: 'Launched 6h ago', verdict: '3 red flags', v: 'high', bad: 3,
      stats: [['Holders', '212'], ['Top 10 hold', '64.2%'], ['Supply', '1T'], ['Price', '$0.0000003'], ['Source', 'Not verified'], ['Owner', '0x9f3c…41aB']],
      flags: [
        ['high', 'High risk', 'Source code is not verified on the explorer, so nobody can check what the contract does.'],
        ['high', 'High risk', 'Has a mint function: new tokens can be created, diluting holders.'],
        ['high', 'High risk', 'One wallet holds 31.2% of supply.'],
        ['medium', 'Caution', 'The top 10 holders own 64.2% of supply.'],
        ['medium', 'Caution', 'Only 212 holders so far.'],
        ['info', 'Note', 'Has an active owner (0x9f3c…41aB) who can call owner-only functions.'],
      ] },
  ];
  const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  const card = (k) => `<div class="tcard v-${k.v}"><div class="tcard-hd"><div><div class="tcard-k">Token Safety Check · Robinhood Chain</div><div class="tcard-t">${k.name} (${k.sym})</div><div class="tcard-a"><span class="mono">${short(k.ca)}</span><button class="mact">Copy</button><a class="mact">Explorer ↗</a></div></div><span class="tbadge b-${k.v}">${k.verdict}</span></div><div class="tstats">${k.stats.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('')}</div><ul class="tflags">${k.flags.map(([l, n, x]) => `<li class="f-${l}"><i aria-hidden="true"></i><span><em>${n}</em> ${x}</span></li>`).join('')}</ul><div class="tcard-ft">Automatic checks of public data on Robinhood Chain. They can miss honeypots, liquidity pulls and other tricks. Not financial advice.</div></div>`;
  const ACTIONS = '<div class="scan-actions"><a class="btn btn-dark">Ask Noxsea AI about this token</a><button class="btn btn-light">Copy link to this scan</button></div>';
  const RISKY = TOKENS[3];
  const Q = `Check this token on Robinhood Chain for red flags: ${RISKY.ca}`;
  const ANS = [
    { t: 'p', b: 'Three red flags.', x: "The source code isn't verified, so nobody can check what the contract really does. The owner can still mint new tokens, and one wallet holds 31.2% of the supply." },
    { t: 'p', b: 'Before you buy:', x: '' },
    { t: 'ol', b: 'Ask why the code is unverified.', x: 'Serious teams verify on day one.' },
    { t: 'ol', b: 'Find out who holds 31.2%.', x: 'If it is the deployer, one sale can wipe out the price.' },
    { t: 'ol', b: 'Treat the mint function as live risk', x: 'while the owner is active.' },
    { t: 'p', x: 'Not financial advice.' },
  ];

  const ov = document.createElement('div');
  ov.id = 'ov';
  ov.innerHTML = `
    <div class="hook" id="h1"><div>Every token<br>looks safe.</div></div>
    <div class="hook" id="h2"><div>Until you<br><span class="grad">scan it.</span></div></div>
    <div id="wcap"><span class="grad">Token Scanner</span> <span class="dim">· Robinhood Chain and more</span></div>
    <div id="cap"><div class="n"></div><div class="t"></div><div class="s"></div></div>
    <div id="rail">${TOKENS.map((k) => `<div class="ri${k.bad ? ' bad' : ''}">${LOGO[k.sym]}<div class="nm"><b>${k.name}</b><small>${k.sym} · ${k.mc}</small></div><span class="pill ${k.bad ? 'bad' : 'ok'}">${k.bad ? `${k.bad} red flags` : 'No red flags'}</span></div>`).join('')}</div>
    <div id="pchip"></div>
    <div id="flash"></div>
    <svg id="cur" viewBox="0 0 24 24"><path d="M5 3l14 7.5-6.2 1.7L10 18.5z" fill="#fff" stroke="#0A0E30" stroke-width="1.4"/></svg>
    <div id="ring"></div>
    <div id="endc">
      <svg class="lg" viewBox="0 0 64 64"><use href="#mk"/></svg>
      <div class="k">Noxsea Token Scanner</div>
      <div class="logos">${TOKENS.map((k) => `<span class="lgi${k.bad ? ' bad' : ''}">${LOGO[k.sym].replace(/id="lg(\w)"/, 'id="lgE$1"').replace(/url\(#lg(\w)\)/, 'url(#lgE$1)')}<i>${k.bad ? '✕' : '✓'}</i></span>`).join('')}</div>
      <h2>Know the difference<br><span class="grad">in seconds.</span></h2>
      <div class="adcta">noxsea.xyz/scan</div>
      <div class="fine">Free · No wallet needed · Robinhood Chain, Solana, Base, Ethereum and more<br>Demo tokens shown · Not financial advice</div>
    </div>
    <div id="fade"></div>`;
  document.body.appendChild(ov);

  /* ---------- scanner page ---------- */
  const sDoc = S.scrollingElement;
  const hdr = $('#hdr', S);
  const chipsS = [...S.querySelectorAll('.scan-chains button')];
  const rhChip = chipsS.find((b) => b.textContent.trim() === 'Robinhood');
  const autoChip = chipsS[0];
  const sInput = $('.scan-form input', S);
  const sBtn = $('.scan-form button[type=submit]', S);
  const sWrap = $('.scan-result .wrap', S);
  const rcS = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 + sDoc.scrollTop, r, top: r.top + sDoc.scrollTop, bottom: r.bottom + sDoc.scrollTop }; };
  sWrap.innerHTML = card(RISKY) + ACTIONS;
  const PS = { chips: rcS($('.scan-chains', S)), form: rcS($('.scan-form', S)), card: rcS($('.tcard', S)), ask: rcS($('.scan-actions .btn-dark', S)) };
  sWrap.innerHTML = '';
  const SCR = Math.round(PS.form.top - 120); // form near the top, cards below it

  // Each scan: [paste chip flies in at T, input filled T+.6, click Scan T+.9, card T+1.5]
  const T = [9.6, 12.3, 14.8, 17.3];
  const CHIP_ON = 8.9;
  const cycle = (t, off) => { let k = -1; T.forEach((x, i) => { if (t >= x + off) k = i; }); return k; };
  let lastS = null;
  function scanner(t) {
    const rh = t >= CHIP_ON + 0.4;
    chipsS.forEach((b) => {
      const on = (b === rhChip && rh) || (b === autoChip && !rh);
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    const kIn = cycle(t, 0.6), kCard = cycle(t, 1.5), kClick = cycle(t, 0.9);
    sInput.value = kIn >= 0 ? TOKENS[kIn].ca : '';
    const g = kIn >= 0 ? P(t, T[kIn] + 0.6, T[kIn] + 0.7) * (1 - P(t, T[kIn] + 0.9, T[kIn] + 1.4)) : 0;
    $('.scan-form', S).style.boxShadow = g ? `0 0 0 ${3 * g}px rgba(139,124,255,.55), 0 0 60px rgba(139,124,255,${0.45 * g})` : '';
    const loading = kClick >= 0 && kClick > kCard;
    sBtn.textContent = loading ? 'Scanning…' : 'Scan';
    sBtn.disabled = loading;
    const state = loading ? `load${kClick}` : kCard >= 0 ? `card${kCard}` : 'idle';
    if (state !== lastS) {
      sWrap.innerHTML = loading ? '<div class="scan-loading glass"><span class="shim">Reading the token on Robinhood Chain…</span></div>' : kCard >= 0 ? card(TOKENS[kCard]) + (kCard === 3 ? ACTIONS : '') : '';
      lastS = state;
    }
    if (kCard >= 0 && !loading) {
      const t0 = T[kCard] + 1.5;
      const c = $('.tcard', S);
      const k = E.expo(P(t, t0, t0 + 0.55));
      c.style.opacity = String(k);
      c.style.transform = `translateY(${(1 - k) * 34}px) scale(${0.97 + 0.03 * k})`;
      if (kCard === 3) c.style.boxShadow = `0 0 ${80 * P(t, t0, t0 + 0.6)}px -10px rgba(255,107,122,.5)`;
      S.querySelectorAll('.tstats > div').forEach((d, i) => {
        const q = E.out(P(t, t0 + 0.1 + i * 0.05, t0 + 0.45 + i * 0.05));
        d.style.opacity = String(q);
        d.style.transform = `translateY(${(1 - q) * 10}px)`;
      });
      const badge = $('.tbadge', S);
      const bq = E.back(P(t, t0 + 0.4, t0 + 0.8));
      badge.style.transform = `scale(${0.4 + 0.6 * bq})`;
      badge.style.opacity = String(P(t, t0 + 0.4, t0 + 0.5));
      S.querySelectorAll('.tflags li').forEach((li, i) => {
        const q = E.out(P(t, t0 + 0.35 + i * 0.1, t0 + 0.75 + i * 0.1));
        li.style.opacity = String(q);
        li.style.transform = `translateX(${(1 - q) * -16}px)`;
        const hl = kCard === 3 && i < 3 ? P(t, 19.5 + i * 0.22, 19.8 + i * 0.22) * (1 - P(t, 21.9, 22.3)) : 0;
        li.style.background = hl ? `rgba(255,107,122,${0.13 * hl})` : '';
        li.style.boxShadow = hl ? `0 0 0 1px rgba(255,107,122,${0.35 * hl})` : '';
        li.style.borderRadius = '10px';
        li.style.margin = '0 -10px';
        li.style.padding = '5px 10px';
      });
      $('.tcard-ft', S).style.opacity = String(P(t, t0 + 0.9, t0 + 1.2));
      const act = $('.scan-actions', S);
      if (act) {
        act.style.opacity = String(E.out(P(t, t0 + 1.0, t0 + 1.5)));
        const ask = $('.btn-dark', act);
        const press = P(t, 22.45, 22.55) * (1 - P(t, 22.6, 22.8));
        const pulse = P(t, 21.7, 22.1);
        ask.style.transform = `scale(${1 - 0.04 * press})`;
        ask.style.boxShadow = pulse ? `0 0 0 ${4 * pulse}px rgba(139,124,255,.35), 0 18px 50px -12px rgba(91,108,255,${0.9 * pulse})` : '';
      }
    }
    const sc = E.io(P(t, 10.4, 11.2)) * SCR;
    sDoc.scrollTop = sc;
    hdr.classList.toggle('scrolled', sc > 8);
  }

  /* ---------- app ---------- */
  const thread = $('.thread', A);
  const threadIn = $('.thread-in', A);
  const ta = $('.composer textarea', A);
  const composer = $('.composer', A);
  const send = $('.send', A);
  const balEls = [$('.bal span', A), $('.wallet-card b', A)];
  const SUGGEST = threadIn.innerHTML;
  const rcA = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r }; };
  const PA = { composer: rcA(composer), tin: rcA(threadIn) };
  const IC = '<div class="ic"><svg aria-hidden="true"><use href="#mk"></use></svg></div>';
  const SPARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z"></path><path d="M9 12l2 2 4-4"></path></svg>';
  const you = (t) => `<div class="m you" style="white-space:pre-wrap">${esc(t)}</div>`;
  const meta = (model, cr) =>
    `<div class="meta"><span>${model}</span><span>${cr} credits</span><span class="ok"><svg aria-hidden="true"><use href="#shield"></use></svg>Not logged</span><button class="mact">Copy</button><button class="mact">Regenerate</button></div>`;
  const tool = (txt) => `<div class="toolrun">${SPARK}<span class="shim">${txt}</span></div>`;
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
      const inner = (bPart ? `<strong>${esc(bPart)}</strong>${rest ? ' ' : ''}` : '') + esc(rest);
      const listTag = bl.t === 'ol' ? 'ol' : null;
      if (list && list.tag !== listTag) { out.push(`<${list.tag}>${list.items.join('')}</${list.tag}>`); list = null; }
      if (listTag) (list ||= { tag: listTag, items: [] }).items.push(`<li>${inner}</li>`);
      else out.push(`<p>${inner}</p>`);
      if (take < words.length) { done = false; break; }
    }
    if (list) out.push(`<${list.tag}>${list.items.join('')}</${list.tag}>`);
    return { html: `<div class="md">${out.join('')}</div>`, done };
  }
  function setTa(text) {
    if (ta.value !== text) ta.value = text;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }
  function setBal(v) { balEls[0].textContent = v; balEls[1].firstChild.textContent = v + ' '; }
  let lastThread = null, chatCard = null;
  function setThread(html) {
    if (html !== lastThread) { threadIn.innerHTML = html; lastThread = html; chatCard = $('.tcard', threadIn); }
    thread.scrollTop = thread.scrollHeight;
  }
  const W0 = 22.75, W1 = 23.75; // whip pan scanner -> app
  const SEND = 24.95, TOOL_END = 26.05, ANS0 = 26.95;
  function app(t) {
    let html = SUGGEST, text = '', bal = '24.83';
    if (t >= W0 - 0.05 && t < SEND) text = Q;
    if (t >= SEND) {
      const r = md(ANS, Math.max(0, (t - ANS0) * 23));
      const ans = t < ANS0 ? '' : `<div>${r.html}${r.done ? '' : '<span class="caret"></span>'}</div>${r.done ? meta('DeepSeek V3.1', '0.06') : ''}`;
      const wait = t < SEND + 0.45 ? '<span class="shim" style="font-size:14px">Answering privately…</span>' : '';
      const tl = t >= SEND + 0.45 && t < TOOL_END ? tool('Checking on-chain data on Robinhood Chain…') : '';
      html = you(Q) + `<div class="m ai">${IC}<div class="b">${wait}${tl}${t >= TOOL_END ? card(RISKY) : ''}${ans}</div></div>`;
      if (r.done && t > 31.4) bal = '24.77';
    }
    setThread(html);
    if (chatCard) {
      const k = E.expo(P(t, TOOL_END, TOOL_END + 0.6));
      chatCard.style.opacity = String(k);
      chatCard.style.transform = `translateY(${(1 - k) * 24}px)`;
    }
    setTa(text);
    setBal(bal);
    send.disabled = !text;
    const pf = P(t, W0, W0 + 0.2) * (1 - P(t, SEND - 1.0, SEND - 0.3));
    composer.style.boxShadow = pf ? `0 0 0 ${2 * pf}px rgba(179,168,255,.6), 0 0 50px rgba(139,124,255,${0.4 * pf})` : '';
  }

  /* ---------- cameras ---------- */
  const formC = { x: 960, y: (PS.chips.y + PS.form.y) / 2 };
  const shiftX = (s, screenX) => 960 - (screenX - 960) / s;
  const viewY = (PS.form.top - SCR + PS.card.bottom - SCR) / 2 - 10; // form + tallest card
  const askVy = PS.ask.y - SCR;
  const KS = [
    [5.0, 960, 540, 0.74, 1],
    [7.5, 960, 540, 0.74, 1],
    [8.4, shiftX(1.42, 1225), formC.y, 1.42, 0],
    [10.3, shiftX(1.42, 1225), formC.y, 1.42, 0],
    [11.2, shiftX(1.2, 1225), viewY, 1.2, 0],
    [19.2, shiftX(1.2, 1225), viewY, 1.2, 0],
    [19.9, shiftX(1.28, 1240), viewY + 70, 1.28, 0],
    [21.4, shiftX(1.28, 1240), viewY + 70, 1.28, 0],
    [22.2, shiftX(1.36, 1240), askVy - 240, 1.36, 0],
    [24.0, shiftX(1.36, 1240), askVy - 240, 1.36, 0],
  ];
  const TX = (sc, screenX = 1200) => PA.tin.x - (screenX - 960) / sc;
  const KA = [
    [22.6, PA.composer.x, 1080, 1.75, 0],
    [SEND + 0.05, PA.composer.x, 1080, 1.75, 0],
    [SEND + 0.85, TX(1.42), 330, 1.42, 0],
    [30.5, TX(1.42), 330, 1.42, 0],
    [31.5, TX(1.5), 470, 1.5, 0],
    [34.7, TX(1.5), 470, 1.5, 0],
    [35.8, 960, 540, 0.74, 1],
  ];
  const at = (keys, t) => {
    let k0 = keys[0], k1 = keys[0];
    for (let i = 0; i < keys.length; i++) if (keys[i][0] <= t) { k0 = keys[i]; k1 = keys[i + 1] ?? keys[i]; }
    const x = k1 === k0 ? 1 : E.io(P(t, k0[0], k1[0]));
    return { cx: lerp(k0[1], k1[1], x), cy: lerp(k0[2], k1[2], x), s: lerp(k0[3], k1[3], x), w: lerp(k0[4], k1[4], x) };
  };
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
    const w = E.io(P(t, W0, W1));
    const mb = Math.sin(Math.PI * P(t, W0, W1)) * 14;
    const cs = at(KS, t);
    const enter = E.expo(P(t, 5.0, 6.3));
    place(camS, cs, { dx: -w * 2300, dy: (1 - enter) * 90 + Math.sin(t * 0.5) * 4 * cs.w, op: t > W1 + 0.05 ? 0 : enter, rx: cs.w * (6 * (1 - enter) + 2), blur: mb });
    const ca = at(KA, t);
    const leave = E.io(P(t, 35.7, 36.4));
    place(camA, ca, { dx: (1 - w) * 2300, dy: Math.sin(t * 0.5) * 4 * ca.w, op: t < W0 ? 0 : 1 - leave, rx: ca.w * 2 * (1 - leave), blur: mb, extraScale: 1 - leave * 0.06 });
  }

  /* ---------- cursor + paste chip ---------- */
  const toScreen = (frame, x, y) => { const r = frame.getBoundingClientRect(); return [r.left + (x * r.width) / 1920, r.top + (y * r.height) / 1080]; };
  const centerIn = (frame, el) => { const r = el.getBoundingClientRect(); return toScreen(frame, r.left + r.width / 2, r.top + r.height / 2); };
  const CLICKS = [
    [8.5, CHIP_ON + 0.4, () => centerIn(fS, rhChip)],
    ...T.map((x) => [x + 0.35, x + 0.9, () => centerIn(fS, sBtn)]),
    [21.7, 22.5, () => { const el = $('.scan-actions .btn-dark', S); return el ? centerIn(fS, el) : null; }],
    [24.3, SEND, () => centerIn(fA, send)],
  ];
  function cursor(t) {
    const cur = $('#cur'), ring = $('#ring');
    const vis = (t > 8.3 && t < 22.8) || (t > 23.9 && t < 26.0);
    cur.style.opacity = vis ? '1' : '0';
    if (!vis) { ring.style.opacity = '0'; return; }
    let prev = t < 23 ? [1500, 1000] : [1300, 760], pos = prev, clickK = -1;
    for (const [ms, ct, get] of CLICKS) {
      if ((t < 23 && ms > 23) || (t >= 23 && ms < 23)) continue;
      const target = get() ?? prev;
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
  const pchip = $('#pchip');
  let lastChip = -1;
  function pasteChip(t) {
    const k = T.findIndex((x) => t >= x - 0.1 && t < x + 0.75);
    if (k < 0) { pchip.style.opacity = '0'; return; }
    if (k !== lastChip) { const tk = TOKENS[k]; pchip.innerHTML = `${LOGO[tk.sym]}<b>${tk.name}</b><span>${short(tk.ca)}</span>`; lastChip = k; }
    const r = sInput.getBoundingClientRect();
    const [ix, iy] = toScreen(fS, r.left + 40, r.top + r.height / 2);
    const m = E.io(P(t, T[k], T[k] + 0.6));
    const x = lerp(1380, ix, m), y = lerp(iy + 260, iy - 34, m);
    const sc = lerp(1.5, 0.95, m);
    pchip.style.opacity = String(P(t, T[k] - 0.1, T[k] + 0.1) * (1 - P(t, T[k] + 0.55, T[k] + 0.72)));
    pchip.style.transform = `translate(${x}px, ${y}px) scale(${sc}) rotate(${(1 - m) * -4}deg)`;
  }

  /* ---------- overlay text ---------- */
  const CAPS = [
    { a: 8.0, b: 11.8, n: '01', t: 'Scan any token', s: 'Robinhood Chain, Solana, Base, Ethereum and more. No wallet needed.' },
    { a: 12.2, b: 17.1, n: '02', t: 'Know what you hold', s: 'Owner, mint powers, holders and verified code, in seconds.' },
    { a: 17.6, b: 22.4, n: '03', t: 'Spot the red flags', s: 'Before you buy, not after.' },
    { a: 23.9, b: 26.4, n: '04', t: 'Ask Noxsea AI', s: 'One click. The question is ready.' },
    { a: 26.8, b: 30.9, n: '05', t: 'Every flag, explained', s: 'In plain words, with what to check next.' },
    { a: 31.4, b: 35.4, n: '06', t: 'Private by default', s: 'No prompt logs. Lookups leave from our servers, so your IP stays hidden.' },
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
    hook($('#h1'), t, 0.35, 2.55);
    hook($('#h2'), t, 2.65, 4.95);
    rise($('#wcap'), t, 5.4, 7.8, 20);
    const cap = $('#cap');
    const c = CAPS.find((x) => t >= x.a - 0.1 && t <= x.b + 0.1);
    if (c) {
      $('.n', cap).textContent = c.n;
      $('.t', cap).textContent = c.t;
      $('.s', cap).textContent = c.s;
      rise(cap, t, c.a, c.b, 24);
    } else cap.style.opacity = '0';
    // Rail: one row per scanned token, landing as its verdict appears.
    const railOut = E.io(P(t, 22.3, 22.8));
    [...document.querySelectorAll('#rail .ri')].forEach((el, i) => {
      const k = E.expo(P(t, T[i] + 1.9, T[i] + 2.5));
      el.style.opacity = String(k * (1 - railOut));
      el.style.transform = `translateX(${(1 - k) * -40 - railOut * 30}px)`;
    });
    $('#flash').style.opacity = String(0.9 * Math.max(Math.sin(Math.PI * P(t, W0 + 0.15, W0 + 0.85)), 0.7 * Math.sin(Math.PI * P(t, T[3] + 1.45, T[3] + 1.9))));
    rise($('#endc'), t, 36.2, 99, 30);
    document.querySelectorAll('#endc .lgi').forEach((el, i) => {
      const q = E.back(P(t, 36.9 + i * 0.12, 37.4 + i * 0.12));
      el.style.opacity = String(P(t, 36.9 + i * 0.12, 37.05 + i * 0.12));
      el.style.transform = `scale(${0.3 + 0.7 * q})`;
    });
    $('#endc .lg').style.transform = `scale(${0.6 + 0.4 * E.expo(P(t, 36.1, 37.2))})`;
    $('#fade').style.opacity = String(Math.max(1 - P(t, 0, 0.45), P(t, 40.1, 41)));
    bg.querySelector('.a1').style.transform = `translate(${Math.sin(t * 0.22) * 120}px, ${Math.cos(t * 0.18) * 70}px)`;
    bg.querySelector('.a2').style.transform = `translate(${Math.cos(t * 0.2) * 140}px, ${Math.sin(t * 0.25) * 80}px)`;
    bg.querySelector('.a3').style.transform = `translate(${Math.sin(t * 0.3 + 1) * 160}px, ${Math.cos(t * 0.26) * 60}px)`;
    bg.querySelector('.grid').style.transform = `translateY(${(t * 14) % 80}px)`;
  }

  window.render = (t) => {
    scanner(t);
    app(t);
    cameras(t);
    cursor(t);
    pasteChip(t);
    overlay(t);
    for (const d of [document, S, A]) d.getAnimations().forEach((an) => { try { an.pause(); an.currentTime = (t * 1000) % 100000; } catch {} });
  };
  window.render(0);
})();
