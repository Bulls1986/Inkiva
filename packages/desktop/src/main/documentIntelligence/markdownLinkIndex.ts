import path from 'path'
import type {
  MarkdownBacklink,
  MarkdownLinkCandidate,
  MarkdownLinkOccurrence
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
  pathname: string
  links: MarkdownLinkOccurrence[]
}

const comparePathStrings = (left: string, right: string): number =>
  left === right ? 0 : left < right ? -1 : 1

export class MarkdownLinkIndex {
  private readonly documents = new Map<string, IndexedDocument>()

  updateDocument(pathname: string, markdown: string): void {
    const canonicalPath = canonicalDocumentPath(pathname)
    this.documents.set(canonicalPath, {
      pathname: canonicalPath,
      links: parseStandardRelativeMarkdownLinks(markdown)
    })
  }

  removeDocument(pathname: string): void {
    this.documents.delete(canonicalDocumentPath(pathname))
  }

  clear(): void {
    this.documents.clear()
  }

  getBacklinks(targetPath: string): MarkdownBacklink[] {
    const target = canonicalDocumentPath(targetPath)
    const backlinks: MarkdownBacklink[] = []

    for (const document of this.documents.values()) {
      for (const link of document.links) {
        if (resolveMarkdownLinkTarget(document.pathname, link.path) !== target) continue
        backlinks.push({
          sourcePath: document.pathname,
          label: link.label,
          destination: link.destination,
          fragment: link.fragment,
          line: link.line,
          start: link.start,
          end: link.end
        })
      }
    }

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
      const target = canonicalDocumentPath(pathname)
      const relativePath = relativeMarkdownLinkPath(source, target)
      candidates.set(target, { pathname: target, relativePath })
    }

    return [...candidates.values()].sort((left, right) =>
      comparePathStrings(left.relativePath, right.relativePath)
    )
  }
}
