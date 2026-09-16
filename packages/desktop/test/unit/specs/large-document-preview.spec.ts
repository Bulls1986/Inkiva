import { describe, expect, it } from 'vitest'
import {
  getBoundedDocumentPreview,
  MAX_DEGRADED_PREVIEW_CHARS
} from '@/util/largeDocumentMode'

describe('large document preview contract', () => {
  it('keeps the beginning of an extreme document while bounding renderer work', () => {
    const markdown = 'START\n' + 'x'.repeat(MAX_DEGRADED_PREVIEW_CHARS + 100) + '\nTAIL'
    const preview = getBoundedDocumentPreview(markdown)

    expect(preview).toBe(markdown.slice(0, MAX_DEGRADED_PREVIEW_CHARS))
    expect(preview).toContain('START')
    expect(preview).not.toContain('TAIL')
  })

  it('does not copy short documents unnecessarily', () => {
    const markdown = '# short\n\ncontent'

    expect(getBoundedDocumentPreview(markdown)).toBe(markdown)
  })
})
