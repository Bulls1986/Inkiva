import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const watchMock = vi.fn()
const createdWatchers: Array<Record<string, ReturnType<typeof vi.fn>>> = []

function fakeWatcher(): Record<string, ReturnType<typeof vi.fn>> {
  const watcher: Record<string, ReturnType<typeof vi.fn>> = {}
  watcher.on = vi.fn(() => watcher)
  watcher.close = vi.fn()
  watcher.add = vi.fn()
  watcher.unwatch = vi.fn()
  return watcher
}

vi.mock('chokidar', () => ({
  default: {
    watch: (...args: unknown[]) => {
      watchMock(...args)
      const watcher = fakeWatcher()
      createdWatchers.push(watcher)
      return watcher
    }
  }
}))

vi.mock('ced', () => ({ default: () => 'UTF-8' }))

import Watcher, {
  WATCHER_STABILITY_POLL_INTERVAL
} from 'main_renderer/filesystem/watcher'

describe('watcher resource lifecycle', () => {
  let watcher: Watcher

  beforeEach(() => {
    vi.useFakeTimers()
    watchMock.mockClear()
    createdWatchers.length = 0
    const preferences = { getItem: vi.fn(() => false) }
    watcher = new Watcher(preferences as never)
  })

  afterEach(() => {
    watcher.close()
    vi.useRealTimers()
  })

  it('makes the returned close operation idempotent', () => {
    const win = { id: 1, webContents: { send: vi.fn() } }
    const close = watcher.watch(win as never, '/project', 'dir')

    close()
    close()

    expect(createdWatchers[0].close).toHaveBeenCalledTimes(1)
    expect(Object.keys(watcher.watchers)).toHaveLength(0)
  })

  it('expires ignored-change entries without waiting for another filesystem event', () => {
    watcher.ignoreChangedEvent(1, '/project/note.md', 100)
    const state = watcher as unknown as { _ignoreChangeEvents: unknown[] }

    expect(state._ignoreChangeEvents).toHaveLength(1)
    vi.advanceTimersByTime(100 + WATCHER_STABILITY_POLL_INTERVAL * 2)
    expect(state._ignoreChangeEvents).toHaveLength(0)
  })

  it('cancels the ignore-entry expiry timer during close', () => {
    watcher.ignoreChangedEvent(1, '/project/note.md', 1000)
    watcher.close()

    expect(vi.getTimerCount()).toBe(0)
    expect((watcher as unknown as { _ignoreChangeEvents: unknown[] })._ignoreChangeEvents)
      .toHaveLength(0)
  })
})
