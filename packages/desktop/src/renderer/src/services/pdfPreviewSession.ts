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

/** A local resource the generated PDF depends on, captured at generation time. */
export interface PdfResourceSnapshot {
  path: string
  /**
   * SHA-256 of the file bytes at generation time, or `null` when the file could
   * not be read (missing/unreadable). Size and mtime are NOT identity: a
   * replacement can keep both and still change the rendered pages.
   */
  hash: string | null
}

export interface PdfPreviewSessionDeps {
  generate(request: PdfPreviewGenerateRequest): Promise<PdfPreviewGenerateResponse>
  read(previewId: string): Promise<Uint8Array | null>
  save(request: PdfPreviewSaveRequest): Promise<PdfPreviewSaveResponse>
  cancel(): void
  release(previewId: string): void
  openDocument(bytes: Uint8Array): Promise<PdfDocumentLike>
  /**
   * Re-read one resource's content identity. `null` means the file is gone or
   * unreadable, which is itself a change from a recorded hash.
   */
  readResource?(path: string): Promise<{ hash: string } | null>
  /** Native target prompt; separated so the dialog pause can be revalidated. */
  showSaveDialog?(request: {
    defaultPath: string
  }): Promise<{ canceled: boolean, filePath?: string }>
}

export interface PdfPreviewState {
  status: PdfPreviewStatus
  previewId: string | null
  pageCount: number
  currentPage: number
  error: string | null
  message: string | null
  versions: PdfPreviewVersionSnapshot | null
  resources: PdfResourceSnapshot[]
  /** Referenced images that could not be read when the preview was generated. */
  missingResources: string[]
  /** Test-mode status trail; surfaced in the DOM so E2E failures are diagnosable. */
  events: string[]
}

