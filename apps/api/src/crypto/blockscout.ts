import { erc20Abi, toFunctionSelector, type Address } from 'viem';
import type { ChainClient } from '../chain';
import { withTimeout } from '../chain';

/**
 * Token Safety Check: public on-chain facts about one address on the configured chain, read from the
 * chain's Blockscout explorer API (and owner() over RPC), turned into plain-language risk flags.
 *
 * Everything here is public chain data. Requests go out from our server, so the user's IP never reaches
 * the explorer. Nothing about the user or their message is logged.
 */

export type FlagLevel = 'high' | 'medium' | 'info' | 'ok';

export interface RiskFlag {
  level: FlagLevel;
  code: string;
  text: string;
}

export interface HolderShare {
  address: string;
  pct: number;
  label: 'burn' | 'contract' | 'wallet';
  name?: string | null;
}

export interface TokenReport {
  address: string;
  chain: string;
  explorerUrl: string | null;
  kind: 'token' | 'contract' | 'wallet';
  name: string | null;
  symbol: string | null;
  tokenType: string | null;
  decimals: number | null;
  totalSupply: string | null;
  holders: number | null;
  verified: boolean | null;
  contractName: string | null;
  proxy: boolean;
  owner: { address: string | null; renounced: boolean } | null;
  /** Share of supply held by the 10 largest holders, burn addresses excluded. */
  top10Pct: number | null;
  topHolders: HolderShare[];
  priceUsd: number | null;
  marketCapUsd: number | null;
  /** Where the data came from: the block explorer, or the chain's RPC when the explorer is unreachable. */
  source: 'explorer' | 'rpc';
  /** Wallets only: native balance (ether units) and transaction count. */
  wallet?: { balance: string; txCount: number | null };
  flags: RiskFlag[];
  fetchedAt: string;
}

export interface TokenScanner {
  scan(address: Address, signal: AbortSignal): Promise<TokenReport>;
}

const shortAddr = (a: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : 'unknown');
const BURN = new Set(['0x0000000000000000000000000000000000000000', '0x000000000000000000000000000000000000dead']);
const TIMEOUT_MS = 8_000;
const CACHE_MS = 5 * 60_000;

type Json = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const obj = (v: unknown): Json | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null);
/** Blockscout versions differ: some send `address_hash`, some `address`, some `{ hash }`. */
const hashOf = (v: unknown): string | null => {
  if (typeof v === 'string') return v;
  const o = obj(v);
  return o ? str(o.hash) ?? str(o.address_hash) ?? str(o.address) : null;
};

/** Formats a raw integer amount with `decimals` into a short human number (e.g. 1.2B). */
export function formatAmount(raw: string, decimals: number): string {
  let v: number;
  try {
    const big = BigInt(raw);
    const scale = 10n ** BigInt(Math.max(0, decimals));
    v = Number(big / scale) + Number(big % scale) / Number(scale);
  } catch {
    return raw;
  }
  const units: [number, string][] = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [n, u] of units) if (v >= n) return `${(v / n).toFixed(v / n >= 100 ? 0 : 2).replace(/\.?0+$/, '')}${u}`;
  return v.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function shareOf(raw: string, supply: string): number | null {
  try {
    const s = BigInt(supply);
    if (s === 0n) return null;
    return Number((BigInt(raw) * 1_000_000n) / s) / 10_000;
  } catch {
    return null;
  }
}

