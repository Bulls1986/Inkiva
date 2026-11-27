import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { launchElectron, waitForEditor } from './helpers'

// Regressions for the three defects found in the independent pre-verification of
// PR #291. All three drive the production path (no stubs).

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
  '',
  '## Notes',
  '',
  'First notes.',
  ''
].join('\n')

const heading = (page: Page, text: string) =>
  page.locator('.mu-container > h1:visible, .mu-container > h2:visible, .mu-container > h3:visible')
    .filter({ hasText: text })
    .first()

const toggle = (page: Page, text: string) =>
  heading(page, text).getByTestId('heading-collapse-toggle')

const isCollapsed = async(page: Page, text: string): Promise<boolean> =>
  (await toggle(page, text).getAttribute('aria-expanded', { timeout: 10_000 })) === 'false'

const setup = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-collapse-reg-'))
  const file = path.join(dir, 'doc.md')
  const userDataDir = path.join(dir, 'userdata')
  fs.mkdirSync(userDataDir)
  fs.writeFileSync(file, DOCUMENT)
  return { dir, file, userDataDir }
}

const launchOn = async(file: string, userDataDir: string, extra: string[] = []) =>
  await launchElectron([file, ...extra], { userDataDir, suppressErrorDialog: true })

test.describe.configure({ timeout: 240_000 })

test.describe('collapse pre-verification regressions', () => {
  test('pruning a stale key must not wipe the restored collapses (D1)', async() => {
    const { dir, file, userDataDir } = setup()
    const first = await launchOn(file, userDataDir)
    try {
      await waitForEditor(first.page)
      await toggle(first.page, 'Installation').click()
      await toggle(first.page, 'Configuration').click()
      await expect.poll(() => isCollapsed(first.page, 'Installation')).toBe(true)
      await expect.poll(() => isCollapsed(first.page, 'Configuration')).toBe(true)
    } finally {
      await first.app.close()
    }

    // Rename a NON-collapsed heading: exactly one stale record.
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('### Windows', '### Win32'))

    const second = await launchOn(file, userDataDir)
    try {
      await waitForEditor(second.page)
      await expect.poll(() => isCollapsed(second.page, 'Installation'), { timeout: 20_000 }).toBe(true)
      expect(await isCollapsed(second.page, 'Configuration')).toBe(true)
    } finally {
      await second.app.close()
    }

    // The prune save must not have replaced the restored record with "expanded".
    const third = await launchOn(file, userDataDir)
    try {
      await waitForEditor(third.page)
      await expect.poll(() => isCollapsed(third.page, 'Installation'), { timeout: 20_000 }).toBe(true)
      expect(await isCollapsed(third.page, 'Configuration')).toBe(true)
    } finally {
      await third.app.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('a document without a record never inherits the previous document state (D2)', async() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-collapse-reg-switch-'))
    const userDataDir = path.join(dir, 'userdata')
    fs.mkdirSync(userDataDir)
    const fileA = path.join(dir, 'a.md')
    const fileB = path.join(dir, 'b.md')
    fs.writeFileSync(fileA, DOCUMENT)
    fs.writeFileSync(fileB, '# Other doc\n\n## Installation\n\nB notes.\n\n## Configuration\n\nB notes.\n')
    try {
      const first = await launchOn(fileA, userDataDir)
      try {
        await waitForEditor(first.page)
        await toggle(first.page, 'Installation').click()
        await expect.poll(() => isCollapsed(first.page, 'Installation')).toBe(true)
      } finally {
        await first.app.close()
      }

      const second = await launchOn(fileA, userDataDir, [fileB])
      try {
        await waitForEditor(second.page)
        await expect.poll(() => isCollapsed(second.page, 'Installation'), { timeout: 20_000 }).toBe(true)
        await second.page.locator('[data-testid="document-tabs"] li[role="tab"]')
          .filter({ hasText: 'b.md' })
          .click()
        await expect
          .poll(() => heading(second.page, 'Other doc').isVisible(), { timeout: 20_000 })
          .toBe(true)
        await second.page.waitForTimeout(2_000)
        expect(
          await isCollapsed(second.page, 'Installation').catch(() => false),
          'B must not inherit the collapse state of A'
        ).toBe(false)
      } finally {
        await second.app.close()
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('an inserted identical heading stays expanded instead of guessing (D3)', async() => {
    const { dir, file, userDataDir } = setup()
    const first = await launchOn(file, userDataDir)
    try {
      await waitForEditor(first.page)
      await toggle(first.page, 'Notes').click()
      await expect.poll(() => isCollapsed(first.page, 'Notes')).toBe(true)
    } finally {
      await first.app.close()
    }

    fs.writeFileSync(
      file,
      fs.readFileSync(file, 'utf8').replace('## Notes', '## Notes\n\nInserted.\n\n## Notes')
    )

    const second = await launchOn(file, userDataDir)
    try {
      await waitForEditor(second.page)
      const notes = second.page
        .locator('.mu-container > h1:visible, .mu-container > h2:visible, .mu-container > h3:visible')
        .filter({ hasText: 'Notes' })
      await expect.poll(() => notes.count(), { timeout: 20_000 }).toBe(2)
      await second.page.waitForTimeout(2_000)
      const states = [
        (await notes.nth(0).getByTestId('heading-collapse-toggle').getAttribute('aria-expanded')) === 'false',
        (await notes.nth(1).getByTestId('heading-collapse-toggle').getAttribute('aria-expanded')) === 'false'
      ]
      expect(states, 'an uncertain heading match must leave both expanded').toEqual([false, false])
    } finally {
      await second.app.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
