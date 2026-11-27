import { expect, test } from '@playwright/test'
import type { Page } from 'playwright'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { launchElectron, waitForEditor } from './helpers'

// F5/F6 acceptance: collapse state is restored across a real application quit and
// relaunch of the same file, and only then. Every case here drives the production
// IPC + main-process store; nothing is stubbed.

const DOCUMENT = [
  '# Product guide',
  '',
  '## Installation',
  '',
  'Install the app.',
  '',
  '### Windows',
  '',
  'Windows notes.',
  '',
  '## Configuration',
  '',
  'Configuration notes.',
  ''
].join('\n')

const heading = (page: Page, text: string) =>
  page.locator('.mu-container > h1, .mu-container > h2, .mu-container > h3')
    .filter({ hasText: text })
    .first()

const toggle = (page: Page, text: string) =>
  heading(page, text).getByTestId('heading-collapse-toggle')

const isCollapsed = async(page: Page, text: string): Promise<boolean> =>
  (await toggle(page, text).getAttribute('aria-expanded')) === 'false'

const setup = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-collapse-'))
  const file = path.join(dir, 'doc.md')
  const userDataDir = path.join(dir, 'userdata')
  fs.mkdirSync(userDataDir)
  fs.writeFileSync(file, DOCUMENT)
  return { dir, file, userDataDir }
}

const launchOn = async(file: string, userDataDir: string) =>
  await launchElectron([file], { userDataDir, suppressErrorDialog: true })

test.describe.configure({ timeout: 180_000 })

test.describe('cross-session heading collapse', () => {
  test('restores a collapsed section after quitting immediately and relaunching', async() => {
    const { dir, file, userDataDir } = setup()
    const first = await launchOn(file, userDataDir)
    try {
      await waitForEditor(first.page)
      await toggle(first.page, 'Installation').click()
      await expect.poll(() => isCollapsed(first.page, 'Installation')).toBe(true)
    } finally {
      // Quit right away: the record must already be on disk.
      await first.app.close()
    }

    const second = await launchOn(file, userDataDir)
    try {
      await waitForEditor(second.page)
      await expect
        .poll(() => isCollapsed(second.page, 'Installation'), { timeout: 20_000 })
        .toBe(true)
      expect(await isCollapsed(second.page, 'Configuration')).toBe(false)
    } finally {
      await second.app.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('opens expanded when the same path now holds a different file', async() => {
    const { dir, file, userDataDir } = setup()
    const first = await launchOn(file, userDataDir)
    try {
      await waitForEditor(first.page)
      await toggle(first.page, 'Installation').click()
      await expect.poll(() => isCollapsed(first.page, 'Installation')).toBe(true)
    } finally {
      await first.app.close()
    }

    // Replace the file at the same path: new inode, so it is a different document.
    fs.rmSync(file)
    fs.writeFileSync(file, DOCUMENT)

    const second = await launchOn(file, userDataDir)
    try {
      await waitForEditor(second.page)
      await expect.poll(() => isCollapsed(second.page, 'Installation'), { timeout: 5_000 }).toBe(false)
    } finally {
      await second.app.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('opens expanded for a copy with identical content', async() => {
    const { dir, file, userDataDir } = setup()
    const first = await launchOn(file, userDataDir)
    try {
      await waitForEditor(first.page)
      await toggle(first.page, 'Installation').click()
      await expect.poll(() => isCollapsed(first.page, 'Installation')).toBe(true)
    } finally {
      await first.app.close()
    }

    const copy = path.join(dir, 'doc-copy.md')
    fs.copyFileSync(file, copy)

    const second = await launchOn(copy, userDataDir)
    try {
      await waitForEditor(second.page)
      await expect.poll(() => isCollapsed(second.page, 'Installation'), { timeout: 5_000 }).toBe(false)
    } finally {
      await second.app.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('keeps the state across an application save that replaces the file', async() => {
    const { dir, file, userDataDir } = setup()
    const first = await launchOn(file, userDataDir)
    try {
      await waitForEditor(first.page)
      await toggle(first.page, 'Installation').click()
      await expect.poll(() => isCollapsed(first.page, 'Installation')).toBe(true)

      // The app's own atomic save replaces the inode.
      await first.page.keyboard.press(process.platform === 'darwin' ? 'Meta+S' : 'Control+S')
      await expect
        .poll(async() => (await fs.promises.stat(file)).size, { timeout: 10_000 })
        .toBeGreaterThan(0)
      await first.page.waitForTimeout(1_000)
    } finally {
      await first.app.close()
    }

    const second = await launchOn(file, userDataDir)
    try {
      await waitForEditor(second.page)
      await expect
        .poll(() => isCollapsed(second.page, 'Installation'), { timeout: 20_000 })
        .toBe(true)
    } finally {
      await second.app.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('keeps the state when the file is moved within the same volume', async() => {
    const { dir, file, userDataDir } = setup()
    const first = await launchOn(file, userDataDir)
    try {
      await waitForEditor(first.page)
      await toggle(first.page, 'Installation').click()
      await expect.poll(() => isCollapsed(first.page, 'Installation')).toBe(true)
    } finally {
      await first.app.close()
    }

    const moved = path.join(dir, 'renamed.md')
    fs.renameSync(file, moved)

    const second = await launchOn(moved, userDataDir)
    try {
      await waitForEditor(second.page)
      await expect
        .poll(() => isCollapsed(second.page, 'Installation'), { timeout: 20_000 })
        .toBe(true)
    } finally {
      await second.app.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('opens normally when the stored state is corrupt', async() => {
    const { dir, file, userDataDir } = setup()
    const first = await launchOn(file, userDataDir)
    try {
      await waitForEditor(first.page)
      await toggle(first.page, 'Installation').click()
      await expect.poll(() => isCollapsed(first.page, 'Installation')).toBe(true)
    } finally {
      await first.app.close()
    }

    fs.writeFileSync(path.join(userDataDir, 'collapse-state.json'), '{not json')

    const second = await launchOn(file, userDataDir)
    try {
      await waitForEditor(second.page)
      await expect.poll(() => isCollapsed(second.page, 'Installation'), { timeout: 5_000 }).toBe(false)
      await expect(heading(second.page, 'Installation')).toBeVisible()
    } finally {
      await second.app.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
