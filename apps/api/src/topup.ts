import type { FastifyBaseLogger } from 'fastify';
import type { Redis } from 'ioredis';
import {
  TransactionReceiptNotFoundError,
  decodeEventLog,
  erc20Abi,
  formatUnits,
  parseAbiItem,
  parseUnits,
  type Address,
  type Hex,
} from 'viem';
import { CREDITS_PER_USDG } from '@fathom/config';
import type { PrismaClient } from '@fathom/db';
import type { TopupEnv } from './env';
import { withTimeout, type ChainClient } from './chain';

/**
 * USDG top-ups: the user transfers USDG straight to the treasury, then either calls
 * POST /credits/topup with the tx hash or waits for the in-process indexer. Both paths
 * end in creditTopup(), which is idempotent by the unique Transaction.txHash.
 * Credits = value × 100 per USDG, exact in bigint micro-credits.
 * Addresses and hashes are public on-chain but still never logged.
 */

export const TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
const LAST_BLOCK_KEY = 'indexer:lastBlock';
const MAX_BLOCK_RANGE = 2_000n;
const FIRST_RUN_LOOKBACK = 5_000n;
const PENDING_RECHECK_MS = 30_000;
/** A PENDING top-up whose receipt never appears is marked FAILED after this long (dropped tx). */
const PENDING_EXPIRY_MS = 24 * 3_600_000;

export type ClaimResult =
  | { kind: 'confirmed'; creditsMicro: bigint; balanceMicro: bigint }
  | { kind: 'pending'; confirmations?: number; required?: number }
  | { kind: 'error'; status: 400 | 403 | 409 | 503; code: 'tx_failed' | 'not_sender' | 'below_minimum' | 'tx_claimed' | 'chain_unavailable'; message: string };

export class TopupService {
  decimals: number | null = null;
  /** Epoch ms of the indexer's last successful tick (status page). */
  lastTickAt = 0;
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(
    readonly env: TopupEnv,
    private readonly client: ChainClient,
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
    private readonly log: FastifyBaseLogger,
  ) {}

  get ready(): boolean {
    return this.decimals !== null;
  }

  /** Reads decimals() once; on failure top-ups stay disabled and the indexer retries each tick. */
  async loadDecimals(): Promise<boolean> {
    if (this.decimals !== null) return true;
    try {
      const d = await withTimeout(
        this.client.readContract({ address: this.env.usdg, abi: erc20Abi, functionName: 'decimals' }),
      );
      if (!Number.isInteger(d) || d < 0 || d > 36) throw new Error('bad decimals');
      this.decimals = d;
      return true;
    } catch (err) {
      this.log.warn({ err }, 'could not read USDG decimals; top-ups disabled until it succeeds');
      return false;
    }
  }

  creditsMicroFor(value: bigint): bigint {
    return (value * BigInt(CREDITS_PER_USDG) * 1_000_000n) / 10n ** BigInt(this.decimals!);
  }

  private minRaw(): bigint {
    return parseUnits(String(this.env.minUsd), this.decimals!);
  }

  /** Credits a verified transfer exactly once. Returns null when another user already owns it. */
  async creditTopup(
    userId: string,
    txHash: string,
    value: bigint,
  ): Promise<{ creditsMicro: bigint; balanceMicro: bigint } | null> {
    const creditsMicro = this.creditsMicroFor(value);
    const amountPaid = formatUnits(value, this.decimals!);
    const attempt = () =>
      this.prisma.$transaction(async (tx) => {
        const users = await tx.$queryRaw<{ creditsMicro: bigint }[]>`
          SELECT "creditsMicro" FROM "User" WHERE id = ${userId} FOR UPDATE`;
        if (!users[0]) throw new Error('user not found');
        const rows = await tx.$queryRaw<{ id: string; userId: string; status: string; creditsMicro: bigint }[]>`
          SELECT id, "userId", status::text AS status, "creditsMicro" FROM "Transaction" WHERE "txHash" = ${txHash} FOR UPDATE`;
        const row = rows[0];
        if (row?.status === 'CONFIRMED') {
          if (row.userId !== userId) return null;
          return { creditsMicro: row.creditsMicro, balanceMicro: users[0].creditsMicro };
        }
        // A PENDING/FAILED row filed by someone else loses to the on-chain sender: take it over.
        const data = {
          userId,
          type: 'TOPUP' as const,
          token: 'USDG',
          amountPaid,
          creditsMicro,
          status: 'CONFIRMED' as const,
        };
        if (row) await tx.transaction.update({ where: { id: row.id }, data });
        else await tx.transaction.create({ data: { ...data, txHash } });
        await tx.$executeRaw`
          UPDATE "User" SET "creditsMicro" = "creditsMicro" + ${creditsMicro} WHERE id = ${userId}`;
        return { creditsMicro, balanceMicro: users[0].creditsMicro + creditsMicro };
      });
    try {
      return await attempt();
    } catch (err) {
      // A concurrent insert of the same txHash: the retry sees the row and is idempotent.
      if ((err as { code?: string }).code === 'P2002') return attempt();
      throw err;
    }
  }

