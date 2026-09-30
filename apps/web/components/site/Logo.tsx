import Link from 'next/link';
import { brand } from '@fathom/config';
import { LogoMark } from '../LogoMark';

export function Logo() {
  return (
    <Link href="/" className="logo">
      <LogoMark />
      {brand.name}
    </Link>
  );
}
