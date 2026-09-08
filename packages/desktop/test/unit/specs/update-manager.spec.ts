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
  readonly autoDownload = true
  checkCalls = 0
  downloadCalls = 0
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

  it('reports no formal release as up-to-date and records a successful check', async() => {
    const { manager, provider, store } = createManager()
    provider.result = { candidates: [] }

    await expect(manager.checkForUpdate('manual')).resolves.toMatchObject({
      state: 'up-to-date',
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
      state: 'error',
      errorCode: 'NETWORK_ERROR',
      errorMessage: 'network unavailable'
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
    expect(manager.status.state).toBe('up-to-date')
  })

  it('downloads a stable update and reaches ready-to-install', async() => {
    const { manager, provider } = createManager()
    provider.result = {
      candidates: [
        candidate('v1.1.0-beta.1', { prerelease: true }),
        candidate('v1.1.0')
      ]
    }

    await manager.checkForUpdate('manual')

    expect(provider.downloadCalls).toBe(1)
    expect(provider.progress).toEqual([35, 100])
    expect(manager.status).toMatchObject({
      state: 'ready-to-install',
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      downloadProgress: 100,
      checkSource: 'manual'
    })
  })

  it('does not re-download an already downloaded update', async() => {
    const { manager, provider } = createManager()
    provider.result = { candidates: [candidate('v1.1.0')] }

    await manager.checkForUpdate('manual')
    await manager.checkForUpdate('manual')

    expect(provider.checkCalls).toBe(1)
    expect(provider.downloadCalls).toBe(1)
  })

  it('calls the installer once only after shutdown approval', async() => {
    const { manager, provider } = createManager({
      prepareRestart: vi.fn(async() => true)
    })
    provider.result = { candidates: [candidate('v1.1.0')] }
    await manager.checkForUpdate('manual')

    const [first, second] = await Promise.all([
      manager.requestRestart(),
      manager.requestRestart()
    ])

    expect(first).toBe(true)
    expect(second).toBe(true)
    expect(provider.installCalls).toBe(1)
    expect(manager.status.state).toBe('installing')
  })

  it('returns to ready-to-install when dirty-document approval is cancelled', async() => {
    const { manager, provider } = createManager({
      prepareRestart: vi.fn(async() => false)
    })
    provider.result = { candidates: [candidate('v1.1.0')] }
    await manager.checkForUpdate('manual')

    await expect(manager.requestRestart()).resolves.toBe(false)
    expect(provider.installCalls).toBe(0)
    expect(manager.status.state).toBe('ready-to-install')
  })

  it('publishes every state transition to the main-process observer', async() => {
    const changes: UpdateStatus[] = []
    const { manager, provider } = createManager({
      onStatusChanged: (status) => changes.push(status)
    })
    provider.result = { candidates: [candidate('v1.1.0')] }

    await manager.checkForUpdate('manual')

    expect(changes.map(({ state }) => state)).toEqual([
      'checking',
      'available',
      'downloading',
      'ready-to-install'
    ])
  })
})
