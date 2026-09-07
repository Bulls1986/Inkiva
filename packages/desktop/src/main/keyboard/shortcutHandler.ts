import { shell, type BrowserWindow } from 'electron'
import fs from 'fs'
import fsPromises from 'fs/promises'
import path from 'path'
import log from 'electron-log'
import { electronLocalshortcut, isValidElectronAccelerator } from '@hfelix/electron-localshortcut'
import { isFile2 } from 'common/filesystem'
import { isEqualAccelerator } from 'common/keybinding'
import { isLinux, isOsx } from '../config'
import type { KeyboardInfo } from '../keyboard'
import keybindingsDarwin from './keybindingsDarwin'
import keybindingsLinux from './keybindingsLinux'
import keybindingsWindows from './keybindingsWindows'
import type { CommandManager } from '../commands'
import type { AppEnvironment } from '../app/env'
import type { ShortcutStyle } from '@shared/types/preferences'
import {
  applyShortcutStyle,
  DEFAULT_SHORTCUT_STYLE,
  normalizeShortcutStyle,
  type ShortcutPlatform
} from './shortcutStyles'

type ShortcutCallback = (win: BrowserWindow) => void

class Keybindings {
  configPath: string
  commandManager: CommandManager
  userKeybindings: Map<string, string>
  keys: Map<string, string>
  shortcutStyle: ShortcutStyle

  /**
   * @param commandManager The command manager instance.
   * @param appEnvironment The application environment instance.
   */
  constructor(
    commandManager: CommandManager,
    appEnvironment: AppEnvironment,
    shortcutStyle: unknown = DEFAULT_SHORTCUT_STYLE
  ) {
    const { userDataPath } = appEnvironment.paths
    this.configPath = path.join(userDataPath, 'keybindings.json')
    this.commandManager = commandManager
    this.shortcutStyle = normalizeShortcutStyle(shortcutStyle)

    this.userKeybindings = new Map()
    this.keys = this.getDefaultKeybindings()
    this._prepareKeyMapper()

    if (appEnvironment.isDevMode) {
      for (const [id, accelerator] of this.keys) {
        if (!commandManager.has(id)) {
          console.error(
            `[DEBUG] Command with id="${id}" isn't available for accelerator="${accelerator}".`
          )
        }
      }
    }

    // Load user-defined keybindings
    this._loadLocalKeybindings()
  }

  getAccelerator(id: string): string | null {
    const name = this.keys.get(id)
    if (!name) {
      return null
    }
    return name
  }

  registerAccelerator(win: BrowserWindow, accelerator: string, callback: ShortcutCallback): void {
    if (!win || !accelerator || !callback) {
      throw new Error(`addKeyHandler: invalid arguments (accelerator="${accelerator}").`)
    }

    electronLocalshortcut.register(win, accelerator, () => {
      callback(win)
      return true
    })
  }

  unregisterAccelerator(win: BrowserWindow, accelerator: string): void {
    electronLocalshortcut.unregister(win, accelerator)
  }

  registerEditorKeyHandlers(win: BrowserWindow): void {
    for (const [id, accelerator] of this.keys) {
      if (accelerator && accelerator.length > 1) {
        this.registerAccelerator(win, accelerator, () => {
          this.commandManager.execute(id, win)
        })
      }
    }
  }

  openConfigInFileManager(): void {
    const { configPath } = this
    if (!isFile2(configPath)) {
      fs.writeFileSync(configPath, '{\n\n\n}\n', 'utf-8')
    }
    shell.openPath(configPath).catch((err: unknown) => console.error(err))
  }

  getDefaultKeybindings(): Map<string, string> {
    const platformKeybindings = this.getPlatformKeybindings()
    const platform: ShortcutPlatform = isOsx ? 'darwin' : isLinux ? 'linux' : 'win32'
    return applyShortcutStyle(platformKeybindings, this.shortcutStyle, platform)
  }

  getShortcutStyle(): ShortcutStyle {
    return this.shortcutStyle
  }

  setShortcutStyle(style: unknown, windows: BrowserWindow[] = []): boolean {
    const nextStyle = normalizeShortcutStyle(style)
    if (nextStyle === this.shortcutStyle) {
      return false
    }

    this.shortcutStyle = nextStyle
    this._reloadKeybindings(windows)
    return true
  }

  private getPlatformKeybindings(): Map<string, string> {
    if (isOsx) {
      return keybindingsDarwin
    } else if (isLinux) {
      return keybindingsLinux
    }
    return keybindingsWindows
  }

  getUserKeybindings(): Map<string, string> {
    return this.userKeybindings
  }

