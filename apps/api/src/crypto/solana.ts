import { formatAmount, holderFlags, type HolderShare, type RiskFlag, type TokenReport } from './blockscout';

/**
 * Token Safety Check for Solana, read from a Solana JSON-RPC node: mint and freeze authority, Token-2022
 * extensions (transfer fees, permanent delegate, transfer hooks…) and the largest holders.
 * Requests go out from our server, so the user's IP never reaches the RPC.
 */

const TIMEOUT_MS = 8_000;
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const SYSTEM_PROGRAM = '11111111111111111111111111111111';
const INCINERATOR = '1nc1nerator11111111111111111111111111111111';

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export interface SolanaOptions {
  rpcUrl: string;
  explorerUrl: string;
  fetch?: typeof fetch;
  now?: () => number;
}

export function createSolanaScanner(opts: SolanaOptions) {
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const explorer = opts.explorerUrl.replace(/\/$/, '');

  async function rpc(method: string, params: unknown[], signal: AbortSignal): Promise<unknown> {
    const res = await doFetch(opts.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
    });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.includes('json')) {
      await res.body?.cancel().catch(() => undefined);
      throw new Error(`solana rpc HTTP ${res.status}`);
    }
    const body = obj(await res.json());
    if (body?.error) throw new Error(`solana rpc error ${String(obj(body.error)?.code ?? '')}`);
    return obj(body?.result)?.value;
  }

  function emptyReport(address: string): TokenReport {
    return {
      address,
      chain: 'Solana',
      chainKey: 'solana',
      nativeSymbol: 'SOL',
      explorerUrl: `${explorer}/account/${address}`,
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
      source: 'rpc',
      flags: [],
      fetchedAt: new Date(now()).toISOString(),
    };
  }

  /** Largest token accounts → owners → wallet or program-owned (pools, lockers). */
  async function topHolders(mint: string, supplyRaw: string, signal: AbortSignal): Promise<HolderShare[] | null> {
    let largest: Json[];
    try {
      const v = await rpc('getTokenLargestAccounts', [mint, { commitment: 'confirmed' }], signal);
      largest = (Array.isArray(v) ? v : []).map(obj).filter((x): x is Json => !!x).slice(0, 10);
    } catch {
      return null; // some public RPCs refuse this call for big tokens
    }
    if (!largest.length) return [];
    const supply = BigInt(supplyRaw || '0');
    if (supply === 0n) return null;

    const accounts = largest.map((a) => str(a.address)).filter((a): a is string => !!a);
    const owners = new Map<string, string>();
    const ownerKind = new Map<string, 'wallet' | 'contract'>();
    try {
      const infos = await rpc('getMultipleAccounts', [accounts, { encoding: 'jsonParsed', commitment: 'confirmed' }], signal);
      (Array.isArray(infos) ? infos : []).forEach((info, i) => {
        const o = str(obj(obj(obj(obj(info)?.data)?.parsed)?.info)?.owner);
        if (o) owners.set(accounts[i]!, o);
      });
      const uniq = [...new Set(owners.values())];
      if (uniq.length) {
        const ow = await rpc('getMultipleAccounts', [uniq, { encoding: 'base64', dataSlice: { offset: 0, length: 0 }, commitment: 'confirmed' }], signal);
        (Array.isArray(ow) ? ow : []).forEach((info, i) => {
          const program = str(obj(info)?.owner);
          // No account (0 SOL wallet) or a System-owned account is a wallet; anything else is a program (pool, locker, vault).
          ownerKind.set(uniq[i]!, !program || program === SYSTEM_PROGRAM ? 'wallet' : 'contract');
        });
      }
    } catch {
      // owners are a nice-to-have: fall back to unlabeled token accounts
    }

    return largest.flatMap((a) => {
      const acct = str(a.address);
      const amount = str(a.amount);
      if (!acct || !amount) return [];
      const owner = owners.get(acct) ?? acct;
      const pct = Number((BigInt(amount) * 1_000_000n) / supply) / 10_000;
      const label: HolderShare['label'] = owner === INCINERATOR ? 'burn' : ownerKind.get(owner) ?? 'wallet';
      return [{ address: owner, pct, label }];
    });
  }

  async function scan(address: string, signal: AbortSignal, followed = false): Promise<TokenReport> {
    const report = emptyReport(address);
    const flags = report.flags;
    const acct = obj(await rpc('getAccountInfo', [address, { encoding: 'jsonParsed', commitment: 'confirmed' }], signal));

    if (!acct) {
      flags.push({ level: 'info', code: 'unknown', text: 'No account found for this address on Solana. Check you copied the right address and network.' });
      return report;
    }
    const program = str(acct.owner);
    const parsed = obj(obj(acct.data)?.parsed);
    const info = obj(parsed?.info);

    if (program === SYSTEM_PROGRAM) {
      report.wallet = { balance: formatAmount(String(num(acct.lamports) ?? 0), 9), txCount: null };
      flags.push({ level: 'info', code: 'wallet', text: 'This is a regular wallet, not a token mint.' });
      return report;
    }
    const isTokenProgram = program === TOKEN_PROGRAM || program === TOKEN_2022;
    if (isTokenProgram && parsed?.type === 'account' && str(info?.mint) && !followed) {
      const r = await scan(str(info!.mint)!, signal, true);
      r.flags.push({ level: 'info', code: 'token_account', text: `You pasted a token account (${short(address)}), so this shows the token it holds.` });
      return r;
    }
    if (!isTokenProgram || parsed?.type !== 'mint' || !info) {
      report.kind = 'contract';
      flags.push({
        level: 'info',
        code: 'not_token',
        text: acct.executable === true ? 'This is a program, not a token.' : "This account belongs to a program but isn't a token mint.",
      });
      return report;
    }

    // ---- token mint ----
    report.kind = 'token';
    report.explorerUrl = `${explorer}/token/${address}`;
    const is2022 = program === TOKEN_2022;
    report.tokenType = is2022 ? 'Token-2022' : 'SPL Token';
    report.decimals = num(info.decimals);
    const supply = str(info.supply) ?? '0';
    report.totalSupply = formatAmount(supply, report.decimals ?? 0);
    const mintAuthority = str(info.mintAuthority);
    const freezeAuthority = str(info.freezeAuthority);
    const exts = (Array.isArray(info.extensions) ? info.extensions : []).map(obj).filter((e): e is Json => !!e);
    report.solana = {
      program: is2022 ? 'Token-2022' : 'SPL Token',
      mintAuthority,
      freezeAuthority,
      extensions: exts.map((e) => str(e.extension)).filter((e): e is string => !!e),
    };

    flags.push(
      mintAuthority
        ? { level: 'high', code: 'mint', text: `Mint authority is active (${short(mintAuthority)}): new tokens can be created, diluting holders.` }
        : { level: 'ok', code: 'mint', text: 'Mint authority is renounced: no new tokens can be created.' },
      freezeAuthority
        ? { level: 'high', code: 'freeze', text: `Freeze authority is active (${short(freezeAuthority)}): your tokens could be frozen so you cannot sell.` }
        : { level: 'ok', code: 'freeze', text: 'No freeze authority: nobody can freeze your tokens.' },
    );
    for (const e of exts) extensionFlags(report, e, flags);

    const holders = await topHolders(address, supply, signal);
    if (holders?.length) {
      report.topHolders = holders;
      report.top10Pct = Math.round(holders.filter((h) => h.label !== 'burn').reduce((n, h) => n + h.pct, 0) * 100) / 100;
      holderFlags(report);
    } else if (holders === null) {
      flags.push({ level: 'info', code: 'no_holders', text: 'The Solana node did not return the largest holders. Check holder concentration on Solscan.' });
    }
    return report;
  }

  return { scan: (address: string, signal: AbortSignal) => scan(address, signal) };
}

