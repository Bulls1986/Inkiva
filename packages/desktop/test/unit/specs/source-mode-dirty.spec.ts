import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.hoisted(() => {
  const w = globalThis as unknown as {
    window?: {
      path?: { sep: string; dirname: (p: string) => string }
      electron?: {
        clipboard: { writeText: (s: string) => void }
        ipcRenderer: { send: (...a: unknown[]) => void; on: (...a: unknown[]) => void }
      }
    }
  }
  w.window ??= {}
  w.window.path ??= { sep: '/', dirname: (p: string) => p }
  w.window.electron ??= {
    clipboard: { writeText: () => {} },
    ipcRenderer: { send: () => {}, on: () => {} }
  }
})

vi.mock('@/services/notification', () => ({
  default: { notify: vi.fn(), name: 'notify' }
}))

import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'

// #4455: editing in Source Code mode and closing without switching back to
// WYSIWYG silently dropped the save prompt. Source-mode content changes reach
// LISTEN_FOR_CONTENT_CHANGE WITHOUT an editor `history`, and the history-based
// dirty check never flips `isSaved` (it can even reset it to true), so the
// close path saw nothing unsaved. Decide dirty state from the content instead.
describe('useEditorStore LISTEN_FOR_CONTENT_CHANGE — source-mode dirty tracking (#4455)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const makeSavedTab = (store: ReturnType<typeof useEditorStore>) => {
    const tab = {
      id: 'tab-1',
      filename: 'a.md',
      pathname: '/x/a.md',
      markdown: 'hello',
      trimTrailingNewline: 0,
      isSaved: true,
      lastSavedHistoryId: 7,
      history: { stack: [{ id: 7 }], lastEditIndex: 0, lastInitIndex: -1 },
      wordCount: { paragraph: 1, word: 1, character: 5, all: 5 }
    }
    store.tabs = [tab] as unknown as typeof store.tabs
    store.tabIdToIndex = { 'tab-1': 0 }
    return tab
  }

  it('marks the tab unsaved when source-mode content changes (no history in payload)', () => {
    const store = useEditorStore()
    const tab = makeSavedTab(store)

    store.LISTEN_FOR_CONTENT_CHANGE({ id: 'tab-1', markdown: 'hello world' })

    expect(tab.isSaved).toBe(false)
  })

  it('keeps the tab saved when source-mode fires with unchanged content (caret move)', () => {
    const store = useEditorStore()
    const tab = makeSavedTab(store)

    store.LISTEN_FOR_CONTENT_CHANGE({ id: 'tab-1', markdown: 'hello' })

    expect(tab.isSaved).toBe(true)
  })

  it('leaves the WYSIWYG history-based path unchanged (history present, edit matches saved id)', () => {
    const store = useEditorStore()
    const tab = makeSavedTab(store)

    store.LISTEN_FOR_CONTENT_CHANGE({
      id: 'tab-1',
      markdown: 'hello world',
      history: { stack: [{ id: 7 }], lastEditIndex: 0, lastInitIndex: -1 } as never
    })

    expect(tab.isSaved).toBe(true)
  })

  it('does not turn the source word-count commit into a second dirty revision', () => {
    vi.useFakeTimers()
    const store = useEditorStore()
    const preferences = usePreferencesStore()
    preferences.autoSave = true
    preferences.autoSaveDelay = 20
    const tab = makeSavedTab(store)
    const autoSaveSpy = vi.spyOn(store, 'HANDLE_AUTO_SAVE')

    // This is the payload emitted by sourceCode.vue's CodeMirror `change`
    // handler: the mutation boundary allocates the revision and queues the
    // current markdown immediately.
    const revision = store.MARK_CONTENT_DIRTY(tab.id)
    store.LISTEN_FOR_CONTENT_CHANGE({
      id: tab.id,
      markdown: 'hello world',
      revision
    })

    // This is the debounced whole-text word-count callback. It is metadata
    // only: it must not allocate a revision or requeue the same content.
    store.LISTEN_FOR_CONTENT_CHANGE({
      id: tab.id,
      markdown: 'hello world',
      wordCount: { paragraph: 1, word: 2, character: 11, all: 11 }
    })

    expect(autoSaveSpy).toHaveBeenCalledTimes(1)
    expect(autoSaveSpy.mock.calls[0]?.[0]).toMatchObject({ revision })
    expect(tab.wordCount).toEqual({ paragraph: 1, word: 2, character: 11, all: 11 })

    // Cancel the still-debounced request through the same close path used by
    // the store. The assertion above is the guard: the word-count timer did
    // not create a second request or revision.
    store.FORCE_CLOSE_TAB(tab as unknown as Parameters<typeof store.FORCE_CLOSE_TAB>[0])
  })

  it('cancels delayed autosave work when tabs are bulk-closed', () => {
    vi.useFakeTimers()
    const store = useEditorStore()
    const preferences = usePreferencesStore()
    preferences.autoSaveDelay = 1000
    const tab = makeSavedTab(store)
    const sendSpy = vi.spyOn(window.electron.ipcRenderer, 'send')

    store.HANDLE_AUTO_SAVE({
      id: tab.id,
      revision: 1,
      filename: tab.filename,
      pathname: tab.pathname,
      markdown: 'pending autosave',
      options: {
        encoding: { encoding: 'utf8', isBom: false },
        lineEnding: 'lf',
        adjustLineEndingOnSave: false,
        trimTrailingNewline: 0
      }
    })
    store.CLOSE_TABS([tab.id])

    vi.advanceTimersByTime(1000)

    expect(
      sendSpy.mock.calls.filter(([channel]) => channel === 'mt::response-file-save')
    ).toHaveLength(0)
  })

  it('queues an undo-to-clean snapshot while an older autosave is pending', () => {
    const store = useEditorStore()
    const preferences = usePreferencesStore()
    preferences.autoSave = true
    preferences.autoSaveDelay = 1000
    const tab = makeSavedTab(store)
    const autoSaveSpy = vi.spyOn(store, 'HANDLE_AUTO_SAVE')
    const dirtyRevision = store.MARK_CONTENT_DIRTY(tab.id)
    store.LISTEN_FOR_CONTENT_CHANGE({
      id: tab.id,
      markdown: 'edited',
      revision: dirtyRevision
    })

    const cleanRevision = store.MARK_CONTENT_DIRTY(tab.id)
    store.LISTEN_FOR_CONTENT_CHANGE({
      id: tab.id,
      markdown: 'hello',
      revision: cleanRevision,
      history: { stack: [{ id: 7 }], index: 0, lastEditIndex: 0, lastInitIndex: -1 }
    })

    expect(dirtyRevision).toBeLessThan(cleanRevision)
    expect(autoSaveSpy).toHaveBeenCalledTimes(2)
    expect(autoSaveSpy.mock.calls[1]?.[0]).toMatchObject({
      revision: cleanRevision,
      markdown: 'hello'
    })
    expect(tab.isSaved).toBe(true)
    store.FORCE_CLOSE_TAB(tab as unknown as Parameters<typeof store.FORCE_CLOSE_TAB>[0])
  })
})
