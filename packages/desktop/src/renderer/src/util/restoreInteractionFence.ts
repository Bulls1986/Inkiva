const RESTORE_INVALIDATING_EVENTS = [
  'wheel',
  'touchstart',
  'mousedown',
  'pointerdown',
  'keydown'
] as const

export interface RestoreInteractionFence {
  capture(): number
  isCurrent(token: number): boolean
  destroy(): void
}

/**
 * Tracks explicit user interaction while a restore/navigation callback is queued.
 * A queued restore may only run while the token captured when it was scheduled
 * is still current. This makes direct user intent authoritative over delayed
 * render/geometry completion without coupling callers to timing heuristics.
 */
export function createRestoreInteractionFence(target: EventTarget): RestoreInteractionFence {
  let generation = 0
  let destroyed = false

  const invalidate = (): void => {
    generation += 1
  }

  for (const eventName of RESTORE_INVALIDATING_EVENTS) {
    target.addEventListener(eventName, invalidate, { capture: true, passive: eventName !== 'keydown' })
  }

  return {
    capture() {
      return generation
    },
    isCurrent(token) {
      return token === generation
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      for (const eventName of RESTORE_INVALIDATING_EVENTS) {
        target.removeEventListener(eventName, invalidate, { capture: true })
      }
    }
  }
}
