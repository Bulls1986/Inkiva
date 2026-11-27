import { getPdfPageOptions, type PdfPageSizeOptions } from './pageOptions'

/**
 * Owns the PDF artifact for one editor window: a single isolated print page
 * renders the document once, and the resulting bytes back both the on-screen
 * preview and the saved file (P1/P7).
 *
 * Two invariants drive the shape of this module:
 *  - a print page never runs two jobs: generations are serialized per service
 *    and the next page is created only after the previous one reported that it
 *    was destroyed (the v0.7.0 Windows spike crashed an Electron process when
 *    two printToPDF calls were submitted to one webContents);
 *  - a result that lost its turn (superseded, canceled, timed out) can never
 *    become the saved artifact, and the artifact is revalidated after the
 *    native save dialog returns.
 */

export interface PdfPrintPage {
  loadHtml(html: string): Promise<void>
  printToPdf(options: Record<string, unknown>): Promise<Uint8Array>
  destroy(): Promise<void>
}

export interface PdfPreviewVersionKey {
  /** Renderer document revision the HTML was serialized from. */
  documentVersion: string
  /** Export settings revision (paper, margins, theme, header/footer, ...). */
  settingsVersion: string
  /** Snapshot of referenced images/CSS resources. */
  resourceVersion: string
}

/**
 * Content identity of one referenced local resource, captured at generation
 * time. `hash: null` means the file was not readable then; if it becomes
 * readable later the pages change, so the preview must go stale.
 */
export interface PdfPreviewResourceIdentity {
  path: string
  hash: string | null
}

export interface PdfPreviewRequest extends PdfPreviewVersionKey {
  html: string
  pageOptions?: PdfPageSizeOptions
  /** Local resources whose content the saved PDF depends on. */
  resources?: PdfPreviewResourceIdentity[]
}

export interface PdfPreviewDescriptor {
  previewId: string
  byteLength: number
}

export interface PdfPreviewSaveRequest extends PdfPreviewVersionKey {
  previewId: string
  defaultPath: string
}

export type PdfPreviewSaveResult =
  | { status: 'saved', filePath: string, byteLength: number }
  | { status: 'canceled' }

/** Shape the IPC layer reads back from a rejected generation/save. */
export interface PdfPreviewFailureLike {
  code?: PdfPreviewErrorCode
  message: string
}

export type PdfPreviewErrorCode =
  | 'stale'
  | 'timeout'
  | 'generation-failed'
  | 'save-failed'

export class PdfPreviewError extends Error {
  readonly code: PdfPreviewErrorCode
  /** Original failure, kept for logs; not part of the IPC payload. */
  readonly detail: unknown

  constructor(code: PdfPreviewErrorCode, message: string, detail?: unknown) {
    super(message)
    this.name = 'PdfPreviewError'
    this.code = code
    this.detail = detail
  }
}

export interface PdfPreviewServiceDeps {
  createPrintPage(): PdfPrintPage
  writeFile(filePath: string, data: Uint8Array): Promise<void>
  showSaveDialog(request: {
    defaultPath: string
  }): Promise<{ canceled: boolean, filePath?: string }>
  /** Upper bound for one generation; a stalled print page must not hang the UI. */
  generationTimeoutMs?: number
  /** Upper bound for tearing a print page down before the queue moves on. */
  cleanupTimeoutMs?: number
  /**
   * Re-read a resource's content identity. `null` means the file is missing or
   * unreadable. Main re-checks this right before writing, after the native
   * dialog returns, because the renderer's own dialog hook is optional.
   */
  hashFile?(path: string): Promise<string | null>
  createPreviewId?: () => string
}

interface GenerationToken {
  superseded: boolean
}

interface PdfPreviewArtifact {
  id: string
  data: Uint8Array
  key: string
  resources: PdfPreviewResourceIdentity[]
}

const DEFAULT_GENERATION_TIMEOUT_MS = 30000
const DEFAULT_CLEANUP_TIMEOUT_MS = 10000

const versionKey = (key: PdfPreviewVersionKey): string =>
  JSON.stringify([key.documentVersion, key.settingsVersion, key.resourceVersion])

export class PdfPreviewService {
  private readonly deps: PdfPreviewServiceDeps
  private artifact: PdfPreviewArtifact | null = null
  private token: GenerationToken | null = null
  private activePage: PdfPrintPage | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private idSeq = 0

  constructor(deps: PdfPreviewServiceDeps) {
    this.deps = deps
  }

