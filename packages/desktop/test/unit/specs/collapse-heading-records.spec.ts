import { describe, expect, it } from 'vitest'
import { buildHeadingRecords, type HeadingStateLike } from '@/services/collapseRestore'

const heading = (key: string, level: number, collapsed = false): HeadingStateLike => ({
  key,
  level,
  collapsed
})

describe('buildHeadingRecords', () => {
  it('records heading text and the ancestor text chain', () => {
    const records = buildHeadingRecords(
      [heading('guide', 1, true), heading('step', 2), heading('detail', 3)],
      ['Guide', 'Step', 'Detail']
    )

    expect(records).toEqual([
      { key: 'guide', level: 1, text: 'Guide', collapsed: true, ancestors: [] },
      { key: 'step', level: 2, text: 'Step', collapsed: false, ancestors: ['Guide'] },
      { key: 'detail', level: 3, text: 'Detail', collapsed: false, ancestors: ['Guide', 'Step'] }
    ])
  })

  it('pops finished ancestors when the level rises', () => {
    const records = buildHeadingRecords(
      [heading('a', 1), heading('b', 2), heading('c', 2), heading('d', 1)],
      ['A', 'B', 'C', 'D']
    )
    expect(records.map((item) => item.ancestors)).toEqual([[], ['A'], ['A'], []])
  })

  it('keeps duplicate texts distinguishable through their ancestors', () => {
    const records = buildHeadingRecords(
      [heading('guide-a', 1), heading('notes', 2), heading('guide-b', 1), heading('notes-1', 2)],
      ['Guide A', 'Notes', 'Guide B', 'Notes']
    )
    expect(records.map((item) => item.ancestors)).toEqual([[], ['Guide A'], [], ['Guide B']])
  })
})
