import bus from '../bus'
import { delay } from '@/util'
import FileSearcher from '@/node/fileSearcher'
import {
  fuzzySearchPaths,
  SearchAbortError,
  SearchPathIndex,
  type CancellableSearchPromise
} from '@/node/workspaceSearch'
import type { EditorState } from '@/store/editor'
import { useRecentDocumentsStore } from '@/store/recentDocuments'
import getCommandDescriptionById from './descriptions'
import { t } from '../i18n'
import { rendererPerformance } from '@/services/performance/runtime'
import {
  BACKGROUND_PRIORITY,
  BackgroundTaskScheduler
} from '../util/backgroundScheduler'

const SEARCH_DEBOUNCE_MS = 220
const QUICK_OPEN_RESULT_LIMIT = 100

const quickOpenBackgroundScheduler = new BackgroundTaskScheduler({
  onSlice: (task, durationMs) => {
    if (!rendererPerformance.enabled) return
    rendererPerformance.recordSample('background.taskSlice', 'ms', durationMs, {
      phase: 'search',
      metadata: {
        taskId: task.id,
        priority: task.priority
      }
    })
  }
})

interface QuickOpenSubcommand {
  id: string
  description?: string
  title?: string
}

const MARKDOWN_EXTENSIONS = new Set([
  'markdown',
  'mdown',
  'mkdn',
  'md',
  'mkd',
  'mdwn',
  'mdtxt',
  'mdtext',
  'mdx',
  'text',
  'txt'
])

export const isMarkdownQuickOpenPath = (pathname: string): boolean => {
  try {
    const matcher = window.fileUtils?.hasMarkdownExtension
    if (typeof matcher === 'function') return matcher(pathname)
  } catch {
    // Fall back to the renderer's stable extension list in unit tests.
  }
  const extension = pathname.toLowerCase().split('.').pop()
  return !!extension && MARKDOWN_EXTENSIONS.has(extension)
}

const sameQuickOpenPath = (a: string, b: string): boolean => {
  try {
    const matcher = window.fileUtils?.isSamePathSync
    if (typeof matcher === 'function') return matcher(a, b)
  } catch {
    // Use a platform-neutral fallback when the preload bridge is unavailable.
  }
  return a.replaceAll('\\', '/').toLowerCase() === b.replaceAll('\\', '/').toLowerCase()
}

export const mergeQuickOpenPathGroups = (
  groups: ReadonlyArray<ReadonlyArray<string>>,
  limit: number
): string[] => {
  const merged: string[] = []
  for (const group of groups) {
    for (const pathname of group) {
      if (merged.some((candidate) => sameQuickOpenPath(candidate, pathname))) continue
      merged.push(pathname)
      if (merged.length >= limit) return merged
    }
  }
  return merged
}

interface FolderState {
  projectTree: { pathname: string } | null
}
type RootState = { editor: EditorState; project: FolderState; [key: string]: unknown }

type CancelFn = (() => void) | null

// The quick open command
class QuickOpenCommand {
  id: string
  description: string
  placeholder: string
  shortcut: string | null
  subcommands: QuickOpenSubcommand[]
  subcommandSelectedIndex: number
  private _editorState: EditorState
  private _folderState: FolderState
  private _directorySearcher: FileSearcher
  private _cancelFn: CancelFn
  private _querySearch: CancellableSearchPromise<string[]> | null
  private _indexSearch: CancellableSearchPromise<void> | null
  private _indexPromise: Promise<string[]> | null
  private _indexRootPath: string | null
  private _pathIndex: SearchPathIndex
  private _searchGeneration: number
  private _indexTaskCancellers: Array<() => void>

  constructor(rootState: RootState) {
    this.id = 'file.quick-open'
    this.description = getCommandDescriptionById('file.quick-open')
    this.placeholder = t('commandPalette.placeholders.searchFileToOpen')
    this.shortcut = null

    this.subcommands = []
    this.subcommandSelectedIndex = -1

    // Reference to folder and editor and project state.
    this._editorState = rootState.editor
    this._folderState = rootState.project

    this._directorySearcher = new FileSearcher()
    this._cancelFn = null
    this._querySearch = null
    this._indexSearch = null
    this._indexPromise = null
    this._indexRootPath = null
    this._pathIndex = new SearchPathIndex()
    this._searchGeneration = 0
    this._indexTaskCancellers = []

    bus.on('project-tree-changed', this._handleProjectTreeChanged)
  }

