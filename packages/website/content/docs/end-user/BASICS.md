# Basics

## Getting started

Inkiva is a document-first Markdown editor. It opens ordinary CommonMark/GFM files and folders, and its preview editor keeps most Markdown punctuation out of the way while you write. When the application starts without a restored session, the welcome surface offers **Recent Documents**, **New File**, and **Open file**.

![Real Windows Inkiva v0.6.0 welcome surface with the recent-folder and file-opening controls](../assets/inkiva-default.png)

Use **Search** in the sidebar for workspace content, or **Quick Open** (<kbd>CmdOrCtrl</kbd>+<kbd>P</kbd>) to find documents in the opened folder. In an empty paragraph, type `/` to open the quick-insert menu; choose a heading, list, quote, table, or another supported block.

## Interface

### Sidebar

The optional sidebar is organized around the current document and folder:

- **Files** shows the opened folder tree and its **Opened Files** subsection.
- **Search** searches the opened folder with filters for the search mode.
- **Outline** shows headings from the selected document.
- **More → Document Info** provides **Backlinks**, **Broken Markdown Links**, and **Local History**. The More control is an icon with the accessible name **Backlinks and Local History** on the Windows v0.6.0 UI.

Use the sidebar controls or **View → Toggle Sidebar**. The default Typora shortcut is <kbd>CmdOrCtrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd>; custom keybinding styles can change it. The `openedFilesInSidebar` preference controls the Opened Files subsection.

![Actual Windows v0.6.0 Inkiva editor with the Outline sidebar, document tab, and Markdown writing surface](../assets/inkiva-interface.png)

The Files, Search, and Document Info panels are shown below.

![Inkiva Files sidebar showing a folder tree and Opened Files](../assets/inkiva-files.png)

![Real Windows Inkiva v0.6.0 Search sidebar with an active Markdown document](../assets/inkiva-search.png)

![Actual Windows v0.6.0 Document Info sidebar showing a backlink, a missing Markdown target and Local History](../assets/inkiva-document-info.png)

### Tabs and split view

Each open document can appear in a tab. Drag tabs to reorder them, use the tab context menu for file actions, or hide the tab bar and work from the sidebar's **Opened Files** list. **View → Split Editor** opens a second document pane; use the pane controls to choose which pane is the active editor.

### Quick Open

**Quick Open** (<kbd>CmdOrCtrl</kbd>+<kbd>P</kbd>) finds Markdown files in the opened folder and already-open documents. The **Search** sidebar supports in-folder content searching, while **Outline** navigates headings in the active document. For searchable editor commands, use **View → Command Palette**; the previous titlebar search box is no longer a reliable entry point in the Windows v0.6.0 UI.

![Real Windows v0.6.0 Command Palette opened from View, listing available file and editor commands](../assets/inkiva-command-palette.png)

### Editor modes

Inkiva opens documents in the formatted preview editor by default. **View → Source Code Mode** switches to the raw Markdown editor for precise syntax editing. In the default Typora shortcut style, source mode is <kbd>CmdOrCtrl</kbd>+<kbd>/</kbd>, focus mode is <kbd>F8</kbd>, and typewriter mode is <kbd>F9</kbd>. See [Key bindings](KEYBINDINGS.md) for the preset and platform-specific tables.

## Open, edit, and save files

### Open a file

Choose **File → Open File** or press <kbd>CmdOrCtrl</kbd>+<kbd>O</kbd>. You can also pass a file path or folder to Inkiva from the [command line](CLI.md).

### Open a folder

Choose **File → Open Folder** or press <kbd>CmdOrCtrl</kbd>+<kbd>Shift</kbd>+<kbd>O</kbd>. The folder becomes the root for the Files panel, Quick Open, and in-folder Search.

### Save changes

Choose **File → Save** or press <kbd>CmdOrCtrl</kbd>+<kbd>S</kbd>. **File → Save As** writes the document to a new path. Inkiva marks unsaved changes in the tab and titlebar; automatic saving is enabled by default and can be adjusted in [Preferences](PREFERENCES.md).

## Work with document links and backlinks

Inkiva creates **ordinary relative Markdown links**, such as `[Guide](./docs/guide.md)`. Open a folder with **File → Open Folder** to make its Markdown files available to workspace link suggestions and the backlink index.

