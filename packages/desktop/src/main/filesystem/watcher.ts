import path from 'path'
import fsPromises from 'fs/promises'
import log from 'electron-log'
import chokidar, { type FSWatcher } from 'chokidar'
import { exists } from 'common/filesystem'
import { hasMarkdownExtension, checkPathExcludePattern } from 'common/filesystem/paths'
import { getUniqueId } from '../utils'
import { loadMarkdownFile } from '../filesystem/markdown'
import { isLinux, isOsx } from '../config'
import {
  getWatcherEventCoalescingKey,
  WatcherEventBatcher,
  type WatcherBatchChannel
} from './watcherBatch'
import type { BrowserWindow } from 'electron'
import type { LineEnding } from '@shared/types/files'
import type Preference from '../preferences'

export const WATCHER_STABILITY_THRESHOLD = 1000
export const WATCHER_STABILITY_POLL_INTERVAL = 150
const WATCHER_DEFAULT_IGNORE_DURATION =
  WATCHER_STABILITY_THRESHOLD + WATCHER_STABILITY_POLL_INTERVAL * 2

const EVENT_NAME = {
  dir: 'mt::update-object-tree' as const,
  file: 'mt::update-file' as const
}

type WatchType = 'dir' | 'file'
type WatcherEventEmitter = (channel: WatcherBatchChannel, payload: unknown, key: string) => void

interface IgnoreEntry {
  windowId: number
  pathname: string
  duration: number
  start: Date
  expectedContent?: string
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
  autoNormalizeLineEndings: boolean,
  isActive: () => boolean,
  emit: WatcherEventEmitter
): Promise<void> => {
  if (!isActive()) return
  const stats = await fsPromises.stat(pathname)
  if (!isActive()) return
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
    if (!isActive()) return
    if (type === 'file') {
      win.webContents.send('mt::show-notification', {
        title: 'Watcher I/O error',
        type: 'error',
        message: err instanceof Error ? err.message : String(err)
      })
      return
    }
  }

  if (!isActive()) return
  emit(EVENT_NAME[type], { type: 'add', change: file }, pathname)
}

const unlink = (
  win: BrowserWindow,
  pathname: string,
  type: WatchType,
  emit: WatcherEventEmitter
): void => {
  emit(EVENT_NAME[type], { type: 'unlink', change: { pathname } }, pathname)
}

