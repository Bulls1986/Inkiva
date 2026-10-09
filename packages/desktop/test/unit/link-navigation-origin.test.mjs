import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isLinkNavigationOriginCurrent } from '../../src/shared/linkNavigationOrigin.ts'

test('LINK-AC06: stale source tab cannot steal focus after async load', () => {
  assert.equal(isLinkNavigationOriginCurrent(
    { documentId: 'source-a', revision: 7 }, { documentId: 'source-b', revision: 7 }
  ), false)
})

test('LINK-AC06: typed into source after click invalidates navigation', () => {
  assert.equal(isLinkNavigationOriginCurrent(
    { documentId: 'source-a', revision: 7 }, { documentId: 'source-a', revision: 8 }
  ), false)
})

test('LINK-AC06: a source scroll after the link click invalidates the delayed open', () => {
  assert.equal(isLinkNavigationOriginCurrent(
    { documentId: 'source-a', revision: 7, interactionRevision: 11 },
    { documentId: 'source-a', revision: 7, interactionRevision: 12 }
  ), false)
  assert.equal(isLinkNavigationOriginCurrent(
    { documentId: 'source-a', revision: 7, interactionRevision: 11 },
    { documentId: 'source-a', revision: 7, interactionRevision: 11 }
  ), true)
})

test('LINK-AC06: unchanged source and unrelated ordinary opens remain valid', () => {
  assert.equal(isLinkNavigationOriginCurrent(
    { documentId: 'source-a', revision: 7 }, { documentId: 'source-a', revision: 7 }
  ), true)
  assert.equal(isLinkNavigationOriginCurrent(null, null), true)
})
