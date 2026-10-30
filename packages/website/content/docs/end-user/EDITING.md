# Editing in Depth

Inkiva renders Markdown as you work while keeping the saved document as a normal text file. The preview editor supports direct typing, Markdown shortcuts, block transformations, inline formatting, tables, images, diagrams, and other extensions. The raw source editor is available whenever you need exact syntax.

![Inkiva formatted Markdown editor showing headings, a quote, a task list, and a table](../assets/inkiva-interface.png)

## Text selection and formatting

Select text with the mouse, double-click a word, or use <kbd>Shift</kbd>+<kbd>Arrow Keys</kbd>. Use the **Format** menu or the available keyboard shortcuts to apply bold, italic, underline, strikethrough, inline code, inline math, links, images, and clear formatting. The command launcher provides a searchable route to the same actions.

Inkiva updates the rendered result as you edit. The active appearance controls the writing surface and syntax colors; editor font, size, line height, and width are configured in **Preferences → Editor**.

## Quick insert and block actions

In an empty paragraph, type `/` to open the quick-insert menu. Search by continuing to type, navigate with the arrow keys, and press <kbd>Enter</kbd> to insert the selected block. The menu can create headings, paragraphs, lists, task lists, quotes, tables, code blocks, front matter, thematic breaks, and supported diagram blocks.

For commands that are not visible in the editor, open the titlebar command launcher:

![Inkiva command launcher for searching documents, headings, and commands](../assets/inkiva-command-palette.png)

The paragraph menu also exposes actions such as **Turn Into**, duplicate, create paragraph, and delete paragraph. These actions operate on the current block or selection.

## Markdown formatting

Inkiva follows CommonMark and GitHub Flavored Markdown behavior for the supported syntax. List markers, heading style, indentation, front matter, HTML, footnotes, and other extensions can be configured in [Preferences](PREFERENCES.md). See [Markdown syntax](MARKDOWN_SYNTAX.md) for the rendered feature reference.

## Autocompletion

The editor can close brackets, quotes, and Markdown delimiters as you type. These behaviors are enabled by default and can be configured independently with `autoPairBracket`, `autoPairMarkdownSyntax`, and `autoPairQuote`.

## Tables

Use the quick-insert menu or **Paragraph → Table** to create a Markdown table. Edit its cells directly; use the context menu or the table controls for deliberate row/column operations and alignment. Inkiva is a Markdown editor, not a spreadsheet: selecting content and deleting it is not an implicit request to remove rows or columns. The built-in table editing behavior preserves standard Markdown, Undo/Redo and Source/WYSIWYG round-trips. If you need a hard line break inside a cell, use <kbd>Shift</kbd>+<kbd>Enter</kbd>; the saved Markdown uses an HTML `<br>` break.

![Actual Windows v0.6.0 table-cell context menu showing explicit row/column actions](../assets/inkiva-table-context.png)

The following screenshot captures the live editor immediately after a hard break; **it is not evidence of a completed disk save**. Save and verify the file when testing document persistence.

![Actual Windows v0.6.0 table cell immediately after Shift+Enter with an in-editor hard break and visible caret](../assets/inkiva-table-hardbreak.png)

## Images

Insert standard Markdown images with `![]()`, the image command, drag/drop or paste. Depending on **Preferences → Image**, you can keep a local path, copy assets to a relative folder, or use an optional [PicGo uploader](IMAGE_UPLOADER_CONFIGRATION.md). Existing image controls support replacement/relink, alt/title editing and drag resizing. If an import or replacement fails, the original Markdown should remain available for correction or retry. See [Image support](IMAGES.md) for the complete placement and recovery behavior.

## Links and emoji

**Insert or edit:** select link text and use <kbd>CmdOrCtrl</kbd>+<kbd>K</kbd> to open the existing link dialog. When a folder is open, its eligible Markdown files appear as path-disambiguated suggestions. Choose a candidate with the pointer or arrow keys and <kbd>Enter</kbd>, then confirm. <kbd>Escape</kbd> dismisses suggestions or cancels the dialog without a hidden edit. For a new relative document link, save an untitled document first.

**Navigate:** an ordinary click in an editable link places the caret; it does not automatically follow the destination. To open the link, use <kbd>Ctrl</kbd>+click on Windows or <kbd>Command</kbd>+click on macOS, or the link tool's explicit jump action. A standard relative `.md` or `.markdown` link may include a heading fragment, for example `[Plan](./plan.md#milestones)`. External URLs retain their separate guarded-open behavior.

**Inspect and repair:** open **More → Document Info** to inspect **Backlinks** and broken local document links. Select a backlink to visit its exact source occurrence. For a missing document target, click its row to **locate the source occurrence** (accessible label **Locate source occurrence**), then click the visible **Repair** button to open the **Insert link** dialog. **Cancel** is non-mutating; **Undo** reverses a completed single-document repair. A cancelled repair, inaccessible file or outdated index result must not silently change a Markdown file.

**Rename or move:** file operations and link repair are separate decisions. If Inkiva offers a preview of affected references, review the listed paths and choose **Update**, **Keep unchanged**, or **Cancel**. Keeping or cancelling link repair does **not** roll back a move that already succeeded. Work across multiple files may produce partial results; inspect any reported recovery/conflict details rather than assuming one editor Undo reverses every disk operation.

The inline tools also offer emoji picking and link actions when available.

## Focus and typewriter modes

Focus mode fades surrounding paragraphs so the current line remains prominent. Typewriter mode keeps the active line near the center of the editor. In the default Typora shortcut style, use <kbd>F8</kbd> for focus mode and <kbd>F9</kbd> for typewriter mode. Their commands are also available under **View** and in the command launcher.

## File encoding and line endings

Inkiva can guess a file's encoding when it opens. UTF-8 is the packaged default; the default encoding and automatic detection can be changed in **Preferences → Editor**. The current encoding and line-ending commands are available through the command launcher.

## Find and replace

**Inside the document:** press <kbd>CmdOrCtrl</kbd>+<kbd>F</kbd> to search the current document and use the replace controls when needed.

**Across the opened folder:** open the **Search** sidebar panel to search Markdown files in the current folder. Search settings control exclusions, hidden files, ignore files, symlinks, and the maximum file size.
