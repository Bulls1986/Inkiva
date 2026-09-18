export type SnapshotLifecycle = 'active' | 'warm' | 'cold'
export type SnapshotDerivedKind = 'markdown' | 'wordCount' | 'blocks' | 'historyMeta'

export interface RevisionDerivedValue<T = unknown> {
  revision: number
  value: T
  estimatedCost: number
}

export interface DocumentRevisionSnapshot {
  documentId: string
  revision: number
  lifecycle: SnapshotLifecycle
  markdown?: RevisionDerivedValue<string>
  wordCount?: RevisionDerivedValue
  blocks?: RevisionDerivedValue
  historyMeta?: RevisionDerivedValue
}

export interface SnapshotMetricsBucket {
  hits: number
  misses: number
}

export interface DocumentRevisionSnapshotMetrics {
  markdown: SnapshotMetricsBucket
  wordCount: SnapshotMetricsBucket
  blocks: SnapshotMetricsBucket
  historyMeta: SnapshotMetricsBucket
  invalidations: number
  staleDrops: number
  coalescedConsumers: number
  evictions: number
}

export interface DocumentRevisionSnapshotCacheOptions {
  /**
   * Approximate derived-state memory budget. Markdown cost is measured in
   * characters; callers should pass a comparable document-size estimate for
   * block trees so one huge document cannot hide behind an entry-count limit.
   */
  maxCost?: number
  perfCapture?: boolean
}

export interface DocumentRevisionSnapshotInspection {
  revision: number
  lifecycle: SnapshotLifecycle
  hasMarkdown: boolean
  hasWordCount: boolean
  hasBlocks: boolean
  hasHistoryMeta: boolean
  estimatedCost: number
}

interface DocumentEntry {
  snapshot: DocumentRevisionSnapshot
  lastAccess: number
  inFlight: Map<SnapshotDerivedKind, Promise<unknown>>
}

const DEFAULT_MAX_COST = 16 * 1024 * 1024

const emptyMetrics = (): DocumentRevisionSnapshotMetrics => ({
  markdown: { hits: 0, misses: 0 },
  wordCount: { hits: 0, misses: 0 },
  blocks: { hits: 0, misses: 0 },
  historyMeta: { hits: 0, misses: 0 },
  invalidations: 0,
  staleDrops: 0,
  coalescedConsumers: 0,
  evictions: 0
})

const deepFreeze = <T>(value: T, seen = new WeakSet<object>()): T => {
  if (value == null || typeof value !== 'object') return value
  const objectValue = value as object
  if (seen.has(objectValue)) return value
  seen.add(objectValue)
  for (const nested of Object.values(objectValue)) {
    deepFreeze(nested, seen)
  }
  return Object.freeze(value)
}

const estimateValueCost = (kind: SnapshotDerivedKind, value: unknown, hint?: number): number => {
  if (Number.isFinite(hint) && (hint ?? 0) >= 0) return Math.floor(hint ?? 0)
  if (kind === 'markdown') return typeof value === 'string' ? value.length : 0
  if (kind === 'wordCount' || kind === 'historyMeta') return 1
  try {
    return JSON.stringify(value)?.length ?? 0
  } catch {
    return 0
  }
}

const derivedCost = (snapshot: DocumentRevisionSnapshot): number =>
  (snapshot.markdown?.estimatedCost ?? 0) +
  (snapshot.wordCount?.estimatedCost ?? 0) +
  (snapshot.blocks?.estimatedCost ?? 0) +
  (snapshot.historyMeta?.estimatedCost ?? 0)

/**
 * One document id owns one monotonic content revision. Expensive derived views
 * are materialized lazily and at most once per revision. Presentation-only
 * state (selection/scroll/theme) never advances the content revision.
 */
export class DocumentRevisionSnapshotCache {
  private readonly entries = new Map<string, DocumentEntry>()
  private readonly maxCost: number
  private readonly capturedMetrics: DocumentRevisionSnapshotMetrics | null
  private accessClock = 0

  constructor(options: DocumentRevisionSnapshotCacheOptions = {}) {
    this.maxCost = Math.max(0, options.maxCost ?? DEFAULT_MAX_COST)
    this.capturedMetrics = options.perfCapture ? emptyMetrics() : null
  }

