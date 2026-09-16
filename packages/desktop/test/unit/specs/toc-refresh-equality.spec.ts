import { beforeEach, describe, expect, it, vi } from 'vitest'
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

const equalSpy = vi.hoisted(() =>
  vi.fn((left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right))
)

vi.mock('deep-equal', () => ({ default: equalSpy }))
vi.mock('@/services/notification', () => ({
  default: { notify: vi.fn(), name: 'notify' }
}))

import { useEditorStore } from '@/store/editor'

describe('TOC refresh equality guard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    equalSpy.mockClear()
  })

  it('compares an incoming TOC only once before deciding to rebuild', () => {
    const store = useEditorStore()
    const tab = {
      id: 'tab-1',
      filename: 'a.md',
      pathname: '/x/a.md',
      markdown: 'old',
      trimTrailingNewline: 0,
      isSaved: true,
      lastSavedHistoryId: -1,
      history: { stack: [], lastEditIndex: -1, lastInitIndex: -1 },
      wordCount: { paragraph: 1, word: 1, character: 3, all: 3 }
    }
    const oldToc = [{ slug: 'uid-1', githubSlug: 'old', content: 'Old', lvl: 1 }]
    const nextToc = [{ slug: 'uid-1', githubSlug: 'new', content: 'New', lvl: 1 }]
    store.tabs = [tab] as unknown as typeof store.tabs
    store.tabIdToIndex = { 'tab-1': 0 }
    store.currentFile = tab as unknown as typeof store.currentFile
    store.listToc = oldToc
    equalSpy.mockClear()

    store.LISTEN_FOR_CONTENT_CHANGE({
      id: tab.id,
      markdown: 'new',
      toc: nextToc
    })

    expect(equalSpy).toHaveBeenCalledTimes(1)
    expect(store.listToc).toEqual(nextToc)
  })
})
