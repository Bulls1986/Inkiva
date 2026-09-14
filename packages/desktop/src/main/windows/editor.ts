import path from 'path'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { BrowserWindowConstructorOptions, IpcMainEvent } from 'electron'
import log from 'electron-log'
import windowStateKeeper from 'electron-window-state'
import { isChildOfDirectory } from 'common/filesystem/paths'
import BaseWindow, { showWindowWhenRendererReady, WindowLifecycle, WindowType } from './base'
import type Accessor from '../app/accessor'
import { ensureWindowPosition, zoomIn, zoomOut } from './utils'
import { TITLE_BAR_HEIGHT, editorWinOptions, isLinux, isOsx } from '../config'
import { showEditorContextMenu } from '../contextMenu/editor'
import { loadMarkdownFile } from '../filesystem/markdown'
import { switchLanguage } from '../spellchecker'
import type { BufferStoreState } from '../editorBufferStore/restore'
import { mainPerformance } from '../performance/runtime'
import { canonicalPathKey } from '../session/pathCanonicalizer'
import type { RestorePlan } from '../session/restorePlan'

type RawMarkdownDocument = Awaited<ReturnType<typeof loadMarkdownFile>>

interface PendingFile {
  doc: RawMarkdownDocument
  options: Record<string, unknown>
  selected: boolean
}

interface BufferStoreInfo {
  id: string
  filePath: string | null
  restoreBufferStores?: Array<{ id: string; filePath: string }>
  restoredState?: BufferStoreState
}

interface CandidateScore {
  id: number | null
  score: number
}

interface RestoredTab {
  pathname: string
  filename?: string
  markdown?: string
  isSaved?: boolean
  [key: string]: unknown
}

interface RestoredBufferState extends Omit<BufferStoreState, 'tabs'> {
  tabs: RestoredTab[]
  restoreWarnings?: unknown[]
  project?: { rootDirectory?: string }
}

class EditorWindow extends BaseWindow {
  private _directoryToOpen: string | null
  private _filesToOpen: PendingFile[] | null
  private _markdownToOpen: string[] | null
  private _openedRootDirectory: string | null
  private _openedFiles: string[] | null
  private _openingFiles: Set<string>
  private _initialFilePaths: Set<string>
  private _initialRootDirectories: Set<string>
  private _contentDeferred: boolean
  private _deferredRestorePlan: RestorePlan | null
  private _deferredContentReady: Promise<void> | null
  private _deferredContentResolver: (() => void) | null

  public bufferStoreInfo: BufferStoreInfo | null

  constructor(accessor: Accessor) {
    super(accessor)
    this.type = WindowType.EDITOR
    this._directoryToOpen = null
    this._filesToOpen = []
    this._markdownToOpen = []
    this._openedRootDirectory = ''
    this._openedFiles = []
    this._openingFiles = new Set()
    this._initialFilePaths = new Set()
    this._initialRootDirectories = new Set()
    this._contentDeferred = false
    this._deferredRestorePlan = null
    this._deferredContentReady = null
    this._deferredContentResolver = null
    this.bufferStoreInfo = null
  }

