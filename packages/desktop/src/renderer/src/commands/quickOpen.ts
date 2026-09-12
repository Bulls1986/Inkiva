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
import getCommandDescriptionById from './descriptions'
import { t } from '../i18n'

const SEARCH_DEBOUNCE_MS = 220
const QUICK_OPEN_RESULT_LIMIT = 100

interface QuickOpenSubcommand {
  id: string
  description?: string
  title?: string
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

    bus.on('project-tree-changed', this._handleProjectTreeChanged)
  }

  search = async(query: string): Promise<QuickOpenSubcommand[]> => {
    this._cancelActiveQuery()
    const generation = ++this._searchGeneration

    // Show opened files when no query is given.
    if (!query.trim()) {
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
    const { _editorState, _folderState } = this
    if (!_folderState.projectTree && _editorState.tabs.length === 0) {
      throw new Error(null as unknown as string)
    }

    this.subcommands = _editorState.tabs
      .map((tab) => tab.pathname)
      // Filter untitled tabs
      .filter((tabPath: string | null | undefined) => !!tabPath)
      .map((pathname: string) => {
        const item: QuickOpenSubcommand = { id: pathname }
        Object.assign(item, this._getPath(pathname))
        return item
      })

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
    window.electron.ipcRenderer.send('mt::open-file-by-window-id', windowId, id)
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
    return this._folderState.projectTree?.pathname ?? null
  }

  private _handleProjectTreeChanged = (payload: unknown): void => {
    const type =
      payload && typeof payload === 'object' && 'type' in payload
        ? String((payload as { type?: unknown }).type)
        : ''
    if (type === 'add' || type === 'unlink' || type === 'addDir' || type === 'unlinkDir') {
      this._invalidateIndex()
    }
  }

  private _invalidateIndex = (): void => {
    this._indexSearch?.cancel()
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
    const search = this._directorySearcher.search([rootPath], '', {
      didMatch: (payload: unknown) => {
        const paths = Array.isArray(payload)
          ? payload.filter((pathname): pathname is string => typeof pathname === 'string')
          : typeof payload === 'string'
            ? [payload]
            : []
        index.add(paths)
      },
      inclusions: window.fileUtils.MARKDOWN_INCLUSIONS
    })
    this._indexSearch = search
    this._indexPromise = search
      .then(() => {
        if (this._indexRootPath === rootPath) {
          this._pathIndex = index
        }
        return index.values()
      })
      .finally(() => {
        if (this._indexSearch === search) this._indexSearch = null
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

    const candidates = new SearchPathIndex()
    candidates.add(indexedPaths)
    candidates.add(
      this._editorState.tabs
        .map((tab) => tab.pathname)
        .filter((pathname): pathname is string => !!pathname)
    )

    const searchPromise = fuzzySearchPaths(candidates.values(), query, {
      rootPath: rootPath ?? undefined,
      limit: QUICK_OPEN_RESULT_LIMIT,
      getSearchText: (pathname, currentRoot) => this._getSearchText(pathname, currentRoot)
    })
    this._querySearch = searchPromise
    const searchResult = await searchPromise
    if (generation !== this._searchGeneration) throw new SearchAbortError()

    return searchResult.map((pathname) => {
      const item: QuickOpenSubcommand = { id: pathname }
      Object.assign(item, this._getPath(pathname))
      return item
    })
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
