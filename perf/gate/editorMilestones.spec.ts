import assert from 'node:assert/strict'
import test from 'node:test'

import { measureEditorMilestones } from './editorMilestones.js'

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
