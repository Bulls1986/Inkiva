# Installation

Inkiva is a free, open-source Markdown editor for Windows x64 and macOS on Intel or Apple silicon. Pre-built binaries are published with every stable release on [GitHub Releases](https://github.com/Bulls1986/Inkiva/releases/latest).

## Windows x64

| Artifact | When to choose |
| --- | --- |
| `inkiva-win-x64-<version>-setup.exe` | Recommended NSIS installer. It creates Start Menu and Desktop shortcuts and registers Markdown files. |
| `inkiva-win-x64-<version>.zip` | Portable zip. Extract anywhere and run `inkiva.exe`. See [Portable mode](PORTABLE.md). |

## macOS

| Artifact | When to choose |
| --- | --- |
| `inkiva-mac-arm64-<version>.dmg` | Apple Silicon Macs (M-series). |
| `inkiva-mac-x64-<version>.dmg` | Intel Macs. |
| `inkiva-mac-<arch>-<version>.zip` | Plain zip alternative to the DMG. |

Open the DMG and drag Inkiva into your **Applications** folder. Builds are not currently notarized, so the first launch may prompt Gatekeeper; right-click the app and choose **Open** once.

You can also install the macOS build with Homebrew Cask:

```sh
brew install --cask inkiva
```

## Verify the download

Every stable release publishes SHA-512 updater metadata for Windows and macOS. The release page also contains `SHA256SUMS.txt` for the complete artifact set.

```sh
# macOS example
shasum -a 512 inkiva-mac-arm64-<version>.dmg
```

Compare the result with the matching artifact entry in `latest-mac.yml` on the release page. For Windows, use PowerShell:

```powershell
Get-FileHash .\inkiva-win-x64-<version>-setup.exe -Algorithm SHA512
```

## Build from source

If you want to track `develop`, contribute, or build locally, see the [Build instructions](../dev/BUILD.md):

```sh
git clone https://github.com/Bulls1986/Inkiva.git
cd inkiva
pnpm install
pnpm run build
```

Output installers land in the repository's `dist/` folder.

## Updating

Inkiva checks for updates on launch. When an update is published, the app downloads it in the background and installs it on the next restart. Portable installs must be updated by downloading the new zip.

## Uninstall

| Platform | How |
| --- | --- |
| Windows | **Settings → Apps**, or run the bundled `Uninstall Inkiva.exe`. |
| macOS | Drag **Inkiva.app** to the Trash. Optionally also remove `~/Library/Application Support/inkiva`. |

To remove Inkiva's user data as well, see the [application data directory](APPLICATION_DATA_DIRECTORY.md).
