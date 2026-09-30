import {
  createPublicClient,
  custom,
  encodeAbiParameters,
  encodeEventTopics,
  keccak256,
  numberToHex,
  toHex,
  type Address,
  type Hex,
} from 'viem';
import { TRANSFER_EVENT } from '../src/topup';

/**
 * In-memory JSON-RPC chain behind a viem `custom` transport, so tests exercise viem's
 * real request encoding and response decoding without any network.
 */

interface RawLog {
  address: Address;
  topics: Hex[];
  data: Hex;
  blockNumber: bigint;
  transactionHash: Hex;
  logIndex: number;
}

interface FakeTx {
  hash: Hex;
  from: Address;
  status: 'success' | 'reverted';
  blockNumber: bigint;
  logs: RawLog[];
}

let seq = 0;
export const randomHash = (): Hex => keccak256(toHex(`fake-${Date.now()}-${Math.random()}-${seq++}`));

export class FakeChain {
  head = 10_000n;
  decimals = 6;
  txCounts = new Map<string, number>();
  balances = new Map<string, bigint>();
  txs = new Map<string, FakeTx>();
  /** Methods that fail (simulates RPC errors). */
  failing = new Set<string>();
  calls: string[] = [];

  constructor(readonly usdg: Address) {}

  client() {
    return createPublicClient({
      transport: custom({ request: (args: { method: string; params?: unknown }) => this.request(args) }, { retryCount: 0 }),
    });
  }

  /** Adds a mined tx with USDG transfers; returns its hash. */
  addTransferTx(o: {
    from: Address;
    transfers: { from?: Address; to: Address; value: bigint; token?: Address }[];
    block?: bigint;
    status?: 'success' | 'reverted';
    hash?: Hex;
  }): Hex {
    const hash = o.hash ?? randomHash();
    const blockNumber = o.block ?? this.head;
    const logs: RawLog[] =
      o.status === 'reverted'
        ? []
        : o.transfers.map((t, i) => ({
            address: t.token ?? this.usdg,
            topics: encodeEventTopics({ abi: [TRANSFER_EVENT], eventName: 'Transfer', args: { from: t.from ?? o.from, to: t.to } }) as Hex[],
            data: encodeAbiParameters([{ type: 'uint256' }], [t.value]),
            blockNumber,
            transactionHash: hash,
            logIndex: i,
          }));
    this.txs.set(hash.toLowerCase(), { hash, from: o.from, status: o.status ?? 'success', blockNumber, logs });
    return hash;
  }

  private rpcLog(l: RawLog) {
    return {
      address: l.address,
      topics: l.topics,
      data: l.data,
      blockNumber: numberToHex(l.blockNumber),
      blockHash: keccak256(numberToHex(l.blockNumber)),
      transactionHash: l.transactionHash,
      transactionIndex: '0x0',
      logIndex: numberToHex(l.logIndex),
      removed: false,
    };
  }

  async request({ method, params }: { method: string; params?: unknown }): Promise<unknown> {
    this.calls.push(method);
    if (this.failing.has(method) || this.failing.has('*')) throw new Error(`fake rpc failure: ${method}`);
    const p = (params ?? []) as unknown[];
    switch (method) {
      case 'eth_chainId':
        return numberToHex(46630);
      case 'eth_blockNumber':
        return numberToHex(this.head);
      case 'eth_getTransactionCount':
        return numberToHex(this.txCounts.get(String(p[0]).toLowerCase()) ?? 0);
      case 'eth_getBalance':
        return numberToHex(this.balances.get(String(p[0]).toLowerCase()) ?? 0n);
      case 'eth_call': {
        const call = p[0] as { to: string; data: string };
        // decimals() selector
        if (call.to.toLowerCase() === this.usdg.toLowerCase() && call.data.startsWith('0x313ce567')) {
          return encodeAbiParameters([{ type: 'uint8' }], [this.decimals]);
        }
        throw new Error('unsupported eth_call');
      }
      case 'eth_getTransactionReceipt': {
        const tx = this.txs.get(String(p[0]).toLowerCase());
        if (!tx || tx.blockNumber > this.head) return null;
        return {
          transactionHash: tx.hash,
          transactionIndex: '0x0',
          blockHash: keccak256(numberToHex(tx.blockNumber)),
          blockNumber: numberToHex(tx.blockNumber),
          from: tx.from,
          to: this.usdg,
          cumulativeGasUsed: '0x5208',
          gasUsed: '0x5208',
          effectiveGasPrice: '0x1',
          contractAddress: null,
          logs: tx.logs.map((l) => this.rpcLog(l)),
          logsBloom: `0x${'0'.repeat(512)}`,
          status: tx.status === 'success' ? '0x1' : '0x0',
          type: '0x2',
        };
      }
      case 'eth_getLogs': {
        const f = p[0] as { address?: string; topics?: (string | string[] | null)[]; fromBlock: Hex; toBlock: Hex };
        const from = BigInt(f.fromBlock);
        const to = BigInt(f.toBlock);
        const out: unknown[] = [];
        for (const tx of this.txs.values()) {
          for (const l of tx.logs) {
            if (l.blockNumber < from || l.blockNumber > to) continue;
            if (f.address && l.address.toLowerCase() !== f.address.toLowerCase()) continue;
            const topicsOk = (f.topics ?? []).every((t, i) => {
              if (t === null) return true;
              const want = (Array.isArray(t) ? t : [t]).map((x) => x.toLowerCase());
              return want.includes((l.topics[i] ?? '').toLowerCase());
            });
            if (topicsOk) out.push(this.rpcLog(l));
          }
        }
        return out;
      }
      default:
        throw new Error(`fake chain: unsupported method ${method}`);
    }
  }
}