/** Privileged functions worth flagging, matched on ABI function names. Order matters for the report. */
const ABI_RULES: { code: string; re: RegExp; level: FlagLevel; text: string; renounced?: FlagLevel }[] = [
  { code: 'mint', re: /^_?mint|^issue$/i, level: 'high', renounced: 'info', text: 'Has a mint function: new tokens can be created, diluting holders.' },
  { code: 'blacklist', re: /blacklist|blocklist|denylist|addbots?$|setbots?$|^freeze|blockaddress/i, level: 'high', renounced: 'medium', text: 'Can block wallets (blacklist or freeze): your tokens could be locked so you cannot sell.' },
  { code: 'fees', re: /^(set|update|change)\w*(fee|tax)/i, level: 'medium', renounced: 'info', text: 'Buy/sell fees or taxes can be changed after launch.' },
  { code: 'trading', re: /^(enable|open|start|set)\w*trading|setswapenabled/i, level: 'medium', renounced: 'info', text: 'Trading can be switched on or off by a privileged account.' },
  { code: 'pause', re: /^(pause|unpause|setpaused)$/i, level: 'medium', renounced: 'info', text: 'Transfers can be paused.' },
  { code: 'limits', re: /^(set|update)\w*max(tx|wallet|transaction|txn|holding)/i, level: 'info', text: 'Max transaction or max wallet limits can be changed.' },
];

/**
 * The same rules for contracts read straight from the chain (no explorer): common function signatures,
 * found as PUSH4 <selector> in the deployed bytecode. Misses unusual names, never invents a match.
 */
const SELECTOR_RULES: Record<string, string[]> = {
  mint: ['mint(address,uint256)', 'mint(uint256)', 'mint(address)', 'mintTo(address,uint256)', 'issue(uint256)'],
  blacklist: [
    'blacklist(address)', 'addToBlacklist(address)', 'addBlacklist(address)', 'setBlacklist(address,bool)',
    'blacklistAddress(address,bool)', 'setBlacklisted(address,bool)', 'addToBlackList(address[])', 'setBots(address[],bool)',
    'addBots(address[])', 'blockBots(address[])', 'setBot(address,bool)', 'freeze(address)', 'freezeAccount(address,bool)',
  ],
  fees: [
    'setFee(uint256)', 'setFees(uint256,uint256)', 'setTax(uint256)', 'setTaxes(uint256,uint256)', 'setBuyFee(uint256)',
    'setSellFee(uint256)', 'setBuyTax(uint256)', 'setSellTax(uint256)', 'updateFees(uint256,uint256)',
    'setTaxFeePercent(uint256)', 'updateBuyFees(uint256,uint256,uint256)', 'updateSellFees(uint256,uint256,uint256)',
    'setFeePercent(uint256)', 'setFees(uint256,uint256,uint256)',
  ],
  trading: ['enableTrading()', 'openTrading()', 'startTrading()', 'setTradingEnabled(bool)', 'setTrading(bool)', 'tradingStatus(bool)'],
  pause: ['pause()', 'unpause()'],
  limits: ['setMaxTxAmount(uint256)', 'setMaxWalletSize(uint256)', 'setMaxWallet(uint256)', 'updateMaxTxnAmount(uint256)', 'updateMaxWalletAmount(uint256)', 'setMaxTxPercent(uint256)'],
};
const SELECTORS = Object.entries(SELECTOR_RULES).map(([code, sigs]) => ({
  code,
  push4: sigs.map((sig) => `63${toFunctionSelector(sig).slice(2).toLowerCase()}`),
}));

/** Rule codes whose function selectors appear in the bytecode. */
export function bytecodeRuleCodes(code: string): Set<string> {
  const hex = code.toLowerCase();
  return new Set(SELECTORS.filter((r) => r.push4.some((p) => hex.includes(p))).map((r) => r.code));
}

/** EIP-1967 implementation slot: non-zero means an upgradeable proxy. */
const IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const EXPLORER_BACKOFF_MS = 5 * 60_000;

function abiFunctionNames(abi: unknown): string[] {
  if (!Array.isArray(abi)) return [];
  return abi
    .map((e) => obj(e))
    .filter((e): e is Json => !!e && e.type === 'function' && e.stateMutability !== 'view' && e.stateMutability !== 'pure')
    .map((e) => str(e.name))
    .filter((n): n is string => !!n);
}

const OWNER_ABI = [{ type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }] as const;

