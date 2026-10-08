import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { DocumentIntelligenceService } from 'main_renderer/documentIntelligence/documentIntelligenceService'

const temporaryRoots: string[] = []
const createWorkspace = async(): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'inkiva-v06-workspace-'))
  temporaryRoots.push(root)
  return root
}

afterEach(async() => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe('V06-02 workspace Markdown links', () => {
  it('includes unopened workspace Markdown sources in backlinks', async() => {
    const root = await createWorkspace()
    const target = path.join(root, 'target.md')
    const source = path.join(root, 'notes', 'unopened.md')
    await fs.mkdir(path.dirname(source))
    await fs.writeFile(target, '# Target')
    await fs.writeFile(source, '[Target](../target.md)')
    const service = new DocumentIntelligenceService({ historyRootPath: path.join(root, '.history') })
    await service.indexWorkspace(root)
    expect(service.getBacklinks(target)).toEqual([
      expect.objectContaining({ destination: '../target.md' })
    ])
  })

  it('keeps an unsaved tab edit authoritative and restores disk content on tab close', async() => {
    const root = await createWorkspace()
    const target = path.join(root, 'target.md')
    const source = path.join(root, 'source.md')
    await fs.writeFile(target, '# Target')
    await fs.writeFile(source, '[Target](./target.md)')
    const service = new DocumentIntelligenceService({ historyRootPath: path.join(root, '.history') })
    await service.indexWorkspace(root)
    service.indexDocument(source, '# No link (unsaved)')
    expect(service.getBacklinks(target)).toHaveLength(0)
    service.removeDocument(source)
    expect(service.getBacklinks(target)).toHaveLength(1)
  })

  it('drops backlinks from the previous workspace when switching roots', async() => {
    const a = await createWorkspace()
    const b = await createWorkspace()
    const target = path.join(a, 'target.md')
    await fs.writeFile(target, '# A')
    await fs.writeFile(path.join(a, 'source.md'), '[A](./target.md)')
    await fs.writeFile(path.join(b, 'unrelated.md'), '# B')
    const service = new DocumentIntelligenceService({ historyRootPath: path.join(a, '.history') })
    await service.indexWorkspace(a)
    expect(service.getBacklinks(target)).toHaveLength(1)
    await service.indexWorkspace(b)
    expect(service.getBacklinks(target)).toHaveLength(0)
  })

  it('ignores a stale workspace scan that finishes after a newer root is selected', async() => {
    const a = await createWorkspace()
    const b = await createWorkspace()
    const oldTarget = path.join(a, 'old.md')
    const newTarget = path.join(b, 'new.md')
    const oldSource = path.join(a, 'source.md')
    await fs.writeFile(oldTarget, '# Old')
    await fs.writeFile(newTarget, '# New')
    await fs.writeFile(oldSource, '[Old](./old.md)')
    await fs.writeFile(path.join(b, 'source.md'), '[New](./new.md)')

    let resumeOldRead!: () => void
    let oldReadStarted!: () => void
    const oldReadPending = new Promise<void>((resolve) => { resumeOldRead = resolve })
    const oldReadEntered = new Promise<void>((resolve) => { oldReadStarted = resolve })
    const service = new DocumentIntelligenceService({
      historyRootPath: path.join(a, '.history'),
      files: {
        readFile: async(pathname) => {
          if (pathname === oldSource) {
            oldReadStarted()
            await oldReadPending
          }
          return fs.readFile(pathname, 'utf8')
        },
        writeFile: async(pathname, content) => { await fs.writeFile(pathname, content) }
      }
    })
    const stale = service.indexWorkspace(a)
    await oldReadEntered
    const latest = await service.indexWorkspace(b)
    resumeOldRead()
    expect((await stale).complete).toBe(false)
    expect(latest.complete).toBe(true)
    expect(service.getBacklinks(oldTarget)).toHaveLength(0)
    expect(service.getBacklinks(newTarget)).toHaveLength(1)
  })

  it('keeps two editor windows with different workspace roots isolated', async() => {
    const a = await createWorkspace()
    const b = await createWorkspace()
    const aTarget = path.join(a, 'target.md')
    const bTarget = path.join(b, 'target.md')
    await fs.writeFile(aTarget, '# A')
    await fs.writeFile(bTarget, '# B')
    await fs.writeFile(path.join(a, 'source.md'), '[A](./target.md)')
    await fs.writeFile(path.join(b, 'source.md'), '[B](./target.md)')
    const service = new DocumentIntelligenceService({ historyRootPath: path.join(a, '.history') })

    await service.indexWorkspace(a, 11)
    await service.indexWorkspace(b, 22)

    expect(service.getBacklinks(aTarget, 11)).toHaveLength(1)
    expect(service.getBacklinks(bTarget, 22)).toHaveLength(1)
    expect(service.getBacklinks(bTarget, 11)).toHaveLength(0)
    expect(service.getBacklinks(aTarget, 22)).toHaveLength(0)
  })
})
