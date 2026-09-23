import assert from 'node:assert/strict'
import test from 'node:test'

import { createHeadingStormFixture, createMarkdownFixture } from './fixtures.js'
import { getFastFixtureHashes, getReferenceFixtureHashes } from './fixture-provenance.js'

test('fast provenance hashes exact deterministic markdown workloads', () => {
  assert.deepEqual(getFastFixtureHashes(), {
    '50k-markdown': createMarkdownFixture('50k').contentHash,
    'regular-markdown': createMarkdownFixture('regular').contentHash
  })
})

test('reference P0 hashes the regular markdown fixture', () => {
  assert.deepEqual(getReferenceFixtureHashes('P0'), {
    'regular-markdown': createMarkdownFixture('regular').contentHash
  })
})

test('reference large levels hash only exactly reproducible fixture content', () => {
  const p1 = getReferenceFixtureHashes('P1')
  assert.equal(p1['50k-markdown'], createMarkdownFixture('50k').contentHash)
  assert.equal(p1['8x50k-tabs'], createMarkdownFixture('50k').contentHash)
  assert.equal(p1['10k-workspace'], undefined)

  const p2 = getReferenceFixtureHashes('P2')
  assert.equal(p2['50k-markdown'], createMarkdownFixture('50k').contentHash)
  assert.equal(p2['5k-heading-storm'], createHeadingStormFixture(5000).contentHash)
  assert.equal(p2['10k-heading-storm'], createHeadingStormFixture(10000).contentHash)
  assert.equal(p2['diagram-image-document'], undefined)
  assert.equal(p2['50k-workspace-combination'], undefined)
})
