/**
 * Matching rules for restoring a stored collapse state onto the current document
 * (v0.7.0 F6).
 *
 * A stored heading is restored only when it identifies exactly one current
 * heading by key + level + ancestor chain. Duplicate candidates, a changed
 * level, a different parent, or a removed heading all leave that section
 * expanded, and the record is reported as stale so the caller can prune it.
 * Guessing here would be worse than expanding: the user would see a section
 * collapsed for the wrong content.
 */

export interface CollapseHeadingRecord {
  key: string
  level: number
  collapsed: boolean
  ancestors: string[]
}

export interface CurrentHeading {
  key: string
  level: number
  ancestors: string[]
}

export interface CollapseRestoreResult {
  collapsedKeys: string[]
  staleKeys: string[]
}

const pathKey = (heading: { key: string, ancestors: string[] }): string =>
  [...heading.ancestors, heading.key].join('/')

const matchKey = (heading: { key: string, level: number, ancestors: string[] }): string =>
  JSON.stringify([heading.ancestors, heading.key, heading.level])

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
    const key = matchKey(heading)
    const matches = counts.get(key) ?? 0
    if (matches !== 1) {
      staleKeys.push(pathKey(heading))
      continue
    }
    if (heading.collapsed) collapsedKeys.push(heading.key)
  }

  return { collapsedKeys, staleKeys }
}
