import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const desktopRoot = path.resolve(__dirname, '../../../')
const repositoryRoot = path.resolve(desktopRoot, '../..')

const readJson = <T>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, 'utf8')) as T

const collectSourceFiles = (directory: string): string[] => {
  const files: string[] = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(entryPath))
      continue
    }
    if (/\.(?:ts|tsx|vue|d\.ts)$/.test(entry.name)) files.push(entryPath)
  }
  return files
}

describe('Inkiva release and runtime identifiers', () => {
  it('uses the stable v0.1.0 version in every published package manifest', () => {
    const versionFiles = [
      path.join(repositoryRoot, 'package.json'),
      path.join(desktopRoot, 'package.json'),
      path.join(repositoryRoot, 'packages/website/package.json')
    ]

    expect(versionFiles.map((filePath) => readJson<{ version: string }>(filePath).version)).toEqual(
      ['0.1.0', '0.1.0', '0.1.0']
    )
  })

  it('does not expose active MarkText runtime identifiers', () => {
    const sourceFiles = [
      ...collectSourceFiles(path.join(desktopRoot, 'src')),
      path.join(desktopRoot, 'electron.vite.config.ts')
    ]
    const source = sourceFiles.map((filePath) => fs.readFileSync(filePath, 'utf8')).join('\n')

    expect(source).not.toMatch(/\bMARKTEXT_[A-Z0-9_]+\b/)
    expect(source).not.toMatch(/\bwindow\.marktext\b/)
    expect(source).toContain('window.inkiva')

    for (const identifier of [
      'INKIVA_VERSION',
      'INKIVA_VERSION_STRING',
      'INKIVA_DEBUG',
      'INKIVA_DEBUG_VERBOSE',
      'INKIVA_DEBUG_KEYBOARD',
      'INKIVA_SAFE_MODE',
      'INKIVA_ERROR_INTERACTION',
      'INKIVA_EXIT_ON_ERROR',
      'INKIVA_PANDOC',
      'INKIVA_RIPGREP_PATH',
      'INKIVA_IS_STABLE'
    ]) {
      expect(source, `missing runtime identifier ${identifier}`).toContain(identifier)
    }
  })

  it('documents only Inkiva environment variable names', () => {
    const environmentDocumentation = fs.readFileSync(
      path.join(repositoryRoot, 'packages/website/content/docs/end-user/ENVIRONMENT.md'),
      'utf8'
    )

    expect(environmentDocumentation).not.toMatch(/\bMARKTEXT_[A-Z0-9_]+\b/)
    expect(environmentDocumentation).toContain('INKIVA_DEBUG')
    expect(environmentDocumentation).toContain('INKIVA_PANDOC')
    expect(environmentDocumentation).toContain('INKIVA_EXIT_ON_ERROR')
  })
})
