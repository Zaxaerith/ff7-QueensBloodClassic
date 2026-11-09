# Third-party notices

The project code in this repository is licensed under GPL-3.0-only; see [LICENSE](LICENSE). This license does not grant rights to third-party game files, characters, names, or artwork. This is an unofficial fan project and is not affiliated with or endorsed by Square Enix.

## Source references and adaptations

- [GaiaGIS](https://github.com/Zaxaerith/ff7-GaiaGIS), revision `dac37e4f1bed256629488fecec2537ee381d3ebe`, is GPL-3.0-only. The LGP, TEX, LZSS, world-format, and field-model reader files in `tools/ff7_assets/` retain attribution and SPDX notices. No map viewer or complete GaiaGIS application is included.
- [KimeraCS](https://github.com/LaZar00/KimeraCS), revision `f33fd07d867eeb8acb6ca9275c105909bd72bcc5`, is GPL-3.0-licensed. Its Battle skeleton and animation formats were used as factual cross-checks; no complete application or copied runtime is included.
- [FF7 LGP Explorer](https://github.com/maciej-trebacz/ff7-lgp-explorer), revision `6c6338a3feba0e2b65f4f6cab5dd648cf6aed336`, declares MIT. Its format documentation was used as a reference; no complete application is included.
- [Final Fantasy Inside format documentation](https://wiki.ffrtt.ru/index.php/FF7/Kernel/Low_level_libraries) and its [PC Battle animation page](https://wiki.ffrtt.ru/index.php/FF7/Battle/Battle_Animation_(PC)) are factual format references.

## Python runtime and build dependencies

Python package dependencies are pinned in `tools/requirements-art.txt`, `desktop/requirements.txt`, and `desktop/requirements-build.txt`. These packages remain under their own licenses. The Windows build copies applicable license and notice files from the installed distributions into the package.

The desktop runtime uses pywebview (BSD-3-Clause), pythonnet (MIT), clr_loader (MIT), cffi (MIT-0), pycparser (BSD-3-Clause), Bottle (MIT), proxy_tools (MIT), typing_extensions (PSF-2.0), and Pillow (MIT-CMU). Versions are listed in the corresponding requirements files and in portable-package metadata.

PyInstaller's bootloader is GPL-2.0-or-later with the Bootloader Distribution Exception; its license text is included in the Windows package. Build-only tools and their notices are recorded in `desktop/requirements-build.txt` and copied from their distributions where applicable.

The CPython runtime retains the Python Software Foundation license and applicable Microsoft notices. The WebView2 SDK license and notice are in `desktop/licenses/`. The WebView2 Runtime and .NET components are Windows prerequisites and are not installed by this project.

No FF7 game archive, extracted model or texture, Rebirth reference image, or generated private Art Pack is included in the source tree or normal Web build. Users supply their own game data and keep generated packs locally.
