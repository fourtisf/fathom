import { SCAN_CHAINS } from '@fathom/config';

/**
 * Verified contract source code for audits, from public verification services: Sourcify (no key),
 * Etherscan's multichain API (optional key) and the home chain's Blockscout. Requests go out from our
 * server, so the user's IP never reaches these services. Source code is public; nothing is logged.
 */

const TIMEOUT_MS = 9_000;
/** Source sent to the model, at most: about 17k tokens. Main contract first, libraries last. */
export const MAX_SOURCE_CHARS = 60_000;

export interface SourceFile {
  path: string;
  content: string;
}

export interface ContractSource {
  address: string;
  chainKey: string;
  chainName: string;
  name: string | null;
  compiler: string | null;
  verifiedBy: 'Sourcify' | 'Etherscan' | 'Blockscout';
  /** Sourcify: 'exact_match' or 'match' (metadata differs); others: null. */
  match: string | null;
  files: SourceFile[];
  /** Main file path when known. */
  mainPath: string | null;
  /** Logic contract of an upgradeable proxy, when the service resolved it. */
  implementation: string | null;
  explorerUrl: string | null;
}

export interface SourceFetcher {
  /** Tries every supported chain (hinted one first). Null when no service has verified source. */
  fetch(address: string, signal: AbortSignal, chainHint?: string): Promise<ContractSource | null>;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

interface Chain {
  key: string;
  name: string;
  chainId: number;
  explorer: string | null;
}

export interface SourceFetcherOptions {
  /** The app's own chain (Robinhood Chain): id, name, explorer web base and Blockscout API base. */
  home: { chainId: number; name: string; explorerUrl: string | null; blockscoutApi: string | null } | null;
  sourcifyUrl?: string;
  etherscanKey?: string | null;
  etherscanUrl?: string;
  fetch?: typeof fetch;
}

/** Etherscan's "SourceCode" is plain Solidity, a JSON map of files, or standard-JSON input wrapped in {{ }}. */
export function parseEtherscanSource(raw: string, name: string | null): SourceFile[] {
  const t = raw.trim();
  if (!t) return [];
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t.startsWith('{{') ? t.slice(1, -1) : t) as Json;
      const sources = obj(j.sources) ?? j;
      const files = Object.entries(sources)
        .map(([path, v]) => ({ path, content: str(obj(v)?.content) ?? '' }))
        .filter((f) => f.content);
      if (files.length) return files;
    } catch {
      // not JSON: plain source that happens to start with a brace
    }
  }
  return [{ path: `${name ?? 'Contract'}.sol`, content: t }];
}

