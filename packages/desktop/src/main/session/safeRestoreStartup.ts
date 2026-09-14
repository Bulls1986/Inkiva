export const SAFE_RESTORE_SESSION_ID = 'startup-restore'

export interface SafeRestoreStartupGuard {
  beginAttempt(sessionId: string): number
  shouldUseSafeRestore(sessionId: string): boolean
  markReady(sessionId: string): void
}

export interface SafeRestoreStartupDecision {
  useSafeRestore: boolean
  attemptSessionId: string | null
}

/**
 * Keep guard failures outside the startup control flow. A successful attempt
 * remains associated with the editor even if the decision read fails, so a
 * later interactive transition can still clear it.
 */
export const evaluateSafeRestoreStartup = (
  guard: SafeRestoreStartupGuard,
  isRestorePathway: boolean,
  sessionId: string = SAFE_RESTORE_SESSION_ID
): SafeRestoreStartupDecision => {
  if (!isRestorePathway) {
    return { useSafeRestore: false, attemptSessionId: null }
  }

  try {
    guard.beginAttempt(sessionId)
  } catch {
    return { useSafeRestore: false, attemptSessionId: null }
  }

  try {
    return {
      useSafeRestore: guard.shouldUseSafeRestore(sessionId),
      attemptSessionId: sessionId
    }
  } catch {
    return { useSafeRestore: false, attemptSessionId: sessionId }
  }
}

export const markSafeRestoreStartupReady = (
  guard: SafeRestoreStartupGuard,
  sessionId: string | null
): void => {
  if (!sessionId) return

  try {
    guard.markReady(sessionId)
  } catch {
    // A guard failure must never make an interactive editor unusable.
  }
}
