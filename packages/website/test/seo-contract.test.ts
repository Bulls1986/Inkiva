import assert from 'node:assert/strict'
import test from 'node:test'

import { ALL_PAGES, findPageBySlug } from '../src/lib/docs-nav'
import { buildSitemapEntries } from '../src/app/sitemap'
import {
  absoluteUrl,
  createSiteJsonLd,
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  TYPO_COMPARISON_DESCRIPTION,
  TYPO_COMPARISON_TITLE
} from '../src/lib/seo'

test('canonical URL helpers use the final www host and trailing slash', () => {
  assert.equal(absoluteUrl('/'), 'https://www.inkiva.net/')
  assert.equal(absoluteUrl('/docs'), 'https://www.inkiva.net/docs/')
  assert.equal(absoluteUrl('docs/installation/'), 'https://www.inkiva.net/docs/installation/')
})

test('sitemap contains unique final URLs for every indexable route', () => {
  const entries = buildSitemapEntries(new Date('2026-09-18T00:00:00.000Z'))
  const urls = entries.map((entry) => String(entry.url))

  assert.equal(urls.length, ALL_PAGES.length + 5)
  assert.equal(new Set(urls).size, urls.length)
  assert.ok(urls.every((url) => url.startsWith('https://www.inkiva.net/')))
  assert.ok(urls.every((url) => url === 'https://www.inkiva.net/' || url.endsWith('/')))
  assert.ok(!urls.includes('https://www.inkiva.net/docs'))
})

test('Typora comparison metadata matches the observed non-brand comparison intent', () => {
  assert.equal(TYPO_COMPARISON_TITLE, 'Typora vs MarkText: Inkiva Markdown Editor Comparison')
  assert.equal(
    TYPO_COMPARISON_DESCRIPTION,
    'Compare Typora and MarkText with Inkiva: desktop editing, price, licenses, platform support, local Markdown files, navigation, recovery and export.'
  )
})

test('Installation metadata identifies Inkiva and the actual supported desktop platforms', () => {
  const installation = findPageBySlug(['installation']) as {
    seoTitle?: string
    seoDescription?: string
  } | null

  assert.equal(installation?.seoTitle, 'Download Inkiva Markdown Editor for Windows and macOS')
  assert.equal(
    installation?.seoDescription,
    'Download the free Inkiva WYSIWYG Markdown editor for Windows 10/11 x64 and macOS Intel/Apple silicon. Choose an installer, portable ZIP or DMG.'
  )
})

test('site identity metadata describes the Inkiva Markdown editor consistently', () => {
  assert.match(DEFAULT_TITLE, /Inkiva Markdown Editor/)
  assert.match(DEFAULT_DESCRIPTION, /WYSIWYG Markdown desktop editor/)
  assert.match(DEFAULT_DESCRIPTION, /Windows and macOS/)

  const jsonLd = JSON.stringify(createSiteJsonLd('0.6.1'))
  assert.match(jsonLd, /Inkiva Markdown Editor/)
  assert.match(jsonLd, /Inkiva · 墨映/)
  assert.match(jsonLd, /墨映 Markdown 编辑器/)
  assert.match(jsonLd, /Local history, autosave and crash recovery/)
  assert.match(jsonLd, /Windows 10 or 11 x64, macOS Intel, macOS Apple silicon/)
  assert.doesNotMatch(jsonLd, /Linux/)
})
