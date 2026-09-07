# Portable Mode

Inkiva stores all user configuration inside the [application data directory](APPLICATION_DATA_DIRECTORY.md) that can be changed with `--user-data-dir` command-line flag.

## Linux and Windows

On Linux and Windows you can also create a directory called `inkiva-user-data` to save all user data inside the directory. Like:

```
inkiva-portable/
 ├── inkiva (Linux) or Inkiva.exe (Windows)
 ├── inkiva-user-data/
 ├── resources/
 ├── THIRD-PARTY-LICENSES.txt
 └── ...
```
