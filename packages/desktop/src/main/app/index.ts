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
import { closeImagePathWatchers } from '../utils/imagePathAutoComplement'
import { onInternalChannel } from '../utils/internalIpc'
import { WindowType } from '../windows/base'
import EditorWindow from '../windows/editor'
import SettingWindow from '../windows/setting'
import type { BufferStoreState } from '../editorBufferStore/restore'
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
import OpenRequestCoordinator, { type OpenRequest } from '../session/openRequestCoordinator'
import { routeStartupOpenRequest } from '../session/startupOpenTarget'
import { canonicalPathKey } from '../session/pathCanonicalizer'
import { createBlankRestorePlan, type RestorePlan } from '../session/restorePlan'
import { SafeRestoreGuard } from '../session/safeRestoreGuard'
import { recoveryCenterSession } from '../session/recoveryCenter'
import { createSafeRestoreStore } from '../session/safeRestoreStore'
import {
  evaluateSafeRestoreStartup,
  markSafeRestoreStartupReady
} from '../session/safeRestoreStartup'
import { getNativeThemeSource, isDarkApplicationTheme } from './nativeTheme'
import { StartupPhaseCoordinator } from './startup'
import { mainPerformance } from '../performance/runtime'
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

type UpdateNotificationType = 'primary' | 'error' | 'warning' | 'info'
type UpdateNotificationAction = 'restart-to-update' | 'open-update-release'

interface UpdateNotificationOptions {
  time: number
  title: string
  message: string
  type: UpdateNotificationType
  showConfirm?: boolean
  action?: UpdateNotificationAction
}

const UPDATE_NOTIFICATION_TIME = {
  checking: 5000,
  upToDate: 5000,
  available: 10000,
  downloading: 10000,
  ready: 30000,
  failure: 12000,
  disabled: 7000
} as const

class App {
  private _accessor: Accessor
  private _args: CliArgs
  private _openRequestCoordinator: OpenRequestCoordinator
  private _startupOpenTarget: EditorWindow | null
  private _windowManager: WindowManager
  private _themeListenerRegistered: boolean
  private _updateManager: UpdateManager
  private _updatePreflight: RendererUpdatePreflight
  private readonly _updatePlatform: NodeJS.Platform
  private _backgroundUpdateCheckScheduled: boolean
  private _startupStarted: boolean
  private _startupCompleted: boolean
  private _startupCoordinator: StartupPhaseCoordinator
  private _safeRestoreGuard: SafeRestoreGuard
  private _safeRestoreAttemptSessionId: string | null

