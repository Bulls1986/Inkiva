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

vi.mock('@/services/notification', () => ({
  default: { notify: vi.fn(), name: 'notify' }
}))

import { useEditorStore } from '@/store/editor'

describe('TOC refresh equality guard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('skips rebuilding when an incremental TOC snapshot is unchanged', () => {
    const store = useEditorStore()
    const first = [{ slug: 'uid-1', githubSlug: 'intro', content: 'Intro', lvl: 1 }]
    store.UPDATE_TOC(first)
    const previousList = store.listToc
    const previousTree = store.toc

    expect(store.UPDATE_TOC([{ ...first[0] }], false)).toBe(false)
    expect(store.listToc).toBe(previousList)
    expect(store.toc).toBe(previousTree)
  })

  it('rebuilds when a scalar TOC field changes', () => {
    const store = useEditorStore()
    store.UPDATE_TOC([{ slug: 'uid-1', githubSlug: 'old', content: 'Old', lvl: 1 }])

    expect(store.UPDATE_TOC([
      { slug: 'uid-1', githubSlug: 'new', content: 'New', lvl: 1 }
    ], false)).toBe(true)
    expect(store.listToc).toEqual([
      { slug: 'uid-1', githubSlug: 'new', content: 'New', lvl: 1 }
    ])
  })
})
