export interface EditorPerformanceMilestoneScheduleOptions {
  requestFrame: (callback: () => void) => void
  isCurrent: () => boolean
  markFirstScreen: () => void
  markInteractive: () => void
  markEditable: () => void
  notifyMainProcess?: () => void
}

export interface EditorPerformanceMilestoneTimestamps {
  openStartAt: number
  firstScreenAt: number
  editableAt: number
}

export const hasCompletedEditorPerformanceMilestones = (
  timestamps: EditorPerformanceMilestoneTimestamps,
  minimumOpenStartAt = 0
): boolean => {
  return (
    Number.isFinite(timestamps.openStartAt) &&
    Number.isFinite(timestamps.firstScreenAt) &&
    Number.isFinite(timestamps.editableAt) &&
    timestamps.openStartAt >= minimumOpenStartAt &&
    timestamps.firstScreenAt >= timestamps.openStartAt &&
    timestamps.editableAt > timestamps.firstScreenAt
  )
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
        })
      })
    })
  })
}