export interface ScannerOptions {
  /** Blockscout API v2 base, e.g. https://explorer.example/api/v2. Null: read from the chain only. */
  apiBase: string | null;
  /** Explorer web base for links, e.g. https://explorer.example */
  explorerUrl: string | null;
  chainName: string;
  chain: ChainClient | null;
  /** Optional explorer API key (sent as ?apikey=). */
  apiKey?: string | null;
  fetch?: typeof fetch;
  now?: () => number;
}

export function createTokenScanner(opts: ScannerOptions): TokenScanner {
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const base = opts.apiBase ? opts.apiBase.replace(/\/$/, '') : null;
  /** After a block (e.g. a Cloudflare challenge on datacenter IPs), go straight to RPC for a while. */
  let explorerDownUntil = 0;
  const cache = new Map<string, { at: number; report: TokenReport }>();

  async function get(path: string, signal: AbortSignal): Promise<Json | null> {
    const url = `${base}${path}${opts.apiKey ? `${path.includes('?') ? '&' : '?'}apikey=${encodeURIComponent(opts.apiKey)}` : ''}`;
    const res = await doFetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'Noxsea/1.0 (+https://noxsea.xyz)' },
      signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
    });
    if (res.status === 404) {
      await res.body?.cancel().catch(() => undefined);
      return null;
    }
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.includes('json')) {
      // A Cloudflare challenge answers 403/503 with an HTML page: treat it as unreachable.
      await res.body?.cancel().catch(() => undefined);
      throw new Error(`explorer HTTP ${res.status}${type.includes('json') ? '' : ' (not JSON)'}`);
    }
    return obj(await res.json());
  }

  async function readOwner(address: Address): Promise<{ address: string | null; renounced: boolean } | null> {
    if (!opts.chain) return null;
    try {
      const owner = await withTimeout(opts.chain.readContract({ address, abi: OWNER_ABI, functionName: 'owner' }));
      const a = String(owner).toLowerCase();
      return { address: owner as string, renounced: BURN.has(a) };
    } catch {
      return null; // no owner() (roles, or not Ownable) or RPC trouble
    }
  }

  async function scan(address: Address, signal: AbortSignal): Promise<TokenReport> {
    const key = address.toLowerCase();
    const hit = cache.get(key);
    if (hit && now() - hit.at < CACHE_MS) return hit.report;

    let report: TokenReport | null = null;
    if (base && now() >= explorerDownUntil) {
      try {
        report = await explorerScan(address, signal);
      } catch (err) {
        if (signal.aborted || !opts.chain) throw err;
        explorerDownUntil = now() + EXPLORER_BACKOFF_MS;
      }
    }
    if (!report) {
      if (!opts.chain) throw new Error('no explorer or RPC configured');
      report = await rpcScan(address);
    }
    const order: Record<FlagLevel, number> = { high: 0, medium: 1, info: 2, ok: 3 };
    report.flags.sort((a, b) => order[a.level] - order[b.level]);
    cache.set(key, { at: now(), report });
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
    return report;
  }

  function emptyReport(address: Address, source: TokenReport['source']): TokenReport {
    return {
      address,
      chain: opts.chainName,
      explorerUrl: opts.explorerUrl ? `${opts.explorerUrl.replace(/\/$/, '')}/address/${address}` : null,
      kind: 'wallet',
      name: null,
      symbol: null,
      tokenType: null,
      decimals: null,
      totalSupply: null,
      holders: null,
      verified: null,
      contractName: null,
      proxy: false,
      owner: null,
      top10Pct: null,
      topHolders: [],
      priceUsd: null,
      marketCapUsd: null,
      source,
      flags: [],
      fetchedAt: new Date(now()).toISOString(),
    };
  }

  /** Straight from the chain: ERC-20 basics, owner, proxy slot and privileged functions in the bytecode. */
  async function rpcScan(address: Address): Promise<TokenReport> {
    const chain = opts.chain!;
    const report = emptyReport(address, 'rpc');
    const code = await withTimeout(chain.getCode({ address }));
    if (!code || code === '0x') {
      const [balance, txCount] = await withTimeout(Promise.all([chain.getBalance({ address }), chain.getTransactionCount({ address })]));
      report.wallet = { balance: formatAmount(balance.toString(), 18), txCount };
      report.flags.push(
        balance === 0n && txCount === 0
          ? { level: 'info', code: 'unknown', text: `No activity found for this address on ${opts.chainName}. Check you copied the right address and network.` }
          : { level: 'info', code: 'wallet', text: 'This is a regular wallet, not a token contract.' },
      );
      return report;
    }

    const read = <T>(functionName: 'name' | 'symbol' | 'decimals' | 'totalSupply') =>
      withTimeout(chain.readContract({ address, abi: erc20Abi, functionName }) as Promise<T>).catch(() => null);
    const [name, symbol, decimals, supply, owner, slot] = await Promise.all([
      read<string>('name'),
      read<string>('symbol'),
      read<number>('decimals'),
      read<bigint>('totalSupply'),
      readOwner(address),
      withTimeout(chain.getStorageAt({ address, slot: IMPL_SLOT })).catch(() => null),
    ]);
    const isToken = decimals !== null && supply !== null;
    report.kind = isToken ? 'token' : 'contract';
    report.tokenType = isToken ? 'ERC-20' : null;
    report.name = typeof name === 'string' ? name : null;
    report.symbol = typeof symbol === 'string' ? symbol : null;
    report.decimals = decimals === null ? null : Number(decimals);
    report.totalSupply = supply !== null && decimals !== null ? formatAmount(supply.toString(), Number(decimals)) : null;
    report.owner = owner;

    let codes = bytecodeRuleCodes(code);
    const impl = slot && BigInt(slot) !== 0n ? (`0x${slot.slice(-40)}` as Address) : null;
    if (impl) {
      report.proxy = true;
      const implCode = await withTimeout(chain.getCode({ address: impl })).catch(() => null);
      if (implCode) codes = new Set([...codes, ...bytecodeRuleCodes(implCode)]);
    }
    addFlags(report, codes);
    report.flags.push({
      level: 'info',
      code: 'rpc_only',
      text: 'Read directly from the chain: holder concentration and source verification need the block explorer, which did not respond. Check them there.',
    });
    return report;
  }

  async function explorerScan(address: Address, signal: AbortSignal): Promise<TokenReport> {
    const info = await get(`/addresses/${address}`, signal);
    const isContract = info?.is_contract === true;
    const tokenInfo = obj(info?.token);
    const report = emptyReport(address, 'explorer');
    const flags = report.flags;
    report.kind = tokenInfo ? 'token' : isContract ? 'contract' : 'wallet';
    report.verified = isContract ? info?.is_verified === true : null;
    report.contractName = str(info?.name);

    if (!info) {
      report.kind = 'wallet';
      flags.push({ level: 'info', code: 'unknown', text: `No activity found for this address on ${opts.chainName}. Check you copied the right address and network.` });
    }

    if (report.kind === 'wallet') {
      if (info) {
        const wei = str(info.coin_balance) ?? '0';
        let txCount: number | null = null;
        try {
          const c = await get(`/addresses/${address}/counters`, signal);
          txCount = num(c?.transactions_count);
        } catch {
          // counters are optional
        }
        report.wallet = { balance: formatAmount(wei, 18), txCount };
        flags.push({ level: 'info', code: 'wallet', text: 'This is a regular wallet, not a token contract.' });
      }
      return report;
    }

    // ---- contract / token ----
    const implementations = Array.isArray(info?.implementations) ? (info!.implementations as unknown[]) : [];
    report.proxy = implementations.length > 0 || !!str(info?.proxy_type);

    const [token, contract, holders, owner] = await Promise.all([
      tokenInfo ? get(`/tokens/${address}`, signal).catch(() => tokenInfo) : Promise.resolve(null),
      get(`/smart-contracts/${address}`, signal).catch(() => null),
      tokenInfo ? get(`/tokens/${address}/holders`, signal).catch(() => null) : Promise.resolve(null),
      readOwner(address),
    ]);

    // Upgradeable proxies: the logic lives in the implementation, so read its ABI too.
    let implAbi: unknown = null;
    const implAddr = hashOf(implementations[0]);
    if (implAddr) {
      const impl = await get(`/smart-contracts/${implAddr}`, signal).catch(() => null);
      implAbi = impl?.abi ?? null;
    }

    const t = token ?? tokenInfo;
    if (t) {
      report.name = str(t.name);
      report.symbol = str(t.symbol);
      report.tokenType = str(t.type);
      report.decimals = num(t.decimals);
      const supply = str(t.total_supply);
      report.totalSupply = supply && report.decimals !== null ? formatAmount(supply, report.decimals) : supply;
      report.holders = num(t.holders_count ?? t.holders);
      report.priceUsd = num(t.exchange_rate);
      report.marketCapUsd = num(t.circulating_market_cap);

      const items = Array.isArray(holders?.items) ? (holders!.items as unknown[]) : [];
      if (supply && items.length) {
        const shares: HolderShare[] = [];
        for (const it of items.slice(0, 10)) {
          const o = obj(it);
          const addrObj = obj(o?.address);
          const a = hashOf(o?.address) ?? str(o?.address_hash);
          const pct = shareOf(str(o?.value) ?? '0', supply);
          if (!a || pct === null) continue;
          const label: HolderShare['label'] = BURN.has(a.toLowerCase()) ? 'burn' : addrObj?.is_contract === true ? 'contract' : 'wallet';
          shares.push({ address: a, pct, label, name: str(addrObj?.name) });
        }
        report.topHolders = shares;
        report.top10Pct = Math.round(shares.filter((s) => s.label !== 'burn').reduce((n, s) => n + s.pct, 0) * 100) / 100;
      }
    }

    if (contract?.is_verified === true || contract?.is_fully_verified === true) report.verified = true;
    if (!report.contractName) report.contractName = str(contract?.name);
    report.owner = owner;

    const names = [...abiFunctionNames(contract?.abi), ...abiFunctionNames(implAbi)];
    addFlags(report, new Set(ABI_RULES.filter((r) => names.some((n) => r.re.test(n))).map((r) => r.code)));
    return report;
  }

  return { scan };
}

