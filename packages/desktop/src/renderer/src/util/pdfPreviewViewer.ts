import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

/**
 * PDF.js wrapper for the print preview.
 *
 * The bytes rendered here are the ones main generated and will write on save,
 * so page count and pagination always match the saved file (P1/P7). The worker
 * is bundled by Vite and loaded lazily: the editor pays for PDF.js only when a
 * user actually opens a PDF preview.
 */

let workerReady = false

const ensureWorker = (): void => {
  if (workerReady) return
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  workerReady = true
}

export interface PdfDocumentHandle {
  numPages: number
  /** Render one page into a canvas at the requested CSS width. */
  renderPage(pageNumber: number, canvas: HTMLCanvasElement, cssWidth: number): Promise<void>
  destroy(): Promise<void>
}

export const openPdfDocument = async(data: Uint8Array): Promise<PdfDocumentHandle> => {
  ensureWorker()
  const task = pdfjs.getDocument({ data: data.slice() })
  const doc = await task.promise
  return {
    numPages: doc.numPages,
    async renderPage(pageNumber, canvas, cssWidth) {
      const page = await doc.getPage(pageNumber)
      const base = page.getViewport({ scale: 1 })
      const scale = cssWidth / base.width
      const viewport = page.getViewport({ scale })
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * ratio)
      canvas.height = Math.floor(viewport.height * ratio)
      canvas.style.width = Math.floor(viewport.width) + 'px'
      canvas.style.height = Math.floor(viewport.height) + 'px'
      const context = canvas.getContext('2d')
      if (!context) return
      const renderTask = page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0]
      } as Parameters<typeof page.render>[0])
      await renderTask.promise
      page.cleanup()
    },
    async destroy() {
      await task.destroy()
    }
  }
}
