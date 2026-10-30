import type { Metadata } from 'next'
import QuietHomePage from '@/components/QuietHomePage'
import { createPageMetadata, LANGUAGE_ALTERNATES } from '@/lib/seo'

const TITLE = 'Inkiva（墨映）Markdown 编辑器 — 免费开源所见即所得编辑器'
const DESCRIPTION =
  'Inkiva（墨映）是一款免费开源的所见即所得 Markdown 桌面编辑器，支持 Windows 和 macOS。直接编辑普通 CommonMark/GFM 文件，并提供本地导航、历史记录与崩溃恢复。'

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
