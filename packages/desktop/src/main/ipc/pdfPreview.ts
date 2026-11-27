import { BrowserWindow, app, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import log from 'electron-log'
import writeFileAtomic from 'write-file-atomic'

import {
  PDF_PREVIEW_CHANNELS,
  type PdfPreviewGenerateRequest,
  type PdfPreviewGenerateResponse,
  type PdfPreviewSaveRequest,
  type PdfPreviewSaveResponse
} from '@shared/types/pdfPreview'
import {
  PdfPreviewService,
  type PdfPreviewFailureLike,
  type PdfPrintPage
} from '../pdfPreview/pdfPreviewService'

// One service per editor window: the artifact, the isolated print page and the
// last confirmed export target all belong to that window's document/preview
// lifetime.

const servicesBySender = new Map<number, PdfPreviewService>()
const lastTargetBySender = new Map<number, string>()

const PRINT_PAGE_TIMEOUT_MS = 30000

/**
 * Content identity of a referenced image, recomputed by main right before a
 * write. `null` means missing or unreadable, which is itself an identity value.
 */
const hashLocalFile = async(filePath: string): Promise<string | null> => {
  try {
    const bytes = await fs.readFile(filePath)
    return createHash('sha256').update(bytes).digest('hex')
  } catch {
    return null
  }
}

const temporaryPreviewRoot = (): string =>
  path.join(app.getPath('temp'), 'inkiva-pdf-preview')

/**
 * The isolated print page. It renders the export HTML alone (no editor DOM, no
 * application state) and is thrown away after one job: the Windows spike showed
 * that two printToPDF submissions on one webContents can take the process down,
 * so callers must create a new page for every generation.
 */
const createIsolatedPrintPage = (): PdfPrintPage => {
  const win = new BrowserWindow({
    show: false,
    width: 794,
    height: 1123,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: true,
      backgroundThrottling: false
    }
  })
  const htmlPath = path.join(
    temporaryPreviewRoot(),
    'print-' + process.pid + '-' + Math.random().toString(36).slice(2) + '.html'
  )
  let destroyedPromise: Promise<void> | null = null

  const cleanupHtml = async(): Promise<void> => {
    await fs.rm(htmlPath, { force: true }).catch(() => {})
  }

  return {
    async loadHtml(html: string): Promise<void> {
      await fs.mkdir(path.dirname(htmlPath), { recursive: true })
      await fs.writeFile(htmlPath, html, 'utf8')
      await win.loadFile(htmlPath)
      // Fonts and images change pagination, so the page must be settled before
      // printing; a bounded wait here keeps a broken resource from hanging the
      // dialog, and the service's own timeout still bounds the whole job.
      await win.webContents.executeJavaScript(
        `(async () => {
          if (document.fonts && document.fonts.ready) {
            await document.fonts.ready
          }
          await Promise.all(Array.from(document.images).map((img) =>
            img.complete
              ? Promise.resolve()
              : new Promise((resolve) => {
                  img.addEventListener('load', resolve, { once: true })
                  img.addEventListener('error', resolve, { once: true })
                })
          ))
          return true
        })()`,
        true
      )
    },
    printToPdf(options: Record<string, unknown>): Promise<Uint8Array> {
      return win.webContents.printToPDF(
        options as Electron.PrintToPDFOptions
      ) as Promise<Uint8Array>
    },
    destroy(): Promise<void> {
      if (destroyedPromise) return destroyedPromise
      destroyedPromise = new Promise<void>((resolve) => {
        let settled = false
        const timers: { fallback?: ReturnType<typeof setTimeout> } = {}
        const finished = (): void => {
          if (settled) return
          settled = true
          if (timers.fallback) clearTimeout(timers.fallback)
          cleanupHtml().finally(() => resolve())
        }
        if (win.isDestroyed() || win.webContents.isDestroyed()) {
          finished()
          return
        }
        win.once('closed', finished)
        // webContents 'destroyed' fires even when the window was already gone.
        win.webContents.once('destroyed', finished)
        // Belt and braces: a teardown that never reports back would hold the
        // one-print-page queue forever.
        timers.fallback = setTimeout(finished, 5000)
        try {
          win.destroy()
        } catch (error) {
          log.warn('[pdf-preview] print page destroy failed', error)
          finished()
        }
      })
      return destroyedPromise
    }
  }
}

