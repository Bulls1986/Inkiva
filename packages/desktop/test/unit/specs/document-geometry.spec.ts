import { describe, expect, it, vi } from 'vitest'
import { createDocumentGeometryProjection } from '@/util/documentGeometry'

describe('document geometry projection', () => {
  it('delegates surface geometry without exposing virtualization internals', () => {
    const revealBlock = vi.fn(() => true)
    const getBlockOffset = vi.fn(() => 480)
    const projection = createDocumentGeometryProjection({
      getSurface: () => ({
        revealBlock,
        getBlockOffset,
        isWindowed: () => false
      })
    })

    expect(projection.revealBlock(12, { viewportOffset: 8 })).toBe(true)
    expect(revealBlock).toHaveBeenCalledWith(12, { viewportOffset: 8 })
    expect(projection.getBlockOffset(12)).toBe(480)
    expect(getBlockOffset).toHaveBeenCalledWith(12)
    expect(projection.getScrollOwner()).toBe('desktop')
  })

  it('makes the document surface the scroll owner while windowed', () => {
    const projection = createDocumentGeometryProjection({
      getSurface: () => ({ isWindowed: () => true })
    })

    expect(projection.getScrollOwner()).toBe('document-surface')
  })

  it('gives an active tab restore precedence over both geometry owners', () => {
    const projection = createDocumentGeometryProjection({
      getSurface: () => ({ isWindowed: () => true }),
      hasPendingScrollRestore: () => true
    })

    expect(projection.getScrollOwner()).toBe('pending-restore')
  })

  it('fails closed to unavailable geometry when no surface exists', () => {
    const projection = createDocumentGeometryProjection({ getSurface: () => null })

    expect(projection.revealBlock(3)).toBe(false)
    expect(projection.getBlockOffset(3)).toBeNull()
    expect(projection.getScrollOwner()).toBe('desktop')
  })
})
