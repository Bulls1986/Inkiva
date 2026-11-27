/**
 * Electron's printToPDF reads the custom pageSize object in inches (docs and
 * the v0.7.0 Windows spike: mm passed through produced a 457.20 x 609.60 mm
 * page for a requested 18 x 24, while mm / 25.4 produced 180.26 x 240.28 mm).
 * Inkiva's dialog collects millimetres, so the conversion lives here.
 */
export const MM_PER_INCH = 25.4

export interface PdfPageSizeOptions {
  pageSize?: string
  pageSizeWidth?: number
  pageSizeHeight?: number
  isLandscape?: boolean
}

const mmToInch = (mm: number): number => mm / MM_PER_INCH

export const getPdfPageOptions = (
  options?: PdfPageSizeOptions
): Record<string, unknown> => {
  if (!options) {
    return {}
  }

  const { pageSize, pageSizeWidth, pageSizeHeight, isLandscape } = options
  if (pageSize === 'custom' && pageSizeWidth && pageSizeHeight) {
    return {
      pageSize: {
        width: mmToInch(pageSizeWidth),
        height: mmToInch(pageSizeHeight)
      },
      landscape: !!isLandscape
    }
  }

  return { pageSize, landscape: !!isLandscape }
}
