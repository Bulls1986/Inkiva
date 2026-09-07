import fs from 'fs'
import path from 'path'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import schema from './schema.json'
import Store, { type Schema } from 'electron-store'
import log from 'electron-log'
import { ensureDirSync } from 'common/filesystem'
import { IMAGE_EXTENSIONS } from 'common/filesystem/paths'
import { TypedEmitter } from '@shared/types/typedEmitter'
import { getDefaultPicgoAppPath } from '../ipc/picgoApp'

const DATA_CENTER_NAME = 'dataCenter'

type KeytarApi = (typeof import('keytar'))['default']
let keytarPromise: Promise<KeytarApi> | null = null

const loadKeytar = async(): Promise<KeytarApi> => {
  if (!keytarPromise) {
    keytarPromise = import('keytar').then((mod) => mod.default)
  }
  return keytarPromise
}

// No events emitted directly on `this`. ipcMain.emit is used for cross-
// process broadcasts but those don't fire through this instance.
type DataCenterEvents = Record<string, unknown[]>

interface DataCenterPaths {
  dataCenterPath: string
  userDataPath: string
}

class DataCenter extends TypedEmitter<DataCenterEvents> {
  dataCenterPath: string
  userDataPath: string
  serviceName: string
  encryptKeys: string[]
  private _store: Store<Record<string, unknown>> | null

  constructor(paths: DataCenterPaths) {
    super()

    const { dataCenterPath, userDataPath } = paths
    this.dataCenterPath = dataCenterPath
    this.userDataPath = userDataPath
    this.serviceName = 'marktext'
    this.encryptKeys = []
    this._store = null

    // IPC must exist as soon as Accessor is constructed. The electron-store
    // instance and its migration/directory I/O are deferred until one of these
    // handlers (or another DataCenter consumer) actually touches persisted data.
    this._listenForIpcMain()
  }

  private _ensureStore(): Store<Record<string, unknown>> {
    if (this._store) {
      return this._store
    }

    const hasDataCenterFile = fs.existsSync(
      path.join(this.dataCenterPath, `./${DATA_CENTER_NAME}.json`)
    )
    const store = new Store<Record<string, unknown>>({
      schema: schema as Schema<Record<string, unknown>>,
      name: DATA_CENTER_NAME
    })

    const defaultData = {
      imageFolderPath: path.join(this.userDataPath, 'images'),
      screenshotFolderPath: path.join(this.userDataPath, 'screenshot'),
      webImages: [],
      cloudImages: [],
      currentUploader: 'picgo',
      picgoAppPath: getDefaultPicgoAppPath()
    }

    if (!hasDataCenterFile) {
      store.set(defaultData)
      ensureDirSync(store.get('screenshotFolderPath') as string)
    } else {
      // Migrate legacy uploader values that no longer exist.
      const stored = store.get('currentUploader') as string | undefined
      if (stored === 'none' || stored === 'github') {
        store.set('currentUploader', 'picgo')
      }

      // Keep existing data-center files compatible with the PicGo App
      // uploader introduced after the original uploader settings.
      if (typeof store.get('picgoAppPath') !== 'string') {
        store.set('picgoAppPath', getDefaultPicgoAppPath())
      }
    }

    this._store = store
    return store
  }

  async getAll(): Promise<Record<string, unknown>> {
    const { serviceName, encryptKeys } = this
    const data = this._ensureStore().store

    // Inkiva currently has no encrypted DataCenter keys. Avoid loading keytar
    // (a native keychain module) unless encrypted data is actually introduced.
    if (encryptKeys.length === 0) {
      return data
    }

    try {
      const keytar = await loadKeytar()
      const encryptData = await Promise.all(
        encryptKeys.map((key) => keytar.getPassword(serviceName, key))
      )
      const encryptObj = encryptKeys.reduce<Record<string, string | null>>((acc, k, i) => {
        return {
          ...acc,
          [k]: encryptData[i]
        }
      }, {})

      return Object.assign(data, encryptObj)
    } catch (err) {
      log.error('Failed to decrypt secure keys:', err)
      return data
    }
  }