function extensionFlags(report: TokenReport, e: Json, flags: RiskFlag[]): void {
  const state = obj(e.state) ?? {};
  switch (str(e.extension)) {
    case 'tokenMetadata':
      report.name = report.name ?? str(state.name);
      report.symbol = report.symbol ?? str(state.symbol);
      if (str(state.updateAuthority)) flags.push({ level: 'info', code: 'metadata_mutable', text: 'Name, symbol and logo can still be changed by an update authority.' });
      break;
    case 'transferFeeConfig': {
      const bps = num(obj(state.newerTransferFee)?.transferFeeBasisPoints) ?? num(obj(state.olderTransferFee)?.transferFeeBasisPoints) ?? 0;
      if (bps > 0) {
        const pct = bps / 100;
        flags.push({ level: pct >= 10 ? 'high' : 'medium', code: 'transfer_fee', text: `Every transfer pays a ${pct}% fee${pct >= 10 ? ', which is very high' : ''}.` });
      }
      if (str(state.transferFeeConfigAuthority)) flags.push({ level: 'medium', code: 'fees', text: 'The transfer fee can be changed by an authority.' });
      break;
    }
    case 'permanentDelegate':
      if (str(state.delegate)) flags.push({ level: 'high', code: 'permanent_delegate', text: "Has a permanent delegate: one account can move or burn anyone's tokens." });
      break;
    case 'transferHook':
      if (str(state.programId)) flags.push({ level: 'medium', code: 'transfer_hook', text: 'Runs custom code (a transfer hook) on every transfer, which could block sells.' });
      break;
    case 'nonTransferable':
      flags.push({ level: 'high', code: 'non_transferable', text: "Tokens can't be transferred or sold (non-transferable)." });
      break;
    case 'defaultAccountState':
      if (str(state.accountState) === 'frozen') flags.push({ level: 'high', code: 'default_frozen', text: 'New holders start frozen: the issuer decides who can trade.' });
      break;
    case 'pausableConfig':
      if (state.paused === true) flags.push({ level: 'high', code: 'paused', text: 'Transfers are paused right now.' });
      else if (str(state.authority)) flags.push({ level: 'medium', code: 'pause', text: 'Transfers can be paused.' });
      break;
    case 'mintCloseAuthority':
      if (str(state.closeAuthority)) flags.push({ level: 'info', code: 'close_authority', text: 'The mint can be closed by an authority.' });
      break;
    case 'confidentialTransferMint':
      flags.push({ level: 'info', code: 'confidential', text: 'Supports confidential transfers: some balances may be hidden.' });
      break;
  }
}
