import type { MetadataRoute } from 'next'

export const dynamic = 'force-static'
import { ALL_PAGES } from '@/lib/docs-nav'

const SITE = 'https://www.inkiva.net'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    {
      url: SITE + '/',
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 1
    },
    {
      url: SITE + '/docs',
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9
    },
    ...ALL_PAGES.map((page) => ({
      url: SITE + page.href,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.7
    }))
  ]
}
