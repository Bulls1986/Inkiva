import { describe, expect, it } from 'vitest'
import { limitSearchResults, MAX_RENDERED_SEARCH_RESULTS } from '@/util/searchResultLimit'

describe('search result render limit', () => {
  it('caps rendered file rows at the hard DOM budget', () => {
    const results = Array.from({ length: MAX_RENDERED_SEARCH_RESULTS + 25 }, (_, index) => ({
      filePath: `/workspace/file-${index}.md`,
      matches: []
    }))

    const visible = limitSearchResults(results)

    expect(visible).toHaveLength(MAX_RENDERED_SEARCH_RESULTS)
    expect(visible[0]).toBe(results[0])
    expect(visible.at(-1)).toBe(results[MAX_RENDERED_SEARCH_RESULTS - 1])
  })

  it('preserves all results when under the budget and accepts an explicit lower budget', () => {
    const results = [{ filePath: '/workspace/a.md', matches: [] }]
    expect(limitSearchResults(results)).toEqual(results)
    expect(limitSearchResults(results, 0)).toEqual([])
  })
})
