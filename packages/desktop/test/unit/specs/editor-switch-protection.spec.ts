import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isStaleEditorEvent } from '@/components/editorWithTabs/editorEventGuard'

const here = dirname(fileURLToPath(import.meta.url))
const editorPath = resolve(here, '../../../src/renderer/src/components/editorWithTabs/editor.vue')

const readEditor = (): string => readFileSync(editorPath, 'utf8')

describe('editor tab switch protection', () => {
  it.each([
    ['different active tab ids', 'tab-a', 'tab-b', true],
    ['same active tab id', 'tab-a', 'tab-a', false],
    ['missing event id', undefined, 'tab-a', false],
    ['missing active tab id', 'tab-a', undefined, false],
    ['both ids missing', undefined, undefined, false]
  ])('%s is classified correctly', (_caseName, eventId, activeId, expected) => {
    expect(isStaleEditorEvent(eventId, activeId)).toBe(expected)
  })

  it('guards both file lifecycle handlers before mutating the editor', () => {
    const source = readEditor()

    expect(source.match(/isStaleEditorEvent\(id, currentFile\.value\?\.id\)/g)).toHaveLength(2)
    expect(source).toContain('CONTENT_SWITCH_PROGRESSIVE_RENDER_START_DELAY_MS')
    expect(source).toContain('getSyntheticHistory(id, newMarkdown)')
    expect(source).toContain('if (id && !syntheticHistoryByTab.has(id))')
  })

  it('routes every editor Markdown serialization through the measured helper', () => {
    const source = readEditor()
    const directCalls = source.match(/(?:instance|editor\.value|muya)\.getMarkdown\(/g) ?? []

    expect(directCalls).toEqual(['instance.getMarkdown('])
  })
})