  search = async(query: string): Promise<QuickOpenSubcommand[]> => {
    this._cancelActiveQuery()
    const generation = ++this._searchGeneration

    // Show opened files when no query is given.
    if (!query.trim()) {
      const recentStore = this._getRecentStore()
      this.subcommands = this._toSubcommands(
        this._getOpenPaths(),
        recentStore?.items
          .filter((entry) => entry.kind === 'file' && isMarkdownQuickOpenPath(entry.pathname))
          .map((entry) => entry.pathname) ?? []
      )
      return this.subcommands
    }

    const timeout = delay(SEARCH_DEBOUNCE_MS)
    this._cancelFn = () => {
      timeout.cancel()
      this._querySearch?.cancel()
    }

    try {
      await timeout
      if (generation !== this._searchGeneration) throw new SearchAbortError()

      const result = await this._doSearch(query, generation)
      if (generation !== this._searchGeneration) throw new SearchAbortError()
      return result
    } catch (error) {
      // delay.cancel() rejects without a reason. Normalize it so the command
      // palette can silently discard superseded requests.
      if (generation !== this._searchGeneration || !error) {
        throw new SearchAbortError()
      }
      throw error
    } finally {
      if (generation === this._searchGeneration) {
        this._cancelFn = null
        this._querySearch = null
      }
    }
  }

  run = async(): Promise<void> => {
    const recentStore = this._getRecentStore()
    if (recentStore) await recentStore.HYDRATE()

    this.subcommands = this._toSubcommands(
      this._getOpenPaths(),
      recentStore?.items
        .filter((entry) => entry.kind === 'file' && isMarkdownQuickOpenPath(entry.pathname))
        .map((entry) => entry.pathname) ?? []
    )

    const rootPath = this._getRootPath()
    if (rootPath) {
      // Build the path index ahead of the first keystroke. The promise stays
      // cached across palette openings and does not run on the input event.
      void this._ensureIndex(rootPath).catch(() => {})
    }
  }

  execute = async(): Promise<void> => {
    // Timeout to hide the command palette and then show again to prevent issues.
    await delay(100)
    bus.emit('show-command-palette', this)
  }

  executeSubcommand = async(id: string): Promise<void> => {
    const { windowId } = window.inkiva!.env!
    window.electron.commands.openFileByWindowId(windowId, id)
  }

  unload = (): void => {
    this.subcommands = []
    this._searchGeneration++
    this._cancelActiveQuery()
  }

  private _cancelActiveQuery = (): void => {
    if (this._cancelFn) {
      this._cancelFn()
      this._cancelFn = null
    }
    if (this._querySearch) {
      this._querySearch.cancel()
      this._querySearch = null
    }
  }

  private _getRootPath = (): string | null => {
    const projectPath = this._folderState.projectTree?.pathname
    if (projectPath) return projectPath
    const currentPath = this._editorState.currentFile?.pathname
    return currentPath ? window.path.dirname(currentPath) : null
  }

  private _getRecentStore = (): ReturnType<typeof useRecentDocumentsStore> | null => {
    try {
      return useRecentDocumentsStore()
    } catch {
      return null
    }
  }

  private _getOpenPaths = (): string[] =>
    this._editorState.tabs
      .map((tab) => tab.pathname)
      .filter((pathname): pathname is string => !!pathname && isMarkdownQuickOpenPath(pathname))

  private _toSubcommands = (...groups: ReadonlyArray<string>[]): QuickOpenSubcommand[] =>
    mergeQuickOpenPathGroups(groups, QUICK_OPEN_RESULT_LIMIT).map((pathname) => {
      const item: QuickOpenSubcommand = { id: pathname }
      Object.assign(item, this._getPath(pathname))
      return item
    })

  private _handleProjectTreeChanged = (payload: unknown): void => {
    if (!payload || typeof payload !== 'object') return

    const { type, change } = payload as {
      type?: unknown
      change?: { pathname?: unknown }
    }
    const pathname = typeof change?.pathname === 'string' ? change.pathname : ''
    const rootPath = this._indexRootPath
    if (!rootPath || !pathname || !window.fileUtils.isChildOfDirectory(rootPath, pathname)) return

    // The directory watcher emits the initial tree as a burst of add events.
    // Cancelling the in-flight full index for every one of those events can
    // starve a large workspace: the query then observes whichever partial
    // index happened to win the cancellation race. Keep one scan in flight and
    // apply live changes to the same index instead.
    if (type === 'add') {
      this._pathIndex.add([pathname])
      return
    }

    if (type === 'unlink') {
      this._pathIndex.remove([pathname])
      return
    }

    if (type === 'unlinkDir') {
      const descendants = this._pathIndex.values().filter((candidate) =>
        window.fileUtils.isChildOfDirectory(pathname, candidate)
      )
      this._pathIndex.remove(descendants)
    }
  }