  generate(request: PdfPreviewRequest): Promise<PdfPreviewDescriptor> {
    // A newer request always wins: the older generation keeps running so its
    // print page can finish and be destroyed, but its bytes are discarded.
    if (this.token) this.token.superseded = true
    const token: GenerationToken = { superseded: false }
    this.token = token
    const key = versionKey(request)
    const run = this.queue.then(() => this.runGeneration(request, token, key))
    // Keep the serialization chain alive even when one generation fails.
    this.queue = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  /** Bytes of the current artifact, or null when nothing valid is held. */
  read(previewId: string): Uint8Array | null {
    if (!this.artifact || this.artifact.id !== previewId) return null
    return this.artifact.data
  }

  async save(request: PdfPreviewSaveRequest): Promise<PdfPreviewSaveResult> {
    const artifact = this.artifact
    if (!artifact || artifact.id !== request.previewId) {
      throw new PdfPreviewError('stale', 'The preview is no longer the current one.')
    }
    if (artifact.key !== versionKey(request)) {
      throw new PdfPreviewError('stale', 'The document, settings or resources changed.')
    }

    const dialog = await this.deps.showSaveDialog({ defaultPath: request.defaultPath })
    if (dialog.canceled || !dialog.filePath) {
      return { status: 'canceled' }
    }

    // The dialog is a long user cancellation point: referenced images can be
    // replaced (even with the same size and mtime) while it is open. Main owns
    // the write, so it verifies the content here — after the dialog returned and
    // immediately before the bytes hit the disk.
    await this.assertResourcesUnchanged(artifact)

    // The dialog is a long user-controlled pause: the document may have been
    // edited or the preview released while it was open, and the older artifact
    // must not be written in that case.
    if (
      !this.artifact ||
      this.artifact.id !== artifact.id ||
      this.artifact.key !== artifact.key
    ) {
      throw new PdfPreviewError('stale', 'The preview expired while the save dialog was open.')
    }

    try {
      await this.deps.writeFile(dialog.filePath, artifact.data)
    } catch (error) {
      // Keep the artifact so the user can retry from the same page (P3).
      throw new PdfPreviewError('save-failed', 'The PDF could not be written.', error)
    }

    return { status: 'saved', filePath: dialog.filePath, byteLength: artifact.data.byteLength }
  }

  cancel(): void {
    if (this.token) this.token.superseded = true
    const page = this.activePage
    if (page) {
      this.activePage = null
      void page.destroy()
    }
  }

  release(previewId: string): void {
    if (this.artifact && this.artifact.id === previewId) {
      this.artifact = null
    }
  }

  /** Window teardown: drop the artifact and stop any generation in flight. */
  dispose(): void {
    this.cancel()
    this.artifact = null
    this.token = null
  }

  private async runGeneration(
    request: PdfPreviewRequest,
    token: GenerationToken,
    key: string
  ): Promise<PdfPreviewDescriptor> {
    if (token.superseded) {
      throw new PdfPreviewError('stale', 'The preview was superseded before it started.')
    }

    const page = this.deps.createPrintPage()
    this.activePage = page
    try {
      await this.withTimeout(page.loadHtml(request.html), 'The document could not be laid out.')
      if (token.superseded) {
        throw new PdfPreviewError('stale', 'The preview was superseded.')
      }
      const printOptions = {
        printBackground: true,
        // Tagged structure + outline are what give the PDF real bookmarks.
        generateTaggedPDF: true,
        generateDocumentOutline: true,
        ...getPdfPageOptions(request.pageOptions)
      }
      const data = await this.withTimeout(
        page.printToPdf(printOptions),
        'Generating the PDF timed out.'
      )
      if (token.superseded) {
        throw new PdfPreviewError('stale', 'The preview was superseded while printing.')
      }
      const id = this.deps.createPreviewId
        ? this.deps.createPreviewId()
        : this.nextPreviewId()
      this.artifact = { id, data, key, resources: request.resources ?? [] }
      return { previewId: id, byteLength: data.byteLength }
    } catch (error) {
      if (error instanceof PdfPreviewError) throw error
      if (token.superseded) {
        throw new PdfPreviewError('stale', 'The preview was superseded.', error)
      }
      throw new PdfPreviewError('generation-failed', 'The PDF could not be generated.', error)
    } finally {
      if (this.activePage === page) this.activePage = null
      if (this.token === token) this.token = null
      await this.destroyPage(page)
    }
  }

  /**
   * Compare every referenced resource against the identity captured at
   * generation time. Size and mtime are not identity, so the file bytes are
   * hashed again here; `null` is a legitimate recorded value (the image was
   * unreadable) and only differs when the file becomes readable later.
   */
  private async assertResourcesUnchanged(artifact: PdfPreviewArtifact): Promise<void> {
    const hashFile = this.deps.hashFile
    if (!hashFile || artifact.resources.length === 0) return
    for (const resource of artifact.resources) {
      const current = await hashFile(resource.path)
      if (current !== resource.hash) {
        throw new PdfPreviewError(
          'stale',
          'A referenced image changed on disk. Generate the preview again.'
        )
      }
    }
  }

  /**
   * The single print page is also the queue lock: teardown must be bounded,
   * because a page that never reports its destruction would otherwise stall
   * every later preview in this window.
   */
  private async destroyPage(page: PdfPrintPage): Promise<void> {
    const timeoutMs = this.deps.cleanupTimeoutMs ?? DEFAULT_CLEANUP_TIMEOUT_MS
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        page.destroy().catch(() => {}),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, timeoutMs)
        })
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  private nextPreviewId(): string {
    this.idSeq += 1
    return 'pdf-preview-' + this.idSeq
  }

  private async withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
    const timeoutMs = this.deps.generationTimeoutMs ?? DEFAULT_GENERATION_TIMEOUT_MS
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new PdfPreviewError('timeout', message))
      }, timeoutMs)
    })
    try {
      return await Promise.race([promise, timeout])
    } finally {
      if (timer) clearTimeout(timer)
      // A print page destroyed after a timeout rejects its own promise later;
      // that late rejection must not surface as an unhandled error.
      promise.catch(() => {})
    }
  }
}