  addImage(key: string, url: string): void {
    const store = this._ensureStore()
    const items = (store.get(key) as Array<{ url: string; timeStamp: number }> | undefined) ?? []
    const alreadyHas = items.some((item) => item.url === url)
    let item
    if (alreadyHas) {
      item = items.find((it) => it.url === url)
      if (item) item.timeStamp = +new Date()
    } else {
      item = { url, timeStamp: +new Date() }
      items.push(item)
    }

    ipcMain.emit('broadcast-web-image-added', { type: key, item })
    store.set(key, items)
  }

  removeImage(type: string, url: string): unknown {
    const store = this._ensureStore()
    const items = (store.get(type) as unknown[] | undefined) ?? []
    const index = items.indexOf(url)
    if (index === -1) return
    const item = items[index]
    items.splice(index, 1)
    ipcMain.emit('broadcast-web-image-removed', { type, item })
    return store.set(type, items)
  }

  async getItem(key: string): Promise<unknown> {
    const { encryptKeys, serviceName } = this
    if (encryptKeys.includes(key)) {
      const keytar = await loadKeytar()
      return keytar.getPassword(serviceName, key)
    }
    return this._ensureStore().get(key)
  }

  async setItem(key: string, value: unknown): Promise<void> {
    const { encryptKeys, serviceName } = this
    if (key === 'screenshotFolderPath') {
      ensureDirSync(value as string)
    }
    ipcMain.emit('broadcast-user-data-changed', { [key]: value })
    if (encryptKeys.includes(key)) {
      try {
        const keytar = await loadKeytar()
        await keytar.setPassword(serviceName, key, value as string)
        return
      } catch (err) {
        log.error('Keytar error:', err)
        return
      }
    }
    this._ensureStore().set(key, value)
  }

  /**
   * Change multiple setting entries.
   */
  setItems(settings: Record<string, unknown>): void {
    if (!settings) {
      log.error('Cannot change settings without entires: object is undefined or null.')
      return
    }

    // There are currently no encrypted keys, so keep normal multi-key updates
    // in one electron-store write. Fall back to setItem if encrypted settings
    // are introduced later.
    if (this.encryptKeys.length === 0) {
      const store = this._ensureStore()
      const nextState = { ...store.store, ...settings }
      if (typeof settings.screenshotFolderPath === 'string') {
        ensureDirSync(settings.screenshotFolderPath)
      }
      ipcMain.emit('broadcast-user-data-changed', settings)
      store.store = nextState
      return
    }

    for (const key of Object.keys(settings)) {
      void this.setItem(key, settings[key])
    }
  }

  _listenForIpcMain(): void {
    ipcMain.on('set-image-folder-path', (_event, newPath: string) => {
      void this.setItem('imageFolderPath', newPath)
    })

    ipcMain.on('mt::ask-for-user-data', async(e) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      if (!win) return
      const userData = await this.getAll()
      win.webContents.send('mt::user-preference', userData)
    })

    ipcMain.on('mt::ask-for-modify-image-folder-path', async(e, imagePath?: string) => {
      if (!imagePath) {
        const win = BrowserWindow.fromWebContents(e.sender)
        if (!win) return
        const { filePaths } = await dialog.showOpenDialog(win, {
          properties: ['openDirectory', 'createDirectory']
        })
        if (filePaths && filePaths[0]) {
          imagePath = filePaths[0]
        }
      }
      if (imagePath) {
        void this.setItem('imageFolderPath', imagePath)
      }
    })

    ipcMain.on('mt::set-user-data', (_e, userData: Record<string, unknown>) => {
      this.setItems(userData)
    })

    ipcMain.handle('mt::ask-for-image-path', async(e) => {
      const win = BrowserWindow.fromWebContents(e.sender)
      if (!win) return ''
      const { filePaths } = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [
          {
            name: 'Images',
            extensions: [...IMAGE_EXTENSIONS]
          }
        ]
      })

      return filePaths?.[0] ?? ''
    })
  }
}

export default DataCenter