  createWindow(
    rootDirectory: string | null = null,
    fileList: string[] = [],
    markdownList: string[] = [],
    options: Partial<BrowserWindowConstructorOptions> = {},
    bufferStoreInfo: BufferStoreInfo | null = null,
    deferInitialContent: boolean = false
  ): BrowserWindow {
    const { menu: appMenu, env, preferences, editorBufferStore } = this._accessor
    mainPerformance.mark('create_window_start', {
      phase: 'startup',
      metadata: { windowType: 'editor' }
    })
    const addBlankTab =
      !deferInitialContent &&
      !bufferStoreInfo &&
      !rootDirectory &&
      fileList.length === 0 &&
      markdownList.length === 0

    const mainWindowState = windowStateKeeper({ defaultWidth: 1200, defaultHeight: 800 })
    const { x, y, width, height } = ensureWindowPosition(mainWindowState)
    const winOptions: BrowserWindowConstructorOptions = Object.assign(
      { x, y, width, height },
      editorWinOptions,
      options
    )
    if (isLinux) {
      winOptions.icon = path.join(process.cwd(), 'static', 'logo-96px.png')
    }

    const {
      titleBarStyle,
      theme,
      sideBarVisibility,
      restoreLayoutState,
      tabBarVisibility,
      sourceCodeModeEnabled,
      spellcheckerEnabled,
      spellcheckerLanguage
    } = preferences.getAll()
    const resolvedSideBarVisibility = restoreLayoutState ? !!sideBarVisibility : false

    if (!isOsx) {
      winOptions.titleBarStyle = 'default'
      if (titleBarStyle === 'native') {
        winOptions.frame = true
      }
    }

    winOptions.backgroundColor = this._getPreferredBackgroundColor(theme)
    if (env.disableSpellcheck) {
      ;(winOptions.webPreferences as { spellcheck: boolean }).spellcheck = false
    }

    let win: BrowserWindow | null = (this.browserWindow = new BrowserWindow(winOptions))
    // BrowserWindow.webContents throws after the native window is destroyed.
    // Keep the already-created WebContents object for lifecycle cleanup.
    const rendererWebContents = win.webContents
    let rendererInitialized = false
    let editorInteractive = false

    // The bootstrap handshake only means the renderer can receive state. The
    // editor is interactive only after the first Muya document has mounted,
    // painted, and reported the document-editable milestone.
    const onRendererIpcMessage = (event: IpcMainEvent, channel: string): void => {
      if (event.sender !== rendererWebContents) return

      if (channel === 'mt::window-initialized') {
        rendererInitialized = true
        this.emit('window-renderer-ready')
      } else if (channel === 'mt::document-editable' && !editorInteractive) {
        editorInteractive = true
        this.emit('window-interactive')
      }
    }
    rendererWebContents.on('ipc-message', onRendererIpcMessage)

    this.bufferStoreInfo = {
      id: bufferStoreInfo ? bufferStoreInfo.id : editorBufferStore.getUnUsedBufferUUID(),
      filePath: bufferStoreInfo ? bufferStoreInfo.filePath : null,
      restoreBufferStores: bufferStoreInfo?.restoreBufferStores,
      restoredState: bufferStoreInfo?.restoredState
    }
    this._reserveInitialRestoreState(bufferStoreInfo?.restoredState)
    this._contentDeferred = deferInitialContent
    this._deferredRestorePlan = null
    this._deferredContentReady = deferInitialContent
      ? new Promise<void>((resolve) => {
        this._deferredContentResolver = resolve
      })
      : null
    if (!deferInitialContent) this._deferredContentResolver = null
    ;(win as unknown as { restoreBufferId: string }).restoreBufferId = this.bufferStoreInfo.id
    this.id = win.id
    const performanceOperationId = `window-${win.id}`
    mainPerformance.mark('browser_window_created', {
      phase: 'startup',
      operationId: performanceOperationId,
      metadata: { windowType: 'editor' }
    })
    showWindowWhenRendererReady(win, () => this.emit('window-shell-visible'))

    // Attach load lifecycle handlers before starting navigation, then start the
    // renderer immediately. The lightweight HTML shell can now paint while the
    // rest of the main-process menu/spellcheck/listener setup continues.
    win.webContents.once('did-finish-load', () => {
      this.lifecycle = WindowLifecycle.READY
      this.emit('window-ready')
      this.bringToFront()

      const lineEnding = preferences.getPreferredEol()
      appMenu.updateLineEndingMenu(this.id!, lineEnding)

      win!.webContents.send('mt::bootstrap-editor', {
        addBlankTab,
        markdownList: this.bufferStoreInfo!.filePath ? [] : this._markdownToOpen,
        lineEnding,
        sideBarVisibility: resolvedSideBarVisibility,
        tabBarVisibility,
        sourceCodeModeEnabled
      })

      if (this._contentDeferred) {
        this._applyDeferredRestorePlan()
      } else if (this.bufferStoreInfo!.filePath) {
        void this._restoreAllState()
      } else {
        this._doOpenFilesToOpen()
        this._markdownToOpen!.length = 0
      }

      win!.webContents.on('zoom-changed', (_event, zoomDirection) => {
        if (zoomDirection === 'in') {
          zoomIn(win!)
        } else if (zoomDirection === 'out') {
          zoomOut(win!)
        }
      })
    })

    win.webContents.once('did-fail-load', (_event, errorCode, errorDescription, url) => {
      log.error(
        `The window failed to load or was cancelled: ${errorCode}; ${errorDescription}; @ ${url}`
      )
    })

    this.lifecycle = WindowLifecycle.LOADING
    mainPerformance.mark('load_url_start', {
      phase: 'startup',
      operationId: performanceOperationId,
      metadata: { windowType: 'editor' }
    })
    void win.loadURL(this._buildUrlString(this.id, env, preferences))

    if (spellcheckerEnabled && !isOsx) {
      try {
        switchLanguage(win, spellcheckerLanguage as string)
      } catch (error) {
        log.error('Unable to set spell checker language on startup:', error)
      }
    }

    appMenu.addEditorMenu(win, { sourceCodeModeEnabled: sourceCodeModeEnabled as boolean })

    win.webContents.on('context-menu', (event, params) => {
      showEditorContextMenu(win!, event, params, preferences.getItem('spellcheckerEnabled'))
    })

    win.webContents.once('render-process-gone', async(_event, { reason }) => {
      // A dead renderer cannot answer the close-confirmation IPC request.
      // Mark it uninitialized so app.quit() can still tear down the native
      // window instead of waiting forever for a response that cannot arrive.
      rendererInitialized = false
      if (reason === 'clean-exit') return

      const msg = `The renderer process has crashed unexpected or is killed (${reason}).`
      log.error(msg)
      if (reason === 'abnormal-exit') return

      const { response } = await dialog.showMessageBox(win!, {
        type: 'warning',
        buttons: ['Close', 'Reload', 'Keep It Open'],
        message: 'Inkiva has crashed',
        detail: msg
      })

      if (win!.id) {
        switch (response) {
          case 0:
            return this.destroy()
          case 1:
            return this.reload()
        }
      }
    })

    win.on('focus', () => {
      this.emit('window-focus')
      win!.webContents.send('mt::window-active-status', { status: true })
    })

    win.on('blur', () => {
      this.emit('window-blur')
      win!.webContents.send('mt::window-active-status', { status: false })
    })
    ;(['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen'] as const).forEach(
      (channel) => {
        ;(win! as { on(event: string, listener: () => void): void }).on(channel, () => {
          win!.webContents.send(`mt::window-${channel}`)
        })
      }
    )

    win.on('close', (event) => {
      this.emit('window-close')
      if (this._accessor.shutdownCoordinator?.isUpdateInstallApproved() || !rendererInitialized) {
        return
      }
      event.preventDefault()
      win!.webContents.send('mt::ask-for-close')
    })

    win.on('closed', () => {
      rendererWebContents.removeListener('ipc-message', onRendererIpcMessage)
      this.lifecycle = WindowLifecycle.QUITTED
      this._contentDeferred = false
      this._deferredRestorePlan = null
      this._initialFilePaths.clear()
      this._initialRootDirectories.clear()
      this._resolveDeferredContent()
      this.emit('window-closed')
      win = null
    })

    win.setSheetOffset(TITLE_BAR_HEIGHT)
    mainWindowState.manage(win)
    win.webContents.setIgnoreMenuShortcuts(true)

    setTimeout(() => {
      if (rootDirectory) this._openInitialFolder(rootDirectory)
      if (fileList.length) this._openInitialTabsFromPaths(fileList)
    }, 0)
    if (rootDirectory) {
      this._initialRootDirectories.add(this._getOpeningPathKey(rootDirectory))
    }
    for (const filePath of fileList) {
      this._initialFilePaths.add(this._getOpeningPathKey(filePath))
    }

    return win
  }

