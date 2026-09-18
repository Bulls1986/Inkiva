import type { Metadata } from 'next'

export const SITE_URL = 'https://www.inkiva.net'
export const SITE_NAME = 'Inkiva'
export const REPOSITORY_URL = 'https://github.com/Bulls1986/Inkiva'
export const RELEASES_URL = `${REPOSITORY_URL}/releases`
export const PUBLISHER_NAME = 'Bulls1986'

export const DEFAULT_TITLE = 'Inkiva · 墨映 — document-first Markdown editor'
export const DEFAULT_DESCRIPTION =
  'Inkiva is a free, open-source, document-first Markdown editor for focused writing on Windows x64 and macOS Intel or Apple silicon.'
export const DOCS_DESCRIPTION =
  'Guides, reference and developer documentation for Inkiva — the document-first Markdown editor.'

export const SOCIAL_IMAGE = {
  url: `${SITE_URL}/assets/inkiva-og.png`,
  width: 1200,
  height: 630,
  alt: 'Inkiva — a document-first Markdown editor'
} as const

export const SITEMAP_URL = `${SITE_URL}/sitemap.xml`
export const ORGANIZATION_SCHEMA_ID = `${SITE_URL}/#organization`
export const WEBSITE_SCHEMA_ID = `${SITE_URL}/#website`
export const SOFTWARE_SCHEMA_ID = `${SITE_URL}/#software`

export const LANGUAGE_ALTERNATES = {
  'x-default': '/',
  'en-US': '/',
  'zh-CN': '/zh-CN/'
} as const

/** Return the canonical path used by the static export. */
export function canonicalPath(path = '/'): string {
  const normalized = path.trim()
  if (!normalized || normalized === '/') return '/'
  return `/${normalized.replace(/^\/+|\/+$/g, '')}/`
}

/** Build a final, absolute URL for an indexable HTML route. */
export function absoluteUrl(path = '/'): string {
  return `${SITE_URL}${canonicalPath(path)}`
}

/** Build an absolute URL for a static asset, which must not gain a route slash. */
export function absoluteAssetUrl(path: string): string {
  return `${SITE_URL}/${path.replace(/^\/+/, '')}`
}

export function stringifyJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

export function createPageMetadata({
  title,
  description,
  path,
  locale = 'en_US',
  type = 'website',
  languages,
  openGraphTitle = title
}: {
  title: string
  description: string
  path: string
  locale?: string
  type?: 'website' | 'article'
  languages?: Record<string, string>
  openGraphTitle?: string
}): Metadata {
  const url = absoluteUrl(path)

  return {
    title,
    description,
    alternates: {
      canonical: url,
      ...(languages ? { languages } : {})
    },
    openGraph: {
      type,
      url,
      siteName: SITE_NAME,
      title: openGraphTitle,
      description,
      locale,
      images: [SOCIAL_IMAGE]
    },
    twitter: {
      card: 'summary_large_image',
      title: openGraphTitle,
      description,
      images: [SOCIAL_IMAGE]
    }
  }
}

export function createSiteJsonLd(softwareVersion: string) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': ORGANIZATION_SCHEMA_ID,
        name: PUBLISHER_NAME,
        url: 'https://github.com/Bulls1986',
        logo: absoluteAssetUrl('/assets/inkiva-logo.svg'),
        sameAs: [REPOSITORY_URL]
      },
      {
        '@type': 'WebSite',
        '@id': WEBSITE_SCHEMA_ID,
        url: absoluteUrl('/'),
        name: SITE_NAME,
        description: DEFAULT_DESCRIPTION,
        inLanguage: ['en-US', 'zh-CN'],
        publisher: { '@id': ORGANIZATION_SCHEMA_ID }
      },
      {
        '@type': 'SoftwareApplication',
        '@id': SOFTWARE_SCHEMA_ID,
        name: SITE_NAME,
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Windows x64, macOS Intel, macOS Apple silicon',
        description: DEFAULT_DESCRIPTION,
        url: absoluteUrl('/'),
        image: absoluteAssetUrl('/assets/inkiva-og.png'),
        license: `${REPOSITORY_URL}/blob/develop/LICENSE`,
        author: { '@id': ORGANIZATION_SCHEMA_ID },
        publisher: { '@id': ORGANIZATION_SCHEMA_ID },
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
          url: RELEASES_URL
        },
        downloadUrl: `${REPOSITORY_URL}/releases/latest`,
        softwareVersion,
        featureList: [
          'WYSIWYG Markdown editing',
          'CommonMark and GitHub Flavored Markdown support',
          'Windows x64 and macOS desktop applications'
        ]
      }
    ]
  }
}

export function createDocumentationJsonLd({
  title,
  description,
  path
}: {
  title: string
  description: string
  path: string
}) {
  const url = absoluteUrl(path)

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        '@id': `${url}#article`,
        headline: title,
        description,
        url,
        inLanguage: 'en-US',
        isPartOf: { '@id': WEBSITE_SCHEMA_ID },
        author: { '@id': ORGANIZATION_SCHEMA_ID },
        publisher: { '@id': ORGANIZATION_SCHEMA_ID },
        mainEntityOfPage: { '@id': `${url}#page` }
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: SITE_NAME, item: absoluteUrl('/') },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Documentation',
            item: absoluteUrl('/docs/')
          },
          { '@type': 'ListItem', position: 3, name: title, item: url }
        ]
      }
    ]
  }
}
