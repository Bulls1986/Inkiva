import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {
  enterSourceMode,
  exitSourceMode,
  expectNoRendererErrors,
  launchElectron,
  sendIpcToRenderer,
  waitForEditor,
  waitForMenuReady
} from './helpers'

const createdDirs: string[] = []

// Known-valid 32x1200 PNG. Keep the fixture static so a failure proves editor
// path/rendering behavior rather than a bug in test-side PNG construction.
const TALL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAASwCAYAAACaU0ikAAACe0lEQVR4nO3OQQEAMAjEsGNqJnFi8TJk8EkNNHVf/yx2NucAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEkytLcL290SzOcAAAAASUVORK5CYII='

const writeFixture = (
  imageSource = '资源%20图片/架构图%2001.png'
): { docPath: string; imagePath: string } => {
  const docDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-e2e-图片虚拟化-'))
  createdDirs.push(docDir)
  const imageDir = path.join(docDir, '资源 图片')
  fs.mkdirSync(imageDir, { recursive: true })
  const imagePath = path.join(imageDir, '架构图 01.png')
  const png = Buffer.from(TALL_PNG_BASE64, 'base64')
  fs.writeFileSync(imagePath, png)
  const asciiImageDir = path.join(docDir, 'assets')
  fs.mkdirSync(asciiImageDir, { recursive: true })
  fs.writeFileSync(path.join(asciiImageDir, 'tall.png'), png)

  const parts: string[] = ['# 本地图片虚拟化']
  for (let index = 0; index < 260; index++) parts.push('图片前段落 ' + index)
  parts.push('本地图片导航锚点 IMAGE_NAV_TARGET')
  // Use the same escaped destination Inkiva generates when users insert a
  // local path containing spaces (encodeImageSrc: space -> %20).
  parts.push(`![架构图](${imageSource})`)
  for (let index = 0; index < 260; index++) parts.push('图片后段落 ' + index)

  const docPath = path.join(docDir, '中文 图片测试.md')
  fs.writeFileSync(docPath, parts.join('\n\n') + '\n', 'utf-8')
  return { docPath, imagePath }
}

const sourceValue = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const root = document.querySelector('.source-code .CodeMirror') as
      | (Element & { CodeMirror?: { getValue(): string } })
      | null
    return root?.CodeMirror?.getValue() ?? ''
  })

const revealImageRegion = async(app: ElectronApplication, page: Page): Promise<void> => {
  await sendIpcToRenderer(app, 'mt::editor-edit-action', 'find')
  const input = page.locator('.search-bar .search input')
  await expect(input).toBeVisible()
  await input.fill('IMAGE_NAV_TARGET')
  await expect(page.locator('.search-result')).toContainText('1 / 1', { timeout: 8000 })
  await expect(page.locator('.mu-highlight').first()).toBeVisible({ timeout: 8000 })
  await page.keyboard.press('Escape')
}

test.describe('@virtualization-core virtualization local-image regressions', () => {
  let app: ElectronApplication
  let page: Page
  let imagePath: string

  test.beforeEach(async() => {
    const fixture = writeFixture()
    imagePath = fixture.imagePath
    const launched = await launchElectron([fixture.docPath], {
      suppressErrorDialog: true,
      waitForEditorTimeout: 30000
    })
    app = launched.app
    page = launched.page
    await waitForEditor(page, 30000)
    await waitForMenuReady(app)
  })

  test.afterEach(async() => {
    if (app) await app.close()
  })

  test.afterAll(() => {
    for (const dir of createdDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true })
      } catch {
        // Best-effort test cleanup only.
      }
    }
  })

  test('IMG-VIRT-009/IMG-CN-002: an offscreen Chinese local image is not mounted until its virtual region is visited', async() => {
    expect(fs.existsSync(imagePath)).toBe(true)
    expect(await page.locator('.mu-image-container img').count()).toBe(0)

    // Navigate independently of the Outline implementation. Find must mount
    // the logical paragraph immediately before the image; the adjacent image
    // should then enter the virtualization window and load from local disk.
    await revealImageRegion(app, page)

    const image = page.locator('.mu-image-container img').first()
    await expect(image).toBeVisible({ timeout: 10000 })
    await expect
      .poll(() =>
        page.evaluate(() => {
          const img = document.querySelector<HTMLImageElement>('.mu-image-container img')
          return img ? { complete: img.complete, naturalHeight: img.naturalHeight } : null
        })
      )
      .toEqual({ complete: true, naturalHeight: 1200 })
    await expectNoRendererErrors(app)
  })

  test('IMG-VIRT-009 control: an equivalent ASCII relative image loads after its offscreen region is mounted', async() => {
    await app.close()
    const fixture = writeFixture('assets/tall.png')
    const launched = await launchElectron([fixture.docPath], {
      suppressErrorDialog: true,
      waitForEditorTimeout: 30000
    })
    app = launched.app
    page = launched.page
    await waitForEditor(page, 30000)
    await waitForMenuReady(app)

    expect(await page.locator('.mu-image-container img').count()).toBe(0)
    await revealImageRegion(app, page)

    const image = page.locator('.mu-image-container img').first()
    await expect(image).toBeVisible({ timeout: 10000 })
    await expect
      .poll(() =>
        page.evaluate(() => {
          const img = document.querySelector<HTMLImageElement>('.mu-image-container img')
          return img ? { complete: img.complete, naturalHeight: img.naturalHeight } : null
        })
      )
      .toEqual({ complete: true, naturalHeight: 1200 })
    await expectNoRendererErrors(app)
  })

  test('IMG-SRC-001/IMG-SRC-007: Source round-trip preserves Chinese/space local image syntax and returns to bounded WYSIWYG', async() => {
    await enterSourceMode(page, app)
    const markdown = await sourceValue(page)
    expect(markdown).toContain('![架构图](资源%20图片/架构图%2001.png)')
    expect(markdown).toContain('图片后段落 259')
    await exitSourceMode(page, app)

    const virtualization = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>(
        '.mu-container[data-virtualization-enabled="true"]'
      )
      return {
        enabled: !!root,
        total: Number(root?.dataset.virtualTotalBlocks ?? 0),
        mounted: Number(root?.dataset.virtualMountedBlocks ?? 0)
      }
    })
    expect(virtualization.enabled).toBe(true)
    expect(virtualization.mounted).toBeGreaterThan(0)
    expect(virtualization.mounted).toBeLessThan(virtualization.total / 2)
    await expectNoRendererErrors(app)
  })
})
