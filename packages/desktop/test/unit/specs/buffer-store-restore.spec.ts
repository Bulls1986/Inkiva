import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({}))

import {
  mergeBufferStoreContents,
  type BufferStoreState,
  type BufferStoreTab
} from 'main_renderer/editorBufferStore/restore'
import EditorBufferStore from 'main_renderer/editorBufferStore'

const temporaryDirectories: string[] = []

const createStoreWithoutElectron = (editorBufferStorePath: string): EditorBufferStore => {
  const store = Object.create(EditorBufferStore.prototype) as EditorBufferStore
  store.editorBufferStorePath = editorBufferStorePath
  store.bufferStores = null
  return store
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

const makeTab = (
  id: string,
  pathname: string,
  markdown: string,
  isSaved = true
): BufferStoreTab => ({
  id,
  pathname,
  filename: pathname ? pathname.split(/[\\/]/).pop() : 'Untitled-1',
  markdown,
  isSaved
})

const makeState = (
  tabs: BufferStoreTab[],
  currentFileId: string,
  extra: Record<string, unknown> = {}
): BufferStoreState => ({
  version: 1,
  tabs,
  currentFileId,
  restoreWarnings: [],
  ...extra
})

describe('mergeBufferStoreContents', () => {
  it('combines recovery windows, removes duplicate paths, and remaps selection/warnings', () => {
    const firstPath = '/tmp/inkiva-recovery/first.md'
    const secondPath = '/tmp/inkiva-recovery/second.md'

    const merged = mergeBufferStoreContents([
      makeState([makeTab('first-old', firstPath, '# First')], 'first-old', {
        project: { rootDirectory: '/tmp/inkiva-recovery' },
        restoreWarnings: [{ tabId: 'first-old', pathname: firstPath, msg: 'first warning' }]
      }),
      makeState([makeTab('second', secondPath, '# Second')], 'second'),
      makeState([makeTab('first-duplicate', firstPath, '# First')], 'first-duplicate', {
        restoreWarnings: [{ tabId: 'first-duplicate', pathname: firstPath, msg: 'first warning' }]
      })
    ])

    expect(merged.tabs.map((tab) => tab.pathname)).toEqual([firstPath, secondPath])
    expect(merged.currentFileId).toBe('first-old')
    expect(merged.restoreWarnings).toEqual([
      { tabId: 'first-old', pathname: firstPath, msg: 'first warning' }
    ])
    expect(merged.project).toEqual({ rootDirectory: '/tmp/inkiva-recovery' })
  })

  it('keeps the dirty copy when duplicate recovery tabs disagree', () => {
    const pathname = '/tmp/inkiva-recovery/dirty.md'

    const merged = mergeBufferStoreContents([
      makeState([makeTab('clean', pathname, '# On disk')], 'clean'),
      makeState([makeTab('dirty', pathname, '# Unsaved edit', false)], 'dirty'),
      makeState(
        [
          makeTab('untitled-one', '', 'draft one', false),
          makeTab('untitled-two', '', 'draft two', false)
        ],
        'untitled-two'
      )
    ])

    expect(merged.tabs.map((tab) => tab.markdown)).toEqual([
      '# Unsaved edit',
      'draft one',
      'draft two'
    ])
    expect(merged.currentFileId).toBe('dirty')
    expect(merged.tabs.filter((tab) => tab.pathname === '')).toHaveLength(2)
  })

  it('consolidates the merged state into the primary recovery file', async() => {
    const editorBufferStorePath = mkdtempSync(path.join(tmpdir(), 'inkiva-buffer-restore-'))
    temporaryDirectories.push(editorBufferStorePath)
    const firstFilePath = path.join(editorBufferStorePath, 'first_editor_buffer_store.json')
    const secondFilePath = path.join(editorBufferStorePath, 'second_editor_buffer_store.json')
    const firstState = makeState(
      [makeTab('first', '/tmp/inkiva-recovery/first.md', '# First')],
      'first'
    )
    const secondState = makeState(
      [makeTab('second', '/tmp/inkiva-recovery/second.md', '# Second')],
      'second'
    )
    writeFileSync(firstFilePath, JSON.stringify(firstState), 'utf8')
    writeFileSync(secondFilePath, JSON.stringify(secondState), 'utf8')

    const store = createStoreWithoutElectron(editorBufferStorePath)
    const merged = await store.readAndMergeBufferStoreFilesAsync([
      { id: 'first', filePath: firstFilePath },
      { id: 'second', filePath: secondFilePath }
    ])
    await store.consolidateBufferStoreFiles(
      merged.primaryFilePath,
      merged.sourceFilePaths,
      merged.state
    )

    expect(readdirSync(editorBufferStorePath)).toEqual(['first_editor_buffer_store.json'])
    expect(JSON.parse(readFileSync(firstFilePath, 'utf8')).tabs).toHaveLength(2)
  })
})
