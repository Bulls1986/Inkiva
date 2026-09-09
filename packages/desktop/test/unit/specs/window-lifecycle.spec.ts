import { describe, expect, it, vi } from 'vitest'

const testDoubles = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void

  class FakeEventEmitter {
    private readonly listeners = new Map<string, Set<Listener>>()

    on(event: string, listener: Listener): this {
      const listeners = this.listeners.get(event) ?? new Set<Listener>()
      listeners.add(listener)
      this.listeners.set(event, listeners)
      return this
    }

    once(event: string, listener: Listener): this {
      const wrapped: Listener = (...args) => {
        this.removeListener(event, wrapped)
        listener(...args)
      }
      return this.on(event, wrapped)
    }

    removeListener(event: string, listener: Listener): this {
      this.listeners.get(event)?.delete(listener)
      return this
    }

    emit(event: string, ...args: unknown[]): boolean {
      const listeners = [...(this.listeners.get(event) ?? [])]
      for (const listener of listeners) listener(...args)
      return listeners.length > 0
    }
  }

  class FakeWebContents extends FakeEventEmitter {
    public readonly send = vi.fn()
    public readonly setIgnoreMenuShortcuts = vi.fn()
  }

  class FakeBrowserWindow extends FakeEventEmitter {
    private static nextId = 1
    private readonly rendererWebContents = new FakeWebContents()
    private destroyed = false

    public readonly id = FakeBrowserWindow.nextId++
    public readonly loadURL = vi.fn(async() => {})
    public readonly setSheetOffset = vi.fn()

    get webContents(): FakeWebContents {
      if (this.destroyed) throw new Error('Object has been destroyed')
      return this.rendererWebContents
    }

    isDestroyed(): boolean {
      return this.destroyed
    }

    isVisible(): boolean {
      return false
    }

    isMinimized(): boolean {
      return false
    }

    show(): void {}

    focus(): void {}

    moveTop(): void {}

    destroy(): void {
      this.destroyed = true
      this.rendererWebContents.emit('destroyed')
      this.emit('closed')
    }
  }

  return {
    FakeBrowserWindow,
    dialog: { showMessageBox: vi.fn() },
    ipcMain: new FakeEventEmitter(),
    screen: {
      getPrimaryDisplay: vi.fn(() => ({
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1080 }
      })),
      getAllDisplays: vi.fn(() => []),
      getCursorScreenPoint: vi.fn(() => ({ x: 0, y: 0 }))
    }
  }
})

vi.mock('electron', () => ({
  BrowserWindow: testDoubles.FakeBrowserWindow,
  dialog: testDoubles.dialog,
  ipcMain: testDoubles.ipcMain,
  screen: testDoubles.screen
}))
vi.mock('electron-log', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() }
}))
vi.mock('electron-window-state', () => ({
  default: vi.fn(() => ({
    x: 0,
    y: 0,
    width: 1200,
    height: 800,
    manage: vi.fn()
  }))
}))
vi.mock('common/filesystem/paths', () => ({
  isChildOfDirectory: vi.fn(() => false),
  isSamePathSync: vi.fn(() => false)
}))
vi.mock('main_renderer/contextMenu/editor', () => ({ showEditorContextMenu: vi.fn() }))
vi.mock('main_renderer/filesystem/markdown', () => ({ loadMarkdownFile: vi.fn() }))
vi.mock('main_renderer/spellchecker', () => ({ switchLanguage: vi.fn() }))

import EditorWindow from 'main_renderer/windows/editor'

const createAccessor = (): Record<string, unknown> => ({
  env: {
    debug: false,
    disableSpellcheck: false,
    paths: { userDataPath: '/tmp/inkiva-test' }
  },
  preferences: {
    getAll: () => ({
      codeFontFamily: '',
      codeFontSize: 14,
      hideScrollbar: false,
      restoreLayoutState: false,
      sideBarVisibility: true,
      sourceCodeModeEnabled: false,
      spellcheckerEnabled: false,
      tabBarVisibility: true,
      theme: 'default',
      titleBarStyle: 'default'
    }),
    getItem: vi.fn(),
    getPreferredEol: () => 'lf'
  },
  editorBufferStore: {
    getUnUsedBufferUUID: () => 'test-buffer'
  },
  menu: {
    addEditorMenu: vi.fn(),
    updateLineEndingMenu: vi.fn()
  }
})

describe('editor window lifecycle', () => {
  it('does not access BrowserWindow.webContents after a forced destroy', () => {
    const editor = new EditorWindow(createAccessor() as never)
    editor.createWindow()

    expect(() => editor.destroy()).not.toThrow()
  })
})
