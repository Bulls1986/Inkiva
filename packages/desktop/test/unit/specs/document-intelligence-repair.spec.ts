import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { DocumentIntelligenceService } from 'main_renderer/documentIntelligence/documentIntelligenceService'
import {
  applyRenameRepairPlan,
  createRenameRepairPlan,
  StaleRenameRepairPlanError
} from 'main_renderer/documentIntelligence/renameRepair'

describe('rename/move repair confirmation', () => {
  const createPlan = () => {
    const root = '/virtual/repair'
    const oldPath = path.join(root, 'old.md')
    const newPath = path.join(root, 'new.md')
    const sourcePath = path.join(root, 'source.md')
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

  it('exposes the same index and repair contract through the document service', () => {
    const service = new DocumentIntelligenceService({ historyRootPath: '/virtual/history' })
    const sourcePath = '/virtual/docs/source.md'
    const targetPath = '/virtual/docs/target.md'

    service.indexDocument(sourcePath, '[Target](./target.md)')

    expect(service.getBacklinks(targetPath)).toMatchObject([
      { sourcePath, destination: './target.md', label: 'Target' }
    ])
    expect(
      service.prepareRenameRepair({
        fromPath: targetPath,
        toPath: '/virtual/docs/renamed.md',
        documents: [{ pathname: sourcePath, markdown: '[Target](./target.md)' }]
      })
    ).toMatchObject({ linkCount: 1 })
  })
})
