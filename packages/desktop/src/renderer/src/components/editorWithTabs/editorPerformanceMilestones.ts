export interface EditorPerformanceMilestoneScheduleOptions {
  requestFrame: (callback: () => void) => void
  isCurrent: () => boolean
  markFirstScreen: () => void
  markInteractive: () => void
  markEditable: () => void
  prewarmFrame?: () => void
  notifyMainProcess?: () => void
}

/**
 * Schedule user-visible editor milestones across browser frame boundaries.
 *
 * The first nested frame runs after one paint boundary, so the screen marker
 * cannot be satisfied by synchronous DOM construction alone. Each later marker
 * is monotonic and stale document operations are ignored before they can
 * overwrite the active document's attributes.
 */
export const scheduleEditorPerformanceMilestones = ({
  requestFrame,
  isCurrent,
  markFirstScreen,
  markInteractive,
  markEditable,
  prewarmFrame,
  notifyMainProcess
}: EditorPerformanceMilestoneScheduleOptions): void => {
  requestFrame(() => {
    requestFrame(() => {
      if (!isCurrent()) return
      markFirstScreen()
      requestFrame(() => {
        if (!isCurrent()) return
        markInteractive()
        requestFrame(() => {
          if (!isCurrent()) return
          markEditable()
          notifyMainProcess?.()
          if (!prewarmFrame) return
          requestFrame(() => {
            if (!isCurrent()) return
            prewarmFrame()
            requestFrame(() => {
              if (!isCurrent()) return
              prewarmFrame()
            })
          })
        })
      })
    })
  })
}
