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
    if (!response.ok) {
      throw new Error(`GitHub releases request failed with HTTP ${response.status}`)
    }

    const release = (await response.json()) as GitHubReleaseResponse
    const candidate: ReleaseCandidate = {
      tagName: release.tag_name ?? '',
      draft: release.draft,
      prerelease: release.prerelease,
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
