import { LOGO_SVG } from '@/lib/logo';

/** The Noxsea mark. Size comes from `.logo-mark` (and `.gate .logo-mark`) in globals.css. */
export function LogoMark() {
  return <span className="logo-mark" aria-hidden="true" dangerouslySetInnerHTML={{ __html: LOGO_SVG }} />;
}
