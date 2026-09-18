import type { MetadataRoute } from 'next'

export const dynamic = 'force-static'
import { ALL_PAGES } from '@/lib/docs-nav'
import { absoluteUrl } from '@/lib/seo'

export function buildSitemapEntries(lastModified = new Date()): MetadataRoute.Sitemap {
  return [
    {
      url: absoluteUrl('/'),
      lastModified,
      changeFrequency: 'monthly',
      priority: 1
    },
    {
      url: absoluteUrl('/zh-CN/'),
      lastModified,
      changeFrequency: 'monthly',
      priority: 1
    },
    {
      url: absoluteUrl('/docs/'),
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.9
    },
    ...ALL_PAGES.map((page) => ({
      url: absoluteUrl(page.href),
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: 0.7
    }))
  ]
}

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemapEntries()
}