  async setUserKeybindings(
    userKeybindings: Map<string, string> | Iterable<readonly [string, string]>,
    windows: BrowserWindow[] = []
  ): Promise<boolean> {
    this.userKeybindings = new Map(userKeybindings)
    const saved = await this._saveUserKeybindings()
    this._reloadKeybindings(windows)
    return saved
  }

  _reloadKeybindings(windows: BrowserWindow[]): void {
    const previousAccelerators = [...this.keys.values()].filter(
      (accelerator) => accelerator && accelerator.length > 1
    )

    this.keys = this.getDefaultKeybindings()
    this._loadLocalKeybindings()

    for (const win of windows) {
      if (!win || win.isDestroyed()) {
        continue
      }
      for (const accelerator of previousAccelerators) {
        this.unregisterAccelerator(win, accelerator)
      }
      this.registerEditorKeyHandlers(win)
    }
  }

  // --- private --------------------------------

  _prepareKeyMapper(): void {
    // native-keymap loads a native addon and enumerates the complete OS keymap.
    // Neither is required to paint the first editor frame, so keep it out of
    // the synchronous Accessor construction path. Default accelerators work in
    // the meantime and the mapper is replaced shortly after startup.
    setTimeout(() => {
      import('../keyboard')
        .then(({ getKeyboardInfo, keyboardLayoutMonitor }) => {
          const { layout, keymap } = getKeyboardInfo()
          electronLocalshortcut.setKeyboardLayout(layout, keymap)

          keyboardLayoutMonitor.addListener(({ layout: nextLayout, keymap: nextKeymap }: KeyboardInfo) => {
            const globalDebug = (globalThis as typeof globalThis & { MARKTEXT_DEBUG?: boolean })
              .MARKTEXT_DEBUG
            if (globalDebug && process.env.MARKTEXT_DEBUG_KEYBOARD) {
              console.log('[DEBUG] Keyboard layout changed:\n', nextLayout)
            }
            electronLocalshortcut.setKeyboardLayout(nextLayout, nextKeymap)
          })
        })
        .catch((error: unknown) => {
          log.warn('Unable to initialize native keyboard mapping:', error)
        })
    }, 1200)
  }

  async _saveUserKeybindings(): Promise<boolean> {
    const { configPath, userKeybindings } = this
    try {
      const userKeybindingJson = JSON.stringify(Object.fromEntries(userKeybindings), null, 2)
      await fsPromises.writeFile(configPath, userKeybindingJson, 'utf8')
      return true
    } catch {
      return false
    }
  }

  _loadLocalKeybindings(): void {
    const safeMode = (globalThis as typeof globalThis & { MARKTEXT_SAFE_MODE?: boolean })
      .MARKTEXT_SAFE_MODE
    if (safeMode || !isFile2(this.configPath)) {
      return
    }

    const rawUserKeybindings = this._loadUserKeybindingsFromDisk()
    if (!rawUserKeybindings) {
      log.warn('Invalid keybinding configuration: failed to load or parse file.')
      return
    }

    const userAccelerators: Map<string, string> = new Map()
    for (const key in rawUserKeybindings) {
      if (this.keys.has(key)) {
        const value = rawUserKeybindings[key]
        if (typeof value === 'string') {
          if (value.length === 0) {
            userAccelerators.set(key, '')
          } else if (isValidElectronAccelerator(value)) {
            userAccelerators.set(key, value)
          } else {
            console.error(`[WARNING] "${value}" is not a valid accelerator.`)
          }
        }
      }
    }

    for (const [keyA, valueA] of userAccelerators) {
      for (const [keyB, valueB] of userAccelerators) {
        if (valueA !== '' && keyA !== keyB && isEqualAccelerator(valueA, valueB)) {
          const err = `Invalid keybindings.json configuration: Duplicate value for "${keyA}" and "${keyB}"!`
          console.log(err)
          log.error(err)
          return
        }
      }
    }

    if (userAccelerators.size === 0) {
      return
    }

    const accelerators = new Map(this.keys)

    for (const [userKey, userValue] of userAccelerators) {
      if (userValue) {
        for (const [key, value] of accelerators) {
          if (isEqualAccelerator(value, userValue)) {
            accelerators.set(key, '')

            if (userAccelerators.get(key) == null) {
              userAccelerators.set(key, '')
            }
            break
          }
        }
      }
      accelerators.set(userKey, userValue)
    }

    this.keys = accelerators
    this.userKeybindings = userAccelerators
  }

  _loadUserKeybindingsFromDisk(): Record<string, unknown> | null {
    try {
      const obj = JSON.parse(fs.readFileSync(this.configPath, 'utf8'))
      if (typeof obj !== 'object') {
        return null
      }
      return obj
    } catch {
      return null
    }
  }
}

export default Keybindings
