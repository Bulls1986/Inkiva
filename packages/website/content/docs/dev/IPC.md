# Inter-Process Communication (IPC)

The desktop renderer is sandboxed. All privileged renderer-to-main operations must cross the typed preload bridge; renderer code must not import Electron main-process APIs directly.

## Security boundary

The BrowserWindow configuration in **packages/desktop/src/main/config.ts** enables context isolation and sandboxing and disables Node integration. The preload entrypoint is **packages/desktop/src/preload/index.ts** and exposes narrow APIs through contextBridge.

Do not weaken these settings to make a feature or test easier. Add the required capability to the preload boundary instead.

## Contract owners

- **packages/desktop/src/shared/types/ipc.ts** — channel maps and cross-process argument/return contracts.
- **packages/desktop/src/main/ipc/** — main-process handlers and registration.
- **packages/desktop/src/preload/index.ts** — renderer-facing bridge and domain facades.
- **packages/desktop/src/renderer/** — consumers of the exposed APIs.

## Channel categories

| Type | Direction | Semantics |
|---|---|---|
| IpcInvokeChannels | renderer → main | Promise-based request/response through ipcMain.handle |
| IpcSendChannels | renderer → main | fire-and-forget message through ipcMain.on |
| IpcSyncChannels | renderer → main | synchronous request; avoid adding new uses |
| IpcMainEventChannels | main → renderer | main-process event pushed to a renderer |

Most channels use the **mt::** prefix. A small number of legacy internal channels retain older names; do not rename them without checking all senders, handlers and listeners.

## Renderer-side usage

Use the typed wrapper exposed by the preload bridge:

~~~ts
const stat = await window.electron.ipcRenderer.invoke('mt::fs::stat', fullPath)

window.electron.ipcRenderer.send('mt::format-link-click', {
  data,
  dirname
})

const off = window.electron.ipcRenderer.on('mt::screenshot-captured', () => {
  // Handle the event.
})
~~~

The wrapper checks registered channel names and declared call signatures. Do not assume every legacy payload has a deeply strict type: some channel argument and return values intentionally remain **unknown** or broad while the migration is incomplete. ARCH-02 records the migrated slice and the remaining boundary debt.

## Domain APIs

Prefer a narrow domain API when preload already exposes one rather than adding raw IPC calls to UI components. Current preload facades include document intelligence, file utilities, path helpers, ripgrep/search, image upload and font access. For example, workspace/document-intelligence operations are exposed through **window.documentIntelligence**.

Keep filesystem and Electron implementation details in the main process. The renderer should request a user-level operation, not construct privileged paths or call Node APIs directly.

## Adding a channel

1. Define the channel name, argument tuple and return/event payload in **packages/desktop/src/shared/types/ipc.ts**.
2. Implement the main-side handler under **packages/desktop/src/main/ipc/** and register it through the existing IPC registration path.
3. Expose a narrow method through preload when a domain facade is appropriate; avoid spreading raw IPC calls across components.
4. Add focused tests for the contract and its failure/cleanup behavior.
5. Run the relevant typecheck and test gate. See [Testing](https://github.com/Bulls1986/Inkiva/blob/develop/docs/agent/TESTING.md) and [ARCH-02](https://github.com/Bulls1986/Inkiva/blob/develop/docs/architecture/ARCH-02-IPC-CONTRACT.md).