  private _invalidateIndex = (): void => {
    this._indexSearch?.cancel()
    for (const cancel of this._indexTaskCancellers) cancel()
    this._indexTaskCancellers = []
    this._indexSearch = null
    this._indexPromise = null
    this._indexRootPath = null
    this._pathIndex.clear()
  }

  private _ensureIndex = (rootPath: string): Promise<string[]> => {
    if (this._indexRootPath === rootPath && this._indexPromise) {
      return this._indexPromise
    }

    this._invalidateIndex()
    this._indexRootPath = rootPath
    const index = new SearchPathIndex()
    // Make the in-flight index visible to watcher updates immediately. The
    // final assignment below still protects against a root change race.
    this._pathIndex = index
    const indexWork: Promise<void>[] = []
    const search = this._directorySearcher.search([rootPath], '', {
      didMatch: (payload: unknown) => {
        const paths = Array.isArray(payload)
          ? payload.filter((pathname): pathname is string => typeof pathname === 'string')
          : typeof payload === 'string'
            ? [payload]
            : []
        if (this._indexRootPath !== rootPath) return
        const task = quickOpenBackgroundScheduler.enqueueAndWait({
          id: 'quick-open-index:' + rootPath + ':' + String(indexWork.length),
          priority: BACKGROUND_PRIORITY.backgroundIndexing,
          run: () => {
            index.add(paths)
          }
        })
        this._indexTaskCancellers.push(task.cancel)
        indexWork.push(task.promise.catch(() => {}))
      },
      inclusions: window.fileUtils.MARKDOWN_INCLUSIONS
    })
    this._indexSearch = search
    this._indexPromise = search
      .then(async() => {
        await Promise.all(indexWork)
        if (this._indexRootPath === rootPath) {
          this._pathIndex = index
        }
        return index.values()
      })
      .finally(() => {
        if (this._indexSearch === search) {
          this._indexSearch = null
          this._indexTaskCancellers = []
        }
      })
    return this._indexPromise
  }

  private _doSearch = async(
    query: string,
    generation: number
  ): Promise<QuickOpenSubcommand[]> => {
    const rootPath = this._getRootPath()
    const indexedPaths = rootPath ? await this._ensureIndex(rootPath) : []
    if (generation !== this._searchGeneration) throw new SearchAbortError()

    const recentStore = this._getRecentStore()
    if (recentStore) await recentStore.HYDRATE()
    const openPaths = this._getOpenPaths()
    const recentPaths =
      recentStore?.items
        .filter((entry) => entry.kind === 'file' && isMarkdownQuickOpenPath(entry.pathname))
        .map((entry) => entry.pathname) ?? []

    const openedResults = await this._searchPathGroup(openPaths, query, rootPath, generation)
    const recentResults = await this._searchPathGroup(
      recentPaths,
      query,
      rootPath,
      generation
    )
    const indexedResults = await this._searchPathGroup(
      indexedPaths.filter(isMarkdownQuickOpenPath),
      query,
      rootPath,
      generation
    )
    const result = mergeQuickOpenPathGroups(
      [openedResults, recentResults, indexedResults],
      QUICK_OPEN_RESULT_LIMIT
    )

    return this._toSubcommands(result)
  }

  private _searchPathGroup = async(
    paths: string[],
    query: string,
    rootPath: string | null,
    generation: number
  ): Promise<string[]> => {
    if (paths.length === 0) return []
    const candidates = new SearchPathIndex()
    candidates.add(paths)
    const searchPromise = fuzzySearchPaths(candidates.values(), query, {
      rootPath: rootPath ?? undefined,
      limit: QUICK_OPEN_RESULT_LIMIT,
      getSearchText: (pathname, currentRoot) => this._getSearchText(pathname, currentRoot)
    })
    this._querySearch = searchPromise
    const result = await searchPromise
    if (generation !== this._searchGeneration) throw new SearchAbortError()
    return result
  }

  private _getSearchText = (pathname: string, rootPath?: string): string => {
    if (!rootPath || !window.fileUtils.isChildOfDirectory(rootPath, pathname)) {
      return pathname
    }
    return window.path.relative(rootPath, pathname)
  }

  private _getPath = (pathname: string): { title?: string; description: string } => {
    const rootPath = this._getRootPath()
    if (!rootPath || !window.fileUtils.isChildOfDirectory(rootPath, pathname)) {
      return { title: pathname, description: pathname }
    }

    const p = window.path.relative(rootPath, pathname)
    const item: { title?: string; description: string } = { description: p }
    if (p.length > 50) {
      item.title = p
    }
    return item
  }
}

export default QuickOpenCommand
