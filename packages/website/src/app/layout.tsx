import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { DEFAULT_THEME, THEME_STORAGE_KEY } from '@/lib/sections'
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  LANGUAGE_ALTERNATES,
  SITE_NAME,
  SITE_URL,
  SOCIAL_IMAGE,
  createSiteJsonLd,
  stringifyJsonLd
} from '@/lib/seo'
import { INKIVA_VERSION } from '@/lib/version'
import './globals.css'

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap'
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap'
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_TITLE,
    template: '%s | Inkiva'
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    'markdown editor',
    'document-first Markdown',
    'CommonMark',
    'GitHub Flavored Markdown',
    'GFM',
    'KaTeX',
    'Mermaid',
    'PlantUML',
    'Electron',
    'macOS',
    'Windows',
    'Apple silicon'
  ],
  authors: [{ name: 'Bulls1986', url: 'https://github.com/Bulls1986' }],
  creator: 'Bulls1986',
  icons: { icon: '/favicon.png' },
  alternates: {
    canonical: `${SITE_URL}/`,
    languages: LANGUAGE_ALTERNATES
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: `${SITE_URL}/`,
    siteName: SITE_NAME,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [SOCIAL_IMAGE]
  },
  twitter: {
    card: 'summary_large_image',
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [SOCIAL_IMAGE]
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b63e5'
}

const jsonLd = createSiteJsonLd(INKIVA_VERSION)

// Inline before paint to avoid theme flash.
const themeBootstrap = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(!t)t=${JSON.stringify(DEFAULT_THEME)};document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme',${JSON.stringify(DEFAULT_THEME)});}})();`
const localeBootstrap = `(function(){try{document.documentElement.lang=location.pathname.indexOf('/zh-CN')===0?'zh-CN':'en';}catch(e){}})();`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme={DEFAULT_THEME}
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <script dangerouslySetInnerHTML={{ __html: localeBootstrap }} />
      </head>
      <body>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: stringifyJsonLd(jsonLd) }}
        />
      </body>
    </html>
  )
}
