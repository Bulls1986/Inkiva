import { describe, expect, it, vi } from 'vitest'
import {
  DocumentRevisionSnapshotCache,
  type SnapshotLifecycle
} from '@/services/documentRevisionSnapshot'

const createCache = (
  options: {
    maxCost?: number
    perfCapture?: boolean
  } = {}
) =>
  new DocumentRevisionSnapshotCache({
    maxCost: options.maxCost ?? 10_000,
    perfCapture: options.perfCapture ?? false
  })

describe('DocumentRevisionSnapshotCache', () => {
  it('allocates monotonic content revisions independently per document', () => {
    const cache = createCache()

    expect(cache.currentRevision('a')).toBe(0)
    expect(cache.advanceContentRevision('a')).toBe(1)
    expect(cache.advanceContentRevision('a')).toBe(2)
    expect(cache.advanceContentRevision('b')).toBe(1)
    expect(cache.currentRevision('a')).toBe(2)
    expect(cache.currentRevision('b')).toBe(1)
  })

  it('reuses markdown, word count, blocks and history metadata within one revision', () => {
    const cache = createCache()
    const revision = cache.advanceContentRevision('doc')
    const markdownFactory = vi.fn(() => '# cached\n')
    const wordCountFactory = vi.fn(() => ({ characters: 8, words: 1, paragraphs: 1 }))
    const blocksFactory = vi.fn(() => [{ name: 'paragraph', text: 'cached' }])
    const historyFactory = vi.fn(() => ({ id: 7 }))

    expect(cache.getMarkdown('doc', revision, markdownFactory)).toBe('# cached\n')
    expect(cache.getMarkdown('doc', revision, markdownFactory)).toBe('# cached\n')
    expect(cache.getWordCount('doc', revision, wordCountFactory)).toEqual({
      characters: 8,
      words: 1,
      paragraphs: 1
    })
    expect(cache.getWordCount('doc', revision, wordCountFactory)).toEqual({
      characters: 8,
      words: 1,
      paragraphs: 1
    })
    expect(cache.getBlocks('doc', revision, blocksFactory)).toEqual([
      { name: 'paragraph', text: 'cached' }
    ])
    expect(cache.getBlocks('doc', revision, blocksFactory)).toEqual([
      { name: 'paragraph', text: 'cached' }
    ])
    expect(cache.getHistoryMeta('doc', revision, historyFactory)).toEqual({ id: 7 })
    expect(cache.getHistoryMeta('doc', revision, historyFactory)).toEqual({ id: 7 })

    expect(markdownFactory).toHaveBeenCalledTimes(1)
    expect(wordCountFactory).toHaveBeenCalledTimes(1)
    expect(blocksFactory).toHaveBeenCalledTimes(1)
    expect(historyFactory).toHaveBeenCalledTimes(1)
  })

  it('invalidates every derived value when content revision advances', () => {
    const cache = createCache()
    const rev1 = cache.advanceContentRevision('doc')
    const first = vi.fn(() => 'one')
    const second = vi.fn(() => 'two')

    expect(cache.getMarkdown('doc', rev1, first)).toBe('one')
    const rev2 = cache.advanceContentRevision('doc')
    expect(rev2).toBe(rev1 + 1)
    expect(cache.getMarkdown('doc', rev2, second)).toBe('two')
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('does not advance content revision for presentation-only updates', () => {
    const cache = createCache()
    const revision = cache.advanceContentRevision('doc')
    cache.touchPresentation('doc')
    cache.touchPresentation('doc')
    expect(cache.currentRevision('doc')).toBe(revision)
  })

  it('protects cached blocks from caller mutation', () => {
    const cache = createCache()
    const revision = cache.advanceContentRevision('doc')
    const blocks = cache.getBlocks('doc', revision, () => [
      { name: 'paragraph', meta: { level: 1 }, text: 'stable' }
    ]) as Array<{ name: string; meta: { level: number }; text: string }>

    expect(Object.isFrozen(blocks)).toBe(true)
    expect(Object.isFrozen(blocks[0])).toBe(true)
    expect(Object.isFrozen(blocks[0]?.meta)).toBe(true)
    expect(() => {
      const firstBlock = blocks[0]
      if (!firstBlock) throw new Error('expected cached block')
      firstBlock.text = 'mutated'
    }).toThrow()
    expect(cache.getBlocks('doc', revision, () => [])).toEqual([
      { name: 'paragraph', meta: { level: 1 }, text: 'stable' }
    ])
  })

  it.each<SnapshotLifecycle>(['active', 'warm', 'cold'])(
    'tracks %s lifecycle without changing content revision',
    (lifecycle) => {
      const cache = createCache()
      const revision = cache.advanceContentRevision('doc')
      cache.setLifecycle('doc', lifecycle)
      expect(cache.currentRevision('doc')).toBe(revision)
      expect(cache.inspect('doc')?.lifecycle).toBe(lifecycle)
    }
  )

  it('drops high-cost blocks when a document becomes cold', () => {
    const cache = createCache()
    const revision = cache.advanceContentRevision('doc')
    cache.getMarkdown('doc', revision, () => 'keep markdown')
    cache.getBlocks('doc', revision, () => [{ name: 'paragraph', text: 'drop blocks' }])

    cache.setLifecycle('doc', 'cold')

    expect(cache.inspect('doc')?.hasMarkdown).toBe(true)
    expect(cache.inspect('doc')?.hasBlocks).toBe(false)
  })

  it('evicts by estimated size budget rather than entry count', () => {
    const cache = createCache({ maxCost: 12 })
    const revA = cache.advanceContentRevision('a')
    const revB = cache.advanceContentRevision('b')
    cache.setLifecycle('a', 'warm')
    cache.setLifecycle('b', 'warm')

    cache.getMarkdown('a', revA, () => '12345678')
    cache.getMarkdown('b', revB, () => 'abcdefgh')

    expect(cache.estimatedCost()).toBeLessThanOrEqual(12)
    expect(cache.inspect('a')?.hasMarkdown && cache.inspect('b')?.hasMarkdown).toBe(false)
  })

  it('bounds 8x100K warm/cold tab cache cost and releases closed tabs', () => {
    const cache = new DocumentRevisionSnapshotCache({ maxCost: 350_000 })
    const live = new Set<string>()

    for (let index = 0; index < 8; index += 1) {
      const id = `tab-${index}`
      live.add(id)
      const revision = cache.advanceContentRevision(id)
      cache.setLifecycle(id, index === 7 ? 'active' : index >= 5 ? 'warm' : 'cold')
      cache.getMarkdown(id, revision, () => 'm'.repeat(100_000))
      cache.getBlocks(id, revision, () => [{ name: 'paragraph', text: 'x' }], 100_000)
    }

    // Active state is never forcibly evicted; warm/cold derived data is kept
    // within the global byte/character budget and cold block trees are absent.
    expect(cache.estimatedCost()).toBeLessThanOrEqual(400_000)
    for (let index = 0; index < 5; index += 1) {
      expect(cache.inspect(`tab-${index}`)?.hasBlocks).toBe(false)
    }

    live.delete('tab-0')
    live.delete('tab-1')
    cache.prune(live)
    expect(cache.inspect('tab-0')).toBeNull()
    expect(cache.inspect('tab-1')).toBeNull()
  })

  it('drops stale async results that finish after a newer revision', async() => {
    const cache = createCache()
    const rev1 = cache.advanceContentRevision('doc')
    let resolveOld!: (value: string) => void
    const oldResult = new Promise<string>((resolve) => {
      resolveOld = resolve
    })
    const pending = cache.getMarkdownAsync('doc', rev1, () => oldResult)

    const rev2 = cache.advanceContentRevision('doc')
    expect(cache.getMarkdown('doc', rev2, () => 'new')).toBe('new')
    resolveOld('old')

    await expect(pending).resolves.toBe('old')
    expect(cache.getMarkdown('doc', rev2, () => 'should-not-run')).toBe('new')
    expect(cache.inspect('doc')?.revision).toBe(rev2)
  })

  it('coalesces concurrent consumers for the same document revision', async() => {
    const cache = createCache()
    const revision = cache.advanceContentRevision('doc')
    const factory = vi.fn(async() => {
      await Promise.resolve()
      return '# one computation\n'
    })

    const [save, autosave, exportResult] = await Promise.all([
      cache.getMarkdownAsync('doc', revision, factory),
      cache.getMarkdownAsync('doc', revision, factory),
      cache.getMarkdownAsync('doc', revision, factory)
    ])

    expect(save).toBe('# one computation\n')
    expect(autosave).toBe(save)
    expect(exportResult).toBe(save)
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('serializes each derived view once across save/autosave/switch/export/close consumers', () => {
    const cache = createCache()
    const revision = cache.advanceContentRevision('doc')
    const serializeMarkdown = vi.fn(() => '# shared revision\n')
    const countWords = vi.fn(() => ({ paragraph: 1, word: 2, character: 15, all: 15 }))
    const cloneBlocks = vi.fn(() => [{ name: 'paragraph', text: 'shared revision' }])

    const consumers = ['save', 'autosave', 'tab-switch', 'export', 'close']
    for (const consumer of consumers) {
      expect(cache.getMarkdown('doc', revision, serializeMarkdown), consumer).toBe(
        '# shared revision\n'
      )
      expect(cache.getWordCount('doc', revision, countWords), consumer).toEqual({
        paragraph: 1,
        word: 2,
        character: 15,
        all: 15
      })
      expect(cache.getBlocks('doc', revision, cloneBlocks), consumer).toEqual([
        { name: 'paragraph', text: 'shared revision' }
      ])
    }

    expect(serializeMarkdown).toHaveBeenCalledTimes(1)
    expect(countWords).toHaveBeenCalledTimes(1)
    expect(cloneBlocks).toHaveBeenCalledTimes(1)
  })

  it('records hit/miss/invalidation metrics only when perf capture is enabled', () => {
    const off = createCache({ perfCapture: false })
    const offRevision = off.advanceContentRevision('off')
    off.getMarkdown('off', offRevision, () => 'x')
    off.getMarkdown('off', offRevision, () => 'x')
    expect(off.metrics()).toBeNull()

    const on = createCache({ perfCapture: true })
    const revision = on.advanceContentRevision('on')
    on.getMarkdown('on', revision, () => 'x')
    on.getMarkdown('on', revision, () => 'x')
    on.advanceContentRevision('on')

    expect(on.metrics()).toMatchObject({
      markdown: { hits: 1, misses: 1 },
      invalidations: 1
    })
  })

  it('releases all state for a closed document', () => {
    const cache = createCache()
    const revision = cache.advanceContentRevision('doc')
    cache.getMarkdown('doc', revision, () => 'x')
    cache.release('doc')
    expect(cache.inspect('doc')).toBeNull()
    expect(cache.currentRevision('doc')).toBe(0)
  })
})
