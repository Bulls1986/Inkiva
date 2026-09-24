import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.hoisted(() => {
  const w = globalThis as unknown as {
    window?: {
      path?: { sep: string; dirname: (p: string) => string; basename: (p: string) => string }
      fileUtils?: { isSamePathSync: (a: string, b: string) => boolean }
      electron?: {
        clipboard: { writeText: (value: string) => void }
        ipcRenderer: {
          send: (...args: unknown[]) => void
          on: (...args: unknown[]) => void
          invoke: (...args: unknown[]) => Promise<unknown>
        }
      }
      inkiva?: { env: { windowId: number } }
    }
  }

  w.window ??= {}
  w.window.path ??= {
    sep: '/',
    dirname: (p: string) => p.split('/').slice(0, -1).join('/') || '/',
    basename: (p: string) => p.split('/').pop() ?? p
  }
  w.window.fileUtils ??= { isSamePathSync: (a: string, b: string) => a === b }
  w.window.electron ??= {
    clipboard: { writeText: () => {} },
    ipcRenderer: { send: () => {}, on: () => {}, invoke: async() => false }
  }
  w.window.inkiva ??= { env: { windowId: 1 } }
})

vi.mock('@/services/notification', () => ({
  default: { notify: vi.fn(), name: 'notify' }
}))

import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import type { IFileState } from '@shared/types/files'

const makeTab = (
  id: string,
  overrides: Partial<IFileState> & Record<string, unknown> = {}
): IFileState =>
  ({
    id,
    filename: `${id}.md`,
    pathname: `/tmp/${id}.md`,
    markdown: `# ${id}\n`,
    isSaved: true,
    encoding: { encoding: 'utf8', isBom: false },
    lineEnding: 'lf',
    adjustLineEndingOnSave: false,
    trimTrailingNewline: 3,
    history: { stack: [], index: -1 },
    cursor: null,
    wordCount: { paragraph: 1, word: 1, character: 1, all: 1 },
    searchMatches: { index: -1, matches: [], value: '' },
    scrollTop: 420,
    muyaIndexCursor: null,
    notifications: [],
    ...overrides
  }) as IFileState

describe('US05 workspace restore state', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('persists document-specific mode, semantic viewport anchor and outline collapse state', () => {
    const editor = useEditorStore()
    const first = makeTab('first', {
      sourceCodeMode: true,
      viewportAnchorSlug: 'section-8',
      tocCollapsedKeys: ['section-2>details', 'section-8>appendix']
    })
    const second = makeTab('second', {
      sourceCodeMode: false,
      viewportAnchorSlug: 'overview',
      tocCollapsedKeys: ['overview>notes']
    })

    editor.tabs = [first, second]
    editor.currentFile = second
    editor.updateTabIdToIndex()

    const snapshot = editor.CREATE_BUFFERED_STATE() as unknown as {
      tabs: Array<Record<string, unknown>>
    }

    expect(snapshot.tabs[0]).toMatchObject({
      sourceCodeMode: true,
      viewportAnchorSlug: 'section-8',
      tocCollapsedKeys: ['section-2>details', 'section-8>appendix']
    })
    expect(snapshot.tabs[1]).toMatchObject({
      sourceCodeMode: false,
      viewportAnchorSlug: 'overview',
      tocCollapsedKeys: ['overview>notes']
    })
  })

  it('reconciles a late inactive disk read only while the restored tab is still clean', () => {
    const editor = useEditorStore()
    const tab = makeTab('late', { markdown: '# buffered\n', isSaved: true })
    editor.tabs = [tab]
    editor.currentFile = null
    editor.updateTabIdToIndex()

    editor.RECONCILE_RESTORED_TAB({ pathname: tab.pathname, markdown: '# disk\n' })
    expect(tab.markdown).toBe('# disk\n')

    tab.markdown = '# user edit\n'
    tab.isSaved = false
    editor.RECONCILE_RESTORED_TAB({ pathname: tab.pathname, markdown: '# newer disk\n' })
    expect(tab.markdown).toBe('# user edit\n')
  })

  it('turns an unavailable restored path into a tab-scoped recovery warning', () => {
    const editor = useEditorStore()
    const tab = makeTab('missing')
    editor.tabs = [tab]
    editor.currentFile = tab
    editor.updateTabIdToIndex()

    editor.PUSH_RESTORE_WARNING({
      tabId: tab.id,
      pathname: tab.pathname,
      msg: `File unavailable: ${tab.pathname}. Your recovered draft is still open.`,
      style: 'warn',
      exclusiveType: 'restore_unavailable'
    })

    expect(tab.isSaved).toBe(false)
    expect(tab.notifications).toHaveLength(1)
    expect(tab.notifications[0]).toMatchObject({
      style: 'warn',
      exclusiveType: 'restore_unavailable'
    })
    expect(tab.notifications[0]?.msg).toContain(tab.pathname)
  })

  it('switches the window surface to the target tab mode without changing the new-tab default', () => {
    const editor = useEditorStore()
    const preferences = usePreferencesStore()
    const sourceTab = makeTab('source', { sourceCodeMode: true })
    const wysiwygTab = makeTab('wysiwyg', { sourceCodeMode: false })

    editor.tabs = [sourceTab, wysiwygTab]
    editor.currentFile = sourceTab
    editor.updateTabIdToIndex()
    preferences.sourceCode = true
    preferences.sourceCodeModeEnabled = true

    editor.UPDATE_CURRENT_FILE(wysiwygTab)

    expect(preferences.sourceCode).toBe(false)
    expect(preferences.sourceCodeModeEnabled).toBe(true)
    expect(sourceTab.sourceCodeMode).toBe(true)
    expect(wysiwygTab.sourceCodeMode).toBe(false)
  })
})
