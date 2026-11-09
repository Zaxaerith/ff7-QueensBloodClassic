# Browser regression fixture

`ui-chain-701.json` was exported from the local browser UI on 2026-10-29.
Preset: 摧毁与替换; seed: 701; opening hand kept by both players.
The player opened with Mandragora and replaced it with Insectoid Chimera,
then made ordinary placements and passed when blocked. The computer played
through to a final **0 : 24**, lane powers **0:9 / 0:12 / 0:3**.

The fixture contains 40 public commands (including both mulligans), not an
injected board. Replay produces 155 events, player hands 6/0 and decks 5/0.
It exercises generated cards, replacement, destruction, continuous effects,
destruction observers, exhausted decks, repeated passes and terminal scoring.

Run: `npm run replay -- tests/fixtures/ui-chain-701.json`.
This is a regression fixture of this candidate, not a recording from Rebirth.
