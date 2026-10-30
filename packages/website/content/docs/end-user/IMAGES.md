# Image support

Inkiva stores image references as **standard Markdown**. It does not create a proprietary asset database. A typical image looks like `![Diagram](./assets/diagram.png)`, with its path resolved relative to the Markdown document.

## Insert an image

You can use an image command, type the Markdown syntax, paste an image or its path, or drag an image into the editor. When an image is imported, the configured insertion action determines how its file or URL is handled:

- **Copy to a local folder:** store a new local file and insert a portable relative Markdown path where possible.
- **Keep the original location:** preserve a local path without moving that source image. Absolute paths may work on the current computer but are less portable.
- **Upload:** use an explicitly configured [PicGo uploader](IMAGE_UPLOADER_CONFIGRATION.md) when you want a remote image URL.

Configure these options in **Preferences → Image**. A failed save, paste or drop must not leave a permanent `loading-*` placeholder in your document. Try again after correcting write permissions, the destination directory or the selected source.

## Relative asset folders

When relative image placement is enabled, Inkiva can place new images in a folder relative to the document. Common examples are:

- `assets` — a sibling assets directory
- `../assets` — a directory one level above the document
- `.` — the document's current directory
- `assets/123` — a nested directory
- `assets_${filename}` — a name derived from the current document

The destination must be writable. If a saved file needs a relative asset, Inkiva resolves that destination from **that file's directory**, not from the application's working directory. When the document is untitled, a relative image source without a reliable document anchor cannot be resolved: save the Markdown file first or choose an available absolute/local-storage insertion action.

For imported files, Inkiva uses collision-safe creation so repeated pastes of similarly named images do not silently overwrite an existing asset. An image reference is inserted only after its file operation succeeds.

## Edit, resize or repair an image

Select an image in the formatted editor to access its existing image controls. Depending on the selected image, you can change its alternative text/title, replace its source using **Choose Image**, or drag the resize control. A missing image can be selected to open the edit/relink tool.

- To **relink** a missing image, select a valid replacement and confirm. A failed import leaves the original Markdown intact and provides feedback so you can retry.
- Changing only alt text or title does not require re-importing or duplicating an unchanged local file.
- An in-progress replacement should not overwrite a newer edit made while the image operation was running.
- Switch to **View → Source Code Mode** to inspect or edit the exact `![alt](path)` syntax if the visual preview does not resolve.

Images use the normal Markdown history and save/reopen flow. The editor does **not** automatically crawl your disk, delete unused assets or repair image paths across all workspace documents. Workspace **Broken Links** diagnostics are for relative Markdown *document* targets, not missing image files.

## Portability and troubleshooting

If an image is visible on one computer but missing on another, inspect its Markdown path, verify the file was included when you copied the document, and prefer a relative `assets/` folder beside your Markdown when sharing files. If you use cloud-uploaded URLs, their availability depends on the chosen external provider.

For Markdown link/backlink behavior, see [Basics](BASICS.md) and [Editing in depth](EDITING.md).
