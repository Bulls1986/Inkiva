import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const renderer = resolve(here, '../../../src/renderer/src')
const desktopSrc = resolve(here, '../../../src')

const read = (relativePath: string): string =>
  readFileSync(resolve(renderer, relativePath), 'utf8')
const readDesktop = (relativePath: string): string =>
  readFileSync(resolve(desktopSrc, relativePath), 'utf8')

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
    expect(editor).toContain('const alreadyFocused = ed.hasFocus()')
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

  it('routes WYSIWYG-only menu mutations through readiness without stealing surface-owned edit actions', () => {
    const listeners = read('store/listenForMain.ts')

    expect(listeners).toContain("executeWhenEditorReady(() => bus.emit('paragraph', type))")
    expect(listeners).toContain("executeWhenEditorReady(() => bus.emit('format', type))")
    expect(listeners).toContain('if (isEditorEditAction(type)) emitEditorEditAction(type)')
    expect(listeners).not.toContain('EDITOR_CONTEXT_EDIT_ACTIONS')
  })

  it('leaves undo and redo surface-owned so Source Mode remains authoritative', () => {
    const commands = read('commands/index.ts')

    expect(commands).toContain("bus.emit('undo', 'undo')")
    expect(commands).toContain("bus.emit('redo', 'redo')")
    expect(commands).not.toMatch(/focusEditorAndExecute\(\(\) => bus\.emit\('undo'/)
    expect(commands).not.toMatch(/focusEditorAndExecute\(\(\) => bus\.emit\('redo'/)
  })

  it('keeps the native Bold accelerator wired to the format readiness ingress', () => {
    const windowsKeys = readDesktop('main/keyboard/keybindingsWindows.ts')
    const linuxKeys = readDesktop('main/keyboard/keybindingsLinux.ts')
    const darwinKeys = readDesktop('main/keyboard/keybindingsDarwin.ts')
    const formatAction = readDesktop('main/menu/actions/format.ts')

    expect(windowsKeys).toContain("['format.strong', 'Ctrl+B']")
    expect(linuxKeys).toContain("['format.strong', 'Ctrl+B']")
    expect(darwinKeys).toContain("['format.strong', 'Command+B']")
    expect(formatAction).toContain("win.webContents.send('mt::editor-format-action', { type })")
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
