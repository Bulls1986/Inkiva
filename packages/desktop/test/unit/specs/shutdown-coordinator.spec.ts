import { describe, expect, it, vi } from 'vitest'
import { ShutdownCoordinator } from 'main_renderer/update/ShutdownCoordinator'
import type { UnsavedFile } from '@shared/types/files'

const dirtyFile = (id: string): UnsavedFile => ({
  id,
  filename: id,
  pathname: `/tmp/${id}.md`,
  markdown: id,
  options: {}
})

describe('ShutdownCoordinator', () => {
  it('checks the active editor first and approves only after every window succeeds', async() => {
    const windows = [{ id: 1 }, { id: 2 }, { id: 3 }]
    const order: number[] = []
    const requestUnsavedFiles = vi.fn(async({ id }: { id: number }) => {
      order.push(id)
      return id === 2 ? [dirtyFile('tab-2')] : []
    })
    const saveDirtyFiles = vi.fn(async() => true)
    const coordinator = new ShutdownCoordinator({
      getEditorWindows: () => windows,
      getActiveEditorId: () => 2,
      requestUnsavedFiles,
      saveDirtyFiles
    })

    await expect(coordinator.prepareUpdateInstall()).resolves.toBe(true)
    expect(order).toEqual([2, 1, 3])
    expect(saveDirtyFiles).toHaveBeenCalledTimes(1)
    expect(coordinator.isUpdateInstallApproved()).toBe(true)
  })

  it('cancels the whole update when one window declines or fails to save', async() => {
    const windows = [{ id: 1 }, { id: 2 }]
    const coordinator = new ShutdownCoordinator({
      getEditorWindows: () => windows,
      getActiveEditorId: () => 1,
      requestUnsavedFiles: async({ id }) => [dirtyFile(`tab-${id}`)],
      saveDirtyFiles: async({ id }) => id === 1
    })

    await expect(coordinator.prepareUpdateInstall()).resolves.toBe(false)
    expect(coordinator.isUpdateInstallApproved()).toBe(false)
    expect(coordinator.mode).toBe('normal')
  })

  it('does not run two preflight passes concurrently', async() => {
    let resolveRequest: (() => void) | undefined
    const requestUnsavedFiles = vi.fn(
      () => new Promise<UnsavedFile[]>((resolve) => {
        resolveRequest = () => resolve([])
      })
    )
    const coordinator = new ShutdownCoordinator({
      getEditorWindows: () => [{ id: 1 }],
      getActiveEditorId: () => 1,
      requestUnsavedFiles,
      saveDirtyFiles: async() => true
    })

    const first = coordinator.prepareUpdateInstall()
    const second = coordinator.prepareUpdateInstall()
    expect(requestUnsavedFiles).toHaveBeenCalledTimes(1)

    resolveRequest!()
    await expect(Promise.all([first, second])).resolves.toEqual([true, true])
  })

  it('keeps the mode normal after a failed attempt so the user can continue editing', async() => {
    const coordinator = new ShutdownCoordinator({
      getEditorWindows: () => [{ id: 1 }],
      getActiveEditorId: () => 1,
      requestUnsavedFiles: async() => [dirtyFile('tab-1')],
      saveDirtyFiles: async() => false
    })

    await coordinator.prepareUpdateInstall()
    expect(coordinator.isUpdateInstallApproved()).toBe(false)
    expect(coordinator.mode).toBe('normal')
  })
})
