# Frequently Asked Questions (FAQ)

### What are the supported platforms?

Inkiva publishes desktop builds for:

- Windows 10 or 11, x64
- macOS 11 (Big Sur) or later, Intel and arm64 (Apple Silicon)

The editor runs on standard Markdown files and does not require an account, cloud service, or project database.

### Is Inkiva open-source and free?

Yes. Inkiva is licensed under the [GPL-3.0-or-later](https://github.com/Bulls1986/Inkiva/blob/develop/LICENSE) license and is free to use. The source code is available on [GitHub](https://github.com/Bulls1986/Inkiva).

### Is Inkiva a knowledge-management app?

Inkiva is a document-first Markdown editor. It understands folders, files, headings, standard links, and local history; it intentionally does not turn your documents into a separate workspace database or require proprietary Markdown syntax.

### How does Inkiva compare with Typora and MarkText?

Inkiva, Typora and MarkText all support in-place Markdown rendering. They differ in license, supported platforms and surrounding workflow. Inkiva is free and GPL-3.0, targets Windows and macOS, and adds document navigation, local history, autosave and crash recovery. Typora is a commercial product with a one-time license and also supports Linux. MarkText is MIT-licensed and supports Linux; it is the upstream project on which Inkiva is based. See the [editor comparison](/compare/typora/) for details and source links.

### Where can I find documentation?

The full documentation is available on the Inkiva website:

- [End-user documentation](../README.md)
- [Developer documentation](../dev/README.md)

### Can I run a portable version of Inkiva?

Yes. See [Portable mode](PORTABLE.md) for details about keeping configuration beside the application.

### How do local links and backlinks work?

Open a folder, select text, and use **Insert/Edit Link** (<kbd>CmdOrCtrl</kbd>+<kbd>K</kbd>). Inkiva can suggest eligible Markdown documents in that folder and inserts ordinary relative links such as `[Guide](./guide.md)`. To follow a link without editing it, use **Ctrl+click** on Windows or **Command+click** on macOS. Find sources linking to the current file under **More → Document Info → Backlinks**. See [Basics](BASICS.md).

### What if a link target is missing?

The Document Info sidebar can show broken relative Markdown document links. Choose **Locate** to inspect the source occurrence; **Repair** opens an explicit link-editing flow to select a replacement. A missing file is different from an unreadable/unverified target, and the report does not validate every heading fragment, external URL or image. Cancel a repair to keep the original Markdown.

### Why has an inserted image disappeared?

Check the Markdown image path and whether its local asset exists relative to the saved document. Select the missing image and use the existing image tool's **Choose Image** action to relink it. Relative image insertion into an untitled document may require saving the Markdown first. See [Image support](IMAGES.md).

### Are my files automatically synchronized or backed up?

No cloud service or account is required. **Local History** and unsaved-work recovery help with local editing mistakes, but they are not a substitute for external backups or cross-device synchronization. Use a backup method you control for important documents.

### How can I report bugs and problems?

Report bugs and problems via the [GitHub issue tracker](https://github.com/Bulls1986/Inkiva/issues). Include your operating system, Inkiva version, steps to reproduce, and a small Markdown fixture when possible.
