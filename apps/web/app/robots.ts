import type { MetadataRoute } from 'next';
import { brand } from '@fathom/config';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/app' },
    sitemap: `${brand.siteUrl}/sitemap.xml`,
  };
}