  /**
   * @param accessor The application accessor for application instances.
   * @param args Parsed application arguments.
   */
  constructor(accessor: Accessor, args: Partial<CliArgs>) {
    this._accessor = accessor
    this._args = (args as CliArgs) || ({ _: [] } as CliArgs)
    this._windowManager = this._accessor.windowManager
    this._openRequestCoordinator = new OpenRequestCoordinator({
      dispatch: (request) => this._dispatchOpenRequest(request)
    })
    this._startupOpenTarget = null
    this._updatePreflight = new RendererUpdatePreflight()
    this._backgroundUpdateCheckScheduled = false
    this._startupStarted = false
    this._startupCompleted = false
    this._startupCoordinator = new StartupPhaseCoordinator({
      documentEditableTimeoutMs: 10000,
      onDocumentEditableTimeout: () => {
        log.error('First document did not become editable within the startup budget')
      }
    })
    this._safeRestoreGuard = new SafeRestoreGuard(
      createSafeRestoreStore(this._accessor.paths.userDataPath)
    )
    this._safeRestoreAttemptSessionId = null
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
    const updatePlatform =
      e2eUpdatePlatform === 'win32' || e2eUpdatePlatform === 'darwin'
        ? e2eUpdatePlatform
        : process.platform
    this._updatePlatform = updatePlatform
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
      const args = parseArgs(argv.slice(1)) as CliArgs

      const paths = this._collectOpenPaths(args._, workingDirectory, true)
      if (paths.length) {
        this._openRequestCoordinator.enqueue({
          source: 'second-instance',
          newWindow: !!args['--new-window'],
          paths
        })
      } else if (this._startupCompleted) {
        this._windowManager.getActiveWindow()?.bringToFront()
      }
    })

    app.on('open-file', this.openFile) // macOS only

    app.on('ready', this.ready)

    app.on('window-all-closed', () => {
      closeImagePathWatchers()
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
        if (!this._startupStarted || !this._startupCompleted) {
          this.ready()
        } else {
          this._createEditorWindow()
        }
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
    if (this._startupStarted) return
    this._startupStarted = true
    mainPerformance.mark('electron_ready', {
      phase: 'startup'
    })
    this._openRequestCoordinator.beginRestore()

    const { _args: args } = this
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

    const initialPaths = this._collectOpenPaths(args._, process.cwd(), true)
    if (initialPaths.length) {
      this._openRequestCoordinator.enqueue({
        source: 'argv',
        newWindow: !!args['--new-window'],
        paths: initialPaths
      })
    }

    // We should NOT restore the previous buffer or open a folder if the user just wants to double click to open a file
    let isRestorePathway = false
    if (!this._openRequestCoordinator.hasPendingPaths()) {
      if (startUpAction === 'restoreAll') {
        // Restore based off the previous buffer
        isRestorePathway = true
      } else if (startUpAction === 'folder' && defaultDirectoryToOpen) {
        const info = normalizeMarkdownPath(defaultDirectoryToOpen)
        if (info) {
          this._openRequestCoordinator.enqueue({
            source: 'startup-preference',
            newWindow: false,
            paths: [info as PathInfo]
          })
        }
      } else if (startUpAction === 'openLastFolder' && lastOpenedFolder) {
        const info = normalizeMarkdownPath(lastOpenedFolder)
        if (info) {
          this._openRequestCoordinator.enqueue({
            source: 'startup-preference',
            newWindow: false,
            paths: [info as PathInfo]
          })
        }
      }
    }

    let useSafeRestore = false
    this._safeRestoreAttemptSessionId = null
    if (isRestorePathway) {
      const safeRestoreDecision = evaluateSafeRestoreStartup(this._safeRestoreGuard, true)
      useSafeRestore = safeRestoreDecision.useSafeRestore
      this._safeRestoreAttemptSessionId = safeRestoreDecision.attemptSessionId
    }

    if (isRestorePathway) {
      this._startupCoordinator.beginRestoring()
    }
    this._startupCoordinator.onEditorInteractive(() => this._scheduleBackgroundUpdateCheck())

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

    recoveryCenterSession.configure({
      safeMode: useSafeRestore,
      bufferStore: editorBufferStore,
      userDataPath: this._accessor.paths.userDataPath
    })

    const createWindow = async(): Promise<void> => {
      try {
        if (isRestorePathway) {
          // Create an empty, visible shell before touching recovery files. The
          // shell has no content yet, so the completed plan remains the only
          // source allowed to create restore tabs.
          const restoreEditor = this._createEditorWindow(null, [], [], {}, null, true)
          // Wait until the renderer shell has loaded (and the BrowserWindow has
          // been made visible) before touching recovery files. The restore
          // coordinator remains blocked, but recovery I/O cannot delay the
          // first shell frame.
          await restoreEditor.waitUntilReady()

          let restorePlan: RestorePlan
          try {
            restorePlan = await editorBufferStore.buildRestorePlan()
            for (const skippedSource of restorePlan.skippedSources) {
              log.warn(
                `Skipping editor recovery source ${skippedSource.filePath}: ${skippedSource.message}`
              )
            }
            if (restorePlan.kind === 'restore' && restorePlan.primarySource && restorePlan.state) {
              await editorBufferStore.consolidateBufferStoreFiles(
                restorePlan.primarySource.filePath,
                restorePlan.sources.map(({ filePath }) => filePath),
                restorePlan.state
              )
            }
            recoveryCenterSession.setRestorePlan(restorePlan, {
              safeMode: useSafeRestore,
              bufferStore: editorBufferStore,
              userDataPath: this._accessor.paths.userDataPath
            })
          } catch (error) {
            // Recovery is a best-effort feature. A scan, migration or merge
            // error must leave the already-visible shell usable.
            log.error('Failed to build startup restore plan:', error)
            restorePlan = createBlankRestorePlan()
          }

          // Keep argv/open-file requests queued until this plan has finished
          // loading its files into the shell. This prevents a queued request
          // from being overwritten by the eventual `load-state` message.
          await restoreEditor.applyRestorePlan(useSafeRestore ? createBlankRestorePlan() : restorePlan)
        } else if (this._openRequestCoordinator.hasPendingPaths()) {
          // Explicit startup/open-file request takes precedence over recovery.
          // Create the shell before clearing stale recovery files so cleanup
          // cannot delay first paint.
          const startupRequest = this._openRequestCoordinator.getFirstPendingRequest()
          const startupDirectory =
            startupRequest?.paths.find(({ isDir }) => isDir)?.path ?? null
          const startupFiles = (startupRequest?.paths ?? [])
            .filter(({ isDir }) => !isDir)
            .map(({ path: pathname }) => pathname)
          const editor = this._createEditorWindow(startupDirectory, startupFiles)
          this._startupOpenTarget = editor
          editor.once('window-shell-visible', () => {
            editorBufferStore.clearBufferStoresWithAllSaved()
          })
        } else {
          this._createEditorWindow()
        }
      } catch (error) {
        // Recovery is a best-effort feature. A scan, migration or merge error
        // must never prevent a normal blank editor from starting.
        log.error('Failed to build startup restore plan:', error)
        if (this._windowManager.windowCount === 0) this._createEditorWindow()
      } finally {
        this._openRequestCoordinator.completeRestore()
        this._startupCompleted = true
      }
    }

    // The native window background and the renderer's pre-mount appearance
    // are both derived from persisted preferences before the window is
    // created. Waiting for a Linux nativeTheme event only delays the first
    // shell and can still fall back to a timer when the event never arrives.
    // Theme changes continue to be handled by the listener registered above.
    void createWindow()

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
    const paths = this._collectOpenPaths([pathname], process.cwd())
    if (paths.length) {
      this._openRequestCoordinator.enqueue({
        source: 'open-file',
        newWindow: false,
        paths
      })
    } else if (this._startupCompleted) {
      this._windowManager.getActiveWindow()?.bringToFront()
    }
  }

  // --- private --------------------------------

  private _collectOpenPaths(
    pathnames: readonly string[],
    workingDirectory: string,
    ignoreApplicationPath: boolean = false
  ): PathInfo[] {
    const applicationPathKey = ignoreApplicationPath
      ? canonicalPathKey(path.resolve(app.getAppPath()))
      : null
    const result: PathInfo[] = []

    for (const pathname of pathnames) {
      if (!pathname || pathname.startsWith('--')) continue

      const resolvedPath = path.resolve(workingDirectory, pathname)
      if (applicationPathKey && canonicalPathKey(resolvedPath) === applicationPathKey) continue

      const info = normalizeMarkdownPath(resolvedPath)
      if (info) result.push(info as PathInfo)
    }

    return result
  }

  private _dispatchOpenRequest(request: OpenRequest): void {
    const startupTarget = this._startupOpenTarget
    if (startupTarget) {
      this._startupOpenTarget = null
      routeStartupOpenRequest(startupTarget, request)
      return
    }

    this._openPathList(
      request.paths.map(({ isDir, path: pathname }) => ({ isDir, path: pathname })),
      request.newWindow
    )
  }

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
      restoredState?: BufferStoreState
    } | null = null,
    deferInitialContent: boolean = false
  ): EditorWindow {
    const safeRestoreAttemptSessionId = this._safeRestoreAttemptSessionId
    this._safeRestoreAttemptSessionId = null
    const editor = new EditorWindow(this._accessor)
    editor.on('window-shell-visible', () => {
      this._startupCoordinator.markShellVisible()
    })
    editor.once('window-renderer-ready', () => {
      this._startupCoordinator.markRendererReady()
    })
    editor.once('window-interactive', () => {
      this._startupCoordinator.markDocumentEditable()
      markSafeRestoreStartupReady(this._safeRestoreGuard, safeRestoreAttemptSessionId)
    })
    if (rootDirectory) {
      this._accessor.preferences.setItems({ lastOpenedFolder: rootDirectory })
    }
    editor.createWindow(
      rootDirectory,
      fileList,
      markdownList,
      options,
      bufferStoreInfo,
      deferInitialContent
    )
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

    const fileSet = new Map<string, string>()
    const directorySet = new Map<string, string>()
    for (const { isDir, path: pathname } of pathsToOpen) {
      const key = canonicalPathKey(pathname)
      if (!key) continue
      if (isDir) {
        if (!directorySet.has(key)) directorySet.set(key, pathname)
      } else {
        if (!fileSet.has(key)) fileSet.set(key, pathname)
      }
    }

    // Existing directories and files are activated instead of creating a
    // second window/tab, including when the request came from --new-window.
    for (const [key, pathname] of directorySet) {
      const editor = _windowManager.findEditorWindowWithRoot(pathname)
      if (editor) {
        editor.bringToFront()
        directorySet.delete(key)
      }
    }
    for (const [key, pathname] of fileSet) {
      const editor = _windowManager.findEditorWindowWithPath(pathname)
      if (editor) {
        editor.openTab(pathname, {}, true)
        editor.bringToFront()
        fileSet.delete(key)
      }
    }

    if (fileSet.size === 0 && directorySet.size === 0) {
      pathsToOpen.length = 0
      return
    }

    const directoriesToOpen: { rootDirectory: string | null; fileList: string[] }[] = Array.from(
      directorySet.values()
    ).map((dir) => ({
      rootDirectory: dir,
      fileList: []
    }))
    const filesToOpen = Array.from(fileSet.values())

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

  private _createUpdateProvider():
    | E2EUpdateProvider
    | MacReleaseChecker
    | WindowsUpdateProvider
    | undefined {
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
    if (status.state === 'checking' && status.checkSource === 'manual') {
      this._sendUpdateNotification({
        time: UPDATE_NOTIFICATION_TIME.checking,
        title: t('update.checking'),
        message: '',
        type: 'info'
      })
    } else if (status.state === 'no-update' && status.checkSource === 'manual') {
      this._sendUpdateNotification({
        time: UPDATE_NOTIFICATION_TIME.upToDate,
        title: t('update.upToDate', { version: status.currentVersion }),
        message: '',
        type: 'info'
      })
    } else if (status.state === 'available') {
      if (this._updatePlatform === 'win32') this._showUpdateAvailableNotification(status)
      else if (this._updatePlatform === 'darwin') this._showMacUpdateAvailableNotification(status)
    } else if (status.state === 'ready' && this._updatePlatform === 'win32') {
      this._showUpdateReadyNotification(status)
    } else if (
      status.state === 'error-recoverable' &&
      (status.errorCode === 'DOWNLOAD_ERROR' ||
        status.errorCode === 'DOWNLOAD_CANCELLED' ||
        status.errorCode === 'VERIFICATION_ERROR' ||
        status.checkSource === 'manual')
    ) {
      this._showUpdateErrorNotification(status)
    }
  }

  private _getUpdateDialogWindow(): BrowserWindow | undefined {
    return (
      this._windowManager.getActiveEditor()?.browserWindow ??
      BrowserWindow.getFocusedWindow() ??
      undefined
    )
  }

  private _sendUpdateNotification(options: UpdateNotificationOptions): void {
    const target = this._getUpdateDialogWindow()
    if (target && !target.isDestroyed()) {
      target.webContents.send('mt::show-notification', options)
      return
    }

    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('mt::show-notification', options)
    }
  }

  private _showUpdateAvailableNotification(status: UpdateStatus): void {
    this._sendUpdateNotification({
      time: UPDATE_NOTIFICATION_TIME.available,
      title: t('update.available', { version: status.latestVersion ?? '' }),
      message: t('update.downloading'),
      type: 'info'
    })
  }

  private _showUpdateDownloadingNotification(status: UpdateStatus): void {
    this._sendUpdateNotification({
      time: UPDATE_NOTIFICATION_TIME.downloading,
      title: t('update.downloading'),
      message: t('update.available', { version: status.latestVersion ?? '' }),
      type: 'info'
    })
  }

  private _showUpdateReadyNotification(status: UpdateStatus): void {
    this._sendUpdateNotification({
      time: UPDATE_NOTIFICATION_TIME.ready,
      title: t('update.ready'),
      message: t('update.available', { version: status.latestVersion ?? '' }),
      type: 'primary',
      showConfirm: true,
      action: 'restart-to-update'
    })
  }

  private _showMacUpdateAvailableNotification(status: UpdateStatus): void {
    this._sendUpdateNotification({
      time: UPDATE_NOTIFICATION_TIME.ready,
      title: t('update.available', { version: status.latestVersion ?? '' }),
      message: t('update.macosManualUpdate'),
      type: 'info',
      showConfirm: true,
      action: 'open-update-release'
    })
  }

  private _showUpdateErrorNotification(status: UpdateStatus): void {
    const title =
      (status.errorCode === 'DOWNLOAD_ERROR' ||
        status.errorCode === 'DOWNLOAD_CANCELLED' ||
        status.errorCode === 'VERIFICATION_ERROR')
        ? t('update.downloadFailed')
        : t('update.checkFailed')
    this._sendUpdateNotification({
      time: UPDATE_NOTIFICATION_TIME.failure,
      title,
      message: status.errorMessage ?? '',
      type: 'error'
    })
  }

  private _showDisabledUpdateNotification(): void {
    this._sendUpdateNotification({
      time: UPDATE_NOTIFICATION_TIME.disabled,
      title: t('update.disabled'),
      message: '',
      type: 'info'
    })
  }

  private async _handleManualUpdateCheck(): Promise<void> {
    const status = await this._updateManager.checkForUpdate('manual')
    switch (status.state) {
      case 'available':
        if (this._updatePlatform === 'win32') void this._updateManager.downloadUpdate()
        break
      case 'downloading':
        this._showUpdateDownloadingNotification(status)
        break
      case 'ready':
        if (this._updatePlatform === 'win32') this._showUpdateReadyNotification(status)
        break
      case 'disabled':
        this._showDisabledUpdateNotification()
        break
      default:
        break
    }
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
