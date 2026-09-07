<p align="center"><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a></p>

<p align="center">
  <img src="docs/assets/inkiva-logo.svg" alt="Inkiva" width="120" height="120">
</p>

<h1 align="center">Inkiva · 墨映</h1>

<p align="center">
  <strong>Inkiva（墨映）—— 一款免费、开源的所见即所得 Markdown 编辑器。</strong><br>
  无需离开正在创作的文档，即可编写 Markdown。
</p>

<p align="center">
  <sub>支持 Windows 和 macOS。Linux 支持继承自上游项目，随着 Inkiva 打包流程完善将逐步启用。</sub>
</p>

<p align="center">
  <a href="https://www.inkiva.net">官方网站</a> · <a href="https://github.com/Bulls1986/Inkiva/releases"><img src="https://img.shields.io/github/downloads/Bulls1986/Inkiva/total?label=downloads" alt="下载量"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-blue.svg" alt="GPL-3.0 许可证"></a>
  <a href="https://github.com/Bulls1986/Inkiva"><img src="https://img.shields.io/badge/source-GitHub-181717.svg" alt="GitHub 仓库"></a>
</p>

## Inkiva（墨映）是什么？

Inkiva（墨映）是一款桌面 Markdown 编辑器，专注于平静、流畅的所见即所得写作体验。你可以在编写文档的同时直接看到渲染结果，无需在编辑区和预览区之间来回切换。

Inkiva 适合希望兼具 Markdown 可移植性与可视化编辑即时性的用户：

- 实时所见即所得 Markdown 编辑。
- 支持 CommonMark 和 GitHub Flavored Markdown。
- 使用 KaTeX 渲染数学表达式。
- 支持 Mermaid、PlantUML、Flowchart 和 Vega-Lite 图表。
- 支持专注模式、打字机模式和源码模式。
- 提供主题、语法高亮和可配置快捷键。
- 支持直接粘贴图片及本地图片管理。
- 支持导出 HTML 和 PDF。
- 提供 Windows 和 macOS 原生桌面安装包。

## 下载

从 [GitHub Releases](https://github.com/Bulls1986/Inkiva/releases) 下载最新版本。

| 平台 | 安装包 |
| --- | --- |
| Windows x64 | `inkiva-win-x64-<version>-setup.exe` |
| macOS Intel | `inkiva-mac-x64-<version>.dmg` |
| macOS Apple Silicon | `inkiva-mac-arm64-<version>.dmg` |

Inkiva 目前仍在积极开发中，发布名称和支持的平台可能会随着打包流程演进而调整。

## 从源码构建

环境要求：

- Node.js `>=20.19.0`
- pnpm `>=10`

```bash
git clone https://github.com/Bulls1986/Inkiva.git
cd Inkiva
pnpm install
pnpm run dev
```

常用命令：

```bash
pnpm run build:unpack
pnpm run build:win:x64
pnpm run build:mac:x64
pnpm run build:mac:arm64
pnpm run lint
pnpm run typecheck
pnpm run test:unit
```

## 项目状态

Inkiva 是一个重新品牌化并持续开发中的衍生项目。产品品牌、打包方式、编辑器行为和文档仍可能继续演进，同时会优先保持兼容性和 Markdown 可移植性。

## 致谢

Inkiva 基于并致谢 [MarkText](https://github.com/marktext/marktext)。MarkText 是本项目代码、架构和贡献者工作的上游基础，Inkiva 对原项目及其贡献者表示感谢。

原 MarkText 的版权声明、来源信息以及必要的许可证通知保留在 [NOTICE.md](NOTICE.md) 中，用于保留上游来源并满足通知要求；这不改变 Inkiva 项目整体采用 GPL-3.0 的许可证定位，也不表示 Inkiva 项目延续 MIT 许可证。第三方依赖的许可证信息见 [packages/desktop/build/THIRD-PARTY-LICENSES.txt](packages/desktop/build/THIRD-PARTY-LICENSES.txt)。

## 许可证

Inkiva 项目采用 [GNU General Public License v3.0](LICENSE) 发布。NOTICE.md 中保留的 MarkText 原始许可证通知仅用于上游来源和许可证通知合规，不改变 Inkiva 项目采用 GPL-3.0，也不表示 Inkiva 项目整体采用或延续 MIT 许可证。第三方组件的许可证信息见 [packages/desktop/build/THIRD-PARTY-LICENSES.txt](packages/desktop/build/THIRD-PARTY-LICENSES.txt)。
