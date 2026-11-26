import { describe, expect, it, vi } from 'vitest'
import {
  collectResourceSnapshots,
  extractLocalImagePaths
} from '@/components/exportSettings/previewVersions'

// P2/P7: the preview must know which local files it depends on, so a later
// change on disk can invalidate the artifact before it is written.

describe('extractLocalImagePaths', () => {
  it('keeps absolute file:// images on Windows drive paths', () => {
    const html =
      '<p><img src="file:///E:/docs/a.png" alt="a"></p>' +
      '<p><img src="file:///E:/docs/b.jpg"></p>'

    expect(extractLocalImagePaths(html)).toEqual(['E:/docs/a.png', 'E:/docs/b.jpg'])
  })

  it('ignores remote images, data URIs and repeated references', () => {
    const html =
      '<img src="https://example.com/a.png">' +
      '<img src="data:image/png;base64,AAAA">' +
      '<img src="file:///E:/docs/a.png">' +
      '<img src="file:///E:/docs/a.png">'

    expect(extractLocalImagePaths(html)).toEqual(['E:/docs/a.png'])
  })

  it('decodes percent-encoded file names', () => {
    const html = '<img src="file:///E:/my%20docs/a.png">'
    expect(extractLocalImagePaths(html)).toEqual(['E:/my docs/a.png'])
  })
})

describe('collectResourceSnapshots', () => {
  it('records the identity of the images that exist at generation time', async() => {
    const stat = vi.fn(async(path: string) =>
      path.endsWith('a.png') ? { mtimeMs: 111, size: 222 } : null
    )

    const snapshots = await collectResourceSnapshots(['/docs/a.png', '/docs/gone.png'], stat)

    expect(snapshots).toEqual([{ path: '/docs/a.png', mtimeMs: 111, size: 222 }])
    expect(stat).toHaveBeenCalledTimes(2)
  })
})
