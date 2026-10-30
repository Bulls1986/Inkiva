import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'


const nav = readFileSync(new URL('../src/lib/docs-nav.ts', import.meta.url), 'utf8')
const page = readFileSync(new URL('../src/app/docs/page.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/app/docs/docs.css', import.meta.url), 'utf8')

test('docs landing is a navigable hub for users, Chinese readers and contributors', () => {
  assert.match(page, /className="docs-home"/)
  assert.match(page, /firstPageOfTab\('user'\)/)
  assert.match(page, /firstPageOfTab\('zh'\)/)
  assert.match(page, /firstPageOfTab\('dev'\)/)
  assert.match(page, /docs-home-paths/)
  assert.match(page, /docs-home-topics/)
  for (const slug of ['installation', 'editing', 'markdown-syntax', 'export', 'faq']) {
    assert.ok(nav.includes(`slug: ['${slug}']`), 'registered landing link: ' + slug)
  }
  assert.match(nav, /slug: \['introduction'\]/)
  assert.match(nav, /slug: \['zh-CN', 'introduction'\]/)
  assert.match(nav, /slug: \['dev', 'overview'\]/)
})

test('docs landing has a mobile-first tap-friendly layout and scoped focus states', () => {
  assert.match(css, /\.docs-home-paths\s*\{/)
  assert.match(css, /\.docs-home-card:focus-visible/)
  assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*\.docs-home-paths/)
  assert.match(css, /\.docs-home-card\s*\{[^}]*min-height:\s*\d+px/)
  assert.match(css, /\.docs-home-actions/)
})
