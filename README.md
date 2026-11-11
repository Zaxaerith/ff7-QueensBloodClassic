# Queen's Blood Classic

[简体中文](README.zh-CN.md)

An unofficial, open-source single-player Queen's Blood game for Final Fantasy VII fans. This is a **source-only preview**: there is no accepted Windows binary release yet. It includes a 3×5 board, configurable Bot, deck editor, mulligan, saved matches, replays, analysis, and candidate local generation for all 145 Classic Art routes.

## Play

- **Windows:** No accepted Windows binary is available in this Source-only Preview. The desktop build is still being validated; do not expect an EXE in this release.
- **Web:** Install Node.js 22.12 or newer, run `npm ci` and `npm run dev`, then open the local URL printed by Vite. The normal Web build contains no generated/private card art.

## Classic Art

The repository includes the 145-card recipes and local import tools. It does not include FF7 game archives, extracted models or textures, or generated/private card images. Provide your own lawfully obtained FF7 Original PC game data, then use **Generate Art Pack** in the Windows app or run `python tools/qb-assets.py inspect --source <game-data-folder>`. To generate the pack, install Python 3.11+ and Pillow with `python -m pip install -r tools/requirements-art.txt`, then follow [the local generator guide](docs/LOCAL_ART_GENERATOR.md). Import the generated private pack in the desktop app or browser. Keep the original files and generated art on your own device.

## Build and test

For the Web game, run `npm ci`, `npm run check`, `npm test`, and `npm run build`. For the Windows app, see [desktop build instructions](desktop/README.md). Maintainers build and publish Windows packages through the [cloud release workflow](docs/CLOUD_RELEASE.md); do not use a local ZIP as a release asset. WebView2 Runtime is installed separately on Windows.

## Current limits

Card #134 has an executable candidate J-Squad rule, but its accuracy to the original game has not been fully verified; some complex rule implementations remain candidates; and card art can still be refined. No Windows binary has passed acceptance or independent clean-VM compatibility testing.

## License

The project source is GPL-3.0-only. See [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md). This is an unofficial fan project, not affiliated with or endorsed by Square Enix. Final Fantasy VII and related names and materials belong to their respective owners. GPL covers this repository's source and does not grant rights to third-party game assets or characters.
