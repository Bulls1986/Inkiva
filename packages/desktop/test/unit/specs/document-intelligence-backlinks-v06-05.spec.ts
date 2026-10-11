import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { MarkdownLinkIndex } from 'main_renderer/documentIntelligence/markdownLinkIndex'
import type { MarkdownBacklink } from '@shared/types/documentIntelligence'

type PositionedBacklink = MarkdownBacklink & { column?: number }

describe('V06-05 backlink source occurrence', () => {
  it('reports the exact UTF-16 source column for separate links on one line and CRLF lines', () => {
    const workspace = path.resolve('/virtual/v06-backlinks')
    const source = path.join(workspace, 'notes', 'draft.md')
    const target = path.join(workspace, 'notes', 'target.md')
    const markdown = [
      '说明 [First](./target.md)；[Second](./target.md)',
      '😀 [Third](./target.md)'
    ].join('\r\n')
    const index = new MarkdownLinkIndex()

    index.updateDocument(source, markdown)
    const results = index.getBacklinks(target) as PositionedBacklink[]

    const expected = ['[First]', '[Second]', '[Third]'].map((marker) => {
      const start = markdown.indexOf(marker)
      return {
        line: markdown.slice(0, start).split('\n').length,
        column: start - (markdown.lastIndexOf('\n', start - 1) + 1)
      }
    })
    expect(results).toHaveLength(3)
    expect(results.map(({ line, column }) => ({ line, column }))).toEqual(expected)
    expect(results.map(({ start, end }) => markdown.slice(start, end))).toEqual([
      '[First](./target.md)',
      '[Second](./target.md)',
      '[Third](./target.md)'
    ])
  })

  it('reconciles dirty-tab edits and removal without retaining duplicate or stale occurrences', () => {
    const workspace = path.resolve('/virtual/v06-backlinks')
    const source = path.join(workspace, 'notes', 'draft.md')
    const target = path.join(workspace, 'notes', 'target.md')
    const index = new MarkdownLinkIndex()

    index.updateDocument(source, '[Old](./target.md)')
    index.updateDocument(source, '草稿 [New](./target.md) and [Again](./target.md)')
    expect(index.getBacklinks(target).map(({ label }) => label)).toEqual(['New', 'Again'])
    index.removeDocument(source)
    expect(index.getBacklinks(target)).toEqual([])
    index.updateDocument(source, '[Saved](./target.md)')
    expect(index.getBacklinks(target).map(({ label }) => label)).toEqual(['Saved'])
  })
})