  openTab(filePath: string, options: Record<string, unknown> = {}, selected: boolean = true): void {
    if (this.lifecycle === WindowLifecycle.QUITTED) return
    this.openTabs([{ filePath, options, selected }])
  }

  openTabsFromPaths(filePaths: string[]): void {
    this._openTabsFromPaths(filePaths)
  }

  private _openInitialTabsFromPaths(filePaths: string[]): void {
    this._openTabsFromPaths(filePaths, true)
  }

  private _openTabsFromPaths(filePaths: string[], allowInitialPaths: boolean = false): void {
    if (!filePaths || filePaths.length === 0) return
    const fileList = filePaths.map((p) => ({ filePath: p, options: {}, selected: false }))
    fileList[0].selected = true
    this.openTabs(fileList, allowInitialPaths)
  }

  openTabs(
    fileList: { filePath: string; selected: boolean; options: Record<string, unknown> }[],
    allowInitialPaths: boolean = false
  ): void {
    if (this.lifecycle === WindowLifecycle.QUITTED) return

    const { browserWindow } = this
    const { preferences } = this._accessor
    const eol = preferences.getPreferredEol()
    const { autoGuessEncoding, trimTrailingNewline, autoNormalizeLineEndings } =
      preferences.getAll()

    for (const { filePath, options, selected } of fileList) {
      const openingKey = this._getOpeningPathKey(filePath)
      if (allowInitialPaths) this._initialFilePaths.delete(openingKey)
      const openedPath = this._openedFiles!.find(
        (pathname) => this._getOpeningPathKey(pathname) === openingKey
      )
      if (openedPath) {
        browserWindow!.webContents.send('mt::switch-tab-by-file_path', openedPath)
        continue
      }

      // Initial paths are reservations used by App/WindowManager to make a
      // just-created window visible to duplicate open requests. Only the
      // scheduled initial open may consume the reservation; an external
      // request must wait for that operation instead of starting a second
      // load that would produce a duplicate tab.
      if ((!allowInitialPaths && this._initialFilePaths.has(openingKey)) ||
        this._openingFiles.has(openingKey)) {
        continue
      }
      this._openingFiles.add(openingKey)

      loadMarkdownFile(
        filePath,
        eol,
        autoGuessEncoding,
        trimTrailingNewline,
        autoNormalizeLineEndings
      )
        .then((rawDocument) => {
          if (this.lifecycle === WindowLifecycle.READY) {
            this._doOpenTab(rawDocument, options, selected)
          } else if (this._filesToOpen) {
            this._filesToOpen!.push({ doc: rawDocument, options, selected })
          } else {
            this._openingFiles.delete(openingKey)
          }
        })
        .catch((err: Error) => {
          this._openingFiles.delete(openingKey)
          const { message, stack } = err
          log.error(`[ERROR] Cannot open file or directory: ${message}\n\n${stack}`)
          browserWindow!.webContents.send('mt::show-notification', {
            title: 'Cannot open tab',
            type: 'error',
            message: err.message
          })
        })
    }
  }

