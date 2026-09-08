import { autoUpdater } from 'electron-updater'
import type { UpdateProvider, UpdateCheckResult } from './types'

interface DownloadProgress {
  percent: number
}

interface ElectronAutoUpdaterLike {
  autoDownload: boolean
  allowPrerelease: boolean
  allowDowngrade: boolean
  autoInstallOnAppQuit: boolean
  on(event: 'download-progress', listener: (progress: DownloadProgress) => void): void
  checkForUpdates(): Promise<{
    updateInfo?: { version?: string }
    downloadPromise?: Promise<unknown>
  } | null>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
}

export class WindowsUpdateProvider implements UpdateProvider {
  readonly autoDownload = true
  private readonly _updater: ElectronAutoUpdaterLike
  private _downloadPromise: Promise<unknown> | undefined
  private _progressListener: ((progress: number) => void) | undefined

  constructor(
    updater: ElectronAutoUpdaterLike = autoUpdater as unknown as ElectronAutoUpdaterLike
  ) {
    this._updater = updater
    this._updater.autoDownload = true
    this._updater.allowPrerelease = false
    this._updater.allowDowngrade = false
    this._updater.autoInstallOnAppQuit = false
    this._updater.on('download-progress', ({ percent }) => {
      this._progressListener?.(percent)
    })
  }

  async checkForUpdates(): Promise<UpdateCheckResult> {
    const result = await this._updater.checkForUpdates()
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
    this._progressListener = onProgress
    try {
      await (this._downloadPromise ?? this._updater.downloadUpdate())
    } finally {
      this._progressListener = undefined
      this._downloadPromise = undefined
    }
  }

  quitAndInstall(): void {
    this._updater.quitAndInstall(false, true)
  }
}
