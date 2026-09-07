import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  const w = globalThis as unknown as {
    window?: {
      electron?: {
        process?: { platform: string }
      }
    }
  }
  w.window ??= {}
  w.window.electron ??= { process: { platform: 'linux' } }
})

import { createDocumentState, getBlankFileState } from '@/store/help'

describe('editor document statistics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('derives counts from markdown instead of a missing or stale cache', () => {
    const markdown = '# Title\n\nhello world 你好\n'
    const state = createDocumentState({
      markdown,
      wordCount: { word: 0, paragraph: 0, character: 0, all: 0 }
    })

    expect(state.wordCount).toEqual({
      word: 6,
      paragraph: 2,
      character: 18,
      all: markdown.length
    })
  })

  it('initializes statistics for a new untitled document with content', () => {
    const markdown = 'one two\n\n三'
    const state = getBlankFileState([], 'utf8', 'lf', markdown)

    expect(state.wordCount).toEqual({
      word: 3,
      paragraph: 2,
      character: 7,
      all: markdown.length
    })
  })
})