  openUntitledTab(selected: boolean = true, markdown: string = ''): void {
    if (this.lifecycle === WindowLifecycle.QUITTED) return

    if (this.lifecycle === WindowLifecycle.READY) {
      this.browserWindow!.webContents.send('mt::new-untitled-tab', selected, markdown)
    } else {
      this._markdownToOpen!.push(markdown)
    }
  }

  openFolder(pathname: string): void {
    const pathKey = this._getOpeningPathKey(pathname)
    if (
      !pathname ||
      this.lifecycle === WindowLifecycle.QUITTED ||
      pathKey === this._getOpeningPathKey(this._openedRootDirectory ?? '') ||
      this._initialRootDirectories.has(pathKey)
    ) {
      return
    }

    if (this.lifecycle === WindowLifecycle.READY) {
      const { browserWindow } = this
      const { menu: appMenu, preferences } = this._accessor

      if (this._openedRootDirectory) {
        ipcMain.emit('watcher-unwatch-directory', browserWindow, this._openedRootDirectory)
      }

      preferences.setItems({ lastOpenedFolder: pathname })
      appMenu.addRecentlyUsedDocument(pathname)
      this._openedRootDirectory = pathname
      ipcMain.emit('watcher-watch-directory', browserWindow, pathname)
      browserWindow!.webContents.send('mt::open-directory', pathname)
    } else {
      this._directoryToOpen = pathname
    }
  }

