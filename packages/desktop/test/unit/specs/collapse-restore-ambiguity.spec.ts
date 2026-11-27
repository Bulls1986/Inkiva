import { describe, expect, it } from 'vitest'
import { resolveCollapseRestore, type CollapseHeadingRecord, type CurrentHeading } from '@/services/collapseRestore'

// D3 from the architecture diagnosis: uniqueness must hold on BOTH sides. An old
// snapshot with two identical headings cannot be resolved just because the
// current document happens to have one left.

const rec = (key: string, text: string, collapsed: boolean, ancestors: string[] = []): CollapseHeadingRecord =>
  ({ key, text, level: 2, collapsed, ancestors })

const cur = (key: string, text: string, ancestors: string[] = []): CurrentHeading =>
  ({ key, text, level: 2, ancestors })

describe('resolveCollapseRestore ambiguity across both sides', () => {
  it('does not restore when the old snapshot has two identical headings', () => {
    const result = resolveCollapseRestore(
      [rec('notes', 'Notes', true), rec('notes-1', 'Notes', false)],
      [cur('notes-1', 'Notes')]
    )

    expect(result.collapsedKeys).toEqual([])
    expect(result.canPrune).toBe(false)
  })

  it('does not restore when the current document has two identical headings', () => {
    const result = resolveCollapseRestore(
      [rec('notes', 'Notes', true)],
      [cur('notes', 'Notes'), cur('notes-1', 'Notes')]
    )

    expect(result.collapsedKeys).toEqual([])
    expect(result.canPrune).toBe(false)
  })

  it('restores when both sides are unique', () => {
    const result = resolveCollapseRestore([rec('notes', 'Notes', true)], [cur('notes', 'Notes')])

    expect(result.collapsedKeys).toEqual(['notes'])
    expect(result.canPrune).toBe(true)
  })

  it('keeps an ambiguous record on disk instead of pruning it', () => {
    const result = resolveCollapseRestore(
      [rec('a', 'Notes', true), rec('b', 'Notes', false)],
      [cur('a', 'Notes')]
    )
    expect(result.staleKeys).toEqual(['Notes', 'Notes'])
    expect(result.canPrune).toBe(false)
  })

  it('prefers basename match when both sides unique but cells match by key shift', () => {
    const result = resolveCollapseRestore([rec('notes', 'Notes', true)], [cur('other', 'Other'), cur('notes-1', 'Notes')])
    expect(result.collapsedKeys).toEqual(['notes-1'])
  })
})
