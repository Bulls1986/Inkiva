import { describe, expect, it, vi } from 'vitest'
import { UpdateManager } from 'main_renderer/update/UpdateManager'
import type {
  ReleaseCandidate,
  UpdateCheckResult,
  UpdateProvider,
  UpdateStatus
} from 'main_renderer/update/types'

class MemoryUpdateStore {
  value: number | undefined

  get(): number | undefined {
    return this.value
  }

  set(value: number): void {
    this.value = value
  }
}

class FakeProvider implements UpdateProvider {
  readonly autoDownload = false
  checkCalls = 0
  downloadCalls = 0
  cancelCalls = 0
  installCalls = 0
  result: UpdateCheckResult = { candidates: [] }
  progress: number[] = []

  async checkForUpdates(): Promise<UpdateCheckResult> {
    this.checkCalls += 1
    return this.result
  }

  async downloadUpdate(onProgress: (progress: number) => void): Promise<void> {
    this.downloadCalls += 1
    onProgress(35)
    this.progress.push(35)
    onProgress(100)
    this.progress.push(100)
  }

  cancelDownload(): void {
    this.cancelCalls += 1
  }

  quitAndInstall(): void {
    this.installCalls += 1
  }
}

const candidate = (tagName: string, extra: Partial<ReleaseCandidate> = {}): ReleaseCandidate => ({
  tagName,
  draft: false,
  prerelease: false,
  ...extra
})

const createManager = (overrides: Partial<ConstructorParameters<typeof UpdateManager>[0]> = {}) => {
  const provider = new FakeProvider()
  const store = new MemoryUpdateStore()
  let now = 1_000_000
  const manager = new UpdateManager({
    platform: 'win32',
    currentVersion: '1.0.0',
    provider,
    store,
    now: () => now,
    ...overrides
  })
  return {
    manager,
    provider,
    store,
    advance: (milliseconds: number) => {
      now += milliseconds
    }
  }
}

