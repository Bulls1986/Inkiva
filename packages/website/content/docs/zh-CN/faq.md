# 常见问题

## 支持哪些平台？

Windows 10/11 x64，以及 macOS 11 或更新版本（Intel、Apple Silicon）。Linux 不属于当前正式发布目标。

## 是否免费开源？

是。Inkiva 采用 [GPL-3.0-or-later](https://github.com/Bulls1986/Inkiva/blob/develop/LICENSE)，源代码位于 [GitHub](https://github.com/Bulls1986/Inkiva)。

## 是知识库软件还是 Markdown 编辑器？

它优先是**文档编辑器**。它能够识别文件夹、普通 Markdown 链接、标题和反向链接，但不会要求你迁移进专有工作区数据库。

## 如何创建、打开和修复本地文档链接？

打开文件夹后，使用 `Ctrl+K`（Windows）或 `Command+K`（macOS）插入链接。点击链接时需要修饰键才能跟随，普通点击是编辑操作。在 **More → Document Info** 中查看 Backlinks 或断链；先 **Locate** 后 **Repair**，取消修复时不改写源文件。

## 图片显示不出来怎么办？

检查 Markdown 图片相对路径及资源是否随文档一起复制。使用现有图片编辑控件 **Choose Image** 重新选择图片；详见[图片处理](./images.md)。

## 自动保存是不是云备份？

不是。自动保存、Local History 和崩溃恢复都不能替代独立备份或跨设备同步。

## 升级、问题反馈和文档

下载最新版本请访问 [Releases](https://github.com/Bulls1986/Inkiva/releases/latest)；反馈问题请使用 [Issues](https://github.com/Bulls1986/Inkiva/issues)。查阅[基础操作](./basics.md)或[英文完整 FAQ](https://www.inkiva.net/docs/faq/)。
