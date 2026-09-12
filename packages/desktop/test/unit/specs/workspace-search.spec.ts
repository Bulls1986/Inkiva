import { describe, expect, it } from 'vitest'
import { fuzzySearchPaths, SearchPathIndex } from '@/node/workspaceSearch'

describe('workspace search primitives', () => {
  it('fuzzy-matches path segments and ranks the direct match before a longer path', async() => {
    const direct = '/workspace/nested-guide.md'
    const nested = '/workspace/notes/nested-guide.md'
    const result = await fuzzySearchPaths(
      ['/workspace/unrelated.md', nested, direct, '/workspace/guide.md'],
      'ntgd',
      { rootPath: '/workspace', chunkSize: 1 }
    )

    expect(result).toEqual([direct, nested])
  })

  it('keeps the cached path index unique and supports incremental changes', () => {
    const index = new SearchPathIndex()
    index.replace(['/workspace/a.md', '/workspace/b.md', '/workspace/a.md'])
    index.add(['/workspace/c.md', '/workspace/b.md'])

    expect(index.values()).toEqual([
      '/workspace/a.md',
      '/workspace/b.md',
      '/workspace/c.md'
    ])

    index.remove(['/workspace/b.md'])
    expect(index.values()).toEqual(['/workspace/a.md', '/workspace/c.md'])

    index.clear()
    expect(index.values()).toEqual([])
  })

  it('searches in asynchronous chunks and cancels stale work', async() => {
    const pending = fuzzySearchPaths(
      Array.from({ length: 2000 }, (_, index) => '/workspace/file-' + index + '.md'),
      'file',
      { chunkSize: 1 }
    )

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        pending.cancel()
        resolve()
      }, 1)
    })

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('applies a deterministic result limit without reading file contents', async() => {
    const result = await fuzzySearchPaths(
      ['/workspace/alpha.md', '/workspace/alpha-guide.md', '/workspace/alpha-notes.md'],
      'alpha',
      { limit: 2, chunkSize: 2 }
    )

    expect(result).toHaveLength(2)
    expect(result).toEqual(['/workspace/alpha.md', '/workspace/alpha-guide.md'])
  })
})
