import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const rendererRoot = resolve(here, '../../../src/renderer/src')

const readRenderer = (path: string): string => readFileSync(resolve(rendererRoot, path), 'utf8')

describe('ARCH-08 legacy timing closure', () => {
  it('installs command-center runtime listeners before editor bootstrap registration', () => {
    const app = readRenderer('pages/app.vue')
    const commandCenterStart = app.indexOf('commandCenterStore.LISTEN_COMMAND_CENTER_BUS()')
    const editorBootstrap = app.indexOf('editorStore.LISTEN_FOR_BOOTSTRAP_WINDOW()')
    const commandCenterReady = app.indexOf('await commandCenterReady')

    expect(commandCenterStart).toBeGreaterThan(-1)
    expect(editorBootstrap).toBeGreaterThan(-1)
    expect(commandCenterReady).toBeGreaterThan(-1)
    expect(commandCenterStart).toBeLessThan(editorBootstrap)
    expect(editorBootstrap).toBeLessThan(commandCenterReady)
  })

  it('does not depend on arbitrary startup delays to register runtime commands', () => {
    const editorStore = readRenderer('store/editor.ts')
    const bootstrapStart = editorStore.indexOf('LISTEN_FOR_BOOTSTRAP_WINDOW(): void')
    const bootstrapEnd = editorStore.indexOf("window.electron.ipcRenderer.on('mt::bootstrap-editor'", bootstrapStart)
    const bootstrapSetup = editorStore.slice(bootstrapStart, bootstrapEnd)

    expect(bootstrapSetup).toContain("bus.emit('cmd::register-command'")
    expect(bootstrapSetup).not.toContain('mt::request-keybindings')
    expect(bootstrapSetup).not.toContain('cmd::sort-commands')
    expect(bootstrapSetup).not.toContain('setTimeout(')
  })

  it('requests keybindings only after the command catalogue refresh completes', () => {
    const commandCenter = readRenderer('store/commandCenter.ts')
    const refreshCompletion = commandCenter.indexOf('await refreshCommands()')
    const requestKeybindings = commandCenter.indexOf(
      "window.electron.ipcRenderer.send('mt::request-keybindings')",
      refreshCompletion
    )

    expect(refreshCompletion).toBeGreaterThan(-1)
    expect(requestKeybindings).toBeGreaterThan(refreshCompletion)
  })

  it('registers the editor spellchecker command through the ready command bus without a delay', () => {
    const editor = readRenderer('components/editorWithTabs/editor.vue')
    const commandCreation = editor.indexOf('new SpellcheckerLanguageCommand(spellchecker)')
    const nextSection = editor.indexOf("registerBusHandler('file-loaded'", commandCreation)
    const registration = editor.slice(commandCreation, nextSection)

    expect(registration).toContain("bus.emit('cmd::register-command', spellcheckerLanguageCommand)")
    expect(registration).not.toContain('setTimeout(')
  })
})
