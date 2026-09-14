import log from 'electron-log'
import {
  isMissingReleaseArtifactError,
  isNoFormalReleaseError,
  isStableVersion,
  isUpdateCancellationError,
  isUpdateCheckResult,
  isUpdateVerificationError,
  selectNewestStableRelease,
  UPDATE_CHECK_INTERVAL
} from './release'
import {
  UPDATE_STATE,
  type StableRelease,
  type UpdateCheckSource,
  type UpdateErrorCode,
  type UpdateManagerOptions,
  type UpdateStatus
} from './types'

const cloneStatus = (status: UpdateStatus): UpdateStatus => ({ ...status })

const isDownloadRetryableError = (status: UpdateStatus): boolean =>
  status.state === UPDATE_STATE.ERROR_RECOVERABLE &&
  (status.errorCode === 'DOWNLOAD_ERROR' ||
    status.errorCode === 'DOWNLOAD_CANCELLED' ||
    status.errorCode === 'VERIFICATION_ERROR')

const isInstallRetryableError = (status: UpdateStatus): boolean =>
  status.state === UPDATE_STATE.ERROR_RECOVERABLE &&
  status.errorCode === 'INSTALL_ERROR' &&
  status.downloadProgress === 100

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
  private _cancelPromise: Promise<UpdateStatus> | undefined
  private _downloadAttempt = 0

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
      state: enabled ? UPDATE_STATE.IDLE : 'disabled',
      currentVersion: options.currentVersion
    }
  }

  get status(): UpdateStatus {
    return cloneStatus(this._status)
  }

  async checkForUpdate(source: UpdateCheckSource): Promise<UpdateStatus> {
    if (this._status.state === 'disabled') return this.status
    if (this._checkPromise) return this._checkPromise
    if (
      this._status.state === UPDATE_STATE.CHECKING ||
      this._status.state === UPDATE_STATE.DOWNLOADING ||
      this._status.state === UPDATE_STATE.READY ||
      this._status.state === UPDATE_STATE.INSTALLING ||
      this._status.state === UPDATE_STATE.AVAILABLE ||
      this._downloadPromise
    ) return this.status

    if (source === 'background' && this._isWithinBackgroundCacheWindow()) {
      return this.status
    }

    const promise = this._check(source)
    this._checkPromise = promise
    try {
      const status = await promise
      if (source === 'background' && status.state === UPDATE_STATE.AVAILABLE) {
        void this.downloadUpdate()
      }
      return status
    } finally {
      if (this._checkPromise === promise) this._checkPromise = undefined
    }
  }

  async downloadUpdate(): Promise<UpdateStatus> {
    if (this._status.state === UPDATE_STATE.READY) return this.status
    if (!this._provider?.downloadUpdate) return this.status
    if (this._downloadPromise) return this._downloadPromise

    if (this._status.state === UPDATE_STATE.ERROR_RECOVERABLE) {
      if (!isDownloadRetryableError(this._status) || !this._latestRelease) return this.status
      this._setStatus({
        state: UPDATE_STATE.AVAILABLE,
        errorCode: undefined,
        errorMessage: undefined,
        downloadProgress: undefined
      })
    }

    if (this._status.state !== UPDATE_STATE.AVAILABLE || !this._latestRelease) {
      return this.status
    }

    const promise = this._download()
    this._downloadPromise = promise
    try {
      return await promise
    } finally {
      if (this._downloadPromise === promise) this._downloadPromise = undefined
    }
  }

  async cancelDownload(): Promise<UpdateStatus> {
    if (this._cancelPromise) return this._cancelPromise
    if (this._status.state !== UPDATE_STATE.DOWNLOADING || !this._provider?.cancelDownload) {
      return this.status
    }

    const promise = this._cancel()
    this._cancelPromise = promise
    try {
      return await promise
    } finally {
      if (this._cancelPromise === promise) this._cancelPromise = undefined
    }
  }

  async requestRestart(): Promise<boolean> {
    if (this._restartPromise) return this._restartPromise
    if (!this._provider) return false

    if (isInstallRetryableError(this._status)) {
      this._setStatus({
        state: UPDATE_STATE.READY,
        errorCode: undefined,
        errorMessage: undefined
      })
    }
    if (this._status.state !== UPDATE_STATE.READY) return false

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

    try {
      await this._provider.openRelease(releaseUrl)
      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      log.warn(`Unable to open update release: ${errorMessage}`)
      return false
    }
  }

  private async _check(source: UpdateCheckSource): Promise<UpdateStatus> {
    if (!this._provider) return this.status

    this._setStatus({
      state: UPDATE_STATE.CHECKING,
      checkSource: source,
      errorCode: undefined,
      errorMessage: undefined,
      downloadProgress: undefined
    })

    try {
      const result = await this._provider.checkForUpdates()
      if (!isUpdateCheckResult(result)) {
        throw Object.assign(new Error('Updater returned invalid release metadata'), {
          code: 'ERR_UPDATER_INVALID_UPDATE_INFO'
        })
      }

      // A cache write is an optimization. It must not turn a valid check into
      // a failed update operation when the local store is unavailable.
      this._recordSuccessfulCheck()

      const release = selectNewestStableRelease(this._status.currentVersion, result.candidates)
      if (!release) return this._setNoUpdate(source)

      this._latestRelease = release
      this._setStatus({
        state: UPDATE_STATE.AVAILABLE,
        checkSource: source,
        latestVersion: release.version,
        releaseUrl: release.releaseUrl,
        downloadProgress: undefined,
        errorCode: undefined,
        errorMessage: undefined
      })
      return this.status
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (isNoFormalReleaseError(error)) {
        this._recordSuccessfulCheck()
        return this._setNoUpdate(source)
      }
      if (isMissingReleaseArtifactError(error)) {
        log.info(`Update metadata unavailable; treating check as no update: ${errorMessage}`)
        return this._setNoUpdate(source)
      }

      const errorCode: UpdateErrorCode = isUpdateVerificationError(error)
        ? 'INVALID_RELEASE'
        : 'NETWORK_ERROR'
      log.warn(`Update ${errorCode}: ${errorMessage}`)
      this._setStatus({
        state: UPDATE_STATE.ERROR_RECOVERABLE,
        errorCode,
        errorMessage,
        downloadProgress: undefined
      })
      return this.status
    }
  }

  private async _download(): Promise<UpdateStatus> {
    const provider = this._provider
    if (!provider?.downloadUpdate) return this.status

    const attempt = ++this._downloadAttempt
    this._setStatus({
      state: UPDATE_STATE.DOWNLOADING,
      errorCode: undefined,
      errorMessage: undefined,
      downloadProgress: 0
    })

    try {
      await provider.downloadUpdate((progress) => {
        if (attempt !== this._downloadAttempt || this._status.state !== UPDATE_STATE.DOWNLOADING) {
          return
        }
        const normalizedProgress = Number.isFinite(progress)
          ? Math.min(100, Math.max(0, progress))
          : this._status.downloadProgress ?? 0
        this._status = {
          ...this._status,
          downloadProgress: normalizedProgress
        }
      })
      if (attempt !== this._downloadAttempt || this._status.state !== UPDATE_STATE.DOWNLOADING) {
        return this.status
      }
      this._setStatus({
        state: UPDATE_STATE.READY,
        downloadProgress: 100,
        errorCode: undefined,
        errorMessage: undefined
      })
      return this.status
    } catch (error) {
      if (attempt !== this._downloadAttempt) return this.status

      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorCode: UpdateErrorCode = isUpdateVerificationError(error)
        ? 'VERIFICATION_ERROR'
        : isUpdateCancellationError(error)
          ? 'DOWNLOAD_CANCELLED'
          : 'DOWNLOAD_ERROR'
      log.warn(`Update ${errorCode}: ${errorMessage}`)
      this._setStatus({
        state: UPDATE_STATE.ERROR_RECOVERABLE,
        errorCode,
        errorMessage
      })
      return this.status
    }
  }

  private async _cancel(): Promise<UpdateStatus> {
    this._downloadAttempt += 1
    const provider = this._provider
    if (!provider?.cancelDownload) return this.status

    try {
      await provider.cancelDownload()
      this._setStatus({
        state: UPDATE_STATE.ERROR_RECOVERABLE,
        errorCode: 'DOWNLOAD_CANCELLED',
        errorMessage: 'Update download cancelled'
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      log.warn(`Unable to cancel update download: ${errorMessage}`)
      this._setStatus({
        state: UPDATE_STATE.ERROR_RECOVERABLE,
        errorCode: 'DOWNLOAD_ERROR',
        errorMessage
      })
    }

    return this.status
  }

  private _restart(): Promise<boolean> {
    const provider = this._provider
    if (!provider) return Promise.resolve(false)

    return (async() => {
      try {
        const approved = await this._prepareRestart()
        if (!approved) {
          this._setStatus({ state: UPDATE_STATE.READY })
          return false
        }

        this._setStatus({
          state: UPDATE_STATE.INSTALLING,
          errorCode: undefined,
          errorMessage: undefined
        })
        provider.quitAndInstall()
        return true
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        log.warn(`Update install aborted: ${errorMessage}`)
        this._setStatus({
          state: UPDATE_STATE.ERROR_RECOVERABLE,
          errorCode: 'INSTALL_ERROR',
          errorMessage
        })
        return false
      }
    })()
  }

  private _setNoUpdate(source: UpdateCheckSource): UpdateStatus {
    this._latestRelease = undefined
    this._setStatus({
      state: UPDATE_STATE.NO_UPDATE,
      checkSource: source,
      latestVersion: undefined,
      releaseUrl: undefined,
      downloadProgress: undefined,
      errorCode: undefined,
      errorMessage: undefined
    })
    return this.status
  }

  private _recordSuccessfulCheck(): void {
    try {
      this._store.set(this._now())
    } catch (error) {
      log.warn(`Unable to persist update check timestamp: ${String(error)}`)
    }
  }

  private _isWithinBackgroundCacheWindow(): boolean {
    try {
      const lastSuccessfulCheck = this._store.get()
      if (typeof lastSuccessfulCheck !== 'number' || !Number.isFinite(lastSuccessfulCheck)) {
        return false
      }
      const elapsed = this._now() - lastSuccessfulCheck
      return elapsed >= 0 && elapsed < UPDATE_CHECK_INTERVAL
    } catch (error) {
      log.warn(`Unable to read update check timestamp: ${String(error)}`)
      return false
    }
  }

  private _setStatus(
    patch: Partial<UpdateStatus> & Pick<UpdateStatus, 'state'>
  ): void {
    this._status = {
      ...this._status,
      ...patch
    }
    try {
      this._onStatusChanged?.(this.status)
    } catch (error) {
      log.warn(`Update status observer failed: ${String(error)}`)
    }
  }
}
