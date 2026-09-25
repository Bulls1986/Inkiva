import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import type { IFileState } from '@shared/types/files'
import type { LocalHistoryEntry, MarkdownBacklink } from '@shared/types/documentIntelligence'
import { useEditorStore } from '@/store/editor'
import { useDocumentIntelligenceStore } from '@/store/documentIntelligence'

vi.mock('@/store/editor', async() => {
  const { defineStore } = await import('pinia')
  return {
    useEditorStore: defineStore('editor', {
      state: (): { tabs: IFileState[], currentFile: IFileState | null } => ({
        tabs: [],
        currentFile: null
      })
    })
  }
})

vi.mock('@/services/performance/runtime', () => ({
  rendererPerformance: {
    recordSample: vi.fn()
  }
}))

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

const deferred = <T>(): Deferred<T> => {
  let settle!: (value: T) => void
  const promise = new Promise<T>((resolve) => {
    settle = resolve
  })
  return { promise, resolve: settle }
}

const fileState = (): IFileState => ({
  id: 'doc-1',
  filename: 'note.md',
  pathname: '/docs/note.md',
  markdown: '# Note',
  isSaved: true,
  encoding: { encoding: 'utf8', isBom: false },
  lineEnding: 'lf',
  adjustLineEndingOnSave: false,
  trimTrailingNewline: 0,
  history: { stack: [], index: -1 },
  cursor: null,
  wordCount: { paragraph: 0, word: 0, character: 0, all: 0 },
  searchMatches: { index: -1, matches: [], value: '' },
  scrollTop: 0,
  muyaIndexCursor: null,
  notifications: []
})

describe('document intelligence store', () => {
  const originalApi = window.documentIntelligence
  const originalPath = window.path

  beforeEach(() => {
    setActivePinia(createPinia())
    Object.defineProperty(window, 'path', {
      configurable: true,
      value: { sep: '/' }
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'documentIntelligence', {
      configurable: true,
      value: originalApi
    })
    Object.defineProperty(window, 'path', {
      configurable: true,
      value: originalPath
    })
  })

  it('transitions from loading to current backlinks and history', async() => {
    const backlinks = deferred<MarkdownBacklink[]>()
    const history = deferred<LocalHistoryEntry[]>()
    const api = {
      indexDocument: vi.fn(async() => undefined),
      removeDocument: vi.fn(async() => undefined),
      getBacklinks: vi.fn(() => backlinks.promise),
      createSnapshot: vi.fn(),
      listSnapshots: vi.fn(() => history.promise),
      restoreSnapshot: vi.fn()
    }
    Object.defineProperty(window, 'documentIntelligence', {
      configurable: true,
      value: api
    })

    const editorStore = useEditorStore()
    const intelligenceStore = useDocumentIntelligenceStore()
    intelligenceStore.START()

    const current = fileState()
    editorStore.$patch((state) => {
      state.tabs = [current]
      state.currentFile = current
    })
    await nextTick()

    expect(intelligenceStore).toMatchObject({
      currentDocumentId: current.id,
      currentPath: current.pathname,
      loading: true,
      backlinks: [],
      history: []
    })

    const backlink: MarkdownBacklink = {
      sourcePath: '/docs/source.md',
      label: 'Note',
      destination: 'note.md',
      fragment: '',
      line: 3,
      start: 10,
      end: 20
    }
    const entry: LocalHistoryEntry = {
      id: 'snapshot-1',
      filePath: current.pathname,
      createdAt: 1,
      reason: 'manual',
      size: 6
    }
    backlinks.resolve([backlink])
    history.resolve([entry])

    await vi.waitFor(() => expect(intelligenceStore.loading).toBe(false))
    expect(intelligenceStore.backlinks).toEqual([backlink])
    expect(intelligenceStore.history).toEqual([entry])
    expect(intelligenceStore.canRestore).toBe(true)

    intelligenceStore.STOP()
  })
})
