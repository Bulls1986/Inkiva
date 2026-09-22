import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repositoryRoot = path.resolve(process.cwd(), '../..')
const rendererRoot = path.join(repositoryRoot, 'packages/desktop/src/renderer/src')
const scrollPagePath = path.join(repositoryRoot, 'packages/muya/src/block/scrollPage/index.ts')

const collectSources = (directory: string): string[] => {
  const result: string[] = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      result.push(...collectSources(absolute))
    } else if (/\.(?:ts|vue)$/.test(entry.name)) {
      result.push(absolute)
    }
  }
  return result
}

describe('ARCH-03 virtual surface contract', () => {
  it('keeps Desktop renderer independent from virtualization implementation APIs', () => {
    const source = collectSources(rendererRoot)
      .map((filePath) => fs.readFileSync(filePath, 'utf8'))
      .join('\n')

    for (const forbiddenApi of [
      'getVirtualizationSnapshot',
      'getVirtualBlockOffset',
      'scrollVirtualBlockIntoView',
      'releaseVirtualResizeCorrectionForNavigation'
    ]) {
      expect(source, `Desktop renderer must not depend on ${forbiddenApi}`).not.toContain(forbiddenApi)
    }
  })

  it('exposes document-surface business operations at the Muya boundary', () => {
    const source = fs.readFileSync(scrollPagePath, 'utf8')

    expect(source).toMatch(/\brevealBlock\s*\(/)
    expect(source).toMatch(/\bgetBlockOffset\s*\(/)
    expect(source).toMatch(/\bisWindowed\s*\(/)
    expect(source).toMatch(/\bprepareForNavigation\s*\(/)
  })
})
