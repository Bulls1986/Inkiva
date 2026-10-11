import path from 'node:path'

import type {
  ApplyRenameRepairResult,
  MarkdownDocumentInput,
  RenameRepairDecision,
  RenameRepairFileChange,
  RenameRepairPathKind,
  RenameRepairPlan
} from '@shared/types/documentIntelligence'
import {
  parseStandardRelativeMarkdownLinks,
  parseStandardRelativeMarkdownResources
} from './markdownLinks'
import {
  canonicalDocumentPath,
  relativeMarkdownLinkPath,
  resolveMarkdownLinkTarget
} from './markdownLinkIndex'

export interface RenameRepairFileAdapter {
  readFile(pathname: string): Promise<string>
  writeFile(pathname: string, content: string | Buffer): Promise<void>
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

const remapMovedPath = (
  candidatePath: string,
  fromPath: string,
  toPath: string,
  pathKind: RenameRepairPathKind
): string => {
  const candidate = canonicalDocumentPath(candidatePath)
  if (samePath(candidate, fromPath)) return toPath
  if (pathKind !== 'directory') return candidate

  const relative = path.relative(fromPath, candidate)
  if (
    !relative ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return candidate
  }
  return canonicalDocumentPath(path.join(toPath, relative))
}

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
  pathKind?: RenameRepairPathKind
  includeResources?: boolean
  documents: readonly MarkdownDocumentInput[]
}): RenameRepairPlan => {
  const fromPath = canonicalDocumentPath(request.fromPath)
  const toPath = canonicalDocumentPath(request.toPath)
  const pathKind = request.pathKind ?? 'file'
  const parseRelativeDestinations = request.includeResources
    ? parseStandardRelativeMarkdownResources
    : parseStandardRelativeMarkdownLinks
  const changes: RenameRepairFileChange[] = []

  for (const document of uniqueDocuments(request.documents)) {
    const sourcePathAfter = remapMovedPath(document.pathname, fromPath, toPath, pathKind)
    const edits: RenameRepairFileChange['edits'] = []

    for (const link of parseRelativeDestinations(document.markdown)) {
      const currentTarget = resolveMarkdownLinkTarget(document.pathname, link.path)
      const targetPathAfter = remapMovedPath(currentTarget, fromPath, toPath, pathKind)
      const sourceMoved = sourcePathAfter !== document.pathname
      const targetMoved = targetPathAfter !== currentTarget
      if (!sourceMoved && !targetMoved) continue

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

export interface RenameRepairRecovery {
  create(filePath: string, content: string): Promise<string>
  verify(filePath: string, snapshotId: string, content: string): Promise<boolean>
}

export interface RenameRepairApplyOptions {
  /** A successfully moved file must be written at its new location. */
  afterMove?: boolean
  /** All original source contents are durably retained before any batch write. */
  recovery?: RenameRepairRecovery
}

/**
 * Multi-file repairs cannot be atomic across the filesystem. Recoverable
 * partial outcomes must remain explicit and must retain Local History
 * evidence even if an attempted rollback also fails.
 */
export const applyRenameRepairPlan = async(
  plan: RenameRepairPlan,
  decision: RenameRepairDecision,
  files: RenameRepairFileAdapter,
  options: RenameRepairApplyOptions = {}
): Promise<ApplyRenameRepairResult> => {
  if (decision !== 'update') return { decision, updatedPaths: [] }

  const changes = plan.changes.map((change) => ({
    change,
    filePath: options.afterMove ? change.sourcePathAfter : change.sourcePath
  }))
  // Preflight the *whole* batch so an already-stale second file cannot be
  // overwritten (or leave the first file repaired).
  for (const { change, filePath } of changes) {
    const current = await files.readFile(filePath)
    if (current !== change.before) throw new StaleRenameRepairPlanError(filePath)
  }
  if (changes.length > 1 && !options.recovery) {
    throw new Error('Bulk link repair requires a durable Local History recovery owner')
  }

  const recoveryPoints: NonNullable<ApplyRenameRepairResult['recoveryPoints']> = []
  if (options.recovery) {
    for (const { change, filePath } of changes) {
      const snapshotId = await options.recovery.create(filePath, change.before)
      recoveryPoints.push({ filePath, snapshotId })
    }
    // A snapshot creation may prune an earlier entry. Verify *all* retained
    // before bytes still exist before the first disk mutation.
    for (const { change, filePath } of changes) {
      const snapshot = recoveryPoints.find((item) => item.filePath === filePath)
      if (!snapshot || !await options.recovery.verify(
        filePath, snapshot.snapshotId, change.before
      )) {
        throw new Error(`Local History recovery point is unavailable: ${filePath}`)
      }
    }
  }

  const completed: typeof changes = []
  for (const item of changes) {
    try {
      // Re-read immediately before the per-file write; a user/external editor
      // can change bytes while another file or snapshot is being processed.
      const current = await files.readFile(item.filePath)
      if (current !== item.change.before) {
        throw new StaleRenameRepairPlanError(item.filePath)
      }
      await files.writeFile(item.filePath, item.change.after)
      completed.push(item)
    } catch (error) {
      if (!options.recovery) throw error
      const rolledBackPaths: string[] = []
      const rollbackFailedPaths: string[] = []
      const stillChangedPaths: string[] = []
      for (const applied of [...completed].reverse()) {
        try {
          // Never clobber newer user edits made after an earlier batch write.
          const current = await files.readFile(applied.filePath)
          if (current !== applied.change.after) {
            rollbackFailedPaths.push(applied.filePath)
            stillChangedPaths.push(applied.filePath)
            continue
          }
          await files.writeFile(applied.filePath, applied.change.before)
          rolledBackPaths.push(applied.filePath)
        } catch {
          rollbackFailedPaths.push(applied.filePath)
          stillChangedPaths.push(applied.filePath)
        }
      }
      return {
        decision,
        outcome: stillChangedPaths.length ? 'partial' : 'rolled-back',
        failedPath: item.filePath,
        updatedPaths: stillChangedPaths,
        rolledBackPaths,
        rollbackFailedPaths,
        recoveryPoints,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  return { decision, updatedPaths: changes.map(({ filePath }) => filePath) }
}