# Application Data Directory

The per-user application data directory is located in the following directory:

- `%APPDATA%\inkiva` on Windows
- `$XDG_CONFIG_HOME/inkiva` or `~/.config/inkiva` on Linux
- `~/Library/Application Support/inkiva` on macOS

When [portable mode](PORTABLE.md) is enabled, the directory location is either the `--user-data-dir` parameter or `inkiva-user-data` directory.
