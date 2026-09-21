export const FOLDER_SEARCH_DEBOUNCE_MS = 50

type SearchIdleWindow = Window & {
  requestIdleCallback?: (callback: (deadline: IdleDeadline) => void) => number
  cancelIdleCallback?: (handle: number) => void
}

export const createIdleDeferredTask = (
  callback: () => void,
  target: SearchIdleWindow = window,
  getPriorityRevision?: () => number
): { schedule: () => void; cancel: () => void } => {
  let frame: number | null = null
  let idle: number | null = null
  let fallback: ReturnType<typeof setTimeout> | null = null
  let generation = 0

  const cancel = (): void => {
    generation += 1
    if (frame !== null) {
      target.cancelAnimationFrame(frame)
      frame = null
    }
    if (idle !== null && target.cancelIdleCallback) {
      target.cancelIdleCallback(idle)
      idle = null
    }
    if (fallback !== null) {
      clearTimeout(fallback)
      fallback = null
    }
  }

  const scheduleIdle = (scheduledGeneration: number, stableRevision?: number): void => {
    const run = (): void => {
      idle = null
      fallback = null
      if (scheduledGeneration !== generation) return

      if (getPriorityRevision && stableRevision !== undefined) {
        const currentRevision = getPriorityRevision()
        if (currentRevision !== stableRevision) {
          scheduleStableFrame(scheduledGeneration, currentRevision, 0)
          return
        }
      }

      callback()
    }

    if (target.requestIdleCallback) {
      idle = target.requestIdleCallback(run)
    } else {
      fallback = setTimeout(run, 0)
    }
  }

  const scheduleStableFrame = (
    scheduledGeneration: number,
    observedRevision: number,
    stableFrameCount: number
  ): void => {
    frame = target.requestAnimationFrame(() => {
      frame = null
      if (scheduledGeneration !== generation || !getPriorityRevision) return

      const currentRevision = getPriorityRevision()
      if (currentRevision !== observedRevision) {
        scheduleStableFrame(scheduledGeneration, currentRevision, 0)
        return
      }

      if (stableFrameCount < 1) {
        scheduleStableFrame(scheduledGeneration, currentRevision, stableFrameCount + 1)
        return
      }

      scheduleIdle(scheduledGeneration, currentRevision)
    })
  }

  const schedule = (): void => {
    cancel()
    const scheduledGeneration = generation
    if (getPriorityRevision) {
      scheduleStableFrame(scheduledGeneration, getPriorityRevision(), 0)
      return
    }

    frame = target.requestAnimationFrame(() => {
      frame = null
      if (scheduledGeneration !== generation) return
      scheduleIdle(scheduledGeneration)
    })
  }

  return { schedule, cancel }
}
