import path from 'path'
import fsPromises from 'fs/promises'
import { exec } from 'child_process'
import dayjs from 'dayjs'
import log from 'electron-log'
import { app, BrowserWindow, clipboard, dialog, nativeTheme, shell, ipcMain } from 'electron'
import type { BrowserWindowConstructorOptions } from 'electron'
import { isChildOfDirectory } from 'common/filesystem/paths'
import type { IUserPreferences } from '@shared/types/preferences'
import type { KeybindingPreferences } from '@shared/types/ipc'
import { isLinux, isOsx, isWindows } from '../config'
import parseArgs from '../cli/parser'
import { normalizeAndResolvePath } from '../filesystem'
import { normalizeMarkdownPath } from '../filesystem/markdown'
import { registerKeyboardListeners } from '../keyboard'
import { normalizeShortcutStyle } from '../keyboard/shortcutStyles'
import { selectTheme } from '../menu/actions/theme'
import { dockMenu } from '../menu/templates'
import registerSpellcheckerListeners from '../spellchecker'
import { watchers } from '../utils/imagePathAutoComplement'
import { onInternalChannel } from '../utils/internalIpc'
import { WindowType } from '../windows/base'
import EditorWindow from '../windows/editor'
import SettingWindow from '../windows/setting'
import { setLanguage, t } from '../i18n'
import { saveUnsavedFilesForUpdate } from '../menu/actions/file'
import { ShutdownCoordinator } from '../update/ShutdownCoordinator'
import { RendererUpdatePreflight } from '../update/RendererUpdatePreflight'
import { MacReleaseChecker } from '../update/MacReleaseChecker'
import { E2EUpdateProvider, isE2EUpdateScenario } from '../update/E2EUpdateProvider'
import { UpdateManager } from '../update/UpdateManager'
import { WindowsUpdateProvider } from '../update/WindowsUpdateProvider'
import { ElectronUpdateCheckStore } from '../update/store'
import type { UpdateStatus } from '../update/types'
import { getNativeThemeSource, isDarkApplicationTheme } from './nativeTheme'
import type Accessor from './accessor'
import type WindowManager from './windowManager'

interface CliArgs {
  _: string[]
  [flag: string]: unknown
}

interface PathInfo {
  isDir: boolean
  path: string
}

const DEFAULT_LANGUAGE = 'zh-CN'

class App {
  private _accessor: Accessor
  private _args: CliArgs
  private _openFilesCache: PathInfo[]
  private _openFilesTimer: ReturnType<typeof setTimeout> | null
  private _windowManager: WindowManager
  private _themeListenerRegistered: boolean
  private _updateManager: UpdateManager
  private _updatePreflight: RendererUpdatePreflight
  private _updatePromptOpen: boolean
  private _backgroundUpdateCheckScheduled: boolean

  /**
   * @param accessor The application accessor for application instances.
   * @param args Parsed application arguments.
   */
  constructor(accessor: Accessor, args: Partial<CliArgs>) {
    this._accessor = accessor
    this._args = (args as CliArgs) || ({ _: [] } as CliArgs)
    this._openFilesCache = []
    this._openFilesTimer = null
    this._windowManager = this._accessor.windowManager
    this._updatePreflight = new RendererUpdatePreflight()
    this._updatePromptOpen = false
    this._backgroundUpdateCheckScheduled = false
    this._accessor.shutdownCoordinator = new ShutdownCoordinator({
      getEditorWindows: () =>
        this._windowManager.getWindowsByType(WindowType.EDITOR).map(({ id }) => ({ id })),
      getActiveEditorId: () => this._windowManager.getActiveEditorId(),
      requestUnsavedFiles: ({ id }) => {
        const win = this._windowManager.getBrowserWindow(id)
        if (!win) return Promise.reject(new Error(`Editor window ${id} is unavailable`))
        return this._updatePreflight.request(win)
      },
      saveDirtyFiles: async({ id }, files) => {
        const win = this._windowManager.getBrowserWindow(id)
        if (!win) return false

        const { response } = await dialog.showMessageBox(win, {
          type: 'warning',
          buttons: [t('update.later'), t('update.saveAndRestart')],
          defaultId: 1,
          cancelId: 0,
          noLink: true,
          message: t('update.saveRequired'),
          detail: files.map(({ filename }) => filename).join('\n')
        })
        if (response !== 1) return false
        return saveUnsavedFilesForUpdate(win, files)
      }
    })
    const e2eUpdatePlatform = process.env.INKIVA_E2E_UPDATE_PLATFORM
    const updatePlatform = e2eUpdatePlatform === 'win32' || e2eUpdatePlatform === 'darwin'
      ? e2eUpdatePlatform
      : process.platform
    this._updateManager = new UpdateManager({
      platform: updatePlatform,
      currentVersion: process.env.INKIVA_E2E_UPDATE_CURRENT_VERSION ?? app.getVersion(),
      provider: this._createUpdateProvider(),
      store: new ElectronUpdateCheckStore(),
      prepareRestart: () => this._accessor.shutdownCoordinator!.prepareUpdateInstall(),
      onStatusChanged: (status) => this._handleUpdateStatusChanged(status)
    })
    // this.launchScreenshotWin = null // The window which call the screenshot.
    // this.shortcutCapture = null

    // Initialize main process language
    this._initializeLanguage()
    this._listenForIpcMain()
    // Initialize theme listener
    this._themeListenerRegistered = false
  }

