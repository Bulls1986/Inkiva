import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { RecoveryCenterSession } from 'main_renderer/session/recoveryCenter'
import type { RestorePlan } from 'main_renderer/session/restorePlan'

const tempDirs: string[] = []

const createTempDir = async(): Promise<string> => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'inkiva-us02-'))
  tempDirs.push(dir)
  return dir
}

const createPlan = (
  filePath: string,
  recoverySource: string,
  markdown = '# V2'
): RestorePlan => {
  const tab = {
    id: 'tab-1',
    filename: path.basename(filePath),
    pathname: filePath,
    markdown,
    isSaved: false
  }
  const state = {
    currentFileId: tab.id,
    tabs: [tab]
  }

  return {
    kind: 'restore',
    windows: [],
    state,
    automaticState: { ...state, currentFileId: null, tabs: [] },
    pendingTabs: [tab],
    primarySource: { id: 'source-1', filePath: recoverySource },
    sources: [{ id: 'source-1', filePath: recoverySource }],
    skippedSources: []
  }
}

afterEach(async() => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('recovery center', () => {
  it('opens the protected revision as a new document without overwriting or consuming disk V1', async() => {
    const dir = await createTempDir()
    const filePath = path.join(dir, 'note.md')
    const recoverySource = path.join(dir, 'buffer.json')
    await writeFile(filePath, '# V1', 'utf8')
    await writeFile(recoverySource, '{}', 'utf8')

    const writeBufferStoreFile = vi.fn(async() => undefined)
    const session = new RecoveryCenterSession()
    session.setRestorePlan(createPlan(filePath, recoverySource), {
      safeMode: false,
      bufferStore: { writeBufferStoreFile } as never,
      userDataPath: dir
    })

    const before = await session.getState()
    const item = before.items[0]!
    expect(item.diskMarkdown).toBe('# V1')
    expect(item.recoveryMarkdown).toBe('# V2')
    expect(item.differsFromDisk).toBe(true)

    await expect(session.openAsNewDocument(item.id)).resolves.toEqual({
      markdown: '# V2',
      sourcePath: filePath
    })
    await expect(readFile(filePath, 'utf8')).resolves.toBe('# V1')

    const after = await session.getState()
    expect(after.items.map(({ id }) => id)).toContain(item.id)
    expect(writeBufferStoreFile).not.toHaveBeenCalled()
  })

  it('blocks replacement when the disk changes after preview and preserves the external V3', async() => {
    const dir = await createTempDir()
    const filePath = path.join(dir, 'note.md')
    const recoverySource = path.join(dir, 'buffer.json')
    await writeFile(filePath, '# V1', 'utf8')
    await writeFile(recoverySource, '{}', 'utf8')

    const session = new RecoveryCenterSession()
    session.setRestorePlan(createPlan(filePath, recoverySource), {
      safeMode: false,
      bufferStore: { writeBufferStoreFile: vi.fn(async() => undefined) } as never,
      userDataPath: dir
    })

    const item = (await session.getState()).items[0]!
    await writeFile(filePath, '# V3 external', 'utf8')

    await expect(session.replaceFile(item.id, item.diskRevision)).resolves.toMatchObject({
      ok: false,
      reason: 'external-change',
      message: '文件已在外部更改'
    })
    await expect(readFile(filePath, 'utf8')).resolves.toBe('# V3 external')
    expect((await session.getState()).items).toHaveLength(1)
  })

  it('discards safe-mode workspace recovery state only after an explicit decision', async() => {
    const dir = await createTempDir()
    const filePath = path.join(dir, 'note.md')
    const recoverySource = path.join(dir, 'buffer.json')
    const damagedSource = path.join(dir, 'damaged.json')
    await writeFile(filePath, '# V1', 'utf8')
    await writeFile(recoverySource, '{}', 'utf8')
    await writeFile(damagedSource, '{broken', 'utf8')

    const plan = createPlan(filePath, recoverySource)
    plan.skippedSources.push({
      id: 'damaged',
      filePath: damagedSource,
      reason: 'read-failed',
      message: 'invalid JSON'
    })

    const session = new RecoveryCenterSession()
    session.setRestorePlan(plan, {
      safeMode: true,
      bufferStore: { writeBufferStoreFile: vi.fn(async() => undefined) } as never,
      userDataPath: dir
    })

    await expect(session.discardWorkspaceState()).resolves.toBe(true)
    await expect(readFile(filePath, 'utf8')).resolves.toBe('# V1')
    await expect(readFile(recoverySource, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(damagedSource, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await session.getState()).items).toHaveLength(0)
  })

  it('keeps a damaged source visible without hiding a valid recovery revision', async() => {
    const dir = await createTempDir()
    const filePath = path.join(dir, 'note.md')
    const recoverySource = path.join(dir, 'buffer.json')
    const damagedSource = path.join(dir, 'damaged.json')
    await writeFile(filePath, '# V1', 'utf8')
    await writeFile(recoverySource, '{}', 'utf8')
    await writeFile(damagedSource, '{broken', 'utf8')

    const plan = createPlan(filePath, recoverySource)
    plan.skippedSources.push({
      id: 'damaged',
      filePath: damagedSource,
      reason: 'read-failed',
      message: 'invalid JSON'
    })

    const session = new RecoveryCenterSession()
    session.setRestorePlan(plan, {
      safeMode: true,
      bufferStore: { writeBufferStoreFile: vi.fn(async() => undefined) } as never,
      userDataPath: dir
    })

    const state = await session.getState()
    expect(state.safeMode).toBe(true)
    expect(state.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'revision', recoveryMarkdown: '# V2' }),
        expect.objectContaining({
          kind: 'damaged-source',
          sourcePath: damagedSource,
          error: 'invalid JSON'
        })
      ])
    )
  })
})
