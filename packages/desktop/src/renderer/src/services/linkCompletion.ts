import type { MarkdownLinkCandidate } from '@shared/types/documentIntelligence'

/** One disposable completion operation, bound to an exact source tab identity. */
export class LinkCompletionSession {
  private generation = 0
  private documentId: string | null = null
  private sourcePath: string | null = null
  private composing = false
  get isComposing(): boolean { return this.composing }
  candidates: MarkdownLinkCandidate[] = []
  loading = false
  error: unknown = null

  constructor(private readonly lookup: (
    sourcePath: string,
    query: string
  ) => Promise<MarkdownLinkCandidate[]>) {}

  open(sourcePath: string, documentId: string): void {
    this.cancel()
    this.sourcePath = sourcePath
    this.documentId = documentId
  }

  async search(query: string): Promise<void> {
    const source = this.sourcePath
    if (!source) {
      this.loading = false
      this.error = null
      this.candidates = []
      return
    }
    const generation = ++this.generation
    this.loading = true
    this.error = null
    try {
      const candidates = await this.lookup(source, query)
      if (generation === this.generation && this.sourcePath === source) {
        this.candidates = candidates
      }
    } catch (error) {
      if (generation === this.generation) {
        this.error = error
        this.candidates = []
      }
    } finally {
      if (generation === this.generation) this.loading = false
    }
  }

  setComposing(composing: boolean): void {
    this.composing = composing
  }

  /** Invalidate prior responses immediately on input, even during debounce. */
  invalidate(): void {
    ++this.generation
    this.candidates = []
    this.loading = true
    this.error = null
  }

  choose(index: number, documentId: string, sourcePath: string): MarkdownLinkCandidate | null {
    if (
      this.composing ||
      this.loading ||
      this.documentId !== documentId ||
      this.sourcePath !== sourcePath
    ) return null
    return this.candidates[index] ?? null
  }

  cancel(): void {
    ++this.generation
    this.documentId = null
    this.sourcePath = null
    this.composing = false
    this.loading = false
    this.error = null
    this.candidates = []
  }
}
