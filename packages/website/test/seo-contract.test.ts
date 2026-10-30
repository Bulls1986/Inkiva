import assert from 'node:assert/strict'
import test from 'node:test'

import { ALL_PAGES } from '../src/lib/docs-nav'
import { buildSitemapEntries } from '../src/app/sitemap'
import { absoluteUrl, createSiteJsonLd, DEFAULT_DESCRIPTION, DEFAULT_TITLE } from '../src/lib/seo'

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

test('site identity metadata describes the Inkiva Markdown editor consistently', () => {
  assert.match(DEFAULT_TITLE, /Inkiva Markdown Editor/)
  assert.match(DEFAULT_DESCRIPTION, /WYSIWYG Markdown desktop editor/)
  assert.match(DEFAULT_DESCRIPTION, /Windows and macOS/)

  const jsonLd = JSON.stringify(createSiteJsonLd('0.6.0'))
  assert.match(jsonLd, /Inkiva Markdown Editor/)
  assert.match(jsonLd, /Inkiva · 墨映/)
  assert.match(jsonLd, /墨映 Markdown 编辑器/)
  assert.match(jsonLd, /Local history, autosave and crash recovery/)
  assert.match(jsonLd, /Windows x64, macOS Intel, macOS Apple silicon/)
  assert.doesNotMatch(jsonLd, /Linux/)
})
