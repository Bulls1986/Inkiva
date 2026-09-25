import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const editor = readFileSync(
  new URL('../packages/desktop/src/renderer/src/store/editor.ts', import.meta.url),
  'utf8'
)

test('AC-73 never bypasses dirty-close decisions for restoreAll startup mode', () => {
  const start = editor.indexOf('LISTEN_FOR_CLOSE(): void')
  const end = editor.indexOf('LISTEN_FOR_UPDATE_PREFLIGHT(): void', start)
  const closeFlow = editor.slice(start, end)

  assert.ok(start >= 0 && end > start)
  assert.doesNotMatch(closeFlow, /startUpAction\s*!==\s*['"]restoreAll['"]/)
  assert.match(closeFlow, /if \(unsavedFiles\.length\)/)
  assert.match(closeFlow, /mt::close-window-confirm/)
})
