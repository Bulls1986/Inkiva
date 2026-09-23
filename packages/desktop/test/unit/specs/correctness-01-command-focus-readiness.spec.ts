import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const renderer = resolve(here, '../../../src/renderer/src')

const read = (relativePath: string): string =>
  readFileSync(resolve(renderer, relativePath), 'utf8')

describe('CORRECTNESS-01 command focus readiness contract', () => {
  it('uses an explicit editor-readiness acknowledgement instead of arbitrary timers', () => {
    const commands = read('commands/index.ts')
    const editor = read('components/editorWithTabs/editor.vue')

    expect(commands).toContain('executeWhenEditorReady')
    expect(read('services/editorCommandReadiness.ts')).toContain("bus.emit('editor-command-readiness'")
    expect(commands).not.toMatch(
      /setTimeout\(\(\) => bus\.emit\('editor-focus'\),\s*\d+\)/
    )
    expect(commands).not.toMatch(
      /setTimeout\(\(\) => fn\(\),\s*\d+\)/
    )
    expect(editor).toContain("registerBusHandler('editor-command-readiness'")
    expect(editor).toContain('ed.domNode.focus()')
    expect(editor).toContain('ed.focus()')
    expect(editor).toContain('editorCompositionActive')
  })

  it('executes pending commands only after the palette has fully closed', () => {
    const palette = read('components/commandPalette/index.vue')

    expect(palette).toContain('@closed="handleDialogClosed"')
    expect(palette).toContain('pendingCommandExecution')
    expect(palette).toContain('Promise.resolve(pending?.())')
    expect(palette).not.toMatch(
      /showCommandPalette\.value = false\s*\n\s*execute\?\.\(\)/
    )
    expect(palette).not.toMatch(
      /showCommandPalette\.value = false\s*\n\s*activeCommand\.executeSubcommand/
    )
  })

  it('binds pending readiness to the document that requested the command', () => {
    const editor = read('components/editorWithTabs/editor.vue')

    expect(editor).toContain('pendingEditorCommandReadiness')
    expect(editor).toContain('request.documentId !== currentDocumentId')
    expect(editor).toContain('invalidateEditorCommandContext(id)')
    expect(editor).toContain('runWhenEditorRenderComplete(id, () => markEditorCommandContextReady(id))')
  })

  it('routes menu and keyboard editor mutations through the same readiness boundary', () => {
    const listeners = read('store/listenForMain.ts')

    expect(listeners).toContain("executeWhenEditorReady(() => bus.emit('paragraph', type))")
    expect(listeners).toContain("executeWhenEditorReady(() => bus.emit('format', type))")
    expect(listeners).toContain('emitEditorEditActionWhenReady(type)')
    expect(listeners).toContain('EDITOR_CONTEXT_EDIT_ACTIONS')
  })

  it('keeps view-only commands outside selection-context readiness', () => {
    const commands = read('commands/index.ts')

    expect(commands).toContain("bus.emit('view:toggle-view-entry', 'typewriter')")
    expect(commands).toContain("bus.emit('view:toggle-view-entry', 'focus')")
    expect(commands).not.toMatch(
      /focusEditorAndExecute\(\(\) => bus\.emit\('view:toggle-view-entry'/
    )
  })
})
