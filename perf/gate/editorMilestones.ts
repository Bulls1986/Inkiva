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
