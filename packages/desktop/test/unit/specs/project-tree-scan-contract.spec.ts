import { describe, expect, it } from 'vitest'
import { isInlineFileData } from '@/util/projectTreeEvents'

describe('project tree scan contract', () => {
  it('only treats structured file data as an inline hydration payload', () => {
    expect(isInlineFileData(undefined)).toBe(false)
    expect(isInlineFileData(null)).toBe(false)
    expect(isInlineFileData('markdown')).toBe(false)
    expect(isInlineFileData([])).toBe(false)
    expect(isInlineFileData({ markdown: '# note' })).toBe(true)
  })
})
