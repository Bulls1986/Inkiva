import type { ShortcutStyle } from '@shared/types/preferences'

export type ShortcutPlatform = 'darwin' | 'linux' | 'win32'

export const DEFAULT_SHORTCUT_STYLE: ShortcutStyle = 'typora'

export const normalizeShortcutStyle = (style: unknown): ShortcutStyle => {
  if (style === 'typora' || style === 'marktext') {
    return style
  }
  return DEFAULT_SHORTCUT_STYLE
}

const chord = (modifier: string, ...keys: string[]): string => [modifier, ...keys].join('+')

/**
 * Return only the bindings that differ from MarkText's native defaults.
 *
 * The Typora preset follows Typora's commonly used Windows/Linux and macOS
 * shortcuts where MarkText has an equivalent command. MarkText-only commands
 * remain available unless their native shortcut would collide with a Typora
 * shortcut; those entries are explicitly unbound and can still be restored by
 * a custom keybinding.
 */
export const getShortcutStyleOverrides = (
  style: ShortcutStyle,
  platform: ShortcutPlatform
): ReadonlyMap<string, string> => {
  if (style !== 'typora') {
    return new Map()
  }

  const isMac = platform === 'darwin'
  const primary = isMac ? 'Command' : 'Ctrl'
  const secondary = isMac ? 'Option' : 'Alt'
  const overrides = new Map<string, string>([
    // File: MarkText has tabs, so Ctrl/Command+N is assigned to a new tab and
    // the Typora new-window shortcut is kept for opening a separate window.
    ['file.new-tab', chord(primary, 'N')],
    ['file.new-window', chord(primary, 'Shift', 'N')],

    // Edit and paragraph commands.
    ['edit.redo', isMac ? chord(primary, 'Shift', 'Z') : chord(primary, 'Y')],
    ['edit.replace', isMac ? '' : chord(primary, 'H')],
    ['edit.create-paragraph', ''],
    ['edit.delete-paragraph', ''],
    ['paragraph.paragraph', chord(primary, '0')],
    ...Array.from({ length: 6 }, (_, index) => [
      `paragraph.heading-${index + 1}`,
      chord(primary, String(index + 1))
    ] as [string, string]),
    ['paragraph.table', isMac ? chord(primary, secondary, 'T') : chord(primary, 'T')],
    ['paragraph.code-fence', isMac ? chord(primary, secondary, 'C') : chord(primary, 'Shift', 'K')],
    ['paragraph.quote-block', isMac ? chord(primary, secondary, 'Q') : chord(primary, 'Shift', 'Q')],
    ['paragraph.math-formula', isMac ? chord(primary, secondary, 'B') : chord(primary, 'Shift', 'M')],
    ['paragraph.html-block', ''],
    ['paragraph.order-list', isMac ? chord(primary, secondary, 'O') : chord(primary, 'Shift', '[')],
    ['paragraph.bullet-list', isMac ? chord(primary, secondary, 'U') : chord(primary, 'Shift', ']')],
    ['paragraph.loose-list-item', ''],

    // Format commands.
    ['format.highlight', ''],
    ['format.inline-code', chord(primary, 'Shift', '`')],
    ['format.inline-math', ''],
    ['format.strike', isMac ? 'Control+Shift+`' : 'Alt+Shift+5'],
    ['format.hyperlink', chord(primary, 'K')],
    ['format.clear-format', `${primary}+\\`],

    // Window and view commands.
    ['window.toggle-full-screen', isMac ? chord(primary, secondary, 'F') : 'F11'],
    ['window.zoomIn', isMac ? '' : chord(primary, 'Shift', 'Plus')],
    ['window.zoomOut', isMac ? '' : chord(primary, 'Shift', '-')],
    ['view.source-code-mode', chord(primary, '/')],
    ['view.focus-mode', 'F8'],
    ['view.typewriter-mode', 'F9'],
    ['view.toggle-sidebar', chord(primary, 'Shift', 'L')],
    ['view.toggle-toc', isMac ? 'Command+Control+1' : chord(primary, 'Shift', '1')],
    ['view.toggle-tabbar', ''],
    ['view.toggle-dev-tools', isMac ? '' : 'Shift+F12'],

    // Typora has no tabs. Preserve MarkText's tab feature by moving the
    // number shortcuts out of the heading range on Windows/Linux. On macOS
    // the native Ctrl shortcuts do not collide with Command+1..6 headings.
    ...(!isMac
      ? Array.from({ length: 10 }, (_, index) => [
          `tabs.switchTo${
            index === 9
              ? 'Tenth'
              : ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth'][index]
          }`,
          chord(primary, 'Alt', String(index === 9 ? 0 : index + 1))
        ] as [string, string])
      : [])
  ])

  // Typora's Windows/Linux print command has no shortcut. Clearing it also
  // avoids colliding with MarkText's Ctrl+P quick-open command.
  overrides.set('file.print', '')

  if (isMac) {
    overrides.set('tabs.cycleForward', 'Command+`')
  }

  return overrides
}

export const applyShortcutStyle = (
  baseKeybindings: ReadonlyMap<string, string>,
  style: ShortcutStyle,
  platform: ShortcutPlatform
): Map<string, string> => {
  const keybindings = new Map(baseKeybindings)
  for (const [id, accelerator] of getShortcutStyleOverrides(style, platform)) {
    if (keybindings.has(id)) {
      keybindings.set(id, accelerator)
    }
  }
  return keybindings
}
