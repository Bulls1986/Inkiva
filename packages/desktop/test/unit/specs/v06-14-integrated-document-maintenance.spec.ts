import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DocumentIntelligenceService } from 'main_renderer/documentIntelligence/documentIntelligenceService'
import { createRenameRepairPlan } from 'main_renderer/documentIntelligence/renameRepair'

describe('V06-14 integrated workspace document maintenance', () => {
  it('preserves ordinary Markdown bytes across unopened backlinks, a move, guarded repair and reindex', async() => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'inkiva-v06-14-'))
    try {
      const docs = path.join(root, 'docs')
      const notes = path.join(root, 'notes')
      await fs.mkdir(docs)
      await fs.mkdir(notes)
      const fromPath = path.join(docs, 'guide.md')
      const toPath = path.join(docs, 'renamed.md')
      const readmePath = path.join(root, 'README.md')
      const notePath = path.join(notes, 'details.md')
      const readmeBefore = [
        '# Workspace',
        '[Guide](./docs/guide.md#intro)',
        '![Unchanged asset](./docs/guide.md)',
        '`[Example only](./docs/guide.md)`',
        '[Website](https://example.com/guide.md)'
      ].join('\n')
      const noteBefore = '[Guide](../docs/guide.md "Manual")\n'

      await fs.writeFile(fromPath, '# Guide\n## Intro\n', 'utf8')
      await fs.writeFile(readmePath, readmeBefore, 'utf8')
      await fs.writeFile(notePath, noteBefore, 'utf8')
      const service = new DocumentIntelligenceService({ historyRootPath: path.join(root, '.history') })
      await service.indexWorkspace(root)
      expect(service.getBacklinks(fromPath)).toHaveLength(2)
      expect((await service.getBrokenMarkdownLinks()).findings).toEqual([])

      await fs.rename(fromPath, toPath)
      const plan = createRenameRepairPlan({
        fromPath,
        toPath,
        documents: [
          { pathname: readmePath, markdown: readmeBefore },
          { pathname: notePath, markdown: noteBefore }
        ]
      })
      expect(plan.linkCount).toBe(2)
      const result = await service.applyRenameRepair({ plan, decision: 'update' })
      expect(result).toMatchObject({ decision: 'update', updatedPaths: expect.any(Array) })
      expect(result.updatedPaths).toHaveLength(2)
      for (const [pathname, original] of [[readmePath, readmeBefore], [notePath, noteBefore]]) {
        const snapshots = await service.listSnapshots(pathname)
        expect(snapshots).toHaveLength(1)
        const snapshot = snapshots[0]
        if (!snapshot) throw new Error('missing expected recovery snapshot')
        expect((await service.getSnapshot(pathname, snapshot.id))?.content).toBe(original)
      }
      expect(await fs.readFile(readmePath, 'utf8')).toBe(readmeBefore.replace(
        './docs/guide.md#intro',
        './docs/renamed.md#intro'
      ))
      expect(await fs.readFile(notePath, 'utf8')).toBe('[Guide](../docs/renamed.md "Manual")\n')
      expect(await fs.readFile(toPath, 'utf8')).toBe('# Guide\n## Intro\n')

      await service.indexWorkspace(root)
      expect(service.getBacklinks(fromPath)).toEqual([])
      expect(service.getBacklinks(toPath)).toHaveLength(2)
      expect((await service.getBrokenMarkdownLinks()).findings).toEqual([])
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
