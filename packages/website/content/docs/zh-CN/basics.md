# 基础操作

## 打开文件和文件夹

首次启动时可使用 **Recent Documents（最近文档）**、**New File（新建文件）** 或 **Open File（打开文件）**。通过文件菜单打开本地 `.md` / `.markdown` 文件，或者打开一个包含多个 Markdown 文件的文件夹。

打开文件夹后，左侧 **Files（文件）** 显示目录树；**Search（搜索）** 用来查找文件夹内容；**Outline（大纲）** 显示当前文档的标题；**More → Document Info（文档信息）** 提供反向链接和本地历史。

![Windows v0.6.0 英文界面的文档、标签页与大纲侧栏实机截图](../assets/inkiva-interface.png)

命令搜索请使用 **View → Command Palette**；不要寻找旧版顶部搜索框。

![Windows v0.6.0 命令面板实机截图](../assets/inkiva-command-palette.png)

## 编辑与保存

所见即所得编辑区直接接受文字输入。按 `/` 可在空段落中打开快速插入菜单；**View → Source Code Mode** 用来查看或修改 Markdown 原始文本。普通点击 Markdown 链接只定位光标，不会直接跳转。

Inkiva 提供自动保存和恢复保护，但退出应用、恢复旧版本或将文件移动到其他设备前，仍建议确认保存状态并保留独立备份。

## 标题导航和文档信息

**Outline** 的键盘焦点属于大纲树容器，不是虚拟化的单个标题行。实测 360 个标题时，End 和上方向键只改变大纲焦点，不移动正文；按 Enter 才跳转。

![360 标题大纲定位末尾、正文不跳转](../assets/inkiva-outline-keyboard.png)

![按 Enter 跳转到目标标题](../assets/inkiva-outline-activated.png)

**More → Document Info → Backlinks** 会显示指向当前文档的反向链接，包括已保存、但没有打开为标签页的工作区 Markdown 文件。

同一面板的断链检测可以识别工作区内找不到目标文件的相对 `.md` / `.markdown` 链接。点击断链条目可定位源链接（无独立的 Locate 文字按钮，其辅助功能名称为 **Locate source occurrence**）；点击可见的 **Repair** 按钮后打开 **Insert link** 对话框。确认前不会自动替换，选择 **Cancel** 不修改原文档。

![Windows v0.6.0 英文界面的断链 Repair 对话框实机截图](../assets/inkiva-broken-link-repair.png)

无法读取的文件与确定不存在的文件应区别对待。

## 文件链接

选中文字后按 Windows `Ctrl+K` 或 macOS `Command+K` 打开链接编辑器。工作区中的 Markdown 文件会作为候选，保存的是标准相对链接，例如 `[说明](./guide.md)`。新建且未保存的文档应先保存，再生成相对文件链接。

跳转链接使用 Windows **Ctrl+单击**、macOS **Command+单击**，或链接工具提供的显式跳转操作。

下一步阅读[编辑详解](./editing.md)和[图片处理](./images.md)。