  /**
   * The entry point into the application.
   */
  init(): void {
    // Enable these features to use `backdrop-filter` css rules!
    if (isOsx) {
      app.commandLine.appendSwitch('enable-experimental-web-platform-features', 'true')
    }

    app.on('second-instance', (_event, argv, workingDirectory) => {
      const { _openFilesCache, _windowManager } = this
      const args = parseArgs(argv.slice(1)) as CliArgs

      const buf: PathInfo[] = []
      for (const pathname of args._) {
        // Ignore all unknown flags
        if (pathname.startsWith('--')) {
          continue
        }

        const info = normalizeMarkdownPath(path.resolve(workingDirectory, pathname))
        if (info) {
          buf.push(info as PathInfo)
        }
      }

      if (args['--new-window']) {
        this._openPathList(buf, true)
        return
      }

      _openFilesCache.push(...buf)
      if (_openFilesCache.length) {
        this._openFilesToOpen()
      } else {
        const activeWindow = _windowManager.getActiveWindow()
        if (activeWindow) {
          activeWindow.bringToFront()
        }
      }
    })

    app.on('open-file', this.openFile) // macOS only

    app.on('ready', this.ready)

    app.on('window-all-closed', () => {
      // Close all the image path watcher
      for (const watcher of watchers.values()) {
        watcher.close()
      }
      this._windowManager.closeWatcher()
      if (!isOsx) {
        app.quit()
      }
    })

    app.on('activate', () => {
      // macOS only
      // On OS X it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (this._windowManager.windowCount === 0) {
        this.ready()
      }
    })

