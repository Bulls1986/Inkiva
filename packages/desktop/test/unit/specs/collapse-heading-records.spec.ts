import { describe, expect, it } from 'vitest'
import { buildHeadingRecords, type HeadingStateLike } from '@/services/collapseRestore'

// The stored record must be derived from the same state Muya reports, so its key
// is identical across sessions. Ancestors come from document order and levels.

const heading = (key: string, level: number, collapsed = false): HeadingStateLike => ({
  key,
  level,
  collapsed
})

describe('buildHeadingRecords', () => {
  it('records each heading with its ancestor key chain', () => {
    const records = buildHeadingRecords([
      heading('guide', 1, true),
      heading('step', 2),
      heading('detail', 3)
    ])

    expect(records).toEqual([
      { key: 'guide', level: 1, collapsed: true, ancestors: [] },
      { key: 'step', level: 2, collapsed: false, ancestors: ['guide'] },
      { key: 'detail', level: 3, collapsed: false, ancestors: ['guide', 'step'] }
    ])
  })

  it('pops finished ancestors when the level rises', () => {
    const records = buildHeadingRecords([
      heading('a', 1),
      heading('b', 2),
      heading('c', 2),
      heading('d', 1)
    ])

    expect(records.map((item) => item.ancestors)).toEqual([[], ['a'], ['a'], []])
  })

  it('treats same-level headings as siblings', () => {
    const records = buildHeadingRecords([heading('x', 2), heading('y', 2)])
    expect(records[1]!.ancestors).toEqual([])
  })

  it('keeps duplicate keys distinguishable through their ancestors', () => {
    const records = buildHeadingRecords([
      heading('guide-a', 1),
      heading('notes', 2),
      heading('guide-b', 1),
      heading('notes', 2)
    ])

    expect(records.map((item) => item.ancestors)).toEqual([[], ['guide-a'], [], ['guide-b']])
  })
})
