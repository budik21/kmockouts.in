import { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Keep internal/admin tooling, API routes and private user pages out of search engines.
        disallow: [
          '/admin',
          '/api/',
          '/worldcup2026/scenarios',
          '/me',
          '/pickem/share',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
