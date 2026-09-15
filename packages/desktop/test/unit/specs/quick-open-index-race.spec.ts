import path from 'node:path'
import { describe, expect, it } from 'vitest'
import bus from '@/bus'
import QuickOpenCommand from '@/commands/quickOpen'
import type { CancellableSearchPromise } from '@/node/workspaceSearch'

const installPathBridge = (): void => {
  const runtimeWindow = window as unknown as {
    path: typeof path.posix
    fileUtils: {
      MARKDOWN_INCLUSIONS: string[]
      hasMarkdownExtension: (pathname: string) => boolean
      isChildOfDirectory: (root: string, pathname: string) => boolean
      isSamePathSync: (left: string, right: string) => boolean
    }
  }
  runtimeWindow.path = path.posix
  runtimeWindow.fileUtils = {
    MARKDOWN_INCLUSIONS: ['**/*.md'],
    hasMarkdownExtension: (pathname) => pathname.endsWith('.md'),
    isChildOfDirectory: (root, pathname) => {
      const relative = path.posix.relative(root, pathname)
      return relative !== '' && !relative.startsWith('../') && relative !== '..'
    },
    isSamePathSync: (left, right) => left === right
  }
}

describe('Quick Open indexed path lifecycle', () => {
  it('keeps a file discovered during the initial watcher burst searchable', async() => {
    installPathBridge()
    const root = '/workspace'
    const target = path.posix.join(root, 'indexed-note-1199.md')
    let resolveSearch: (() => void) | undefined
    let cancelled = false

    const searcher = {
      search: (
        _directories: string[],
        _pattern: string,
        options: { didMatch?: (payload: unknown) => void }
      ): CancellableSearchPromise<void> => {
        const search = new Promise<void>((resolve) => {
          resolveSearch = resolve
          setTimeout(() => {
            if (cancelled) return
            options.didMatch?.([target])
            // The real startup sequence can deliver the watcher add event
            // before the background index slice has run.
            bus.emit('project-tree-changed', {
              type: 'add',
              change: { pathname: target }
            })
            resolve()
          }, 0)
        }) as CancellableSearchPromise<void>
        search.cancel = (): void => {
          cancelled = true
          resolveSearch?.()
        }
        return search
      }
    }

    const command = new QuickOpenCommand({
      editor: { tabs: [], currentFile: null },
      project: { projectTree: { pathname: root } }
    } as unknown as ConstructorParameters<typeof QuickOpenCommand>[0])
    ;(command as unknown as { _directorySearcher: typeof searcher })._directorySearcher = searcher

    const result = await command.search('indexed-note-1199')

    expect(result.map((item) => item.id)).toContain(target)
    resolveSearch?.()
  })
})
