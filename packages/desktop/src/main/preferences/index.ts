import fs from 'fs'
import path from 'path'
import Store, { type Schema } from 'electron-store'
import { BrowserWindow, ipcMain, nativeTheme } from 'electron'
import log from 'electron-log'
import { isWindows } from '../config'
import { hasSameKeys } from '../utils'
import { normalizeApplicationTheme, normalizeApplicationThemeSettings } from '../../common/theme'
import { onInternalChannel } from '../utils/internalIpc'
import { TypedEmitter } from '@shared/types/typedEmitter'
import type { IUserPreferences } from '@shared/types/preferences'
import type { PreferenceMutationResult, PreferencePatch } from '@shared/types/ipc'
import schema from './schema.json'
import bundledDefaultPreferences from '../../../static/preference.json'

const PREFERENCES_FILE_NAME = 'preferences'

// Keep the runtime schema defaults aligned with the defaults shipped in
// static/preference.json. The static preference file is the canonical product
// default source used for a fresh profile; applying the same values to the
// electron-store schema prevents missing keys from silently falling back to
// stale schema defaults.
const bundledDefaults = bundledDefaultPreferences as Record<string, unknown>
const runtimeSchema = Object.fromEntries(
  Object.entries(schema).map(([key, definition]) => [
    key,
    Object.prototype.hasOwnProperty.call(bundledDefaults, key)
      ? { ...definition, default: bundledDefaults[key] }
      : definition
  ])
)

type PreferenceEvents = Record<string, unknown[]>

interface AppPaths {
  readonly preferencesPath: string
}

class Preference extends TypedEmitter<PreferenceEvents> {
  public readonly preferencesPath: string
  public readonly hasPreferencesFile: boolean
  public readonly store: Store<IUserPreferences>

  constructor(paths: AppPaths) {
    super()

    const { preferencesPath } = paths
    this.preferencesPath = preferencesPath
    this.hasPreferencesFile = fs.existsSync(
      path.join(this.preferencesPath, `./${PREFERENCES_FILE_NAME}.json`)
    )
    this.store = new Store<IUserPreferences>({
      schema: runtimeSchema as unknown as Schema<IUserPreferences>,
      name: PREFERENCES_FILE_NAME,
      migrations: {
        '0.18.6': (store) => {
          if (store.get('startUpAction') === 'lastState') {
            store.set('startUpAction', 'openLastFolder')
          }
        },
        '0.20.0-dev.6': (store) => {
          store.set('sideBarVisibility', true)
          store.set('tabBarVisibility', true)
        },
        '0.20.0-dev.7': (store) => {
          store.set('sideBarVisibility', true)
          store.set('tabBarVisibility', true)
        }
      },
      beforeEachMigration: (_store, context) => {
        log.info(`Preferences migration: ${context.fromVersion} -> ${context.toVersion}`)
      }
    })

    this.init()
  }

  init = (): void => {
    // preference.json is application-static data. Import it into the main
    // bundle instead of blocking Electron's startup thread with readFileSync +
    // JSON.parse on every launch.
    const defaultSettings: Record<string, unknown> = {
      ...bundledDefaults
    }

    if (nativeTheme.shouldUseDarkColors) {
      defaultSettings.theme = 'dark'
    }

    if (!this.hasPreferencesFile) {
      this.store.set(defaultSettings)
    } else {
      const userSetting = this.getAll() as Record<string, unknown>
      const normalizedUserSetting = normalizeApplicationThemeSettings(userSetting)
      const themeWasNormalized = ['theme', 'lightModeTheme', 'darkModeTheme'].some(
        (key) => userSetting[key] !== normalizedUserSetting[key]
      )
      const requiresUpdate =
        !hasSameKeys(defaultSettings, normalizedUserSetting) || themeWasNormalized

      if (requiresUpdate) {
        const normalizedSettings: Record<string, unknown> = {}
        for (const key of Object.keys(defaultSettings)) {
          normalizedSettings[key] = Object.prototype.hasOwnProperty.call(normalizedUserSetting, key)
            ? normalizedUserSetting[key]
            : defaultSettings[key]
        }
        this.store.store = normalizedSettings as IUserPreferences
      }
    }

    this._listenForIpcMain()
  }

  getAll(): IUserPreferences {
    return this.store.store as IUserPreferences
  }

  setItem(key: string, value: unknown): void {
    const normalizedValue = ['theme', 'lightModeTheme', 'darkModeTheme'].includes(key)
      ? normalizeApplicationTheme(value)
      : value
    this.store.set(key, normalizedValue)
    ipcMain.emit('broadcast-preferences-changed', { [key]: normalizedValue })
  }

  getItem<T = unknown>(key: string): T {
    return this.store.get(key) as T
  }

  setItems(settings: Record<string, unknown> | null | undefined): void {
    const result = this.setItemsAcknowledged(settings)
    if (!result.ok) {
      log.error(`Cannot change settings: ${result.error}`)
    }
  }

  setItemsAcknowledged(
    settings: Record<string, unknown> | null | undefined
  ): PreferenceMutationResult {
    if (!settings || Array.isArray(settings) || typeof settings !== 'object') {
      return { ok: false, error: 'Invalid preference payload' }
    }

    const normalizedSettings = normalizeApplicationThemeSettings(settings)
    const autoSaveDelay = normalizedSettings.autoSaveDelay
    if (
      autoSaveDelay !== undefined &&
      (typeof autoSaveDelay !== 'number' || !Number.isFinite(autoSaveDelay) || autoSaveDelay < 1000 || autoSaveDelay > 10000)
    ) {
      return { ok: false, error: 'Auto save delay must be between 1000 and 10000 ms' }
    }

    try {
      this.store.set(normalizedSettings)
      ipcMain.emit('broadcast-preferences-changed', normalizedSettings)
      return { ok: true, applied: normalizedSettings as PreferencePatch }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Preference could not be saved'
      log.error('Failed to persist preferences', error)
      return { ok: false, error: message }
    }
  }

  getPreferredEol(): 'lf' | 'crlf' {
    const endOfLine = this.getItem<string>('endOfLine')
    if (endOfLine === 'lf') {
      return 'lf'
    }
    return endOfLine === 'crlf' || isWindows ? 'crlf' : 'lf'
  }

  exportJSON(): void {
    // todo
  }

  importJSON(): void {
    // todo
  }

  _listenForIpcMain(): void {
    ipcMain.on('mt::ask-for-user-preference', (e) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      if (win) {
        win.webContents.send('mt::user-preference', this.getAll())
      }
    })
    ipcMain.on('mt::set-user-preference', (_e, settings: Record<string, unknown>) => {
      this.setItems(settings)
    })
    ipcMain.handle('mt::preferences::set', (_e, settings: PreferencePatch) => {
      return this.setItemsAcknowledged(settings)
    })
    ipcMain.on('mt::cmd-toggle-autosave', () => {
      this.setItem('autoSave', !this.getItem('autoSave'))
    })

    onInternalChannel('set-user-preference', (settings: Record<string, unknown>) => {
      this.setItems(settings)
    })
  }
}

export default Preference
