import type { Address } from 'viem';
import type { ChatMessage } from '../inference';
import { tokenSystemMessage, type TokenReport, type TokenScanner } from './blockscout';
import { detectPriceQuestion, priceSystemMessage, type CoinPrice, type PriceFeed } from './prices';

export type { TokenReport, RiskFlag, TokenScanner } from './blockscout';
export type { CoinPrice, PriceFeed } from './prices';
export { createTokenScanner, tokenSystemMessage } from './blockscout';
export { createCoinGecko, detectPriceQuestion, priceSystemMessage } from './prices';

/** Crypto tools for the app's chat. Each is null when not configured. */
export interface CryptoTools {
  scanner: TokenScanner | null;
  prices: PriceFeed | null;
}

export type ToolEvent =
  | { type: 'tool'; tool: 'token'; status: 'running' }
  | { type: 'tool'; tool: 'token'; status: 'done'; report: TokenReport }
  | { type: 'tool'; tool: 'price'; status: 'running' }
  | { type: 'tool'; tool: 'price'; status: 'done'; prices: CoinPrice[] }
  | { type: 'tool'; tool: 'token' | 'price'; status: 'unavailable' };

const ADDRESS_RE = /\b0x[a-fA-F0-9]{40}\b/;

/** The first contract/wallet address in a message, if any. */
export function detectAddress(text: string): Address | null {
  const m = text.match(ADDRESS_RE);
  return m ? (m[0] as Address) : null;
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
      tools.scanner.scan(address, signal).then(
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
