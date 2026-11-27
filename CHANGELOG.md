# Changelog

This file tracks user-facing project state. Internal cleanup and unpublished source preparation do not change the released game.

## v1.2.0 — 2026-11-27

- Expanded World Tour to all 33 Rebirth world challengers across 9 regions (including the 6 Keepers of the Cruor), added Blood Hunter Rank 1–12 progression, and added the Region Filter bar.
- Added Live Hover Move Preview (row/total score delta & destruction crosshair warnings), 1997 FF7 classic floating battle numbers, pixel shatter destroy VFX, classic FF7 blue-box pre/post-match banter, and an optional PS1 CRT scanline filter.
- Added Deck Builder rank curve & mechanic analysis, compact `QBC1-` deck share code copy/import, and Card Detail Parent ↔ Generated Token live preview links.
- Backported the `.pyc`/`.pyo` license audit filter fix to `desktop/freeze.py`.

## v1.0.0 — 2026-11-26

- Expanded World Tour to 20 challengers across 9 regions, added 8 archetype preset decks, and added Blood Hunter Rank 1–11 progression dossier.
- Added the Shinra-8 Cruise Tournament mode (5-round bracket + Red XIII exhibition match) with dedicated UI and legendary card VFX.
- Expanded Card Carnival to all 22 playable Classic-candidate puzzles (7 Chapter 6 + 15 Chapter 12).
- Added the M12 Shadowblood Queen boss challenge with dedicated bot strategy and tabletop atmosphere.
- Added the M11 Gold Saucer Wonderment Square suite (6 special-rule challenges and 3 multi-round Survival tiers with bonus draw lane and Nightmare round-5 Queen finale).
- Completed FrameUI v3 (1997 FF7 OG classic blue-window silver-bezel system unified with the Rebirth mako-slate tabletop across all four play modes).
- Added procedural Web Audio PS1-style synth SFX (`sfx.ts`), local challenge star / Survival medal tracking (`qbclassic.progress.v1`), and 11-language coverage.
- Preserved open rule-evidence conflicts, special-challenge parameter boundaries, and Card Carnival candidate opening boundaries; this is not a claim of full original-game parity, and default public builds contain no private art, models, or audio.

## v0.8.0-rc.1 — 2026-11-08

- Published the R3 GitHub Source Preview with its Windows x64 portable ZIP and SHA-256 sidecar.
- The release is a pre-release. It does not include private art or original FF7 archives.
- See [R3 release report](docs/R3_RELEASE_REPORT.md) for the frozen source commit, asset hashes, and publication checks.
