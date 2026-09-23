import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'

import {
  clearRendererErrors,
  clickMenuById,
  enterSourceMode,
  exitSourceMode,
  expectNoRendererErrors,
  launchWithMarkdown,
  sendIpcToRenderer
} from './helpers'

type SourcePosition = { line: number; ch: number }

const sourceValue = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const root = document.querySelector('.source-code .CodeMirror') as
      | (Element & { CodeMirror?: { getValue(): string } })
      | null
    if (!root?.CodeMirror) throw new Error('CodeMirror source editor is unavailable')
    return root.CodeMirror.getValue()
  })

const ensureSourceSurface = async(page: Page, app: ElectronApplication): Promise<void> => {
  const already = await page.evaluate(() => !!document.querySelector('.source-code .CodeMirror'))
  if (!already) await clickMenuById(app, 'sourceCodeModeMenuItem')
  await page.waitForSelector('.source-code .CodeMirror', { state: 'attached', timeout: 60000 })
  await page.waitForFunction(
    () => {
      const cm = document.querySelector('.source-code .CodeMirror') as
        | (Element & { CodeMirror?: unknown })
        | null
      return !!cm?.CodeMirror
    },
    null,
    { timeout: 60000 }
  )
}

const replaceSourceRange = (
  page: Page,
  text: string,
  from: SourcePosition,
  to?: SourcePosition
): Promise<void> =>
  page.evaluate(
    ({ text, from, to }) => {
      const root = document.querySelector('.source-code .CodeMirror') as
        | (Element & {
          CodeMirror?: {
            focus(): void
            replaceRange(text: string, from: SourcePosition, to?: SourcePosition): void
          }
        })
        | null
      if (!root?.CodeMirror) throw new Error('CodeMirror source editor is unavailable')
      root.CodeMirror.focus()
      root.CodeMirror.replaceRange(text, from, to)
    },
    { text, from, to }
  )

const setSourceValue = (page: Page, markdown: string): Promise<void> =>
  page.evaluate((value) => {
    const root = document.querySelector('.source-code .CodeMirror') as
      | (Element & { CodeMirror?: { setValue(value: string): void } })
      | null
    if (!root?.CodeMirror) throw new Error('CodeMirror source editor is unavailable')
    root.CodeMirror.setValue(value)
  }, markdown)

const save = (app: ElectronApplication): Promise<void> =>
  sendIpcToRenderer(app, 'mt::editor-ask-file-save')

const readDiskEventually = async(
  filePath: string,
  expected: string,
  timeout = 15000
): Promise<string> => {
  await expect
    .poll(() => (fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''), { timeout })
    .toContain(expected)
  return fs.readFileSync(filePath, 'utf8')
}

const sourceSelectAll = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const root = document.querySelector('.source-code .CodeMirror') as
      | (Element & {
        CodeMirror?: {
          focus(): void
          execCommand(name: string): void
          getSelection(): string
        }
      })
      | null
    if (!root?.CodeMirror) throw new Error('CodeMirror source editor is unavailable')
    root.CodeMirror.focus()
    root.CodeMirror.execCommand('selectAll')
    return root.CodeMirror.getSelection()
  })

const buildSizedMarkdown = (targetBytes: number): string => {
  const lines: string[] = ['# SOURCE_READINESS_HEAD']
  let bytes = Buffer.byteLength(lines[0] + '\n', 'utf8')
  let index = 0
  while (bytes < targetBytes - 80) {
    const line =
      'line-' +
      index.toString().padStart(7, '0') +
      ' Source readiness 中文 🚀 payload'
    lines.push(line)
    bytes += Buffer.byteLength(line + '\n', 'utf8')
    index += 1
  }
  lines.push('SOURCE_READINESS_TAIL')
  return lines.join('\n') + '\n'
}

