import type { Metadata } from 'next'
import QuietHomePage from '@/components/QuietHomePage'

const TITLE = 'Inkiva · 墨映 — 文档优先的 Markdown 编辑器'
const DESCRIPTION = 'Inkiva（墨映）是一款免费、开源、文档优先的 Markdown 编辑器，围绕普通文件提供专注写作体验。'

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
  return <QuietHomePage locale="zh-CN" />
}
