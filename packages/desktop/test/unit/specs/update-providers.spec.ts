import { describe, expect, it, vi } from 'vitest'
import { MacReleaseChecker } from 'main_renderer/update/MacReleaseChecker'
import { WindowsUpdateProvider } from 'main_renderer/update/WindowsUpdateProvider'

describe('WindowsUpdateProvider', () => {
  it('locks electron-updater to the stable, explicit-restart policy', async() => {
    const listeners = new Map<string, (progress: { percent: number }) => void>()
    const updater = {
      autoDownload: false,
      allowPrerelease: true,
      allowDowngrade: true,
      autoInstallOnAppQuit: true,
      disableDifferentialDownload: true,
      on: vi.fn((event: string, listener: (progress: { percent: number }) => void) => {
        listeners.set(event, listener)
      }),
      checkForUpdates: vi.fn(async() => ({
        updateInfo: { version: '1.1.0' }
      })),
      downloadUpdate: vi.fn(async() => {}),
      quitAndInstall: vi.fn()
    }

    const provider = new WindowsUpdateProvider(updater)
    expect(updater.autoDownload).toBe(false)
    expect(updater.allowPrerelease).toBe(false)
    expect(updater.allowDowngrade).toBe(false)
    expect(updater.autoInstallOnAppQuit).toBe(false)
    expect(updater.disableDifferentialDownload).toBe(false)

    await expect(provider.checkForUpdates()).resolves.toMatchObject({
      candidates: [{ version: '1.1.0', tagName: 'v1.1.0', prerelease: false, draft: false }]
    })

    const progress: number[] = []
    const download = provider.downloadUpdate((value) => progress.push(value))
    listeners.get('download-progress')?.({ percent: 42 })
    await download
    expect(progress).toEqual([42])
    expect(updater.downloadUpdate).toHaveBeenCalledTimes(1)

    provider.quitAndInstall()
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true)
  })

  it('converts an empty GitHub feed into a successful empty result', async() => {
    const updater = {
      autoDownload: false,
      allowPrerelease: true,
      allowDowngrade: true,
      autoInstallOnAppQuit: true,
      on: vi.fn(),
      checkForUpdates: vi.fn(async() => {
        throw Object.assign(new Error('No published versions on GitHub'), {
          code: 'ERR_UPDATER_NO_PUBLISHED_VERSIONS'
        })
      }),
      downloadUpdate: vi.fn(async() => {}),
      quitAndInstall: vi.fn()
    }

    const provider = new WindowsUpdateProvider(updater)
    await expect(provider.checkForUpdates()).resolves.toEqual({ candidates: [] })
  })

  it('keeps missing channel metadata as an error for the provider caller', async() => {
    const updater = {
      autoDownload: false,
      allowPrerelease: false,
      allowDowngrade: false,
      autoInstallOnAppQuit: false,
      on: vi.fn(),
      checkForUpdates: vi.fn(async() => {
        throw Object.assign(new Error('latest.yml is missing'), {
          code: 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND'
        })
      }),
      downloadUpdate: vi.fn(async() => {}),
      quitAndInstall: vi.fn()
    }

    const provider = new WindowsUpdateProvider(updater)
    await expect(provider.checkForUpdates()).rejects.toMatchObject({
      code: 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND'
    })
  })
})

describe('MacReleaseChecker', () => {
  it('reads only the GitHub latest-release endpoint and preserves its exact URL', async() => {
    const fetchImpl = vi.fn(async() => ({
      ok: true,
      status: 200,
      json: async() => ({
        tag_name: 'v1.1.0',
        draft: false,
        prerelease: false,
        html_url: 'https://github.com/Bulls1986/Inkiva/releases/tag/v1.1.0'
      })
    }))
    const provider = new MacReleaseChecker(fetchImpl)

    await expect(provider.checkForUpdates()).resolves.toEqual({
      candidates: [{
        tagName: 'v1.1.0',
        draft: false,
        prerelease: false,
        releaseUrl: 'https://github.com/Bulls1986/Inkiva/releases/tag/v1.1.0'
      }]
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.github.com/repos/Bulls1986/Inkiva/releases/latest',
      { headers: { Accept: 'application/vnd.github+json' } }
    )
  })

  it('treats GitHub 404 as no formal release', async() => {
    const provider = new MacReleaseChecker(vi.fn(async() => ({
      ok: false,
      status: 404,
      json: async() => ({})
    })))

    await expect(provider.checkForUpdates()).resolves.toEqual({ candidates: [] })
  })

  it('rejects other HTTP failures', async() => {
    const provider = new MacReleaseChecker(vi.fn(async() => ({
      ok: false,
      status: 503,
      json: async() => ({})
    })))

    await expect(provider.checkForUpdates()).rejects.toThrow('HTTP 503')
  })

  it('does not expose prerelease, draft, or incomplete API data as stable', async() => {
    for (const body of [
      { tag_name: 'v1.1.0', draft: false, prerelease: true },
      { tag_name: 'v1.1.0', draft: true, prerelease: false },
      { tag_name: 'v1.1.0' }
    ]) {
      const provider = new MacReleaseChecker(vi.fn(async() => ({
        ok: true,
        status: 200,
        json: async() => body
      })))

      await expect(provider.checkForUpdates()).resolves.toEqual({ candidates: [] })
    }
  })
})