describe('UpdateManager', () => {
  it('disables production updates for prerelease applications', async() => {
    const provider = new FakeProvider()
    const manager = new UpdateManager({
      platform: 'win32',
      currentVersion: '0.1.0-beta.4',
      provider,
      store: new MemoryUpdateStore()
    })

    expect(manager.status.state).toBe('disabled')
    await manager.checkForUpdate('manual')
    expect(provider.checkCalls).toBe(0)
  })

  it('uses the 24-hour cache only for background checks', async() => {
    const { manager, provider, store, advance } = createManager()
    provider.result = { candidates: [] }

    await manager.checkForUpdate('background')
    expect(provider.checkCalls).toBe(1)
    expect(store.get()).toBe(1_000_000)

    advance(60 * 60 * 1000)
    await manager.checkForUpdate('background')
    expect(provider.checkCalls).toBe(1)

    await manager.checkForUpdate('manual')
    expect(provider.checkCalls).toBe(2)
  })

  it('reports no formal release as no update and records a successful check', async() => {
    const { manager, provider, store } = createManager()
    provider.result = { candidates: [] }

    await expect(manager.checkForUpdate('manual')).resolves.toMatchObject({
      state: 'no-update',
      checkSource: 'manual',
      currentVersion: '1.0.0'
    })
    expect(store.get()).toBe(1_000_000)
    expect(provider.downloadCalls).toBe(0)
  })

  it('surfaces provider failures without recording a successful check', async() => {
    const { manager, provider, store } = createManager()
    provider.checkForUpdates = vi.fn(async() => {
      throw new Error('network unavailable')
    })

    await expect(manager.checkForUpdate('manual')).resolves.toMatchObject({
      state: 'error-recoverable',
      errorCode: 'NETWORK_ERROR',
      errorMessage: 'network unavailable'
    })
    expect(store.get()).toBeUndefined()
  })

  it('treats missing release metadata as no available update without caching it', async() => {
    const { manager, provider, store } = createManager()
    provider.checkForUpdates = vi.fn(async() => {
      throw Object.assign(new Error('latest.yml is missing'), {
        code: 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND'
      })
    })

    await expect(manager.checkForUpdate('manual')).resolves.toMatchObject({
      state: 'no-update',
      checkSource: 'manual',
      currentVersion: '1.0.0'
    })
    expect(store.get()).toBeUndefined()
  })

  it('deduplicates concurrent checks into one provider request', async() => {
    const { manager, provider } = createManager()
    let resolve: ((result: UpdateCheckResult) => void) | undefined
    provider.checkForUpdates = vi.fn(
      () => new Promise<UpdateCheckResult>((_resolve) => {
        resolve = _resolve
      })
    )

    const first = manager.checkForUpdate('manual')
    const second = manager.checkForUpdate('manual')
    expect(provider.checkForUpdates).toHaveBeenCalledTimes(1)

    resolve!({ candidates: [] })
    await Promise.all([first, second])
    expect(manager.status.state).toBe('no-update')
  })

  it('reports a stable update without downloading during a manual check', async() => {
    const { manager, provider } = createManager()
    provider.result = {
      candidates: [
        candidate('v1.1.0-beta.1', { prerelease: true }),
        candidate('v1.1.0')
      ]
    }

    await expect(manager.checkForUpdate('manual')).resolves.toMatchObject({
      state: 'available',
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      checkSource: 'manual'
    })

    expect(provider.downloadCalls).toBe(0)
    expect(manager.status.state).toBe('available')
  })

  it('downloads a stable update only after the caller starts it', async() => {
    const { manager, provider } = createManager()
    provider.result = { candidates: [candidate('v1.1.0')] }

    await manager.checkForUpdate('manual')
    await manager.downloadUpdate()

    expect(provider.downloadCalls).toBe(1)
    expect(provider.progress).toEqual([35, 100])
    expect(manager.status).toMatchObject({
      state: 'ready',
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      downloadProgress: 100,
      checkSource: 'manual'
    })
  })

  it('starts a background download after detecting a stable update', async() => {
    const { manager, provider } = createManager()
    provider.result = { candidates: [candidate('v1.1.0')] }

    const status = await manager.checkForUpdate('background')

    expect(status.state).toBe('available')
    await vi.waitFor(() => expect(provider.downloadCalls).toBe(1))
    expect(manager.status.state).toBe('ready')
  })

  it('reports download failures separately from check failures', async() => {
    const { manager, provider } = createManager()
    provider.result = { candidates: [candidate('v1.1.0')] }
    provider.downloadUpdate = vi.fn(async() => {
      throw new Error('download unavailable')
    })

    await manager.checkForUpdate('manual')
    await expect(manager.downloadUpdate()).resolves.toMatchObject({
      state: 'error-recoverable',
      errorCode: 'DOWNLOAD_ERROR',
      errorMessage: 'download unavailable'
    })
    expect(provider.downloadCalls).toBe(0)
  })

  it('does not re-download an already downloaded update', async() => {
    const { manager, provider } = createManager()
    provider.result = { candidates: [candidate('v1.1.0')] }

    await manager.checkForUpdate('manual')
    await manager.downloadUpdate()
    await manager.downloadUpdate()

    expect(provider.checkCalls).toBe(1)
    expect(provider.downloadCalls).toBe(1)
  })

  it('calls the installer once only after shutdown approval', async() => {
    const { manager, provider } = createManager({
      prepareRestart: vi.fn(async() => true)
    })
    provider.result = { candidates: [candidate('v1.1.0')] }
    await manager.checkForUpdate('manual')
    await manager.downloadUpdate()

    const [first, second] = await Promise.all([manager.requestRestart(), manager.requestRestart()])

    expect(first).toBe(true)
    expect(second).toBe(true)
    expect(provider.installCalls).toBe(1)
    expect(manager.status.state).toBe('installing')
  })

  it('returns to ready when dirty-document approval is cancelled', async() => {
    const { manager, provider } = createManager({
      prepareRestart: vi.fn(async() => false)
    })
    provider.result = { candidates: [candidate('v1.1.0')] }
    await manager.checkForUpdate('manual')
    await manager.downloadUpdate()

    await expect(manager.requestRestart()).resolves.toBe(false)
    expect(provider.installCalls).toBe(0)
    expect(manager.status.state).toBe('ready')
  })

  it('publishes every state transition to the main-process observer', async() => {
    const changes: UpdateStatus[] = []
    const { manager, provider } = createManager({
      onStatusChanged: (status) => changes.push(status)
    })
    provider.result = { candidates: [candidate('v1.1.0')] }

    await manager.checkForUpdate('manual')
    await manager.downloadUpdate()

    expect(changes.map(({ state }) => state)).toEqual([
      'checking',
      'available',
      'downloading',
      'ready'
    ])
  })

  it('retries a transient network or DNS failure on a later manual check', async() => {
    const { manager, provider, store } = createManager()
    const checkForUpdates = vi
      .fn<() => Promise<UpdateCheckResult>>()
      .mockRejectedValueOnce(Object.assign(new Error('getaddrinfo ENOTFOUND api.github.com'), {
        code: 'ENOTFOUND'
      }))
      .mockResolvedValueOnce({ candidates: [] })
    provider.checkForUpdates = checkForUpdates

    await expect(manager.checkForUpdate('manual')).resolves.toMatchObject({
      state: 'error-recoverable',
      errorCode: 'NETWORK_ERROR'
    })
    expect(store.get()).toBeUndefined()

    await expect(manager.checkForUpdate('manual')).resolves.toMatchObject({
      state: 'no-update'
    })
    expect(checkForUpdates).toHaveBeenCalledTimes(2)
    expect(store.get()).toBe(1_000_000)
  })

  it('keeps a downloaded release retryable after an interrupted download', async() => {
    const { manager, provider } = createManager()
    provider.result = { candidates: [candidate('v1.1.0')] }
    const downloadUpdate = vi
      .fn<(onProgress: (progress: number) => void) => Promise<void>>()
      .mockRejectedValueOnce(Object.assign(new Error('connection reset'), {
        code: 'ECONNRESET'
      }))
      .mockImplementationOnce(async(onProgress) => {
        onProgress(100)
      })
    provider.downloadUpdate = downloadUpdate

    await manager.checkForUpdate('manual')
    await expect(manager.downloadUpdate()).resolves.toMatchObject({
      state: 'error-recoverable',
      errorCode: 'DOWNLOAD_ERROR',
      latestVersion: '1.1.0'
    })

    await expect(manager.downloadUpdate()).resolves.toMatchObject({
      state: 'ready',
      latestVersion: '1.1.0',
      downloadProgress: 100
    })
    expect(downloadUpdate).toHaveBeenCalledTimes(2)
  })

  it('surfaces checksum and signature failures as recoverable verification errors', async() => {
    const { manager, provider } = createManager()
    provider.result = { candidates: [candidate('v1.1.0')] }
    provider.downloadUpdate = vi.fn(async() => {
      throw Object.assign(new Error('sha512 checksum mismatch'), {
        code: 'ERR_CHECKSUM_MISMATCH'
      })
    })

    await manager.checkForUpdate('manual')
    await expect(manager.downloadUpdate()).resolves.toMatchObject({
      state: 'error-recoverable',
      errorCode: 'VERIFICATION_ERROR',
      latestVersion: '1.1.0'
    })
  })

  it('deduplicates repeated download clicks while the provider is active', async() => {
    const { manager, provider } = createManager()
    provider.result = { candidates: [candidate('v1.1.0')] }
    let resolveDownload: (() => void) | undefined
    const downloadUpdate = vi.fn(
      (_onProgress: (progress: number) => void) => new Promise<void>((resolve) => {
        resolveDownload = resolve
      })
    )
    provider.downloadUpdate = downloadUpdate

    await manager.checkForUpdate('manual')
    const first = manager.downloadUpdate()
    const second = manager.downloadUpdate()
    expect(downloadUpdate).toHaveBeenCalledTimes(1)
    expect(manager.status.state).toBe('downloading')

    expect(resolveDownload).toBeDefined()
    resolveDownload?.()
    await Promise.all([first, second])
    expect(manager.status.state).toBe('ready')
  })

  it('cancels an active download without allowing its late completion to install', async() => {
    const { manager, provider } = createManager()
    provider.result = { candidates: [candidate('v1.1.0')] }
    let resolveDownload: (() => void) | undefined
    provider.downloadUpdate = vi.fn(
      (_onProgress: (progress: number) => void) => new Promise<void>((resolve) => {
        resolveDownload = resolve
      })
    )

    await manager.checkForUpdate('manual')
    const download = manager.downloadUpdate()
    await expect(manager.cancelDownload()).resolves.toMatchObject({
      state: 'error-recoverable',
      errorCode: 'DOWNLOAD_CANCELLED'
    })
    expect(provider.cancelCalls).toBe(1)

    expect(resolveDownload).toBeDefined()
    resolveDownload?.()
    await download
    expect(manager.status.state).toBe('error-recoverable')
    expect(provider.installCalls).toBe(0)
  })

  it('makes installer failures recoverable and allows a later restart attempt', async() => {
    const { manager, provider } = createManager()
    provider.result = { candidates: [candidate('v1.1.0')] }
    await manager.checkForUpdate('manual')
    await manager.downloadUpdate()

    provider.quitAndInstall = vi.fn(() => {
      throw new Error('installer unavailable')
    })
    await expect(manager.requestRestart()).resolves.toBe(false)
    expect(manager.status).toMatchObject({
      state: 'error-recoverable',
      errorCode: 'INSTALL_ERROR',
      latestVersion: '1.1.0'
    })

    provider.quitAndInstall = vi.fn()
    await expect(manager.requestRestart()).resolves.toBe(true)
    expect(manager.status.state).toBe('installing')
  })
})
