import assert from 'node:assert/strict'
import test from 'node:test'

import { ALL_PAGES } from '../src/lib/docs-nav'
import { buildSitemapEntries } from '../src/app/sitemap'
import { absoluteUrl } from '../src/lib/seo'

test('canonical URL helpers use the final www host and trailing slash', () => {
  assert.equal(absoluteUrl('/'), 'https://www.inkiva.net/')
  assert.equal(absoluteUrl('/docs'), 'https://www.inkiva.net/docs/')
  assert.equal(absoluteUrl('docs/installation/'), 'https://www.inkiva.net/docs/installation/')
})

test('sitemap contains unique final URLs for every indexable route', () => {
  const entries = buildSitemapEntries(new Date('2026-09-18T00:00:00.000Z'))
  const urls = entries.map((entry) => String(entry.url))

  assert.equal(urls.length, ALL_PAGES.length + 3)
  assert.equal(new Set(urls).size, urls.length)
  assert.ok(urls.every((url) => url.startsWith('https://www.inkiva.net/')))
  assert.ok(urls.every((url) => url === 'https://www.inkiva.net/' || url.endsWith('/')))
  assert.ok(!urls.includes('https://www.inkiva.net/docs'))
})