  currentRevision(documentId: string): number {
    return this.entries.get(documentId)?.snapshot.revision ?? 0
  }

  seed(documentId: string, revision = 0, lifecycle: SnapshotLifecycle = 'cold'): number {
    if (!documentId) return 0
    const existing = this.entries.get(documentId)
    if (existing) {
      if (revision > existing.snapshot.revision) {
        this.replaceRevision(existing, revision)
      }
      existing.snapshot.lifecycle = lifecycle
      this.touch(existing)
      return existing.snapshot.revision
    }
    this.entries.set(documentId, {
      snapshot: { documentId, revision: Math.max(0, revision), lifecycle },
      lastAccess: ++this.accessClock,
      inFlight: new Map()
    })
    return Math.max(0, revision)
  }

  advanceContentRevision(documentId: string): number {
    if (!documentId) return 0
    const entry = this.ensureEntry(documentId)
    const hadDerivedState = derivedCost(entry.snapshot) > 0
    const next = entry.snapshot.revision + 1
    this.replaceRevision(entry, next)
    if (hadDerivedState && this.capturedMetrics) this.capturedMetrics.invalidations += 1
    return next
  }

  /**
   * Presentation changes are intentionally revision-neutral. Touching only
   * affects LRU recency and never invalidates content-derived values.
   */
  touchPresentation(documentId: string): void {
    const entry = this.entries.get(documentId)
    if (entry) this.touch(entry)
  }

  setLifecycle(documentId: string, lifecycle: SnapshotLifecycle): void {
    const entry = this.ensureEntry(documentId)
    entry.snapshot.lifecycle = lifecycle
    this.touch(entry)
    if (lifecycle === 'cold') {
      this.dropDerived(entry, 'blocks')
    }
    this.enforceBudget()
  }

  getMarkdown(documentId: string, revision: number, compute: () => string): string {
    return this.getOrCompute(documentId, revision, 'markdown', compute) as string
  }

  getWordCount<T>(documentId: string, revision: number, compute: () => T): T {
    return this.getOrCompute(documentId, revision, 'wordCount', compute) as T
  }

  getBlocks<T>(documentId: string, revision: number, compute: () => T, estimatedCost?: number): T {
    return this.getOrCompute(documentId, revision, 'blocks', compute, estimatedCost, true) as T
  }

  getHistoryMeta<T>(documentId: string, revision: number, compute: () => T): T {
    return this.getOrCompute(documentId, revision, 'historyMeta', compute) as T
  }

  async getMarkdownAsync(
    documentId: string,
    revision: number,
    compute: () => Promise<string> | string
  ): Promise<string> {
    const cached = this.getCached<string>(documentId, revision, 'markdown')
    if (cached.hit && cached.value !== undefined) return cached.value
    const entry = this.requireCurrentEntry(documentId, revision)
    const existing = entry.inFlight.get('markdown') as Promise<string> | undefined
    if (existing) {
      if (this.capturedMetrics) this.capturedMetrics.coalescedConsumers += 1
      return existing
    }

    this.recordMiss('markdown')
    const pending = Promise.resolve().then(compute)
    entry.inFlight.set('markdown', pending)
    try {
      const value = await pending
      const latest = this.entries.get(documentId)
      if (latest !== entry || latest.snapshot.revision !== revision) {
        if (this.capturedMetrics) this.capturedMetrics.staleDrops += 1
        return value
      }
      this.storeDerived(entry, 'markdown', revision, value)
      return value
    } finally {
      if (entry.inFlight.get('markdown') === pending) entry.inFlight.delete('markdown')
    }
  }

  seedMarkdown(documentId: string, revision: number, markdown: string): void {
    const entry = this.requireCurrentEntry(documentId, revision)
    this.storeDerived(entry, 'markdown', revision, markdown)
  }

  readMarkdown(
    documentId: string,
    revision = this.currentRevision(documentId)
  ): string | undefined {
    return this.readDerived<string>(documentId, revision, 'markdown')
  }

