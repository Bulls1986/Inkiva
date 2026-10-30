# 偏好设置

在应用的 **Preferences（偏好设置）** 窗口中配置一般行为、编辑器、Markdown、外观、拼写和图片选项。部分高级设置保存在用户数据目录中的 `preferences.json`；升级后如果界面表现与默认值不同，应先检查自己的配置。

## 常用项目

- **General**：自动保存、自动保存延迟、打开文件与文件夹的方式。
- **Editor**：字体、字号、行高与阅读宽度。
- **Markdown**：格式化及渲染相关选项。
- **Theme / Appearance**：Inkiva Light、Dark、Paper 与跟随系统外观。
- **Spelling**：拼写检查语言与下划线显示。
- **Image**：图片复制/引用方式、相对资源目录和 PicGo 上传。

## 配置文件

用户数据目录见[应用数据位置](./application-data-directory.md)。不要直接复制过时版本的 `preferences.json` 覆盖新版本配置。具体字段名、数据类型和默认值以当前版本的 [英文完整偏好设置表](https://www.inkiva.net/docs/preferences/) 和 `packages/desktop/src/main/preferences/schema.json` 为准。

![外观设置中的三种主题预览](../assets/inkiva-settings-theme.png)
