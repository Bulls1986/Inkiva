import { expect, test } from '@playwright/test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  closeElectron,
  expectNoRendererErrors,
  launchElectron,
  waitForEditor,
  waitForMenuReady
} from './helpers'

const createTab = (id: string, pathname: string, markdown: string) => ({
  id,
  filename: path.basename(pathname),
  pathname,
  markdown,
  isSaved: true
})

test('restores multiple recovery files into one deduplicated editor window', async() => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-restore-e2e-'))
  const documentsDir = path.join(userDataDir, 'documents')
  const editorStatesDir = path.join(userDataDir, 'editorStates')
  fs.mkdirSync(documentsDir, { recursive: true })
  fs.mkdirSync(editorStatesDir, { recursive: true })
  fs.writeFileSync(
    path.join(userDataDir, 'preferences.json'),
    JSON.stringify({ startUpAction: 'restoreAll' }),
    'utf8'
  )

  const firstPath = path.join(documentsDir, 'first.md')
  const secondPath = path.join(documentsDir, 'second.md')
  fs.writeFileSync(firstPath, '# First\n', 'utf8')
  fs.writeFileSync(secondPath, '# Second\n', 'utf8')

  const writeState = (id: string, currentFileId: string, tabs: unknown[]): void => {
    fs.writeFileSync(
      path.join(editorStatesDir, `${id}_editor_buffer_store.json`),
      JSON.stringify({
        version: 1,
        currentFileId,
        tabs,
        restoreWarnings: []
      }),
      'utf8'
    )
  }

  writeState('window-first', 'first-one', [createTab('first-one', firstPath, '# First\n')])
  writeState('window-second', 'second', [createTab('second', secondPath, '# Second\n')])
  writeState('window-duplicate', 'first-two', [createTab('first-two', firstPath, '# First\n')])

  const launched = await launchElectron([], {
    userDataDir,
    suppressErrorDialog: true
  })
  const rendererConsoleErrors: string[] = []
  launched.page.on('console', (message) => {
    if (message.type() === 'error') rendererConsoleErrors.push(message.text())
  })

  try {
    try {
      await waitForEditor(launched.page)
    } catch (error) {
      const snapshot = await launched.page.evaluate(() => ({
        readyState: document.readyState,
        title: document.title,
        editorComponent: !!document.querySelector('.editor-component'),
        editorWithTabs: !!document.querySelector('.editor-with-tabs'),
        recent: !!document.querySelector('.recent'),
        tabCount: document.querySelectorAll('.tabs-container > li').length,
        bodyText: document.body.innerText.slice(0, 500)
      }))
      const windowCount = await launched.app.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getAllWindows().length
      )
      const mainSnapshot = await launched.app.evaluate(({ app, BrowserWindow }) => ({
        userDataPath: app.getPath('userData'),
        argv: process.argv.slice(0, 10),
        windowUrls: BrowserWindow.getAllWindows().map((window) => window.webContents.getURL())
      }))
      console.error('[restore-buffer-store] startup snapshot', {
        snapshot,
        windowCount,
        expectedUserDataPath: userDataDir,
        mainSnapshot,
        rendererConsoleErrors
      })
      throw error
    }
    await waitForMenuReady(launched.app)

    await expect
      .poll(() =>
        launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
      )
      .toBe(1)
    await expect.poll(() => launched.page.locator('.tabs-container > li').count()).toBe(2)

    const restoredPaths = await launched.page
      .locator('.tabs-container > li')
      .evaluateAll((tabs) => tabs.map((tab) => tab.getAttribute('title')))
    expect(new Set(restoredPaths)).toEqual(new Set([firstPath, secondPath]))

    await expect
      .poll(
        () =>
          fs
            .readdirSync(editorStatesDir)
            .filter((file) => file.endsWith('_editor_buffer_store.json')).length
      )
      .toBe(1)
    await expectNoRendererErrors(launched.app)
  } finally {
    await closeElectron(launched.app)
  }
})
