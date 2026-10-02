// End-to-end: a scripted EIP-1193/EIP-6963 wallet (signing in Node with a throwaway key) drives the real app.
import { chromium } from 'playwright';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3300';
const OUT = process.argv[2];
const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const CHAIN = Number(process.env.CHAIN_ID ?? 4663);
const log = (...a) => console.log('•', ...a);

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1360, height: 860 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));

let rejectNext = process.env.REJECT_FIRST === '1';
await page.exposeFunction('__sign', async (msg) => {
  if (rejectNext) { rejectNext = false; return { reject: true }; }
  return { sig: await account.signMessage({ message: msg.startsWith('0x') ? { raw: msg } : msg }) };
});
await page.addInitScript(({ address, chainId }) => {
  let chain = chainId;
  const listeners = {};
  const provider = {
    isMetaMask: true,
    request: async ({ method, params }) => {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [address];
      if (method === 'eth_chainId') return '0x' + chain.toString(16);
      if (method === 'net_version') return String(chain);
      if (method === 'personal_sign') {
        const r = await window.__sign(params[0]);
        if (r.reject) { const e = new Error('User rejected the request.'); e.code = 4001; throw e; }
        return r.sig;
      }
      if (method === 'wallet_switchEthereumChain') { chain = parseInt(params[0].chainId, 16); (listeners.chainChanged || []).forEach((f) => f(params[0].chainId)); return null; }
      if (method === 'wallet_requestPermissions') return [{ parentCapability: 'eth_accounts' }];
      if (method === 'wallet_getPermissions') return [{ parentCapability: 'eth_accounts' }];
      throw Object.assign(new Error('unsupported ' + method), { code: 4200 });
    },
    on: (e, f) => ((listeners[e] ||= []).push(f), provider),
    removeListener: (e, f) => { listeners[e] = (listeners[e] || []).filter((x) => x !== f); return provider; },
  };
  window.ethereum = provider;
  const info = { uuid: '11111111-1111-4111-8111-111111111111', name: 'MetaMask', icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>', rdns: 'io.metamask' };
  const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info, provider }) }));
  window.addEventListener('eip6963:requestProvider', announce);
  announce();
}, { address: account.address, chainId: CHAIN });
import fs from 'node:fs';
const clean = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<link[^>]+as="script"[^>]*>/gi, '');
await page.setViewportSize({ width: 1920, height: 1080 });
await page.goto(BASE + '/app', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Connect wallet' }).first().click();
await page.getByRole('button', { name: /MetaMask/ }).click();
await page.locator('.feats').waitFor({ timeout: 15000 });
await page.getByRole('button', { name: 'Hide' }).click().catch(() => {});
await page.waitForTimeout(4500);
await page.evaluate(() => document.querySelectorAll('.m.note, .toast').forEach((n) => n.remove()));
fs.writeFileSync(`${OUT}/app.html`, clean(await page.content()));
await page.screenshot({ path: `${OUT}/app-real.png` });
log('errors', errors.filter((e) => !e.includes('401')));
await b.close();
