export interface EditorMilestoneTimestamps {
  openStartAt: number
  firstScreenAt: number
  editableAt: number
}

export interface EditorMilestoneDurations {
  firstScreenMs: number
  editableMs: number
}

const isFiniteNumber = (value: number): boolean => Number.isFinite(value)

/**
 * Keep the post-wait DOM snapshot tied to the requested document-open operation.
 * An editor may retain a completed older root while a new root is mounting.
 * Choosing the DOM's first valid element would silently measure the old root.
 */
export const selectEditorMilestoneTimestamps = (
  candidates: readonly EditorMilestoneTimestamps[],
  minimumOpenStartAt: number
): EditorMilestoneTimestamps | null => {
  let selected: EditorMilestoneTimestamps | null = null
  for (const candidate of candidates) {
    if (
      !isFiniteNumber(candidate.openStartAt) ||
      !isFiniteNumber(candidate.firstScreenAt) ||
      !isFiniteNumber(candidate.editableAt) ||
      candidate.openStartAt < minimumOpenStartAt ||
      candidate.firstScreenAt < candidate.openStartAt ||
      candidate.editableAt <= candidate.firstScreenAt
    ) continue
    if (!selected || candidate.openStartAt > selected.openStartAt) selected = candidate
  }
  return selected
}

export const measureEditorMilestones = (
  timestamps: EditorMilestoneTimestamps
): EditorMilestoneDurations => {
  const { openStartAt, firstScreenAt, editableAt } = timestamps
  if (
    !isFiniteNumber(openStartAt) ||
    !isFiniteNumber(firstScreenAt) ||
    !isFiniteNumber(editableAt)
  ) {
    throw new Error('editor milestones must be finite timestamps')
  }
  if (firstScreenAt < openStartAt) {
    throw new Error('editor first-screen milestone precedes open start')
  }
  if (editableAt <= firstScreenAt) {
    throw new Error('editor editable milestone must follow first-screen milestone')
  }

  return {
    firstScreenMs: firstScreenAt - openStartAt,
    editableMs: editableAt - openStartAt
  }
}
