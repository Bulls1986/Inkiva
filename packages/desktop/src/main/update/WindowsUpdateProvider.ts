import { autoUpdater } from 'electron-updater'
import { isNoFormalReleaseError } from './release'
import type { UpdateProvider, UpdateCheckResult } from './types'

interface DownloadProgress {
  percent: number
}

interface ElectronAutoUpdaterLike {
  autoDownload: boolean
  allowPrerelease: boolean
  allowDowngrade: boolean
  autoInstallOnAppQuit: boolean
  disableDifferentialDownload?: boolean
  on(event: 'download-progress', listener: (progress: DownloadProgress) => void): void
  checkForUpdates(): Promise<{
    updateInfo?: { version?: string }
    downloadPromise?: Promise<unknown>
  } | null>
  downloadUpdate(cancellationToken?: unknown): Promise<unknown>
  cancelDownload?(): Promise<void> | void
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
}

interface CancellationTokenLike {
  readonly cancelled: boolean
  onCancel(handler: () => void): void
  createPromise<R>(
    callback: (
      resolve: (value: R | PromiseLike<R>) => void,
      reject: (error: Error) => void,
      onCancel: (handler: () => void) => void
    ) => void
  ): Promise<R>
}

class DownloadCancellationToken implements CancellationTokenLike {
  private _cancelled = false
  private readonly _handlers = new Set<() => void>()

  get cancelled(): boolean {
    return this._cancelled
  }

  onCancel(handler: () => void): void {
    if (this._cancelled) {
      handler()
      return
    }
    this._handlers.add(handler)
  }

  cancel(): void {
    if (this._cancelled) return
    this._cancelled = true
    for (const handler of [...this._handlers]) handler()
    this._handlers.clear()
  }

  createPromise<R>(
    callback: (
      resolve: (value: R | PromiseLike<R>) => void,
      reject: (error: Error) => void,
      onCancel: (handler: () => void) => void
    ) => void
  ): Promise<R> {
    if (this._cancelled) return Promise.reject(new Error('cancelled'))

    let cancellationHandler: (() => void) | undefined
    return new Promise<R>((resolve, reject) => {
      cancellationHandler = () => reject(new Error('cancelled'))
      this.onCancel(cancellationHandler)
      callback(resolve, reject, (handler) => this.onCancel(handler))
    }).finally(() => {
      if (cancellationHandler) this._handlers.delete(cancellationHandler)
    })
  }

  dispose(): void {
    this._handlers.clear()
  }
}

export class WindowsUpdateProvider implements UpdateProvider {
  readonly autoDownload = false
  private readonly _updater: ElectronAutoUpdaterLike
  private _downloadPromise: Promise<unknown> | undefined
  private _downloadToken: DownloadCancellationToken | undefined
  private readonly _progressListeners = new Set<(progress: number) => void>()

  constructor(
    updater: ElectronAutoUpdaterLike = autoUpdater as unknown as ElectronAutoUpdaterLike
  ) {
    this._updater = updater
    this._updater.autoDownload = false
    this._updater.allowPrerelease = false
    this._updater.allowDowngrade = false
    this._updater.autoInstallOnAppQuit = false
    this._updater.disableDifferentialDownload = false
    this._updater.on('download-progress', ({ percent }) => {
      for (const listener of this._progressListeners) listener(percent)
    })
  }

  async checkForUpdates(): Promise<UpdateCheckResult> {
    let result: Awaited<ReturnType<ElectronAutoUpdaterLike['checkForUpdates']>>
    try {
      result = await this._updater.checkForUpdates()
    } catch (error) {
      if (isNoFormalReleaseError(error)) return { candidates: [] }
      throw error
    }

    this._downloadPromise = result?.downloadPromise
    const version = result?.updateInfo?.version
    if (!version) return { candidates: [] }

    return {
      candidates: [
        {
          tagName: `v${version}`,
          version,
          draft: false,
          prerelease: false,
          releaseUrl: `https://github.com/Bulls1986/Inkiva/releases/tag/v${version}`
        }
      ]
    }
  }

  async downloadUpdate(onProgress: (progress: number) => void): Promise<void> {
    this._progressListeners.add(onProgress)
    let promise = this._downloadPromise
    if (!promise) {
      const token = new DownloadCancellationToken()
      this._downloadToken = token
      try {
        promise = Promise.resolve(this._updater.downloadUpdate(token))
        this._downloadPromise = promise
      } catch (error) {
        this._progressListeners.delete(onProgress)
        token.dispose()
        this._downloadToken = undefined
        throw error
      }
    }

    if (!promise) {
      this._progressListeners.delete(onProgress)
      return
    }

    try {
      await promise
    } finally {
      this._progressListeners.delete(onProgress)
      if (this._downloadPromise === promise) {
        this._downloadPromise = undefined
        this._downloadToken?.dispose()
        this._downloadToken = undefined
        this._progressListeners.clear()
      }
    }
  }

  async cancelDownload(): Promise<void> {
    this._downloadToken?.cancel()
    await this._updater.cancelDownload?.()
  }

  quitAndInstall(): void {
    this._updater.quitAndInstall(false, true)
  }
}
