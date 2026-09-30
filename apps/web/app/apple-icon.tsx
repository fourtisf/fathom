import { ImageResponse } from 'next/og';
import { LOGO_SVG_SQUARE, svgDataUri } from '@/lib/logo';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element
    <img src={svgDataUri(LOGO_SVG_SQUARE)} width={180} height={180} alt="" />,
    size,
  );
}
