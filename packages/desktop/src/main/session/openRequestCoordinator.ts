import { canonicalPathKey } from './pathCanonicalizer'

export type OpenRequestPhase = 'booting' | 'restoring' | 'ready'

export interface OpenPath {
  isDir: boolean
  path: string
}

export interface OpenRequest {
  source: string
  newWindow: boolean
  paths: readonly OpenPath[]
}

export interface OpenRequestCoordinatorOptions {
  platform?: NodeJS.Platform
  dispatch: (request: OpenRequest) => void
}

/**
 * Serializes all external open-file entry points around startup restore.
 *
 * The coordinator deliberately owns only request ordering and deduplication;
 * choosing a destination editor window remains an App/WindowManager concern.
 * This keeps OS events, argv and second-instance requests subject to the same
 * idempotency rules without coupling the pure queue to Electron objects.
 */
export class OpenRequestCoordinator {
  private readonly _platform: NodeJS.Platform
  private readonly _dispatch: (request: OpenRequest) => void
  private _phase: OpenRequestPhase
  private _pending: OpenRequest[]
  private _pendingKeys: Set<string>

  constructor(options: OpenRequestCoordinatorOptions) {
    this._platform = options.platform ?? process.platform
    this._dispatch = options.dispatch
    this._phase = 'booting'
    this._pending = []
    this._pendingKeys = new Set()
  }

  getPhase(): OpenRequestPhase {
    return this._phase
  }

  getPendingRequestCount(): number {
    return this._pending.length
  }

  getPendingPathCount(): number {
    return this._pendingKeys.size
  }

  getFirstPendingRequest(): OpenRequest | undefined {
    const request = this._pending[0]
    if (!request) return undefined
    return {
      ...request,
      paths: [...request.paths]
    }
  }

  hasPendingPaths(): boolean {
    return this._pendingKeys.size > 0
  }

  beginRestore(): void {
    if (this._phase === 'booting') this._phase = 'restoring'
  }

  completeRestore(): void {
    if (this._phase === 'ready') return

    this._phase = 'ready'
    const pending = this._pending
    this._pending = []
    this._pendingKeys.clear()

    for (const request of pending) {
      this._dispatch(request)
    }
  }

  enqueue(request: OpenRequest): void {
    const paths: OpenPath[] = []
    const requestKeys = new Set<string>()

    for (const item of request.paths) {
      const key = canonicalPathKey(item.path, this._platform)
      if (!key || requestKeys.has(key) || this._pendingKeys.has(key)) continue

      requestKeys.add(key)
      paths.push(item)
    }

    if (paths.length === 0) return

    const nextRequest: OpenRequest = {
      source: request.source,
      newWindow: request.newWindow,
      paths
    }

    if (this._phase === 'ready') {
      this._dispatch(nextRequest)
      return
    }

    this._pending.push(nextRequest)
    for (const key of requestKeys) this._pendingKeys.add(key)
  }
}

export default OpenRequestCoordinator
