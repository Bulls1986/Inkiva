import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({}))

const { default: EditorBufferStore } = await import('main_renderer/editorBufferStore')
const writeBufferStoreFile = EditorBufferStore.prototype.writeBufferStoreFile

const dirs: string[] = []
function tempDir(): string {
  const d = mkdtempSync(path.join(tmpdir(), 'mt-buf-'))
  dirs.push(d)
  return d
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('EditorBufferStore.writeBufferStoreFile — durable atomic write (#4852 follow-up)', () => {
  it('writes the state as JSON and leaves no temp file behind', async() => {
    const dir = tempDir()
    const target = path.join(dir, 'buffer.json')
    const state = { tabs: [{ id: '1', markdown: 'hello' }] }

    await writeBufferStoreFile(target, state)

    expect(JSON.parse(readFileSync(target, 'utf8'))).toEqual(state)
    expect(readdirSync(dir)).toEqual(['buffer.json'])
  })

  it('overwrites an existing buffer file', async() => {
    const dir = tempDir()
    const target = path.join(dir, 'buffer.json')

    await writeBufferStoreFile(target, { tabs: ['old'] })
    await writeBufferStoreFile(target, { tabs: ['new'] })

    expect(JSON.parse(readFileSync(target, 'utf8'))).toEqual({ tabs: ['new'] })
    expect(readdirSync(dir)).toEqual(['buffer.json'])
  })
})
