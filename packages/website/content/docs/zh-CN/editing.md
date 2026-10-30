# 编辑详解

## 所见即所得与源码

Inkiva 会实时渲染标题、强调、列表、任务列表、表格、代码块和图表；底层仍是普通 Markdown 文本。使用 **View → Source Code Mode** 可以检查精确语法。切换视图不应无故改写文档内容。

选中文字后通过 **Format** 菜单处理加粗、斜体、行内代码和链接。空段落输入 `/` 可打开快速插入，插入标题、列表、引用、表格、代码块、数学公式等。

## Markdown 表格

通过快速插入或 **Paragraph → Table** 创建表格。在单元格内编辑文本，使用表格菜单明确添加、删除行列，或调整对齐。表格不是电子表格；删除选中内容并不等于删除表格结构。

需要单元格内硬换行时使用 **Shift+Enter**，保存的 Markdown 使用 `<br>`。Undo/Redo 与源码往返应保持可预测。

![Windows v0.6.0 英文界面的表格右键菜单实机截图](../assets/inkiva-table-context.png)

![Windows v0.6.0 表格单元格硬换行保存后重开的实机截图](../assets/inkiva-table-hardbreak.png)

实测文件保存后包含 `Alpha<br>Line 2`，应用关闭并重新打开后仍能正确呈现。

## 标准文档链接

选中文字按 `Ctrl+K`（Windows）或 `Command+K`（macOS），在现有链接对话框中输入目标或选择工作区候选文件。候选项通过相对路径区分同名文档；取消不会写入隐藏改动，一次插入对应一次 Undo。

普通点击是编辑操作；使用修饰键单击或显式 Jump 动作才会跟随链接。示例：`[计划](./plan.md#milestones)`。

## 反向链接、断链和重命名

在 **More → Document Info** 查看反向链接和断链报告。对断链点击条目可定位源文本（辅助功能名 **Locate source occurrence**，不是独立的 Locate 文字按钮），再点击 **Repair** 打开 **Insert link** 对话框；取消不改写原文档，确认后按正常链接编辑和 Undo 处理。外部 URL、图片资源和缺失标题片段不等同于该工作区断链检测范围。

移动或重命名文件后，如果提示更新引用，先查看影响范围，再选择 **Update / Keep unchanged / Cancel**。取消引用修复不代表撤销已完成的文件移动；跨文件操作出现部分成功时，应检查恢复记录。

## 图片与恢复

可粘贴、拖入或插入图片；选中图片后可调整替代文本、路径、大小，缺图时可使用 **Choose Image** 重新选择文件。失败的异步导入不应永久留下 `loading-*` 占位符。

详见[图片处理](./images.md)、[快捷键](./key-bindings.md)和[常见问题](./faq.md)。
