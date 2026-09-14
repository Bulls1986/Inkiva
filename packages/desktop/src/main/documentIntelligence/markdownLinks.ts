import type { MarkdownLinkOccurrence } from '@shared/types/documentIntelligence'

const MARKDOWN_PATH_RE = /\.(?:md|markdown)$/i
const URI_SCHEME_RE = /^[A-Za-z][A-Za-z0-9+.-]*:/

const isEscaped = (value: string, offset: number): boolean => {
  let slashes = 0
  for (let index = offset - 1; index >= 0 && value[index] === '\\'; index -= 1) {
    slashes += 1
  }
  return slashes % 2 === 1
}

const maskRange = (chars: string[], start: number, end: number): void => {
  for (let index = start; index < end; index += 1) {
    if (chars[index] !== '\n' && chars[index] !== '\r') chars[index] = ' '
  }
}

const lineEnd = (source: string, start: number): number => {
  const end = source.indexOf('\n', start)
  return end === -1 ? source.length : end
}

const scanDelimitedFrontMatter = (source: string, start: number, delimiter: string): number => {
  let cursor = start
  while (cursor <= source.length) {
    const end = lineEnd(source, cursor)
    const line = source.slice(cursor, end).replace(/\r$/, '')
    if (line === delimiter) return end < source.length ? end + 1 : end
    if (end === source.length) break
    cursor = end + 1
  }
  return 0
}

const frontMatterEnd = (source: string): number => {
  const opener = /^(?:\uFEFF)?(---|\+\+\+|;;;)\r?\n/.exec(source)
  if (!opener) return 0

  const delimiter = opener[1]
  return scanDelimitedFrontMatter(source, opener[0].length, delimiter)
}

const jsonFrontMatterEnd = (source: string): number => {
  const opener = /^(?:\uFEFF)?\{\r?\n/.exec(source)
  if (!opener) return 0
  return scanDelimitedFrontMatter(source, opener[0].length, '}')
}

/**
 * Replace Markdown regions whose text must not participate in inline-link
 * parsing while retaining the original UTF-16 offsets.
 */
const maskNonMarkdownRegions = (source: string): string => {
  const chars = Array.from({ length: source.length }, (_, index) => source[index])
  const matterEnd = frontMatterEnd(source) || jsonFrontMatterEnd(source)
  if (matterEnd > 0) maskRange(chars, 0, matterEnd)

  let inFence: { marker: string; length: number } | null = null
  let start = matterEnd
  while (start < source.length) {
    const end = lineEnd(source, start)
    const line = source.slice(start, end)
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line)

    if (!inFence && fence) {
      inFence = { marker: fence[1][0], length: fence[1].length }
      maskRange(chars, start, end)
    } else if (inFence) {
      maskRange(chars, start, end)
      const closing = new RegExp(`^ {0,3}${inFence.marker}{${inFence.length},}\\s*$`).test(line)
      if (closing) inFence = null
    } else if (/^(?: {4}|\t)/.test(line)) {
      // Indented code blocks are not inline Markdown link content.
      maskRange(chars, start, end)
    }

    if (end === source.length) break
    start = end + 1
  }

  // Inline code spans can contain brackets that look like links. The fenced
  // code pass above has already replaced those characters with spaces.
  const masked = chars.join('')
  let index = 0
  while (index < source.length) {
    if (masked[index] !== '`' || isEscaped(source, index)) {
      index += 1
      continue
    }

    let length = 1
    while (masked[index + length] === '`') length += 1
    let close = index + length
    while (close < source.length) {
      if (
        masked[close] === '`' &&
        source.slice(close, close + length) === '`'.repeat(length) &&
        !isEscaped(source, close)
      ) {
        close += length
        break
      }
      close += 1
    }
    maskRange(chars, index, Math.min(close, source.length))
    index = Math.max(close, index + length)
  }

  return chars.join('')
}

const findLabelEnd = (source: string, start: number): number => {
  let nested = 0
  for (let index = start + 1; index < source.length; index += 1) {
    if (isEscaped(source, index)) continue
    if (source[index] === '[') nested += 1
    if (source[index] !== ']') continue
    if (nested === 0) return index
    nested -= 1
  }
  return -1
}

