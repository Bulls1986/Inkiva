import path from 'path'
import fsPromises from 'fs/promises'
import log from 'electron-log'
import chokidar, { type FSWatcher } from 'chokidar'
import { exists } from 'common/filesystem'
import { hasMarkdownExtension, checkPathExcludePattern } from 'common/filesystem/paths'
import { getUniqueId } from '../utils'
import { loadMarkdownFile } from '../filesystem/markdown'
import { isLinux, isOsx } from '../config'
import type { BrowserWindow } from 'electron'
import type { LineEnding } from '@shared/types/files'
import type Preference from '../preferences'

export const WATCHER_STABILITY_THRESHOLD = 1000
export const WATCHER_STABILITY_POLL_INTERVAL = 150

const EVENT_NAME = {
  dir: 'mt::update-object-tree' as const,
  file: 'mt::update-file' as const
}

type WatchType = 'dir' | 'file'

interface IgnoreEntry {
  windowId: number
  pathname: string
  duration: number
  start: Date
}

interface WatcherEntry {
  win: BrowserWindow
  watcher: FSWatcher
  pathname: string
  type: WatchType
  close: () => void
}

const add = async(
  win: BrowserWindow,
  pathname: string,
  type: WatchType,
  endOfLine: LineEnding,
  autoGuessEncoding: boolean,
  trimTrailingNewline: number,
  autoNormalizeLineEndings: boolean
): Promise<void> => {
  const stats = await fsPromises.stat(pathname)
  const isMarkdown = hasMarkdownExtension(pathname)
  const file: {
    pathname: string
    name: string
    isFile: boolean
    isDirectory: boolean
    birthTime: Date
    mtimeMs: number
    isMarkdown: boolean
    data?: Awaited<ReturnType<typeof loadMarkdownFile>>
  } = {
    pathname,
    name: path.basename(pathname),
    isFile: true,
    isDirectory: false,
    birthTime: stats.birthtime,
    mtimeMs: stats.mtimeMs,
    isMarkdown
  }

  if (!isMarkdown) return

  try {
    file.data = await loadMarkdownFile(
      pathname,
      endOfLine,
      autoGuessEncoding,
      trimTrailingNewline,
      autoNormalizeLineEndings
    )
  } catch (err) {
    if (type === 'file') {
      win.webContents.send('mt::show-notification', {
        title: 'Watcher I/O error',
        type: 'error',
        message: err instanceof Error ? err.message : String(err)
      })
      return
    }
  }

  win.webContents.send(EVENT_NAME[type], { type: 'add', change: file })
}

const unlink = (win: BrowserWindow, pathname: string, type: WatchType): void => {
  win.webContents.send(EVENT_NAME[type], { type: 'unlink', change: { pathname } })
}

const change = async(
  win: BrowserWindow,
  pathname: string,
  type: WatchType,
  endOfLine: LineEnding,
  autoGuessEncoding: boolean,
  trimTrailingNewline: number,
  autoNormalizeLineEndings: boolean
): Promise<void> => {
  if (type === 'dir') {
    try {
      const stats = await fsPromises.stat(pathname)
      win.webContents.send('mt::update-object-tree', {
        type: 'change',
        change: { pathname, mtimeMs: stats.mtimeMs }
      })
    } catch {
      // File may disappear between the event and stat.
    }
    return
  }

  if (!hasMarkdownExtension(pathname)) return

  try {
    const [data, stats] = await Promise.all([
      loadMarkdownFile(
        pathname,
        endOfLine,
        autoGuessEncoding,
        trimTrailingNewline,
        autoNormalizeLineEndings
      ),
      fsPromises.stat(pathname)
    ])
    win.webContents.send('mt::update-file', {
      type: 'change',
      change: { pathname, data, mtimeMs: stats.mtimeMs }
    })
  } catch (err) {
    win.webContents.send('mt::show-notification', {
      title: 'Watcher I/O error',
      type: 'error',
      message: err instanceof Error ? err.message : String(err)
    })
  }
}

const addDir = (win: BrowserWindow, pathname: string, type: WatchType): void => {
  if (type === 'file') return
  win.webContents.send('mt::update-object-tree', {
    type: 'addDir',
    change: {
      pathname,
      name: path.basename(pathname),
      isCollapsed: true,
      isDirectory: true,
      isFile: false,
      isMarkdown: false,
      folders: [],
      files: []
    }
  })
}

const unlinkDir = (win: BrowserWindow, pathname: string, type: WatchType): void => {
  if (type === 'file') return
  win.webContents.send('mt::update-object-tree', {
    type: 'unlinkDir',
    change: { pathname }
  })
}

class Watcher {
  private _preferences: Preference
  private _ignoreChangeEvents: IgnoreEntry[]
  watchers: Record<string, WatcherEntry>

  constructor(preferences: Preference) {
    this._preferences = preferences
    this._ignoreChangeEvents = []
    this.watchers = {}
  }

