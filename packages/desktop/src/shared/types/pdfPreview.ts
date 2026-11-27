/**
 * Typed contract for the v0.7.0 PDF preview flow.
 *
 * The renderer serializes the current document once and asks main to generate
 * a PDF; main owns the artifact and the isolated print page. The renderer then
 * renders those exact bytes with PDF.js, and a save writes the same bytes
 * without re-rendering. See docs/architecture and the v0.7.0 design review
 * (P1-P4, P7).
 */

export const PDF_PREVIEW_CHANNELS = {
  generate: 'mt::pdf-preview::generate',
  read: 'mt::pdf-preview::read',
  save: 'mt::pdf-preview::save',
  cancel: 'mt::pdf-preview::cancel',
  release: 'mt::pdf-preview::release'
} as const

export interface PdfPreviewPageOptions {
  pageSize?: string
  pageSizeWidth?: number
  pageSizeHeight?: number
  isLandscape?: boolean
}

export interface PdfPreviewGenerateRequest {
  /** Renderer document revision the HTML was serialized from. */
  documentVersion: string
  /** Export settings revision (paper, margins, theme, header/footer, ...). */
  settingsVersion: string
  /** Snapshot of the resources the HTML references (images, theme CSS). */
  resourceVersion: string
  html: string
  pageOptions?: PdfPreviewPageOptions
  /**
   * Local images the HTML embeds, with the SHA-256 of their bytes at generation
   * time (`null` = unreadable then). Main re-hashes them right before writing,
   * after the native save dialog returns.
   */
  resources?: PdfPreviewResourceIdentity[]
}

export interface PdfPreviewResourceIdentity {
  path: string
  hash: string | null
}

export type PdfPreviewFailureCode =
  | 'stale'
  | 'timeout'
  | 'generation-failed'
  | 'save-failed'

export type PdfPreviewGenerateResponse =
  | { ok: true, previewId: string, byteLength: number }
  | { ok: false, code: PdfPreviewFailureCode, message: string }

export interface PdfPreviewSaveRequest {
  previewId: string
  documentVersion: string
  settingsVersion: string
  resourceVersion: string
  defaultPath: string
  /** Export Again keeps the last confirmed target instead of prompting again. */
  reuseLastPath?: boolean
}

export type PdfPreviewSaveResponse =
  | { ok: true, status: 'saved', filePath: string, byteLength: number }
  | { ok: true, status: 'canceled' }
  | { ok: false, code: PdfPreviewFailureCode, message: string }
