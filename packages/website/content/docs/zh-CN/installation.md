# 安装 Inkiva

正式版安装包发布在 [GitHub Releases](https://github.com/Bulls1986/Inkiva/releases/latest)。支持 Windows x64、macOS Intel 和 macOS Apple Silicon；没有正式 Linux 安装包。

## Windows

- 常规安装：下载 `inkiva-win-x64-<version>-setup.exe`，运行安装程序。
- 便携使用：下载 `inkiva-win-x64-<version>.zip`，解压后运行 Inkiva；参阅[便携模式](./portable.md)。

## macOS

- Apple Silicon（M 系列芯片）选择 `inkiva-mac-arm64-<version>.dmg`。
- Intel 芯片选择 `inkiva-mac-x64-<version>.dmg`。
- 打开 DMG，将 Inkiva 拖进 Applications（应用程序）目录；也可以选择相应架构的 ZIP 文件。
- 当前发布包尚未完成 Apple 公证。系统首次拦截时，可通过 Finder 右键应用选择“打开”，并核实下载来源。

## 下载校验与升级

在对应版本发布页查找 `SHA256SUMS.txt`，校验安装包摘要是否匹配。不要只根据文件名判断安装包真伪。

升级前保存并备份正在编辑的文档。可使用应用内更新检查或手动下载新版；更新不应改变普通 Markdown 文件格式。针对已安装旧版直接升级的完整实机矩阵尚未被声明为全部通过。

完整安装、卸载、校验命令参考[英文安装说明](https://www.inkiva.net/docs/installation/)。
