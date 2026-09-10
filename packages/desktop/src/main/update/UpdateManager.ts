import log from 'electron-log'
import {
  isMissingReleaseArtifactError,
  isNoFormalReleaseError,
  isStableVersion,
  selectNewestStableRelease,
  UPDATE_CHECK_INTERVAL
} from './release'
import type { StableRelease, UpdateCheckSource, UpdateManagerOptions, UpdateStatus } from './types'

const cloneStatus = (status: UpdateStatus): UpdateStatus => ({ ...status })

export class UpdateManager {
  private readonly _provider: UpdateManagerOptions['provider']
  private readonly _store: UpdateManagerOptions['store']
  private readonly _now: () => number
  private readonly _prepareRestart: () => Promise<boolean>
  private readonly _onStatusChanged?: UpdateManagerOptions['onStatusChanged']
  private _status: UpdateStatus
  private _latestRelease: StableRelease | undefined
  private _checkPromise: Promise<UpdateStatus> | undefined
  private _downloadPromise: Promise<UpdateStatus> | undefined
  private _restartPromise: Promise<boolean> | undefined

  constructor(options: UpdateManagerOptions) {
    this._provider = options.provider
    this._store = options.store
    this._now = options.now ?? (() => Date.now())
    this._prepareRestart = options.prepareRestart ?? (async() => true)
    this._onStatusChanged = options.onStatusChanged

    const enabled =
      (options.platform === 'win32' || options.platform === 'darwin') &&
      isStableVersion(options.currentVersion) &&
      !!options.provider

    this._status = {
      state: enabled ? 'idle' : 'disabled',
      currentVersion: options.currentVersion
    }
  }

  get status(): UpdateStatus {
    return cloneStatus(this._status)
  }

  async checkForUpdate(source: UpdateCheckSource): Promise<UpdateStatus> {
    if (this._status.state === 'disabled') return this.status
    if (this._status.state === 'ready-to-install' || this._status.state === 'installing') {
      return this.status
    }
    if (this._status.state === 'downloading') return this.status
    if (this._status.state === 'available') return this.status
    if (this._checkPromise) return this._checkPromise

    if (source === 'background' && this._isWithinBackgroundCacheWindow()) {
      return this.status
    }

    const promise = this._check(source)
    this._checkPromise = promise
    try {
      const status = await promise
      if (source === 'background' && status.state === 'available') {
        void this.downloadUpdate()
      }
      return status
    } finally {
      if (this._checkPromise === promise) this._checkPromise = undefined
    }
  }

  async downloadUpdate(): Promise<UpdateStatus> {
    if (this._status.state === 'ready-to-install') return this.status
    if (this._status.state !== 'available' || !this._provider?.downloadUpdate) {
      return this.status
    }
    if (this._downloadPromise) return this._downloadPromise

    const promise = this._download()
    this._downloadPromise = promise
    try {
      return await promise
    } finally {
      if (this._downloadPromise === promise) this._downloadPromise = undefined
    }
  }

  async requestRestart(): Promise<boolean> {
    if (this._restartPromise) return this._restartPromise
    if (this._status.state !== 'ready-to-install' || !this._provider) return false

    const promise = this._restart()
    this._restartPromise = promise
    try {
      return await promise
    } finally {
      if (this._restartPromise === promise) this._restartPromise = undefined
    }
  }

  async openUpdateRelease(): Promise<boolean> {
    const releaseUrl = this._status.releaseUrl
    if (!releaseUrl || !this._provider?.openRelease) return false
    await this._provider.openRelease(releaseUrl)
    return true
  }

  private async _check(source: UpdateCheckSource): Promise<UpdateStatus> {
    if (!this._provider) return this.status

    this._setStatus({
      state: 'checking',
      checkSource: source,
      errorCode: undefined,
      errorMessage: undefined,
      downloadProgress: undefined
    })

    try {
      const result = await this._provider.checkForUpdates()
      // Only successful provider calls advance the background-cache timestamp.
      this._store.set(this._now())

      const release = selectNewestStableRelease(this._status.currentVersion, result.candidates)
      if (!release) {
        this._latestRelease = undefined
        this._setStatus({
          state: 'up-to-date',
          checkSource: source,
          latestVersion: undefined,
          releaseUrl: undefined,
          downloadProgress: undefined
        })
        return this.status
      }

      this._latestRelease = release
      this._setStatus({
        state: 'available',
        checkSource: source,
        latestVersion: release.version,
        releaseUrl: release.releaseUrl,
        downloadProgress: undefined
      })
      return this.status
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (isNoFormalReleaseError(error)) {
        this._store.set(this._now())
        this._setStatus({
          state: 'up-to-date',
          checkSource: source,
          latestVersion: undefined,
          releaseUrl: undefined,
          downloadProgress: undefined,
          errorCode: undefined,
          errorMessage: undefined
        })
        return this.status
      }
      if (isMissingReleaseArtifactError(error)) {
        log.info(`Update metadata unavailable; treating check as no update: ${errorMessage}`)
        this._setStatus({
          state: 'up-to-date',
          checkSource: source,
          latestVersion: undefined,
          releaseUrl: undefined,
          downloadProgress: undefined,
          errorCode: undefined,
          errorMessage: undefined
        })
        return this.status
      }
      log.warn(`Update NETWORK_ERROR: ${errorMessage}`)
      this._setStatus({ state: 'error', errorCode: 'NETWORK_ERROR', errorMessage })
      return this.status
    }
  }

  private async _download(): Promise<UpdateStatus> {
    const provider = this._provider
    if (!provider?.downloadUpdate) return this.status

    this._setStatus({
      state: 'downloading',
      errorCode: undefined,
      errorMessage: undefined,
      downloadProgress: 0
    })

    try {
      await provider.downloadUpdate((progress) => {
        this._status = {
          ...this._status,
          downloadProgress: Math.min(100, Math.max(0, progress))
        }
      })
      this._setStatus({ state: 'ready-to-install', downloadProgress: 100 })
      return this.status
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      log.warn(`Update DOWNLOAD_ERROR: ${errorMessage}`)
      this._setStatus({ state: 'error', errorCode: 'DOWNLOAD_ERROR', errorMessage })
      return this.status
    }
  }

  private async _restart(): Promise<boolean> {
    this._setStatus({ state: 'preparing-restart' })

    try {
      const approved = await this._prepareRestart()
      if (!approved) {
        this._setStatus({ state: 'ready-to-install' })
        return false
      }

      this._setStatus({ state: 'installing' })
      this._provider!.quitAndInstall()
      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      log.warn(`Update install aborted: ${errorMessage}`)
      this._setStatus({ state: 'ready-to-install' })
      return false
    }
  }

  private _isWithinBackgroundCacheWindow(): boolean {
    const lastSuccessfulCheck = this._store.get()
    return lastSuccessfulCheck != null && this._now() - lastSuccessfulCheck < UPDATE_CHECK_INTERVAL
  }

  private _setStatus(patch: Partial<UpdateStatus> & Pick<UpdateStatus, 'state'>): void {
    this._status = {
      ...this._status,
      ...patch
    }
    this._onStatusChanged?.(this.status)
  }
}
