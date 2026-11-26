import { reactive } from 'vue'
import type {
  PdfPreviewGenerateRequest,
  PdfPreviewGenerateResponse,
  PdfPreviewPageOptions,
  PdfPreviewSaveRequest,
  PdfPreviewSaveResponse
} from '@shared/types/pdfPreview'

/**
 * Renderer-side owner of one PDF preview (P1-P3, P7).
 *
 * The session renders the artifact main generated and keeps that artifact id
 * for the save call, so the saved file is the preview the user approved. Any
 * change to the document, the export settings or the referenced resources
 * moves the session to 'stale', which disables saving; a generation that loses
 * its turn is released instead of overwriting newer state.
 */

export type PdfPreviewStatus =
  | 'idle'
  | 'generating'
  | 'ready'
  | 'stale'
  | 'failed'
  | 'saving'
  | 'saved'

export interface PdfPreviewVersionSnapshot {
  documentVersion: string
  settingsVersion: string
  resourceVersion: string
}

export interface PdfDocumentLike {
  numPages: number
  destroy(): Promise<void>
  /** Render one page into a canvas; the viewer provides this, tests may omit it. */
  renderPage?(pageNumber: number, canvas: HTMLCanvasElement, cssWidth: number): Promise<void>
}

export interface PdfPreviewSessionDeps {
  generate(request: PdfPreviewGenerateRequest): Promise<PdfPreviewGenerateResponse>
  read(previewId: string): Promise<Uint8Array | null>
  save(request: PdfPreviewSaveRequest): Promise<PdfPreviewSaveResponse>
  cancel(): void
  release(previewId: string): void
  openDocument(bytes: Uint8Array): Promise<PdfDocumentLike>
}

export interface PdfPreviewState {
  status: PdfPreviewStatus
  previewId: string | null
  pageCount: number
  currentPage: number
  error: string | null
  message: string | null
  versions: PdfPreviewVersionSnapshot | null
}

export interface PdfPreviewRequestInput {
  html: string
  pageOptions?: PdfPreviewPageOptions
  versions: PdfPreviewVersionSnapshot
}

export type PdfPreviewSaveOutcome = 'saved' | 'canceled' | 'failed' | 'blocked'

export class PdfPreviewSession {
  readonly state: PdfPreviewState
  protected readonly deps: PdfPreviewSessionDeps
  private sequence = 0
  private document: PdfDocumentLike | null = null

  constructor(deps: PdfPreviewSessionDeps) {
    this.deps = deps
    this.state = reactive<PdfPreviewState>({
      status: 'idle',
      previewId: null,
      pageCount: 0,
      currentPage: 1,
      error: null,
      message: null,
      versions: null
    })
  }

  async requestPreview(input: PdfPreviewRequestInput): Promise<void> {
    this.sequence += 1
    const sequence = this.sequence
    // Start synchronously: a teardown that is still running must never hold a
    // new generation in its previous status.
    this.dropDocumentInBackground()
    this.state.status = 'generating'
    this.state.error = null
    this.state.message = null
    this.state.previewId = null
    this.state.pageCount = 0
    this.state.currentPage = 1
    this.state.versions = input.versions

    const request: PdfPreviewGenerateRequest = {
      ...input.versions,
      html: input.html,
      pageOptions: input.pageOptions
    }
    const generated = await this.deps.generate(request)
    if (sequence !== this.sequence) {
      if (generated.ok) this.deps.release(generated.previewId)
      return
    }
    if (!generated.ok) {
      this.state.status = 'failed'
      this.state.error = generated.message
      return
    }

    const bytes = await this.deps.read(generated.previewId)
    if (sequence !== this.sequence) {
      this.deps.release(generated.previewId)
      return
    }
    if (!bytes) {
      this.state.status = 'failed'
      this.state.error = 'The generated preview could not be read.'
      this.deps.release(generated.previewId)
      return
    }

    const document = await this.deps.openDocument(bytes)
    if (sequence !== this.sequence) {
      await document.destroy().catch(() => {})
      this.deps.release(generated.previewId)
      return
    }

    this.document = document
    this.state.previewId = generated.previewId
    this.state.pageCount = document.numPages
    this.state.currentPage = 1
    this.state.status = 'ready'
  }

  getDocument(): PdfDocumentLike | null {
    return this.document
  }

  invalidate(reason: 'settings' | 'document' | 'resources'): void {
    if (this.state.status === 'generating') {
      this.sequence += 1
      this.deps.cancel()
      this.state.status = 'stale'
      this.state.error = null
      return
    }
    if (this.state.status === 'ready' || this.state.status === 'saved') {
      this.state.status = 'stale'
      this.state.message = null
      if (reason === 'document') {
        this.state.error = null
      }
    }
  }

  async save(request: {
    defaultPath: string
    reuseLastPath?: boolean
  }): Promise<PdfPreviewSaveOutcome> {
    if (this.state.status !== 'ready' || !this.state.previewId || !this.state.versions) {
      return 'blocked'
    }
    const versions = this.state.versions
    this.state.status = 'saving'
    this.state.error = null
    const result = await this.deps.save({
      previewId: this.state.previewId,
      documentVersion: versions.documentVersion,
      settingsVersion: versions.settingsVersion,
      resourceVersion: versions.resourceVersion,
      defaultPath: request.defaultPath,
      reuseLastPath: request.reuseLastPath
    })
    if (result.ok && result.status === 'saved') {
      this.state.status = 'saved'
      this.state.message = result.filePath
      return 'saved'
    }
    if (result.ok && result.status === 'canceled') {
      // Canceling the OS dialog returns to the same preview page (P3).
      this.state.status = 'ready'
      return 'canceled'
    }
    if (!result.ok) {
      this.state.status = 'ready'
      this.state.error = result.message
      return 'failed'
    }
    this.state.status = 'ready'
    return 'failed'
  }

  setPage(page: number): void {
    if (this.state.pageCount <= 0) return
    const next = Math.min(Math.max(Math.trunc(page), 1), this.state.pageCount)
    this.state.currentPage = next
  }

  cancel(): void {
    this.sequence += 1
    this.deps.cancel()
    if (this.state.previewId) this.deps.release(this.state.previewId)
    this.dropDocumentInBackground()
    this.resetState()
  }

  /**
   * Passive teardown (dialog hidden, panel unmounted). It must never interrupt
   * an operation the user is waiting for: a generation that is still running or
   * a save in flight owns the session and decides its own outcome.
   */
  teardown(): void {
    if (this.state.status === 'generating' || this.state.status === 'saving') return
    this.close()
  }

  close(): void {
    this.sequence += 1
    this.deps.cancel()
    if (this.state.previewId) this.deps.release(this.state.previewId)
    this.dropDocumentInBackground()
    // Reset synchronously so a pending teardown can never resurrect or clear a
    // later session's state.
    this.resetState()
  }

  private resetState(): void {
    this.state.status = 'idle'
    this.state.previewId = null
    this.state.pageCount = 0
    this.state.currentPage = 1
    this.state.error = null
    this.state.message = null
    this.state.versions = null
  }

  private dropDocumentInBackground(): void {
    const document = this.document
    this.document = null
    if (document) document.destroy().catch(() => {})
  }
}
