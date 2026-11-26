import { describe, expect, it, vi } from 'vitest'
import {
  collectResourceSnapshots,
  extractLocalImagePaths,
  readResourceHash
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
  it('records a content hash for readable images and null for unreadable ones', async() => {
    // A missing image is recorded, not skipped: if it appears later the pages
    // change, so the old preview has to go stale (P2/P7).
    const read = vi.fn(async(path: string) =>
      path.endsWith('a.png') ? { hash: 'hash-a' } : null
    )

    const snapshots = await collectResourceSnapshots(['/docs/a.png', '/docs/gone.png'], read)

    expect(snapshots).toEqual([
      { path: '/docs/a.png', hash: 'hash-a' },
      { path: '/docs/gone.png', hash: null }
    ])
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('hashes bytes so a same-size, same-mtime replacement changes identity', async() => {
    const bytesA = new Uint8Array([1, 2, 3])
    const bytesB = new Uint8Array([1, 2, 4])
    const readFile = vi.fn(async() => bytesA)

    const first = await readResourceHash('/docs/a.png', readFile)
    readFile.mockResolvedValueOnce(bytesB)
    const second = await readResourceHash('/docs/a.png', readFile)

    expect(first?.hash).toHaveLength(64)
    expect(second?.hash).toHaveLength(64)
    expect(first?.hash).not.toBe(second?.hash)
  })

  it('reports an unreadable file as no identity instead of throwing', async() => {
    const readFile = vi.fn(async() => {
      throw new Error('EACCES')
    })

    await expect(readResourceHash('/docs/locked.png', readFile)).resolves.toBeNull()
  })
})