  addToOpenedFiles(filePath: string): void {
    const { _openedFiles, browserWindow } = this
    if (this.hasPath(filePath)) return
    _openedFiles!.push(filePath)
    ipcMain.emit('watcher-watch-file', browserWindow, filePath)
  }

  changeOpenedFilePath(pathname: string, oldPathname: string): void {
    const { _openedFiles, browserWindow } = this
    const oldPathKey = this._getOpeningPathKey(oldPathname)
    const index = _openedFiles!.findIndex((p) => this._getOpeningPathKey(p) === oldPathKey)
    if (index === -1) {
      _openedFiles!.push(pathname)
    } else {
      _openedFiles![index] = pathname
    }
    ipcMain.emit('watcher-unwatch-file', browserWindow, oldPathname)
    ipcMain.emit('watcher-watch-file', browserWindow, pathname)
  }

  removeFromOpenedFiles(pathname: string): void {
    const { _openedFiles, browserWindow } = this
    const pathKey = this._getOpeningPathKey(pathname)
    const index = _openedFiles!.findIndex((p) => this._getOpeningPathKey(p) === pathKey)
    if (index !== -1) _openedFiles!.splice(index, 1)
    ipcMain.emit('watcher-unwatch-file', browserWindow, pathname)
  }

  getCandidateScores(fileList: string[]): CandidateScore[] {
    const { _openedFiles, _openedRootDirectory, id } = this
    const buf: CandidateScore[] = []
    for (const pathname of fileList) {
      let score = 0
      if (this.hasPath(pathname)) {
        score = -1
      } else {
        if (isChildOfDirectory(_openedRootDirectory ?? '', pathname)) score += 5
        for (const item of _openedFiles!) {
          if (isChildOfDirectory(path.dirname(item), pathname)) score += 1
        }
      }
      buf.push({ id, score })
    }
    return buf
  }

  override reload(): void {
    const { id, browserWindow } = this
    ipcMain.emit('watcher-unwatch-all-by-id', id)
    this._directoryToOpen = ''
    this._filesToOpen = []
    this._markdownToOpen = []
    this._openedRootDirectory = ''
    this._openedFiles = []
    this._openingFiles.clear()
    this._initialFilePaths.clear()
    this._initialRootDirectories.clear()
    this._contentDeferred = false
    this._deferredRestorePlan = null
    this._resolveDeferredContent()

    browserWindow!.webContents.once('did-finish-load', () => {
      this.lifecycle = WindowLifecycle.READY
      const { preferences } = this._accessor
      const { sideBarVisibility, restoreLayoutState, tabBarVisibility, sourceCodeModeEnabled } =
        preferences.getAll()
      const resolvedSideBarVisibility = restoreLayoutState ? !!sideBarVisibility : false
      const lineEnding = preferences.getPreferredEol()
      browserWindow!.webContents.send('mt::bootstrap-editor', {
        addBlankTab: true,
        markdownList: [],
        lineEnding,
        sideBarVisibility: resolvedSideBarVisibility,
        tabBarVisibility,
        sourceCodeModeEnabled
      })
    })
    this.lifecycle = WindowLifecycle.LOADING
    super.reload()
  }

  override destroy(): void {
    super.destroy()
    this._directoryToOpen = null
    this._filesToOpen = null
    this._markdownToOpen = null
    this._openedRootDirectory = null
    this._openedFiles = null
    this._openingFiles.clear()
    this._initialFilePaths.clear()
    this._initialRootDirectories.clear()
    this._contentDeferred = false
    this._deferredRestorePlan = null
    this._resolveDeferredContent()
  }

  get openedRootDirectory(): string | null {
    return this._openedRootDirectory
  }

  hasPath(filePath: string): boolean {
    const key = this._getOpeningPathKey(filePath)
    return (
      this._openedFiles?.some((pathname) => this._getOpeningPathKey(pathname) === key) ||
      this._openingFiles.has(key) ||
      this._initialFilePaths.has(key)
    )
  }

