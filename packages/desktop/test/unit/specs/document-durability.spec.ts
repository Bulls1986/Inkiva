import { describe, expect, it } from 'vitest'
import {
  createDocumentDurability,
  markDocumentDirty,
  markFileSaveFailed,
  markFileSaved,
  markRecoveryFailed,
  markRecoveryProtected
} from '@/store/documentDurability'

describe('document durability state (US-01)', () => {
  it('advances D1 -> D2 -> D0 only for the current revision', () => {
    let state = createDocumentDurability(0, true)

    state = markDocumentDirty(state, 1)
    expect(state.status).toBe('unprotected')

    state = markRecoveryProtected(state, 1)
    expect(state.status).toBe('protected')

    state = markFileSaved(state, 1)
    expect(state.status).toBe('saved')
  })

  it('never lets stale recovery or file acknowledgements protect a newer revision', () => {
    let state = createDocumentDurability(0, true)
    state = markDocumentDirty(state, 1)
    state = markDocumentDirty(state, 2)

    state = markRecoveryProtected(state, 1)
    expect(state.status).toBe('unprotected')

    state = markFileSaved(state, 1)
    expect(state.status).toBe('unprotected')

    state = markRecoveryProtected(state, 2)
    expect(state.status).toBe('protected')

    state = markFileSaved(state, 2)
    expect(state.status).toBe('saved')
  })

  it('keeps confirmed recovery protection when a file save fails', () => {
    let state = createDocumentDurability(0, true)
    state = markDocumentDirty(state, 3)
    state = markRecoveryProtected(state, 3)
    state = markFileSaveFailed(state, 3, 'disk full')

    expect(state.status).toBe('protected')
    expect(state.fileError).toBe('disk full')
  })

  it('does not claim D2 when recovery persistence fails', () => {
    let state = createDocumentDurability(0, true)
    state = markDocumentDirty(state, 4)
    state = markRecoveryFailed(state, 4, 'recovery path unavailable')

    expect(state.status).toBe('unprotected')
    expect(state.recoveryError).toBe('recovery path unavailable')
  })

  it('keeps document states isolated when acknowledgements arrive out of order', () => {
    let a = markDocumentDirty(createDocumentDurability(0, true), 2)
    let b = markDocumentDirty(createDocumentDurability(0, true), 7)

    a = markRecoveryProtected(a, 1)
    b = markRecoveryProtected(b, 7)

    expect(a.status).toBe('unprotected')
    expect(b.status).toBe('protected')
    expect(a.currentRevision).toBe(2)
    expect(b.currentRevision).toBe(7)
  })
})
