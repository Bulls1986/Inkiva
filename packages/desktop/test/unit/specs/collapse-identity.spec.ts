import { describe, expect, it } from 'vitest'

import { identityKey } from '../../../src/main/documentState/collapseStateStore'

// D8: the store keys records by file identity. The independent re-verification
// showed that ext4 reuses the inode number when a file is deleted and recreated
// at the same path (20/20), so a replacement inherited the old record and the CI
// e2e "same path now holds a different file" failed on Ubuntu. device+inode is
// therefore not a sufficient identity on its own.

const stat = (ino: bigint, birthtimeNs: bigint) => ({ dev: 7n, ino, birthtimeNs })

describe('collapse state file identity', () => {
  it('separates a replacement that reuses the inode number', () => {
    const original = identityKey(stat(4242n, 1_000n))
    const replacement = identityKey(stat(4242n, 9_000n))
    expect(replacement).not.toBe(original)
  })

  it('keeps the identity of a file that only moved', () => {
    expect(identityKey(stat(4242n, 1_000n))).toBe(identityKey(stat(4242n, 1_000n)))
  })

  it('falls back to device and inode when the filesystem reports no birth time', () => {
    // No birth time is available: the key stays at the older shape, so a record
    // written where it is available never matches here (the document opens
    // expanded), while two files that differ in inode still never match.
    expect(identityKey(stat(4242n, 0n))).toBe('7:4242')
    expect(identityKey(stat(4243n, 0n))).not.toBe(identityKey(stat(4242n, 0n)))
  })
})

describe('collapse state after a replacement that reuses the inode', () => {
  it('does not restore a record for a file whose birth time changed', async() => {
    const { CollapseStateStore } = await import('../../../src/main/documentState/collapseStateStore')
    let key = identityKey(stat(4242n, 1_000n))
    let disk = ''
    const store = new CollapseStateStore({
      filePath: '/store.json',
      readFile: async() => disk,
      writeFile: async(_path, text) => { disk = text },
      identity: async() => key
    })
    await store.save('/doc.md', {
      headings: [{ key: 'installation', level: 2, collapsed: true, text: 'Installation', ancestors: [] }]
    })
    await expect(store.load('/doc.md')).resolves.not.toBeNull()

    // Same path, deleted and recreated: ext4 reuses the inode, the birth time
    // differs (20/20 measured). The document must open expanded.
    key = identityKey(stat(4242n, 9_000n))
    await expect(store.load('/doc.md')).resolves.toBeNull()
  })
})
