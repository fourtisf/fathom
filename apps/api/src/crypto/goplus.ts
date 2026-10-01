import type { HolderShare, RiskFlag, TokenReport } from './blockscout';

/**
 * GoPlus token security API (public, no key needed for light use) for EVM chains without an explorer we
 * read directly: honeypot simulation, taxes, holders and source verification. Called from our server,
 * so the user's IP never reaches GoPlus. Every field is optional: anything missing is simply skipped.
 */

const TIMEOUT_MS = 8_000;
type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null);
const num = (v: unknown): number | null => {
  if (v === '' || v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const yes = (v: unknown) => v === '1' || v === 1;
const no = (v: unknown) => v === '0' || v === 0;
const BURN = new Set(['0x0000000000000000000000000000000000000000', '0x000000000000000000000000000000000000dead']);

export interface SecurityFeed {
  /** Raw GoPlus record for the token, or null when GoPlus has none. Throws when unreachable. */
  token(chainId: number, address: string, signal: AbortSignal): Promise<Json | null>;
}

export function createGoPlus(opts: { baseUrl?: string; fetch?: typeof fetch } = {}): SecurityFeed {
  const base = (opts.baseUrl ?? 'https://api.gopluslabs.io').replace(/\/$/, '');
  const doFetch = opts.fetch ?? fetch;
  return {
    async token(chainId, address, signal) {
      const res = await doFetch(`${base}/api/v1/token_security/${chainId}?contract_addresses=${address.toLowerCase()}`, {
        headers: { accept: 'application/json', 'user-agent': 'Noxsea/1.0 (+https://noxsea.xyz)' },
        signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
      });
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok || !type.includes('json')) {
        await res.body?.cancel().catch(() => undefined);
        throw new Error(`goplus HTTP ${res.status}`);
      }
      const body = obj(await res.json());
      if (num(body?.code) !== 1) throw new Error(`goplus code ${String(body?.code)}`);
      const result = obj(body?.result);
      if (!result) return null;
      const rec = obj(result[address.toLowerCase()]) ?? obj(Object.values(result)[0]);
      return rec && Object.keys(rec).length ? rec : null;
    },
  };
}

/** GoPlus sends shares and taxes as fractions ("0.05" = 5%); tolerate percentages too. */
const pctOf = (v: number, asFraction: boolean) => Math.round((asFraction ? v * 100 : v) * 100) / 100;

/** Fills holders, verification and names from a GoPlus record, and adds its flags. Returns true if holders were set. */
export function applyGoPlus(report: TokenReport, g: Json): boolean {
  const flags = report.flags;
  const has = (code: string) => flags.some((f) => f.code === code);
  const push = (f: RiskFlag) => {
    if (!has(f.code)) flags.push(f);
  };

  if (!report.name) report.name = str(g.token_name);
  if (!report.symbol) report.symbol = str(g.token_symbol);
  if (yes(g.is_open_source)) report.verified = true;
  else if (no(g.is_open_source)) report.verified = false;
  const holderCount = num(g.holder_count);
  if (holderCount !== null) report.holders = holderCount;

  let gotHolders = false;
  const raw = Array.isArray(g.holders) ? g.holders.map(obj).filter((h): h is Json => !!h) : [];
  if (raw.length) {
    const asFraction = raw.every((h) => (num(h.percent) ?? 0) <= 1);
    const shares: HolderShare[] = [];
    for (const h of raw.slice(0, 10)) {
      const a = str(h.address);
      const p = num(h.percent);
      if (!a || p === null) continue;
      const tag = str(h.tag);
      shares.push({
        address: a,
        pct: pctOf(p, asFraction),
        label: BURN.has(a.toLowerCase()) ? 'burn' : yes(h.is_contract) ? 'contract' : 'wallet',
        name: yes(h.is_locked) ? `${tag ?? 'Locked'} (locked)` : tag,
      });
    }
    if (shares.length) {
      report.topHolders = shares;
      report.top10Pct = Math.round(shares.filter((s) => s.label !== 'burn').reduce((n, s) => n + s.pct, 0) * 100) / 100;
      gotHolders = true;
    }
  }

  if (yes(g.is_honeypot)) {
    push({ level: 'high', code: 'honeypot', text: 'Sell simulation failed: this looks like a honeypot. You may be able to buy but not sell.' });
  }
  if (yes(g.cannot_sell_all)) push({ level: 'high', code: 'cannot_sell_all', text: "Holders can't sell their whole balance at once." });
  if (yes(g.cannot_buy)) push({ level: 'medium', code: 'cannot_buy', text: 'Buying is currently blocked.' });
  const taxes: [string, unknown][] = [['Buy', g.buy_tax], ['Sell', g.sell_tax]];
  for (const [side, v] of taxes) {
    const t = num(v);
    if (t === null || t <= 0) continue;
    const pct = pctOf(t, t <= 1);
    push({
      level: pct >= 10 ? 'high' : 'medium',
      code: `${side.toLowerCase()}_tax`,
      text: `${side} tax is ${pct}%${pct >= 10 ? ', which is very high' : ''}.`,
    });
  }
  if (yes(g.hidden_owner)) push({ level: 'high', code: 'hidden_owner', text: 'Has a hidden owner who keeps control even if ownership looks renounced.' });
  if (yes(g.can_take_back_ownership)) push({ level: 'high', code: 'take_back', text: 'Ownership can be taken back after it was renounced.' });
  if (yes(g.selfdestruct)) push({ level: 'high', code: 'selfdestruct', text: 'The contract can self-destruct.' });
  const renounced = report.owner?.renounced === true;
  if (yes(g.is_mintable)) push({ level: renounced ? 'info' : 'high', code: 'mint', text: 'Has a mint function: new tokens can be created, diluting holders.' });
  if (yes(g.is_blacklisted)) push({ level: renounced ? 'medium' : 'high', code: 'blacklist', text: 'Can block wallets (blacklist): your tokens could be locked so you cannot sell.' });
  if (yes(g.slippage_modifiable) || yes(g.personal_slippage_modifiable)) {
    push({ level: renounced ? 'info' : 'medium', code: 'fees', text: 'Buy/sell fees or taxes can be changed after launch.' });
  }
  if (yes(g.transfer_pausable)) push({ level: renounced ? 'info' : 'medium', code: 'pause', text: 'Transfers can be paused.' });
  return gotHolders;
}