export function createSourceFetcher(opts: SourceFetcherOptions): SourceFetcher {
  const doFetch = opts.fetch ?? fetch;
  const sourcify = (opts.sourcifyUrl ?? 'https://sourcify.dev/server').replace(/\/$/, '');
  const etherscan = (opts.etherscanUrl ?? 'https://api.etherscan.io/v2/api').replace(/\/$/, '');
  const chains: Chain[] = [
    ...(opts.home ? [{ key: 'robinhood', name: opts.home.name, chainId: opts.home.chainId, explorer: opts.home.explorerUrl }] : []),
    ...SCAN_CHAINS.filter((c) => c.kind === 'evm' && c.key !== 'robinhood' && c.chainId).map((c) => ({
      key: c.key,
      name: c.name,
      chainId: c.chainId!,
      explorer: c.explorer,
    })),
  ];

  async function getJson(url: string, signal: AbortSignal): Promise<Json | null> {
    const res = await doFetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'Noxsea/1.0 (+https://noxsea.xyz)' },
      signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
    });
    const type = res.headers.get('content-type') ?? '';
    if (res.status === 404 || !res.ok || !type.includes('json')) {
      await res.body?.cancel().catch(() => undefined);
      if (res.status === 404) return null;
      throw new Error(`source service HTTP ${res.status}`);
    }
    return obj(await res.json());
  }

  const link = (c: Chain, a: string) => (c.explorer ? `${c.explorer.replace(/\/$/, '')}/address/${a}` : null);

  async function fromSourcify(c: Chain, address: string, signal: AbortSignal): Promise<ContractSource | null> {
    const j = await getJson(`${sourcify}/v2/contract/${c.chainId}/${address}?fields=sources,compilation,proxyResolution`, signal);
    const match = str(j?.match) ?? str(j?.runtimeMatch) ?? str(j?.creationMatch);
    const sources = obj(j?.sources);
    if (!j || !match || !sources) return null;
    const files = Object.entries(sources)
      .map(([path, v]) => ({ path, content: str(obj(v)?.content) ?? '' }))
      .filter((f) => f.content);
    if (!files.length) return null;
    const comp = obj(j.compilation);
    const fq = str(comp?.fullyQualifiedName);
    const impls = Array.isArray(obj(j.proxyResolution)?.implementations) ? (obj(j.proxyResolution)!.implementations as unknown[]) : [];
    const impl = str(obj(impls[0])?.address);
    return {
      address,
      chainKey: c.key,
      chainName: c.name,
      name: str(comp?.name) ?? (fq ? fq.split(':').pop()! : null),
      compiler: str(comp?.compilerVersion),
      verifiedBy: 'Sourcify',
      match,
      files,
      mainPath: fq ? fq.split(':')[0]! : null,
      implementation: impl && ADDRESS_RE.test(impl) && impl.toLowerCase() !== address.toLowerCase() ? impl : null,
      explorerUrl: link(c, address),
    };
  }

  async function fromEtherscan(c: Chain, address: string, signal: AbortSignal): Promise<ContractSource | null> {
    if (!opts.etherscanKey) return null;
    const j = await getJson(
      `${etherscan}?chainid=${c.chainId}&module=contract&action=getsourcecode&address=${address}&apikey=${encodeURIComponent(opts.etherscanKey)}`,
      signal,
    );
    const r = obj(Array.isArray(j?.result) ? (j!.result as unknown[])[0] : null);
    const raw = str(r?.SourceCode);
    if (str(j?.status) !== '1' || !r || !raw) return null;
    const name = str(r.ContractName);
    const files = parseEtherscanSource(raw, name);
    if (!files.length) return null;
    const impl = str(r.Implementation);
    return {
      address,
      chainKey: c.key,
      chainName: c.name,
      name,
      compiler: str(r.CompilerVersion),
      verifiedBy: 'Etherscan',
      match: null,
      files,
      mainPath: files.length === 1 ? files[0]!.path : (files.find((f) => name && f.path.endsWith(`/${name}.sol`))?.path ?? null),
      implementation: str(r.Proxy) === '1' && impl && ADDRESS_RE.test(impl) ? impl : null,
      explorerUrl: link(c, address),
    };
  }

  async function fromBlockscout(c: Chain, address: string, signal: AbortSignal): Promise<ContractSource | null> {
    const api = opts.home?.blockscoutApi;
    if (!api || c.key !== 'robinhood') return null;
    const j = await getJson(`${api.replace(/\/$/, '')}/smart-contracts/${address}`, signal);
    const main = str(j?.source_code);
    if (!j || !main) return null;
    const mainPath = str(j.file_path) ?? `${str(j.name) ?? 'Contract'}.sol`;
    const extra = (Array.isArray(j.additional_sources) ? j.additional_sources : [])
      .map((s) => obj(s))
      .map((s) => ({ path: str(s?.file_path) ?? '', content: str(s?.source_code) ?? '' }))
      .filter((f) => f.path && f.content);
    return {
      address,
      chainKey: c.key,
      chainName: c.name,
      name: str(j.name),
      compiler: str(j.compiler_version),
      verifiedBy: 'Blockscout',
      match: null,
      files: [{ path: mainPath, content: main }, ...extra],
      mainPath,
      implementation: null,
      explorerUrl: link(c, address),
    };
  }

  async function find(address: string, signal: AbortSignal, hint?: string): Promise<ContractSource | null> {
    const ordered = [...chains].sort((a, b) => (a.key === hint ? -1 : b.key === hint ? 1 : 0));
    const list = hint && chains.some((c) => c.key === hint) ? ordered.filter((c) => c.key === hint) : ordered;
    const attempts = list.flatMap((c, i) =>
      [fromSourcify, fromEtherscan, fromBlockscout].map((f, j) => ({ rank: i * 3 + j, p: f(c, address, signal).catch(() => null) })),
    );
    const results = await Promise.all(attempts.map(async (a) => ({ rank: a.rank, r: await a.p })));
    return results.filter((x) => x.r).sort((a, b) => a.rank - b.rank)[0]?.r ?? null;
  }

  return {
    async fetch(address, signal, chainHint) {
      if (!ADDRESS_RE.test(address)) return null;
      const src = await find(address, signal, chainHint);
      // An upgradeable proxy holds little code: audit its logic contract too, on the same chain.
      if (src?.implementation) {
        const impl = await find(src.implementation, signal, src.chainKey).catch(() => null);
        if (impl) {
          src.files = [...impl.files.map((f) => ({ path: `implementation/${f.path}`, content: f.content })), ...src.files.map((f) => ({ path: `proxy/${f.path}`, content: f.content }))];
          src.mainPath = impl.mainPath ? `implementation/${impl.mainPath}` : null;
          src.name = `${src.name ?? 'Proxy'} → ${impl.name ?? 'implementation'}`;
        }
      }
      return src;
    },
  };
}

