import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { createHash } from 'node:crypto'
import {
  launchWithMarkdown,
  waitForMenuReady,
  sendIpcToRenderer
} from './helpers'

// Item 231 — PDF export to a real file via the Electron menu (smoke).
//
// The full path is: File › Export › Export PDF →
//   main `exportFile()` sends `mt::show-export-dialog` →
//   renderer export-settings dialog → confirm →
//   renderer renders styled HTML into the hidden print webview and sends
//   `mt::response-export` (store/editor.ts EXPORT) →
//   main `handleResponseForExport` → showSaveDialog → webContents.printToPDF →
//   writeFile → `mt::export-success`.
//
// The native save dialog is the only non-headless seam: we stub
// `electron.dialog.showSaveDialog` in the MAIN process to return a temp path,
// then drive the REAL renderer export pipeline. We assert a non-empty file
// beginning with the `%PDF-` magic bytes is written and that `mt::export-success`
// fires back to the renderer. Pixel/layout fidelity stays a manual check.

const PDF_DOC =
  '# Export Smoke\n\n' +
  'First paragraph with **bold** and *italic* text.\n\n' +
  'Second paragraph for a multi-block document.\n\n' +
  '- list item one\n- list item two\n'

// Install a main-process stub for `dialog.showSaveDialog` that returns the
// supplied path (no native picker). Returns nothing; the renderer success
// listener and on-disk polling confirm the rest.
const stubSaveDialog = async(app: ElectronApplication, targetPath: string): Promise<void> => {
  await app.evaluate(async({ dialog }, savePath) => {
    const g = global as unknown as {
      __mt_orig_showSaveDialog__?: typeof dialog.showSaveDialog
    }
    if (!g.__mt_orig_showSaveDialog__) {
      g.__mt_orig_showSaveDialog__ = dialog.showSaveDialog.bind(dialog)
    }
    // Override with a resolved temp path so handleResponseForExport proceeds
    // straight to printToPDF + writeFile.
    ;(dialog as unknown as { showSaveDialog: unknown }).showSaveDialog = async() => ({
      canceled: false,
      filePath: savePath
    })
  }, targetPath)
}

const restoreSaveDialog = async(app: ElectronApplication): Promise<void> => {
  await app.evaluate(({ dialog }) => {
    const g = global as unknown as {
      __mt_orig_showSaveDialog__?: typeof dialog.showSaveDialog
    }
    if (g.__mt_orig_showSaveDialog__) {
      ;(dialog as unknown as { showSaveDialog: unknown }).showSaveDialog =
        g.__mt_orig_showSaveDialog__
    }
  })
}

// Attach a renderer-side listener on `mt::export-success` recording the payload
// into a window global the spec can read back. Mirrors the app's own
// LISTEN_FOR_EXPORT_SUCCESS handler but is observable from the test.
const installExportSuccessProbe = async(page: Page): Promise<void> => {
  await page.evaluate(() => {
    const w = window as unknown as {
      __mt_export_success__?: Array<{ type?: string; filePath?: string }>
      __mt_export_probe_installed__?: boolean
    }
    if (w.__mt_export_probe_installed__) return
    w.__mt_export_probe_installed__ = true
    const sink: Array<{ type?: string; filePath?: string }> = []
    w.__mt_export_success__ = sink
    window.electron.ipcRenderer.on('mt::export-success', (_e: unknown, payload: unknown) => {
      sink.push((payload ?? {}) as { type?: string; filePath?: string })
    })
  })
}

const getExportSuccesses = async(
  page: Page
): Promise<Array<{ type?: string; filePath?: string }>> => {
  return await page.evaluate(() => {
    const w = window as unknown as { __mt_export_success__?: Array<{ type?: string; filePath?: string }> }
    return (w.__mt_export_success__ ?? []).slice()
  })
}

const clearExportSuccesses = async(page: Page): Promise<void> => {
  await page.evaluate(() => {
    const w = window as unknown as { __mt_export_success__?: Array<unknown> }
    if (w.__mt_export_success__) w.__mt_export_success__.length = 0
  })
}

// Renderer errors explain why a generation silently never starts; they are
// surfaced in the failure message instead of being lost in the app console.
const rendererErrors: string[] = []
const rendererLogs: string[] = []

