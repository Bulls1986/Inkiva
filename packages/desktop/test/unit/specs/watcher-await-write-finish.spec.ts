import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// #3955: newly created files appeared in the sidebar ~1s late because the
// directory watcher inherited chokidar's `awaitWriteFinish` (stabilityThreshold
// 1000ms), which defers `add`/`change` events until the file size settles. That
// protection (GH#1043) only matters for the file watcher, which reloads file
// CONTENT on change; the directory watcher just lists nodes and re-sorts by
// mtime. These tests pin that only the file watcher defers events.

const watchMock = vi.fn()

function fakeWatcher(): Record<string, ReturnType<typeof vi.fn>> {
  const w: Record<string, ReturnType<typeof vi.fn>> = {}
  w.on = vi.fn(() => w)
  w.close = vi.fn()
  w.add = vi.fn()
  w.unwatch = vi.fn()
  return w
}

vi.mock('chokidar', () => ({
  default: {
    watch: (...args: unknown[]) => {
      watchMock(...args)
      return fakeWatcher()
    }
  }
}))

// Importing the watcher pulls in the markdown loader, whose encoding detection
// uses the native `ced` addon. Its bindings are built for Electron's ABI, not
// the plain-Node test runner, so stub it to keep this spec import-only.
vi.mock('ced', () => ({ default: () => 'UTF-8' }))

import Watcher, {
  WATCHER_STABILITY_THRESHOLD,
  WATCHER_STABILITY_POLL_INTERVAL,
  shouldLoadWatcherFileContent
} from 'main_renderer/filesystem/watcher'

function optionsForLastWatch(): Record<string, unknown> {
  const calls = watchMock.mock.calls
  return calls[calls.length - 1][1] as Record<string, unknown>
}

describe('watcher awaitWriteFinish (#3955)', () => {
  it('keeps directory scans metadata-only and reserves content reads for file watches', () => {
    expect(shouldLoadWatcherFileContent('dir')).toBe(false)
    expect(shouldLoadWatcherFileContent('file')).toBe(true)
  })

  let watcher: Watcher
  const win = { id: 1, webContents: { send: vi.fn() } }
  const directories: string[] = []

  beforeEach(() => {
    watchMock.mockClear()
    const preferences = { getItem: vi.fn(() => false) }
    watcher = new Watcher(preferences as never)
  })

  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
  })

  it('does not defer directory-tree events with awaitWriteFinish', () => {
    watcher.watch(win as never, '/project', 'dir')
    expect(optionsForLastWatch().awaitWriteFinish).toBeFalsy()
  })

  it('keeps awaitWriteFinish for the file watcher (GH#1043)', () => {
    watcher.watch(win as never, '/project/note.md', 'file')
    expect(optionsForLastWatch().awaitWriteFinish).toEqual({
      stabilityThreshold: WATCHER_STABILITY_THRESHOLD,
      pollInterval: WATCHER_STABILITY_POLL_INTERVAL
    })
  })

  it('ignores a self-write only when the file still has the expected content', async() => {
    const directory = mkdtempSync(path.join(tmpdir(), 'inkiva-watcher-'))
    directories.push(directory)
    const target = path.join(directory, 'note.md')
    writeFileSync(target, 'self write', 'utf8')

    watcher.ignoreChangedEvent(win.id, target, 'self write', 0)
    await expect(watcher._shouldIgnoreEvent(win.id, target, 'file', false)).resolves.toBe(true)

    writeFileSync(target, 'external change', 'utf8')
    watcher.ignoreChangedEvent(win.id, target, 'self write', 60_000)
    await expect(watcher._shouldIgnoreEvent(win.id, target, 'file', false)).resolves.toBe(false)
    expect(readFileSync(target, 'utf8')).toBe('external change')
  })
})
