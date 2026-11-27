/**
 * Matching rules for restoring a stored collapse state (v0.7.0 F6).
 *
 * Identity is the heading's own text plus its level and its ancestor texts — not
 * the engine's occurrence-numbered key. The key changes whenever an identical
 * heading is inserted above, and the approved rule is explicit: an uncertain
 * match stays expanded instead of collapsing the wrong section.
 */

export interface CollapseHeadingRecord {
  key: string
  level: number
  text: string
  collapsed: boolean
  /** Ancestor heading texts, outermost first. */
  ancestors: string[]
}

export interface HeadingStateLike {
  key: string
  level: number
  collapsed?: boolean
}

export interface CurrentHeading {
  key: string
  level: number
  text: string
  ancestors: string[]
}

export interface CollapseRestoreResult {
  collapsedKeys: string[]
  staleKeys: string[]
}

const pathKey = (heading: { key?: string, text?: string, ancestors: string[] }): string =>
  [...heading.ancestors, heading.text || heading.key || ''].join('/')

const matchKey = (heading: {
  level: number
  text: string
  ancestors: string[]
}): string => JSON.stringify([heading.ancestors, heading.level, heading.text])

/**
 * Turn the editor's flat heading state into records. `texts` is the outline
 * content in the same document order; it supplies the stable identity, while the
 * key is kept only so the caller can address the section within this session.
 */
export const buildHeadingRecords = (
  state: readonly HeadingStateLike[],
  texts: readonly string[] = []
): CollapseHeadingRecord[] => {
  const stack: Array<{ level: number, text: string }> = []
  const records: CollapseHeadingRecord[] = []

  state.forEach((heading, index) => {
    const text = texts[index] ?? ''
    while (stack.length > 0 && stack[stack.length - 1]!.level >= heading.level) {
      stack.pop()
    }
    records.push({
      key: heading.key,
      level: heading.level,
      text,
      collapsed: heading.collapsed === true,
      ancestors: stack.map((entry) => entry.text)
    })
    stack.push({ level: heading.level, text })
  })

  return records
}

export const resolveCollapseRestore = (
  recorded: readonly CollapseHeadingRecord[],
  current: readonly CurrentHeading[]
): CollapseRestoreResult => {
  const counts = new Map<string, number>()
  for (const heading of current) {
    const key = matchKey(heading)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const collapsedKeys: string[] = []
  const staleKeys: string[] = []

  for (const heading of recorded) {
    const matches = counts.get(matchKey(heading)) ?? 0
    // A record without text cannot be identified; never guess.
    if (matches !== 1 || !heading.text) {
      staleKeys.push(pathKey(heading))
      continue
    }
    if (!heading.collapsed) continue
    const target = current.find((candidate) => matchKey(candidate) === matchKey(heading))
    if (target) collapsedKeys.push(target.key)
  }

  return { collapsedKeys, staleKeys }
}
