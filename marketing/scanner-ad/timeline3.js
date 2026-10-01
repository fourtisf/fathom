/* Noxsea Token Scanner ad: the real /scan page and /app (captured DOM + real CSS in two iframes), driven frame by frame. */
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
  window.DURATION = 36;

  const S = document.getElementById('fS').contentDocument;
  const A = document.getElementById('fA').contentDocument;
  const camS = document.getElementById('camS'), camA = document.getElementById('camA');
  const $ = (s, r = document) => r.querySelector(s);
  const bg = $('#adbg');
  bg.insertAdjacentHTML('beforeend', '<div class="grid"></div>');

  const ov = document.createElement('div');
  ov.id = 'ov';
  ov.innerHTML = `
    <div class="hook" id="h1"><div>Found a new token?</div></div>
    <div class="hook" id="h2"><div><span class="grad">Scan it</span> before<br>you buy.</div></div>
    <div id="wcap"><span class="grad">Token Scanner</span> <span class="dim">· free, no wallet needed</span></div>
    <div id="cap"><div class="n"></div><div class="t"></div><div class="s"></div></div>
    <div id="flash"></div>
    <svg id="cur" viewBox="0 0 24 24"><path d="M5 3l14 7.5-6.2 1.7L10 18.5z" fill="#fff" stroke="#0A0E30" stroke-width="1.4"/></svg>
    <div id="ring"></div>
    <div id="endc">
      <svg class="lg" viewBox="0 0 64 64"><use href="#mk"/></svg>
      <div class="k">Noxsea Token Scanner</div>
      <h2>Scan it<br><span class="grad">before you buy.</span></h2>
      <div class="adcta">noxsea.xyz/scan</div>
      <div class="fine">Free · No wallet needed · Solana, Base, Ethereum, BNB and more · Not financial advice</div>
    </div>
    <div id="fade"></div>`;
  document.body.appendChild(ov);

  /* ---------- content ---------- */
  const CA = 'DSCat7vQm2kPz9Xw4LhNc8RtYb3Ja6sDe5UfGq1Hpump';
  const CA_SHORT = 'DSCat7…pump';
  const FLAGS = [
    ['high', 'High risk', 'Freeze authority is active (8xKd…3vQa): your tokens could be frozen so you cannot sell.'],
    ['high', 'High risk', 'One wallet holds 18.4% of supply.'],
    ['medium', 'Caution', 'Low liquidity ($21,480). Large sells will move the price a lot.'],
    ['medium', 'Caution', 'The main pool was created 5 hours ago. Brand-new tokens are the riskiest.'],
    ['medium', 'Caution', 'The top 10 holders own 46.2% of supply.'],
    ['ok', 'Good sign', 'Mint authority is renounced: no new tokens can be created.'],
  ];
  const STATS = [['Top 10 hold', '46.2%'], ['Supply', '1B'], ['Price', '$0.000214'], ['Liquidity', '$21.48K'], ['Mint authority', 'Renounced'], ['Freeze authority', 'Active']];
  const CARD = `<div class="tcard v-high"><div class="tcard-hd"><div><div class="tcard-k">Token Safety Check · Solana</div><div class="tcard-t">Deep Sea Cat (DSCAT)</div><div class="tcard-a"><span class="mono">${CA_SHORT}</span><button class="mact">Copy</button><a class="mact">Explorer ↗</a><a class="mact">Chart ↗</a></div></div><span class="tbadge b-high">2 red flags</span></div><div class="tstats">${STATS.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div><ul class="tflags">${FLAGS.map(([l, n, x]) => `<li class="f-${l}"><i aria-hidden="true"></i><span><em>${n}</em> ${x}</span></li>`).join('')}</ul><div class="tcard-ft">Read directly from Solana, with market data from DexScreener. They can miss honeypots, liquidity pulls and other tricks. Not financial advice.</div></div>`;
  const ACTIONS = '<div class="scan-actions"><a class="btn btn-dark">Ask Noxsea AI about this token</a><button class="btn btn-light">Copy link to this scan</button></div>';
  const Q = `Check this token on Solana for red flags: ${CA}`;
  const ANS = [
    { t: 'p', b: 'Two red flags here.', x: 'The freeze authority is still active, so whoever holds it could freeze your tokens and stop you from selling. And one wallet holds 18.4% of the supply, enough to crash the price in a single sale.' },
    { t: 'p', b: 'Before you buy:', x: '' },
    { t: 'ol', b: 'Watch the freeze authority.', x: 'If it never gets revoked, treat that as a hard no.' },
    { t: 'ol', b: 'Look up the 18.4% wallet', x: 'on Solscan: is it the dev, the team or an exchange?' },
    { t: 'ol', b: 'Keep it small.', x: '$21K of liquidity and a 5-hour-old pool mean big price swings.' },
    { t: 'p', x: 'Not financial advice.' },
  ];

  /* ---------- scanner page ---------- */
  const sDoc = S.scrollingElement;
  const hdr = $('#hdr', S);
  const chipsS = [...S.querySelectorAll('.scan-chains button')];
  const solChip = chipsS.find((b) => b.textContent.trim() === 'Solana');
  const autoChip = chipsS[0];
  const sInput = $('.scan-form input', S);
  const sBtn = $('.scan-form button[type=submit]', S);
  const sWrap = $('.scan-result .wrap', S);
  const rcS = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 + sDoc.scrollTop, r }; };
  // Measure the result layout once, then clear it.
  sWrap.innerHTML = CARD + ACTIONS;
  const PS = { chips: rcS($('.scan-chains', S)), form: rcS($('.scan-form', S)), card: rcS($('.tcard', S)), ask: rcS($('.scan-actions .btn-dark', S)) };
  sWrap.innerHTML = '';
  const SCR = Math.round(PS.card.r.top + sDoc.scrollTop - 150); // scroll so the card sits near the top

  let lastS = null;
  function scanner(t) {
    const chain = t >= 9.4 ? 'sol' : 'auto';
    chipsS.forEach((b) => {
      const on = (b === solChip && chain === 'sol') || (b === autoChip && chain === 'auto');
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    sInput.value = t >= 10.25 ? CA : '';
    const glow = P(t, 10.25, 10.35) * (1 - P(t, 10.6, 11.2));
    $('.scan-form', S).style.boxShadow = glow ? `0 0 0 ${3 * glow}px rgba(139,124,255,.55), 0 0 60px rgba(139,124,255,${0.45 * glow})` : '';
    const loading = t >= 11.1 && t < 12.3;
    sBtn.textContent = loading ? 'Scanning…' : 'Scan';
    sBtn.disabled = loading;
    const state = t < 11.1 ? 'idle' : loading ? 'load' : 'card';
    if (state !== lastS) {
      sWrap.innerHTML = state === 'load' ? '<div class="scan-loading glass"><span class="shim">Reading the token on Solana…</span></div>' : state === 'card' ? CARD + ACTIONS : '';
      lastS = state;
    }
    if (state === 'card') {
      const card = $('.tcard', S);
      const k = E.expo(P(t, 12.3, 13.0));
      card.style.opacity = String(k);
      card.style.transform = `translateY(${(1 - k) * 40}px) scale(${0.97 + 0.03 * k})`;
      S.querySelectorAll('.tstats > div').forEach((d, i) => {
        const q = E.out(P(t, 12.45 + i * 0.07, 12.85 + i * 0.07));
        d.style.opacity = String(q);
        d.style.transform = `translateY(${(1 - q) * 12}px)`;
      });
      const badge = $('.tbadge', S);
      const bq = E.back(P(t, 12.9, 13.35));
      badge.style.transform = `scale(${0.4 + 0.6 * bq})`;
      badge.style.opacity = String(P(t, 12.9, 13.05));
      S.querySelectorAll('.tflags li').forEach((li, i) => {
        const q = E.out(P(t, 12.75 + i * 0.13, 13.2 + i * 0.13));
        li.style.opacity = String(q);
        li.style.transform = `translateX(${(1 - q) * -18}px)`;
        // Spotlight the two red flags.
        const hl = i < 2 ? P(t, 14.3 + i * 0.25, 14.6 + i * 0.25) * (1 - P(t, 16.4, 16.9)) : 0;
        li.style.background = hl ? `rgba(255,107,122,${0.13 * hl})` : '';
        li.style.boxShadow = hl ? `0 0 0 1px rgba(255,107,122,${0.35 * hl})` : '';
        li.style.borderRadius = '10px';
        li.style.margin = '0 -10px';
        li.style.padding = '6px 10px';
      });
      const ft = $('.tcard-ft', S);
      ft.style.opacity = String(P(t, 13.4, 13.8));
      const act = $('.scan-actions', S);
      act.style.opacity = String(E.out(P(t, 13.5, 14.0)));
      const ask = $('.scan-actions .btn-dark', S);
      const press = P(t, 17.45, 17.55) * (1 - P(t, 17.6, 17.8));
      const pulse = P(t, 16.6, 17.0);
      ask.style.transform = `scale(${1 - 0.04 * press})`;
      ask.style.boxShadow = pulse ? `0 0 0 ${4 * pulse}px rgba(139,124,255,.35), 0 18px 50px -12px rgba(91,108,255,${0.9 * pulse})` : '';
    }
    const sc = E.io(P(t, 11.5, 12.6)) * SCR;
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
  const tool = (txt, running) => `<div class="toolrun">${SPARK}<span${running ? ' class="shim"' : ''}>${txt}</span></div>`;
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
      const listTag = bl.t === 'ol' ? 'ol' : bl.t === 'ul' ? 'ul' : null;
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
  const SEND = 19.9;
  function app(t) {
    let html = SUGGEST, text = '', bal = '24.83';
    if (t >= 17.7 && t < SEND) text = Q;
    if (t >= SEND) {
      const running = t < 21.0;
      const tl = running ? tool('Checking on-chain data on Solana…', true) : '';
      const card = t >= 21.0 ? CARD : '';
      const r = md(ANS, Math.max(0, (t - 21.9) * 23));
      const ans = t < 21.9 ? '' : `<div>${r.html}${r.done ? '' : '<span class="caret"></span>'}</div>${r.done ? meta('DeepSeek V3.1', '0.06') : ''}`;
      const wait = t < 20.35 ? '<span class="shim" style="font-size:14px">Answering privately…</span>' : '';
      html = you(Q) + `<div class="m ai">${IC}<div class="b">${wait}${t >= 20.35 ? tl : ''}${card}${ans}</div></div>`;
      if (r.done && t > 26.4) bal = '24.77';
    }
    setThread(html);
    if (chatCard) {
      const k = E.expo(P(t, 21.0, 21.6));
      chatCard.style.opacity = String(k);
      chatCard.style.transform = `translateY(${(1 - k) * 24}px)`;
    }
    setTa(text);
    setBal(bal);
    send.disabled = !text;
    const pf = P(t, 17.75, 17.95) * (1 - P(t, 18.9, 19.6));
    composer.style.boxShadow = pf ? `0 0 0 ${2 * pf}px rgba(179,168,255,.6), 0 0 50px rgba(139,124,255,${0.4 * pf})` : '';
  }

  /* ---------- cameras ---------- */
  // Keys: [t, center x, center y (viewport px of that page), scale, floating-window amount]
  const formC = { x: 960, y: (PS.chips.y + PS.form.y) / 2 };
  const shiftX = (s, screenX) => 960 - (screenX - 960) / s; // camera center so the page center lands at screenX
  const cardVy = PS.card.y - SCR, askVy = PS.ask.y - SCR;
  const KS = [
    [5.0, 960, 540, 0.74, 1],
    [7.6, 960, 540, 0.74, 1],
    [8.6, shiftX(1.42, 1225), formC.y, 1.42, 0],
    [11.3, shiftX(1.42, 1225), formC.y, 1.42, 0],
    [12.5, shiftX(1.3, 1240), cardVy + 10, 1.3, 0],
    [16.2, shiftX(1.34, 1240), cardVy + 4, 1.34, 0],
    [17.3, shiftX(1.38, 1240), askVy - 230, 1.38, 0],
    [19.0, shiftX(1.38, 1240), askVy - 230, 1.38, 0],
  ];
  const TX = (sc, screenX = 1200) => PA.tin.x - (screenX - 960) / sc;
  const KA = [
    [17.6, PA.composer.x, 1080, 1.75, 0],
    [19.95, PA.composer.x, 1080, 1.75, 0],
    [20.75, TX(1.42), 330, 1.42, 0],
    [25.6, TX(1.42), 330, 1.42, 0],
    [26.6, TX(1.5), 470, 1.5, 0],
    [29.6, TX(1.5), 470, 1.5, 0],
    [30.7, 960, 540, 0.74, 1],
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
  // Whip pan from the scanner to the app.
  const W0 = 17.75, W1 = 18.75;
  function cameras(t) {
    const w = E.io(P(t, W0, W1));
    const mb = Math.sin(Math.PI * P(t, W0, W1)) * 14;
    const cs = at(KS, t);
    const enter = E.expo(P(t, 5.0, 6.3));
    const drift = Math.sin(t * 0.5) * 4 * cs.w;
    place(camS, cs, {
      dx: -w * 2300, dy: (1 - enter) * 90 + drift, op: t > W1 + 0.05 ? 0 : enter,
      rx: cs.w * (6 * (1 - enter) + 2), blur: mb,
    });
    const ca = at(KA, t);
    const leave = E.io(P(t, 30.6, 31.3));
    place(camA, ca, {
      dx: (1 - w) * 2300, dy: Math.sin(t * 0.5) * 4 * ca.w, op: t < W0 ? 0 : 1 - leave,
      rx: ca.w * 2 * (1 - leave), blur: mb, extraScale: 1 - leave * 0.06,
    });
  }

  /* ---------- cursor ---------- */
  const fS = document.getElementById('fS'), fA = document.getElementById('fA');
  // Map a point inside a page (iframe viewport px) to the screen through the camera transform.
  const toScreen = (frame, x, y) => { const r = frame.getBoundingClientRect(); return [r.left + (x * r.width) / 1920, r.top + (y * r.height) / 1080]; };
  const centerIn = (frame, el) => { const r = el.getBoundingClientRect(); return toScreen(frame, r.left + r.width / 2, r.top + r.height / 2); };
  const CLICKS = [
    // [move start, click time, target]
    [8.9, 9.4, () => centerIn(fS, solChip)],
    [9.6, 10.1, () => { const r = sInput.getBoundingClientRect(); return toScreen(fS, r.left + 120, r.top + r.height / 2); }],
    [10.55, 11.1, () => centerIn(fS, sBtn)],
    [16.6, 17.5, () => { const el = $('.scan-actions .btn-dark', S); return el ? centerIn(fS, el) : null; }],
    [19.3, SEND, () => centerIn(fA, send)],
  ];
  function cursor(t) {
    const cur = $('#cur'), ring = $('#ring');
    const vis = (t > 8.7 && t < 17.8) || (t > 18.9 && t < 21.0);
    cur.style.opacity = vis ? '1' : '0';
    if (!vis) { ring.style.opacity = '0'; return; }
    let prev = t < 18.9 ? [1500, 1000] : [1300, 760], pos = prev, clickK = -1;
    for (const [ms, ct, get] of CLICKS) {
      if ((t < 18 && ms > 18) || (t >= 18 && ms < 18)) continue; // each page has its own cursor path
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

  /* ---------- overlay text ---------- */
  const CAPS = [
    { a: 8.3, b: 12.0, n: '01', t: 'Paste any token', s: 'Solana, Base, Ethereum, BNB Chain and more. No wallet needed.' },
    { a: 12.9, b: 16.9, n: '02', t: 'Red flags in seconds', s: 'Mint and freeze powers, liquidity, top holders and honeypots.' },
    { a: 18.9, b: 21.6, n: '03', t: 'Ask Noxsea AI', s: 'One click. The question is ready.' },
    { a: 22.0, b: 25.7, n: '04', t: 'Every flag, explained', s: 'In plain words, with what to check next.' },
    { a: 26.2, b: 30.2, n: '05', t: 'Private by default', s: 'No prompt logs. Lookups leave from our servers, so your IP stays hidden.' },
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
    rise($('#wcap'), t, 5.4, 7.9, 20);
    const cap = $('#cap');
    const c = CAPS.find((x) => t >= x.a - 0.1 && t <= x.b + 0.1);
    if (c) {
      $('.n', cap).textContent = c.n;
      $('.t', cap).textContent = c.t;
      $('.s', cap).textContent = c.s;
      rise(cap, t, c.a, c.b, 24);
    } else cap.style.opacity = '0';
    // flash on the card reveal and the whip
    $('#flash').style.opacity = String(0.9 * Math.max(Math.sin(Math.PI * P(t, 12.25, 12.75)), Math.sin(Math.PI * P(t, 17.9, 18.6))));
    rise($('#endc'), t, 31.0, 99, 30);
    const lg = $('#endc .lg');
    lg.style.transform = `scale(${0.6 + 0.4 * E.expo(P(t, 30.9, 32.0))})`;
    $('#fade').style.opacity = String(Math.max(1 - P(t, 0, 0.45), P(t, 35.0, 35.9)));
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
    overlay(t);
    // CSS animations (shimmer, caret) follow the timeline, not the wall clock.
    for (const d of [document, S, A]) d.getAnimations().forEach((an) => { try { an.pause(); an.currentTime = (t * 1000) % 100000; } catch {} });
  };
  window.render(0);
})();