interface ParsedDestination {
  start: number
  end: number
  close: number
}

const parseDestination = (source: string, open: number): ParsedDestination | null => {
  let cursor = open + 1
  while (/\s/.test(source[cursor] ?? '')) cursor += 1

  const angleBrackets = source[cursor] === '<'
  const start = angleBrackets ? cursor + 1 : cursor
  let end = start

  if (angleBrackets) {
    while (end < source.length) {
      if (source[end] === '>' && !isEscaped(source, end)) break
      if (source[end] === '\n' || source[end] === '\r') return null
      end += 1
    }
    if (source[end] !== '>') return null
    cursor = end + 1
  } else {
    let parentheses = 0
    while (end < source.length) {
      const character = source[end]
      if (isEscaped(source, end)) {
        end += 2
        continue
      }
      if (character === '(') {
        parentheses += 1
        end += 1
        continue
      }
      if (character === ')') {
        if (parentheses === 0) break
        parentheses -= 1
        end += 1
        continue
      }
      if (/\s/.test(character ?? '')) break
      end += 1
    }
    if (parentheses !== 0) return null
    cursor = end
  }

  if (start === end) return null
  while (/\s/.test(source[cursor] ?? '')) cursor += 1

  // The title is not part of the destination range, but it can contain
  // parentheses. Walk it before accepting the outer closing parenthesis.
  let parentheses = 0
  let quote: string | null = null
  for (let index = cursor; index < source.length; index += 1) {
    const character = source[index]
    if (quote) {
      if (character === quote && !isEscaped(source, index)) quote = null
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === '(') {
      parentheses += 1
      continue
    }
    if (character !== ')') continue
    if (parentheses === 0) return { start, end, close: index }
    parentheses -= 1
  }

  return null
}

const unescapeDestination = (value: string): string => value.replace(/\\([\\()<>#\s])/g, '$1')

export const splitMarkdownDestination = (
  destination: string
): { path: string; fragment: string } => {
  const hash = destination.indexOf('#')
  if (hash === -1) return { path: destination, fragment: '' }
  return {
    path: destination.slice(0, hash),
    fragment: destination.slice(hash)
  }
}

export const isMarkdownPath = (value: string): boolean => MARKDOWN_PATH_RE.test(value)

export const isStandardRelativeMarkdownDestination = (destination: string): boolean => {
  const { path: linkPath } = splitMarkdownDestination(unescapeDestination(destination))
  if (!linkPath || linkPath.startsWith('/') || linkPath.startsWith('//')) return false
  if (URI_SCHEME_RE.test(linkPath)) return false
  return isMarkdownPath(linkPath)
}

/**
 * Parse only ordinary inline Markdown links whose destination is a relative
 * Markdown file. Images, reference links, URLs, anchors, and links inside
 * code/front matter are deliberately outside this document-intelligence
 * index.
 */
export const parseStandardRelativeMarkdownLinks = (markdown: string): MarkdownLinkOccurrence[] => {
  const masked = maskNonMarkdownRegions(markdown)
  const links: MarkdownLinkOccurrence[] = []

  for (let index = 0; index < masked.length; index += 1) {
    if (masked[index] !== '[') continue
    if (isEscaped(markdown, index)) continue
    if (index > 0 && masked[index - 1] === '!' && !isEscaped(markdown, index - 1)) continue

    const labelEnd = findLabelEnd(masked, index)
    if (labelEnd === -1 || masked[labelEnd + 1] !== '(') continue

    const parsed = parseDestination(markdown, labelEnd + 1)
    if (!parsed) continue

    const destination = markdown.slice(parsed.start, parsed.end)
    if (!isStandardRelativeMarkdownDestination(destination)) continue

    const { path: linkPath, fragment } = splitMarkdownDestination(destination)
    links.push({
      label: markdown.slice(index + 1, labelEnd),
      destination,
      path: unescapeDestination(linkPath),
      fragment,
      start: index,
      end: parsed.close + 1,
      destinationStart: parsed.start,
      destinationEnd: parsed.end,
      line: markdown.slice(0, index).split('\n').length
    })
    index = parsed.close
  }

  return links
}
