import Link from 'next/link';
import { brand } from '@fathom/config';
import { Icon } from '../Icon';

export function Logo() {
  return (
    <Link href="/" className="logo">
      <span className="logo-mark">
        <Icon name="mk" />
      </span>
      {brand.name}
    </Link>
  );
}
