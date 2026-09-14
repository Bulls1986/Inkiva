/**
 * The first launch that reaches this count is routed through safe restore.
 * A recovery attempt is considered failed when the process exits before the
 * matching `markReady` call.
 */
export const SAFE_RESTORE_FAILURE_THRESHOLD = 3

/** Version of the persisted safe-restore state. */
export const SAFE_RESTORE_SCHEMA_VERSION = 1

export interface SafeRestoreSessionState {
  consecutiveFailures: number
}

export interface SafeRestoreState {
  schemaVersion: typeof SAFE_RESTORE_SCHEMA_VERSION
  sessions: Record<string, SafeRestoreSessionState>
}

/**
 * Minimal synchronous persistence boundary for the main process.
 *
 * An Electron store, a JSON-backed store, or a test double can implement this
 * interface without making the guard depend on Electron or the filesystem.
 */
export interface SafeRestoreStore {
  get(): unknown
  set(value: SafeRestoreState): void
}

export interface SafeRestoreGuardOptions {
  /** Mainly useful for tests; production uses the explicit module constant. */
  failureThreshold?: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const isSessionId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.trim().length > 0

const createEmptyState = (): SafeRestoreState => ({
  schemaVersion: SAFE_RESTORE_SCHEMA_VERSION,
  sessions: {}
})

const setOwnSession = (
  sessions: Record<string, SafeRestoreSessionState>,
  sessionId: string,
  value: SafeRestoreSessionState
): void => {
  // `defineProperty` keeps even an unusual persisted identity such as
  // "__proto__" as data instead of changing the session map's prototype.
  Object.defineProperty(sessions, sessionId, {
    configurable: true,
    enumerable: true,
    value,
    writable: true
  })
}

const hasOwnSession = (
  sessions: Record<string, SafeRestoreSessionState>,
  sessionId: string
): boolean => Object.prototype.hasOwnProperty.call(sessions, sessionId)

const copyState = (state: SafeRestoreState): SafeRestoreState => {
  const sessions: Record<string, SafeRestoreSessionState> = {}
  for (const [sessionId, sessionState] of Object.entries(state.sessions)) {
    setOwnSession(sessions, sessionId, { ...sessionState })
  }

  return {
    schemaVersion: SAFE_RESTORE_SCHEMA_VERSION,
    sessions
  }
}

const readFailureCount = (value: unknown): number | null => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) return null
  return value as number
}

/**
 * Treat the persistence boundary as untrusted. A bad top-level value starts a
 * clean state; bad individual session records are discarded while unrelated
 * valid records survive. This keeps startup recovery best-effort and repairs
 * the state naturally on the next successful write.
 */
const normalizeState = (raw: unknown): SafeRestoreState => {
  if (
    !isRecord(raw) ||
    raw.schemaVersion !== SAFE_RESTORE_SCHEMA_VERSION ||
    !isRecord(raw.sessions)
  ) {
    return createEmptyState()
  }

  const sessions: Record<string, SafeRestoreSessionState> = {}
  for (const [sessionId, rawSessionState] of Object.entries(raw.sessions)) {
    if (!isSessionId(sessionId) || !isRecord(rawSessionState)) continue

    const consecutiveFailures = readFailureCount(rawSessionState.consecutiveFailures)
    if (consecutiveFailures === null) continue

    setOwnSession(sessions, sessionId, { consecutiveFailures })
  }

  return {
    schemaVersion: SAFE_RESTORE_SCHEMA_VERSION,
    sessions
  }
}

const hasSameState = (left: SafeRestoreState, right: SafeRestoreState): boolean => {
  const leftSessionIds = Object.keys(left.sessions)
  const rightSessionIds = Object.keys(right.sessions)
  if (leftSessionIds.length !== rightSessionIds.length) return false

  return leftSessionIds.every(
    (sessionId) =>
      hasOwnSession(right.sessions, sessionId) &&
      left.sessions[sessionId]?.consecutiveFailures ===
        right.sessions[sessionId]?.consecutiveFailures
  )
}

const getFailureCount = (state: SafeRestoreState, sessionId: string): number =>
  hasOwnSession(state.sessions, sessionId)
    ? (state.sessions[sessionId]?.consecutiveFailures ?? 0)
    : 0

const incrementFailureCount = (count: number): number =>
  Math.min(count + 1, Number.MAX_SAFE_INTEGER)

const resolveFailureThreshold = (threshold: number | undefined): number =>
  threshold !== undefined && Number.isSafeInteger(threshold) && threshold > 0
    ? threshold
    : SAFE_RESTORE_FAILURE_THRESHOLD

/**
 * Tracks startup recovery attempts independently for each session identity.
 *
 * Call `beginAttempt` before attempting recovery and call `markReady` once the
 * application has entered READY. If the process crashes in between, the next
 * process creates a new guard and the persisted count advances. Repeated
 * `beginAttempt` calls for one session on the same guard instance represent
 * the same process launch and are therefore ignored.
 */
export class SafeRestoreGuard {
  private readonly _store: SafeRestoreStore
  private readonly _failureThreshold: number
  private readonly _begunSessions: Set<string>
  private _state: SafeRestoreState | null

  constructor(store: SafeRestoreStore, options: SafeRestoreGuardOptions = {}) {
    this._store = store
    this._failureThreshold = resolveFailureThreshold(options.failureThreshold)
    this._begunSessions = new Set()
    this._state = null
  }

  /** Record one startup recovery attempt and return its consecutive count. */
  beginAttempt(sessionId: string): number {
    if (!isSessionId(sessionId)) return 0

    const state = this._readState()
    if (this._begunSessions.has(sessionId)) return getFailureCount(state, sessionId)

    this._begunSessions.add(sessionId)
    const nextState = copyState(state)
    setOwnSession(nextState.sessions, sessionId, {
      consecutiveFailures: incrementFailureCount(getFailureCount(state, sessionId))
    })
    this._writeState(nextState)

    return getFailureCount(nextState, sessionId)
  }

  /** Confirm a successful READY transition and clear that session's count. */
  markReady(sessionId: string): void {
    if (!isSessionId(sessionId)) return

    this._begunSessions.delete(sessionId)
    const state = this._readState()
    if (!hasOwnSession(state.sessions, sessionId)) return

    const nextState = copyState(state)
    delete nextState.sessions[sessionId]
    this._writeState(nextState)
  }

  /** Return whether the current session should bypass normal recovery. */
  shouldUseSafeRestore(sessionId: string): boolean {
    if (!isSessionId(sessionId)) return false
    return getFailureCount(this._readState(), sessionId) >= this._failureThreshold
  }

  private _readState(): SafeRestoreState {
    if (this._state) return this._state

    let raw: unknown
    try {
      raw = this._store.get()
    } catch {
      raw = undefined
    }

    this._state = normalizeState(raw)
    return this._state
  }

  private _writeState(nextState: SafeRestoreState): void {
    const currentState = this._readState()
    if (hasSameState(currentState, nextState)) return

    const stateToPersist = copyState(nextState)
    this._state = stateToPersist

    try {
      this._store.set(copyState(stateToPersist))
    } catch {
      // The in-memory state still protects this process. A persistence error
      // must never turn a best-effort crash guard into a startup crash.
    }
  }
}

export default SafeRestoreGuard
