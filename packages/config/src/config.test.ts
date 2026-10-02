import { describe, expect, it } from 'vitest';
import {
  MODELS,
  LEGACY_MODELS,
  VISION_MODEL,
  contextLabel,
  getModel,
  modelDisplayName,
  loadChainConfig,
  loadContractAddresses,
  tokenAddress,
  nextTier,
  tierForStake,
  tokenCostMicro,
} from './index';

// Fixed prices so the math is tested independently of the model catalog.
const deepseek = { inputPerM: 40, outputPerM: 120 };

describe('model catalog', () => {
  it('resolves legacy ids to their replacements and keeps their names for old usage', () => {
    for (const [old, { to }] of Object.entries(LEGACY_MODELS)) expect(getModel(old)?.id).toBe(to);
    expect(getModel('nope')).toBeUndefined();
    expect(modelDisplayName('deepseek-v3.1')).toBe('DeepSeek V3.1');
    expect(modelDisplayName('kimi-k3')).toBe('Kimi K3');
    expect(modelDisplayName(VISION_MODEL.id)).toBe(VISION_MODEL.name);
    expect(modelDisplayName('image-generation')).toBe('Image generation');
  });
  it('labels context windows and keeps integer prices', () => {
    expect(contextLabel(1024)).toBe('1M');
    expect(contextLabel(262)).toBe('262K');
    for (const m of MODELS) {
      expect(Number.isInteger(m.inputPerM) && Number.isInteger(m.outputPerM)).toBe(true);
      // The UI estimate matches the stated average message (3k tokens in, 700 out).
      expect(Math.abs(m.avgMessageCredits - (3000 * m.inputPerM + 700 * m.outputPerM) / 1e6)).toBeLessThan(0.03);
    }
  });
});

describe('tokenCostMicro', () => {
  it('charges per-million prices exactly', () => {
    // 1M input at 40 cr/M + 1M output at 120 cr/M = 160 credits
    expect(tokenCostMicro(deepseek, 1_000_000, 1_000_000)).toBe(160_000_000n);
    // 1,000 in + 500 out = 0.04 + 0.06 = 0.1 credits
    expect(tokenCostMicro(deepseek, 1_000, 500)).toBe(100_000n);
  });

  it('applies web search ×1.6 and staking discounts', () => {
    expect(tokenCostMicro(deepseek, 1_000, 500, { webSearch: true })).toBe(160_000n);
    expect(tokenCostMicro(deepseek, 1_000, 500, { discountBps: 3_000 })).toBe(70_000n);
    expect(tokenCostMicro(deepseek, 1_000, 500, { webSearch: true, discountBps: 2_000 })).toBe(128_000n);
  });

  it('is zero for zero tokens and rejects bad input', () => {
    expect(tokenCostMicro(deepseek, 0, 0)).toBe(0n);
    expect(() => tokenCostMicro(deepseek, -1, 0)).toThrow(RangeError);
    expect(() => tokenCostMicro(deepseek, 1.5, 0)).toThrow(RangeError);
    expect(() => tokenCostMicro(deepseek, 1, 1, { discountBps: 10_001 })).toThrow(RangeError);
  });

  it('never exceeds the undiscounted list price', () => {
    for (const m of MODELS) {
      for (const [i, o] of [[1, 1], [7, 13], [123_457, 98_765]] as const) {
        const list = (BigInt(i) * BigInt(m.inputPerM) + BigInt(o) * BigInt(m.outputPerM));
        expect(tokenCostMicro(m, i, o)).toBeLessThanOrEqual(list);
      }
    }
  });
});

describe('tiers', () => {
  it('maps stake to tier', () => {
    expect(tierForStake(999)).toBeNull();
    expect(tierForStake(1_000)?.id).toBe('explorer');
    expect(tierForStake(10_000)?.id).toBe('diver');
    expect(tierForStake(1_000_000)?.id).toBe('abyss');
    expect(nextTier(0)?.id).toBe('explorer');
    expect(nextTier(50_000)).toBeNull();
  });
});

describe('chain config', () => {
  const env = {
    CHAIN_ID: '46630',
    RPC_URL: 'https://rpc.example.org/rpc/',
    EXPLORER_URL: 'https://explorer.example.org',
    USDG_ADDRESS: '0x' + 'a'.repeat(40),
  };

  it('loads and normalizes values', () => {
    const c = loadChainConfig(env);
    expect(c.chainId).toBe(46630);
    expect(c.rpcUrl).toBe('https://rpc.example.org/rpc');
    expect(c.name).toBe('Robinhood Chain');
  });

  it('rejects missing or malformed values', () => {
    expect(() => loadChainConfig({ ...env, CHAIN_ID: '' })).toThrow(/CHAIN_ID/);
    expect(() => loadChainConfig({ ...env, CHAIN_ID: 'abc' })).toThrow(/CHAIN_ID/);
    expect(() => loadChainConfig({ ...env, USDG_ADDRESS: '0x123' })).toThrow(/USDG_ADDRESS/);
    expect(() => loadChainConfig({ ...env, RPC_URL: 'nope' })).toThrow(/RPC_URL/);
  });

  it('treats undeployed contracts as null', () => {
    expect(loadContractAddresses({}).creditVault).toBeNull();
  });
});

describe('tokenAddress', () => {
  it('is null until a valid address is set', () => {
    expect(tokenAddress({})).toBeNull();
    expect(tokenAddress({ TOKEN_ADDRESS: '0x123' })).toBeNull();
    const a = '0x' + 'ab'.repeat(20);
    expect(tokenAddress({ TOKEN_ADDRESS: a })).toBe(a);
    expect(tokenAddress({ FTHM_ADDRESS: a })).toBe(a);
  });
});
