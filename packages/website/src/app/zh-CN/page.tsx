import type { Metadata } from 'next'
import QuietHomePage from '@/components/QuietHomePage'
import { createPageMetadata, LANGUAGE_ALTERNATES } from '@/lib/seo'

const TITLE = 'Inkiva · 墨映 — 文档优先的 Markdown 编辑器'
const DESCRIPTION =
  'Inkiva（墨映）是一款免费、开源、文档优先的 Markdown 编辑器，围绕普通文件提供专注写作体验。'

export const metadata: Metadata = {
  ...createPageMetadata({
    title: TITLE,
    description: DESCRIPTION,
    path: '/zh-CN/',
    locale: 'zh_CN',
    languages: LANGUAGE_ALTERNATES,
    openGraphTitle: TITLE
  })
}

export default function ChineseHome() {
  return <QuietHomePage locale="zh-CN" />
}
