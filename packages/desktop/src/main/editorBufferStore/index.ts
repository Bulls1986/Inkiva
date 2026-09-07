import fs from 'fs'
import fsPromises from 'fs/promises'
import path from 'path'
import writeFileAtomic from 'write-file-atomic'
import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { TypedEmitter } from '@shared/types/typedEmitter'
import type BaseWindow from '../windows/base'

interface EditorBufferStorePaths {
  editorBufferStorePath: string
}

interface BufferStoreEntry {
  id: string
  filePath: string
}

interface BufferStoreContent {
  tabs: Array<{ isSaved: boolean; [key: string]: unknown }>
  [key: string]: unknown
}

interface EditorWindow {
  id: number
  win: BaseWindow
}

interface PendingWrite {
  running: boolean
  nextState: unknown | null
  waiters: Array<{ resolve: () => void; reject: (error: unknown) => void }>
}

// No instance-level events emitted; kept as TypedEmitter for parity with the
// other main classes.
type EditorBufferStoreEvents = Record<string, unknown[]>

class EditorBufferStore extends TypedEmitter<EditorBufferStoreEvents> {
  editorBufferStorePath: string
  bufferStores: Record<string, BufferStoreEntry> | null
  serviceName: string
  encryptKeys: string[]
  private _pendingWrites: Map<string, PendingWrite>

  constructor(paths: EditorBufferStorePaths) {
    super()

    const { editorBufferStorePath } = paths
    this.editorBufferStorePath = editorBufferStorePath
    // Object of paths to buffer stores. Buffer stores are NOT held in memory
    // for performance reasons — they are read from disk when needed and
    // written to disk when updated.
    this.bufferStores = null
    this.serviceName = 'marktext'
    this.encryptKeys = []
    this._pendingWrites = new Map()

    this.init()
  }

  init(): void {
    if (!fs.existsSync(this.editorBufferStorePath)) {
      fs.mkdirSync(this.editorBufferStorePath, { recursive: true })
    }
    this._listenForIpcMain()
  }

  getAll(): Record<string, BufferStoreEntry> {
    return this.getAllBufferStores()
  }

  getAllBufferStores(): Record<string, BufferStoreEntry> {
    if (!this.bufferStores) {
      this.bufferStores = this.findEditorBufferStores(this.editorBufferStorePath)
    }

    return this.bufferStores
  }

  clearBufferStoresWithAllSaved(): void {
    this.bufferStores = this.getAllBufferStores()

    for (const id in this.bufferStores) {
      try {
        const buffer = this.readBufferStoreFile(this.bufferStores[id].filePath)
        const allSaved = buffer.tabs.every((file) => file.isSaved)
        if (buffer.tabs.length === 0 || allSaved) {
          try {
            fs.unlinkSync(this.bufferStores[id].filePath)
          } catch (e) {
            console.error('Failed to delete buffer store file during clear', e)
          }
        }
      } catch (e) {
        console.error('Failed to read buffer store file during clear', e)
      }
    }
  }

  handleClose(restoreBufferId: string | undefined, editorWindows: EditorWindow[]): void {
    // If a recovery write is still in flight, keep the recovery file. Deleting
    // it while an async atomic write is pending can race the final state write;
    // retaining a fully-saved buffer is harmless and it will be cleaned later.
    if (!restoreBufferId) {
      console.warn('No restoreBufferId found for window, skipping buffer cleanup')
      return
    }

    const pending = this._pendingWrites.get(
      path.join(this.editorBufferStorePath, `${restoreBufferId}_editor_buffer_store.json`)
    )
    if (pending?.running || pending?.nextState !== null) {
      return
    }

    if (!this.bufferStores) {
      this.bufferStores = this.findEditorBufferStores(this.editorBufferStorePath)
    }

    if (!(restoreBufferId in this.bufferStores)) {
      console.warn('No buffer store found for restoreBufferId, skipping buffer cleanup')
      return
    }

    if (editorWindows.length > 1) {
      if (!fs.existsSync(this.bufferStores[restoreBufferId].filePath)) {
        return
      }
      try {
        const buffer = this.readBufferStoreFile(this.bufferStores[restoreBufferId].filePath)
        const allSaved = buffer.tabs.every((file) => file.isSaved)
        if (buffer.tabs.length === 0 || allSaved) {
          fs.unlinkSync(this.bufferStores[restoreBufferId].filePath)
          delete this.bufferStores[restoreBufferId]
        }
      } catch (e) {
        console.error('Failed to read or parse buffer store file during cleanup', e)
      }
    }
  }

