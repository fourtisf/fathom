import type { MetadataRoute } from 'next';
import { brand } from '@fathom/config';

export default function sitemap(): MetadataRoute.Sitemap {
  return ['', '/scan', '/trust', '/docs', '/terms', '/privacy'].map((path) => ({
    url: `${brand.siteUrl}${path}`,
    changeFrequency: 'weekly',
    priority: path === '' ? 1 : 0.6,
  }));
}
