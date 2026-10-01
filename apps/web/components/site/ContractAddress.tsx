import { shortAddress, tokenAddress } from '@fathom/config';
import { explorerAddressUrl } from '@/lib/trust';
import { CopyButton } from '../trust/CopyButton';

/**
 * The token contract address ("CA"). Shows "Coming soon" until TOKEN_ADDRESS is set, then the
 * address with copy and explorer links. Read at build/request time on the server only.
 */
export function ContractAddress({ full = false, className = '' }: { full?: boolean; className?: string }) {
  const ca = tokenAddress();
  if (!ca) {
    return (
      <div className={`ca ${className}`} aria-label="Contract address: coming soon">
        <span className="ca-k">CA</span>
        <span className="ca-v ca-soon"><i aria-hidden="true" />Coming soon</span>
      </div>
    );
  }
  const href = explorerAddressUrl(ca);
  const shown = full ? ca : shortAddress(ca);
  return (
    <div className={`ca ${className}`}>
      <span className="ca-k">CA</span>
      {href ? (
        <a className="ca-v mono" href={href} target="_blank" rel="noopener noreferrer" title={ca}>{shown}</a>
      ) : (
        <span className="ca-v mono" title={ca}>{shown}</span>
      )}
      <CopyButton text={ca} message="Contract address copied" />
    </div>
  );
}
