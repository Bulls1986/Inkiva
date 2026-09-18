import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { ALL_PAGES } from '../src/lib/docs-nav'
import { absoluteUrl, SITEMAP_URL, SOCIAL_IMAGE } from '../src/lib/seo'

const ROOT = resolve(import.meta.dirname, '..')
const OUT = resolve(ROOT, 'out')

async function readOutput(path: string): Promise<string> {
  return readFile(resolve(OUT, path), 'utf8')
}

function metadataValue(html: string, pattern: RegExp, label: string): string {
  const match = html.match(pattern)
  assert.ok(match?.[1], `missing ${label}`)
  return match[1]
}

async function verifyRoute(route: string, expected: { title: string; url: string }) {
  const html = await readOutput(route)
  const canonical = metadataValue(
    html,
    /<link rel="canonical" href="([^"]+)"\/>/,
    `${route} canonical`
  )
  const openGraphUrl = metadataValue(
    html,
    /<meta property="og:url" content="([^"]+)"\/>/,
    `${route} og:url`
  )
  const openGraphImage = metadataValue(
    html,
    /<meta property="og:image" content="([^"]+)"\/>/,
    `${route} og:image`
  )
  const title = metadataValue(html, /<title>([^<]+)<\/title>/, `${route} title`)

  assert.equal(canonical, expected.url, `${route} canonical must be its final URL`)
  assert.equal(openGraphUrl, expected.url, `${route} og:url must match canonical`)
  assert.equal(openGraphImage, SOCIAL_IMAGE.url, `${route} must use the social card`)
  assert.match(title, new RegExp(expected.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.doesNotMatch(html.slice(0, html.indexOf('</head>')), /bulls1986\.github\.io/i)

  for (const [, href] of html.matchAll(/<a\b[^>]*href="(\/docs[^"]*)"/g)) {
    const routePath = href.split('#', 1)[0]
    if (!/\.[a-z0-9]+$/i.test(routePath)) {
      assert.ok(routePath.endsWith('/'), `${route} contains non-canonical link ${href}`)
    }
  }
}

await access(resolve(OUT, 'index.html'))
await verifyRoute('index.html', { title: 'Inkiva', url: absoluteUrl('/') })
await verifyRoute('zh-CN/index.html', {
  title: 'Inkiva',
  url: absoluteUrl('/zh-CN/')
})
await verifyRoute('docs/index.html', {
  title: 'Documentation',
  url: absoluteUrl('/docs/')
})

for (const page of ALL_PAGES) {
  await verifyRoute(`docs/${page.slug.join('/')}/index.html`, {
    title: page.title,
    url: absoluteUrl(page.href)
  })
}

const robots = await readOutput('robots.txt')
assert.match(robots, new RegExp(`Sitemap: ${SITEMAP_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))

const sitemap = await readOutput('sitemap.xml')
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])
assert.ok(sitemapUrls.length > 0, 'sitemap must contain at least one URL')
assert.equal(new Set(sitemapUrls).size, sitemapUrls.length, 'sitemap URLs must be unique')
for (const url of sitemapUrls) {
  assert.match(url, /^https:\/\/www\.inkiva\.net\//)
  assert.ok(url === absoluteUrl('/') || url.endsWith('/'), `${url} must be a final slash URL`)
  assert.notEqual(url, 'https://www.inkiva.net/docs')
}

console.log(
  `[seo] verified ${sitemapUrls.length} sitemap URLs and ${ALL_PAGES.length + 3} HTML routes`
)
