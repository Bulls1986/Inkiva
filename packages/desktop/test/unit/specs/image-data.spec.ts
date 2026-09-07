import { describe, expect, it } from 'vitest'
import { dataUrlToFile } from '@/util/imageData'

describe('dataUrlToFile', () => {
  it('decodes a base64 clipboard image locally', async() => {
    const file = dataUrlToFile('data:image/png;base64,iVBORw0KGgo=')

    expect(file.name).toBe('pasted-image.png')
    expect(file.type).toBe('image/png')
    expect(Array.from(new Uint8Array(await file.arrayBuffer()))).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
    ])
  })

  it('decodes a percent-encoded image data URL', async() => {
    const file = dataUrlToFile('data:image/svg+xml,%3Csvg%2F%3E')

    expect(file.name).toBe('pasted-image.svg')
    expect(await file.text()).toBe('<svg/>')
  })

  it('rejects malformed image data', () => {
    expect(() => dataUrlToFile('data:image/png;base64,not-valid!')).toThrow(
      'invalid base64 data'
    )
  })
})
