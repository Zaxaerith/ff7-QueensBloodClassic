# Queen's Blood Classic

[简体中文](README.zh-CN.md)

An unofficial, open-source single-player Queen's Blood game for Final Fantasy VII fans. It includes a 3×5 board, configurable Bot, deck editor, mulligan, saved matches, replays, analysis, and a local generator for all 145 Classic Art routes.

## Play

- **Windows portable preview:** Download the `v0.8.0-rc.2` ZIP from [GitHub Releases](https://github.com/Zaxaerith/ff7-QueensBloodClassic/releases), extract the complete folder, then start `QueensBloodClassic.exe`. Microsoft Edge WebView2 Runtime is required. This preview has not been tested in a clean Windows virtual machine.
- **Web:** Install Node.js 22.12 or newer, run `npm ci` and `npm run dev`, then open the local URL printed by Vite. The normal Web build contains no generated/private card art.

## Classic Art

The repository includes the 145-card recipes and local import tools. It does not include FF7 game archives, extracted models or textures, or generated/private card images. Provide your own lawfully obtained FF7 Original PC game data, then use **Generate Art Pack** in the Windows app or run `python tools/qb-assets.py inspect --source <game-data-folder>`. To generate the pack, install Python 3.11+ and Pillow with `python -m pip install -r tools/requirements-art.txt`, then follow [the local generator guide](docs/LOCAL_ART_GENERATOR.md). Import the generated private pack in the desktop app or browser. Keep the original files and generated art on your own device.

## Build and test

For the Web game, run `npm ci`, `npm run check`, `npm test`, and `npm run build`. For the Windows app, see [desktop build instructions](desktop/README.md). WebView2 Runtime is installed separately on Windows.

## Current limits

Card #134's J-Squad rule is unfinished; some complex rule implementations remain candidates; and card art can still be refined. The Windows preview has not had an independent clean-VM compatibility test.

## License

The project source is GPL-3.0-only. See [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md). This is an unofficial fan project, not affiliated with or endorsed by Square Enix. Final Fantasy VII and related names and materials belong to their respective owners. GPL covers this repository's source and does not grant rights to third-party game assets or characters.
