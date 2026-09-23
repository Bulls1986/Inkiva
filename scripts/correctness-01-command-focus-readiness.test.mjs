import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const commands = readFileSync(
  new URL('../packages/desktop/src/renderer/src/commands/index.ts', import.meta.url),
  'utf8'
)
const palette = readFileSync(
  new URL('../packages/desktop/src/renderer/src/components/commandPalette/index.vue', import.meta.url),
  'utf8'
)
const editor = readFileSync(
  new URL('../packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue', import.meta.url),
  'utf8'
)
const readiness = readFileSync(
  new URL('../packages/desktop/src/renderer/src/services/editorCommandReadiness.ts', import.meta.url),
  'utf8'
)
const mainListeners = readFileSync(
  new URL('../packages/desktop/src/renderer/src/store/listenForMain.ts', import.meta.url),
  'utf8'
)

test('CORRECTNESS-01 uses explicit editor readiness instead of arbitrary timers', () => {
  assert.match(commands, /executeWhenEditorReady/)
  assert.match(readiness, /bus\.emit\('editor-command-readiness'/)
  assert.doesNotMatch(commands, /setTimeout\(\(\) => bus\.emit\('editor-focus'\),\s*\d+\)/)
  assert.doesNotMatch(commands, /setTimeout\(\(\) => fn\(\),\s*\d+\)/)
  assert.match(editor, /registerBusHandler\('editor-command-readiness'/)
  assert.match(editor, /ed\.domNode\.focus\(\)/)
  assert.match(editor, /editorCompositionActive/)
  assert.match(editor, /const alreadyFocused = ed\.hasFocus\(\)/)
})

test('CORRECTNESS-01 waits for palette closed lifecycle before command execution', () => {
  assert.match(palette, /@closed="handleDialogClosed"/)
  assert.match(palette, /pendingCommandExecution/)
  assert.match(palette, /Promise\.resolve\(pending\?\.\(\)\)/)
  assert.doesNotMatch(palette, /showCommandPalette\.value = false\s*\n\s*execute\?\.\(\)/)
  assert.doesNotMatch(palette, /showCommandPalette\.value = false\s*\n\s*activeCommand\.executeSubcommand/)
})

test('CORRECTNESS-01 binds pending readiness to its originating document', () => {
  assert.match(editor, /pendingEditorCommandReadiness/)
  assert.match(editor, /request\.documentId !== currentDocumentId/)
  assert.match(editor, /invalidateEditorCommandContext\(id\)/)
  assert.match(editor, /runWhenEditorRenderComplete\(id, \(\) => markEditorCommandContextReady\(id\)\)/)
})

test('CORRECTNESS-01 routes only WYSIWYG-only menu mutations through readiness', () => {
  assert.match(mainListeners, /executeWhenEditorReady\(\(\) => bus\.emit\('paragraph', type\)\)/)
  assert.match(mainListeners, /executeWhenEditorReady\(\(\) => bus\.emit\('format', type\)\)/)
  assert.match(mainListeners, /if \(isEditorEditAction\(type\)\) emitEditorEditAction\(type\)/)
  assert.doesNotMatch(mainListeners, /EDITOR_CONTEXT_EDIT_ACTIONS/)
})

test('CORRECTNESS-01 keeps undo and redo surface-owned', () => {
  assert.match(commands, /bus\.emit\('undo', 'undo'\)/)
  assert.match(commands, /bus\.emit\('redo', 'redo'\)/)
  assert.doesNotMatch(commands, /focusEditorAndExecute\(\(\) => bus\.emit\('undo'/)
  assert.doesNotMatch(commands, /focusEditorAndExecute\(\(\) => bus\.emit\('redo'/)
})

test('CORRECTNESS-01 keeps view-only commands outside selection readiness', () => {
  assert.match(commands, /bus\.emit\('view:toggle-view-entry', 'typewriter'\)/)
  assert.match(commands, /bus\.emit\('view:toggle-view-entry', 'focus'\)/)
  assert.doesNotMatch(commands, /focusEditorAndExecute\(\(\) => bus\.emit\('view:toggle-view-entry'/)
})
