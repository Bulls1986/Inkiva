import { describe, expect, it, vi } from 'vitest'
import {
  SAFE_RESTORE_SESSION_ID,
  evaluateSafeRestoreStartup,
  markSafeRestoreStartupReady
} from 'main_renderer/session/safeRestoreStartup'

const createGuardDouble = (shouldUseSafeRestore = false) => ({
  beginAttempt: vi.fn<(sessionId: string) => number>(),
  shouldUseSafeRestore: vi.fn<(sessionId: string) => boolean>(() => shouldUseSafeRestore),
  markReady: vi.fn<(sessionId: string) => void>()
})

describe('safe restore startup seam', () => {
  it('does not begin a guard attempt outside the normal restore pathway', () => {
    const guard = createGuardDouble()

    expect(evaluateSafeRestoreStartup(guard, false)).toEqual({
      useSafeRestore: false,
      attemptSessionId: null
    })
    expect(guard.beginAttempt).not.toHaveBeenCalled()
    expect(guard.shouldUseSafeRestore).not.toHaveBeenCalled()
  })

  it('routes a threshold decision to safe restore and waits for readiness to clear it', () => {
    const guard = createGuardDouble(true)

    const decision = evaluateSafeRestoreStartup(guard, true)

    expect(guard.beginAttempt).toHaveBeenCalledWith(SAFE_RESTORE_SESSION_ID)
    expect(guard.shouldUseSafeRestore).toHaveBeenCalledWith(SAFE_RESTORE_SESSION_ID)
    expect(decision).toEqual({
      useSafeRestore: true,
      attemptSessionId: SAFE_RESTORE_SESSION_ID
    })
    expect(guard.markReady).not.toHaveBeenCalled()

    markSafeRestoreStartupReady(guard, decision.attemptSessionId)
    expect(guard.markReady).toHaveBeenCalledOnce()
    expect(guard.markReady).toHaveBeenCalledWith(SAFE_RESTORE_SESSION_ID)
  })

  it('keeps startup usable when guard operations throw', () => {
    const guard = createGuardDouble()
    guard.beginAttempt.mockImplementation(() => {
      throw new Error('unavailable')
    })

    expect(() => evaluateSafeRestoreStartup(guard, true)).not.toThrow()
    expect(evaluateSafeRestoreStartup(guard, true)).toEqual({
      useSafeRestore: false,
      attemptSessionId: null
    })

    const readyGuard = createGuardDouble()
    readyGuard.markReady.mockImplementation(() => {
      throw new Error('unwritable')
    })
    expect(() => markSafeRestoreStartupReady(readyGuard, SAFE_RESTORE_SESSION_ID)).not.toThrow()
  })
})