const isLibrary = (p: string) => /(^|\/)(@openzeppelin|@uniswap|@chainlink|solmate|solady|forge-std|lib|node_modules)\//i.test(p);

/** Orders files for the model (main, own code, libraries) and cuts to MAX_SOURCE_CHARS. */
export function packSource(src: ContractSource): { text: string; included: string[]; omitted: string[]; lines: number } {
  const files = [...src.files].sort((a, b) => {
    const rank = (f: SourceFile) => (f.path === src.mainPath ? 0 : isLibrary(f.path) ? 2 : 1);
    return rank(a) - rank(b) || a.path.localeCompare(b.path);
  });
  let budget = MAX_SOURCE_CHARS;
  const included: string[] = [];
  const omitted: string[] = [];
  const parts: string[] = [];
  for (const f of files) {
    const block = `// ===== File: ${f.path} =====\n${f.content.trim()}\n`;
    if (block.length <= budget) {
      parts.push(block);
      included.push(f.path);
      budget -= block.length;
    } else if (!included.length) {
      parts.push(`${block.slice(0, budget)}\n// ... file cut here (too long)\n`);
      included.push(`${f.path} (first part)`);
      budget = 0;
    } else omitted.push(f.path);
  }
  const lines = src.files.reduce((n, f) => n + f.content.split('\n').length, 0);
  return { text: parts.join('\n'), included, omitted, lines };
}

/** The audit brief for the model, with the packed source. */
export function auditSystemMessage(src: ContractSource): string {
  const p = packSource(src);
  return (
    `Contract audit request. Verified source code of ${src.name ?? 'the contract'} at ${src.address} on ${src.chainName}, ` +
    `from ${src.verifiedBy}${src.match ? ` (${src.match.replace('_', ' ')})` : ''}${src.compiler ? `, compiler ${src.compiler}` : ''}. ` +
    `${p.lines} lines in ${src.files.length} file${src.files.length === 1 ? '' : 's'}.` +
    (p.omitted.length ? ` Library or extra files left out for length: ${p.omitted.slice(0, 20).join(', ')}.` : '') +
    '\n\nAudit it like a careful smart-contract auditor:\n' +
    '1. One-paragraph overview: what the contract does and who controls it.\n' +
    '2. Findings, most severe first, each with severity (Critical, High, Medium, Low, Info), the function or line, ' +
    'why it matters to a holder, and a fix. Look for: owner/admin powers (mint, pause, blacklist, fee changes, ' +
    'withdraw, upgrade), honeypot-style sell restrictions, hidden fees, reentrancy, unchecked external calls, ' +
    'access-control gaps, arithmetic issues, centralization and rug vectors.\n' +
    '3. A short "Good signs" list.\n' +
    '4. A verdict line in plain words.\n' +
    'Quote function names exactly as in the code. Do not invent code that is not shown. This is an automated ' +
    'review, not a professional audit, and not financial advice: say so in one line at the end.\n\n' +
    p.text
  );
}

export function noSourceMessage(address: string, chains: string[]): string {
  return (
    `Contract audit request for ${address}. No verified source code was found on ${chains.join(', ')} ` +
    '(checked Sourcify, Etherscan and the block explorer). Tell the user the code is not verified, that this is a ' +
    'major red flag because nobody can check what the contract does, and suggest running the Token Scanner and ' +
    'checking the address on the right chain. Do not guess what the code does.'
  );
}
