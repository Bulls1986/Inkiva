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

  try {
    await waitForEditor(launched.page)
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

test('keeps disk V1 intact until the user decides what to do with dirty recovery V2', async() => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-us02-recovery-e2e-'))
  const documentsDir = path.join(userDataDir, 'documents')
  const editorStatesDir = path.join(userDataDir, 'editorStates')
  fs.mkdirSync(documentsDir, { recursive: true })
  fs.mkdirSync(editorStatesDir, { recursive: true })
  fs.writeFileSync(
    path.join(userDataDir, 'preferences.json'),
    JSON.stringify({ startUpAction: 'restoreAll' }),
    'utf8'
  )

  const documentPath = path.join(documentsDir, 'recovery.md')
  fs.writeFileSync(documentPath, '# V1\n', 'utf8')
  fs.writeFileSync(
    path.join(editorStatesDir, 'dirty_editor_buffer_store.json'),
    JSON.stringify({
      version: 1,
      currentFileId: 'dirty',
      tabs: [
        {
          id: 'dirty',
          filename: 'recovery.md',
          pathname: documentPath,
          markdown: '# V2\n',
          isSaved: false
        }
      ],
      restoreWarnings: []
    }),
    'utf8'
  )

  const launched = await launchElectron([], {
    userDataDir,
    suppressErrorDialog: true
  })

  try {
    await waitForEditor(launched.page)
    await waitForMenuReady(launched.app)

    await expect(launched.page.getByTestId('recovery-banner')).toBeVisible()
    expect(fs.readFileSync(documentPath, 'utf8')).toBe('# V1\n')

    await launched.page.getByRole('button', { name: '查看恢复内容' }).click()
    await expect(launched.page.getByTestId('recovery-markdown-preview')).toContainText('# V2')

    await launched.page.getByRole('button', { name: '当前文件', exact: true }).click()
    await expect(launched.page.getByTestId('recovery-markdown-preview')).toContainText('# V1')

    await launched.page.getByRole('button', { name: '恢复版本', exact: true }).click()
    await launched.page.getByRole('button', { name: '作为新文档打开恢复稿' }).click()

    await expect(launched.page.getByTestId('recovery-document-note')).toContainText(
      '尚未另存为'
    )
    expect(fs.readFileSync(documentPath, 'utf8')).toBe('# V1\n')
    await expectNoRendererErrors(launched.app)
  } finally {
    await closeElectron(launched.app)
  }
})

test('skips a corrupt recovery file and still opens a usable blank editor', async() => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-corrupt-restore-e2e-'))
  const editorStatesDir = path.join(userDataDir, 'editorStates')
  fs.mkdirSync(editorStatesDir, { recursive: true })
  fs.writeFileSync(
    path.join(userDataDir, 'preferences.json'),
    JSON.stringify({ startUpAction: 'restoreAll' }),
    'utf8'
  )
  fs.writeFileSync(
    path.join(editorStatesDir, 'broken_editor_buffer_store.json'),
    '{"tabs": [',
    'utf8'
  )

  const launched = await launchElectron([], {
    userDataDir,
    suppressErrorDialog: true
  })

  try {
    await waitForEditor(launched.page)
    await waitForMenuReady(launched.app)
    await expect
      .poll(() =>
        launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
      )
      .toBe(1)
    await expect.poll(() => launched.page.locator('.tabs-container > li').count()).toBe(1)
    await expectNoRendererErrors(launched.app)
  } finally {
    await closeElectron(launched.app)
  }
})

test('does not create a second window when the same path is opened repeatedly', async() => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-duplicate-open-e2e-'))
  const documentsDir = path.join(userDataDir, 'documents')
  fs.mkdirSync(documentsDir, { recursive: true })
  const documentPath = path.join(documentsDir, 'duplicate.md')
  fs.writeFileSync(documentPath, '# Duplicate\n', 'utf8')
  fs.writeFileSync(
    path.join(userDataDir, 'preferences.json'),
    JSON.stringify({ startUpAction: 'blank', openFilesInNewWindow: true }),
    'utf8'
  )

  const launched = await launchElectron([documentPath], {
    userDataDir,
    suppressErrorDialog: true
  })

  try {
    await waitForEditor(launched.page)
    await waitForMenuReady(launched.app)

    await launched.app.evaluate(({ app }, pathname) => {
      app.emit(
        'second-instance',
        { preventDefault: () => {} },
        [process.execPath, pathname, pathname],
        process.cwd()
      )
    }, documentPath)

    await expect.poll(() => launched.page.locator('.tabs-container > li').count()).toBe(1)
    await expect
      .poll(() =>
        launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
      )
      .toBe(1)
    await expect.poll(() => launched.page.locator('.tabs-container > li').count()).toBe(1)
    await expectNoRendererErrors(launched.app)
  } finally {
    await closeElectron(launched.app)
  }
})
