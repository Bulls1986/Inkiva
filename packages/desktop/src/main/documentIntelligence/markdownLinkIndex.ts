import path from 'path'
import type {
  MarkdownBacklink,
  MarkdownLinkCandidate
} from '@shared/types/documentIntelligence'
import { isMarkdownPath, parseStandardRelativeMarkdownLinks } from './markdownLinks'

export const canonicalDocumentPath = (pathname: string): string => {
  const resolved = path.resolve(pathname)
  return process.platform === 'win32' || process.platform === 'darwin'
    ? resolved.toLowerCase()
    : resolved
}

const decodePath = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export const resolveMarkdownLinkTarget = (sourcePath: string, linkPath: string): string =>
  canonicalDocumentPath(path.resolve(path.dirname(sourcePath), decodePath(linkPath)))

const encodeRelativePath = (value: string): string =>
  value
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')

export const relativeMarkdownLinkPath = (sourcePath: string, targetPath: string): string => {
  const relative = path.relative(path.dirname(sourcePath), targetPath).split(path.sep).join('/')
  const normalized = relative || path.basename(targetPath)
  const withPrefix = normalized.startsWith('.') ? normalized : `./${normalized}`
  return encodeRelativePath(withPrefix)
}

export const createStandardMarkdownLink = (
  label: string,
  sourcePath: string,
  targetPath: string,
  fragment = ''
): string => {
  if (!label) throw new Error('Markdown link labels must not be empty')
  if (!isMarkdownPath(targetPath)) throw new Error('Markdown link targets must be Markdown files')
  if (fragment && !fragment.startsWith('#')) {
    throw new Error('Markdown link fragments must start with #')
  }

  const escapedLabel = label.replace(/\\/g, '\\\\').replace(/\]/g, '\\]')
  return `[${escapedLabel}](${relativeMarkdownLinkPath(sourcePath, targetPath)}${fragment})`
}

interface IndexedDocument {
  targets: string[]
}

const comparePathStrings = (left: string, right: string): number =>
  left === right ? 0 : left < right ? -1 : 1

const candidateScore = (relativePath: string, query: string): number | null => {
  if (!query) return 0
  // Do not let the ubiquitous .markdown/.md suffix satisfy a fuzzy filename
  // query (e.g. "read" spuriously matches "reference.markdown" via "a/d").
  const normalized = relativePath.replaceAll('\\', '/').toLowerCase()
    .replace(/\.(?:md|markdown)$/, '')
  const basename = normalized.slice(normalized.lastIndexOf('/') + 1)
  if (basename.startsWith(query)) return 0
  if (basename.includes(query)) return 1
  if (normalized.includes(query)) return 2

  // Fuzzy matching is a subsequence, not a filename-only substring: a query
  // such as "dread" can distinguish docs/README.md from manual/README.md.
  let cursor = 0
  let gapCost = 0
  let previous = -1
  for (const letter of query) {
    const found = normalized.indexOf(letter, cursor)
    if (found === -1) return null
    if (previous !== -1) gapCost += found - previous - 1
    previous = found
    cursor = found + 1
  }
  return 3 + gapCost
}

export class MarkdownLinkIndex {
  private readonly documents = new Map<string, IndexedDocument>()
  // Targets point to the source documents that reference them. This avoids
  // scanning the entire workspace on each Backlinks panel refresh.
  private readonly backlinksByTarget = new Map<string, Map<string, MarkdownBacklink[]>>()

  updateDocument(pathname: string, markdown: string): void {
    const canonicalPath = canonicalDocumentPath(pathname)
    const links = parseStandardRelativeMarkdownLinks(markdown)
    const byTarget = new Map<string, MarkdownBacklink[]>()
    for (const link of links) {
      const target = resolveMarkdownLinkTarget(canonicalPath, link.path)
      let backlinks = byTarget.get(target)
      if (!backlinks) {
        backlinks = []
        byTarget.set(target, backlinks)
      }
      backlinks.push({
        sourcePath: canonicalPath,
        label: link.label,
        destination: link.destination,
        fragment: link.fragment,
        line: link.line,
        start: link.start,
        end: link.end
      })
    }

    this.removeDocument(canonicalPath)
    this.documents.set(canonicalPath, {
      targets: [...byTarget.keys()]
    })
    for (const [target, backlinks] of byTarget) {
      let sources = this.backlinksByTarget.get(target)
      if (!sources) {
        sources = new Map()
        this.backlinksByTarget.set(target, sources)
      }
      sources.set(canonicalPath, backlinks)
    }
  }

  removeDocument(pathname: string): void {
    const key = canonicalDocumentPath(pathname)
    const previous = this.documents.get(key)
    if (!previous) return
    this.documents.delete(key)
    for (const target of previous.targets) {
      const sources = this.backlinksByTarget.get(target)
      sources?.delete(key)
      if (sources?.size === 0) this.backlinksByTarget.delete(target)
    }
  }

  clear(): void {
    this.documents.clear()
    this.backlinksByTarget.clear()
  }

  getBacklinks(targetPath: string): MarkdownBacklink[] {
    const target = canonicalDocumentPath(targetPath)
    const sources = this.backlinksByTarget.get(target)
    if (!sources) return []
    const backlinks = [...sources.values()].flat()
    return backlinks.sort(
      (left, right) =>
        comparePathStrings(left.sourcePath, right.sourcePath) || left.start - right.start
    )
  }

  getLinkCandidates(sourcePath: string, pathnames: readonly string[]): MarkdownLinkCandidate[] {
    const source = canonicalDocumentPath(sourcePath)
    const candidates = new Map<string, MarkdownLinkCandidate>()

    for (const pathname of pathnames) {
      if (!isMarkdownPath(pathname)) continue
      const resolvedTarget = path.resolve(pathname)
      const target = canonicalDocumentPath(resolvedTarget)
      const relativePath = relativeMarkdownLinkPath(source, resolvedTarget)
      candidates.set(target, { pathname: target, relativePath })
    }

    return [...candidates.values()].sort((left, right) =>
      comparePathStrings(left.relativePath, right.relativePath)
    )
  }

  rankLinkCandidates(
    candidates: readonly MarkdownLinkCandidate[],
    query: string,
    limit = 40
  ): MarkdownLinkCandidate[] {
    const term = query.trim().toLowerCase()
    return candidates
      .map((candidate) => ({ candidate, score: candidateScore(candidate.relativePath, term) }))
      .filter((item): item is { candidate: MarkdownLinkCandidate; score: number } =>
        item.score !== null)
      .sort((left, right) =>
        left.score - right.score ||
        comparePathStrings(left.candidate.relativePath, right.candidate.relativePath))
      .slice(0, Math.max(0, limit))
      .map(({ candidate }) => candidate)
  }
}
