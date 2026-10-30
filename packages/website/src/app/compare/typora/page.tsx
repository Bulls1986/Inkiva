import type { Metadata } from 'next'
import EditorComparisonPage from '@/components/EditorComparisonPage'
import { createDocumentationJsonLd, createPageMetadata, stringifyJsonLd } from '@/lib/seo'

const TITLE = 'Inkiva vs Typora vs MarkText: Markdown Editor Comparison'
const DESCRIPTION =
  'Compare Inkiva, Typora and MarkText by editing experience, price, license, desktop platforms, local Markdown files, navigation and recovery features.'

export const metadata: Metadata = createPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: '/compare/typora/',
  type: 'article',
  languages: {
    'en-US': '/compare/typora/',
    'zh-CN': '/zh-CN/compare/typora/'
  },
  openGraphTitle: TITLE
})

const jsonLd = createDocumentationJsonLd({
  title: TITLE,
  description: DESCRIPTION,
  path: '/compare/typora/'
})

export default function TyporaComparison() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: stringifyJsonLd(jsonLd) }} />
      <EditorComparisonPage />
    </>
  )
}