/** Risk flags from the report's facts plus the privileged-function rule codes that matched. */
function addFlags(report: TokenReport, codes: Set<string>): void {
  const flags = report.flags;
  const owner = report.owner;
  const renounced = owner?.renounced === true;
  if (report.verified === false) {
    flags.push({ level: 'high', code: 'unverified', text: 'Source code is not verified on the explorer, so nobody can check what the contract does.' });
  }
  if (report.proxy) {
    flags.push({ level: 'medium', code: 'proxy', text: 'Upgradeable proxy: the contract code can be replaced later.' });
  }
  for (const rule of ABI_RULES) {
    if (!codes.has(rule.code)) continue;
    const level = renounced && rule.renounced ? rule.renounced : rule.level;
    flags.push({ level, code: rule.code, text: renounced && rule.renounced ? `${rule.text} Ownership is renounced, which limits who can use it.` : rule.text });
  }
  if (owner) {
    flags.push(
      renounced
        ? { level: 'ok', code: 'renounced', text: 'Ownership is renounced: no owner can call owner-only functions.' }
        : { level: 'info', code: 'owned', text: `Has an active owner (${shortAddr(owner.address)}) who can call owner-only functions.` },
    );
  }
  if (report.top10Pct !== null) {
    const biggestWallet = report.topHolders.filter((h) => h.label === 'wallet').sort((a, b) => b.pct - a.pct)[0];
    if (report.top10Pct >= 70) {
      flags.push({ level: 'high', code: 'concentration', text: `The top 10 holders own ${report.top10Pct}% of supply. A few wallets can crash the price.` });
    } else if (report.top10Pct >= 40) {
      flags.push({ level: 'medium', code: 'concentration', text: `The top 10 holders own ${report.top10Pct}% of supply.` });
    } else {
      flags.push({ level: 'ok', code: 'concentration', text: `Supply is fairly spread out: the top 10 holders own ${report.top10Pct}%.` });
    }
    if (biggestWallet && biggestWallet.pct >= 15) {
      flags.push({ level: 'high', code: 'whale', text: `One wallet holds ${biggestWallet.pct}% of supply.` });
    }
    if (report.topHolders.some((h) => h.label === 'contract')) {
      flags.push({ level: 'info', code: 'contract_holders', text: 'Some top holders are contracts (often the liquidity pool or a locker). Check which ones on the explorer.' });
    }
  }
  if (report.holders !== null && report.holders < 50 && report.kind === 'token') {
    flags.push({ level: 'medium', code: 'few_holders', text: `Only ${report.holders} holders so far.` });
  }
  if (report.kind === 'contract') {
    flags.push({ level: 'info', code: 'not_token', text: "This is a contract, but it doesn't look like a standard token." });
  }
}

