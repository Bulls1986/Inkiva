import { describe, expect, it } from 'vitest'
import { getPdfPageOptions, MM_PER_INCH } from '../../../src/main/pdfPreview/pageOptions'

// Measured on Windows x64 in the v0.7.0 spike: Electron's printToPDF custom
// pageSize object is interpreted in INCHES, not microns. Passing millimetres
// through unchanged produced a 457.20 x 609.60 mm page for a requested
// 18 x 24 custom size.
describe('getPdfPageOptions custom paper units', () => {
  it('converts custom millimetre paper to the inches printToPDF expects', () => {
    const options = getPdfPageOptions({
      pageSize: 'custom',
      pageSizeWidth: 180,
      pageSizeHeight: 240,
      isLandscape: false
    }) as { pageSize: { width: number, height: number }, landscape: boolean }

    expect(options.pageSize.width).toBeCloseTo(180 / MM_PER_INCH, 5)
    expect(options.pageSize.height).toBeCloseTo(240 / MM_PER_INCH, 5)
    expect(options.pageSize.width).toBeCloseTo(7.0866, 3)
  })

  it('carries landscape orientation through for custom paper', () => {
    const options = getPdfPageOptions({
      pageSize: 'custom',
      pageSizeWidth: 180,
      pageSizeHeight: 240,
      isLandscape: true
    }) as { landscape: boolean }

    expect(options.landscape).toBe(true)
  })

  it('passes named page sizes through untouched', () => {
    expect(getPdfPageOptions({ pageSize: 'A4', isLandscape: false })).toEqual({
      pageSize: 'A4',
      landscape: false
    })
    expect(getPdfPageOptions(undefined)).toEqual({})
  })

  it('ignores an incomplete custom size so Electron keeps the default page', () => {
    expect(getPdfPageOptions({ pageSize: 'custom', pageSizeWidth: 0 })).toEqual({
      pageSize: 'custom',
      landscape: false
    })
  })
})
