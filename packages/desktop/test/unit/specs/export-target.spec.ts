import { describe, expect, it } from 'vitest'
import {
  getReusableExportPath,
  isRepeatableExportType,
  type LastExportTarget
} from 'main_renderer/utils/exportTarget'

describe('repeat export target', () => {
  it('only reuses a successful target for the same export type', () => {
    const target: LastExportTarget = { type: 'pdf', filePath: '/tmp/note.pdf' }

    expect(getReusableExportPath(target, 'pdf')).toBe('/tmp/note.pdf')
    expect(getReusableExportPath(target, 'styledHtml')).toBeUndefined()
  })

  it('does not reuse an empty or unsupported target', () => {
    expect(getReusableExportPath(null, 'pdf')).toBeUndefined()
    expect(getReusableExportPath({ type: 'pdf', filePath: '' }, 'pdf')).toBeUndefined()
    expect(
      getReusableExportPath({ type: 'print', filePath: '/tmp/note.pdf' }, 'print')
    ).toBeUndefined()
  })

  it('recognizes only file exports that can be repeated safely', () => {
    expect(isRepeatableExportType('pdf')).toBe(true)
    expect(isRepeatableExportType('styledHtml')).toBe(true)
    expect(isRepeatableExportType('print')).toBe(false)
    expect(isRepeatableExportType('png')).toBe(false)
  })
})