/** The report as context for the model: data plus how to talk about it. */
export function tokenSystemMessage(r: TokenReport): string {
  const from = r.source === 'rpc' ? "the chain's public RPC (the block explorer did not respond)" : 'the public block explorer';
  const lines: string[] = [`On-chain data for ${r.address} on ${r.chain}, read just now from ${from}:`];
  if (r.kind === 'wallet') {
    lines.push(`- Type: regular wallet (not a token contract)`);
    if (r.wallet) lines.push(`- Native balance: ${r.wallet.balance} ETH`, `- Transactions: ${r.wallet.txCount ?? 'unknown'}`);
  } else {
    lines.push(`- Type: ${r.kind === 'token' ? `token (${r.tokenType ?? 'unknown standard'})` : 'contract (not listed as a token)'}`);
    if (r.name || r.symbol) lines.push(`- Name: ${r.name ?? '?'} (${r.symbol ?? '?'})`);
    if (r.totalSupply) lines.push(`- Total supply: ${r.totalSupply}`);
    if (r.holders !== null) lines.push(`- Holders: ${r.holders}`);
    lines.push(`- Source verified: ${r.verified === null ? 'unknown' : r.verified ? 'yes' : 'no'}`);
    lines.push(`- Upgradeable proxy: ${r.proxy ? 'yes' : 'no'}`);
    lines.push(`- Owner: ${r.owner ? (r.owner.renounced ? 'renounced' : r.owner.address) : 'no owner() function found or not readable'}`);
    if (r.top10Pct !== null) lines.push(`- Top 10 holders (burn excluded): ${r.top10Pct}% of supply`);
    for (const h of r.topHolders.slice(0, 5)) lines.push(`  - ${h.address} ${h.pct}% (${h.label}${h.name ? `, ${h.name}` : ''})`);
    if (r.priceUsd !== null) lines.push(`- Price: $${r.priceUsd}`);
    if (r.marketCapUsd !== null) lines.push(`- Market cap: $${r.marketCapUsd}`);
  }
  lines.push('', 'Automatic checks:');
  for (const f of r.flags) lines.push(`- [${f.level}] ${f.text}`);
  lines.push(
    '',
    'Use this data to answer. Explain the red flags in plain words and what the user could check next (liquidity lock, ' +
      'who the top holders are, recent transfers). These checks are automatic and can miss things such as honeypot ' +
      'sell restrictions or liquidity status: say so. Never call a token safe or recommend buying or selling. ' +
      'End with one short line that this is not financial advice.',
  );
  return lines.join('\n');
}
