import { describe, expect, it, vi } from 'vitest'
import { rekeyIfSameDocument } from '../../../src/main/documentState/collapseStateService'

// Controlled race: the identity is captured before an application save and read
// again immediately before the write. Only an unchanged identity may move the
// collapse record to the new file, otherwise an external replacement would
// inherit the previous document's state.

const deps = (next: string | null) => {
  const rekey = vi.fn(async() => {})
  return { rekey, identity: vi.fn(async() => next) }
}

describe('rekeyIfSameDocument', () => {
  it('moves the record when the identity is unchanged and the save replaced it', async() => {
    const d = deps('dev1:ino2')
    const moved = await rekeyIfSameDocument('/docs/a.md', 'dev1:ino1', 'dev1:ino1', d)

    expect(moved).toBe(true)
    expect(d.rekey).toHaveBeenCalledWith('dev1:ino1', 'dev1:ino2')
  })

  it('refuses when the file was replaced externally before the write', async() => {
    const d = deps('dev1:ino9')
    const moved = await rekeyIfSameDocument('/docs/a.md', 'dev1:ino1', 'dev1:ino2', d)

    expect(moved).toBe(false)
    expect(d.rekey).not.toHaveBeenCalled()
  })

  it('does nothing when either identity is unavailable', async() => {
    const d = deps('dev1:ino2')
    expect(await rekeyIfSameDocument('/docs/a.md', null, 'dev1:ino1', d)).toBe(false)
    expect(await rekeyIfSameDocument('/docs/a.md', 'dev1:ino1', null, d)).toBe(false)
    expect(d.rekey).not.toHaveBeenCalled()
  })

  it('does nothing when the save did not change the file identity', async() => {
    const d = deps('dev1:ino1')
    expect(await rekeyIfSameDocument('/docs/a.md', 'dev1:ino1', 'dev1:ino1', d)).toBe(false)
    expect(d.rekey).not.toHaveBeenCalled()
  })

  it('does nothing when the file vanished before the post-write read', async() => {
    const d = deps(null)
    expect(await rekeyIfSameDocument('/docs/a.md', 'dev1:ino1', 'dev1:ino1', d)).toBe(false)
    expect(d.rekey).not.toHaveBeenCalled()
  })
})
