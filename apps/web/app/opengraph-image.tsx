import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { brand } from '@fathom/config';
import { LOGO_SVG, svgDataUri } from '@/lib/logo';

export const alt = brand.title;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const fontDir = join(process.cwd(), 'node_modules/geist/dist/fonts/geist-sans');

export default async function OgImage() {
  const [regular, semibold] = await Promise.all([
    readFile(join(fontDir, 'Geist-Regular.ttf')),
    readFile(join(fontDir, 'Geist-SemiBold.ttf')),
  ]);
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 96px',
          color: '#F1F2FF',
          fontFamily: 'Geist',
          background:
            'radial-gradient(ellipse 60% 70% at 50% 0%, rgba(111,108,255,.45), transparent 70%), linear-gradient(180deg,#070B22,#03050F)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 40, fontWeight: 600 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={svgDataUri(LOGO_SVG)} width={72} height={72} alt="" />
          {brand.name}
        </div>
        <div style={{ display: 'flex', marginTop: 48, fontSize: 84, fontWeight: 600, letterSpacing: -3, lineHeight: 1.05 }}>
          The AI that forgets you on purpose
        </div>
        <div style={{ display: 'flex', marginTop: 32, fontSize: 32, color: '#B7BCDD' }}>{brand.socialDescription}</div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Geist', data: regular, weight: 400 },
        { name: 'Geist', data: semibold, weight: 600 },
      ],
    },
  );
}
