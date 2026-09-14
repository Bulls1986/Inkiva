import assert from 'node:assert/strict'
import test from 'node:test'

import { DOWNLOAD_TARGETS } from '../src/lib/downloads'

test('website exposes exactly the three supported desktop download targets', () => {
  assert.deepEqual(
    DOWNLOAD_TARGETS.map((target) => target.id),
    ['windows-x64', 'macos-x64', 'macos-arm64']
  )
  assert.equal(new Set(DOWNLOAD_TARGETS.map((target) => target.id)).size, 3)
})

test('download targets link to the release page rather than unsupported artifacts', () => {
  for (const target of DOWNLOAD_TARGETS) {
    assert.match(target.href, /github\.com\/Bulls1986\/Inkiva\/releases$/)
    assert.doesNotMatch(target.label, /linux/i)
    assert.doesNotMatch(target.detail, /linux/i)
  }
})
