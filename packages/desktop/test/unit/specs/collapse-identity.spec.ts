import { describe, expect, it } from 'vitest'

import {
  CollapseStateStore,
  identityKey
} from '../../../src/main/documentState/collapseStateStore'

// D8 keyed records by device:inode:birthtime, which separates a replacement that
// reuses the inode when the filesystem reports a birth time. D9 is the remaining
// hole found by re-verification: when NO birth time is reported (drvfs, NFS, old
// kernels report 0), the key fell back to a bare device:inode, and an inode
// reused by a replacement then matched the old record. The approved contract is
// "when the file identity cannot be confirmed, open expanded", so an unavailable
// birth time must mean "unconfirmed", not "fall back to a weaker key".

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

  it('reports no identity when the filesystem reports no birth time', () => {
    // Nothing distinguishes a replacement from the original here, so the identity
    // is unconfirmed rather than weaker.
    expect(identityKey(stat(4242n, 0n))).toBeNull()
  })

  it('never restores when neither side could confirm the identity', async() => {
    let key = identityKey(stat(4242n, 0n))
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
    expect(disk, 'nothing is persisted without a confirmed identity').toBe('')
    await expect(store.load('/doc.md')).resolves.toBeNull()
  })

  it('does not restore a record for a file whose birth time changed', async() => {
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

    // Same path, deleted and recreated: the inode was reused, the birth time is new.
    key = identityKey(stat(4242n, 9_000n))
    await expect(store.load('/doc.md')).resolves.toBeNull()
  })
})
