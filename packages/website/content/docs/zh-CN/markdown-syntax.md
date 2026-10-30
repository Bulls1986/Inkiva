# Markdown 语法速查

Inkiva 支持 CommonMark 和 GitHub Flavored Markdown（GFM），文档始终保存为普通 Markdown。

## 标题与强调

`#` 到 `######` 分别表示一至六级标题；`**加粗**`、`*斜体*`、`~~删除线~~` 表示文字强调。

~~~markdown
# 文档标题
## 小节
**加粗**、*斜体*、~~删除线~~
~~~

## 列表、任务与引用

无序列表使用 `-`，有序列表使用 `1.`，任务列表使用 `- [ ]` 和 `- [x]`，引用使用 `>`。

~~~markdown
- 一个条目
- [x] 已完成
> 引用内容
~~~

## 标准链接和图片

~~~markdown
[项目计划](./plan.md)
[同一文档的标题](#标题与强调)
![示意图](./assets/diagram.png)
~~~

相对链接按所在 Markdown 文件的位置解析；其路径不依赖 Inkiva 的专有工作区格式。

## 表格、代码与数学

GFM 表格使用 `|` 与分隔行；代码块使用三个反引号包围，可声明语言进行语法高亮。行内数学及独立数学块可通过编辑器相应命令录入，由 KaTeX 渲染。

单元格内的 **Shift+Enter** 硬换行可以保存为 HTML `<br>`。Inkiva 也可渲染 Mermaid、PlantUML、Flowchart 和 Vega-Lite 等图表。

完整语法示例和不常用扩展请查阅[英文 Markdown 语法参考](https://www.inkiva.net/docs/markdown-syntax/)。
