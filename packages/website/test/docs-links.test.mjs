import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { checkDocumentation, registeredDocFiles } from '../scripts/verify-docs-links.mjs'

function fixture(files = {}, assets = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-docs-'))
  const contentRoot = path.join(base, 'content')
  const assetRoot = path.join(base, 'public')
  for (const [name, body] of Object.entries(files)) {
    const full = path.join(contentRoot, name)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, body)
  }
  for (const [name, body] of Object.entries(assets)) {
    const full = path.join(assetRoot, name)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, body)
  }
  return {
    scan: (pageFiles) => checkDocumentation({ contentRoot, assetRoot, pageFiles }),
    cleanup: () => fs.rmSync(base, { recursive: true, force: true })
  }
}

test('docs registry requires unique source files', () => {
  assert.deepEqual(registeredDocFiles("file: 'README.md', file: 'end-user/BASICS.md'"), [
    'README.md', 'end-user/BASICS.md'
  ])
  assert.throws(() => registeredDocFiles("file: 'README.md', file: 'README.md'"), /Duplicate/)
  assert.throws(() => registeredDocFiles('export const DOC_TABS = []'), /No public/)
})

test('valid document, heading and image references pass', () => {
  const f = fixture({
    'README.md': '# Home\n[Page](./nested/page.md#some-heading)\n![logo](./assets/logo.png)',
    'nested/page.md': '# Page\n## Some Heading'
  }, { 'assets/logo.png': 'png' })
  try {
    assert.deepEqual(f.scan(['README.md', 'nested/page.md']), [])
  } finally { f.cleanup() }
})

test('missing page and image are reported independently', () => {
  const f = fixture({ 'README.md': '# Home\n[Missing](./missing.md)\n![none](./assets/no.png)' })
  try {
    const errors = f.scan(['README.md'])
    assert.deepEqual(errors.map((e) => e.reason), ['missing-page-source', 'missing-asset'])
  } finally { f.cleanup() }
})

test('fenced code and inline code examples are not links', () => {
  const f = fixture({ 'README.md': '# Home\n`[example](missing.md)`\n~~~md\n[example](bad.md)\n~~~' })
  try { assert.deepEqual(f.scan(['README.md']), []) } finally { f.cleanup() }
})

test('unregistered local documents and stale heading fragments fail closed', () => {
  const f = fixture({
    'README.md': '[Other](./other.md)\n[Heading](./current.md#unknown)',
    'other.md': '# Other',
    'current.md': '# Current\n## Present'
  })
  try {
    const errors = f.scan(['README.md', 'current.md'])
    assert.deepEqual(errors.map((e) => e.reason), ['unregistered-page', 'missing-heading'])
  } finally { f.cleanup() }
})

test('duplicate heading anchors and Unicode headings are supported', () => {
  const f = fixture({
    'README.md': '[First](./other.md#标题)\n[Again](./other.md#标题-1)',
    'other.md': '# Other\n## 标题\n## 标题'
  })
  try { assert.deepEqual(f.scan(['README.md', 'other.md']), []) } finally { f.cleanup() }
})

test('unsafe relative traversal is rejected', () => {
  const f = fixture({ 'README.md': '[Other](../secret.md)' })
  try {
    assert.equal(f.scan(['README.md'])[0].reason, 'missing-page-source')
  } finally { f.cleanup() }
})

test('missing registered page is reported', () => {
  const f = fixture({ 'README.md': '# Home' })
  try {
    assert.deepEqual(f.scan(['README.md', 'missing.md']).map((e) => e.reason), [
      'missing-page-source'
    ])
  } finally { f.cleanup() }
})

test('reference definitions to missing documents are checked', () => {
  const f = fixture({ 'README.md': '# Home\n[guide]: ./missing.md' })
  try {
    assert.equal(f.scan(['README.md'])[0].reason, 'missing-page-source')
  } finally { f.cleanup() }
})
