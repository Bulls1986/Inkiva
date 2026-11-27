import { describe, expect, it, vi } from 'vitest'
import {
  CollapseStateStore,
  type CollapseStateRecord
} from '../../../src/main/documentState/collapseStateStore'

// F5/F6: collapse state is stored per document, keyed by a platform file
// identity (device + inode), never by path alone. Anything uncertain must fall
// back to "everything expanded" instead of guessing.

const record: CollapseStateRecord = {
  version: 1,
  identity: 'dev1:ino1',
  headings: [{ key: 'chapter', level: 2, ancestors: [] }],
  updatedAt: 1
}

const createStore = (options: {
  fs?: Record<string, unknown>
  identity?: (path: string) => Promise<string | null>
} = {}) => {
  const files = new Map<string, string>()
  const writeFile = vi.fn(async(filePath: string, text: string) => {
    files.set(filePath, text)
  })
  const readFile = vi.fn(async(filePath: string) => {
    const value = files.get(filePath)
    if (value === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    return value
  })
  const store = new CollapseStateStore({
    filePath: '/userData/collapse-state.json',
    readFile,
    writeFile,
    identity: options.identity ?? (async() => 'dev1:ino1'),
    now: () => 100
  })
  return { store, files, writeFile, readFile }
}

describe('CollapseStateStore identity', () => {
  it('keys records by file identity, not by path', async() => {
    const { store } = createStore()
    await store.save('/docs/a.md', {
      headings: [{ key: 'chapter', level: 2, ancestors: [] }]
    })

    // The same file moved elsewhere still resolves through its identity.
    const loaded = await store.load('/moved/b.md')
    expect(loaded?.headings).toHaveLength(1)
  })

  it('returns nothing when the current file has a different identity', async() => {
    let identity = 'dev1:ino1'
    const { store } = createStore({ identity: async() => identity })
    await store.save('/docs/a.md', { headings: [{ key: 'chapter', level: 2, ancestors: [] }] })

    // Same path, different file (replaced on disk).
    identity = 'dev1:ino2'
    expect(await store.load('/docs/a.md')).toBeNull()
  })

  it('does not fall back to the path when identity is unavailable', async() => {
    let identity: string | null = 'dev1:ino1'
    const { store } = createStore({ identity: async() => identity })
    await store.save('/docs/a.md', { headings: [{ key: 'chapter', level: 2, ancestors: [] }] })

    identity = null
    expect(await store.load('/docs/a.md')).toBeNull()
  })
})

describe('CollapseStateStore persistence', () => {
  it('writes atomically through a temp file and renames into place', async() => {
    const { store, writeFile } = createStore()
    await store.save('/docs/a.md', { headings: [] })
    expect(writeFile).toHaveBeenCalled()
    expect(String(writeFile.mock.calls[0]![0])).toContain('collapse-state.json')
  })

  it('treats a corrupt store as empty and keeps the document usable', async() => {
    const { store, files } = createStore()
    files.set('/userData/collapse-state.json', '{not json')
    await expect(store.load('/docs/a.md')).resolves.toBeNull()

    await store.save('/docs/a.md', { headings: [{ key: 'a', level: 1, ancestors: [] }] })
    expect(await store.load('/docs/a.md')).not.toBeNull()
  })

  it('keeps records for other documents independent', async() => {
    const identities: Record<string, string> = { '/a.md': 'dev1:inoA', '/b.md': 'dev1:inoB' }
    const { store } = createStore({ identity: async(path) => identities[path] ?? null })

    await store.save('/a.md', { headings: [{ key: 'a', level: 1, ancestors: [] }] })
    await store.save('/b.md', { headings: [{ key: 'b', level: 1, ancestors: [] }] })

    expect((await store.load('/a.md'))?.headings[0]?.key).toBe('a')
    expect((await store.load('/b.md'))?.headings[0]?.key).toBe('b')
  })

  it('serializes concurrent writes so the last one wins without corruption', async() => {
    const { store, files } = createStore()
    await Promise.all([
      store.save('/docs/a.md', { headings: [{ key: 'a', level: 1, ancestors: [] }] }),
      store.save('/docs/a.md', { headings: [{ key: 'b', level: 1, ancestors: [] }] })
    ])
    const raw = files.get('/userData/collapse-state.json')!
    expect(() => JSON.parse(raw)).not.toThrow()
  })

  it('drops the record when asked (document closed without state)', async() => {
    const { store } = createStore()
    await store.save('/docs/a.md', { headings: [{ key: 'a', level: 1, ancestors: [] }] })
    await store.clear('/docs/a.md')
    expect(await store.load('/docs/a.md')).toBeNull()
  })
})
