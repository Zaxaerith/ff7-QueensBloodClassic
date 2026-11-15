# Queen's Blood Classic

[简体中文](README.zh-CN.md)

An unofficial, open-source single-player Queen's Blood game for Final Fantasy VII fans. This is a **source-only preview**: no Windows binary has passed acceptance. The game includes a 3×5 board, configurable Bot, deck editor, mulligan, saved matches, replays, analysis, and candidate local generation routes for all 145 Classic Art cards.

## M7 update

- New-match and restart flows protect the existing save when writing a replacement save fails.
- After a match ends, returning home lets you reopen the result and start a rematch without archiving the same match twice.
- A local private art baseline for all 145 cards has been accepted by the maintainer. Its images and private pack are not included here. The public generator is not claimed to reproduce every refinement in that private baseline.
- An internal 145-card rule-evidence ledger has been prepared, but it does not establish every rule from original-game evidence. #066 Two Face feedback behavior and #134 J-Squad derived strength, among other complex details, remain to be verified.

## Play

- **Windows:** No accepted Windows binary is available in this preview. The desktop build is not included; do not expect an EXE.
- **Web:** Install Node.js 22.12 or newer, run `npm ci` and `npm run dev`, then open the local URL printed by Vite. The normal Web build contains no generated/private card art.

## Classic Art

The repository includes candidate recipes and local import tools for 145 cards. It does not include FF7 game archives, extracted models or textures, or generated/private card images. Provide your own lawfully obtained FF7 Original PC game data, then use **Generate Art Pack** in the Windows app or run `python tools/qb-assets.py inspect --source <game-data-folder>`. To generate the pack, install Python 3.11+ and Pillow with `python -m pip install -r tools/requirements-art.txt`, then follow [the local generator guide](docs/LOCAL_ART_GENERATOR.md). Import the generated private pack in the desktop app or browser. Keep the original files and generated art on your own device.

## Build and test

For the Web game, run `npm ci`, `npm run check`, `npm test`, and `npm run build`. For the Windows app, see [desktop build instructions](desktop/README.md). No Windows executable is part of this Source-only Preview. WebView2 Runtime is installed separately on Windows.

## Current limits

Some complex rules remain candidate implementations, including the unresolved #066 and #134 details above. Card art can still be refined. No Windows binary has passed acceptance or independent clean-VM compatibility testing.

## License

The project source is GPL-3.0-only. See [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md). This is an unofficial fan project, not affiliated with or endorsed by Square Enix. Final Fantasy VII and related names and materials belong to their respective owners. GPL covers this repository's source and does not grant rights to third-party game assets or characters.
