import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { launchElectron, waitForEditor } from './helpers'

test('V06-08 / LINK-AC14-15: real moved-file link repair through the main service retains recovery', async() => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'inkiva-v06-08-e2e-'))
  const notes = path.join(root, 'notes')
  const archive = path.join(root, 'archive')
  const fromPath = path.join(notes, 'current.md')
  const toPath = path.join(archive, 'current.md')
  const before = '[Guide](./guide.md) and [Web](https://example.com/)'
  const after = '[Guide](../notes/guide.md) and [Web](https://example.com/)'
  await fs.mkdir(notes)
  await fs.mkdir(archive)
  await fs.writeFile(path.join(notes, 'guide.md'), '# Guide')
  await fs.writeFile(fromPath, before)
  const { app, page } = await launchElectron([fromPath])
  try {
    await waitForEditor(page)
    await fs.rename(fromPath, toPath)

    const plan = await page.evaluate(async(input) =>
      window.documentIntelligence.prepareRenameRepair({
        ...input,
        includeResources: true,
        documents: [{ pathname: input.fromPath, markdown: input.markdown }]
      }),
    { fromPath, toPath, markdown: before })

    expect(plan.changes).toHaveLength(1)
    expect(plan.linkCount).toBe(1)
    const keep = await page.evaluate(async(planInput) =>
      window.documentIntelligence.applyRenameRepair({ plan: planInput, decision: 'keep' }),
    plan)
    expect(keep).toEqual({ decision: 'keep', updatedPaths: [] })
    expect(await fs.readFile(toPath, 'utf8')).toBe(before)

    const cancel = await page.evaluate(async(planInput) =>
      window.documentIntelligence.applyRenameRepair({ plan: planInput, decision: 'cancel' }),
    plan)
    expect(cancel).toEqual({ decision: 'cancel', updatedPaths: [] })
    expect(await fs.readFile(toPath, 'utf8')).toBe(before)

    const updated = await page.evaluate(async(planInput) =>
      window.documentIntelligence.applyRenameRepair({ plan: planInput, decision: 'update' }),
    plan)
    expect(updated.decision).toBe('update')
    expect(updated.outcome).toBeUndefined()
    await expect.poll(() => fs.readFile(toPath, 'utf8')).toBe(after)

    const snapshots = await page.evaluate(async(filePath) =>
      window.documentIntelligence.listSnapshots(filePath), toPath)
    expect(snapshots.length).toBeGreaterThan(0)
    const recovered = await page.evaluate(async({ filePath, id }) =>
      window.documentIntelligence.getSnapshot(filePath, id), {
      filePath: toPath,
      id: snapshots[0]!.id
    })
    expect(recovered?.content).toBe(before)
  } finally {
    await app.close()
    await fs.rm(root, { recursive: true, force: true })
  }
})