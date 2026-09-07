# Linux Installation Instructions

## AppImage

[Download the AppImage](https://github.com/Bulls1986/Inkiva/releases/latest) and type the following:

1. `chmod +x inkiva-%version%-x86_64.AppImage`
2. `./inkiva-%version%-x86_64.AppImage`
3. Now you can execute Inkiva.

### Installation

You cannot really install an AppImage. It's a file which can run directly after getting executable permission. To integrate it into desktop environment, you can either create desktop entry manually **or** use [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher).

#### Desktop file creation

See [example desktop file](https://github.com/Bulls1986/Inkiva/blob/develop/resources/linux/inkiva.desktop).

```bash
$ curl -L https://raw.githubusercontent.com/Bulls1986/Inkiva/develop/resources/linux/inkiva.desktop -o $HOME/.local/share/applications/inkiva.desktop

# Update the Exec in desktop file to your real inkiva command. Specify Path if necessary.
$ vim $HOME/.local/share/applications/inkiva.desktop

$ update-desktop-database $HOME/.local/share/applications/
```

#### AppImageLauncher integration

You can integrate the AppImage into the system via [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher). It will handle the desktop entry automatically.

### Uninstallation

1. Delete AppImage file.
2. Delete your desktop file if exists.
3. Delete your user settings: `~/.config/inkiva`

### Custom launch script

1. Save AppImage somewhere. Let's say `~/bin/inkiva.AppImage`
2. `chmod +x ~/bin/inkiva.AppImage`
3. Create a launch script:

   ```sh
   #!/bin/bash
   DESKTOPINTEGRATION=0 ~/bin/inkiva.AppImage
   ```

### Known issues

- Inkiva is always integrated into desktop environment after updating

## Binary

You can download the latest `inkiva-%version%.tar.gz` package from the [release page](https://github.com/Bulls1986/Inkiva/releases/latest). You may need to install electron dependencies.

## Arch User Repository

Inkiva is available on the AUR as `inkiva-bin` and will automatically install the dependencies: `glibc`, `gtk3`, `nss`, `alsa-lib`, `libxss`, `cups`, `libxkbcommon`, `libxkbfile`, `mesa`, and `hicolor-icon-theme`.

Install it via an AUR helper like `yay -S inkiva-bin` or with

```bash
git clone https://aur.archlinux.org/inkiva.git
cd inkiva-bin
makepkg -si
```

Note: The AUR package is not maintained by the maintainer of this repository and may be out of date. Take note of the version numbers and modify the PKGBUILD on the AUR as necessary before installation or update.
