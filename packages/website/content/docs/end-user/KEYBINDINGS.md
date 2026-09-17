# Key Bindings

Inkiva supports two shortcut presets. New profiles use the `typora` preset. Choose the `marktext` preset in preferences to use the baseline tables in the platform guides, or override individual commands in `keybindings.json`.

The file is located in the [application data directory](APPLICATION_DATA_DIRECTORY.md). Each entry consists of an `id`/`accelerator` pair in JSON format:

```json
{
  "file.save": "CmdOrCtrl+Shift+S",
  "file.save-as": "CmdOrCtrl+S"
}
```

## Default Typora preset

The preset changes the most frequently used commands while leaving the rest of the menu bindings available. These are the current overrides; `Command` means the macOS modifier and `Ctrl` means the Windows/Linux modifier.

| Command | Windows/Linux | macOS |
| ------- | ------------- | ----- |
| New tab | <kbd>Ctrl</kbd>+<kbd>N</kbd> | <kbd>Command</kbd>+<kbd>N</kbd> |
| New window | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd> | <kbd>Command</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd> |
| Heading 1–6 | <kbd>Ctrl</kbd>+<kbd>1</kbd>…<kbd>6</kbd> | <kbd>Command</kbd>+<kbd>1</kbd>…<kbd>6</kbd> |
| Insert table | <kbd>Ctrl</kbd>+<kbd>T</kbd> | <kbd>Command</kbd>+<kbd>Option</kbd>+<kbd>T</kbd> |
| Insert code block | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> | <kbd>Command</kbd>+<kbd>Option</kbd>+<kbd>C</kbd> |
| Insert quote block | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Q</kbd> | <kbd>Command</kbd>+<kbd>Option</kbd>+<kbd>Q</kbd> |
| Insert math block | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd> | <kbd>Command</kbd>+<kbd>Option</kbd>+<kbd>B</kbd> |
| Insert hyperlink | <kbd>Ctrl</kbd>+<kbd>K</kbd> | <kbd>Command</kbd>+<kbd>K</kbd> |
| Inline code | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>`</kbd> | <kbd>Command</kbd>+<kbd>Shift</kbd>+<kbd>`</kbd> |
| Clear formatting | <kbd>Ctrl</kbd>+<kbd>\</kbd> | <kbd>Command</kbd>+<kbd>\</kbd> |
| Source code mode | <kbd>Ctrl</kbd>+<kbd>/</kbd> | <kbd>Command</kbd>+<kbd>/</kbd> |
| Focus mode | <kbd>F8</kbd> | <kbd>F8</kbd> |
| Typewriter mode | <kbd>F9</kbd> | <kbd>F9</kbd> |
| Toggle sidebar | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> | <kbd>Command</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> |
| Toggle Outline | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>1</kbd> | <kbd>Command</kbd>+<kbd>Control</kbd>+<kbd>1</kbd> |
| Quick Open | <kbd>Ctrl</kbd>+<kbd>P</kbd> | <kbd>Command</kbd>+<kbd>P</kbd> |

The command palette shortcut remains <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> on Windows/Linux and <kbd>Command</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> on macOS. The titlebar launcher is also clickable.

## Available modifiers

- `Cmd` on macOS
- `Option` on macOS
- `Ctrl`
- `Shift`
- `Alt` (equal to `Option` on macOS)

Do not bind `AltGr`; use `Ctrl+Alt` instead.

## Available keys

- `0-9`, `A-Z`, `F1-F24`, and punctuation such as `/` or `#`
- `Plus`, `Space`, `Tab`, `Backspace`, `Delete`, `Insert`, `Return/Enter`, `Esc`, `Home`, `End`, and `PrintScreen`
- `Up`, `Down`, `Left`, and `Right`
- `PageUp` and `PageDown`
- Empty string `""` to unset an accelerator

## Platform tables

- [Key bindings for macOS](KEYBINDINGS_OSX.md)
- [Key bindings for Windows](KEYBINDINGS_WINDOWS.md)
