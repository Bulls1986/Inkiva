export type EditorMutationKind = 'text-only' | 'structural' | 'diagram'

export interface EditorMutationPolicy {
  kind: EditorMutationKind
  snapshot: 'deferred' | 'immediate'
  refreshToc: boolean
  renderDiagram: boolean
}

interface MutationPayload {
  mutationKind?: unknown
  tocChanged?: unknown
  op?: unknown
  prevDoc?: unknown
}

interface OperationComponent {
  i?: unknown
  r?: unknown
  es?: unknown
  e?: unknown
  et?: unknown
  p?: unknown
  d?: unknown
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value != null && typeof value === 'object' && !Array.isArray(value)
)

const isMutationKind = (value: unknown): value is EditorMutationKind => (
  value === 'text-only' || value === 'structural' || value === 'diagram'
)

const stateName = (value: unknown): string | undefined => {
  if (!isRecord(value) || typeof value.name !== 'string') return undefined
  return value.name
}

const containsDiagramState = (value: unknown): boolean => {
  if (stateName(value) === 'diagram') return true
  if (Array.isArray(value)) return value.some(containsDiagramState)
  if (!isRecord(value)) return false
  return Object.values(value).some(containsDiagramState)
}

const isTextComponent = (component: OperationComponent, path: Array<string | number>): boolean => {
  if (component.es !== undefined) return true
  if (path[path.length - 1] !== 'text') return false

  const hasReplacement = component.i !== undefined || component.r !== undefined
  if (!hasReplacement) return false

  return [component.i, component.r]
    .filter(value => value !== undefined)
    .every(value => typeof value === 'string')
}

/**
 * Classify the low-level JSON mutation without walking or serializing the
 * document. Muya publishes `mutationKind`; the operation fallback keeps the
 * desktop boundary safe when an older engine or a test double omits it.
 */
export const classifyEditorMutation = (change: unknown): EditorMutationKind => {
  const payload = isRecord(change) ? change as MutationPayload : {}
  if (isMutationKind(payload.mutationKind)) return payload.mutationKind
  if (payload.tocChanged === true) return 'structural'

  const previous = Array.isArray(payload.prevDoc) ? payload.prevDoc : []
  let sawOperation = false
  let sawStructural = false
  let sawDiagram = false

  const visit = (descent: unknown[], inheritedPath: Array<string | number> = []): void => {
    let path = [...inheritedPath]
    for (const entry of descent) {
      if (Array.isArray(entry)) {
        visit(entry, [])
        continue
      }
      if (typeof entry === 'number' || typeof entry === 'string') {
        path.push(entry)
        continue
      }
      if (!isRecord(entry)) continue

      sawOperation = true
      const component = entry as OperationComponent
      const rootIndex = path[0]
      const previousRoot = typeof rootIndex === 'number' ? previous[rootIndex] : undefined
      if (stateName(previousRoot) === 'diagram' || containsDiagramState(component.i) || containsDiagramState(component.r)) {
        sawDiagram = true
      } else if (!isTextComponent(component, path)) {
        sawStructural = true
      }
      path = []
    }
  }

  if (Array.isArray(payload.op)) visit(payload.op)
  if (sawDiagram) return 'diagram'
  if (sawStructural || !sawOperation) return 'structural'
  return 'text-only'
}

export const getEditorMutationPolicy = (change: unknown): EditorMutationPolicy => {
  const payload = isRecord(change) ? change as MutationPayload : {}
  const kind = classifyEditorMutation(change)
  return {
    kind,
    snapshot: kind === 'structural' ? 'immediate' : 'deferred',
    refreshToc: payload.tocChanged === true,
    renderDiagram: kind === 'diagram'
  }
}

type TimerHandle = ReturnType<typeof setTimeout>
type SetTimer = (handler: () => void, timeout: number) => TimerHandle
type ClearTimer = (timer: TimerHandle) => void

export type EditorSnapshotMode = 'full' | 'switch' | 'persistence'

interface SnapshotEntry {
  capture: (mode?: EditorSnapshotMode) => void
  debounceTimer: TimerHandle | null
  maxWaitTimer: TimerHandle | null
}

export interface EditorSnapshotSchedulerOptions {
  delayMs?: number
  maxWaitMs?: number
  postPersistenceDelayMs?: number
  setTimeout?: SetTimer
  clearTimeout?: ClearTimer
}

/**
 * Coalesces expensive Markdown/history/block snapshots away from the input
 * event. A structural mutation can flush the latest snapshot synchronously;
 * text-only mutations use the debounce/max-wait path.
 */
export class EditorSnapshotScheduler {
  private readonly delayMs: number
  private readonly maxWaitMs: number
  private readonly postPersistenceDelayMs: number
  private readonly setTimer: SetTimer
  private readonly clearTimer: ClearTimer
  private readonly entries = new Map<string, SnapshotEntry>()

  constructor(options: EditorSnapshotSchedulerOptions = {}) {
    this.delayMs = options.delayMs ?? 80
    this.maxWaitMs = options.maxWaitMs ?? 500
    this.postPersistenceDelayMs = options.postPersistenceDelayMs ?? 200
    this.setTimer = options.setTimeout ?? ((handler, timeout) => setTimeout(handler, timeout))
    this.clearTimer = options.clearTimeout ?? ((timer) => clearTimeout(timer))
  }

  request(id: string, capture: (mode?: EditorSnapshotMode) => void, immediate = false): void {
    if (!id) return
    let entry = this.entries.get(id)
    if (!entry) {
      entry = { capture, debounceTimer: null, maxWaitTimer: null }
      this.entries.set(id, entry)
    } else {
      entry.capture = capture
    }

    if (immediate) {
      this.flush(id)
      return
    }

    if (entry.debounceTimer !== null) this.clearTimer(entry.debounceTimer)
    entry.debounceTimer = this.setTimer(() => this.flush(id), this.delayMs)
    if (entry.maxWaitTimer === null) {
      entry.maxWaitTimer = this.setTimer(() => this.flush(id), this.maxWaitMs)
    }
  }

  flush(id: string, mode: EditorSnapshotMode = 'full'): void {
    const entry = this.entries.get(id)
    if (!entry) return
    if (entry.debounceTimer !== null) this.clearTimer(entry.debounceTimer)
    if (entry.maxWaitTimer !== null) this.clearTimer(entry.maxWaitTimer)
    entry.debounceTimer = null
    entry.maxWaitTimer = null

    if (mode === 'persistence') {
      // Manual save needs the durable Markdown snapshot immediately, but derived
      // UI metadata (word count + reusable block state) must not sit in front of
      // the disk write. Keep the same capture callback and enrich later; the
      // editor caches Markdown per revision so this follow-up does not serialize
      // the same revision a second time.
      entry.capture(mode)
      entry.debounceTimer = this.setTimer(() => this.flush(id, 'full'), this.postPersistenceDelayMs)
      return
    }

    this.entries.delete(id)
    entry.capture(mode)
  }

  cancel(id?: string): void {
    const ids = id ? [id] : [...this.entries.keys()]
    for (const entryId of ids) {
      const entry = this.entries.get(entryId)
      if (!entry) continue
      if (entry.debounceTimer !== null) this.clearTimer(entry.debounceTimer)
      if (entry.maxWaitTimer !== null) this.clearTimer(entry.maxWaitTimer)
      this.entries.delete(entryId)
    }
  }

  dispose(): void {
    this.cancel()
  }
}
