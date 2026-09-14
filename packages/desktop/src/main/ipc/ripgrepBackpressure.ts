export interface Batch<T> {
  batchId: number
  payload: T
  beforeSend?: () => boolean | void
  afterSend?: () => boolean | void
}

export interface BatchGateOptions {
  maxInFlight: number
  maxQueued: number
  onCapacity?: () => void
  onSendFailure?: () => void
}

type BatchHook = () => boolean | void

/**
 * A small FIFO gate for renderer-bound batches.
 *
 * The gate counts both delivered-but-unacknowledged batches and queued
 * batches. Once the combined bound is reached, producers must stop reading
 * their source until an ACK releases capacity.
 */
export class BatchGate<T> {
  private readonly maxInFlight: number
  private readonly maxQueued: number
  private readonly send: (batch: Batch<T>) => boolean
  private readonly onCapacity?: () => void
  private readonly onSendFailure?: () => void
  private readonly queue: Batch<T>[] = []
  private readonly inFlight = new Map<number, Batch<T>>()
  private nextBatchId = 1
  private closed = false

  constructor(
    send: (batch: Batch<T>) => boolean,
    { maxInFlight, maxQueued, onCapacity, onSendFailure }: BatchGateOptions
  ) {
    if (!Number.isInteger(maxInFlight) || maxInFlight < 1) {
      throw new RangeError('maxInFlight must be a positive integer')
    }
    if (!Number.isInteger(maxQueued) || maxQueued < 0) {
      throw new RangeError('maxQueued must be a non-negative integer')
    }
    this.maxInFlight = maxInFlight
    this.maxQueued = maxQueued
    this.send = send
    this.onCapacity = onCapacity
    this.onSendFailure = onSendFailure
  }

  get inFlightCount(): number {
    return this.inFlight.size
  }

  get queuedCount(): number {
    return this.queue.length
  }

  get isEmpty(): boolean {
    return this.inFlight.size === 0 && this.queue.length === 0
  }

  get isFull(): boolean {
    return !this.canAccept()
  }

  enqueue(
    payload: T,
    hooks: { beforeSend?: BatchHook; afterSend?: BatchHook } = {}
  ): number | null {
    if (!this.canAccept()) return null

    const batch: Batch<T> = {
      batchId: this.nextBatchId++,
      payload,
      beforeSend: hooks.beforeSend,
      afterSend: hooks.afterSend
    }
    this.queue.push(batch)
    this.drain()
    return batch.batchId
  }

  ack(batchId: number): boolean {
    if (!this.inFlight.delete(batchId)) return false
    this.drain()
    this.onCapacity?.()
    return true
  }

  close(): void {
    this.closed = true
    this.queue.length = 0
    this.inFlight.clear()
  }

  private canAccept(): boolean {
    return (
      !this.closed && this.inFlight.size + this.queue.length < this.maxInFlight + this.maxQueued
    )
  }

  private runHook(hook: BatchHook | undefined): boolean {
    if (!hook) return true
    try {
      return hook() !== false
    } catch {
      return false
    }
  }

  private drain(): void {
    while (!this.closed && this.inFlight.size < this.maxInFlight && this.queue.length > 0) {
      const batch = this.queue.shift()
      if (!batch) return
      if (!this.runHook(batch.beforeSend) || this.closed) {
        this.fail()
        return
      }

      this.inFlight.set(batch.batchId, batch)
      let sent = false
      try {
        sent = this.send(batch)
      } catch {
        sent = false
      }
      if (!sent || !this.runHook(batch.afterSend)) {
        this.fail()
        return
      }
    }
  }

  private fail(): void {
    if (this.closed) return
    this.closed = true
    this.queue.length = 0
    this.inFlight.clear()
    this.onSendFailure?.()
  }
}
