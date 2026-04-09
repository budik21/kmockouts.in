import type { MetadataRoute } from 'next';
import { SITE_NAME, DEFAULT_DESCRIPTION } from '@/lib/seo';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — FIFA World Cup 2026`,
    short_name: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    start_url: '/worldcup2026',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0d6efd',
    orientation: 'portrait',
    categories: ['sports', 'soccer', 'football', 'world cup'],
    icons: [
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
