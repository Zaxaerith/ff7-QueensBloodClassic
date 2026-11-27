# Queen’s Blood Classic

[简体中文](README.zh-CN.md)

An unofficial, open-source single-player card game inspired by Queen’s Blood. Version **1.2.0** provides the expanded Classic candidate experience.

## Features

- A 3×5 board, 145 numbered card definitions, 21 derived cards, 8 archetype preset decks, Deck Builder rank curve & mechanic analysis, compact `QBC1-` deck share codes, and Card Detail Parent ↔ Generated Token live preview links.
- Three Bot difficulty levels, all 33 World Tour challengers across 9 regions (including the 6 Keepers of the Cruor, with a Region Filter bar), Blood Hunter Rank 1–12 progression, the Shadowblood Queen, and keyboard or gamepad controls.
- Shinra-8 Cruise Tournament (5-round bracket plus Red XIII exhibition match) and Gold Saucer Wonderment Square (6 special-rule challenges and 3 multi-round Survival tiers).
- Live Hover Move Preview (row/total score delta and destruction crosshair warnings), 1997 FF7 classic floating battle numbers, pixel shatter destroy VFX, classic FF7 blue-box pre/post-match banter, and an optional PS1 CRT scanline filter.
- An 11-language interface, FrameUI v3 (1997 FF7 OG classic windows unified with the Rebirth tabletop), and procedural Web Audio PS1-style synth SFX.
- Optional local BGM playback with volume and mute settings; no music files are included.
- Card Carnival includes 22 playable Classic-candidate puzzles.
- Candidate local generation routes for all 145 Classic Art cards.

Some complex card interactions remain candidates. #066 Two Face feedback and #134 J-Squad details still need verification against the original game.

## Play in a browser

Install Node.js 22.12 or newer, then run:

```sh
npm ci
npm run dev
```

Open the local address printed by Vite. The normal Web build works without card art and contains no private generated images.

## Generate and import private card art

Provide your own lawfully obtained FF7 Original PC game data. The repository includes the local generator and candidate recipes for 145 cards, but no original game archives, extracted models or textures, or generated private card images. Follow the [local generator guide](docs/LOCAL_ART_GENERATOR.md), then import the generated Art Pack in the desktop app or browser. The public generator is not claimed to reproduce every refinement in any private art collection.

## Windows desktop source

The repository includes the desktop host and build instructions in [desktop/README.md](desktop/README.md). This preview does not provide an accepted Windows binary. Windows GUI acceptance and independent clean-VM compatibility testing are incomplete.

## Build and checks

```sh
npm ci
npm run check
npm test
npm run build
```

See [gameplay and current limits](docs/GAMEPLAY.md), [local music setup](docs/LOCAL_AUDIO.md), [Art Pack v1 contract](docs/ART_PACK_CONTRACT.md), and [third-party notices](THIRD_PARTY_NOTICES.md).

## License and project status

Project source is GPL-3.0-only; see [LICENSE](LICENSE). This is an unofficial fan project, not affiliated with or endorsed by Square Enix. Final Fantasy VII and related names and materials belong to their respective owners. GPL covers this repository’s source and does not grant rights to third-party game assets or characters.
