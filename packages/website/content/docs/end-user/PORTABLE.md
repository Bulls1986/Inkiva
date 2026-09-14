# Portable Mode

Inkiva stores all user configuration inside the [application data directory](APPLICATION_DATA_DIRECTORY.md) that can be changed with `--user-data-dir` command-line flag.

## Windows

On Windows you can also create a directory called `inkiva-user-data` to save all user data inside the application directory:

```
inkiva-portable/
 ├── Inkiva.exe
 ├── inkiva-user-data/
 ├── resources/
 ├── THIRD-PARTY-LICENSES.txt
 └── ...
```
