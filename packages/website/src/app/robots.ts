import type { MetadataRoute } from 'next'
import { SITEMAP_URL } from '@/lib/seo'

export const dynamic = 'force-static'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: SITEMAP_URL
  }
}
