import { describe, expect, it } from 'vitest'
import {
  isStableVersion,
  isMissingReleaseArtifactError,
  isNoFormalReleaseError,
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

  it('treats an empty, prerelease-only, or draft-only feed as no update', () => {
    expect(selectNewestStableRelease('1.0.0', [])).toBeUndefined()
    expect(selectNewestStableRelease('1.0.0', [
      release('v1.1.0-beta.1', { prerelease: true })
    ])).toBeUndefined()
    expect(selectNewestStableRelease('1.0.0', [
      release('v1.1.0', { draft: true })
    ])).toBeUndefined()
  })

  it('normalizes a release whose API version is provided separately from its tag', () => {
    const result = selectNewestStableRelease('1.0.0', [
      release('release-1.1.0', { version: '1.1.0' })
    ])

    expect(result?.version).toBe('1.1.0')
    expect(result?.tagName).toBe('release-1.1.0')
  })
})

describe('no formal release errors', () => {
  it('recognizes electron-updater no-release errors', () => {
    expect(isNoFormalReleaseError({ code: 'ERR_UPDATER_NO_PUBLISHED_VERSIONS' })).toBe(true)
    expect(isNoFormalReleaseError({
      code: 'ERR_UPDATER_LATEST_VERSION_NOT_FOUND',
      message: 'GitHub returned HTTP 404'
    })).toBe(true)
  })

  it('does not hide network or missing-artifact errors at the release filter layer', () => {
    expect(isNoFormalReleaseError({
      code: 'ERR_UPDATER_LATEST_VERSION_NOT_FOUND',
      message: 'connect ETIMEDOUT api.github.com'
    })).toBe(false)
    expect(isNoFormalReleaseError({
      code: 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND',
      message: 'latest.yml is missing'
    })).toBe(false)
    expect(isMissingReleaseArtifactError({
      code: 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND',
      message: 'latest.yml is missing'
    })).toBe(true)
  })
})