  private async upsertOwnRow(
    userId: string,
    txHash: string,
    data: { status: 'PENDING' | 'FAILED'; amountPaid?: string | null },
  ): Promise<void> {
    const existing = await this.prisma.transaction.findUnique({ where: { txHash } });
    if (existing) {
      if (existing.userId === userId && existing.status !== 'CONFIRMED') {
        await this.prisma.transaction.update({ where: { id: existing.id }, data: { ...data, creditsMicro: 0n } });
      }
      return;
    }
    try {
      await this.prisma.transaction.create({
        data: { userId, txHash, type: 'TOPUP', token: 'USDG', creditsMicro: 0n, ...data },
      });
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
    }
  }

  private async dropOwnRow(userId: string, txHash: string): Promise<void> {
    await this.prisma.transaction.deleteMany({ where: { txHash, userId, status: { not: 'CONFIRMED' } } });
  }

  /** Verifies a tx hash for a user and credits it once it has enough confirmations. */
  async claim(userId: string, userAddress: string, txHash: Hex): Promise<ClaimResult> {
    const hash = txHash.toLowerCase() as Hex;
    const existing = await this.prisma.transaction.findUnique({ where: { txHash: hash } });
    if (existing?.status === 'CONFIRMED') {
      if (existing.userId !== userId) {
        return { kind: 'error', status: 409, code: 'tx_claimed', message: 'This transaction was already used for a top-up' };
      }
      const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { creditsMicro: true } });
      return { kind: 'confirmed', creditsMicro: existing.creditsMicro, balanceMicro: u.creditsMicro };
    }

    let receipt;
    let head: bigint;
    try {
      receipt = await withTimeout(this.client.getTransactionReceipt({ hash }));
      head = await withTimeout(this.client.getBlockNumber({ cacheTime: 0 }));
    } catch (err) {
      if (err instanceof TransactionReceiptNotFoundError) {
        if (existing && Date.now() - existing.createdAt.getTime() > PENDING_EXPIRY_MS && existing.userId === userId) {
          await this.upsertOwnRow(userId, hash, { status: 'FAILED' });
          return { kind: 'error', status: 400, code: 'tx_failed', message: 'Transaction was not found on-chain' };
        }
        await this.upsertOwnRow(userId, hash, { status: 'PENDING' });
        return { kind: 'pending' };
      }
      this.log.warn({ err }, 'top-up receipt lookup failed');
      return { kind: 'error', status: 503, code: 'chain_unavailable', message: 'The network is not reachable right now. Try again shortly.' };
    }

    const me = userAddress.toLowerCase();
    if (receipt.status !== 'success') {
      if (receipt.from.toLowerCase() === me) await this.upsertOwnRow(userId, hash, { status: 'FAILED' });
      else await this.dropOwnRow(userId, hash);
      return { kind: 'error', status: 400, code: 'tx_failed', message: 'Transaction failed on-chain (reverted). No credits were added.' };
    }

    const usdg = this.env.usdg.toLowerCase();
    const treasury = this.env.treasury.toLowerCase();
    let value = 0n;
    let found = false;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== usdg) continue;
      try {
        const ev = decodeEventLog({ abi: [TRANSFER_EVENT], data: log.data, topics: log.topics });
        if (ev.args.to.toLowerCase() === treasury && ev.args.from.toLowerCase() === me) {
          value += ev.args.value;
          found = true;
        }
      } catch {
        // not a Transfer
      }
    }
    if (!found) {
      await this.dropOwnRow(userId, hash);
      return { kind: 'error', status: 403, code: 'not_sender', message: 'No USDG transfer from your wallet to the treasury in this transaction' };
    }
    if (value < this.minRaw()) {
      await this.dropOwnRow(userId, hash);
      return { kind: 'error', status: 400, code: 'below_minimum', message: `The minimum top-up is ${this.env.minUsd} USDG` };
    }

    const confirmations = Number(head - receipt.blockNumber + 1n);
    const required = this.env.confirmations;
    if (confirmations < required) {
      await this.upsertOwnRow(userId, hash, { status: 'PENDING', amountPaid: formatUnits(value, this.decimals!) });
      return { kind: 'pending', confirmations: Math.max(0, confirmations), required };
    }

    const credited = await this.creditTopup(userId, hash, value);
    if (!credited) {
      return { kind: 'error', status: 409, code: 'tx_claimed', message: 'This transaction was already used for a top-up' };
    }
    return { kind: 'confirmed', ...credited };
  }

  // ---- Indexer ----

  start(intervalMs = 15_000): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One indexer pass. Never throws; logs counts and block numbers only. */
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      if (!(await this.loadDecimals())) return;
      const stats = await this.scanTransfers();
      const rechecked = await this.recheckPending();
      this.lastTickAt = Date.now();
      if (stats.logs > 0 || rechecked > 0) this.log.info({ ...stats, rechecked }, 'top-up indexer tick');
    } catch (err) {
      this.log.warn({ err }, 'top-up indexer tick failed');
    } finally {
      this.ticking = false;
    }
  }

  private async scanTransfers(): Promise<{ fromBlock?: string; toBlock?: string; logs: number; credited: number }> {
    const head = await withTimeout(this.client.getBlockNumber({ cacheTime: 0 }));
    // Only scan blocks that already have enough confirmations, so each log is final when seen.
    const safe = head - BigInt(this.env.confirmations) + 1n;
    const saved = await this.redis.get(LAST_BLOCK_KEY);
    const from = saved !== null
      ? BigInt(saved) + 1n
      : (this.env.startBlock ?? (head > FIRST_RUN_LOOKBACK ? head - FIRST_RUN_LOOKBACK : 0n));
    if (safe < 0n || from > safe) return { logs: 0, credited: 0 };
    const to = from + MAX_BLOCK_RANGE - 1n < safe ? from + MAX_BLOCK_RANGE - 1n : safe;

    const logs = await withTimeout(
      this.client.getLogs({
        address: this.env.usdg,
        event: TRANSFER_EVENT,
        args: { to: this.env.treasury },
        fromBlock: from,
        toBlock: to,
      }),
      15_000,
    );
    // Sum per (tx, sender); a tx is credited to the user whose wallet sent the USDG.
    const perTx = new Map<string, { from: string; value: bigint }>();
    for (const l of logs) {
      if (!l.transactionHash || l.removed || !l.args.from || l.args.value === undefined) continue;
      if (l.args.to?.toLowerCase() !== this.env.treasury.toLowerCase()) continue;
      const key = `${l.transactionHash.toLowerCase()}|${l.args.from.toLowerCase()}`;
      const cur = perTx.get(key);
      perTx.set(key, { from: l.args.from.toLowerCase(), value: (cur?.value ?? 0n) + l.args.value });
    }
    let credited = 0;
    if (perTx.size > 0) {
      const senders = [...new Set([...perTx.values()].map((v) => v.from))];
      const users = await this.prisma.user.findMany({ where: { address: { in: senders } }, select: { id: true, address: true } });
      const byAddr = new Map(users.map((u) => [u.address, u.id]));
      const min = this.minRaw();
      for (const [key, { from: sender, value }] of perTx) {
        const userId = byAddr.get(sender);
        if (!userId || value < min) continue;
        const res = await this.creditTopup(userId, key.split('|')[0]!, value);
        if (res) credited++;
      }
    }
    await this.redis.set(LAST_BLOCK_KEY, to.toString());
    return { fromBlock: from.toString(), toBlock: to.toString(), logs: logs.length, credited };
  }

  /** Re-runs the claim for PENDING top-ups older than 30s. */
  private async recheckPending(): Promise<number> {
    const rows = await this.prisma.transaction.findMany({
      where: { type: 'TOPUP', status: 'PENDING', txHash: { not: null }, createdAt: { lt: new Date(Date.now() - PENDING_RECHECK_MS) } },
      select: { txHash: true, userId: true, user: { select: { address: true } } },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    for (const r of rows) {
      await this.claim(r.userId, r.user.address, r.txHash as Hex);
    }
    return rows.length;
  }
}

export function publicTopupConfig(svc: TopupService | null) {
  if (!svc?.ready) return null;
  return {
    token: { symbol: 'USDG' as const, address: svc.env.usdg as Address, decimals: svc.decimals! },
    treasury: svc.env.treasury,
    minUsd: svc.env.minUsd,
    confirmations: svc.env.confirmations,
    creditsPerUsd: CREDITS_PER_USDG,
  };
}
