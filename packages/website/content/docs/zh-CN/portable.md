# 便携模式

Inkiva 可以通过 `--user-data-dir` 命令行参数指定应用用户数据的存放目录。

在 Windows 便携目录中，也可以在应用程序旁创建 `inkiva-user-data` 文件夹，让配置数据与便携应用放在一起：

~~~text
inkiva-portable/
├── Inkiva.exe
├── inkiva-user-data/
├── resources/
└── ...
~~~

便携模式改变应用配置存储的位置，并不自动复制或同步正在编辑的 Markdown 文档。重要文件仍需自行备份。

参阅[应用数据目录](./application-data-directory.md)和[英文便携模式说明](https://www.inkiva.net/docs/portable/)。
