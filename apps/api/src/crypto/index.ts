import type { ChatMessage } from '../inference';
import { tokenSystemMessage, type TokenReport } from './blockscout';
import { chainHint, detectSolanaAddress, type MultiScanner } from './multichain';
import { detectPriceQuestion, priceSystemMessage, type CoinPrice, type PriceFeed } from './prices';

export type { TokenReport, RiskFlag, TokenScanner } from './blockscout';
export type { CoinPrice, PriceFeed } from './prices';
export { createTokenScanner, tokenSystemMessage } from './blockscout';
export { createMultiScanner, ScanInputError, chainHint, detectSolanaAddress, type MultiScanner } from './multichain';
export { createSolanaScanner } from './solana';
export { createDexScreener, type MarketFeed } from './market';
export { createGoPlus, type SecurityFeed } from './goplus';
export { createCoinGecko, detectPriceQuestion, priceSystemMessage } from './prices';

/** Crypto tools for the app's chat. Each is null when not configured. */
export interface CryptoTools {
  scanner: (Pick<MultiScanner, 'scan'> & Partial<Pick<MultiScanner, 'chains'>>) | null;
  prices: PriceFeed | null;
}

export type ToolEvent =
  | { type: 'tool'; tool: 'token'; status: 'running' }
  | { type: 'tool'; tool: 'token'; status: 'done'; report: TokenReport }
  | { type: 'tool'; tool: 'price'; status: 'running' }
  | { type: 'tool'; tool: 'price'; status: 'done'; prices: CoinPrice[] }
  | { type: 'tool'; tool: 'token' | 'price'; status: 'unavailable' };

const ADDRESS_RE = /\b0x[a-fA-F0-9]{40}\b/;

/** The first contract/wallet address in a message (0x… or a Solana address), if any. */
export function detectAddress(text: string): string | null {
  const m = text.match(ADDRESS_RE);
  return m ? m[0] : detectSolanaAddress(text);
}

/** The chain to scan for a chat message: the one it names, if that fits the address, else auto-detect. */
function chainFor(text: string, address: string): string {
  const hint = chainHint(text);
  const solana = !address.startsWith('0x');
  return (hint === 'solana') === solana ? hint : 'auto';
}

/**
 * Runs the tools the latest user message calls for and returns extra system messages for the model.
 * A tool that fails is reported as unavailable and the answer continues without it.
 */
export async function runCryptoTools(
  tools: CryptoTools,
  text: string,
  signal: AbortSignal,
  emit: (ev: ToolEvent) => void,
  onError: (tool: 'token' | 'price', err: unknown) => void,
): Promise<ChatMessage[]> {
  const out: ChatMessage[] = [];
  const address = tools.scanner ? detectAddress(text) : null;
  const coins = tools.prices && !address ? detectPriceQuestion(text) : [];

  const jobs: Promise<void>[] = [];
  if (address && tools.scanner) {
    emit({ type: 'tool', tool: 'token', status: 'running' });
    jobs.push(
      tools.scanner.scan(address, signal, chainFor(text, address)).then(
        (report) => {
          out.push({ role: 'system', content: tokenSystemMessage(report) });
          emit({ type: 'tool', tool: 'token', status: 'done', report });
        },
        (err: unknown) => {
          if (signal.aborted) return;
          onError('token', err);
          emit({ type: 'tool', tool: 'token', status: 'unavailable' });
        },
      ),
    );
  }
  if (coins.length && tools.prices) {
    emit({ type: 'tool', tool: 'price', status: 'running' });
    jobs.push(
      tools.prices.prices(coins, signal).then(
        (prices) => {
          if (prices.length) out.push({ role: 'system', content: priceSystemMessage(prices, new Date()) });
          emit(prices.length ? { type: 'tool', tool: 'price', status: 'done', prices } : { type: 'tool', tool: 'price', status: 'unavailable' });
        },
        (err: unknown) => {
          if (signal.aborted) return;
          onError('price', err);
          emit({ type: 'tool', tool: 'price', status: 'unavailable' });
        },
      ),
    );
  }
  await Promise.all(jobs);
  return out;
}
