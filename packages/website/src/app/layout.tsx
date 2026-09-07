import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { DEFAULT_THEME, THEME_STORAGE_KEY } from '@/lib/sections'
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

const SITE_URL = 'https://www.inkiva.net'
const TITLE = 'Inkiva · 墨映 — WYSIWYG Markdown editor'
const DESCRIPTION =
  'A free, open-source WYSIWYG Markdown editor for macOS, Windows and Linux. Write naturally and see the rendered document take shape in place.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: '%s | Inkiva'
  },
  description: DESCRIPTION,
  applicationName: 'Inkiva',
  keywords: [
    'markdown editor',
    'WYSIWYG markdown',
    'CommonMark',
    'GitHub Flavored Markdown',
    'GFM',
    'KaTeX',
    'Mermaid',
    'PlantUML',
    'Electron',
    'macOS',
    'Windows',
    'Linux'
  ],
  authors: [{ name: 'Ran Luo', url: 'https://github.com/Jocs' }],
  creator: 'Ran Luo',
  icons: { icon: '/favicon.png' },
  alternates: {
    canonical: '/',
    languages: { 'en-US': '/', 'zh-CN': '/zh-CN/' }
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: 'Inkiva',
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: '/favicon.png', width: 512, height: 512, alt: 'Inkiva logo' }]
  }

}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b63e5'
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Inkiva',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'macOS, Windows, Linux',
  description: DESCRIPTION,
  url: SITE_URL,
  license: 'https://github.com/Bulls1986/Inkiva/blob/develop/LICENSE',
  author: { '@type': 'Person', name: 'Ran Luo', url: 'https://github.com/Jocs' },
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  downloadUrl: 'https://github.com/Bulls1986/Inkiva/releases/latest',
  softwareVersion: INKIVA_VERSION
}

// Inline before paint to avoid theme flash.
const themeBootstrap = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(!t)t=${JSON.stringify(DEFAULT_THEME)};document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme',${JSON.stringify(DEFAULT_THEME)});}})();`
const localeBootstrap = `(function(){try{document.documentElement.lang=location.pathname.indexOf('/zh-CN')===0?'zh-CN':'en';}catch(e){}})();`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme={DEFAULT_THEME} className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <script dangerouslySetInnerHTML={{ __html: localeBootstrap }} />
      </head>
      <body>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  )
}
