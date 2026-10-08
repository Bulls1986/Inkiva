import assert from 'node:assert/strict'
import test from 'node:test'

import * as milestones from './editorMilestones.js'

const { measureEditorMilestones } = milestones

test('reads the newest eligible operation, never a stale first editor root', () => {
  const choose = (
    milestones as typeof milestones & {
      selectEditorMilestoneTimestamps?: (
        candidates: ReadonlyArray<{ openStartAt: number; firstScreenAt: number; editableAt: number }>,
        minimumOpenStartAt: number
      ) => { openStartAt: number; firstScreenAt: number; editableAt: number } | null
    }
  ).selectEditorMilestoneTimestamps
  const stale = { openStartAt: 10, firstScreenAt: 25, editableAt: 30 }
  const current = { openStartAt: 110, firstScreenAt: 125, editableAt: 140 }
  const incomplete = { openStartAt: 130, firstScreenAt: Number.NaN, editableAt: Number.NaN }

  assert.deepEqual(choose?.([stale, current, incomplete], 100), current)
  assert.deepEqual(choose?.([stale, current, incomplete], 140), null)
})

test('keeps first-screen and editable timings as distinct real milestones', () => {
  assert.deepEqual(
    measureEditorMilestones({
      openStartAt: 100,
      firstScreenAt: 124.5,
      editableAt: 151.25
    }),
    {
      firstScreenMs: 24.5,
      editableMs: 51.25
    }
  )
})

test('rejects missing or non-monotonic milestone timestamps', () => {
  assert.throws(
    () =>
      measureEditorMilestones({
        openStartAt: Number.NaN,
        firstScreenAt: 124,
        editableAt: 151
      }),
    /finite timestamps/
  )

  assert.throws(
    () =>
      measureEditorMilestones({
        openStartAt: 100,
        firstScreenAt: 99,
        editableAt: 151
      }),
    /precedes open start/
  )

  assert.throws(
    () =>
      measureEditorMilestones({
        openStartAt: 100,
        firstScreenAt: 124,
        editableAt: 124
      }),
    /must follow first-screen/
  )
})
