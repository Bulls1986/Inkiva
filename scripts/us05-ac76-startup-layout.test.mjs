import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('AC-76 separates four startup targets from restore/blank layout policy', () => {
  const schema = JSON.parse(read('packages/desktop/src/main/preferences/schema.json'))
  const editorWindow = read('packages/desktop/src/main/windows/editor.ts')
  const editorStore = read('packages/desktop/src/renderer/src/store/editor.ts')
  const preferencesStore = read('packages/desktop/src/renderer/src/store/preferences.ts')

  assert.deepEqual(schema.startUpAction.enum, ['folder', 'openLastFolder', 'blank', 'restoreAll'])
  assert.match(
    preferencesStore,
    /type StartUpAction = 'restoreAll' \| 'openLastFolder' \| 'folder' \| 'blank'/
  )
  assert.match(
    editorWindow,
    /restoreLayoutState\s*\?\s*ensureWindowPosition\(mainWindowState\)/
  )
  assert.match(editorWindow, /restoreLayoutState \? !!sideBarVisibility : true/)
  assert.match(editorWindow, /restoreLayoutState \? !!tabBarVisibility : true/)
  assert.match(editorWindow, /resolvedSourceCodeModeEnabled = !!sourceCodeModeEnabled/)
  assert.doesNotMatch(
    editorWindow,
    /resolvedSourceCodeModeEnabled = restoreLayoutState \? !!sourceCodeModeEnabled : false/
  )
  assert.match(editorWindow, /restoreLayoutState/)
  assert.match(editorStore, /if \(preferencesStore\.restoreLayoutState\) \{\s*layoutStore\.RESTORE_BUFFERED_STATE/)
  assert.match(editorStore, /SET_SIDE_BAR_WIDTH\(DEFAULT_SIDE_BAR_WIDTH/)
  assert.match(editorStore, /fileState\.tocCollapsedKeys = \[\]/)
})
