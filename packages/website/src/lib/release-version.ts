export interface GitHubRelease {
  tag_name: string
  draft: boolean
  prerelease: boolean
  published_at: string | null
}

const RELEASES_URL = 'https://api.github.com/repos/Bulls1986/Inkiva/releases?per_page=100'

export function selectLatestPublishedReleaseTag(releases: readonly GitHubRelease[]): string {
  const published = releases
    .filter((release) => !release.draft && release.published_at && release.tag_name.trim())
    .sort((left, right) => Date.parse(right.published_at!) - Date.parse(left.published_at!))

  const latest = published[0]
  if (!latest) {
    throw new Error('No published Inkiva release found')
  }

  return latest.tag_name.trim()
}

interface FetchReleaseOptions {
  token?: string
  fetchImpl?: typeof fetch
}

export async function fetchLatestPublishedReleaseTag({
  token,
  fetchImpl = fetch
}: FetchReleaseOptions = {}): Promise<string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetchImpl(RELEASES_URL, { headers })
  if (!response.ok) {
    throw new Error(`Failed to fetch Inkiva releases from GitHub: ${response.status} ${response.statusText}`)
  }

  const releases: unknown = await response.json()
  if (!Array.isArray(releases)) {
    throw new Error('GitHub releases response is not an array')
  }

  return selectLatestPublishedReleaseTag(releases as GitHubRelease[])
}