  hasRootDirectory(pathname: string): boolean {
    const key = this._getOpeningPathKey(pathname)
    return !!key && (
      (this._openedRootDirectory != null &&
        this._getOpeningPathKey(this._openedRootDirectory) === key) ||
      (this._directoryToOpen != null && this._getOpeningPathKey(this._directoryToOpen) === key) ||
      this._initialRootDirectories.has(key)
    )
  }

  waitUntilReady(): Promise<void> {
    if (this.lifecycle === WindowLifecycle.READY) return Promise.resolve()
    if (this.lifecycle === WindowLifecycle.QUITTED) return Promise.resolve()

    return new Promise<void>((resolve) => {
      const onReady = (): void => {
        this.removeListener('window-closed', onClosed)
        resolve()
      }
      const onClosed = (): void => {
        this.removeListener('window-ready', onReady)
        resolve()
      }

      this.once('window-ready', onReady)
      this.once('window-closed', onClosed)
    })
  }

  applyRestorePlan(plan: RestorePlan): Promise<void> {
    if (!this._contentDeferred) return Promise.resolve()

    this._deferredRestorePlan = plan
    if (plan.kind === 'restore' && plan.state && plan.primarySource) {
      this.bufferStoreInfo = {
        id: plan.primarySource.id,
        filePath: plan.primarySource.filePath,
        restoreBufferStores: plan.sources,
        restoredState: plan.state
      }
      this._reserveInitialRestoreState(plan.state)
      if (this.browserWindow) {
        ;(this.browserWindow as unknown as { restoreBufferId: string }).restoreBufferId =
          plan.primarySource.id
      }
    }

    this._applyDeferredRestorePlan()
    return this._deferredContentReady ?? Promise.resolve()
  }

  private _openInitialFolder(pathname: string): void {
    this._initialRootDirectories.delete(this._getOpeningPathKey(pathname))
    this.openFolder(pathname)
  }

  private _applyDeferredRestorePlan(): void {
    if (!this._contentDeferred || this.lifecycle !== WindowLifecycle.READY) return
    const plan = this._deferredRestorePlan
    if (!plan) return

    this._deferredRestorePlan = null
    this._contentDeferred = false
    if (plan.kind === 'restore' && plan.state && plan.primarySource) {
      void this._restoreAllState().then(
        () => this._resolveDeferredContent(),
        (error: unknown) => {
          log.error('Failed to apply deferred restore plan:', error)
          this._resolveDeferredContent()
        }
      )
      return
    }

    try {
      this.browserWindow?.webContents.send('mt::new-untitled-tab', true, '')
    } finally {
      this._resolveDeferredContent()
    }
  }

  private _resolveDeferredContent(): void {
    const resolve = this._deferredContentResolver
    this._deferredContentResolver = null
    resolve?.()
  }

  private _reserveInitialRestoreState(state: BufferStoreState | undefined): void {
    if (!state) return

    for (const tab of state.tabs) {
      if (typeof tab.pathname === 'string' && tab.pathname) {
        this._initialFilePaths.add(this._getOpeningPathKey(tab.pathname))
      }
    }

    const project = state.project
    if (!project || typeof project !== 'object' || Array.isArray(project)) return
    const rootDirectory = (project as { rootDirectory?: unknown }).rootDirectory
    if (typeof rootDirectory === 'string' && rootDirectory) {
      this._initialRootDirectories.add(this._getOpeningPathKey(rootDirectory))
    }
  }

  private _doOpenTab(
    rawDocument: RawMarkdownDocument,
    options: Record<string, unknown>,
    selected: boolean
  ): void {
    const { _accessor, _openedFiles, browserWindow } = this
    const { menu: appMenu } = _accessor
    const { pathname } = rawDocument
    this._openingFiles.delete(this._getOpeningPathKey(pathname))
    ipcMain.emit('watcher-watch-file', browserWindow, pathname)
    appMenu.addRecentlyUsedDocument(pathname)
    if (
      !this._openedFiles!.some(
        (openedPath) => this._getOpeningPathKey(openedPath) === this._getOpeningPathKey(pathname)
      )
    ) {
      _openedFiles!.push(pathname)
    }
    browserWindow!.webContents.send('mt::open-new-tab', rawDocument, options, selected)
  }

