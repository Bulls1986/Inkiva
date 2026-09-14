import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  MAX_RECENT_DOCUMENTS,
  RECENT_DOCUMENTS_STORAGE_KEY,
  limitRecentDocuments,
  normalizeRecentDocuments,
  sortRecentDocuments,
  useRecentDocumentsStore
} from '@/store/recentDocuments'

describe('Recent Documents renderer store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: {
        process: { platform: 'linux' },
        paths: {},
        ipcRenderer: { send: vi.fn() }
      }
    })
  })

  it('normalizes legacy paths and sorts pinned documents ahead of recency', () => {
    const entries = normalizeRecentDocuments([
      '/notes/old.md',
      {
        pathname: '/notes/pinned.md',
        kind: 'file',
        pinned: true,
        lastOpenedAt: 1
      },
      { pathname: '/notes/new.md', kind: 'file', pinned: false, lastOpenedAt: 3 },
      { pathname: '', kind: 'file', pinned: false, lastOpenedAt: 99 }
    ])

    expect(sortRecentDocuments(entries).map((entry) => entry.pathname)).toEqual([
      '/notes/pinned.md',
      '/notes/old.md',
      '/notes/new.md'
    ])
  })

  it('retains pinned entries when the recent list reaches its cap', () => {
    const entries = Array.from({ length: MAX_RECENT_DOCUMENTS + 2 }, (_, index) => ({
      pathname: `/notes/${index}.md`,
      kind: 'file' as const,
      pinned: index === 0 || index === 1,
      lastOpenedAt: index
    }))

    const limited = limitRecentDocuments(entries)

    expect(limited).toHaveLength(MAX_RECENT_DOCUMENTS)
    expect(limited.slice(0, 2).map((entry) => entry.pathname)).toEqual([
      '/notes/1.md',
      '/notes/0.md'
    ])
    expect(limited).toContainEqual(expect.objectContaining({ pathname: '/notes/11.md' }))
    expect(limited).not.toContainEqual(expect.objectContaining({ pathname: '/notes/2.md' }))
  })

  it('supports file and folder entries with pin, remove, clear, and persistence actions', () => {
    const store = useRecentDocumentsStore()

    store.RECORD_FILE('/notes/first.md')
    store.RECORD_FOLDER('/notes')
    store.TOGGLE_PIN('/notes/first.md')

    expect(store.items.map((entry) => entry.pathname)).toEqual(['/notes/first.md', '/notes'])
    expect(store.items[0]).toMatchObject({ kind: 'file', pinned: true })

    store.REMOVE('/notes/first.md')
    expect(store.items.map((entry) => entry.pathname)).toEqual(['/notes'])
    expect(JSON.parse(localStorage.getItem(RECENT_DOCUMENTS_STORAGE_KEY) || '[]')).toEqual(store.items)

    store.CLEAR()
    expect(store.items).toEqual([])
    expect(localStorage.getItem(RECENT_DOCUMENTS_STORAGE_KEY)).toBe('[]')
  })
})
