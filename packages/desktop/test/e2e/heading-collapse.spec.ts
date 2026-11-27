import { expect, test } from '@playwright/test'
import type { Page } from 'playwright'
import * as fs from 'node:fs'
import {
  enterSourceMode,
  exitSourceMode,
  expectNoRendererErrors,
  launchWithMarkdown,
  sendIpcToRenderer,
  showSidebarPanel,
  waitForEditor
} from './helpers'

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
  '### Advanced configuration',
  '',
  'Advanced notes.',
  '',
  '## Troubleshooting',
  '',
  'Troubleshooting notes.',
  ''
].join('\n')

const heading = (page: Page, text: string) =>
  page.locator('.mu-container > h1, .mu-container > h2, .mu-container > h3')
    .filter({ hasText: text })
    .first()

const toggle = (page: Page, text: string) =>
  heading(page, text).getByTestId('heading-collapse-toggle')

test('collapses sections, restores child state, and reveals only blocking ancestors', async() => {
  test.setTimeout(120_000)
  const launched = await launchWithMarkdown(DOCUMENT, { suppressErrorDialog: true })
  const { app, page, filePath } = launched

  try {
    await waitForEditor(page)
    await showSidebarPanel(app, page, 'toc')
    await expect
      .poll(() =>
        page.locator('[data-testid="toc-node-label"]').filter({ hasText: 'Advanced configuration' }).count()
      )
      .toBeGreaterThan(0)

    const installationToggle = toggle(page, 'Installation')
    await heading(page, 'Installation').hover()
    await expect(installationToggle).toHaveAttribute('aria-expanded', 'true')
    await installationToggle.click()
    await expect(installationToggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByText('Windows notes.', { exact: true })).toBeHidden()

    // Collapse the child section too, then the parent. Re-expanding the parent
    // must restore the child's collapsed state rather than expanding it.
    const advancedToggle = toggle(page, 'Advanced configuration')
    await advancedToggle.focus()
    await page.keyboard.press('Enter')
    await expect(advancedToggle).toHaveAttribute('aria-expanded', 'false')

    const configurationToggle = toggle(page, 'Configuration')
    await heading(page, 'Configuration').hover()
    await configurationToggle.click()
    await expect(heading(page, 'Advanced configuration')).toBeHidden()

    const guideToggle = toggle(page, 'Product guide')
    await heading(page, 'Product guide').hover()
    await guideToggle.click()
    await expect(heading(page, 'Installation')).toBeHidden()
    await guideToggle.click()
    await expect(heading(page, 'Installation')).toBeVisible()
    await expect(heading(page, 'Configuration')).toBeVisible()
    await expect(heading(page, 'Advanced configuration')).toBeHidden()
    await expect(advancedToggle).toHaveAttribute('aria-expanded', 'false')

    // A TOC jump is an explicit activation: expand Configuration (the ancestor
    // hiding Advanced configuration), but keep Advanced's own section collapsed.
    await page
      .locator('[data-testid="toc-node-label"]')
      .filter({ hasText: 'Advanced configuration' })
      .first()
      .click()
    await expect(heading(page, 'Configuration')).toBeVisible()
    await expect(heading(page, 'Advanced configuration')).toBeVisible()
    await expect(page.getByText('Configuration notes.', { exact: true })).toBeVisible()
    await expect(page.getByText('Advanced notes.', { exact: true })).toBeHidden()
    await expect(advancedToggle).toHaveAttribute('aria-expanded', 'false')

    // Source mode shows the complete Markdown; returning restores the still
    // valid collapse state.
    await enterSourceMode(page, app)
    const source = await page.evaluate(() => {
      const cm = document.querySelector('.source-code .CodeMirror') as
        | (Element & { CodeMirror?: { getValue(): string } })
        | null
      return cm?.CodeMirror?.getValue() ?? ''
    })
    expect(source).toContain('Advanced notes.')
    expect(source).toContain('Troubleshooting notes.')
    await exitSourceMode(page, app)
    await expect(page.getByText('Advanced notes.', { exact: true })).toBeHidden()
    await expect(page.getByText('Configuration notes.', { exact: true })).toBeVisible()

    // Collapsing is view-only: the source file and full Markdown are unchanged.
    expect(fs.readFileSync(filePath, 'utf8')).toBe(DOCUMENT)
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})

test('keeps per-tab collapse state across a tab switch', async() => {
  test.setTimeout(90_000)
  const launched = await launchWithMarkdown(DOCUMENT, { suppressErrorDialog: true })
  const { app, page } = launched

  try {
    await waitForEditor(page)
    const installationToggle = toggle(page, 'Installation')
    await heading(page, 'Installation').hover()
    await installationToggle.click()
    await expect(page.getByText('Install the app.', { exact: true })).toBeHidden()

    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, '# Other\n')
    await expect(page.locator('.tabs-container > li')).toHaveCount(2)
    await expect(page.getByText('Install the app.', { exact: true })).toBeHidden()

    await page.locator('.tabs-container > li').first().click()
    await waitForEditor(page)
    await expect(page.getByText('Install the app.', { exact: true })).toBeHidden()
    await expect(toggle(page, 'Installation')).toHaveAttribute('aria-expanded', 'false')
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})
