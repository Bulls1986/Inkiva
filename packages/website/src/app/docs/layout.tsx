import type { Metadata } from 'next'
import DocsChrome from '@/components/docs/DocsChrome'
import { DOCS_DESCRIPTION, SITE_NAME, SOCIAL_IMAGE, absoluteUrl } from '@/lib/seo'
import './docs.css'

export const metadata: Metadata = {
  title: {
    default: 'Documentation',
    template: '%s · Inkiva Docs'
  },
  description: DOCS_DESCRIPTION,
  alternates: {
    canonical: absoluteUrl('/docs/')
  },
  openGraph: {
    type: 'website',
    url: absoluteUrl('/docs/'),
    siteName: SITE_NAME,
    title: 'Documentation · Inkiva Docs',
    description: DOCS_DESCRIPTION,
    images: [SOCIAL_IMAGE]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Documentation · Inkiva Docs',
    description: DOCS_DESCRIPTION,
    images: [SOCIAL_IMAGE]
  }
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
