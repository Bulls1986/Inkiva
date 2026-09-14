<p align="center"><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文（墨映）</a></p>

<p align="center">
  <img src="docs/assets/inkiva-logo.svg" alt="Inkiva" width="120" height="120">
</p>

<h1 align="center">Inkiva</h1>

<p align="center">
  <strong>Inkiva — A free, open-source, document-first Markdown editor.</strong><br>
  Write in Markdown while the document stays visible.
</p>

<p align="center">
  <sub>Available for Windows x64 and macOS Intel or Apple Silicon.</sub>
</p>

<p align="center">
  <a href="https://www.inkiva.net">Website</a> · <a href="https://github.com/Bulls1986/Inkiva/releases"><img src="https://img.shields.io/github/downloads/Bulls1986/Inkiva/total?label=downloads" alt="Downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-blue.svg" alt="GPL-3.0 license"></a>
  <a href="https://github.com/Bulls1986/Inkiva"><img src="https://img.shields.io/badge/source-GitHub-181717.svg" alt="GitHub repository"></a>
</p>

## What is Inkiva?

Inkiva is a desktop Markdown editor built around a calm, document-first writing experience. The rendered document stays in view while you write, so headings, emphasis, links, lists, tables and code blocks are easier to compose and review. When comparison helps, an optional second pane keeps another document close without changing the files themselves.

Inkiva is designed for people who want the portability of Markdown with the immediacy of a visual editor:

- Realtime WYSIWYG Markdown editing.
- CommonMark and GitHub Flavored Markdown support.
- Recent documents, Quick Open, tabs, outlines, find/replace and folder search.
- Standard relative Markdown links with backlinks and explicit rename/move repair choices.
- Local history snapshots, autosave, recovery protection and updater checks.
- Math expressions with KaTeX.
- Mermaid, PlantUML, flowchart and Vega-Lite diagrams.
- Focus mode, typewriter mode and source-code mode.
- Themes, syntax highlighting and configurable keyboard shortcuts.
- Direct image paste and local image management.
- Export to HTML and PDF.
- Native desktop packages for Windows and macOS.

## Download

Download the latest builds from [GitHub Releases](https://github.com/Bulls1986/Inkiva/releases).

| Platform            | Package                              |
| ------------------- | ------------------------------------ |
| Windows x64         | `inkiva-win-x64-<version>-setup.exe` |
| macOS Intel         | `inkiva-mac-x64-<version>.dmg`       |
| macOS Apple Silicon | `inkiva-mac-arm64-<version>.dmg`     |

Inkiva is currently in active development. The supported release targets are intentionally limited to Windows x64 and macOS Intel/Apple Silicon while packaging and updater contracts mature.

## Build from source

Requirements:

- Node.js `>=20.19.0`
- pnpm `>=10`

```bash
git clone https://github.com/Bulls1986/Inkiva.git
cd Inkiva
pnpm install
pnpm run dev
```

Useful commands:

```bash
pnpm run build:unpack
pnpm run build:win:x64
pnpm run build:mac:x64
pnpm run build:mac:arm64
pnpm run lint
pnpm run typecheck
pnpm run test:unit
```

## Project status

Inkiva is a rebranded and actively developed derivative project. Product branding, packaging, editor behavior and documentation may continue to evolve while compatibility and Markdown portability remain priorities.

## Acknowledgements

Inkiva is based on and gratefully acknowledges [MarkText](https://github.com/marktext/marktext), the original open-source Markdown editor whose code, architecture and contributor work form the upstream foundation for this project.

The original MarkText copyright, source attribution and required license notice are retained in [NOTICE.md](NOTICE.md). This preserves the upstream provenance and notice requirements without changing Inkiva's project-level license to MIT. Third-party package notices are available in [`packages/desktop/build/THIRD-PARTY-LICENSES.txt`](packages/desktop/build/THIRD-PARTY-LICENSES.txt).

## License

Inkiva project-level work is distributed under the [GNU General Public License v3.0](LICENSE). MarkText copyright, source attribution and required license notices are retained in [NOTICE.md](NOTICE.md); retaining them does not make MIT the project-level license of Inkiva. Third-party package notices are listed in [`packages/desktop/build/THIRD-PARTY-LICENSES.txt`](packages/desktop/build/THIRD-PARTY-LICENSES.txt).
