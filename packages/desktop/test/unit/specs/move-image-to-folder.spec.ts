import { describe, it, expect, beforeEach, vi } from 'vitest'
import path from 'path'
import { moveImageToFolder } from '@/util/fileSystem'

// moveImageToFolder relies on the preload contextBridge surface (window.path,
// window.fileUtils). Stub them with the real node `path` and in-memory fakes so
// the relative-path persistence logic can be exercised (real window.crypto is
// used for the content hash).
const copy = vi.fn((_src: string, _dest: string) => Promise.resolve())
const writeFile = vi.fn(() => Promise.resolve())
const copyNew = vi.fn((_src: string, _dest: string) => Promise.resolve())
const writeFileNew = vi.fn((_dest: string, _data: Uint8Array) => Promise.resolve())

const win = window as unknown as {
  path: typeof path
  fileUtils: Record<string, unknown>
}

beforeEach(() => {
  copy.mockClear()
  writeFile.mockClear()
  copyNew.mockReset()
  copyNew.mockResolvedValue(undefined)
  writeFileNew.mockReset()
  writeFileNew.mockResolvedValue(undefined)
  win.path = path
  win.fileUtils = {
    ensureDir: vi.fn(() => Promise.resolve()),
    isImageFile: vi.fn(() => Promise.resolve(true)),
    copy,
    writeFile,
    copyNew,
    writeFileNew
  }
})

