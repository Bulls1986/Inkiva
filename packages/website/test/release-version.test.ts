import assert from 'node:assert/strict'
import test from 'node:test'

import { selectLatestPublishedReleaseTag } from '../src/lib/release-version'

test('uses the latest published prerelease instead of an unreleased draft', () => {
  const releases = [
    {
      tag_name: 'v0.1.0-beta.4',
      draft: true,
      prerelease: true,
      published_at: null
    },
    {
      tag_name: 'v0.1.0-beta.3',
      draft: false,
      prerelease: true,
      published_at: '2026-09-07T09:01:02Z'
    },
    {
      tag_name: 'v0.1.0-beta.2',
      draft: false,
      prerelease: true,
      published_at: '2026-09-06T09:01:02Z'
    }
  ]

  assert.equal(selectLatestPublishedReleaseTag(releases), 'v0.1.0-beta.3')
})

test('accepts a stable release when it is the latest published release', () => {
  const releases = [
    {
      tag_name: 'v0.1.0',
      draft: false,
      prerelease: false,
      published_at: '2026-10-01T00:00:00Z'
    },
    {
      tag_name: 'v0.1.0-beta.4',
      draft: false,
      prerelease: true,
      published_at: '2026-09-10T00:00:00Z'
    }
  ]

  assert.equal(selectLatestPublishedReleaseTag(releases), 'v0.1.0')
})

test('fails clearly when GitHub has no published release', () => {
  assert.throws(
    () =>
      selectLatestPublishedReleaseTag([
        {
          tag_name: 'v0.1.0-beta.4',
          draft: true,
          prerelease: true,
          published_at: null
        }
      ]),
    /No published Inkiva release found/
  )
})