  readWordCount<T>(documentId: string, revision = this.currentRevision(documentId)): T | undefined {
    return this.readDerived<T>(documentId, revision, 'wordCount')
  }

  readBlocks<T>(documentId: string, revision = this.currentRevision(documentId)): T | undefined {
    return this.readDerived<T>(documentId, revision, 'blocks')
  }

  readHistoryMeta<T>(
    documentId: string,
    revision = this.currentRevision(documentId)
  ): T | undefined {
    return this.readDerived<T>(documentId, revision, 'historyMeta')
  }

  inspect(documentId: string): DocumentRevisionSnapshotInspection | null {
    const entry = this.entries.get(documentId)
    if (!entry) return null
    const { snapshot } = entry
    return {
      revision: snapshot.revision,
      lifecycle: snapshot.lifecycle,
      hasMarkdown: snapshot.markdown?.revision === snapshot.revision,
      hasWordCount: snapshot.wordCount?.revision === snapshot.revision,
      hasBlocks: snapshot.blocks?.revision === snapshot.revision,
      hasHistoryMeta: snapshot.historyMeta?.revision === snapshot.revision,
      estimatedCost: derivedCost(snapshot)
    }
  }

  estimatedCost(): number {
    let total = 0
    for (const { snapshot } of this.entries.values()) total += derivedCost(snapshot)
    return total
  }

  metrics(): DocumentRevisionSnapshotMetrics | null {
    if (!this.capturedMetrics) return null
    return {
      markdown: { ...this.capturedMetrics.markdown },
      wordCount: { ...this.capturedMetrics.wordCount },
      blocks: { ...this.capturedMetrics.blocks },
      historyMeta: { ...this.capturedMetrics.historyMeta },
      invalidations: this.capturedMetrics.invalidations,
      staleDrops: this.capturedMetrics.staleDrops,
      coalescedConsumers: this.capturedMetrics.coalescedConsumers,
      evictions: this.capturedMetrics.evictions
    }
  }

  resetMetrics(): void {
    if (!this.capturedMetrics) return
    Object.assign(this.capturedMetrics, emptyMetrics())
  }

  release(documentId: string): void {
    this.entries.delete(documentId)
  }

  prune(liveDocumentIds: ReadonlySet<string>): void {
    for (const id of this.entries.keys()) {
      if (!liveDocumentIds.has(id)) this.entries.delete(id)
    }
  }

  private ensureEntry(documentId: string): DocumentEntry {
    let entry = this.entries.get(documentId)
    if (!entry) {
      entry = {
        snapshot: { documentId, revision: 0, lifecycle: 'cold' },
        lastAccess: ++this.accessClock,
        inFlight: new Map()
      }
      this.entries.set(documentId, entry)
    }
    return entry
  }

  private requireCurrentEntry(documentId: string, revision: number): DocumentEntry {
    const entry = this.ensureEntry(documentId)
    if (revision < entry.snapshot.revision) {
      throw new Error(
        `Stale revision ${revision} requested for ${documentId}; current revision is ${entry.snapshot.revision}`
      )
    }
    if (revision > entry.snapshot.revision) this.replaceRevision(entry, revision)
    this.touch(entry)
    return entry
  }

  private replaceRevision(entry: DocumentEntry, revision: number): void {
    const { documentId, lifecycle } = entry.snapshot
    entry.snapshot = { documentId, revision, lifecycle }
    // Existing async work may still settle, but its completion checks revision
    // identity before writing and therefore cannot overwrite this snapshot.
    // Clear the current-revision lookup so rev N+1 never joins rev N's promise.
    entry.inFlight.clear()
    this.touch(entry)
  }

  private getCached<T>(
    documentId: string,
    revision: number,
    kind: SnapshotDerivedKind
  ): { hit: boolean; value?: T } {
    const entry = this.entries.get(documentId)
    if (!entry || entry.snapshot.revision !== revision) return { hit: false }
    const derived = entry.snapshot[kind] as RevisionDerivedValue<T> | undefined
    if (!derived || derived.revision !== revision) return { hit: false }
    this.touch(entry)
    this.recordHit(kind)
    return { hit: true, value: derived.value }
  }

