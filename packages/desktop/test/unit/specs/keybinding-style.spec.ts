import { afterEach, describe, expect, it, vi } from 'vitest'
import { isEqualAccelerator } from 'common/keybinding'
import keybindingsLinux from 'main_renderer/keyboard/keybindingsLinux'
import {
  applyShortcutStyle,
  DEFAULT_SHORTCUT_STYLE,
  getShortcutStyleOverrides,
  normalizeShortcutStyle
} from 'main_renderer/keyboard/shortcutStyles'
import KeybindingConfigurator from '../../../src/renderer/src/prefComponents/keybindings/KeybindingConfigurator'

describe('shortcut style presets', () => {
  it('keeps MarkText defaults unchanged and does not mutate the source map', () => {
    const defaults = applyShortcutStyle(keybindingsLinux, 'marktext', 'linux')

    expect(defaults).not.toBe(keybindingsLinux)
    expect([...defaults]).toEqual([...keybindingsLinux])
    expect(keybindingsLinux.get('view.source-code-mode')).toBe('Ctrl+E')
  })

  it('provides Typora-style shortcuts for Linux without duplicate bindings', () => {
    const defaults = applyShortcutStyle(keybindingsLinux, 'typora', 'linux')
    const seen = new Map<string, string>()

    for (const [id, accelerator] of defaults) {
      if (!accelerator) continue
      const previous = [...seen].find(([value]) => isEqualAccelerator(value, accelerator))
      expect(previous, `${id} duplicates ${previous?.[1] ?? ''}`).toBeUndefined()
      seen.set(accelerator, id)
    }

    expect(defaults.get('file.new-tab')).toBe('Ctrl+N')
    expect(defaults.get('file.new-window')).toBe('Ctrl+Shift+N')
    expect(defaults.get('edit.redo')).toBe('Ctrl+Y')
    expect(defaults.get('paragraph.heading-1')).toBe('Ctrl+1')
    expect(defaults.get('paragraph.table')).toBe('Ctrl+T')
    expect(defaults.get('paragraph.order-list')).toBe('Ctrl+Shift+[')
    expect(defaults.get('paragraph.bullet-list')).toBe('Ctrl+Shift+]')
    expect(defaults.get('format.hyperlink')).toBe('Ctrl+K')
    expect(defaults.get('view.source-code-mode')).toBe('Ctrl+/')
    expect(defaults.get('view.focus-mode')).toBe('F8')
    expect(defaults.get('view.typewriter-mode')).toBe('F9')
    expect(defaults.get('view.toggle-sidebar')).toBe('Ctrl+Shift+L')
    expect(defaults.get('window.zoomIn')).toBe('Ctrl+Shift+Plus')
    expect(defaults.get('window.zoomOut')).toBe('Ctrl+Shift+-')
    expect(defaults.get('tabs.switchToFirst')).toBe('Ctrl+Alt+1')
  })

  it('uses Typora macOS modifiers and keeps custom entries outside the preset', () => {
    const overrides = getShortcutStyleOverrides('typora', 'darwin')
    const defaults = applyShortcutStyle(
      new Map([
        ['paragraph.heading-1', 'Command+Alt+1'],
        ['format.hyperlink', 'Command+L'],
        ['view.source-code-mode', 'Command+E'],
        ['window.zoomIn', '']
      ]),
      'typora',
      'darwin'
    )

    expect(overrides.get('paragraph.heading-1')).toBe('Command+1')
    expect(overrides.get('paragraph.table')).toBe('Command+Option+T')
    expect(overrides.get('format.strike')).toBe('Control+Shift+`')
    expect(overrides.get('view.toggle-toc')).toBe('Command+Control+1')
    expect(overrides.get('view.source-code-mode')).toBe('Command+/')
    expect(defaults.get('paragraph.heading-1')).toBe('Command+1')
    expect(defaults.get('format.hyperlink')).toBe('Command+K')
    expect(defaults.get('view.source-code-mode')).toBe('Command+/')
    expect(defaults.get('window.zoomIn')).toBe('')
  })

  it('uses Typora as the default for missing or unknown persisted values', () => {
    expect(DEFAULT_SHORTCUT_STYLE).toBe('typora')
    expect(normalizeShortcutStyle('unknown')).toBe('typora')
    expect(normalizeShortcutStyle(undefined)).toBe('typora')
    expect(normalizeShortcutStyle('typora')).toBe('typora')
    expect(normalizeShortcutStyle('marktext')).toBe('marktext')
  })

  it('restores the defaults of the selected style and clears only custom entries', async() => {
    const invoke = vi.fn((channel: string) => {
      if (channel === 'mt::keybinding-set-style') {
        return Promise.resolve({
          defaultKeybindings: new Map([
            ['format.hyperlink', 'Ctrl+K'],
            ['paragraph.heading-1', 'Ctrl+1']
          ]),
          userKeybindings: new Map([['format.hyperlink', 'Ctrl+Alt+K']]),
          shortcutStyle: 'typora' as const
        })
      }
      return Promise.resolve(true)
    })
    const previousElectron = (window as unknown as { electron?: unknown }).electron
    ;(window as unknown as { electron: unknown }).electron = { ipcRenderer: { invoke } }

    try {
      const configurator = new KeybindingConfigurator(
        new Map([
          ['format.hyperlink', 'Ctrl+L'],
          ['paragraph.heading-1', 'Ctrl+Alt+1']
        ]),
        new Map([['format.hyperlink', 'Ctrl+Alt+K']]),
        'marktext'
      )

      expect(await configurator.setShortcutStyle('typora')).toBe(true)
      expect(configurator.getShortcutStyle()).toBe('typora')
      expect(configurator.getKeybindings().find((entry) => entry.id === 'format.hyperlink')?.accelerator)
        .toBe('Ctrl+Alt+K')
      expect(configurator.getKeybindings().find((entry) => entry.id === 'paragraph.heading-1')?.accelerator)
        .toBe('Ctrl+1')

      expect(await configurator.resetAll()).toBe(true)
      expect(configurator.getKeybindings().every((entry) => entry.type === 0)).toBe(true)
      expect(invoke).toHaveBeenLastCalledWith('mt::keybinding-save-user-keybindings', new Map())
    } finally {
      if (previousElectron === undefined) {
        delete (window as unknown as { electron?: unknown }).electron
      } else {
        ;(window as unknown as { electron: unknown }).electron = previousElectron
      }
    }
  })
})
