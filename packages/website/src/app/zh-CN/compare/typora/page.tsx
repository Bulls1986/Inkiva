import type { Metadata } from 'next'
import EditorComparisonPage from '@/components/EditorComparisonPage'
import {
  ORGANIZATION_SCHEMA_ID,
  WEBSITE_SCHEMA_ID,
  absoluteUrl,
  createPageMetadata,
  stringifyJsonLd
} from '@/lib/seo'

const TITLE = 'Inkiva、Typora 与 MarkText 对比：如何选择 Markdown 编辑器？'
const DESCRIPTION =
  '对比 Inkiva（墨映）、Typora 和 MarkText 的所见即所得编辑体验、价格许可证、桌面平台、本地 Markdown 文件、导航与恢复能力。'
const PATH = '/zh-CN/compare/typora/'

export const metadata: Metadata = createPageMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: PATH,
  locale: 'zh_CN',
  type: 'article',
  languages: {
    'en-US': '/compare/typora/',
    'zh-CN': PATH
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
  inLanguage: 'zh-CN',
  isPartOf: { '@id': WEBSITE_SCHEMA_ID },
  author: { '@id': ORGANIZATION_SCHEMA_ID },
  publisher: { '@id': ORGANIZATION_SCHEMA_ID },
  mainEntityOfPage: pageUrl
}

export default function ChineseTyporaComparison() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: stringifyJsonLd(jsonLd) }} />
      <EditorComparisonPage locale="zh-CN" />
    </>
  )
}
