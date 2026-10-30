# 应用数据目录

Inkiva 将每位用户的偏好设置和其他应用数据存放在系统用户目录中：

- **Windows**：`%APPDATA%\\inkiva`
- **macOS**：`~/Library/Application Support/inkiva`

若通过命令行参数 `--user-data-dir` 指定了其他目录，以该路径为准。Windows 的[便携模式](./portable.md)还可使用应用附近的 `inkiva-user-data` 目录。

**不要把应用数据目录与 Markdown 文档目录混为一谈**：用户文档仍是你自行保存的普通本地文件。重要资料应独立备份。
