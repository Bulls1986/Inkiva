# Interface

## Main interface

![](../assets/inkiva-interface.png)

- Green: titlebar
- Orange: sidebar
- Red: editor with tabs and per-tab notification at the bottom

### Titlebar

The titlebar is located at the top of the window and shows the current opened file path and the menu. macOS uses client-side decorations (CSD); Windows can use either the custom CSD or the native titlebar.

### Sidebar

The sidebar is an optional feature of Inkiva that contains four panels and has a variable width. The first panel is a tree view of the opened root directory; it also hosts a collapsible *Opened Files* subsection (toggle via the `openedFilesInSidebar` preference). The other panels are a folder searcher (find in files) powered by ripgrep, a table of contents of the currently opened document, and Document Info with backlinks and Local History for that document.

### Editor

The editor is the core element that hosts the realtime preview editor called Muya and consists of three parts. Tabs are located at the top and at the bottom the per-tab notification bar is located for events like file changed or deleted. The main part is the editor that is either provided by Muya or CodeMirror for the source-code editor. There are multiple overlays available like inline toolbar, emoji picker, quick insert or image tools.
