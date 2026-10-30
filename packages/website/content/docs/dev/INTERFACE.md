# Interface

Inkiva's supported desktop release platforms are Windows x64 and macOS on Intel or Apple Silicon.

## Main interface

![Inkiva desktop shell with titlebar, Outline sidebar, tabs, and editor](../assets/inkiva-interface.png)

The desktop shell is organized around the current Markdown document:

- **Titlebar** — window controls, current document, menus, save state, word count and the command launcher.
- **Sidebar** — optional Files, Search, Outline and More panels.
- **Editor** — the formatted WYSIWYG surface or raw Markdown Source mode, with document tabs.

## Titlebar

On Windows, Inkiva renders its custom titlebar by default. macOS uses client-side window decorations. The **titleBarStyle** preference can select the native Windows titlebar.

The titlebar command launcher opens the command palette. It is not a persistent global search field; document/folder search is available from the **Search** sidebar panel.

Linux is not a supported release platform. No Linux titlebar or desktop behavior is part of the product support contract.

## Sidebar

The optional sidebar is organized around the current document and opened folder:

- **Files** shows the opened root directory and the files opened in the current window.
- **Search** searches Markdown files in the current folder scope and exposes the configured exclusions and search options.
- **Outline** reflects headings in the selected tab and supports document navigation.
- **More → Document Info** provides Backlinks and Local History.

Use the sidebar controls or **View → Toggle Sidebar**. The default Typora shortcut is documented in [Key bindings](../end-user/KEYBINDINGS.md); custom keybinding styles can change it.

## Tabs and editor surfaces

Tabs represent open documents. The editor opens in formatted preview mode by default. **View → Source Code Mode** switches to the raw Markdown surface for exact syntax editing.

The WYSIWYG and Source surfaces operate on the same document revision. A mode switch alone must not create a content revision, save or additional undo boundary. See the [desktop editor interaction contract](https://github.com/Bulls1986/Inkiva/blob/develop/docs/product/DESKTOP_EDITOR_INTERACTION_CONTRACT.md) for normative behavior.
