import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.hoisted(() => {
  const w = globalThis as unknown as { window?: Record<string, unknown> }
  w.window ??= {}
  Object.assign(w.window, {
    path: {
      sep: '/',
      basename: (value: string) => value.replaceAll('\\', '/').split('/').at(-1) ?? '',
      dirname: (value: string) => {
        const normalized = value.replaceAll('\\', '/')
        return normalized.slice(0, Math.max(0, normalized.lastIndexOf('/'))) || '/'
      },
      join: (...parts: string[]) => parts.join('/').replace(/\/+/g, '/'),
      relative: (from: string, to: string) =>
        to.startsWith(from.endsWith('/') ? from : from + '/')
          ? to.slice((from.endsWith('/') ? from : from + '/').length)
          : '../outside',
      isAbsolute: (value: string) => value.startsWith('/')
    },
    fileUtils: {
      isSamePathSync: (left: string, right: string) => left === right,
      isChildOfDirectory: (root: string, candidate: string) =>
        candidate.startsWith(root.endsWith('/') ? root : root + '/')
    },
    electron: {
      process: { platform: 'linux', env: {} },
      paths: {},
      ipcRenderer: { send: () => {}, on: () => {} }
    }
  })
})

vi.mock('@/services/notification', () => ({
  default: { notify: vi.fn(), name: 'notify' }
}))
vi.mock('@/store/bufferedState', () => ({
  debouncedSendBufferedState: vi.fn(),
  sendBufferedState: vi.fn()
}))

import { useEditorStore } from '@/store/editor'
import { useRecentDocumentsStore } from '@/store/recentDocuments'
import { usePreferencesStore } from '@/store/preferences'
import notice from '@/services/notification'

