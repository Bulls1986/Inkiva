export const MAX_RENDERED_SEARCH_RESULTS = 300

export const limitSearchResults = <T>(
  results: readonly T[],
  max = MAX_RENDERED_SEARCH_RESULTS
): T[] => results.slice(0, Math.max(0, Math.floor(max)))