export interface PdfPreviewRequestInput {
  html: string
  pageOptions?: PdfPreviewPageOptions
  versions: PdfPreviewVersionSnapshot
  /** Local images the HTML references, as read when the preview was made. */
  resources?: PdfResourceSnapshot[]
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
      versions: null,
      resources: [],
      missingResources: [],
      events: []
    })
  }

  async requestPreview(input: PdfPreviewRequestInput): Promise<void> {
    this.sequence += 1
    const sequence = this.sequence
    // Start synchronously: a teardown that is still running must never hold a
    // new generation in its previous status.
    this.dropDocumentInBackground()
    this.setStatus('generating')
    this.state.error = null
    this.state.message = null
    this.state.previewId = null
    this.state.pageCount = 0
    this.state.currentPage = 1
    this.state.versions = input.versions
    this.state.resources = input.resources ?? []
    this.state.missingResources = this.state.resources
      .filter((resource) => resource.hash === null)
      .map((resource) => resource.path)

    const request: PdfPreviewGenerateRequest = {
      ...input.versions,
      html: input.html,
      pageOptions: input.pageOptions,
      // Main re-hashes these right before writing, after the native save dialog
      // returns; the renderer must not be the only line of defence.
      resources: input.resources ?? []
    }
    const generated = await this.deps.generate(request)
    if (sequence !== this.sequence) {
      if (generated.ok) this.deps.release(generated.previewId)
      return
    }
    if (!generated.ok) {
      this.setStatus('failed')
      this.state.error = generated.message
      return
    }

    const bytes = await this.deps.read(generated.previewId)
    if (sequence !== this.sequence) {
      this.deps.release(generated.previewId)
      return
    }
    if (!bytes) {
      this.setStatus('failed')
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
    this.setStatus('ready')
  }

  getDocument(): PdfDocumentLike | null {
    return this.document
  }

  invalidate(reason: 'settings' | 'document' | 'resources'): void {
    if (this.state.status === 'generating') {
      this.sequence += 1
      this.deps.cancel()
      this.setStatus('stale')
      this.state.error = null
      return
    }
    if (this.state.status === 'ready' || this.state.status === 'saved') {
      this.setStatus('stale')
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
    const sequence = this.sequence

    // A referenced image that changed on disk after generation makes the
    // previewed pagination obsolete (P2/P7): refuse before asking for a target.
    if (await this.resourcesChanged()) {
      if (sequence !== this.sequence) return 'blocked'
      this.invalidate('resources')
      this.state.error = 'A referenced image changed on disk. Generate the preview again.'
      return 'blocked'
    }
    if (sequence !== this.sequence) return 'blocked'

    this.setStatus('saving')
    this.state.error = null

    // The native target prompt is a long user pause: re-read the resources after
    // it returns and before main writes the artifact.
    const showSaveDialog = this.deps.showSaveDialog
    let target: { canceled: boolean, filePath?: string } | null = null
    if (showSaveDialog) {
      target = await showSaveDialog({ defaultPath: request.defaultPath })
      if (sequence !== this.sequence) return 'blocked'
      if (target.canceled || !target.filePath) {
        this.setStatus('ready')
        return 'canceled'
      }
      if (await this.resourcesChanged()) {
        if (sequence !== this.sequence) return 'blocked'
        // `invalidate` only reacts to a ready/saved preview; this session is
        // mid-save, so mark it stale explicitly.
        this.setStatus('stale')
        this.state.message = null
        this.state.error = 'A referenced image changed on disk. Generate the preview again.'
        return 'blocked'
      }
      if (sequence !== this.sequence) return 'blocked'
    }

    const result = await this.deps.save({
      previewId: this.state.previewId,
      documentVersion: versions.documentVersion,
      settingsVersion: versions.settingsVersion,
      resourceVersion: versions.resourceVersion,
      defaultPath: target?.filePath ?? request.defaultPath,
      reuseLastPath: request.reuseLastPath
    })
    // The dialog may have been closed or a new export started while the native
    // save dialog was open; that newer session owns the state now.
    if (sequence !== this.sequence) return 'blocked'
    if (result.ok && result.status === 'saved') {
      this.setStatus('saved')
      this.state.message = result.filePath
      return 'saved'
    }
    if (result.ok && result.status === 'canceled') {
      // Canceling the OS dialog returns to the same preview page (P3).
      this.setStatus('ready')
      return 'canceled'
    }
    if (!result.ok) {
      // A stale rejection means main revalidated the artifact (for example a
      // referenced image changed while the dialog was open): the preview is no
      // longer usable, so saving must stay disabled.
      if (result.code === 'stale') {
        this.setStatus('stale')
        this.state.message = null
      } else {
        this.setStatus('ready')
      }
      this.state.error = result.message
      return 'failed'
    }
    this.setStatus('ready')
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

  private logTransition(next: string): void {
    if (window.electron?.process?.env?.PERF_TESTING !== 'true') return

    console.log('[pdf-status]', this.state.status, '->', next, 'seq=' + this.sequence)
  }

  private setStatus(next: PdfPreviewStatus): void {
    if (window.electron?.process?.env?.PERF_TESTING === 'true') {
      this.state.events = [...this.state.events, this.state.status + '>' + next].slice(-12)
    }
    this.state.status = next
  }

  /**
   * Compare each recorded resource against the file on disk. A changed hash, a
   * file that disappeared and a file that appeared where none was readable all
   * invalidate the artifact (P2/P7).
   */
  private async resourcesChanged(): Promise<boolean> {
    const read = this.deps.readResource
    const resources = this.state.resources
    if (!read || resources.length === 0) return false
    for (const resource of resources) {
      const current = await read(resource.path)
      const currentHash = current?.hash ?? null
      if (currentHash !== resource.hash) return true
    }
    return false
  }

  private resetState(): void {
    this.setStatus('idle')
    this.state.previewId = null
    this.state.pageCount = 0
    this.state.currentPage = 1
    this.state.error = null
    this.state.message = null
    this.state.versions = null
    this.state.resources = []
    this.state.missingResources = []
  }

  private dropDocumentInBackground(): void {
    const document = this.document
    this.document = null
    if (document) document.destroy().catch(() => {})
  }
}
