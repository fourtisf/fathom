import { ImageResponse } from 'next/og';
import { brand } from '@fathom/config';

export const alt = brand.title;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
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
          background:
            'radial-gradient(ellipse 60% 70% at 50% 0%, rgba(111,108,255,.45), transparent 70%), linear-gradient(180deg,#070B22,#03050F)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 40, fontWeight: 600 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: 'linear-gradient(135deg,#8B7CFF 0%,#5B6CFF 45%,#38C8E8 100%)',
            }}
          />
          {brand.name}
        </div>
        <div style={{ display: 'flex', marginTop: 48, fontSize: 84, fontWeight: 600, letterSpacing: -3, lineHeight: 1.05 }}>
          The AI that forgets you on purpose
        </div>
        <div style={{ display: 'flex', marginTop: 32, fontSize: 32, color: '#B7BCDD' }}>{brand.socialDescription}</div>
      </div>
    ),
    size,
  );
}