    // Prevent to load webview and opening links or new windows via HTML/JS.
    app.on('web-contents-created', (_event, contents) => {
      contents.on('will-attach-webview', (event) => {
        event.preventDefault()
      })
      contents.on('will-navigate', (event) => {
        event.preventDefault()
      })
      contents.setWindowOpenHandler(() => {
        return { action: 'deny' }
      })
    })
  }

  /**
   * Initialize main process language from preferences
   */
  private async _initializeLanguage(): Promise<void> {
    try {
      let currentLanguage = this._accessor.preferences.getItem<string>('language')

      // Keep the private build's first-run language deterministic. Existing
      // user preferences are still respected because this fallback is only
      // used when the preference is missing or empty.
      if (!currentLanguage) {
        currentLanguage = DEFAULT_LANGUAGE
        this._accessor.preferences.setItem('language', currentLanguage)
        log.info(`No language preference found; using default: ${currentLanguage}`)
      }

      setLanguage(currentLanguage)
      log.info(`Main process language initialized to: ${currentLanguage}`)
    } catch (error) {
      log.error('Failed to initialize main process language:', error)
      setLanguage(DEFAULT_LANGUAGE)
    }
  }

  async getScreenshotFileName(): Promise<string> {
    const screenshotFolderPath = (await this._accessor.dataCenter.getItem(
      'screenshotFolderPath'
    )) as string
    const fileName = `${dayjs().format('YYYY-MM-DD-HH-mm-ss')}-screenshot.png`
    return path.join(screenshotFolderPath, fileName)
  }

  ready = (): void => {
    const { _args: args, _openFilesCache } = this
    const { preferences, editorBufferStore } = this._accessor

    // Initialize language settings
    const { startUpAction, defaultDirectoryToOpen, theme, language } = preferences.getAll()
    const followSystemTheme = preferences.getItem<boolean>('followSystemTheme')
    const lastOpenedFolder = preferences.getItem<string>('lastOpenedFolder')
    const lightModeTheme = preferences.getItem<string>('lightModeTheme')
    const darkModeTheme = preferences.getItem<string>('darkModeTheme')

    if (language) {
      setLanguage(language)
    }

    if (args._.length) {
      for (const pathname of args._) {
        // Ignore all unknown flags
        if (pathname.startsWith('--')) {
          continue
        }

        const info = normalizeMarkdownPath(pathname)
        if (info) {
          _openFilesCache.push(info as PathInfo)
        }
      }
    }

    // We should NOT restore the previous buffer or open a folder if the user just wants to double click to open a file
    let isRestorePathway = false
    if (_openFilesCache.length === 0) {
      if (startUpAction === 'restoreAll') {
        // Restore based off the previous buffer
        isRestorePathway = true
      } else if (startUpAction === 'folder' && defaultDirectoryToOpen) {
        const info = normalizeMarkdownPath(defaultDirectoryToOpen)
        if (info) {
          _openFilesCache.unshift(info as PathInfo)
        }
      } else if (startUpAction === 'openLastFolder' && lastOpenedFolder) {
        const info = normalizeMarkdownPath(lastOpenedFolder)
        if (info) {
          _openFilesCache.unshift(info as PathInfo)
        }
      }
    }

    nativeTheme.themeSource = getNativeThemeSource({ followSystemTheme, theme })

    // Apply theme at startup if "Follow system theme" is enabled
    const isDarkTheme = isDarkApplicationTheme(theme)
    const systemIsDark = nativeTheme.shouldUseDarkColors

    if (followSystemTheme && isDarkTheme !== systemIsDark) {
      const newTheme = systemIsDark ? darkModeTheme : lightModeTheme
      log.info(
        `Following system theme at startup: ${newTheme} (system ${systemIsDark ? 'dark' : 'light'})`
      )
      selectTheme(newTheme)
    }

    onInternalChannel('broadcast-preferences-changed', (change: Partial<IUserPreferences>) => {
      if (change.shortcutStyle !== undefined) {
        this._applyShortcutStyle(change.shortcutStyle)
      }

      const nextPreferences = {
        ...preferences.getAll(),
        ...change
      }
      nativeTheme.themeSource = getNativeThemeSource(nextPreferences)

      // When followSystemTheme is enabled, immediately switch to match system
      if (change.followSystemTheme === true) {
        const systemIsDark = nativeTheme.shouldUseDarkColors
        const lightModeTheme = preferences.getItem<string>('lightModeTheme')
        const darkModeTheme = preferences.getItem<string>('darkModeTheme')
        const newTheme = systemIsDark ? darkModeTheme : lightModeTheme

        log.info(
          `followSystemTheme enabled, switching to: ${newTheme} (system ${systemIsDark ? 'dark' : 'light'})`
        )
        selectTheme(newTheme)
        preferences.setItem('theme', newTheme)
      }
      // When light/dark mode theme preferences change, apply immediately if following system
      if (
        preferences.getItem<boolean>('followSystemTheme') &&
        (change.lightModeTheme || change.darkModeTheme)
      ) {
        const systemIsDark = nativeTheme.shouldUseDarkColors

        // Get current values, but prefer the NEW values from the change event
        let lightModeTheme = preferences.getItem<string>('lightModeTheme')
        let darkModeTheme = preferences.getItem<string>('darkModeTheme')

        // If these preferences were just changed, use the new values from the change object
        if (change.lightModeTheme !== undefined) {
          lightModeTheme = change.lightModeTheme
        }
        if (change.darkModeTheme !== undefined) {
          darkModeTheme = change.darkModeTheme
        }

        const newTheme = systemIsDark ? darkModeTheme : lightModeTheme

        log.info(`Theme preference changed, applying: ${newTheme}`)
        selectTheme(newTheme)
        preferences.setItem('theme', newTheme)
      }
    })

    // Listen for system theme changes and auto-switch if enabled
    if (!this._themeListenerRegistered) {
      nativeTheme.on('updated', () => {
        const followSystemTheme = preferences.getItem<boolean>('followSystemTheme')
        const lightModeTheme = preferences.getItem<string>('lightModeTheme')
        const darkModeTheme = preferences.getItem<string>('darkModeTheme')

        if (followSystemTheme) {
          const systemIsDark = nativeTheme.shouldUseDarkColors
          const newTheme = systemIsDark ? darkModeTheme : lightModeTheme
          const currentTheme = preferences.getItem<string>('theme')

          // Only switch if the theme actually needs to change
          if (newTheme !== currentTheme) {
            log.info(
              `System theme changed, switching to: ${newTheme} (system ${systemIsDark ? 'dark' : 'light'})`
            )
            selectTheme(newTheme)
            preferences.setItem('theme', newTheme)
          }
        }
      })
      this._themeListenerRegistered = true
    }

    if (isOsx) {
      app.dock?.setMenu(dockMenu)
    } else if (isWindows) {
      app.setJumpList([
        {
          type: 'recent'
        },
        {
          type: 'tasks',
          items: [
            {
              type: 'task',
              title: 'New Window',
              description: 'Opens a new window',
              program: process.execPath,
              args: '--new-window',
              iconPath: process.execPath,
              iconIndex: 0
            }
          ]
        }
      ])
    }

    const createWindow = (): void => {
      if (isRestorePathway) {
        // A previous version could leave one recovery file per editor window.
        // Restore all of them into one window; the editor buffer store merges
        // tabs and removes duplicate document paths during the restore.
        const bufferStores = editorBufferStore.getAll()
        const bufferStoreList = Object.values(bufferStores) as Array<{
          id: string
          filePath: string | null
        }>
        const restorableBufferStores = bufferStoreList.filter(
          (bufferStoreInfo): bufferStoreInfo is { id: string; filePath: string } =>
            typeof bufferStoreInfo.filePath === 'string'
        )
        if (restorableBufferStores.length === 0) {
          this._createEditorWindow()
          return
        }

        this._createEditorWindow(null, [], [], {}, {
          ...restorableBufferStores[0],
          restoreBufferStores: restorableBufferStores
        })
      } else if (_openFilesCache.length) {
        // We should wipe the buffer store if not it will keep creating new windows whenever we open files via double click in the file manager
        editorBufferStore.clearBufferStoresWithAllSaved()
        this._openFilesToOpen()
      } else {
        this._createEditorWindow()
      }
    }

    if (isLinux) {
      let windowCreated = false

      const createWindowOnce = (): void => {
        if (windowCreated) return
        windowCreated = true
        createWindow()
      }

      // Wait for theme to settle (Linux-specific issue?)
      nativeTheme.once('updated', createWindowOnce)
      // Fallback timeout in case 'updated' never fires (no theme change)
      setTimeout(createWindowOnce, 150)
    } else {
      // Create immediately on Windows/macOS
      createWindow()
    }

    this._scheduleBackgroundUpdateCheck()

    // this.shortcutCapture = new ShortcutCapture()
    // if (process.env.NODE_ENV === 'development') {
    //   this.shortcutCapture.dirname = path.resolve(path.join(__dirname, '../../../node_modules/shortcut-capture'))
    // }
    // this.shortcutCapture.on('capture', async ({ dataURL }) => {
    //   const { screenshotFileName } = this
    //   const image = nativeImage.createFromDataURL(dataURL)
    //   const bufferImage = image.toPNG()

    //   if (this.launchScreenshotWin) {
    //     this.launchScreenshotWin.webContents.send('mt::screenshot-captured')
    //     this.launchScreenshotWin = null
    //   }

    //   try {
    //     // write screenshot image into screenshot folder.
    //     await fse.writeFile(screenshotFileName, bufferImage)
    //   } catch (err) {
    //     log.error(err)
    //   }
    // })
  }

  openFile = (event: Electron.Event, pathname: string): void => {
    event.preventDefault()
    const info = normalizeMarkdownPath(pathname)
    if (info) {
      this._openFilesCache.push(info as PathInfo)

      if (app.isReady()) {
        // It might come more files
        if (this._openFilesTimer) {
          clearTimeout(this._openFilesTimer)
        }
        this._openFilesTimer = setTimeout(() => {
          this._openFilesTimer = null
          this._openFilesToOpen()
        }, 100)
      }
    }
  }

  // --- private --------------------------------

  /**
   * Creates a new editor window.
   */
  private _createEditorWindow(
    rootDirectory: string | null = null,
    fileList: string[] = [],
    markdownList: string[] = [],
    options: Partial<BrowserWindowConstructorOptions> = {},
    bufferStoreInfo: {
      id: string
      filePath: string | null
      restoreBufferStores?: Array<{ id: string; filePath: string }>
    } | null = null
  ): EditorWindow {
    const editor = new EditorWindow(this._accessor)
    if (rootDirectory) {
      this._accessor.preferences.setItems({ lastOpenedFolder: rootDirectory })
    }
    editor.createWindow(rootDirectory, fileList, markdownList, options, bufferStoreInfo)
    this._windowManager.add(editor)
    if (this._windowManager.windowCount === 1) {
      this._accessor.menu.setActiveWindow(editor.id!)
    }
    return editor
  }

  /**
   * Create a new setting window.
   */
  private _createSettingWindow(category?: string | null): void {
    const setting = new SettingWindow(this._accessor)
    setting.createWindow(category ?? null)
    this._windowManager.add(setting)
    if (this._windowManager.windowCount === 1) {
      this._accessor.menu.setActiveWindow(setting.id!)
    }
  }

  private _openFilesToOpen(): void {
    this._openPathList(this._openFilesCache, false)
  }

  /**
   * Open the path list in the best window(s).
   *
   * @param pathsToOpen The path list to open.
   * @param openFilesInSameWindow Open all files in the same window with
   * the first directory and discard other directories.
   */
  private _openPathList(pathsToOpen: PathInfo[], openFilesInSameWindow: boolean = false): void {
    const { _windowManager } = this
    const openFilesInNewWindow = this._accessor.preferences.getItem<boolean>('openFilesInNewWindow')

    const fileSet = new Set<string>()
    const directorySet = new Set<string>()
    for (const { isDir, path } of pathsToOpen) {
      if (isDir) {
        directorySet.add(path)
      } else {
        fileSet.add(path)
      }
    }

    // Filter out directories that are already opened.
    for (const window of _windowManager.windows.values()) {
      if (window.type === WindowType.EDITOR) {
        const { openedRootDirectory } = window as EditorWindow
        if (openedRootDirectory && directorySet.has(openedRootDirectory)) {
          window.bringToFront()
          directorySet.delete(openedRootDirectory)
        }
      }
    }

    const directoriesToOpen: { rootDirectory: string | null; fileList: string[] }[] = Array.from(
      directorySet
    ).map((dir) => ({
      rootDirectory: dir,
      fileList: []
    }))
    const filesToOpen = Array.from(fileSet)

    // Discard all directories except first one and add files.
    if (openFilesInSameWindow) {
      if (directoriesToOpen.length) {
        directoriesToOpen[0].fileList.push(...filesToOpen)
        directoriesToOpen.length = 1
      } else {
        directoriesToOpen.push({ rootDirectory: null, fileList: [...filesToOpen] })
      }
      filesToOpen.length = 0
    }

    // Find the best window(s) to open the files in.
    if (!openFilesInSameWindow && !openFilesInNewWindow) {
      const isFirstWindow = _windowManager.getActiveEditorId() === null

      // Prefer new directories
      for (let i = 0; i < directoriesToOpen.length; ++i) {
        const { fileList, rootDirectory } = directoriesToOpen[i]

        let breakOuterLoop = false
        for (let j = 0; j < filesToOpen.length; ++j) {
          const pathname = filesToOpen[j]
          if (isChildOfDirectory(rootDirectory ?? '', pathname)) {
            if (isFirstWindow) {
              fileList.push(...filesToOpen)
              filesToOpen.length = 0
              breakOuterLoop = true
              break
            }
            fileList.push(pathname)
            filesToOpen.splice(j, 1)
            --j
          }
        }

        if (breakOuterLoop) {
          break
        }
      }

      // Find for the remaining files the best window to open the files in.
      if (isFirstWindow && directoriesToOpen.length && filesToOpen.length) {
        const { fileList } = directoriesToOpen[0]
        fileList.push(...filesToOpen)
        filesToOpen.length = 0
      } else {
        const windowList = _windowManager.findBestWindowToOpenIn(filesToOpen)
        for (const item of windowList) {
          const { windowId, fileList } = item

          // File list is empty when all files are already opened.
          if (fileList.length === 0) {
            continue
          }

          if (windowId !== null) {
            const window = _windowManager.get(windowId) as EditorWindow | undefined
            if (window) {
              window.openTabsFromPaths(fileList)
              window.bringToFront()
              continue
            }
            // else: fallthrough
          }
          this._createEditorWindow(null, fileList)
        }
      }

      // Directores are always opened in a new window if not already opened.
      for (const item of directoriesToOpen) {
        const { rootDirectory, fileList } = item
        this._createEditorWindow(rootDirectory, fileList)
      }
    } else {
      // Open each file and directory in a new window.

      for (const pathname of filesToOpen) {
        this._createEditorWindow(null, [pathname])
      }

      for (const item of directoriesToOpen) {
        const { rootDirectory, fileList } = item
        this._createEditorWindow(rootDirectory, fileList)
      }
    }

    // Empty the file list
    pathsToOpen.length = 0
  }

  private _openSettingsWindow(category?: string | null): void {
    const settingWins = this._windowManager.getWindowsByType(WindowType.SETTINGS)
    if (settingWins.length >= 1) {
      // A setting window is already created
      const browserSettingWindow = settingWins[0].win.browserWindow!
      browserSettingWindow.webContents.send('settings::change-tab', category)
      if (isLinux) {
        browserSettingWindow.focus()
      } else {
        browserSettingWindow.moveTop()
      }
      return
    }
    this._createSettingWindow(category)
  }

  private _getEditorBrowserWindows(): BrowserWindow[] {
    return this._windowManager
      .getWindowsByType(WindowType.EDITOR)
      .map(({ win }) => win.browserWindow)
      .filter((win): win is BrowserWindow => win != null)
  }

  private _broadcastKeybindings(editorWindows: BrowserWindow[]): void {
    const keybindingMap = Object.fromEntries(this._accessor.keybindings.keys)
    for (const win of editorWindows) {
      win.webContents.send('mt::keybindings-response', keybindingMap)
    }
  }

  private _getKeybindingPreferences(): KeybindingPreferences {
    const { keybindings } = this._accessor
    return {
      defaultKeybindings: keybindings.getDefaultKeybindings(),
      userKeybindings: keybindings.getUserKeybindings(),
      shortcutStyle: keybindings.getShortcutStyle()
    }
  }

  private _applyShortcutStyle(style: unknown): void {
    const { keybindings, menu } = this._accessor
    const editorWindows = this._getEditorBrowserWindows()
    const changed = keybindings.setShortcutStyle(style, editorWindows)
    if (!changed) return

    menu.updateKeybindings()
    this._broadcastKeybindings(editorWindows)
  }

  private _createUpdateProvider(): E2EUpdateProvider | MacReleaseChecker | WindowsUpdateProvider | undefined {
    const scenario = process.env.INKIVA_E2E_UPDATE_SCENARIO
    if (isE2EUpdateScenario(scenario)) return new E2EUpdateProvider(scenario)
    if (isWindows) return new WindowsUpdateProvider()
    if (isOsx) return new MacReleaseChecker()
    return undefined
  }

  private _scheduleBackgroundUpdateCheck(): void {
    if (this._backgroundUpdateCheckScheduled) return
    this._backgroundUpdateCheckScheduled = true
    const configuredDelay = process.env.INKIVA_E2E_UPDATE_BACKGROUND_DELAY_MS
    const parsedDelay = configuredDelay === undefined ? NaN : Number(configuredDelay)
    const delay = Number.isFinite(parsedDelay) && parsedDelay >= 0 ? parsedDelay : 5000
    setTimeout(() => {
      void this._updateManager.checkForUpdate('background')
    }, delay)
  }

  private _broadcastUpdateStatus(status: UpdateStatus): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('mt::update-state-changed', status)
      }
    }
  }

  private _handleUpdateStatusChanged(status: UpdateStatus): void {
    if (isE2EUpdateScenario(process.env.INKIVA_E2E_UPDATE_SCENARIO)) {
      const globalState = globalThis as typeof globalThis & {
        __inkiva_e2e_update_statuses__?: UpdateStatus[]
      }
      ;(globalState.__inkiva_e2e_update_statuses__ ??= []).push({ ...status })
    }
    this._broadcastUpdateStatus(status)
    if (status.state === 'ready-to-install' && isWindows) {
      void this._showWindowsUpdateReadyPrompt()
    } else if (status.state === 'available' && isOsx) {
      void this._showMacUpdateAvailablePrompt()
    }
  }

  private _getUpdateDialogWindow(): BrowserWindow | undefined {
    return (
      this._windowManager.getActiveEditor()?.browserWindow ??
      BrowserWindow.getFocusedWindow() ??
      undefined
    )
  }

  private async _showWindowsUpdateReadyPrompt(): Promise<void> {
    if (this._updatePromptOpen || this._updateManager.status.state !== 'ready-to-install') return
    this._updatePromptOpen = true
    try {
      const win = this._getUpdateDialogWindow()
      const options: Electron.MessageBoxOptions = {
        type: 'info',
        buttons: [t('update.later'), t('update.restartNow')],
        defaultId: 1,
        cancelId: 0,
        noLink: true,
        message: t('update.ready'),
        detail: t('update.available', { version: this._updateManager.status.latestVersion ?? '' })
      }
      const result = win
        ? await dialog.showMessageBox(win, options)
        : await dialog.showMessageBox(options)
      if (result.response === 1) {
        await this._updateManager.requestRestart()
      }
    } finally {
      this._updatePromptOpen = false
    }
  }

  private async _showMacUpdateAvailablePrompt(): Promise<void> {
    if (this._updatePromptOpen || this._updateManager.status.state !== 'available') return
    this._updatePromptOpen = true
    try {
      const win = this._getUpdateDialogWindow()
      const options: Electron.MessageBoxOptions = {
        type: 'info',
        buttons: [t('update.later'), t('update.openRelease')],
        defaultId: 1,
        cancelId: 0,
        noLink: true,
        message: t('update.available', { version: this._updateManager.status.latestVersion ?? '' }),
        detail: t('update.macosManualUpdate')
      }
      const result = win
        ? await dialog.showMessageBox(win, options)
        : await dialog.showMessageBox(options)
      if (result.response === 1) await this._updateManager.openUpdateRelease()
    } finally {
      this._updatePromptOpen = false
    }
  }

  private async _handleManualUpdateCheck(): Promise<void> {
    const status = await this._updateManager.checkForUpdate('manual')
    if (status.state !== 'up-to-date' && status.state !== 'error' && status.state !== 'disabled') {
      return
    }

    const win = this._getUpdateDialogWindow()
    const options: Electron.MessageBoxOptions =
      status.state === 'up-to-date'
        ? {
          type: 'info',
          buttons: [t('update.later')],
          defaultId: 0,
          noLink: true,
          message: t('update.upToDate', { version: status.currentVersion })
        }
        : {
          type: status.state === 'disabled' ? 'info' : 'error',
          buttons: [t('update.later')],
          defaultId: 0,
          noLink: true,
          message: status.state === 'disabled' ? t('update.disabled') : t('update.checkFailed'),
          detail: status.errorMessage
        }

    if (win) await dialog.showMessageBox(win, options)
    else await dialog.showMessageBox(options)
  }

  private _listenForIpcMain(): void {
    registerKeyboardListeners()
    registerSpellcheckerListeners()

    // Handle language setting requests
    ipcMain.on('mt::get-current-language', (event) => {
      const { language } = this._accessor.preferences.getAll()
      event.reply('mt::current-language', language || DEFAULT_LANGUAGE)
    })

    ipcMain.on('app-create-editor-window', () => {
      this._createEditorWindow()
    })

    onInternalChannel('screen-capture', async(win: BrowserWindow) => {
      if (isOsx) {
        // Use macOs `screencapture` command line when in macOs system.
        const screenshotFileName = await this.getScreenshotFileName()
        exec('screencapture -i -c', async(err) => {
          if (err) {
            log.error(err)
            return
          }
          // The renderer can no longer paste the clipboard bitmap via the
          // removed `document.execCommand('paste')`, so persist the capture to a
          // PNG and hand the path to the renderer to insert at the cursor.
          let savedPath = ''
          try {
            const image = clipboard.readImage()
            // `screencapture` leaves the clipboard untouched when the user
            // cancels (Esc); skip so we don't insert a stale/empty image.
            if (!image.isEmpty()) {
              const bufferImage = image.toPNG()
              await fsPromises.writeFile(screenshotFileName, bufferImage)
              savedPath = screenshotFileName
            }
          } catch (writeErr) {
            log.error(writeErr)
          }
          win.webContents.send('mt::screenshot-captured', savedPath)
        })
      } else {
        // TODO: Do nothing, maybe we'll add screenCapture later on Linux and Windows.
        // if (this.shortcutCapture) {
        //   this.launchScreenshotWin = win
        //   this.shortcutCapture.shortcutCapture()
        // }
      }
    })

    onInternalChannel('app-create-settings-window', (category?: string) => {
      this._openSettingsWindow(category)
    })

    onInternalChannel('app-open-file-by-id', (windowId: number, filePath: string) => {
      const openFilesInNewWindow =
        this._accessor.preferences.getItem<boolean>('openFilesInNewWindow')
      if (openFilesInNewWindow) {
        this._createEditorWindow(null, [filePath])
      } else {
        const editor = this._windowManager.get(windowId) as EditorWindow | undefined
        if (editor) {
          editor.openTab(filePath, {}, true)
        }
      }
    })
    onInternalChannel('app-open-files-by-id', (windowId: number, fileList: string[]) => {
      const openFilesInNewWindow =
        this._accessor.preferences.getItem<boolean>('openFilesInNewWindow')
      if (openFilesInNewWindow) {
        this._createEditorWindow(null, fileList)
      } else {
        const editor = this._windowManager.get(windowId) as EditorWindow | undefined
        if (editor) {
          editor.openTabsFromPaths(
            fileList
              .map((p) => normalizeMarkdownPath(p))
              .filter((i): i is PathInfo => i !== null && !i.isDir)
              .map((i) => i.path)
          )
        }
      }
    })

    onInternalChannel('app-open-markdown-by-id', (windowId: number, data: string) => {
      const openFilesInNewWindow =
        this._accessor.preferences.getItem<boolean>('openFilesInNewWindow')
      if (openFilesInNewWindow) {
        this._createEditorWindow(null, [], [data])
      } else {
        const editor = this._windowManager.get(windowId) as EditorWindow | undefined
        if (editor) {
          editor.openUntitledTab(true, data)
        }
      }
    })

    onInternalChannel(
      'app-open-directory-by-id',
      (windowId: number, pathname: string, openInSameWindow: boolean) => {
        const { openFolderInNewWindow } = this._accessor.preferences.getAll()
        if (openInSameWindow || !openFolderInNewWindow) {
          const editor = this._windowManager.get(windowId) as EditorWindow | undefined
          if (editor) {
            editor.openFolder(pathname)
            return
          }
        }
        this._createEditorWindow(pathname)
      }
    )

    // --- renderer -------------------

    const checkForUpdates = (): void => {
      void this._handleManualUpdateCheck()
    }
    ipcMain.on('app-check-for-updates', checkForUpdates)
    ipcMain.on('mt::check-for-update', checkForUpdates)
    ipcMain.on('mt::restart-to-update', () => {
      void this._updateManager.requestRestart()
    })
    ipcMain.on('mt::open-update-release', () => {
      void this._updateManager.openUpdateRelease()
    })
    ipcMain.on('mt::update-preflight-response', (_event, requestId, files) => {
      this._updatePreflight.resolve(requestId, files)
    })

    ipcMain.on('mt::app-try-quit', () => {
      app.quit()
    })

    ipcMain.on('mt::open-file-by-window-id', (_e, windowId: number, filePath: string) => {
      const resolvedPath = normalizeAndResolvePath(filePath)
      const openFilesInNewWindow =
        this._accessor.preferences.getItem<boolean>('openFilesInNewWindow')
      if (openFilesInNewWindow) {
        this._createEditorWindow(null, [resolvedPath])
      } else {
        const editor = this._windowManager.get(windowId) as EditorWindow | undefined
        if (editor) {
          editor.openTab(resolvedPath, {}, true)
        }
      }
    })

    ipcMain.on('mt::select-default-directory-to-open', async(e) => {
      const { preferences } = this._accessor
      const { defaultDirectoryToOpen } = preferences.getAll()
      const win = BrowserWindow.fromWebContents(e.sender)
      if (!win) return

      const { filePaths } = await dialog.showOpenDialog(win, {
        defaultPath: defaultDirectoryToOpen,
        properties: ['openDirectory', 'createDirectory']
      })
      if (filePaths && filePaths[0]) {
        preferences.setItems({ defaultDirectoryToOpen: filePaths[0] })
      }
    })

    ipcMain.on('mt::open-setting-window', () => {
      this._openSettingsWindow()
    })

    ipcMain.on('mt::make-screenshot', (e) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      ipcMain.emit('screen-capture', win)
    })

    ipcMain.on('mt::request-keybindings', (e) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      if (!win) return
      const { keybindings } = this._accessor
      // Convert map to object
      win.webContents.send('mt::keybindings-response', Object.fromEntries(keybindings.keys))
    })

    ipcMain.on('mt::open-keybindings-config', () => {
      const { keybindings } = this._accessor
      keybindings.openConfigInFileManager()
    })

    ipcMain.handle('mt::keybinding-get-pref-keybindings', () => {
      return this._getKeybindingPreferences()
    })

    ipcMain.handle('mt::keybinding-set-style', (_event, style: unknown) => {
      const { preferences } = this._accessor
      const normalizedStyle = normalizeShortcutStyle(style)
      preferences.setItem('shortcutStyle', normalizedStyle)
      // The preference broadcast normally applies the change through the
      // listener in init(). Apply it here as well so the settings window gets
      // a correct response even during early application startup.
      this._applyShortcutStyle(normalizedStyle)
      return this._getKeybindingPreferences()
    })

    ipcMain.handle('mt::keybinding-save-user-keybindings', async(_event, userKeybindings) => {
      const { keybindings, menu } = this._accessor
      const editorWindows = this._getEditorBrowserWindows()
      const saved = await keybindings.setUserKeybindings(userKeybindings, editorWindows)

      menu.updateKeybindings()
      this._broadcastKeybindings(editorWindows)

      return saved
    })

    ipcMain.handle('mt::fs-trash-item', async(_event, fullPath: string) => {
      return shell.trashItem(fullPath)
    })
  }
}

export default App
