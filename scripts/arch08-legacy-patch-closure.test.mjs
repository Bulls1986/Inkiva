import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('command-center runtime listeners are started before editor bootstrap registration', () => {
  const app = read('packages/desktop/src/renderer/src/pages/app.vue')
  const commandCenterStart = app.indexOf('commandCenterStore.LISTEN_COMMAND_CENTER_BUS()')
  const editorBootstrap = app.indexOf('editorStore.LISTEN_FOR_BOOTSTRAP_WINDOW()')
  const commandCenterReady = app.indexOf('await commandCenterReady')

  assert.notEqual(commandCenterStart, -1)
  assert.notEqual(editorBootstrap, -1)
  assert.notEqual(commandCenterReady, -1)
  assert.ok(
    commandCenterStart < editorBootstrap && editorBootstrap < commandCenterReady,
    'install command listeners synchronously, register bootstrap commands, then await catalogue readiness'
  )
})

test('editor bootstrap runtime command setup does not depend on arbitrary timeouts', () => {
  const editorStore = read('packages/desktop/src/renderer/src/store/editor.ts')
  const start = editorStore.indexOf('LISTEN_FOR_BOOTSTRAP_WINDOW(): void')
  const end = editorStore.indexOf("window.electron.ipcRenderer.on('mt::bootstrap-editor'", start)
  const setup = editorStore.slice(start, end)

  assert.match(setup, /bus\.emit\('cmd::register-command'/)
  assert.doesNotMatch(setup, /mt::request-keybindings/)
  assert.doesNotMatch(setup, /cmd::sort-commands/)
  assert.doesNotMatch(setup, /setTimeout\(/)
})

test('command-center owns keybinding refresh after the command catalogue is ready', () => {
  const commandCenter = read('packages/desktop/src/renderer/src/store/commandCenter.ts')
  const refreshCompletion = commandCenter.indexOf('await refreshCommands()')
  const requestKeybindings = commandCenter.indexOf(
    "window.electron.ipcRenderer.send('mt::request-keybindings')",
    refreshCompletion
  )

  assert.notEqual(refreshCompletion, -1)
  assert.ok(
    requestKeybindings > refreshCompletion,
    'keybindings must be requested only after command catalogue refresh completes'
  )
})

test('spellchecker runtime command registration does not depend on an arbitrary timeout', () => {
  const editor = read('packages/desktop/src/renderer/src/components/editorWithTabs/editor.vue')
  const start = editor.indexOf('new SpellcheckerLanguageCommand(spellchecker)')
  const end = editor.indexOf("registerBusHandler('file-loaded'", start)
  const registration = editor.slice(start, end)

  assert.match(registration, /bus\.emit\('cmd::register-command', spellcheckerLanguageCommand\)/)
  assert.doesNotMatch(registration, /setTimeout\(/)
})
