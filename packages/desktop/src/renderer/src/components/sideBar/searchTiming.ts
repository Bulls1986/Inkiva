export const FOLDER_SEARCH_DEBOUNCE_MS = 50

type SearchIdleWindow = Window & {
  requestIdleCallback?: (callback: (deadline: IdleDeadline) => void) => number
  cancelIdleCallback?: (handle: number) => void
}

export const createIdleDeferredTask = (
  callback: () => void,
  target: SearchIdleWindow = window
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

  const schedule = (): void => {
    cancel()
    const scheduledGeneration = generation
    frame = target.requestAnimationFrame(() => {
      frame = null
      if (scheduledGeneration !== generation) return

      const run = (): void => {
        idle = null
        fallback = null
        if (scheduledGeneration === generation) callback()
      }

      if (target.requestIdleCallback) {
        idle = target.requestIdleCallback(run)
      } else {
        fallback = setTimeout(run, 0)
      }
    })
  }

  return { schedule, cancel }
}
