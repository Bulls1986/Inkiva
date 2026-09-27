import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { DocumentIntelligenceService } from 'main_renderer/documentIntelligence/documentIntelligenceService'
import { canonicalDocumentPath } from 'main_renderer/documentIntelligence/markdownLinkIndex'
import {
  applyRenameRepairPlan,
  createRenameRepairPlan,
  StaleRenameRepairPlanError
} from 'main_renderer/documentIntelligence/renameRepair'

describe('rename/move repair confirmation', () => {
  const createPlan = () => {
    const root = '/virtual/repair'
    const oldPath = canonicalDocumentPath(path.join(root, 'old.md'))
    const newPath = canonicalDocumentPath(path.join(root, 'new.md'))
    const sourcePath = canonicalDocumentPath(path.join(root, 'source.md'))
    const before = '[Old](./old.md#section)'
    return {
      plan: createRenameRepairPlan({
        fromPath: oldPath,
        toPath: newPath,
        documents: [{ pathname: sourcePath, markdown: before }]
      }),
      sourcePath,
      before
    }
  }

  it('updates files only after explicit update confirmation', async() => {
    const { plan, sourcePath, before } = createPlan()
    const files = new Map([[sourcePath, before]])
    const writeFile = vi.fn(async(filePath: string, content: string) => {
      files.set(filePath, content)
    })
    const adapter = {
      readFile: async(filePath: string) => files.get(filePath) ?? '',
      writeFile
    }

    await expect(applyRenameRepairPlan(plan, 'update', adapter)).resolves.toEqual({
      decision: 'update',
      updatedPaths: [sourcePath]
    })
    expect(files.get(sourcePath)).toBe('[Old](./new.md#section)')
    expect(writeFile).toHaveBeenCalledWith(sourcePath, '[Old](./new.md#section)')
  })

  it('keeps and cancels without reading or writing any file', async() => {
    const { plan } = createPlan()
    const adapter = {
      readFile: vi.fn(async() => {
        throw new Error('must not read')
      }),
      writeFile: vi.fn(async() => {
        throw new Error('must not write')
      })
    }

    await expect(applyRenameRepairPlan(plan, 'keep', adapter)).resolves.toEqual({
      decision: 'keep',
      updatedPaths: []
    })
    await expect(applyRenameRepairPlan(plan, 'cancel', adapter)).resolves.toEqual({
      decision: 'cancel',
      updatedPaths: []
    })
    expect(adapter.readFile).not.toHaveBeenCalled()
    expect(adapter.writeFile).not.toHaveBeenCalled()
  })

  it('does not partially apply a plan when a source changed after preview', async() => {
    const { plan, sourcePath } = createPlan()
    const adapter = {
      readFile: vi.fn(async() => 'changed after preview'),
      writeFile: vi.fn(async() => undefined)
    }

    await expect(applyRenameRepairPlan(plan, 'update', adapter)).rejects.toBeInstanceOf(
      StaleRenameRepairPlanError
    )
    expect(adapter.writeFile).not.toHaveBeenCalled()
    expect(adapter.readFile).toHaveBeenCalledWith(sourcePath)
  })

  it('keeps current-document relative links and images pointing at the same targets after a move', () => {
    const root = '/virtual/continuity'
    const fromPath = canonicalDocumentPath(path.join(root, 'notes', 'current.md'))
    const toPath = canonicalDocumentPath(path.join(root, 'archive', 'current.md'))
    const guidePath = canonicalDocumentPath(path.join(root, 'notes', 'guide.md'))
    const imagePath = canonicalDocumentPath(path.join(root, 'notes', 'images', 'diagram.png'))
    const before = '[Guide](./guide.md)\n![Diagram](./images/diagram.png)'

    const plan = createRenameRepairPlan({
      fromPath,
      toPath,
      includeResources: true,
      documents: [{ pathname: fromPath, markdown: before }]
    })

    expect(plan.linkCount).toBe(2)
    expect(plan.changes).toHaveLength(1)
    expect(plan.changes[0]?.after).toBe(
      '[Guide](../notes/guide.md)\n![Diagram](../notes/images/diagram.png)'
    )
    expect(
      canonicalDocumentPath(path.resolve(path.dirname(toPath), '../notes/guide.md'))
    ).toBe(guidePath)
    expect(
      canonicalDocumentPath(path.resolve(path.dirname(toPath), '../notes/images/diagram.png'))
    ).toBe(imagePath)
  })

  it('repairs a moved document when its parent directory is renamed', () => {
    const root = '/virtual/continuity'
    const fromDirectory = canonicalDocumentPath(path.join(root, 'notes'))
    const toDirectory = canonicalDocumentPath(path.join(root, 'archive', 'notes'))
    const sourcePath = canonicalDocumentPath(path.join(root, 'notes', 'current.md'))
    const before = '[Outside](../shared/guide.md)'

    const plan = createRenameRepairPlan({
      fromPath: fromDirectory,
      toPath: toDirectory,
      pathKind: 'directory',
      includeResources: true,
      documents: [{ pathname: sourcePath, markdown: before }]
    })

    expect(plan.linkCount).toBe(1)
    expect(plan.changes).toHaveLength(1)
    expect(plan.changes[0]?.sourcePathAfter).toBe(
      canonicalDocumentPath(path.join(root, 'archive', 'notes', 'current.md'))
    )
    expect(plan.changes[0]?.after).toBe('[Outside](../../shared/guide.md)')
  })

  it('treats child names beginning with two dots as descendants, not parent traversal', () => {
    const root = '/virtual/continuity'
    const fromDirectory = canonicalDocumentPath(path.join(root, 'notes'))
    const toDirectory = canonicalDocumentPath(path.join(root, 'archive', 'notes'))
    const sourcePath = canonicalDocumentPath(path.join(root, 'notes', '..drafts', 'current.md'))

    const plan = createRenameRepairPlan({
      fromPath: fromDirectory,
      toPath: toDirectory,
      pathKind: 'directory',
      includeResources: true,
      documents: [{ pathname: sourcePath, markdown: '[Outside](../../shared/guide.md)' }]
    })

    expect(plan.changes[0]?.sourcePathAfter).toBe(
      canonicalDocumentPath(path.join(root, 'archive', 'notes', '..drafts', 'current.md'))
    )
  })

  it('exposes the same index and repair contract through the document service', () => {
    const service = new DocumentIntelligenceService({ historyRootPath: '/virtual/history' })
    const sourcePath = canonicalDocumentPath('/virtual/docs/source.md')
    const targetPath = canonicalDocumentPath('/virtual/docs/target.md')

    service.indexDocument(sourcePath, '[Target](./target.md)')

    expect(service.getBacklinks(targetPath)).toMatchObject([
      { sourcePath, destination: './target.md', label: 'Target' }
    ])
    expect(
      service.prepareRenameRepair({
        fromPath: targetPath,
        toPath: canonicalDocumentPath('/virtual/docs/renamed.md'),
        documents: [{ pathname: sourcePath, markdown: '[Target](./target.md)' }]
      })
    ).toMatchObject({ linkCount: 1 })
  })
})
