import type {
  ApplyRenameRepairResult,
  MarkdownDocumentInput,
  RenameRepairDecision,
  RenameRepairFileChange,
  RenameRepairPlan
} from '@shared/types/documentIntelligence'
import { isMarkdownPath, parseStandardRelativeMarkdownLinks } from './markdownLinks'
import {
  canonicalDocumentPath,
  relativeMarkdownLinkPath,
  resolveMarkdownLinkTarget
} from './markdownLinkIndex'

export interface RenameRepairFileAdapter {
  readFile(pathname: string): Promise<string>
  writeFile(pathname: string, content: string): Promise<void>
}

export class StaleRenameRepairPlanError extends Error {
  constructor(pathname: string) {
    super(`The Markdown file changed while link repair was awaiting confirmation: ${pathname}`)
    this.name = 'StaleRenameRepairPlanError'
  }
}

export const applyMarkdownEdits = (
  markdown: string,
  edits: readonly { start: number; end: number; replacement: string }[]
): string => {
  const ordered = [...edits].sort((left, right) => right.start - left.start)
  let result = markdown
  for (const edit of ordered) {
    result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end)
  }
  return result
}

const samePath = (left: string, right: string): boolean =>
  canonicalDocumentPath(left) === canonicalDocumentPath(right)

const repairedRelativePath = (
  sourcePath: string,
  targetPath: string,
  originalPath: string
): string => {
  const relative = relativeMarkdownLinkPath(sourcePath, targetPath)
  // Keep the author's valid `file.md` versus `./file.md` style when the
  // target remains below the source directory. Moving across directories may
  // still require a `../` prefix, which the relative path already supplies.
  if (
    !originalPath.startsWith('./') &&
    !originalPath.startsWith('../') &&
    relative.startsWith('./')
  ) {
    return relative.slice(2)
  }
  return relative
}

const uniqueDocuments = (documents: readonly MarkdownDocumentInput[]): MarkdownDocumentInput[] => {
  const seen = new Set<string>()
  const result: MarkdownDocumentInput[] = []
  for (const document of documents) {
    const pathname = canonicalDocumentPath(document.pathname)
    if (seen.has(pathname)) continue
    seen.add(pathname)
    result.push({ pathname, markdown: document.markdown })
  }
  return result
}

/**
 * Build a reviewable repair plan before a Markdown file is renamed or moved.
 * The plan is intentionally based on the original source paths so callers can
 * apply it before the filesystem rename, then perform the rename themselves.
 */
export const createRenameRepairPlan = (request: {
  fromPath: string
  toPath: string
  documents: readonly MarkdownDocumentInput[]
}): RenameRepairPlan => {
  const fromPath = canonicalDocumentPath(request.fromPath)
  const toPath = canonicalDocumentPath(request.toPath)
  const changes: RenameRepairFileChange[] = []

  for (const document of uniqueDocuments(request.documents)) {
    const sourcePathAfter = samePath(document.pathname, fromPath) ? toPath : document.pathname
    const edits: RenameRepairFileChange['edits'] = []

    for (const link of parseStandardRelativeMarkdownLinks(document.markdown)) {
      const currentTarget = resolveMarkdownLinkTarget(document.pathname, link.path)
      const targetPathAfter = samePath(currentTarget, fromPath) ? toPath : currentTarget
      const sourceMoved = sourcePathAfter !== document.pathname
      const targetMoved = targetPathAfter !== currentTarget
      if (!sourceMoved && !targetMoved) continue
      if (!isMarkdownPath(targetPathAfter)) continue

      const nextDestination = `${repairedRelativePath(sourcePathAfter, targetPathAfter, link.path)}${link.fragment}`
      if (nextDestination === link.destination) continue

      edits.push({
        start: link.destinationStart,
        end: link.destinationEnd,
        replacement: nextDestination
      })
    }

    if (!edits.length) continue
    changes.push({
      sourcePath: document.pathname,
      sourcePathAfter,
      before: document.markdown,
      after: applyMarkdownEdits(document.markdown, edits),
      edits
    })
  }

  return {
    fromPath,
    toPath,
    changes,
    affectedFiles: changes.map((change) => change.sourcePath),
    linkCount: changes.reduce((count, change) => count + change.edits.length, 0)
  }
}

export const applyRenameRepairPlan = async(
  plan: RenameRepairPlan,
  decision: RenameRepairDecision,
  files: RenameRepairFileAdapter
): Promise<ApplyRenameRepairResult> => {
  if (decision !== 'update') return { decision, updatedPaths: [] }

  for (const change of plan.changes) {
    const current = await files.readFile(change.sourcePath)
    if (current !== change.before) throw new StaleRenameRepairPlanError(change.sourcePath)
  }

  for (const change of plan.changes) {
    await files.writeFile(change.sourcePath, change.after)
  }

  return {
    decision,
    updatedPaths: plan.changes.map((change) => change.sourcePath)
  }
}
