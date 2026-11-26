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

test('keeps a dismissed recovery banner hidden across an application restart', async() => {
  // This scenario deliberately starts the application twice.
  test.setTimeout(90_000)
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkiva-recovery-banner-e2e-'))
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

  const first = await launchElectron([], { userDataDir, suppressErrorDialog: true })
  try {
    await waitForEditor(first.page)
    await waitForMenuReady(first.app)

    const banner = first.page.getByTestId('recovery-banner')
    await expect(banner).toBeVisible()
    await banner.getByRole('button', { name: '关闭', exact: true }).click()
    await expect(banner).toHaveCount(0)
    await expectNoRendererErrors(first.app)
  } finally {
    await closeElectron(first.app)
  }

  const second = await launchElectron([], { userDataDir, suppressErrorDialog: true })
  try {
    await waitForEditor(second.page)
    await waitForMenuReady(second.app)

    // The dismissal must survive a real process restart while the same
    // recovery entry is still pending.
    const pendingCount = await second.page.evaluate(async() => {
      const state = await window.electron.ipcRenderer.invoke('mt::recovery-center::get-state')
      return state.items.length
    })
    expect(pendingCount).toBeGreaterThan(0)
    await expect(second.page.getByTestId('recovery-banner')).toHaveCount(0)
    await expectNoRendererErrors(second.app)
  } finally {
    await closeElectron(second.app)
  }
})