  watch(win: BrowserWindow, watchPath: string, type: WatchType = 'dir'): () => void {
    const configuredPolling = this._preferences.getItem<boolean>('watcherUsePolling')
    // macOS polling is retained for individual opened files, where atomic-save
    // reliability matters, but not for recursive project-directory watchers.
    // Polling a large tree continuously is a major idle CPU/I/O cost.
    const usePolling = configuredPolling || (isOsx && type === 'file')
    const id = getUniqueId()

    const watcher = chokidar.watch(watchPath, {
      ignored: (pathname: string, fileInfo?: { isDirectory: () => boolean }) => {
        if (!fileInfo) {
          return /(?:^|[/\\])(?:node_modules|(?:.+\.asar))/.test(pathname)
        }
        if (/(?:^|[/\\])(?:node_modules|(?:.+\.asar))/.test(pathname)) return true
        if (
          checkPathExcludePattern(
            pathname,
            this._preferences.getItem<readonly string[]>('treePathExcludePatterns')
          )
        ) {
          return true
        }
        if (fileInfo.isDirectory()) return false
        return !hasMarkdownExtension(pathname)
      },
      ignoreInitial: type === 'file',
      persistent: true,
      ignorePermissionErrors: true,
      depth: type === 'file' ? (isOsx ? 1 : 0) : undefined,
      ...(type === 'file'
        ? {
          awaitWriteFinish: {
            stabilityThreshold: WATCHER_STABILITY_THRESHOLD,
            pollInterval: WATCHER_STABILITY_POLL_INTERVAL
          }
        }
        : {}),
      usePolling
    } as unknown as Parameters<typeof chokidar.watch>[1])

    let disposed = false
    let enospcReached = false
    let renameTimer: NodeJS.Timeout | null = null

    watcher
      .on('add', async(pathname: string) => {
        if (await this._shouldIgnoreEvent(win.id, pathname, type, usePolling)) return
        const eol = this._preferences.getPreferredEol() as LineEnding
        const {
          autoGuessEncoding = true,
          trimTrailingNewline = 2,
          autoNormalizeLineEndings = false
        } = this._preferences.getAll()
        void add(
          win,
          pathname,
          type,
          eol,
          autoGuessEncoding,
          trimTrailingNewline,
          autoNormalizeLineEndings
        )
      })
      .on('change', async(pathname: string) => {
        if (await this._shouldIgnoreEvent(win.id, pathname, type, usePolling)) return
        const eol = this._preferences.getPreferredEol() as LineEnding
        const {
          autoGuessEncoding = true,
          trimTrailingNewline = 2,
          autoNormalizeLineEndings = false
        } = this._preferences.getAll()
        void change(
          win,
          pathname,
          type,
          eol,
          autoGuessEncoding,
          trimTrailingNewline,
          autoNormalizeLineEndings
        )
      })
      .on('unlink', (pathname: string) => unlink(win, pathname, type))
      .on('addDir', (pathname: string) => addDir(win, pathname, type))
      .on('unlinkDir', (pathname: string) => unlinkDir(win, pathname, type))
      .on('raw', (event: string, subpath: string, details: unknown) => {
        if (globalThis.MARKTEXT_DEBUG_VERBOSE >= 3) {
          console.log('watcher: ', event, subpath, details)
        }

        if (isLinux && type === 'file' && event === 'rename') {
          if (renameTimer) clearTimeout(renameTimer)
          renameTimer = setTimeout(async() => {
            renameTimer = null
            if (disposed) return
            if (await exists(watchPath)) {
              await watcher.unwatch(watchPath)
              watcher.add(watchPath)
            }
          }, 150)
        }
      })
      .on('error', (error: unknown) => {
        const code = (error as NodeJS.ErrnoException)?.code
        if (code === 'ENOSPC') {
          if (!enospcReached) {
            enospcReached = true
            log.warn('inotify limit reached: Too many file descriptors are opened.')
            win.webContents.send('mt::show-notification', {
              title: 'inotify limit reached',
              type: 'warning',
              message:
                'Cannot watch all files and file changes because too many file descriptors are opened.'
            })
          }
        } else {
          log.error('Error while watching files:', error)
        }
      })

    const closeFn = (): void => {
      disposed = true
      delete this.watchers[id]
      if (renameTimer) {
        clearTimeout(renameTimer)
        renameTimer = null
      }
      void watcher.close()
    }

    this.watchers[id] = { win, watcher, pathname: watchPath, type, close: closeFn }
    return closeFn
  }

  unwatch(win: BrowserWindow, watchPath: string, type: WatchType = 'dir'): void {
    for (const id of Object.keys(this.watchers)) {
      const entry = this.watchers[id]
      if (entry.win === win && entry.pathname === watchPath && entry.type === type) {
        entry.close()
        break
      }
    }
  }

  unwatchByWindowId(windowId: number): void {
    for (const id of Object.keys(this.watchers)) {
      const entry = this.watchers[id]
      if (entry.win.id === windowId) entry.close()
    }
  }

  close(): void {
    Object.keys(this.watchers).forEach((id) => this.watchers[id].close())
    this.watchers = {}
    this._ignoreChangeEvents = []
  }

  ignoreChangedEvent(
    windowId: number,
    pathname: string,
    duration: number = WATCHER_STABILITY_THRESHOLD + WATCHER_STABILITY_POLL_INTERVAL * 2
  ): void {
    this._ignoreChangeEvents.push({ windowId, pathname, duration, start: new Date() })
  }

  async _shouldIgnoreEvent(
    winId: number,
    pathname: string,
    type: WatchType,
    usePolling: boolean
  ): Promise<boolean> {
    if (type !== 'file') return false

    const currentTime = new Date()
    for (let i = 0; i < this._ignoreChangeEvents.length; ++i) {
      const entry = this._ignoreChangeEvents[i]
      if (entry.windowId !== winId || entry.pathname !== pathname) continue

      this._ignoreChangeEvents.splice(i, 1)
      --i
      if (currentTime.getTime() - entry.start.getTime() < entry.duration) return true

      if (!usePolling) {
        try {
          const fileInfo = await fsPromises.stat(pathname)
          if (fileInfo.mtime.getTime() - entry.start.getTime() < entry.duration) return true
        } catch (error) {
          console.error('Failed to "stat" file to determine modification time:', error)
        }
      }
    }
    return false
  }
}

export default Watcher
