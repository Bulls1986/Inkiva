import path from 'path'

export interface DocumentWriteRequest {
  pathname: string
  revision?: number
  write: () => Promise<void>
}

export interface DocumentWriteResult {
  written: boolean
  skipped: boolean
  revision?: number
}

interface WriteWaiter {
  resolve: (result: DocumentWriteResult) => void
  reject: (error: unknown) => void
}

interface WriteTask {
  revision?: number
  write: () => Promise<void>
  waiters: WriteWaiter[]
}

interface WriteEntry {
  running: WriteTask | null
  pending: WriteTask[]
  lastWrittenRevision?: number
}

const getPathKey = (pathname: string): string => {
  const normalized = path.resolve(pathname)
  return process.platform === 'win32' || process.platform === 'darwin'
    ? normalized.toLowerCase()
    : normalized
}

const skippedResult = (revision?: number): DocumentWriteResult => ({
  written: false,
  skipped: true,
  revision
})

/**
 * Serializes writes per document while allowing different documents to write
 * concurrently. A revision identifies the dirty snapshot that a write came
 * from; an already-written or superseded revision is not written again.
 */
export class DocumentWriteQueue {
  private readonly _entries = new Map<string, WriteEntry>()
  private readonly _lastWrittenRevisions = new Map<string, number>()

  enqueue(request: DocumentWriteRequest): Promise<DocumentWriteResult> {
    const key = getPathKey(request.pathname)
    let entry = this._entries.get(key)
    if (!entry) {
      entry = {
        running: null,
        pending: [],
        lastWrittenRevision: this._lastWrittenRevisions.get(key)
      }
      this._entries.set(key, entry)
    }

    const revision = request.revision
    if (revision !== undefined) {
      if (entry.lastWrittenRevision !== undefined && revision <= entry.lastWrittenRevision) {
        return Promise.resolve(skippedResult(revision))
      }

      const running = entry.running
      if (running && running.revision !== undefined) {
        if (revision === running.revision) {
          return this._join(running)
        }
        if (revision < running.revision) {
          return Promise.resolve(skippedResult(revision))
        }
      }

      const pendingRevisionIndex = entry.pending.findIndex((task) => task.revision !== undefined)
      if (pendingRevisionIndex !== -1) {
        const pendingTask = entry.pending[pendingRevisionIndex]
        const pendingRevision = pendingTask.revision
        if (pendingTask.revision === revision) {
          return this._join(pendingTask)
        }
        if (pendingRevision !== undefined && pendingRevision > revision) {
          return Promise.resolve(skippedResult(revision))
        }

        // A newer snapshot supersedes a queued older snapshot. Keep callers
        // waiting on the replaced task attached to the newer write.
        const task: WriteTask = {
          revision,
          write: request.write,
          waiters: pendingTask.waiters
        }
        entry.pending[pendingRevisionIndex] = task
        const result = this._join(task)
        if (!entry.running) void this._drain(key, entry)
        return result
      }
    }

    const task: WriteTask = {
      revision,
      write: request.write,
      waiters: []
    }
    entry.pending.push(task)
    const result = this._join(task)
    if (!entry.running) void this._drain(key, entry)
    return result
  }

  dispose(): void {
    this._entries.clear()
    this._lastWrittenRevisions.clear()
  }

  private _join(task: WriteTask): Promise<DocumentWriteResult> {
    return new Promise<DocumentWriteResult>((resolve, reject) => {
      task.waiters.push({ resolve, reject })
    })
  }

  private async _drain(key: string, entry: WriteEntry): Promise<void> {
    if (entry.running) return

    entry.running = entry.pending.shift() ?? null
    while (entry.running) {
      const task = entry.running
      try {
        await task.write()
        if (task.revision === undefined) {
          entry.lastWrittenRevision = undefined
          this._lastWrittenRevisions.delete(key)
        } else {
          entry.lastWrittenRevision = task.revision
          this._lastWrittenRevisions.set(key, task.revision)
        }
        const result: DocumentWriteResult = {
          written: true,
          skipped: false,
          revision: task.revision
        }
        task.waiters.forEach(({ resolve }) => resolve(result))
      } catch (error) {
        task.waiters.forEach(({ reject }) => reject(error))
      }

      entry.running = entry.pending.shift() ?? null
    }

    if (!entry.running && entry.pending.length === 0) {
      this._entries.delete(key)
    }
  }
}