const change = async(
  win: BrowserWindow,
  pathname: string,
  type: WatchType,
  endOfLine: LineEnding,
  autoGuessEncoding: boolean,
  trimTrailingNewline: number,
  autoNormalizeLineEndings: boolean,
  isActive: () => boolean,
  emit: WatcherEventEmitter
): Promise<void> => {
  if (!isActive()) return
  if (type === 'dir') {
    try {
      const stats = await fsPromises.stat(pathname)
      if (!isActive()) return
      emit('mt::update-object-tree', {
        type: 'change',
        change: { pathname, mtimeMs: stats.mtimeMs }
      }, pathname)
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
    if (!isActive()) return
    emit('mt::update-file', {
      type: 'change',
      change: { pathname, data, mtimeMs: stats.mtimeMs }
    }, pathname)
  } catch (err) {
    if (!isActive()) return
    win.webContents.send('mt::show-notification', {
      title: 'Watcher I/O error',
      type: 'error',
      message: err instanceof Error ? err.message : String(err)
    })
  }
}

const addDir = (
  win: BrowserWindow,
  pathname: string,
  type: WatchType,
  emit: WatcherEventEmitter
): void => {
  if (type === 'file') return
  emit('mt::update-object-tree', {
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
  }, pathname)
}

const unlinkDir = (
  win: BrowserWindow,
  pathname: string,
  type: WatchType,
  emit: WatcherEventEmitter
): void => {
  if (type === 'file') return
  emit('mt::update-object-tree', {
    type: 'unlinkDir',
    change: { pathname }
  }, pathname)
}

class Watcher {
  private _preferences: Preference
  private _ignoreChangeEvents: IgnoreEntry[]
  private _ignoreChangeCleanupTimer: NodeJS.Timeout | null
  watchers: Record<string, WatcherEntry>

  constructor(preferences: Preference) {
    this._preferences = preferences
    this._ignoreChangeEvents = []
    this._ignoreChangeCleanupTimer = null
    this.watchers = {}
  }

  private _pruneExpiredIgnoreEvents(now = Date.now()): void {
    const gracePeriod = WATCHER_STABILITY_POLL_INTERVAL * 2
    this._ignoreChangeEvents = this._ignoreChangeEvents.filter((entry) => {
      return now < entry.start.getTime() + entry.duration + gracePeriod
    })
  }

  private _scheduleIgnoreChangeCleanup(): void {
    if (this._ignoreChangeCleanupTimer) {
      clearTimeout(this._ignoreChangeCleanupTimer)
      this._ignoreChangeCleanupTimer = null
    }
    if (!this._ignoreChangeEvents.length) {
      return
    }

    const gracePeriod = WATCHER_STABILITY_POLL_INTERVAL * 2
    const nextExpiry = Math.min(...this._ignoreChangeEvents.map((entry) => {
      return entry.start.getTime() + entry.duration + gracePeriod
    }))
    const delay = Math.max(0, nextExpiry - Date.now())
    this._ignoreChangeCleanupTimer = setTimeout(() => {
      this._ignoreChangeCleanupTimer = null
      this._pruneExpiredIgnoreEvents()
      this._scheduleIgnoreChangeCleanup()
    }, delay)
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
    const batcher = new WatcherEventBatcher({
      send: (channel, payload) => win.webContents.send(channel, payload),
      onSendError: (error) => log.debug('Failed to send batched watcher event:', error)
    })
    const emit: WatcherEventEmitter = (channel, payload, key) => {
      batcher.enqueue(
        channel,
        payload,
        getWatcherEventCoalescingKey(channel, payload, key)
      )
    }

    watcher
      .on('add', async(pathname: string) => {
        if (await this._shouldIgnoreEvent(win.id, pathname, type, usePolling)) return
        if (disposed) return
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
          autoNormalizeLineEndings,
          () => !disposed,
          emit
        )
      })
      .on('change', async(pathname: string) => {
        if (await this._shouldIgnoreEvent(win.id, pathname, type, usePolling)) return
        if (disposed) return
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
          autoNormalizeLineEndings,
          () => !disposed,
          emit
        )
      })
      .on('unlink', (pathname: string) => {
        if (!disposed) unlink(win, pathname, type, emit)
      })
      .on('addDir', (pathname: string) => {
        if (!disposed) addDir(win, pathname, type, emit)
      })
      .on('unlinkDir', (pathname: string) => {
        if (!disposed) unlinkDir(win, pathname, type, emit)
      })
      .on('raw', (event: string, subpath: string, details: unknown) => {
        if (globalThis.INKIVA_DEBUG_VERBOSE >= 3) {
          console.log('watcher: ', event, subpath, details)
        }

        if (isLinux && type === 'file' && event === 'rename') {
          if (renameTimer) clearTimeout(renameTimer)
          renameTimer = setTimeout(async() => {
            renameTimer = null
            if (disposed) return
            if (await exists(watchPath)) {
              if (disposed) return
              await watcher.unwatch(watchPath)
              if (disposed) return
              watcher.add(watchPath)
            }
          }, 150)
        }
      })
      .on('error', (error: unknown) => {
        const code = (error as NodeJS.ErrnoException)?.code
        if (code === 'ENOSPC') {
          if (!disposed && !enospcReached) {
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
      if (disposed) return
      disposed = true
      delete this.watchers[id]
      if (renameTimer) {
        clearTimeout(renameTimer)
        renameTimer = null
      }
      batcher.close()
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
    if (this._ignoreChangeCleanupTimer) {
      clearTimeout(this._ignoreChangeCleanupTimer)
      this._ignoreChangeCleanupTimer = null
    }
  }

  ignoreChangedEvent(
    windowId: number,
    pathname: string,
    expectedContentOrDuration: string | number = WATCHER_DEFAULT_IGNORE_DURATION,
    duration: number = WATCHER_DEFAULT_IGNORE_DURATION
  ): void {
    const expectedContent = typeof expectedContentOrDuration === 'string'
      ? expectedContentOrDuration
      : undefined
    if (typeof expectedContentOrDuration === 'number') duration = expectedContentOrDuration

    // A second save supersedes the first expected snapshot. Keeping stale
    // entries would make a later external change look like an old self-write.
    this._ignoreChangeEvents = this._ignoreChangeEvents.filter(
      (entry) => entry.windowId !== windowId || entry.pathname !== pathname
    )
    this._ignoreChangeEvents.push({
      windowId,
      pathname,
      duration,
      start: new Date(),
      expectedContent
    })
    this._scheduleIgnoreChangeCleanup()
  }

  private _getMarkdownLoadOptions(): {
    endOfLine: LineEnding
    autoGuessEncoding: boolean
    trimTrailingNewline: number
    autoNormalizeLineEndings: boolean
  } {
    const preferences = this._preferences as unknown as {
      getPreferredEol?: () => LineEnding
      getAll?: () => Record<string, unknown>
    }
    const all = preferences.getAll?.() ?? {}
    return {
      endOfLine: preferences.getPreferredEol?.() ?? 'lf',
      autoGuessEncoding: all.autoGuessEncoding !== false,
      trimTrailingNewline: typeof all.trimTrailingNewline === 'number'
        ? all.trimTrailingNewline
        : 2,
      autoNormalizeLineEndings: all.autoNormalizeLineEndings === true
    }
  }

  async _shouldIgnoreEvent(
    winId: number,
    pathname: string,
    type: WatchType,
    usePolling: boolean
  ): Promise<boolean> {
    if (type !== 'file') return false

    const currentTime = new Date()
    this._pruneExpiredIgnoreEvents(currentTime.getTime())
    for (let i = 0; i < this._ignoreChangeEvents.length; ++i) {
      const entry = this._ignoreChangeEvents[i]
      if (entry.windowId !== winId || entry.pathname !== pathname) continue

      this._ignoreChangeEvents.splice(i, 1)
      if (entry.expectedContent !== undefined) {
        try {
          const {
            endOfLine,
            autoGuessEncoding,
            trimTrailingNewline,
            autoNormalizeLineEndings
          } = this._getMarkdownLoadOptions()
          const data = await loadMarkdownFile(
            pathname,
            endOfLine,
            autoGuessEncoding,
            trimTrailingNewline,
            autoNormalizeLineEndings
          )
          const normalizeLineEndings = (text: string): string => text.replace(/\r\n?/g, '\n')
          const matches =
            normalizeLineEndings(data.markdown) === normalizeLineEndings(entry.expectedContent)
          this._scheduleIgnoreChangeCleanup()
          return matches
        } catch (error) {
          // A disappeared or unreadable file is not evidence of a self-write.
          // Let the normal watcher path report the I/O problem or unlink.
          log.debug('Failed to compare expected self-write content:', error)
          this._scheduleIgnoreChangeCleanup()
          return false
        }
      }

      if (currentTime.getTime() - entry.start.getTime() < entry.duration) {
        this._scheduleIgnoreChangeCleanup()
        return true
      }

      if (!usePolling) {
        try {
          const fileInfo = await fsPromises.stat(pathname)
          if (fileInfo.mtime.getTime() - entry.start.getTime() < entry.duration) {
            this._scheduleIgnoreChangeCleanup()
            return true
          }
        } catch (error) {
          console.error('Failed to "stat" file to determine modification time:', error)
        }
      }
    }
    this._scheduleIgnoreChangeCleanup()
    return false
  }
}

export default Watcher
