import { describe, expect, it } from 'vitest'
import {
  EXTREME_DOCUMENT_DEGRADE_THRESHOLD_BYTES,
  getDocumentByteLength,
  shouldUseDegradedLargeDocumentMode
} from '../../src/renderer/src/util/largeDocumentMode'

describe('large document degradation contract', () => {
  it('keeps the threshold byte-based and exclusive', () => {
    const below = 'x'.repeat(EXTREME_DOCUMENT_DEGRADE_THRESHOLD_BYTES - 1)
    const at = 'x'.repeat(EXTREME_DOCUMENT_DEGRADE_THRESHOLD_BYTES)
    const above = 'x'.repeat(EXTREME_DOCUMENT_DEGRADE_THRESHOLD_BYTES + 1)

    expect(getDocumentByteLength(below)).toBe(EXTREME_DOCUMENT_DEGRADE_THRESHOLD_BYTES - 1)
    expect(shouldUseDegradedLargeDocumentMode(below)).toBe(false)
    expect(shouldUseDegradedLargeDocumentMode(at)).toBe(false)
    expect(shouldUseDegradedLargeDocumentMode(above)).toBe(true)
  })

  it('counts UTF-8 bytes instead of JavaScript code units', () => {
    const markdown = '中'.repeat(EXTREME_DOCUMENT_DEGRADE_THRESHOLD_BYTES / 3 + 1)

    expect(getDocumentByteLength(markdown)).toBeGreaterThan(EXTREME_DOCUMENT_DEGRADE_THRESHOLD_BYTES)
    expect(shouldUseDegradedLargeDocumentMode(markdown)).toBe(true)
  })

  it('keeps the 1 MB P3 envelope on the WYSIWYG path', () => {
    const markdown = 'x'.repeat(1024 * 1024)

    expect(shouldUseDegradedLargeDocumentMode(markdown)).toBe(false)
  })
})
