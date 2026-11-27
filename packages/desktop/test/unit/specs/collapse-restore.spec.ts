import { describe, expect, it } from 'vitest'
import {
  resolveCollapseRestore,
  type CollapseHeadingRecord,
  type CurrentHeading
} from '@/services/collapseRestore'

// F6: after a confirmed identity, headings are matched by key + level + ancestor
// chain. Anything that is not a unique match stays expanded, and stale records
// are reported so they can be pruned instead of being reused by a later heading
// with the same name.

const recorded = (
  key: string,
  level: number,
  collapsed: boolean,
  ancestors: string[] = []
): CollapseHeadingRecord => ({ key, level, collapsed, ancestors })

const current = (
  key: string,
  level: number,
  ancestors: string[] = []
): CurrentHeading => ({ key, level, ancestors })

describe('resolveCollapseRestore', () => {
  it('restores a collapsed heading that matches uniquely', () => {
    const result = resolveCollapseRestore([recorded('chapter', 2, true)], [current('chapter', 2)])
    expect(result.collapsedKeys).toEqual(['chapter'])
    expect(result.staleKeys).toEqual([])
  })

  it('keeps a recorded expanded heading expanded', () => {
    const result = resolveCollapseRestore([recorded('chapter', 2, false)], [current('chapter', 2)])
    expect(result.collapsedKeys).toEqual([])
  })

  it('does not restore a same-name heading under a different parent', () => {
    const result = resolveCollapseRestore(
      [recorded('intro', 2, true, ['guide-a'])],
      [current('intro', 2, ['guide-b'])]
    )
    expect(result.collapsedKeys).toEqual([])
    expect(result.staleKeys).toEqual(['guide-a/intro'])
  })

  it('leaves duplicate headings expanded when the match is ambiguous', () => {
    const result = resolveCollapseRestore(
      [recorded('notes', 2, true)],
      [current('notes', 2), current('notes', 2)]
    )
    expect(result.collapsedKeys).toEqual([])
    expect(result.staleKeys).toEqual(['notes'])
  })

  it('does not restore a heading whose level changed', () => {
    const result = resolveCollapseRestore([recorded('chapter', 2, true)], [current('chapter', 3)])
    expect(result.collapsedKeys).toEqual([])
  })

  it('restores the unaffected headings and drops records for removed ones', () => {
    const result = resolveCollapseRestore(
      [recorded('keep', 2, true), recorded('gone', 2, true)],
      [current('keep', 2)]
    )
    expect(result.collapsedKeys).toEqual(['keep'])
    expect(result.staleKeys).toEqual(['gone'])
  })

  it('restores nested headings with their ancestor chain intact', () => {
    const result = resolveCollapseRestore(
      [recorded('guide', 1, true), recorded('step', 2, true, ['guide'])],
      [current('guide', 1), current('step', 2, ['guide'])]
    )
    expect(result.collapsedKeys).toEqual(['guide', 'step'])
    expect(result.staleKeys).toEqual([])
  })

  it('treats a recorded state for an empty document as nothing to restore', () => {
    expect(resolveCollapseRestore([recorded('a', 1, true)], [])).toEqual({
      collapsedKeys: [],
      staleKeys: ['a']
    })
  })
})
