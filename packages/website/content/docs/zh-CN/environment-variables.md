# 环境变量

Inkiva 提供少量环境变量用于排查问题或覆盖部分工具路径。一般用户通常不需要设置这些参数。

| 变量 | 用途 |
| --- | --- |
| `INKIVA_DEBUG` | 启用调试模式 |
| `INKIVA_DEBUG_KEYBOARD` | 调试时显示更详细的按键信息 |
| `INKIVA_ERROR_INTERACTION` | 不显示错误反馈对话框 |
| `INKIVA_PANDOC` | 覆盖 Pandoc 可执行文件路径 |
| `INKIVA_RIPGREP_PATH` | 覆盖内置 ripgrep 程序位置 |

开发环境还包含 `INKIVA_EXIT_ON_ERROR` 等变量；`INKIVA_IS_STABLE` 属于内部发布识别用途，普通用户不要自行设置。

详见[英文环境变量说明](https://www.inkiva.net/docs/environment-variables/)。