const createService = (
  senderId: number,
  getOwner: () => BrowserWindow | null
): PdfPreviewService => {
  return new PdfPreviewService({
    createPrintPage: createIsolatedPrintPage,
    showSaveDialog: async({ defaultPath }) => {
      const owner = getOwner()
      const filters = [{ name: 'Portable Document Format', extensions: ['pdf'] }]
      const result = owner
        ? await dialog.showSaveDialog(owner, { defaultPath, filters })
        : await dialog.showSaveDialog({ defaultPath, filters })
      return { canceled: result.canceled, filePath: result.filePath }
    },
    writeFile: async(filePath, data) => {
      await writeFileAtomic(filePath, Buffer.from(data))
    },
    hashFile: hashLocalFile,
    generationTimeoutMs: PRINT_PAGE_TIMEOUT_MS
  })
}

const getService = (event: IpcMainInvokeEvent): PdfPreviewService => {
  const senderId = event.sender.id
  let service = servicesBySender.get(senderId)
  if (!service) {
    const sender = event.sender
    service = createService(senderId, () => BrowserWindow.fromWebContents(sender))
    servicesBySender.set(senderId, service)
    event.sender.once('destroyed', () => {
      servicesBySender.get(senderId)?.dispose()
      servicesBySender.delete(senderId)
      lastTargetBySender.delete(senderId)
    })
  }
  return service
}

export const registerPdfPreviewHandlers = (): void => {
  ipcMain.handle(
    PDF_PREVIEW_CHANNELS.generate,
    async(event, request: PdfPreviewGenerateRequest): Promise<PdfPreviewGenerateResponse> => {
      try {
        const descriptor = await getService(event).generate(request)
        return { ok: true, ...descriptor }
      } catch (error) {
        log.warn('[pdf-preview] generation failed', error)
        const failure = error as PdfPreviewFailureLike
        return {
          ok: false,
          code: failure.code ?? 'generation-failed',
          message: failure.message
        }
      }
    }
  )

  ipcMain.handle(PDF_PREVIEW_CHANNELS.read, (event, previewId: string) => {
    return getService(event).read(previewId)
  })

  ipcMain.handle(
    PDF_PREVIEW_CHANNELS.save,
    async(event, request: PdfPreviewSaveRequest): Promise<PdfPreviewSaveResponse> => {
      const service = getService(event)
      const senderId = event.sender.id
      try {
        const saved = await service.save(
          request.reuseLastPath
            ? { ...request, defaultPath: lastTargetBySender.get(senderId) ?? request.defaultPath }
            : request
        )
        if (saved.status === 'saved') {
          lastTargetBySender.set(senderId, saved.filePath)
          // Reuse the existing success notification path so the editor reports
          // the write exactly like every other export.
          event.sender.send('mt::export-success', { type: 'pdf', filePath: saved.filePath })
        }
        return saved.status === 'saved' ? { ok: true, ...saved } : { ok: true, status: 'canceled' }
      } catch (error) {
        log.warn('[pdf-preview] save failed', error)
        const failure = error as PdfPreviewFailureLike
        return {
          ok: false,
          code: failure.code ?? 'save-failed',
          message: failure.message
        }
      }
    }
  )

  ipcMain.on(PDF_PREVIEW_CHANNELS.cancel, (event) => {
    getService(event).cancel()
  })

  ipcMain.on(PDF_PREVIEW_CHANNELS.release, (event, previewId: string) => {
    getService(event).release(previewId)
  })
}
