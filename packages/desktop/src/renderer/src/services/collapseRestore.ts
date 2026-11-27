/**
 * Cross-session collapse restore (v0.7.0 F6).
 *
 * Two rules come from the architecture diagnosis:
 *  - identity is heading text + level + ancestor texts, and it must be unique on
 *    BOTH sides: an old snapshot that itself contains two identical headings
 *    cannot be resolved even after one of them is deleted;
 *  - restoring is a UI-only transaction. It never writes; the one permitted
 *    write is a prune produced from the post-restore snapshot and bounded by the
 *    activation generation and a user-interaction counter.
 */

export interface CollapseHeadingRecord {
  key: string
  level: number
  text: string
  collapsed: boolean
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
  /** Current-engine keys that must end up collapsed. */
  collapsedKeys: string[]
  /** Recorded headings that no longer identify a unique current heading. */
  staleKeys: string[]
  /** True when the restore result is trustworthy enough to write back. */
  canPrune: boolean
}

const pathKey = (heading: { key?: string, text?: string, ancestors: string[] }): string =>
  [...heading.ancestors, heading.text || heading.key || ''].join('/')

const matchKey = (heading: { level: number, text: string, ancestors: string[] }): string =>
  JSON.stringify([heading.ancestors, heading.level, heading.text])

/**
 * Turn the editor's flat heading state into records. `texts` supplies the stable
 * identity in document order; the key is only a within-session address.
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

const countByMatchKey = (
  headings: ReadonlyArray<{ level: number, text: string, ancestors: string[] }>
): Map<string, number> => {
  const counts = new Map<string, number>()
  for (const heading of headings) {
    if (!heading.text) continue
    const key = matchKey(heading)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

/**
 * Resolve which current headings may be restored as collapsed.
 *
 * A record is used only when its identity is unique in the old snapshot AND in
 * the current document. Anything else — a duplicate in either side, a renamed or
 * removed heading, a level or parent change, a record without text — leaves the
 * section expanded and is reported stale so it can be pruned once.
 */
export const resolveCollapseRestore = (
  recorded: readonly CollapseHeadingRecord[],
  current: readonly CurrentHeading[]
): CollapseRestoreResult => {
  const recordedCounts = countByMatchKey(recorded)
  const currentCounts = countByMatchKey(current)

  const collapsedKeys: string[] = []
  const staleKeys: string[] = []
  let canPrune = true

  for (const heading of recorded) {
    const key = matchKey(heading)
    const ambiguous = !heading.text ||
      (recordedCounts.get(key) ?? 0) !== 1 ||
      (currentCounts.get(key) ?? 0) !== 1

    if (ambiguous) {
      // An ambiguous old record is not evidence of anything: keep it on disk so a
      // later, unambiguous document can still use it, and never collapse.
      staleKeys.push(pathKey(heading))
      canPrune = false
      continue
    }

    if (!heading.collapsed) continue
    const target = current.find((candidate) => matchKey(candidate) === key)
    if (target) collapsedKeys.push(target.key)
  }

  return { collapsedKeys, staleKeys, canPrune }
}
