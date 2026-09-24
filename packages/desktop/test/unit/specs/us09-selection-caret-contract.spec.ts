import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../../../..')
const read = (relativePath: string): string =>
  readFileSync(resolve(repoRoot, relativePath), 'utf8')

describe('US09 selection, caret and pointer contract', () => {
  it('uses native text cursors on editable WYSIWYG landing surfaces without blanketing the editor', () => {
    const blockStyles = read('packages/muya/src/assets/styles/blockSyntax.css')

    expect(blockStyles).toContain('.mu-container p.mu-paragraph')
    expect(blockStyles).toContain('.mu-table-inner tr td')
    expect(blockStyles).toMatch(
      /\.mu-container p\.mu-paragraph,[\s\S]*\.mu-table-inner tr td[\s\S]*cursor:\s*text;/
    )
    expect(blockStyles).not.toMatch(/\.mu-editor\s*\{[^}]*cursor:\s*text;/s)
    expect(blockStyles).not.toMatch(/\.mu-container\s*\{[^}]*cursor:\s*text;/s)
  })

  it('uses the native text cursor in Source Mode while leaving CodeMirror controls alone', () => {
    const sourceStyles = read('packages/desktop/src/renderer/src/codeMirror/index.css')

    expect(sourceStyles).toMatch(
      /\.source-code \.CodeMirror-(?:lines|code)[^{]*\{[^}]*cursor:\s*text;/s
    )
    expect(sourceStyles).not.toMatch(/\.source-code\s*\{[^}]*cursor:\s*text;/s)
    expect(sourceStyles).not.toMatch(/\.CodeMirror\s*\{[^}]*cursor:\s*text;/s)
  })

  it('keeps links editable on plain click and opens them only with Ctrl/Cmd-click', () => {
    const linkEvents = read('packages/muya/src/editor/linkMouseEvents.ts')
    const editor = read('packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue')

    expect(linkEvents).toContain('event.preventDefault()')
    expect(linkEvents).toContain('if (!isModifierClick(event))')
    expect(linkEvents).toContain("eventCenter.emit('format-click'")
    expect(editor).toContain("if (formatType === 'link' && ctrlOrMeta)")
  })

  it('restores the live selection before inline-toolbar formatting', () => {
    const toolbar = read('packages/muya/src/ui/inlineFormatToolbar/index.ts')

    expect(toolbar).toContain('const { anchor, focus, anchorBlock, anchorPath, focusBlock, focusPath } = selection')
    expect(toolbar).toContain('selection.setSelection(')
    expect(toolbar).toContain('this._block!.format(item.type)')
    expect(toolbar.indexOf('selection.setSelection('))
      .toBeLessThan(toolbar.indexOf('this._block!.format(item.type)'))
  })

  it('cancels delayed caret or viewport restoration after a newer trusted user interaction', () => {
    const editor = read('packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue')

    expect(editor).toContain('let editorInteractionRevision = 0')
    expect(editor).toContain('if (event.isTrusted) editorInteractionRevision += 1')
    expect(editor).toContain('runWhenEditorRenderCompleteUnlessUserMoved')
    expect(editor).toContain('if (editorInteractionRevision !== interactionRevision) return')
    expect(editor).toContain('container.addEventListener(eventName, markExplicitEditorInteraction, true)')
    expect(editor).toContain('container.removeEventListener(eventName, markExplicitEditorInteraction, true)')
  })

  it('runs command-palette mutations only after the overlay has fully closed', () => {
    const palette = read('packages/desktop/src/renderer/src/components/commandPalette/index.vue')

    expect(palette).toContain('@closed="handleDialogClosed"')
    expect(palette).toContain('pendingCommandExecution')
    expect(palette).toContain('Promise.resolve(pending?.())')
  })

  it('keeps format commands behind editor readiness so selection restoration precedes mutation', () => {
    const commands = read('packages/desktop/src/renderer/src/commands/index.ts')
    const readiness = read('packages/desktop/src/renderer/src/services/editorCommandReadiness.ts')

    for (const type of ['strong', 'em', 'del', 'inline_code', 'link']) {
      expect(commands).toContain(`focusEditorAndExecute(() => bus.emit('format', '${type}'))`)
    }
    expect(readiness).toContain("bus.emit('editor-command-readiness'")
    expect(readiness).toContain('if (ready) execute()')
  })
})
