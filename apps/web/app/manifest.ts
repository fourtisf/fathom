import type { MetadataRoute } from 'next';
import { brand } from '@fathom/config';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.name,
    description: brand.socialDescription,
    start_url: '/',
    display: 'standalone',
    background_color: '#060A1C',
    theme_color: '#060A1C',
    icons: [
      { src: '/brand/noxsea-icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/brand/noxsea-icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/brand/noxsea-icon-square-1024.png', sizes: '1024x1024', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
