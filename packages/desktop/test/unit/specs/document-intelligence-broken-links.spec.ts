import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DocumentIntelligenceService } from 'main_renderer/documentIntelligence/documentIntelligenceService'

const roots: string[] = []
const workspace = async(): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'inkiva-v06-diagnostics-'))
  roots.push(root)
  return root
}
const serviceFor = (root: string): DocumentIntelligenceService =>
  new DocumentIntelligenceService({ historyRootPath: path.join(root, '.history') })

afterEach(async() => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe('V06-06 broken Markdown links', () => {
  it('finds only missing document targets with exact source offsets', async() => {
    const root = await workspace()
    const source = path.join(root, 'source.md')
    await fs.writeFile(path.join(root, 'valid.md'), '# valid')
    const markdown = [
      '---', 'example: "[ignored](frontmatter.md)"', '---',
      '[Valid](./valid.md#anchor)', '[Missing](./missing.md)',
      '[Second](./missing.md)', '![image](./missing.md)',
      '`[inline](inline.md)`', '```md', '[fenced](fenced.md)', '```',
      '[reference][id]', '[id]: ./reference.md',
      '[External](https://example.org/missing.md)', '[Fragment](#unknown)',
      '[Bad encoding](./bad%ZZ.md)', '[Encoded](./missing%23name.markdown)'
    ].join('\n')
    await fs.writeFile(source, markdown)
    const service = serviceFor(root)
    await service.indexWorkspace(root)
    const result = await service.getBrokenMarkdownLinks()
    expect(result.complete).toBe(true)
    expect(result.stale).toBe(false)
    expect(result.findings.map(({ destination }) => destination))
      .toEqual(['./missing.md', './missing.md', './missing%23name.markdown'])
    expect(result.findings.every(({ status }) => status === 'missing-file')).toBe(true)
    expect(result.findings[0]).toEqual(expect.objectContaining({
      targetPath: path.join(root, 'missing.md'),
      line: 5,
      start: markdown.indexOf('[Missing]'),
      end: markdown.indexOf('[Missing]') + '[Missing](./missing.md)'.length,
      revision: expect.any(Number)
    }))
  })

  it('classifies denied reads as unverified rather than missing', async() => {
    const root = await workspace()
    await fs.writeFile(path.join(root, 'source.md'), '[Denied](./denied.md)')
    const service = new DocumentIntelligenceService({
      historyRootPath: path.join(root, '.history'),
      linkTargetStat: async(pathname) => {
        if (pathname === path.join(root, 'denied.md')) {
          throw Object.assign(new Error('access denied'), { code: 'EACCES' })
        }
        return fs.stat(pathname)
      }
    })
    await service.indexWorkspace(root)
    expect((await service.getBrokenMarkdownLinks()).findings).toEqual([
      expect.objectContaining({ status: 'unverified', reason: 'EACCES' })
    ])
  })

  it('discards pending reports after unsaved edits and workspace replacement', async() => {
    const root = await workspace()
    const source = path.join(root, 'source.md')
    await fs.writeFile(source, '[Missing](./missing.md)')
    let release!: () => void
    let entered!: () => void
    const pending = new Promise<void>((resolve) => { release = resolve })
    const started = new Promise<void>((resolve) => { entered = resolve })
    const service = new DocumentIntelligenceService({
      historyRootPath: path.join(root, '.history'),
      linkTargetStat: async(pathname) => { entered(); await pending; return fs.stat(pathname) }
    })
    await service.indexWorkspace(root)
    const stale = service.getBrokenMarkdownLinks()
    await started
    service.indexDocument(source, '# Unsaved replacement')
    release()
    expect(await stale).toEqual(expect.objectContaining({ stale: true, complete: false, findings: [] }))
    expect((await service.getBrokenMarkdownLinks()).findings).toEqual([])
    service.removeDocument(source)
    expect((await service.getBrokenMarkdownLinks()).findings).toHaveLength(1)
    await service.indexWorkspace(null)
    expect((await service.getBrokenMarkdownLinks()).findings).toEqual([])
  })

  it('keeps scopes isolated and ignores targets outside the workspace', async() => {
    const root = await workspace()
    const other = await workspace()
    await fs.writeFile(path.join(root, 'source.md'), '[Outside](../outside.md)\n[Missing](./missing.md)')
    await fs.writeFile(path.join(other, 'source.md'), '[Other](./missing.md)')
    const service = serviceFor(root)
    await service.indexWorkspace(root, 11)
    await service.indexWorkspace(other, 22)
    expect((await service.getBrokenMarkdownLinks(11)).findings.map(({ destination }) => destination))
      .toEqual(['./missing.md'])
    expect((await service.getBrokenMarkdownLinks(22)).findings).toHaveLength(1)
    service.closeScope(22)
    expect((await service.getBrokenMarkdownLinks(11)).findings).toHaveLength(1)
  })
})
