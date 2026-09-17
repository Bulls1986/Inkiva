import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => {
  const send = vi.fn()
  const on = vi.fn()
  const invoke = vi.fn()
  const sendBufferedState = vi.fn()
  const w = globalThis as unknown as {
    window?: {
      path?: { sep: string; dirname: (p: string) => string }
      electron?: {
        clipboard: { writeText: (value: string) => void }
        ipcRenderer: {
          send: typeof send
          on: typeof on
          invoke: typeof invoke
        }
      }
    }
  }

  w.window ??= {}
  w.window.path ??= { sep: '/', dirname: (p: string) => p }
  w.window.electron = {
    clipboard: { writeText: () => {} },
    ipcRenderer: { send, on, invoke }
  }

  return { send, on, invoke, sendBufferedState }
})

vi.mock('@/store/bufferedState', () => ({
  debouncedSendBufferedState: vi.fn(),
  sendBufferedState: mocks.sendBufferedState
}))

import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'

const makeDirtyTab = () => ({
  id: 'tab-1',
  filename: 'note.md',
  pathname: '/tmp/note.md',
  markdown: '# Unsaved',
  isSaved: false,
  encoding: { encoding: 'utf8', isBom: false },
  lineEnding: 'lf',
  adjustLineEndingOnSave: false,
  trimTrailingNewline: 2
})

describe('editor store — unsaved close confirmation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('requests the confirmation before starting buffered-state persistence', async() => {
    let resolveBufferedState: (() => void) | undefined
    mocks.sendBufferedState.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveBufferedState = resolve
      })
    )

    const editorStore = useEditorStore()
    const preferencesStore = usePreferencesStore()
    preferencesStore.startUpAction = 'blank'
    const tab = makeDirtyTab()
    editorStore.tabs = [tab] as typeof editorStore.tabs

    editorStore.LISTEN_FOR_CLOSE()
    const closeListener = mocks.on.mock.calls.find(
      ([channel]) => channel === 'mt::ask-for-close'
    )?.[1] as (() => void) | undefined

    expect(closeListener).toBeTypeOf('function')
    closeListener?.()

    const confirmationCall = mocks.send.mock.calls.find(
      ([channel]) => channel === 'mt::close-window-confirm'
    )
    expect(confirmationCall).toBeDefined()
    expect(mocks.sendBufferedState).not.toHaveBeenCalled()

    await vi.runOnlyPendingTimersAsync()
    expect(mocks.sendBufferedState).toHaveBeenCalledTimes(1)

    resolveBufferedState?.()
  })
})
