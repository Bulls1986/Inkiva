export type UpdateState =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'ready-to-install'
  | 'preparing-restart'
  | 'installing'
  | 'error'

export type UpdateCheckSource = 'background' | 'manual'

export type UpdateErrorCode =
  | 'NETWORK_ERROR'
  | 'DOWNLOAD_ERROR'
  | 'INSTALL_ERROR'
  | 'INVALID_RELEASE'

export interface ReleaseCandidate {
  tagName: string
  version?: string
  draft?: boolean
  prerelease?: boolean
  releaseUrl?: string
}

export interface StableRelease extends ReleaseCandidate {
  version: string
  releaseUrl: string
  draft: false
  prerelease: false
}

export interface UpdateCheckResult {
  candidates: ReleaseCandidate[]
}

export interface UpdateProvider {
  readonly autoDownload: boolean
  checkForUpdates(): Promise<UpdateCheckResult>
  downloadUpdate?(onProgress: (progress: number) => void): Promise<void>
  quitAndInstall(): void
  openRelease?(url: string): Promise<void> | void
}

export interface UpdateCheckStore {
  get(): number | undefined
  set(value: number): void
}

export interface UpdateStatus {
  state: UpdateState
  currentVersion: string
  latestVersion?: string
  releaseUrl?: string
  downloadProgress?: number
  checkSource?: UpdateCheckSource
  errorCode?: UpdateErrorCode
  errorMessage?: string
}

export interface UpdateManagerOptions {
  platform: NodeJS.Platform | 'win32' | 'darwin' | 'linux'
  currentVersion: string
  provider?: UpdateProvider
  store: UpdateCheckStore
  now?: () => number
  prepareRestart?: () => Promise<boolean>
  onStatusChanged?: (status: UpdateStatus) => void
}
