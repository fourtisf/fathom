import { brand, loadContractAddresses, type Address } from '@fathom/config';

/** Live attestation fields shown on /trust. Supplied by provider.attestation() (CLAUDE.md §6). */
export interface Attestation {
  hardware: string;
  measurement: string;
  modelHash: string;
  servingCommit: string;
  signedAt: string;
  verified: boolean;
}

/**
 * Not wired yet: the inference provider is still to be chosen (CLAUDE.md §13.2).
 * Until then /trust shows an explicit "not live" state rather than sample values.
 */
export async function getAttestation(): Promise<Attestation | null> {
  return null;
}

export interface ContractRow {
  name: string;
  purpose: string;
  address: Address | null;
}

export function getContracts(): ContractRow[] {
  const a = loadContractAddresses();
  return [
    { name: 'CreditVault', purpose: 'Receives top-ups, mints credits', address: a.creditVault },
    { name: 'SwapRouter', purpose: 'Converts USDC / ETH to USDG', address: a.swapRouter },
    { name: `${brand.token.symbol} Token`, purpose: 'Utility token', address: a.fthm },
    { name: 'StakingTiers', purpose: 'Discount tiers, 7-day cooldown', address: a.staking },
  ];
}

export function explorerAddressUrl(address: string): string | null {
  const base = process.env.EXPLORER_URL?.trim().replace(/\/$/, '');
  return base ? `${base}/address/${address}` : null;
}

export interface ServiceStatus {
  name: string;
  /** 90 daily buckets, oldest first; null means no data for that day. */
  days: ('ok' | 'warn' | 'down' | null)[];
  uptime: string | null;
}

/** Filled from real monitoring in Phase 7; until then every day reads "no data". */
export async function getStatus(): Promise<ServiceStatus[]> {
  const empty = Array<null>(90).fill(null);
  return ['Chat app', 'API', 'Enclave attestation', 'Top-ups (CreditVault)', 'Web search egress'].map((name) => ({
    name,
    days: empty,
    uptime: null,
  }));
}
