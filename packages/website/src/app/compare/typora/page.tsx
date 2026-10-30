import type { Metadata } from 'next'
import EditorComparisonPage from '@/components/EditorComparisonPage'
import {
  ORGANIZATION_SCHEMA_ID,
  WEBSITE_SCHEMA_ID,
  absoluteUrl,
  createPageMetadata,
  stringifyJsonLd
} from '@/lib/seo'

const TITLE = 'Inkiva vs Typora vs MarkText: Markdown Editor Comparison'
const DESCRIPTION =
  'Compare Inkiva, Typora and MarkText by editing experience, price, license, desktop platforms, local Markdown files, navigation and recovery features.'
const PATH = '/compare/typora/'

export const metadata: Metadata = createPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: PATH,
  type: 'article',
  languages: {
    'en-US': PATH,
    'zh-CN': '/zh-CN/compare/typora/'
  },
  openGraphTitle: TITLE
})

const pageUrl = absoluteUrl(PATH)
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  '@id': `${pageUrl}#article`,
  headline: TITLE,
  description: DESCRIPTION,
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