describe('file identity continuity', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    Object.assign(window, {
      DIRNAME: '',
      path: {
        basename: (value: string) => value.replaceAll('\\', '/').split('/').at(-1) ?? '',
        dirname: (value: string) => {
          const normalized = value.replaceAll('\\', '/')
          return normalized.slice(0, Math.max(0, normalized.lastIndexOf('/'))) || '/'
        },
        join: (...parts: string[]) => parts.join('/').replace(/\/+/g, '/'),
        relative: (from: string, to: string) =>
          to.startsWith(from.endsWith('/') ? from : from + '/')
            ? to.slice((from.endsWith('/') ? from : from + '/').length)
            : '../outside',
        isAbsolute: (value: string) => value.startsWith('/')
      },
      fileUtils: {
        isSamePathSync: (left: string, right: string) => left === right,
        isChildOfDirectory: (root: string, candidate: string) =>
          candidate.startsWith(root.endsWith('/') ? root : root + '/')
      },
      electron: {
        process: { platform: 'linux', env: {} },
        paths: {},
        ipcRenderer: { send: vi.fn(), on: vi.fn() }
      }
    })
  })

  it('moves descendant tabs in place while preserving dirty draft and reading state', () => {
    const store = useEditorStore()
    const history = { stack: [{ id: 1, markdown: 'dirty' }], lastEditIndex: 0 }
    const tab = {
      id: 'tab-1',
      filename: 'draft.md',
      pathname: '/workspace/notes/draft.md',
      markdown: 'dirty draft',
      isSaved: false,
      scrollTop: 240,
      cursor: { line: 8 },
      history
    }
    store.tabs = [tab] as unknown as typeof store.tabs
    store.currentFile = store.tabs[0] ?? null
    store.tabIdToIndex = { 'tab-1': 0 }

    const sameTab = store.currentFile
    const sameHistory = store.currentFile?.history
    ;(store.RENAME_IF_NEEDED as unknown as (input: {
      src: string
      dest: string
      pathKind: 'file' | 'directory'
    }) => void)({
      src: '/workspace/notes',
      dest: '/workspace/archive/notes',
      pathKind: 'directory'
    })

    expect(store.currentFile).toBe(sameTab)
    expect(store.currentFile).toMatchObject({
      id: 'tab-1',
      pathname: '/workspace/archive/notes/draft.md',
      filename: 'draft.md',
      markdown: 'dirty draft',
      isSaved: false,
      scrollTop: 240,
      cursor: { line: 8 }
    })
    expect(store.currentFile?.history).toBe(sameHistory)
    expect(window.DIRNAME).toBe('/workspace/archive/notes')
  })

  it('treats set-pathname identity moves as path changes, not save acknowledgements', async() => {
    const store = useEditorStore()
    const recentStore = useRecentDocumentsStore()
    const tab = {
      id: 'tab-1',
      filename: 'draft.md',
      pathname: '/workspace/notes/draft.md',
      markdown: 'dirty draft',
      isSaved: false,
      history: { stack: [], lastEditIndex: -1 }
    }
    store.tabs = [tab] as unknown as typeof store.tabs
    store.currentFile = store.tabs[0] ?? null
    store.tabIdToIndex = { 'tab-1': 0 }
    recentStore.items = [{
      pathname: '/workspace/notes/draft.md',
      kind: 'file',
      pinned: true,
      lastOpenedAt: 42
    }]
    const moveHistoryPath = vi.fn().mockResolvedValue(1)
    const prepareRenameRepair = vi.fn().mockResolvedValue({
      fromPath: '/workspace/notes/draft.md',
      toPath: '/workspace/archive/draft.md',
      changes: [],
      affectedFiles: [],
      linkCount: 0
    })
    Object.assign(window, {
      documentIntelligence: { moveHistoryPath, prepareRenameRepair }
    })
    const on = window.electron.ipcRenderer.on as unknown as ReturnType<typeof vi.fn>
    on.mockReset()

    store.LISTEN_FOR_SET_PATHNAME()
    const call = on.mock.calls.find((entry) => entry[0] === 'mt::set-pathname')
    expect(call).toBeTruthy()
    const handler = call?.[1] as (_event: unknown, fileInfo: unknown) => void
    const sameTab = store.currentFile

    handler(null, {
      id: 'tab-1',
      pathname: '/workspace/archive/draft.md',
      filename: 'draft.md',
      identityMove: {
        fromPath: '/workspace/notes/draft.md',
        pathKind: 'file'
      }
    })
    await Promise.resolve()

    expect(store.currentFile).toBe(sameTab)
    expect(store.currentFile).toMatchObject({
      pathname: '/workspace/archive/draft.md',
      markdown: 'dirty draft',
      isSaved: false
    })
    expect(recentStore.items).toEqual([
      {
        pathname: '/workspace/archive/draft.md',
        kind: 'file',
        pinned: true,
        lastOpenedAt: 42
      }
    ])
    expect(moveHistoryPath).toHaveBeenCalledWith({
      fromPath: '/workspace/notes/draft.md',
      toPath: '/workspace/archive/draft.md',
      pathKind: 'file'
    })
  })

  it('recalculates the moved document own relative references as a dirty revision', async() => {
    const store = useEditorStore()
    usePreferencesStore().autoSave = false
    const before = '[Guide](./guide.md)\n![Diagram](./images/diagram.png)'
    const after = '[Guide](../notes/guide.md)\n![Diagram](../notes/images/diagram.png)'
    const tab = {
      id: 'tab-1',
      filename: 'draft.md',
      pathname: '/workspace/notes/draft.md',
      markdown: before,
      isSaved: true,
      history: { stack: [], lastEditIndex: -1 },
      lastSavedHistoryId: -1,
      scrollTop: 180,
      cursor: { line: 2 }
    }
    store.tabs = [tab] as unknown as typeof store.tabs
    store.currentFile = store.tabs[0] ?? null
    store.tabIdToIndex = { 'tab-1': 0 }

    const prepareRenameRepair = vi.fn().mockResolvedValue({
      fromPath: '/workspace/notes/draft.md',
      toPath: '/workspace/archive/draft.md',
      changes: [{
        sourcePath: '/workspace/notes/draft.md',
        sourcePathAfter: '/workspace/archive/draft.md',
        before,
        after,
        edits: [
          { start: 8, end: 18, replacement: '../notes/guide.md' },
          { start: 30, end: 50, replacement: '../notes/images/diagram.png' }
        ]
      }],
      affectedFiles: ['/workspace/notes/draft.md'],
      linkCount: 2
    })
    const getBacklinks = vi.fn().mockResolvedValue([{
      sourcePath: '/workspace/index.md',
      label: 'Draft',
      destination: './notes/draft.md',
      fragment: '',
      line: 3,
      start: 10,
      end: 35
    }])
    Object.assign(window, {
      documentIntelligence: {
        moveHistoryPath: vi.fn().mockResolvedValue(1),
        prepareRenameRepair,
        getBacklinks
      }
    })
    const on = window.electron.ipcRenderer.on as unknown as ReturnType<typeof vi.fn>
    on.mockReset()
    store.LISTEN_FOR_SET_PATHNAME()
    const call = on.mock.calls.find((entry) => entry[0] === 'mt::set-pathname')
    const handler = call?.[1] as (_event: unknown, fileInfo: unknown) => void

    handler(null, {
      id: 'tab-1',
      pathname: '/workspace/archive/draft.md',
      filename: 'draft.md',
      identityMove: {
        fromPath: '/workspace/notes/draft.md',
        pathKind: 'file'
      }
    })

    await vi.waitFor(() => {
      expect(store.currentFile?.markdown).toBe(after)
    })
    expect(store.currentFile).toMatchObject({
      pathname: '/workspace/archive/draft.md',
      isSaved: false,
      scrollTop: 180,
      cursor: { line: 2 }
    })
    expect(prepareRenameRepair).toHaveBeenCalledWith({
      fromPath: '/workspace/notes/draft.md',
      toPath: '/workspace/archive/draft.md',
      pathKind: 'file',
      includeResources: true,
      documents: [{ pathname: '/workspace/notes/draft.md', markdown: before }]
    })
    expect(notice.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Review inbound links',
        type: 'warning'
      })
    )
  })
})