describe('moveImageToFolder relative-directory persistence', () => {
  const docPath = path.resolve('tmp', 'notes', 'a.md')
  const assetsDir = path.join(path.dirname(docPath), 'assets')

  it('returns a relative path for a binary File when isRelative is set', async() => {
    const file = new File([new Uint8Array([1, 2, 3])], 'pic.png', { type: 'image/png' })
    const result = await moveImageToFolder(docPath, file, assetsDir, true, docPath)
    expect(result.startsWith('assets/')).toBe(true)
    expect(path.isAbsolute(result)).toBe(false)
  })

  it('returns a relative path for a local path string when isRelative is set', async() => {
    const source = path.resolve('tmp', 'pictures', 'pic.png')
    const result = await moveImageToFolder(docPath, source, assetsDir, true, docPath)
    // The image must be copied into the assets dir...
    expect(copyNew).toHaveBeenCalledTimes(1)
    expect(copyNew.mock.calls[0][1].startsWith(assetsDir)).toBe(true)
    // ...and the inserted reference must be the portable relative path.
    expect(path.isAbsolute(result)).toBe(false)
    expect(result.startsWith('assets/')).toBe(true)
  })

  it('returns the absolute hashed path for a local path string when isRelative is false', async() => {
    const source = path.resolve('tmp', 'pictures', 'pic.png')
    const result = await moveImageToFolder(docPath, source, assetsDir, false, docPath)
    // copy still lands inside the assets dir...
    expect(copyNew).toHaveBeenCalledTimes(1)
    expect(copyNew.mock.calls[0][1].startsWith(assetsDir)).toBe(true)
    // ...and with isRelative=false the returned reference is the absolute
    // hashed destination path (the second arg passed to copy).
    expect(path.isAbsolute(result)).toBe(true)
    expect(result).toBe(copyNew.mock.calls[0][1])
    expect(result.startsWith(`${assetsDir}${path.sep}`)).toBe(true)
  })

  it('short-circuits without copying when the image already lives in outputDir', async() => {
    // The resolved imagePath equals path.join(outputDir, basename) so
    // noHashPath === imagePath and the copy step is skipped.
    const inPlace = path.join(assetsDir, 'already.png')
    const result = await moveImageToFolder(docPath, inPlace, assetsDir, false, docPath)
    expect(copy).not.toHaveBeenCalled()
    // The original absolute path is returned unchanged (isRelative=false).
    expect(result).toBe(inPlace)
  })

  it('short-circuits to a relative reference when isRelative is set and the image is in outputDir', async() => {
    const inPlace = path.join(assetsDir, 'already.png')
    const result = await moveImageToFolder(docPath, inPlace, assetsDir, true, docPath)
    expect(copy).not.toHaveBeenCalled()
    expect(path.isAbsolute(result)).toBe(false)
    expect(result.startsWith('assets/')).toBe(true)
  })

  // Item 114: editor.vue imageInsertAction='path'. The string-path branch
  // (typeof image==='string' → destImagePath = image, verbatim, no copy) lives
  // in editor.vue:917-920 and is not importable. The automatable slice is its
  // binary fallback (editor.vue:926-932): a saved-on-disk tab with
  // preferRelative routes a File through moveImageToFolder(null, file, relDir,
  // true, currentPathname). pathname is null there because a File needs no
  // source dir — assert that path stays portable and never dereferences null.
  it('routes a binary File through the relative branch with a null pathname (path-action fallback)', async() => {
    const file = new File([new Uint8Array([4, 5, 6])], 'pasted.png', { type: 'image/png' })
    const result = await moveImageToFolder(
      null as unknown as string,
      file,
      assetsDir,
      true,
      docPath
    )
    // No copy for a binary File — it is written, not copied.
    expect(copy).not.toHaveBeenCalled()
    expect(writeFileNew).toHaveBeenCalledTimes(1)
    // The written destination is inside the assets dir...
    expect((writeFileNew.mock.calls[0] as unknown[])[0] as string).toMatch(/pasted\.png$/)
    expect(((writeFileNew.mock.calls[0] as unknown[])[0] as string).startsWith(assetsDir)).toBe(true)
    // ...and the inserted reference is the portable relative path.
    expect(path.isAbsolute(result)).toBe(false)
    expect(result.startsWith('assets/')).toBe(true)
    expect(result.endsWith('pasted.png')).toBe(true)
  })

  it('a string local path already inside outputDir is returned verbatim when isRelative is false (path-action string passthrough analog)', async() => {
    // Mirrors the editor.vue 'path' string branch intent: an absolute local
    // path that already lives in the output dir is neither copied nor uploaded;
    // the absolute reference is preserved unchanged.
    const local = path.join(assetsDir, 'pic.png')
    const result = await moveImageToFolder(docPath, local, assetsDir, false, docPath)
    expect(copy).not.toHaveBeenCalled()
    expect(writeFile).not.toHaveBeenCalled()
    expect(result).toBe(local)
    expect(path.isAbsolute(result)).toBe(true)
  })

  it('uses distinct destinations for rapid clipboard pastes of identically named images', async() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-20T08:00:00Z'))
    try {
      const file = new File([new Uint8Array([1, 2, 3])], '同名 (1).png', { type: 'image/png' })
      const first = await moveImageToFolder(docPath, file, assetsDir, true, docPath)
      const second = await moveImageToFolder(docPath, file, assetsDir, true, docPath)
      expect(first).not.toBe(second)
      expect(first).toContain('同名 (1).png')
      expect(second).toContain('同名 (1).png')
      expect(writeFileNew).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('never uses an overwrite-capable copy for an external image', async() => {
    const source = path.resolve('tmp', 'outside', 'same-name.png')
    await moveImageToFolder(docPath, source, assetsDir, true, docPath)
    expect(copy).not.toHaveBeenCalled()
    expect(copyNew).toHaveBeenCalledOnce()
  })

  it('rejects an exclusive image copy collision without falling back to an overwrite', async() => {
    copyNew.mockRejectedValueOnce(new Error('EEXIST'))
    const source = path.resolve('tmp', 'outside', 'photo.png')
    await expect(moveImageToFolder(docPath, source, assetsDir, true, docPath)).rejects.toThrow('EEXIST')
    expect(copy).not.toHaveBeenCalled()
  })

  it('rejects an exclusive binary write collision without returning a bad link', async() => {
    writeFileNew.mockRejectedValueOnce(new Error('EEXIST'))
    const file = new File([new Uint8Array([1])], '同名.png', { type: 'image/png' })
    await expect(moveImageToFolder(docPath, file, assetsDir, true, docPath)).rejects.toThrow('EEXIST')
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('accepts an absolute pasted image path for a document not yet saved', async() => {
    const source = path.resolve('tmp', 'pictures', '插图 with spaces.png')
    const result = await moveImageToFolder(
      null as unknown as string, source, assetsDir, false, null
    )
    expect(copyNew).toHaveBeenCalledOnce()
    expect(copyNew.mock.calls[0][0]).toBe(source)
    expect(path.isAbsolute(result)).toBe(true)
  })

  it('rejects an unanchored relative path instead of resolving it against the process directory', async() => {
    await expect(
      moveImageToFolder(null as unknown as string, 'relative.png', assetsDir, false, null)
    ).rejects.toThrow('Save')
    expect(copyNew).not.toHaveBeenCalled()
  })
})
