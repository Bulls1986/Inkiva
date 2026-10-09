import assert from 'node:assert/strict'
import { test } from 'node:test'

import * as markdownLinks from '../../src/main/documentIntelligence/markdownLinks.ts'

test('V06-04 navigable Markdown destinations preserve encoded filenames and heading fragments', () => {
  const resolve = markdownLinks.parseNavigableMarkdownDestination
  assert.equal(typeof resolve, 'function', 'a safe Markdown navigation parser must exist')
  assert.deepEqual(resolve('./docs/Guide%23Notes.md#quick-start'), {
    pathname: './docs/Guide#Notes.md', fragment: 'quick-start'
  })
  assert.deepEqual(resolve('./手册%20一.md#%E5%AE%89%E8%A3%85'), {
    pathname: './手册 一.md', fragment: '安装'
  })
  assert.deepEqual(resolve('../Guide.markdown'), {
    pathname: '../Guide.markdown', fragment: null
  })
  assert.deepEqual(resolve('./Guide\\#Notes.md'), {
    pathname: './Guide#Notes.md', fragment: null
  })
  assert.deepEqual(resolve('./📘.md#overview'), {
    pathname: './📘.md', fragment: 'overview'
  })
})

test('V06-04 invalid percent escapes reject navigation without throwing', () => {
  const resolve = markdownLinks.parseNavigableMarkdownDestination
  assert.equal(typeof resolve, 'function', 'a safe Markdown navigation parser must exist')
  assert.equal(resolve('./broken%GG.md#heading'), null)
  assert.equal(resolve('./valid.md#%ZZ'), null)
  assert.equal(resolve('./valid.md%00'), null)
})