  findEditorBufferStores(dir: string): Record<string, BufferStoreEntry> {
    const results: Record<string, BufferStoreEntry> = {}
    if (!fs.existsSync(dir)) {
      return results
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isFile() && entry.name.endsWith('_editor_buffer_store.json')) {
        const id = entry.name.replace('_editor_buffer_store.json', '')
        results[id] = { id, filePath: fullPath }
      }
    }

    return results
  }

  getBufferStoreInfo(restoreBufferId: string): BufferStoreEntry {
    if (!this.bufferStores) {
      // Do not scan the whole recovery directory on the normal new-window path.
      // A random UUID collision is practically impossible; populate the cache
      // lazily with the exact requested entry instead.
      this.bufferStores = {}
    }

    if (!this.bufferStores[restoreBufferId]) {
      this.bufferStores[restoreBufferId] = {
        id: restoreBufferId,
        filePath: path.join(
          this.editorBufferStorePath,
          `${restoreBufferId}_editor_buffer_store.json`
        )
      }
    }

    return this.bufferStores[restoreBufferId]
  }

  readBufferStoreFile(filePath: string): BufferStoreContent {
    const content = fs.readFileSync(filePath, 'utf8')
    return this._parseBufferStore(content)
  }

  async readBufferStoreFileAsync(filePath: string): Promise<BufferStoreContent> {
    const content = await fsPromises.readFile(filePath, 'utf8')
    return this._parseBufferStore(content)
  }

  private _parseBufferStore(content: string): BufferStoreContent {
    if (!content.trim()) {
      throw new Error('Buffer store file is empty.')
    }

    const buffer = JSON.parse(content) as BufferStoreContent
    if (!buffer || !Array.isArray(buffer.tabs)) {
      throw new Error('Invalid editor buffer state.')
    }

    return buffer
  }

  async writeBufferStoreFile(filePath: string, newState: unknown): Promise<void> {
    // Durable atomic write without blocking Electron's main thread. Calls for
    // the same recovery file are coalesced by _enqueueBufferWrite so typing can
    // never build an unbounded fsync queue.
    await writeFileAtomic(filePath, JSON.stringify(newState), { encoding: 'utf8' })
  }

  private _enqueueBufferWrite(filePath: string, newState: unknown): Promise<void> {
    let pending = this._pendingWrites.get(filePath)
    if (!pending) {
      pending = { running: false, nextState: null, waiters: [] }
      this._pendingWrites.set(filePath, pending)
    }

    pending.nextState = newState
    const result = new Promise<void>((resolve, reject) => {
      pending!.waiters.push({ resolve, reject })
    })

    if (!pending.running) {
      void this._drainBufferWrites(filePath, pending)
    }
    return result
  }

  private async _drainBufferWrites(filePath: string, pending: PendingWrite): Promise<void> {
    pending.running = true
    try {
      while (pending.nextState !== null) {
        const state = pending.nextState
        const waiters = pending.waiters.splice(0)
        pending.nextState = null

        try {
          await this.writeBufferStoreFile(filePath, state)
          waiters.forEach(({ resolve }) => resolve())
        } catch (error) {
          waiters.forEach(({ reject }) => reject(error))
        }
      }
    } finally {
      pending.running = false
      if (pending.nextState === null && pending.waiters.length === 0) {
        this._pendingWrites.delete(filePath)
      } else if (!pending.running) {
        void this._drainBufferWrites(filePath, pending)
      }
    }
  }

  async updateBufferState(e: IpcMainInvokeEvent, newState: unknown): Promise<boolean> {
    const win = BrowserWindow.fromWebContents(e.sender)
    const restoreBufferId = (win as unknown as { restoreBufferId?: string })?.restoreBufferId

    if (!restoreBufferId) {
      console.warn('No restoreBufferId found for window, skipping buffer state update')
      return false
    }

    const bufferStore = this.getBufferStoreInfo(restoreBufferId)
    await this._enqueueBufferWrite(bufferStore.filePath, newState)
    return true
  }

  getUnUsedBufferUUID(): string {
    // crypto.randomUUID() provides enough uniqueness that scanning every
    // recovery file before opening each new window only adds cold-start I/O.
    return crypto.randomUUID()
  }

  _listenForIpcMain(): void {
    ipcMain.handle('update-buffer-state', (e, newState) => {
      return this.updateBufferState(e, newState)
    })
  }
}

export default EditorBufferStore
