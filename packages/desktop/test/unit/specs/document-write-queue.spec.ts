import { describe, expect, it, vi } from 'vitest'
import { DocumentWriteQueue } from 'main_renderer/filesystem/writeQueue'

describe('DocumentWriteQueue', () => {
  it('serializes one document and coalesces an unchanged dirty revision', async() => {
    const queue = new DocumentWriteQueue()
    const writes: number[] = []
    let active = 0
    let maxActive = 0
    let releaseFirst: (() => void) | undefined

    const write = (revision: number, wait = false) => vi.fn(async() => {
      active += 1
      maxActive = Math.max(maxActive, active)
      writes.push(revision)
      if (wait) await new Promise<void>((resolve) => { releaseFirst = resolve })
      active -= 1
    })

    const firstWrite = write(1, true)
    const duplicateWrite = write(1)
    const newerWrite = write(2)

    const first = queue.enqueue({ pathname: '/tmp/note.md', revision: 1, write: firstWrite })
    const duplicate = queue.enqueue({ pathname: '/tmp/note.md', revision: 1, write: duplicateWrite })
    const newer = queue.enqueue({ pathname: '/tmp/note.md', revision: 2, write: newerWrite })

    await Promise.resolve()
    expect(writes).toEqual([1])
    expect(maxActive).toBe(1)
    expect(duplicateWrite).not.toHaveBeenCalled()

    releaseFirst?.()
    await expect(first).resolves.toMatchObject({ written: true })
    await expect(duplicate).resolves.toMatchObject({ written: true })
    await expect(newer).resolves.toMatchObject({ written: true })

    expect(writes).toEqual([1, 2])
    expect(maxActive).toBe(1)

    const unchangedWrite = write(1)
    await expect(
      queue.enqueue({ pathname: '/tmp/note.md', revision: 2, write: unchangedWrite })
    ).resolves.toMatchObject({ written: false, skipped: true })
    expect(unchangedWrite).not.toHaveBeenCalled()

    queue.dispose()
  })
})
