export type EditorScrollOwner = 'desktop' | 'document-surface' | 'pending-restore'

interface DocumentSurfaceGeometry {
  revealBlock?: (index: number, options?: { viewportOffset?: number }) => boolean
  getBlockOffset?: (index: number) => number | null
  isWindowed?: () => boolean
}

export interface DocumentGeometryProjection {
  revealBlock(index: number, options?: { viewportOffset?: number }): boolean
  getBlockOffset(index: number): number | null
  getScrollOwner(): EditorScrollOwner
}

interface DocumentGeometryProjectionOptions {
  getSurface: () => DocumentSurfaceGeometry | null | undefined
  hasPendingScrollRestore?: () => boolean
}

/**
 * Desktop-facing projection of the Muya document-surface geometry contract.
 *
 * Muya remains authoritative for logical geometry while windowed. Desktop may
 * observe mounted DOM geometry, but it must not compete with the document
 * surface for geometry-driven scroll correction. Keeping this decision behind
 * one projection prevents editor orchestration/TOC/layout code from depending
 * on virtualization implementation details.
 */
export function createDocumentGeometryProjection(
  options: DocumentGeometryProjectionOptions
): DocumentGeometryProjection {
  return {
    revealBlock(index, revealOptions) {
      return options.getSurface()?.revealBlock?.(index, revealOptions) === true
    },
    getBlockOffset(index) {
      return options.getSurface()?.getBlockOffset?.(index) ?? null
    },
    getScrollOwner() {
      if (options.hasPendingScrollRestore?.()) return 'pending-restore'
      return options.getSurface()?.isWindowed?.() === true
        ? 'document-surface'
        : 'desktop'
    }
  }
}
