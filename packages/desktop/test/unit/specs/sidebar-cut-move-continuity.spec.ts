import type * as FileSystemModule from '@/util/fileSystem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({
  paste: vi.fn<(...args: unknown[]) => Promise<void>>(),
  editorRename: vi.fn(),
  repairMovedReferences: vi.fn().mockResolvedValue(0),
  recentMove: vi.fn(),
  moveHistoryPath: vi.fn<(...args: unknown[]) => Promise<number>>(),
  notify: vi.fn()
}))

vi.hoisted(() => {
  const w = globalThis as unknown as { window?: Record<string, unknown> }
  w.window ??= {}
  Object.assign(w.window, {
    path: {
      sep: '/',
      normalize: (value: string) => value,
      basename: (value: string) => value.split('/').at(-1) ?? value,
      dirname: (value: string) =>
        value.slice(0, Math.max(0, value.lastIndexOf('/'))) || '/'
    },
    fileUtils: {
      hasMarkdownExtension: (name: string) => name.endsWith('.md'),
      pathExists: () => Promise.resolve(false)
    },
    electron: {
      process: { platform: 'linux', env: {} },
      shell: { showItemInFolder: vi.fn() },
      ipcRenderer: {
        send: vi.fn(),
        on: vi.fn(),
        invoke: vi.fn()
      }
    }
  })
})

vi.mock('@/services/notification', () => ({
  default: { notify: mocks.notify, name: 'notify' }
}))

vi.mock('@/store/editor', () => ({
  useEditorStore: () => ({
    RENAME_IF_NEEDED: mocks.editorRename,
    REPAIR_MOVED_REFERENCES: mocks.repairMovedReferences,
    SET_SAVE_STATUS_WHEN_REMOVE: vi.fn(),
    UPDATE_CURRENT_FILE: vi.fn()
  })
}))

vi.mock('@/store/recentDocuments', () => ({
  useRecentDocumentsStore: () => ({
    RECORD_FOLDER: vi.fn(),
    MOVE_PATH: mocks.recentMove
  })
}))

vi.mock('@/util/fileSystem', async(orig) => {
  const actual = await orig<typeof FileSystemModule>()
  return { ...actual, paste: mocks.paste }
})

import bus from '@/bus'
import { useProjectStore } from '@/store/project'

describe('sidebar cut/paste move continuity', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    bus.all.clear()
    mocks.paste.mockResolvedValue(undefined)
    mocks.moveHistoryPath.mockResolvedValue(1)
    Object.assign(window, {
      documentIntelligence: {
        moveHistoryPath: mocks.moveHistoryPath
      }
    })
  })

  it('carries directory identity through a successful cut/paste move', async() => {
    const store = useProjectStore()
    store.LISTEN_FOR_SIDEBAR_CONTEXT_MENU()
    store.activeItem = {
      pathname: '/workspace/notes',
      isDirectory: true,
      isFile: false
    }

    bus.emit('SIDEBAR::copy-cut', 'cut')
    store.activeItem = {
      pathname: '/archive',
      isDirectory: true,
      isFile: false
    }
    bus.emit('SIDEBAR::paste')

    await vi.waitFor(() => {
      expect(mocks.paste).toHaveBeenCalledWith({
        type: 'cut',
        src: '/workspace/notes',
        dest: '/archive/notes',
        pathKind: 'directory'
      })
    })
    expect(mocks.editorRename).toHaveBeenCalledWith({
      src: '/workspace/notes',
      dest: '/archive/notes',
      pathKind: 'directory'
    })
    expect(mocks.recentMove).toHaveBeenCalledWith({
      src: '/workspace/notes',
      dest: '/archive/notes',
      pathKind: 'directory'
    })
    expect(mocks.repairMovedReferences).toHaveBeenCalledWith({
      src: '/workspace/notes',
      dest: '/archive/notes',
      pathKind: 'directory'
    })
    expect(mocks.moveHistoryPath).toHaveBeenCalledWith({
      fromPath: '/workspace/notes',
      toPath: '/archive/notes',
      pathKind: 'directory'
    })
  })
})
