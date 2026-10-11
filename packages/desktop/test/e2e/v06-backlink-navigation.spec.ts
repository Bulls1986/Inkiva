import { expect, test } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { launchWithMarkdown, expectNoRendererErrors } from './helpers'

test('V06-05: unopened workspace backlinks show in the existing sidebar and open their source', async() => {
  const { app, page, filePath } = await launchWithMarkdown('# Target\n', {
    suppressErrorDialog: true
  })
  const root = path.dirname(filePath)
  const sourcePath = path.join(root, 'backlink-source.md')
  const destination = './' + path.basename(filePath)
  const sourceMarkdown = '[first](' + destination + ') and [second](' + destination + ')'
  fs.writeFileSync(sourcePath, sourceMarkdown)

  try {
    const scan = await page.evaluate(
      (workspace) => window.documentIntelligence.indexWorkspace(workspace), root
    )
    expect(scan.complete).toBe(true)
    const indexed = await page.evaluate(
      (target) => window.documentIntelligence.getBacklinks(target), filePath
    )
    expect(indexed.map(({ label, column }) => ({ label, column }))).toEqual([
      { label: 'first', column: 0 },
      { label: 'second', column: sourceMarkdown.indexOf('[second]') }
    ])

    await page.getByTestId('sidebar-document-info-button').click()
    const panel = page.locator('.document-intelligence')
    await expect(panel).toBeVisible()
    await panel.locator('.document-intelligence__header button').click()

    const references = panel.locator('.document-intelligence__section').first()
      .locator('.document-intelligence__item')
    await expect(references).toHaveCount(2)
    await expect(references.nth(1)).toContainText('second')
    await references.nth(1).click()

    await expect(page.locator('span.mu-link')).toHaveCount(2)
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
    fs.rmSync(sourcePath, { force: true })
  }
})
