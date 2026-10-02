import { describe, expect, it } from 'vitest';
import { createSourceFetcher, parseEtherscanSource, packSource, auditSystemMessage, MAX_SOURCE_CHARS } from '../src/crypto/source';
import { runCryptoTools, wantsAudit, type ToolEvent } from '../src/crypto';

const A = '0xAbCdEf0123456789aBcDeF0123456789abCDef01';
const IMPL = '0x1111111111111111111111111111111111111111';
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

/** Sourcify knows A on Base (chain 8453) as a proxy, and IMPL as its logic contract. */
function fakeServices(urls: string[]) {
  return (async (input: string | URL | Request) => {
    const u = String(input);
    urls.push(u);
    if (u.includes(`/v2/contract/8453/${A}`)) {
      return json({
        match: 'exact_match',
        compilation: { name: 'TokenProxy', compilerVersion: '0.8.24', fullyQualifiedName: 'src/TokenProxy.sol:TokenProxy' },
        sources: { 'src/TokenProxy.sol': { content: 'contract TokenProxy { function upgradeTo(address) external {} }' } },
        proxyResolution: { isProxy: true, implementations: [{ address: IMPL }] },
      });
    }
    if (u.includes(`/v2/contract/8453/${IMPL}`)) {
      return json({
        match: 'match',
        compilation: { name: 'Token', fullyQualifiedName: 'src/Token.sol:Token' },
        sources: {
          'src/Token.sol': { content: 'contract Token { function mint(address to, uint256 a) external onlyOwner {} }' },
          '@openzeppelin/contracts/access/Ownable.sol': { content: 'abstract contract Ownable {}' },
        },
      });
    }
    return new Response('{"error":"not found"}', { status: 404, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

describe('contract audit sources', () => {
  it('detects audit requests', () => {
    expect(wantsAudit(`Audit this contract: ${A}`)).toBe(true);
    expect(wantsAudit(`please review the code of ${A}`)).toBe(true);
    expect(wantsAudit(`Check this token for red flags: ${A}`)).toBe(false);
  });

  it('parses Etherscan source formats', () => {
    expect(parseEtherscanSource('pragma solidity ^0.8.0; contract A {}', 'A')).toEqual([{ path: 'A.sol', content: 'pragma solidity ^0.8.0; contract A {}' }]);
    const std = '{{"language":"Solidity","sources":{"a/B.sol":{"content":"contract B {}"}}}}';
    expect(parseEtherscanSource(std, 'B')).toEqual([{ path: 'a/B.sol', content: 'contract B {}' }]);
    expect(parseEtherscanSource('{"C.sol":{"content":"contract C {}"}}', 'C')).toEqual([{ path: 'C.sol', content: 'contract C {}' }]);
  });

  it('finds the chain on Sourcify, follows the proxy to its logic and packs main code before libraries', async () => {
    const urls: string[] = [];
    const f = createSourceFetcher({ home: { chainId: 4663, name: 'Robinhood Chain', explorerUrl: null, blockscoutApi: null }, sourcifyUrl: 'https://s.test/server', fetch: fakeServices(urls) });
    const src = (await f.fetch(A, new AbortController().signal))!;
    expect(src).toMatchObject({ chainKey: 'base', verifiedBy: 'Sourcify', match: 'exact_match', explorerUrl: `https://basescan.org/address/${A}` });
    expect(src.name).toBe('TokenProxy → Token');
    expect(src.files.map((x) => x.path)).toEqual(['implementation/src/Token.sol', 'implementation/@openzeppelin/contracts/access/Ownable.sol', 'proxy/src/TokenProxy.sol']);
    const p = packSource(src);
    expect(p.included[0]).toBe('implementation/src/Token.sol');
    expect(p.included.at(-1)).toContain('Ownable.sol');
    const msg = auditSystemMessage(src);
    expect(msg).toContain('function mint');
    expect(msg).toContain('Sourcify (exact match)');
    // Every supported EVM chain was tried, including Robinhood Chain's id.
    expect(urls.some((u) => u.includes('/v2/contract/4663/'))).toBe(true);
    // With a chain hint, only that chain is asked.
    const hinted: string[] = [];
    await createSourceFetcher({ home: null, sourcifyUrl: 'https://s.test/server', fetch: fakeServices(hinted) }).fetch(A, new AbortController().signal, 'base');
    expect(hinted.filter((u) => u.includes(A)).every((u) => u.includes('/8453/'))).toBe(true);
  });

  it('cuts long sources at the budget', () => {
    const big = 'x'.repeat(MAX_SOURCE_CHARS * 2);
    const p = packSource({ address: A, chainKey: 'base', chainName: 'Base', name: 'Big', compiler: null, verifiedBy: 'Sourcify', match: null, files: [{ path: 'Big.sol', content: big }, { path: 'lib/X.sol', content: 'y' }], mainPath: 'Big.sol', implementation: null, explorerUrl: null });
    expect(p.text.length).toBeLessThan(MAX_SOURCE_CHARS + 200);
    expect(p.omitted).toEqual(['lib/X.sol']);
  });

  it('runs instead of the token scan in chat, and reports unverified code', async () => {
    const events: ToolEvent[] = [];
    let scanned = 0;
    const tools = {
      scanner: { scan: async () => { scanned++; throw new Error('no'); } },
      prices: null,
      sources: createSourceFetcher({ home: null, sourcifyUrl: 'https://s.test/server', fetch: fakeServices([]) }),
    };
    const msgs = await runCryptoTools(tools, `Audit this contract on Base: ${A}`, new AbortController().signal, (e) => events.push(e), () => {});
    expect(scanned).toBe(0);
    expect(events.map((e) => e.status)).toEqual(['running', 'done']);
    expect((events[1] as any).audit).toMatchObject({ chain: 'Base', verifiedBy: 'Sourcify', files: 3 });
    expect(msgs[0]!.content).toContain('Contract audit request');

    const ev2: ToolEvent[] = [];
    const m2 = await runCryptoTools(tools, 'Audit 0x2222222222222222222222222222222222222222', new AbortController().signal, (e) => ev2.push(e), () => {});
    expect(ev2.map((e) => e.status)).toEqual(['running', 'missing']);
    expect(m2[0]!.content).toContain('No verified source code');
  });
});
