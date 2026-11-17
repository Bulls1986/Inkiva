import type { Metadata } from 'next'
import EditorComparisonPage from '@/components/EditorComparisonPage'
import {
  ORGANIZATION_SCHEMA_ID,
  WEBSITE_SCHEMA_ID,
  TYPO_COMPARISON_DESCRIPTION,
  TYPO_COMPARISON_TITLE,
  absoluteUrl,
  createPageMetadata,
  stringifyJsonLd
} from '@/lib/seo'

const PATH = '/compare/typora/'

export const metadata: Metadata = createPageMetadata({
  title: TYPO_COMPARISON_TITLE,
  description: TYPO_COMPARISON_DESCRIPTION,
  path: PATH,
  type: 'article',
  languages: {
    'en-US': PATH,
    'zh-CN': '/zh-CN/compare/typora/'
  },
  openGraphTitle: TYPO_COMPARISON_TITLE
})

const pageUrl = absoluteUrl(PATH)
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  '@id': `${pageUrl}#article`,
  headline: TYPO_COMPARISON_TITLE,
  description: TYPO_COMPARISON_DESCRIPTION,
  url: pageUrl,
  inLanguage: 'en-US',
  isPartOf: { '@id': WEBSITE_SCHEMA_ID },
  author: { '@id': ORGANIZATION_SCHEMA_ID },
  publisher: { '@id': ORGANIZATION_SCHEMA_ID },
  mainEntityOfPage: pageUrl
}

export default function TyporaComparison() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: stringifyJsonLd(jsonLd) }} />
      <EditorComparisonPage />
    </>
  )
}