test.describe('CORRECTNESS-02 / Source Mode readiness', () => {
  test('P0 revision/save: immediate save persists the newest source revision', async() => {
    const launched = await launchWithMarkdown('# Base\n\nbody\n', {
      suppressErrorDialog: true
    })
    try {
      await clearRendererErrors(launched.app)
      await enterSourceMode(launched.page, launched.app)
      await replaceSourceRange(
        launched.page,
        ' IMMEDIATE_SAVE',
        { line: 0, ch: '# Base'.length }
      )

      // Deliberately do not wait for the source debounce.
      await save(launched.app)
      const disk = await readDiskEventually(launched.filePath, '# Base IMMEDIATE_SAVE')
      expect(disk).toContain('body')
      expect(await sourceValue(launched.page)).toBe(disk)
      await expectNoRendererErrors(launched.app)
    } finally {
      await launched.app.close()
    }
  })

  test('P0 mode switch: an immediate Source edit cannot be stale-overwritten', async() => {
    const launched = await launchWithMarkdown('# A\n\nbody\n', {
      suppressErrorDialog: true
    })
    try {
      await clearRendererErrors(launched.app)
      await enterSourceMode(launched.page, launched.app)
      await replaceSourceRange(
        launched.page,
        'B',
        { line: 0, ch: 2 },
        { line: 0, ch: 3 }
      )
      await exitSourceMode(launched.page, launched.app)
      await expect(launched.page.locator('.editor-component')).toContainText('B')
      await enterSourceMode(launched.page, launched.app)
      expect(await sourceValue(launched.page)).toBe('# B\n\nbody\n')
      await expectNoRendererErrors(launched.app)
    } finally {
      await launched.app.close()
    }
  })

  test('P0 consistency: 100 Source/WYSIWYG switches preserve exact Markdown', async() => {
    test.setTimeout(120000)
    const launched = await launchWithMarkdown('# Switch baseline\n\nbody\n', {
      suppressErrorDialog: true
    })
    try {
      await clearRendererErrors(launched.app)
      let expected = '# Switch baseline\n\nbody\n'
      for (let cycle = 1; cycle <= 100; cycle++) {
        await enterSourceMode(launched.page, launched.app)
        await expect(launched.page.locator('.source-code .CodeMirror')).toHaveCount(1)
        if (cycle % 10 === 0) {
          const marker = 'cycle-' + String(cycle) + '\n'
          const lastLine = expected.split('\n').length - 1
          await replaceSourceRange(launched.page, marker, { line: lastLine, ch: 0 })
          expected += marker
        }
        expect(await sourceValue(launched.page)).toBe(expected)
        await exitSourceMode(launched.page, launched.app)
        await expect(launched.page.locator('.source-code .CodeMirror')).toHaveCount(0)
      }
      await enterSourceMode(launched.page, launched.app)
      expect(await sourceValue(launched.page)).toBe(expected)
      await save(launched.app)
      expect(await readDiskEventually(launched.filePath, 'cycle-100')).toBe(expected)
      await expectNoRendererErrors(launched.app)
    } finally {
      await launched.app.close()
    }
  })

  test('P0 clipboard/full document: Select All and Copy address complete source', async() => {
    const markdown =
      Array.from(
        { length: 1400 },
        (_, index) => 'line ' + index + ' 中文 mixed 🚀 ' + 'x'.repeat(24)
      ).join('\n') + '\n'
    const launched = await launchWithMarkdown(markdown, {
      suppressErrorDialog: true
    })
    try {
      await clearRendererErrors(launched.app)
      await enterSourceMode(launched.page, launched.app)
      expect(await sourceSelectAll(launched.page)).toBe(markdown)

      const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
      await launched.page.keyboard.press(modifier + '+C')
      const clipboard = await launched.app.evaluate(({ clipboard }) => clipboard.readText())
      expect(clipboard).toBe(markdown)
      await expectNoRendererErrors(launched.app)
    } finally {
      await launched.app.close()
    }
  })

  test('P0 invalid Markdown survives mode switch and save byte-for-byte', async() => {
    const fence = String.fromCharCode(96).repeat(3)
    const invalid = [
      '# Incomplete document',
      '',
      '**unclosed emphasis',
      '',
      '[unfinished link](',
      '',
      '![unfinished image](',
      '',
      '| bad | table |',
      '| --- |',
      '',
      fence + 'mermaid',
      'graph TD',
      '  A[开始] -->',
      '',
      '<div><span>unfinished html',
      '',
      fence + 'ts',
      'const incomplete = true'
    ].join('\n')
    const launched = await launchWithMarkdown('# baseline\n', {
      suppressErrorDialog: true
    })
    try {
      await clearRendererErrors(launched.app)
      await enterSourceMode(launched.page, launched.app)
      await setSourceValue(launched.page, invalid)
      expect(await sourceValue(launched.page)).toBe(invalid)

      await exitSourceMode(launched.page, launched.app)
      await enterSourceMode(launched.page, launched.app)
      expect(await sourceValue(launched.page)).toBe(invalid)

      await save(launched.app)
      const disk = await readDiskEventually(launched.filePath, 'unfinished html')
      expect(disk).toBe(invalid)
      await expectNoRendererErrors(launched.app)
    } finally {
      await launched.app.close()
    }
  })
})

for (const [label, bytes] of [
  ['50K', 50 * 1024],
  ['500K', 500 * 1024],
  ['1M', 1024 * 1024]
] as const) {
  test('CORRECTNESS-02 large Source ' + label + ': head/middle/tail save', async() => {
    test.setTimeout(label === '1M' ? 120000 : 60000)
    const initial = buildSizedMarkdown(bytes)
    const launched = await launchWithMarkdown(initial, {
      filename: 'source-readiness-' + label.toLowerCase() + '.md',
      suppressErrorDialog: true,
      waitForEditorTimeout: 60000
    })
    try {
      await clearRendererErrors(launched.app)
      await ensureSourceSurface(launched.page, launched.app)
      const source = await sourceValue(launched.page)
      expect(source).toBe(initial)

      const lines = source.split('\n')
      const middleLine = Math.floor((lines.length - 1) / 2)
      const tailLine = lines.length - 2
      await replaceSourceRange(launched.page, 'HEAD_EDIT ', { line: 0, ch: 0 })
      await replaceSourceRange(
        launched.page,
        ' MID_EDIT',
        { line: middleLine, ch: lines[middleLine].length }
      )
      await replaceSourceRange(
        launched.page,
        ' TAIL_EDIT',
        { line: tailLine, ch: lines[tailLine].length }
      )

      await save(launched.app)
      const disk = await readDiskEventually(launched.filePath, 'TAIL_EDIT', 30000)
      expect(disk.startsWith('HEAD_EDIT # SOURCE_READINESS_HEAD')).toBe(true)
      expect(disk).toContain(' MID_EDIT')
      expect(disk).toContain('SOURCE_READINESS_TAIL TAIL_EDIT')
      expect(Buffer.byteLength(disk, 'utf8')).toBeGreaterThan(bytes - 200)
      expect(await sourceValue(launched.page)).toBe(disk)
      await expectNoRendererErrors(launched.app)
    } finally {
      await launched.app.close()
    }
  })
}
