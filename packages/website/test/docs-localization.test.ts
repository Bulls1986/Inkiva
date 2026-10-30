import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { ALL_PAGES, DOC_TABS, findPageBySlug, firstPageOfTab } from '../src/lib/docs-nav'
import { buildSitemapEntries } from '../src/app/sitemap'
import { createDocumentationJsonLd } from '../src/lib/seo'

test('Chinese user manual has exactly one registered entry for every English user page', () => {
  const english = ALL_PAGES.filter((page) => page.tab === 'user')
  const chinese = ALL_PAGES.filter((page) => page.tab === 'zh')
  assert.equal(english.length, 20)
  assert.equal(chinese.length, english.length)
  assert.equal(DOC_TABS.find((tab) => tab.id === 'zh')?.label, '中文使用手册')

  const targetPaths = new Set<string>()
  for (const page of english) {
    const expected = ['zh-CN', ...page.slug]
    const localized = findPageBySlug(expected)
    assert.ok(localized, 'Missing Chinese page for ' + page.href)
    assert.equal(localized.tab, 'zh')
    assert.equal(localized.href, '/docs/' + expected.join('/') + '/')
    assert.ok(localized.file.startsWith('zh-CN/'))
    assert.ok(!targetPaths.has(localized.file), 'duplicate Chinese source')
    targetPaths.add(localized.file)

    const body = fs.readFileSync(path.join(process.cwd(), 'content', 'docs', localized.file), 'utf8')
    assert.match(body, /^# [^\r\n]+/m)
    assert.match(body, /[\u3400-\u9fff]/u, 'not a Chinese-language article')
    assert.doesNotMatch(body, /TODO|PLACEHOLDER|待翻译/u)
  }
  assert.equal(firstPageOfTab('zh').href, '/docs/zh-CN/introduction/')
})

test('Chinese manual pages appear once in the public sitemap without duplicate URLs', () => {
  const sitemap = buildSitemapEntries(new Date('2026-10-30T00:00:00Z'))
  const urls = sitemap.map((entry) => String(entry.url))
  const localized = urls.filter((url) => url.includes('/docs/zh-CN/'))
  assert.equal(localized.length, 20)
  assert.equal(new Set(urls).size, urls.length)
  assert.ok(localized.every((url) => url.startsWith('https://www.inkiva.net/docs/zh-CN/')))
})

test('Chinese article structured data uses zh-CN while English remains en-US', () => {
  const zh = createDocumentationJsonLd({
    title: '安装与升级',
    description: '中文用户手册',
    path: '/docs/zh-CN/installation/',
    inLanguage: 'zh-CN'
  })
  const en = createDocumentationJsonLd({
    title: 'Installation',
    description: 'English documentation',
    path: '/docs/installation/'
  })
  assert.match(JSON.stringify(zh), /"inLanguage":"zh-CN"/)
  assert.match(JSON.stringify(en), /"inLanguage":"en-US"/)
  assert.match(JSON.stringify(zh), /www\.inkiva\.net\/docs\/zh-CN\/installation\//)
})

test('Chinese public manual navigation does not replace the English developer docs', () => {
  assert.equal(ALL_PAGES.filter((p) => p.tab === 'dev').length, 12)
  assert.ok(findPageBySlug(['dev', 'overview']))
  assert.ok(findPageBySlug(['zh-CN', 'basics']))
  assert.ok(findPageBySlug(['basics']))
})
