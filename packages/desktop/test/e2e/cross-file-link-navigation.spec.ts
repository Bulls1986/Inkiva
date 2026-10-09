import { expect, test } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { launchWithMarkdown, expectNoRendererErrors } from './helpers'

test('LINK-AC05/06: modifier click reaches a virtualized heading in another document', async() => {
  const { app, page, filePath } = await launchWithMarkdown(
    '[Go](./linked-target.md#deep-destination)\n\nKeep source.\n',
    { suppressErrorDialog: true }
  )
  const targetPath = path.join(path.dirname(filePath), 'linked-target.md')
  const filler = Array.from({ length: 280 }, (_, i) => 'Filler paragraph ' + i).join('\n\n')
  fs.writeFileSync(targetPath, '# Target\n\n' + filler + '\n\n## Deep Destination\n\nReached.\n')
  try {
    const link = page.locator('span.mu-link').first()
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', './linked-target.md#deep-destination')
    await link.click()
    await expect(link).toBeVisible()
    expect(await page.getByText('Deep Destination').count()).toBe(0)

    await link.click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] })
    await expect.poll(() => page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('.mu-container[data-virtualization-enabled="true"]')
      const heading = Array.from(document.querySelectorAll('h2')).some(
        (item) => item.textContent?.includes('Deep Destination')
      )
      const offset = document.querySelector<HTMLElement>('.editor-component')?.scrollTop ?? 0
      return !!root && heading && offset > 100
    }), { timeout: 20000 }).toBe(true)
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
    fs.rmSync(targetPath, { force: true })
  }
})

test('LINK-AC06: missing linked target reports failure without replacing the current document', async() => {
  const { app, page } = await launchWithMarkdown(
    '[Missing](./v06-no-such-target.md#heading)\n\nKeep this draft.\n',
    { suppressErrorDialog: true }
  )
  try {
    await page.locator('span.mu-link').first().click({
      modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control']
    })
    await expect(page.getByText('Cannot open linked document')).toBeVisible()
    await expect(page.getByText('Keep this draft.')).toBeVisible()
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})