// Open the PDF export dialog and wait for the preview controls. The PDF path is
// now: File › Export › Export PDF → settings → "Generate preview" →
// generatePreview IPC (isolated print page, tagged PDF + outline) → PDF.js
// renders those exact bytes → "Save PDF" → savePreview IPC writes the same
// artifact. The native save dialog is the only non-headless seam.
const openPdfExportDialog = async(app: ElectronApplication, page: Page): Promise<void> => {
  // The dialog can appear before the editor has registered itself as the
  // preview content provider; a generation requested in that window is dropped.
  // Wait for the readiness flag the editor sets right after registering.
  await page.waitForFunction(
    () =>
      (globalThis as unknown as { __inkiva_pdf_preview_ready__?: boolean })
        .__inkiva_pdf_preview_ready__ === true,
    undefined,
    { timeout: 30000 }
  )
  await sendIpcToRenderer(app, 'mt::show-export-dialog', 'pdf')
  await page.locator('[data-testid="pdf-preview-generate"]').waitFor({
    state: 'visible',
    timeout: 10000
  })
}

const readStatus = async(page: Page): Promise<string> =>
  (await page
    .locator('[data-testid="pdf-preview-status"]')
    .getAttribute('data-status', { timeout: 2000 })
    .catch(() => null)) ?? 'unknown'

// The main process logs each generation failure; surfacing it turns a hung
// preview into a diagnosable failure instead of a bare timeout.
const dumpMainLog = (userDataDir: string): string => {
  const logPath = path.join(userDataDir, 'logs', 'main.log')
  try {
    const lines = fs.readFileSync(logPath, 'utf8').split('\n')
    return lines.slice(-25).join('\n')
  } catch {
    return '(no main log at ' + logPath + ')'
  }
}

const generatePreview = async(page: Page, userDataDir: string): Promise<void> => {
  const generate = page.locator('[data-testid="pdf-preview-generate"]')
  const refresh = page.locator('[data-testid="pdf-preview-regenerate"]')
  if (await generate.isVisible()) {
    await generate.click()
  } else {
    await refresh.click()
  }
  // Wait for a terminal state. "not generating" is satisfied by the idle state
  // that is still visible in the same tick as the click, which made this helper
  // race the very transition it was waiting for.
  await expect
    .poll(async() => readStatus(page), { timeout: 60000 })
    .toMatch(/^(ready|failed|stale)$/)
  const status = await readStatus(page)
  if (status !== 'ready') {
    const detail = await page
      .locator('[data-testid="pdf-preview-error"]')
      .textContent({ timeout: 2000 })
      .catch(() => '')
    throw new Error(
      'PDF preview did not become ready: ' +
        status +
        ' ' +
        detail +
        '\nrenderer: ' +
        (rendererErrors.slice(-3).join(' | ') || '(none)') +
        '\nevents: ' +
        ((await page
          .locator('[data-testid="pdf-preview-status"]')
          .getAttribute('data-events', { timeout: 2000 })
          .catch(() => null)) ?? '(none)') +
        '\n' +
        dumpMainLog(userDataDir)
    )
  }
}

const getPreviewHash = async(page: Page): Promise<string> => {
  return await page.evaluate(() => {
    const w = window as unknown as { __inkiva_pdf_preview_hash__?: string }
    return w.__inkiva_pdf_preview_hash__ ?? ''
  })
}

const sha256File = (filePath: string): string =>
  createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')

const pollForPdfFile = async(filePath: string, timeoutMs = 30000): Promise<Buffer> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath)
      if (data.length > 0) return data
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('PDF file was not written within ' + timeoutMs + 'ms: ' + filePath)
}

// A generation is bounded by the main process; keep the test window wider than
// that bound so a timeout surfaces as a product state instead of a dead test.
test.describe.configure({ timeout: 120000 })

