import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => {
  const sendBufferedState = vi.fn(() => Promise.resolve(true))
  const w = globalThis as unknown as { window?: Record<string, unknown> }
  w.window ??= {}
  Object.assign(w.window, {
    path: { sep: '/', dirname: (value: string) => value.replace(/\/[^/]+$/, '') },
    fileUtils: { isSamePathSync: (a: string, b: string) => a === b },
    electron: {
      clipboard: { writeText: () => {} },
      ipcRenderer: { send: vi.fn(), on: vi.fn(), invoke: vi.fn() }
    }
  })
  return { sendBufferedState }
})

vi.mock('@/store/bufferedState', () => ({
  debouncedSendBufferedState: vi.fn(),
  sendBufferedState: mocks.sendBufferedState
}))

import { useEditorStore } from '@/store/editor'

const tab = (id: string, markdown: string, pathname = '') => ({
  id,
  filename: pathname ? pathname.split('/').pop() : 'Untitled-1',
  pathname,
  markdown,
  isSaved: !!pathname,
  encoding: { encoding: 'utf8', isBom: false },
  lineEnding: 'lf',
  trimTrailingNewline: 3,
  adjustLineEndingOnSave: false,
  cursor: null,
  wordCount: { paragraph: 1, word: 2, character: markdown.length, all: markdown.length },
  muyaIndexCursor: null,
  scrollTop: 0,
  protectedAt: 1_790_000_000_000
})

describe('US03 untitled crash recovery', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('keeps multiple untitled drafts as distinct ordered recovery candidates instead of opening them immediately', () => {
    const store = useEditorStore()
    store.RESTORE_BUFFERED_STATE({
      tabs: [tab('draft-a', '# Alpha'), tab('saved', '# Saved', '/docs/saved.md'), tab('draft-b', '# Beta')],
      currentFileId: 'draft-b',
      pinnedPathnames: [],
      restoreWarnings: []
    })

    expect(store.tabs.map((item) => item.pathname)).toEqual(['/docs/saved.md'])
    expect(store.pendingUntitledRecoveries.map((item) => item.markdown)).toEqual(['# Alpha', '# Beta'])
    expect(store.pendingUntitledRecoveries.map((item) => item.originalIndex)).toEqual([0, 2])
  })

  it('moves one recovery candidate into a new unsaved tab and removes it from future pending recovery snapshots', async() => {
    const store = useEditorStore()
    store.RESTORE_BUFFERED_STATE({
      tabs: [tab('draft-a', '# Alpha'), tab('draft-b', '# Beta')],
      currentFileId: 'draft-a',
      pinnedPathnames: [],
      restoreWarnings: []
    })

    const recoveredId = await store.RESTORE_UNTITLED_RECOVERY('draft-a')

    expect(recoveredId).toBeTruthy()
    expect(store.currentFile?.markdown).toBe('# Alpha')
    expect(store.currentFile?.pathname).toBe('')
    expect(store.pendingUntitledRecoveries.map((item) => item.id)).toEqual(['draft-b'])

    const snapshot = store.CREATE_BUFFERED_STATE()
    expect(snapshot?.tabs.filter((item) => item.markdown === '# Alpha')).toHaveLength(1)
    expect(snapshot?.tabs.filter((item) => item.markdown === '# Beta')).toHaveLength(1)
    expect(mocks.sendBufferedState).toHaveBeenCalledTimes(1)
  })
})
