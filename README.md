<p align="center"><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文（墨映）</a></p>

<p align="center">
  <img src="docs/assets/inkiva-logo.svg" alt="Inkiva" width="120" height="120">
</p>

<h1 align="center">Inkiva</h1>

<p align="center">
  <strong>Inkiva — A free, open-source WYSIWYG Markdown editor.</strong><br>
  Write in Markdown without leaving the document you are creating.
</p>

<p align="center">
  <sub>Available for Windows and macOS. Linux support remains available in the upstream project and can be enabled as the Inkiva packaging matures.</sub>
</p>

<p align="center">
  <a href="https://www.inkiva.net">Website</a> · <a href="https://github.com/Bulls1986/Inkiva/releases"><img src="https://img.shields.io/github/downloads/Bulls1986/Inkiva/total?label=downloads" alt="Downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-blue.svg" alt="GPL-3.0 license"></a>
  <a href="https://github.com/Bulls1986/Inkiva"><img src="https://img.shields.io/badge/source-GitHub-181717.svg" alt="GitHub repository"></a>
</p>

## What is Inkiva?

Inkiva is a desktop Markdown editor built around a calm, WYSIWYG writing experience. The rendered document stays in view while you write, so headings, emphasis, links, lists, tables and code blocks are easier to compose and review.

Inkiva is designed for people who want the portability of Markdown with the immediacy of a visual editor:

- Realtime WYSIWYG Markdown editing.
- CommonMark and GitHub Flavored Markdown support.
- Math expressions with KaTeX.
- Mermaid, PlantUML, flowchart and Vega-Lite diagrams.
- Focus mode, typewriter mode and source-code mode.
- Themes, syntax highlighting and configurable keyboard shortcuts.
- Direct image paste and local image management.
- Export to HTML and PDF.
- Native desktop packages for Windows and macOS.

## Download

Download the latest builds from [GitHub Releases](https://github.com/Bulls1986/Inkiva/releases).

| Platform | Package |
| --- | --- |
| Windows x64 | `inkiva-win-x64-<version>-setup.exe` |
| macOS Intel | `inkiva-mac-x64-<version>.dmg` |
| macOS Apple Silicon | `inkiva-mac-arm64-<version>.dmg` |

Inkiva is currently in active development. Release names and supported platforms may change as the packaging workflow evolves.

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