  private _getOpeningPathKey(filePath: string): string {
    return canonicalPathKey(filePath) ?? path.normalize(filePath)
  }

  private _doOpenFilesToOpen(): void {
    if (this.lifecycle !== WindowLifecycle.READY) throw new Error('Invalid state.')

    if (this._directoryToOpen) this.openFolder(this._directoryToOpen)
    this._directoryToOpen = null

    for (const { doc, options, selected } of this._filesToOpen!) {
      this._doOpenTab(doc, options, selected)
    }
    this._filesToOpen!.length = 0
  }

  private async _restoreAllState(): Promise<void> {
    if (this.lifecycle !== WindowLifecycle.READY) throw new Error('Invalid state.')

    const { browserWindow, bufferStoreInfo, _accessor } = this
    const { menu: appMenu, preferences, editorBufferStore } = _accessor

    try {
      const restoreBufferStores = bufferStoreInfo!.restoreBufferStores ?? [
        { id: bufferStoreInfo!.id, filePath: bufferStoreInfo!.filePath! }
      ]
      let bufferState: RestoredBufferState
      if (bufferStoreInfo!.restoredState) {
        bufferState = bufferStoreInfo!.restoredState as RestoredBufferState
      } else {
        const {
          state: restoredState,
          primaryFilePath,
          sourceFilePaths
        } = await editorBufferStore.readAndMergeBufferStoreFilesAsync(restoreBufferStores)
        // Consolidate before loading files. The renderer has no tabs yet, so a
        // slow disk read cannot race with a user edit and overwrite a newer
        // recovery snapshot.
        await editorBufferStore.consolidateBufferStoreFiles(
          primaryFilePath,
          sourceFilePaths,
          restoredState
        )
        bufferState = restoredState as RestoredBufferState
      }
      if (!Array.isArray(bufferState.restoreWarnings)) bufferState.restoreWarnings = []

      const rootDirectory = bufferState.project?.rootDirectory
      if (rootDirectory) this._openInitialFolder(rootDirectory)

      const eol = preferences.getPreferredEol()
      const { autoGuessEncoding, trimTrailingNewline, autoNormalizeLineEndings } =
        preferences.getAll()

      const fileOpenRequests: Promise<void>[] = []
      for (const tab of bufferState.tabs) {
        if (!tab.pathname) continue
        const openingKey = this._getOpeningPathKey(tab.pathname)

        fileOpenRequests.push(
          loadMarkdownFile(
            tab.pathname,
            eol,
            autoGuessEncoding,
            trimTrailingNewline,
            autoNormalizeLineEndings
          )
            .then((rawDocument) => {
              if (rawDocument.markdown !== tab.markdown && tab.isSaved) {
                tab.markdown = rawDocument.markdown
              }

              this._initialFilePaths.delete(openingKey)
              if (!this.hasPath(tab.pathname)) {
                this.addToOpenedFiles(tab.pathname)
                appMenu.addRecentlyUsedDocument(tab.pathname)
              }
            })
            .catch((err: Error) => {
              this._initialFilePaths.delete(openingKey)
              const { message, stack } = err
              tab.isSaved = false
              log.error(`[ERROR] Cannot open file: ${message}\n\n${stack}`)
              browserWindow!.webContents.send('mt::show-notification', {
                title: `Could not find file ${tab.filename} on disk, please save your work.`,
                type: 'error',
                message: err.message
              })
            })
        )
      }

      await Promise.all(fileOpenRequests)
      browserWindow!.webContents.send('mt::load-state', bufferState)
      if (bufferState.tabs.length === 0) {
        // A corrupt or empty recovery file should leave the editor usable,
        // even though there is no recoverable tab to restore.
        browserWindow!.webContents.send('mt::new-untitled-tab', true, '')
      }
    } catch (err) {
      log.error('Failed to restore editor state:', err)
      const message = err instanceof Error ? err.message : String(err)
      browserWindow!.webContents.send('mt::show-notification', {
        title: 'Failed to restore buffered state',
        type: 'error',
        message
      })
    }
  }
}

export default EditorWindow
