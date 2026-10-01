import type { CoinPrice, TokenReport } from './crypto-types';

/** What a shared link contains, encrypted in the browser. Attached documents are never included. */
export interface ShareDoc {
  v: 1;
  title: string;
  createdAt: string;
  turns: (
    | { kind: 'you'; text: string; doc?: { name: string; pages: number | null } }
    | { kind: 'ai'; slots: { model: string; text: string }[]; token?: TokenReport; prices?: CoinPrice[] }
  )[];
}
