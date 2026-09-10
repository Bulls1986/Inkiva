import type { ReleaseCandidate, StableRelease } from './types'

export type { ReleaseCandidate, StableRelease } from './types'

interface UpdateProviderError {
  code?: unknown
  message?: unknown
  statusCode?: unknown
  response?: {
    statusCode?: unknown
    status?: unknown
  }
}

interface ParsedVersion {
  major: number
  minor: number
  patch: number
  prerelease: string | undefined
}

const SEMVER_REGEXP =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000

/**
 * electron-updater uses an exception for an empty GitHub release feed. That
 * is a successful "no update" result for Inkiva, not a network failure.
 *
 * ERR_UPDATER_LATEST_VERSION_NOT_FOUND is also used for transport failures,
 * so only its explicit HTTP-404 form is treated as an empty release feed.
 */
export const isNoFormalReleaseError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false

  const candidate = error as UpdateProviderError
  if (candidate.code === 'ERR_UPDATER_NO_PUBLISHED_VERSIONS') return true
  if (candidate.code !== 'ERR_UPDATER_LATEST_VERSION_NOT_FOUND') return false

  const statusCode = candidate.statusCode ?? candidate.response?.statusCode ?? candidate.response?.status
  if (statusCode === 404 || statusCode === '404') return true

  return typeof candidate.message === 'string' && /\b404\b/.test(candidate.message)
}

/**
 * A published GitHub release without latest.yml is not a usable updater
 * release. This happens while a release is being repaired or after an
 * incomplete/deleted release becomes the repository's latest release. It is
 * safe to handle it as "no available update" at the application boundary,
 * while keeping it separate from a successful no-release check so it is not
 * cached for the full background-check interval.
 */
export const isMissingReleaseArtifactError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false
  return (error as UpdateProviderError).code === 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND'
}

const parseVersion = (value: string | undefined): ParsedVersion | undefined => {
  if (!value) return undefined
  const match = SEMVER_REGEXP.exec(value.trim())
  if (!match) return undefined

  if (match[4]?.split('.').some((part) => /^0\d+$/.test(part))) {
    return undefined
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]
  }
}

const compareVersions = (left: ParsedVersion, right: ParsedVersion): number => {
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1
  }

  if (left.prerelease === right.prerelease) return 0
  if (!left.prerelease) return 1
  if (!right.prerelease) return -1
  return left.prerelease > right.prerelease ? 1 : -1
}

export const isStableVersion = (version: string): boolean => {
  const parsed = parseVersion(version)
  return !!parsed && !parsed.prerelease
}

const getCandidateVersion = (candidate: ReleaseCandidate): ParsedVersion | undefined => {
  return candidate.version !== undefined
    ? parseVersion(candidate.version)
    : parseVersion(candidate.tagName)
}

const getCandidateReleaseUrl = (candidate: ReleaseCandidate): string => {
  return (
    candidate.releaseUrl ??
    `https://github.com/Bulls1986/Inkiva/releases/tag/${encodeURIComponent(candidate.tagName)}`
  )
}

export const selectNewestStableRelease = (
  currentVersion: string,
  candidates: ReleaseCandidate[]
): StableRelease | undefined => {
  const current = parseVersion(currentVersion)
  if (!current || current.prerelease) return undefined

  let newest: StableRelease | undefined
  let newestParsed: ParsedVersion | undefined

  for (const candidate of candidates) {
    if (candidate.draft !== false || candidate.prerelease !== false) continue

    const parsed = getCandidateVersion(candidate)
    if (!parsed || parsed.prerelease || compareVersions(parsed, current) <= 0) continue
    if (newestParsed && compareVersions(parsed, newestParsed) <= 0) continue

    const version = `${parsed.major}.${parsed.minor}.${parsed.patch}`
    newest = {
      ...candidate,
      version,
      draft: false,
      prerelease: false,
      releaseUrl: getCandidateReleaseUrl(candidate)
    }
    newestParsed = parsed
  }

  return newest
}

export const UPDATE_CHECK_INTERVAL = DAY_IN_MILLISECONDS
