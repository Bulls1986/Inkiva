import { PdfPreviewSession } from './pdfPreviewSession'

/**
 * The one PDF preview session for the current editor window.
 *
 * PDF.js is imported lazily inside `openDocument` so the editor bundle does not
 * pay for the renderer until a user actually generates a preview.
 */
export const pdfPreviewSession = new PdfPreviewSession({
  generate: (request) => window.pdfPreview.generate(request),
  read: async(previewId) => {
    const bytes = await window.pdfPreview.read(previewId)
    // E2E evidence for P7: the saved file must hash identical to these bytes.
    if (bytes && window.electron?.process?.env?.PERF_TESTING === 'true') {
      const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer)
      const hex = Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
      ;(globalThis as unknown as { __inkiva_pdf_preview_hash__?: string })
        .__inkiva_pdf_preview_hash__ = hex
    }
    return bytes
  },
  save: (request) => window.pdfPreview.save(request),
  cancel: () => window.pdfPreview.cancel(),
  release: (previewId) => window.pdfPreview.release(previewId),
  openDocument: async(bytes) => {
    const { openPdfDocument } = await import('@/util/pdfPreviewViewer')
    return openPdfDocument(bytes)
  },
  statResource: async(path) => {
    try {
      const stat = await window.fileUtils.stat(path)
      return { mtimeMs: Number(stat.mtimeMs), size: Number(stat.size) }
    } catch {
      // A vanished image is a change, not an error.
      return null
    }
  }
})
