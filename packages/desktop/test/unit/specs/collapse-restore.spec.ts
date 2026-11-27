import { describe, expect, it } from 'vitest'
import {
  resolveCollapseRestore,
  type CollapseHeadingRecord,
  type CurrentHeading
} from '@/services/collapseRestore'

// F6 identity is the heading text + level + ancestor texts, never the engine's
// occurrence-numbered key: inserting an identical heading shifts those keys.

const recorded = (
  text: string,
  level: number,
  collapsed: boolean,
  ancestors: string[] = []
): CollapseHeadingRecord => ({ key: text, level, text, collapsed, ancestors })

const current = (key: string, text: string, level: number, ancestors: string[] = []): CurrentHeading =>
  ({ key, text, level, ancestors })

describe('resolveCollapseRestore', () => {
  it('restores a collapsed heading that matches uniquely', () => {
    const result = resolveCollapseRestore([recorded('Chapter', 2, true)], [current('chapter', 'Chapter', 2)])
    expect(result.collapsedKeys).toEqual(['chapter'])
    expect(result.staleKeys).toEqual([])
  })

  it('keeps a recorded expanded heading expanded', () => {
    expect(resolveCollapseRestore([recorded('Chapter', 2, false)], [current('chapter', 'Chapter', 2)]).collapsedKeys)
      .toEqual([])
  })

  it('does not restore a same-name heading under a different parent', () => {
    const result = resolveCollapseRestore(
      [recorded('Intro', 2, true, ['Guide A'])],
      [current('intro', 'Intro', 2, ['Guide B'])]
    )
    expect(result.collapsedKeys).toEqual([])
    expect(result.staleKeys).toEqual(['Guide A/Intro'])
  })

  it('leaves duplicate headings expanded when the match is ambiguous', () => {
    const result = resolveCollapseRestore(
      [recorded('Notes', 2, true)],
      [current('notes', 'Notes', 2), current('notes-1', 'Notes', 2)]
    )
    expect(result.collapsedKeys).toEqual([])
    expect(result.staleKeys).toEqual(['Notes'])
  })

  it('does not restore a heading whose level changed', () => {
    expect(resolveCollapseRestore([recorded('Chapter', 2, true)], [current('chapter', 'Chapter', 3)]).collapsedKeys)
      .toEqual([])
  })

  it('restores unaffected headings and drops removed ones', () => {
    const result = resolveCollapseRestore(
      [recorded('Keep', 2, true), recorded('Gone', 2, true)],
      [current('keep', 'Keep', 2)]
    )
    expect(result.collapsedKeys).toEqual(['keep'])
    expect(result.staleKeys).toEqual(['Gone'])
  })

  it('restores nested headings with the ancestor text chain intact', () => {
    const result = resolveCollapseRestore(
      [recorded('Guide', 1, true), recorded('Step', 2, true, ['Guide'])],
      [current('guide', 'Guide', 1), current('step', 'Step', 2, ['Guide'])]
    )
    expect(result.collapsedKeys).toEqual(['guide', 'step'])
    expect(result.staleKeys).toEqual([])
  })

  it('follows the current key even when the engine renumbered it', () => {
    // Same text, same ancestors, same level: the key shifted because another
    // heading was inserted elsewhere, but this heading is still unique.
    const result = resolveCollapseRestore(
      [recorded('Notes', 2, true)],
      [current('other', 'Other', 2), current('notes-1', 'Notes', 2)]
    )
    expect(result.collapsedKeys).toEqual(['notes-1'])
  })

  it('never restores a record without heading text', () => {
    const legacy = { key: 'a', level: 1, collapsed: true, ancestors: [] } as unknown as CollapseHeadingRecord
    expect(resolveCollapseRestore([legacy], [current('a', 'A', 1)])).toMatchObject({
      collapsedKeys: [],
      staleKeys: ['a'],
      canPrune: false
    })
  })
})