test.describe('PDF preview and same-artifact save (P1-P3, P7)', () => {
  let app: ElectronApplication
  let page: Page
  const userDataDir = path.join(os.tmpdir(), 'inkiva-e2e-pdf-preview-userdata')

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown(PDF_DOC, { userDataDir })
    app = launched.app
    page = launched.page
    page.on('pageerror', (error) => rendererErrors.push('pageerror: ' + error.message))
    page.on('console', (message) => {
      rendererLogs.push(message.text())
      if (message.type() === 'error') rendererErrors.push('console: ' + message.text())
    })
    await waitForMenuReady(app)
    await installExportSuccessProbe(page)
  })

  test.afterAll(async() => {
    if (app) {
      await restoreSaveDialog(app)
      await app.close()
    }
  })

  test('generates a real paginated preview and saves those exact bytes', async() => {
    const out = '/tmp/inkiva-e2e-pdf-preview-' + Date.now() + '.pdf'
    if (fs.existsSync(out)) fs.rmSync(out)
    await clearExportSuccesses(page)
    await stubSaveDialog(app, out)

    await openPdfExportDialog(app, page)
    await generatePreview(page, userDataDir)

    // Real pages: PDF.js reports the artifact's page count for the preview.
    const pageText = await page.locator('.preview-page-indicator').textContent()
    expect(pageText).toMatch(/1\s*\/\s*\d+/)
    const previewHash = await getPreviewHash(page)
    expect(previewHash).toHaveLength(64)

    await page.locator('[data-testid="pdf-preview-save"]').click()
    const data = await pollForPdfFile(out)

    expect(data.subarray(0, 5).toString('latin1')).toBe('%PDF-')
    // P7: the saved file is the artifact the user previewed, byte for byte.
    expect(sha256File(out)).toBe(previewHash)
    // Real bookmarks and tagged structure from the isolated print page.
    const raw = data.toString('latin1')
    expect(raw).toContain('/Outlines')
    expect(raw).toContain('/StructTreeRoot')

    await expect
      .poll(async() => (await getExportSuccesses(page)).some((s) => s.filePath === out), {
        timeout: 10000
      })
      .toBe(true)

    fs.rmSync(out, { force: true })
  })

  test('cannot save before a preview exists', async() => {
    await openPdfExportDialog(app, page)
    const save = page.locator('[data-testid="pdf-preview-save"]')
    await expect(save).toBeDisabled()
    await page.locator('[data-testid="pdf-preview-cancel"]').click()
  })

  test('canceling the save dialog keeps the preview and writes nothing', async() => {
    const out = '/tmp/inkiva-e2e-pdf-cancel-' + Date.now() + '.pdf'
    if (fs.existsSync(out)) fs.rmSync(out)
    await clearExportSuccesses(page)
    await openPdfExportDialog(app, page)
    await generatePreview(page, userDataDir)

    await app.evaluate(({ dialog }) => {
      ;(dialog as unknown as { showSaveDialog: unknown }).showSaveDialog = async() => ({
        canceled: true,
        filePath: undefined
      })
    })

    await page.locator('[data-testid="pdf-preview-save"]').click()
    await expect
      .poll(async() => page.locator('[data-testid="pdf-preview-status"]').getAttribute('data-status'), {
        timeout: 10000
      })
      .toBe('ready')

    expect(fs.existsSync(out)).toBe(false)
    await page.locator('[data-testid="pdf-preview-cancel"]').click()
  })

  test('Export Again reopens the preview flow instead of writing directly', async() => {
    const out = '/tmp/inkiva-e2e-pdf-again-' + Date.now() + '.pdf'
    if (fs.existsSync(out)) fs.rmSync(out)
    await stubSaveDialog(app, out)
    await clearExportSuccesses(page)

    await openPdfExportDialog(app, page)
    await generatePreview(page, userDataDir)
    await page.locator('[data-testid="pdf-preview-save"]').click()
    await pollForPdfFile(out)
    fs.rmSync(out, { force: true })

    // A repeat export must not write anything on its own; it reopens the
    // dialog so a fresh preview is confirmed first.
    await sendIpcToRenderer(app, 'mt::export-again')
    await page.locator('[data-testid="pdf-preview-generate"]').waitFor({
      state: 'visible',
      timeout: 10000
    })
    expect(fs.existsSync(out)).toBe(false)
    await page.locator('[data-testid="pdf-preview-cancel"]').click()
  })
})
