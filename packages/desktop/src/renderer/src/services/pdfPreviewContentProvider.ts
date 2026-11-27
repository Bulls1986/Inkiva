/**
 * The export dialog needs the editor's serialized document to build a preview.
 *
 * A bus event is fire-and-forget: if the editor has not attached its listener
 * yet (startup, tab switch, remount) the request disappears and the dialog sits
 * on "Generate preview" forever. Registering the provider explicitly makes that
 * state observable instead of silent.
 */

export type PdfPreviewContentProvider = (options: Record<string, unknown>) => Promise<void>

let provider: PdfPreviewContentProvider | null = null

export const setPdfPreviewContentProvider = (
  next: PdfPreviewContentProvider | null
): void => {
  provider = next
}

export class PdfPreviewNotReadyError extends Error {
  constructor() {
    super('The editor cannot serialize the document yet.')
    this.name = 'PdfPreviewNotReadyError'
  }
}

export const requestPdfPreviewFromEditor = async(
  options: Record<string, unknown>
): Promise<void> => {
  const current = provider
  if (!current) throw new PdfPreviewNotReadyError()
  await current(options)
}
