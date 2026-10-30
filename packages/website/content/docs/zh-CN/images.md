# 图片插入与恢复

Inkiva 的图片地址以普通 Markdown 保存，例如 `![图示](./assets/diagram.png)`。图片文件不进入专有资源数据库。

## 插入图片

可粘贴图片、拖放到编辑器、输入 Markdown 图片语法或调用图片命令。通过 **Preferences → Image** 选择：

- **复制到本地目录**：创建新的资源文件，再插入相对于当前文档的路径。
- **保留原路径**：只引用原文件；绝对路径在其他电脑上通常不可移植。
- **PicGo 上传**：需要先配置外部 PicGo 工具，具体见[图片上传配置](./image-uploader.md)。

## 相对目录

`assets` 表示当前文档旁的资源目录，`../assets` 表示上一级目录，`.` 表示当前目录，`assets_${filename}` 会根据文档文件名生成目录名。

图片的相对路径基于**已保存的 Markdown 文件所在目录**计算，不会偷偷基于应用程序工作目录。未保存的新文档如果没有可靠路径锚点，需要先保存文档或选择其他明确的插入方式。

导入使用防覆盖策略，同名反复粘贴不应覆盖已存在资源；只有实际文件写入成功后才应生成对应 Markdown 引用。

## 替换、缩放和缺图处理

选择可视编辑器中的图片，使用已有控件修改替代文字/标题、拖动缩放控制条或通过 **Choose Image** 更换源文件。图片加载失败时，可点击失败图片，切换到 **Embed Image** 输入框填写新的本地相对路径并确认。

![Windows v0.6.0 图片加载失败及 Embed Image 重连入口](../assets/inkiva-image-failure.png)

![重新指向有效本地图片后的实机截图](../assets/inkiva-image-relinked.png)

实测将 `./missing.png` 改为 `./correct.png` 后，图片状态变为加载成功，且 Markdown 保存了新路径。

导入失败应保留原始 Markdown，避免留下永久 `loading-*` 占位符；在进行中的替换操作不应覆盖后续用户的编辑。

**注意：Document Info 的工作区断链检查主要验证相对 Markdown 文档链接，不会全面扫描或自动删除缺失的图片资源。**

参阅[图片编辑教程（英文原文）](https://www.inkiva.net/docs/images/)。