1. Select text in a saved document and choose **Insert/Edit Link** (or use <kbd>CmdOrCtrl</kbd>+<kbd>K</kbd>).
2. Enter a destination or select an eligible Markdown document suggested from the opened workspace. If two files share a name, use the displayed relative path to distinguish them.
3. Confirm the dialog to insert a standard Markdown link. <kbd>Escape</kbd> cancels without changing the document; **Undo** reverses the insertion as one edit.

You can still enter a normal external URL or manually edit an existing link. If the document has never been saved, save it first before inserting an automatically generated relative document link. Suggestions cover `.md` and `.markdown` documents in the selected workspace; they are not a search of your entire computer.

A regular click within a link keeps you in editing mode. To **follow** it deliberately, use <kbd>Ctrl</kbd>+click on Windows, <kbd>Command</kbd>+click on macOS, or the link tool's explicit jump action. A link to another Markdown file opens that file, and a `#heading` fragment can navigate to a heading. Missing files or unreadable targets are reported without rewriting your Markdown.

### Backlinks and broken links

Open the **More → Document Info** sidebar for the active document:

- **Backlinks** shows other Markdown documents that link here, including saved workspace files not currently open in tabs. Choosing a backlink goes to its source link occurrence.
- **Broken Markdown Links** reports missing relative `.md`/`.markdown` file targets in the checked workspace scope. A missing file and a file that cannot be verified (for example, due to permissions or partial indexing) are different states.
- Click the broken-link entry to locate its source occurrence (accessible name **Locate source occurrence**); this is not a separate text-labeled Locate button. Click the visible **Repair** button to open the standard **Insert link** confirmation dialog. The dialog does not silently replace the target; **Cancel** leaves the Markdown unchanged.

![Actual Windows v0.6.0 Insert link confirmation dialog opened from a broken link's Repair button](../assets/inkiva-broken-link-repair.png)

Results depend on the selected folder and the index's current state. An incomplete/unreadable scan is not proof that there are no links or no problems. External websites, image references, reference-style links, and missing heading fragments are **not** classified as broken files by this workspace report.

For detailed editing and repair steps, see [Editing in depth](EDITING.md).

## Outline, document history and recovery

The **Outline** sidebar follows headings in the active document. Click a heading to navigate, or use keyboard focus and arrow-key navigation; press <kbd>Enter</kbd> to activate the focused heading. On long documents, only the relevant outline rows may be mounted at once. Focus the **Outline tree container** (the keyboard focus owner), then use **Arrow Up/Down**, **Home/End**, and **Enter**. Focusing a virtualized individual heading row is not equivalent to keyboard-focusing the tree itself. In the tested 360-heading document, **End** and **Arrow Up** revealed the final rows while the editor remained at scroll position 0; **Enter** then navigated to the chosen heading.

![Real Windows v0.6.0 outline keyboard focus on a heading near the end of a 360-heading document, while the editor stays at the beginning](../assets/inkiva-outline-keyboard.png)

![Real Windows v0.6.0 document scrolled to a distant heading only after activating it with Enter](../assets/inkiva-outline-activated.png)

**More → Document Info → Local History** lets you inspect earlier local snapshots and recover content using the available preview, copy, or explicitly confirmed restore flow. Unsaved-work and crash-recovery prompts must be reviewed before replacing existing content. Local History and recovery protect local files; they are not cloud backup or multi-device sync.

## Appearances

Inkiva includes **Inkiva Light**, **Inkiva Dark**, and **Inkiva Paper**. Choose an appearance from the **Theme** menu or from **Preferences → Theme**. Light and Dark can follow the operating system; Paper remains a manual choice. See [Appearances](THEMES.md).

![Inkiva editor in the Dark appearance](../assets/inkiva-dark.png)

![Inkiva editor in the Paper appearance](../assets/inkiva-paper.png)

## Preferences

Open **File → Preferences** or the settings control at the bottom of the sidebar. Preferences can also be edited in `preferences.json` in the [application data directory](APPLICATION_DATA_DIRECTORY.md). The settings window groups general, theme, editor, and spelling options.

![Real Windows v0.6.0 Preferences dialog on the General page](../assets/inkiva-settings.png)