  private readDerived<T>(
    documentId: string,
    revision: number,
    kind: SnapshotDerivedKind
  ): T | undefined {
    const entry = this.entries.get(documentId)
    if (!entry || entry.snapshot.revision !== revision) return undefined
    const derived = entry.snapshot[kind] as RevisionDerivedValue<T> | undefined
    if (!derived || derived.revision !== revision) return undefined
    this.touch(entry)
    return derived.value
  }

  private getOrCompute<T>(
    documentId: string,
    revision: number,
    kind: SnapshotDerivedKind,
    compute: () => T,
    estimatedCost?: number,
    freeze = false
  ): T {
    const cached = this.getCached<T>(documentId, revision, kind)
    if (cached.hit) return cached.value as T
    const entry = this.requireCurrentEntry(documentId, revision)
    this.recordMiss(kind)
    const rawValue = compute()
    const value = freeze ? deepFreeze(rawValue) : rawValue
    this.storeDerived(entry, kind, revision, value, estimatedCost)
    return value
  }

  private storeDerived<T>(
    entry: DocumentEntry,
    kind: SnapshotDerivedKind,
    revision: number,
    value: T,
    estimatedCost?: number
  ): void {
    if (entry.snapshot.revision !== revision) {
      if (this.capturedMetrics) this.capturedMetrics.staleDrops += 1
      return
    }
    const derived: RevisionDerivedValue<T> = {
      revision,
      value,
      estimatedCost: estimateValueCost(kind, value, estimatedCost)
    }
    Object.assign(entry.snapshot, { [kind]: derived })
    this.touch(entry)
    this.enforceBudget()
  }

  private dropDerived(entry: DocumentEntry, kind: SnapshotDerivedKind): boolean {
    if (!entry.snapshot[kind]) return false
    delete entry.snapshot[kind]
    if (this.capturedMetrics) this.capturedMetrics.evictions += 1
    return true
  }

  private enforceBudget(): void {
    if (this.maxCost <= 0) return
    let total = this.estimatedCost()
    if (total <= this.maxCost) return

    const candidates = [...this.entries.values()]
      .filter((entry) => entry.snapshot.lifecycle !== 'active')
      .sort((a, b) => {
        const lifecycleWeight = (value: SnapshotLifecycle): number =>
          value === 'cold' ? 0 : value === 'warm' ? 1 : 2
        const byLifecycle =
          lifecycleWeight(a.snapshot.lifecycle) - lifecycleWeight(b.snapshot.lifecycle)
        return byLifecycle || a.lastAccess - b.lastAccess
      })

    // Drop the high-cost representation first, then Markdown. Tiny metadata is
    // retained because evicting it saves negligible memory but causes churn.
    for (const entry of candidates) {
      if (total <= this.maxCost) break
      if (this.dropDerived(entry, 'blocks')) total = this.estimatedCost()
      if (total <= this.maxCost) break
      if (this.dropDerived(entry, 'markdown')) total = this.estimatedCost()
    }
  }

  private touch(entry: DocumentEntry): void {
    entry.lastAccess = ++this.accessClock
  }

  private recordHit(kind: SnapshotDerivedKind): void {
    if (this.capturedMetrics) this.capturedMetrics[kind].hits += 1
  }

  private recordMiss(kind: SnapshotDerivedKind): void {
    if (this.capturedMetrics) this.capturedMetrics[kind].misses += 1
  }
}

const perfCaptureEnabled =
  typeof window !== 'undefined' && window.electron?.process?.env?.PERF_TESTING === 'true'

export const documentRevisionSnapshots = new DocumentRevisionSnapshotCache({
  perfCapture: perfCaptureEnabled
})

if (perfCaptureEnabled) {
  const perfGlobal = globalThis as typeof globalThis & {
    __inkiva_get_revision_snapshot_metrics__?: () => DocumentRevisionSnapshotMetrics | null
    __inkiva_reset_revision_snapshot_metrics__?: () => void
  }
  perfGlobal.__inkiva_get_revision_snapshot_metrics__ = () => documentRevisionSnapshots.metrics()
  perfGlobal.__inkiva_reset_revision_snapshot_metrics__ = () =>
    documentRevisionSnapshots.resetMetrics()
}
