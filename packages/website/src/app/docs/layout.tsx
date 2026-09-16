import type { Metadata } from 'next'
import DocsChrome from '@/components/docs/DocsChrome'
import './docs.css'

export const metadata: Metadata = {
  title: {
    default: 'Documentation',
    template: '%s · Inkiva Docs'
  },
  description:
    'Guides, reference and developer documentation for Inkiva — the document-first Markdown editor.'
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="bg-fx" />
      <div className="bg-grid" />
      <DocsChrome>{children}</DocsChrome>
    </>
  )
}
