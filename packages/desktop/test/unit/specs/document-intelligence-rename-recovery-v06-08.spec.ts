import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { DocumentIntelligenceService } from 'main_renderer/documentIntelligence/documentIntelligenceService'
import { canonicalDocumentPath } from 'main_renderer/documentIntelligence/markdownLinkIndex'
import {
  applyRenameRepairPlan,
  createRenameRepairPlan,
  StaleRenameRepairPlanError
} from 'main_renderer/documentIntelligence/renameRepair'

const scenario = () => {
  const root = path.resolve('/virtual/v06-08')
  const fromPath = path.join(root, 'old.md')
  const toPath = path.join(root, 'renamed.md')
  const first = canonicalDocumentPath(path.join(root, 'a.md'))
  const second = canonicalDocumentPath(path.join(root, 'b.md'))
  const before = '[Target](./old.md#heading) and [external](https://example.com/)'
  const plan = createRenameRepairPlan({
    fromPath,
    toPath,
    documents: [
      { pathname: first, markdown: before },
      { pathname: second, markdown: before }
    ]
  })
  return { first, second, before, plan }
}

describe('V06-08 LINK-AC14/15 / guarded multi-document rename repair', () => {
  it('on the second write failure restores the first file and exposes retained recovery points', async() => {
    const { first, second, before, plan } = scenario()
    const disk = new Map([[first, before], [second, before]])
    const snapshots = new Map<string, string>()
    const writes: string[] = []
    const adapter = {
      readFile: vi.fn(async(filePath: string) => disk.get(filePath) ?? ''),
      writeFile: vi.fn(async(filePath: string, markdown: string) => {
        writes.push(filePath)
        if (filePath === second) throw new Error('injected second-file disk failure')
        disk.set(filePath, markdown)
      })
    }
    const result = await applyRenameRepairPlan(plan, 'update', adapter, {
      recovery: {
        create: async(filePath, content) => {
          const id = 'snapshot-' + path.basename(filePath)
          snapshots.set(id, content)
          return id
        },
        verify: async(_filePath, id, content) => snapshots.get(id) === content
      }
    })
    expect(result).toMatchObject({
      decision: 'update',
      outcome: 'rolled-back',
      failedPath: second,
      updatedPaths: [],
      rolledBackPaths: [first]
    })
    expect(result.recoveryPoints).toHaveLength(2)
    expect(writes).toEqual([first, second, first])
    expect(disk.get(first)).toBe(before)
    expect(disk.get(second)).toBe(before)
  })

  it('a failed rollback reports the surviving write and a verifiable recovery snapshot', async() => {
    const { first, second, before, plan } = scenario()
    const disk = new Map([[first, before], [second, before]])
    const snapshots = new Map<string, string>()
    const adapter = {
      readFile: vi.fn(async(filePath: string) => disk.get(filePath) ?? ''),
      writeFile: vi.fn(async(filePath: string, markdown: string) => {
        if (filePath === second || (filePath === first && markdown === before)) {
          throw new Error('injected write/rollback failure')
        }
        disk.set(filePath, markdown)
      })
    }
    const result = await applyRenameRepairPlan(plan, 'update', adapter, {
      recovery: {
        create: async(filePath, content) => {
          const id = 'snapshot-' + path.basename(filePath)
          snapshots.set(id, content)
          return id
        },
        verify: async(_filePath, id, content) => snapshots.get(id) === content
      }
    })
    expect(result).toMatchObject({
      outcome: 'partial',
      failedPath: second,
      updatedPaths: [first],
      rollbackFailedPaths: [first]
    })
    expect(result.recoveryPoints).toEqual(expect.arrayContaining([
      { filePath: first, snapshotId: 'snapshot-a.md' }
    ]))
    expect(disk.get(first)).toBe(plan.changes[0]?.after)
    expect(snapshots.get('snapshot-a.md')).toBe(before)
  })

  it('refuses all writes if a planned source changed while the user reviewed the plan', async() => {
    const { first, second, before, plan } = scenario()
    const adapter = {
      readFile: vi.fn(async(filePath: string) =>
        filePath === second ? 'newer external edit' : before
      ),
      writeFile: vi.fn(async() => undefined)
    }
    await expect(applyRenameRepairPlan(plan, 'update', adapter)).rejects.toBeInstanceOf(
      StaleRenameRepairPlanError
    )
    expect(adapter.writeFile).not.toHaveBeenCalled()
    expect(adapter.readFile).toHaveBeenCalledWith(first)
    expect(adapter.readFile).toHaveBeenCalledWith(second)
  })

  it('writes a moved source at its new path and retains an actual Local History preimage', async() => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'inkiva-v06-08-history-'))
    try {
      const fromPath = path.join(root, 'notes', 'moved.md')
      const toPath = path.join(root, 'archive', 'moved.md')
      const before = '[Guide](./guide.md)'
      const plan = createRenameRepairPlan({
        fromPath,
        toPath,
        includeResources: true,
        documents: [{ pathname: fromPath, markdown: before }]
      })
      const newPath = canonicalDocumentPath(toPath)
      const bytes = new Map([[newPath, before]])
      const adapter = {
        readFile: async(filePath: string) => bytes.get(filePath) ?? '',
        writeFile: async(filePath: string, content: string | Buffer) => {
          bytes.set(filePath, content.toString())
        }
      }
      const service = new DocumentIntelligenceService({
        historyRootPath: path.join(root, '.history'),
        files: adapter
      })
      const result = await service.applyRenameRepair({ plan, decision: 'update' })
      expect(result).toEqual({ decision: 'update', updatedPaths: [newPath] })
      expect(bytes.get(newPath)).toBe('[Guide](../notes/guide.md)')
      const entries = await service.listSnapshots(newPath)
      expect(entries).toHaveLength(1)
      const original = await service.getSnapshot(newPath, entries[0]!.id)
      expect(original?.content).toBe(before)
      expect(original?.reason).toBe('before-external-change')
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('the main service retains both original snapshots if the second disk write fails', async() => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'inkiva-v06-08-failure-'))
    try {
      const fromPath = path.join(root, 'old.md')
      const toPath = path.join(root, 'new.md')
      const first = canonicalDocumentPath(path.join(root, 'a.md'))
      const second = canonicalDocumentPath(path.join(root, 'b.md'))
      const before = '[Target](./old.md)'
      const plan = createRenameRepairPlan({
        fromPath,
        toPath,
        documents: [{ pathname: first, markdown: before }, { pathname: second, markdown: before }]
      })
      const disk = new Map([[first, before], [second, before]])
      const adapter = {
        readFile: async(filePath: string) => disk.get(filePath) ?? '',
        writeFile: async(filePath: string, content: string | Buffer) => {
          if (filePath === second) throw new Error('write failed on second file')
          disk.set(filePath, content.toString())
        }
      }
      const service = new DocumentIntelligenceService({
        historyRootPath: path.join(root, '.history'),
        files: adapter
      })
      const result = await service.applyRenameRepair({ plan, decision: 'update' })
      expect(result).toMatchObject({
        outcome: 'rolled-back', failedPath: second, updatedPaths: [], rolledBackPaths: [first]
      })
      expect(disk.get(first)).toBe(before)
      expect(disk.get(second)).toBe(before)
      for (const filePath of [first, second]) {
        const entries = await service.listSnapshots(filePath)
        expect(entries).toHaveLength(1)
        expect((await service.getSnapshot(filePath, entries[0]!.id))?.content).toBe(before)
      }
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('keeps relative path, fragments, external text and Unicode body unchanged when unaffected', () => {
    const root = path.resolve('/virtual/v06-08')
    const source = path.join(root, '源 文件.md')
    const before = '标题 🚀  \n[Moved](./old.md#片段)  \n[Other](https://example.com/old.md)\n'
    const plan = createRenameRepairPlan({
      fromPath: path.join(root, 'old.md'),
      toPath: path.join(root, 'new name.md'),
      documents: [{ pathname: source, markdown: before }]
    })
    expect(plan.changes).toHaveLength(1)
    expect(plan.changes[0]?.after).toContain('标题 🚀  \n')
    expect(plan.changes[0]?.after).toContain('[Other](https://example.com/old.md)\n')
    expect(plan.changes[0]?.after).toContain('#片段')
    expect(plan.linkCount).toBe(1)
  })
})
