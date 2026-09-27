import type * as FileSystemModule from '@/util/fileSystem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({
  rename: vi.fn<(...args: [string, string]) => Promise<void>>(),
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
      ipcRenderer: { send: () => {}, on: () => {} }
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
  return { ...actual, rename: mocks.rename }
})

import { useProjectStore } from '@/store/project'

describe('sidebar rename identity continuity', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mocks.rename.mockResolvedValue(undefined)
    mocks.moveHistoryPath.mockResolvedValue(1)
    Object.assign(window, {
      documentIntelligence: {
        moveHistoryPath: mocks.moveHistoryPath
      }
    })
  })

  it('migrates editor, recent and history identity only after filesystem success', async() => {
    const store = useProjectStore()
    store.renameCache = '/docs/a.md'

    store.RENAME_IN_SIDEBAR('b.md')

    await vi.waitFor(() => {
      expect(mocks.rename).toHaveBeenCalledWith('/docs/a.md', '/docs/b.md')
      expect(mocks.editorRename).toHaveBeenCalledWith({
        src: '/docs/a.md',
        dest: '/docs/b.md',
        pathKind: 'file'
      })
    })
    expect(mocks.recentMove).toHaveBeenCalledWith({
      src: '/docs/a.md',
      dest: '/docs/b.md',
      pathKind: 'file'
    })
    expect(mocks.repairMovedReferences).toHaveBeenCalledWith({
      src: '/docs/a.md',
      dest: '/docs/b.md',
      pathKind: 'file'
    })
    expect(mocks.moveHistoryPath).toHaveBeenCalledWith({
      fromPath: '/docs/a.md',
      toPath: '/docs/b.md',
      pathKind: 'file'
    })
  })

  it('surfaces filesystem failure and leaves all identity metadata untouched', async() => {
    const store = useProjectStore()
    mocks.rename.mockRejectedValueOnce(new Error('permission denied'))
    store.renameCache = '/docs/a.md'

    store.RENAME_IN_SIDEBAR('b.md')

    await vi.waitFor(() => {
      expect(mocks.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Rename failed',
          type: 'error',
          message: 'permission denied'
        })
      )
    })
    expect(mocks.editorRename).not.toHaveBeenCalled()
    expect(mocks.recentMove).not.toHaveBeenCalled()
    expect(mocks.repairMovedReferences).not.toHaveBeenCalled()
    expect(mocks.moveHistoryPath).not.toHaveBeenCalled()
  })
})
