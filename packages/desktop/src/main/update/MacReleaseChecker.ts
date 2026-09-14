import { shell } from 'electron'
import type { ReleaseCandidate, UpdateCheckResult, UpdateProvider } from './types'

const LATEST_RELEASE_URL = 'https://api.github.com/repos/Bulls1986/Inkiva/releases/latest'

interface GitHubReleaseResponse {
  tag_name?: string
  draft?: boolean
  prerelease?: boolean
  html_url?: string
}

interface FetchResponseLike {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

type FetchLike = (input: string, init?: RequestInit) => Promise<FetchResponseLike>

const isGitHubReleaseResponse = (
  value: unknown
): value is GitHubReleaseResponse & {
  tag_name: string
  draft: false
  prerelease: false
} => {
  if (!value || typeof value !== 'object') return false

  const release = value as GitHubReleaseResponse
  return (
    typeof release.tag_name === 'string' &&
    release.tag_name.trim().length > 0 &&
    release.draft === false &&
    release.prerelease === false
  )
}

export class MacReleaseChecker implements UpdateProvider {
  readonly autoDownload = false
  private readonly _fetch: FetchLike

  constructor(fetchImpl: FetchLike = fetch) {
    this._fetch = fetchImpl
  }

  async checkForUpdates(): Promise<UpdateCheckResult> {
    const response = await this._fetch(LATEST_RELEASE_URL, {
      headers: {
        Accept: 'application/vnd.github+json'
      }
    })
    // GitHub returns 404 when the repository has no published release yet.
    // This is the normal first-release state, not an update-check failure.
    if (response.status === 404) return { candidates: [] }
    if (!response.ok) {
      throw new Error(`GitHub releases request failed with HTTP ${response.status}`)
    }

    const release = await response.json()
    // Keep the checker stable-only even if a proxy, mock, or future API shape
    // returns a draft/prerelease or incomplete object from /releases/latest.
    if (!isGitHubReleaseResponse(release)) return { candidates: [] }

    const candidate: ReleaseCandidate = {
      tagName: release.tag_name,
      draft: false,
      prerelease: false,
      releaseUrl: release.html_url
    }
    return { candidates: [candidate] }
  }

  quitAndInstall(): void {
    // macOS updates are deliberately manual: the release page is opened and
    // the signed DMG/ZIP is installed by the user.
  }

  openRelease(url: string): Promise<void> {
    return shell.openExternal(url)
  }
}
