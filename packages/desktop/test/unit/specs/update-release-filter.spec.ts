import { describe, expect, it } from 'vitest'
import {
  isStableVersion,
  selectNewestStableRelease,
  type ReleaseCandidate
} from 'main_renderer/update/release'

const release = (tagName: string, extra: Partial<ReleaseCandidate> = {}): ReleaseCandidate => ({
  tagName,
  draft: false,
  prerelease: false,
  ...extra
})

describe('stable release filtering', () => {
  it('rejects prerelease application versions from the production updater', () => {
    expect(isStableVersion('0.1.0-beta.4')).toBe(false)
    expect(isStableVersion('1.0.0-rc.1')).toBe(false)
    expect(isStableVersion('1.0.0')).toBe(true)
  })

  it('selects only a newer, valid, non-draft, non-prerelease release', () => {
    const result = selectNewestStableRelease('1.0.0', [
      release('v1.1.0-beta.1', { prerelease: true }),
      release('v1.0.9', { draft: true }),
      release('nightly'),
      release('v1.0.1'),
      release('v1.2.0')
    ])

    expect(result?.version).toBe('1.2.0')
    expect(result?.tagName).toBe('v1.2.0')
  })

  it('does not downgrade or accept the current version again', () => {
    const result = selectNewestStableRelease('1.2.0', [
      release('v1.2.0'),
      release('v1.1.9'),
      release('v1.2.0-beta.1', { prerelease: true })
    ])

    expect(result).toBeUndefined()
  })

  it('normalizes a release whose API version is provided separately from its tag', () => {
    const result = selectNewestStableRelease('1.0.0', [
      release('release-1.1.0', { version: '1.1.0' })
    ])

    expect(result?.version).toBe('1.1.0')
    expect(result?.tagName).toBe('release-1.1.0')
  })
})
