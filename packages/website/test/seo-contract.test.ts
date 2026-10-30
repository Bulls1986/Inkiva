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

  const graph = createSiteJsonLd('0.6.0')['@graph']
  const website = graph.find((item) => item['@type'] === 'WebSite')
  const software = graph.find((item) => item['@type'] === 'SoftwareApplication')

  assert.ok(website)
  assert.ok(software)
  assert.deepEqual(software.alternateName, ['Inkiva', 'Inkiva · 墨映', '墨映 Markdown 编辑器'])
  assert.match(software.description, /WYSIWYG Markdown desktop editor/)
  assert.match(software.operatingSystem, /Windows/)
  assert.match(software.operatingSystem, /macOS/)
  assert.doesNotMatch(software.operatingSystem, /Linux/)
  assert.ok(software.featureList.includes('Local history, autosave and crash recovery'))
})
