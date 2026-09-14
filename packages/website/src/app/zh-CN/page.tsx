import type { Metadata } from 'next'
import ChineseHomePage from '@/components/ChineseHomePage'

const TITLE = 'Inkiva · 墨映 — 所见即所得 Markdown 编辑器'
const DESCRIPTION = 'Inkiva（墨映）是一款免费、开源的所见即所得 Markdown 编辑器，让你无需离开文档即可自然写作。'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: '/zh-CN/',
    languages: { 'en-US': '/', 'zh-CN': '/zh-CN/' }
  },
  openGraph: {
    type: 'website',
    locale: 'zh_CN',
    url: 'https://www.inkiva.net/zh-CN/',
    siteName: 'Inkiva',
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: '/favicon.png', width: 512, height: 512, alt: 'Inkiva 墨映 Logo' }]
  }
}

export default function ChineseHome() {
  return <ChineseHomePage />
}
