import { expect, test } from '@playwright/test'
import type { Page } from 'playwright'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { launchElectron, waitForEditor } from './helpers'

// D7: a user collapse made while the stored record is still being read must not
// be lost by quitting immediately. The deferred write exists so the record is not
// erased before the restore settles; quitting inside that window used to drop it.

const DOCUMENT = [
  '# Product guide', '', '## Installation', '', 'Install.', '', '## Configuration', '', 'Configure.', ''
].join('\n')

const heading = (page: Page, text: string) =>
  page.locator('.mu-container > h1:visible, .mu-container > h2:visible').filter({ hasText: text }).first()
const toggle = (page: Page, text: string) => heading(page, text).getByTestId('heading-collapse-toggle')
const isCollapsed = async(page: Page, text: string) =>
  (await toggle(page, text).getAttribute('aria-expanded', { timeout: 10_000 })) === 'false'

test.describe.configure({ timeout: 240_000 })

test('D7: a collapse made while the record is loading survives an immediate quit', async() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-d7-'))
  const file = path.join(dir, 'doc.md')
  const userDataDir = path.join(dir, 'userdata')
  fs.mkdirSync(userDataDir)
  fs.writeFileSync(file, DOCUMENT)

  const seed = await launchElectron([file], { userDataDir, suppressErrorDialog: true })
  try {
    await waitForEditor(seed.page)
    await toggle(seed.page, 'Installation').click()
    await expect.poll(() => isCollapsed(seed.page, 'Installation')).toBe(true)
  } finally { await seed.app.close() }

  // Reopen with the record read held open, collapse a different heading and quit
  // at once: the deferred write is the only copy of that intent.
  const quick = await launchElectron([file], {
    userDataDir, suppressErrorDialog: true, env: { INKIVA_COLLAPSE_LOAD_DELAY_MS: '6000' }
  })
  try {
    await waitForEditor(quick.page)
    await expect.poll(() => heading(quick.page, 'Configuration').isVisible()).toBe(true)
    await toggle(quick.page, 'Configuration').click()
    await expect.poll(() => isCollapsed(quick.page, 'Configuration')).toBe(true)
  } finally {
    await quick.app.close()
  }

  const reopened = await launchElectron([file], { userDataDir, suppressErrorDialog: true })
  try {
    await waitForEditor(reopened.page)
    await expect
      .poll(() => isCollapsed(reopened.page, 'Configuration'), { timeout: 20_000 })
      .toBe(true)
  } finally {
    await reopened.app.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
