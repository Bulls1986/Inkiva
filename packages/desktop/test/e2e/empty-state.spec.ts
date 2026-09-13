import { expect, test } from '@playwright/test'
import { launchElectron, waitForMenuReady } from './helpers'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test.describe('Welcome surface', () => {
  test('appears when the last tab closes and creates a new document', async() => {
    const emptyDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-empty-state-e2e-'))
    const launched = await launchElectron([emptyDirectory])

    try {
      await waitForMenuReady(launched.app)

      const welcome = launched.page.locator('[data-testid="welcome-surface"]')
      await expect(welcome).toBeVisible()
      await expect(launched.page.locator('.editor-with-tabs')).toHaveCount(0)
      await expect(launched.page.locator('.tabs-container > li')).toHaveCount(0)
      await expect(launched.page.locator('[data-testid="welcome-open-file"]')).toBeVisible()
      await expect(launched.page.locator('[data-testid="welcome-quick-open"]')).toBeVisible()

      await launched.page.locator('[data-testid="welcome-new-file"]').click()
      await expect(launched.page.locator('.editor-with-tabs')).toBeVisible()
      await expect(launched.page.locator('[data-testid="welcome-surface"]')).toHaveCount(0)
    } finally {
      await launched.app.close()
      fs.rmSync(emptyDirectory, { recursive: true, force: true })
    }
  })
})
