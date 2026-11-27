# Gameplay

## Match

Queen's Blood uses a 3×5 board. Players expand pawn levels, place cards when a friendly open space meets the card's level requirement, resolve card effects, and compare row power for row rewards. A match ends after both sides pass under the implemented rules. The candidate engine records state-changing events for replay, and also supports declarative terrain bonuses (`tileBonus`) and draw-free rounds (`noTurnDraw`) for special challenges without altering standard matches.

The card catalog contains all 145 numbered IDs plus derived token definitions. Rules are independently implemented from public references and tested, but are not a complete verified reproduction of every Rebirth timing edge case. The evidence ledger distinguishes verified fields, candidates, and conflicts. For example, J-Squad is executable candidate data while the generated Hype Johnny base-power evidence remains conflicted.

## Opponents, World Tour, Boss & Decks

- **World Tour Roster (20 Named NPCs)**: Spans 9 regions from Kalm and Under Junon to Shinra-8, Costa del Sol, Corel, Gongaga, Cosmo Canyon, and Nibel. Every NPC has a distinct legal 15-card deck and dedicated `BotStrategy` weighting across Easy, Normal, and Hard difficulties (running in a dedicated Bot Worker with strict `BotView` information boundaries).
- **Shadowblood Queen Boss Battle (M12)**: Preset Replay v2 opening with `#145 Shadowblood Queen` pre-placed on B5 (`row 1, col 4`), a specialized enfeeblement deck, and a dedicated `'queen'` AI profile.
- **Shinra-8 Cruise Tournament (5+1)**: Five-round full-deck knockout bracket (with Mulligan, turn-start draw, and 1 retry per round) culminating against Regina, unlocking a 6th bonus exhibition match against Red XIII · Overfang.
- **8 Archetype Deck Presets & Mirror Practice**: Includes 5 classic starter/chain/summon/advanced/royal-endgame presets plus 3 late-game archetype presets (Deathrattle Abyss, Enfeeble Control, Chocobo & J-Squad Swarm), full deck editing, and mirror practice.

## Gold Saucer & Multi-Round Survival (6+3)

- **6 Single-Match Special Challenges**: *High Ground* (`#121`, `+2` center terrain), *Outflanked* (`#122`, asymmetric flanking), *Don't Fear, MAI's Here* (`#120`, bonus support hand), *Luxury Real Estate* (`#114`, rank 2–3 central axis), *Behind Enemy Lines* (`#117`, interlaced footholds), and *Chadley the Callous* (`#118`, replacement/destroy support).
- **3 Multi-Round Survival Gauntlets**: *Boot Camp* (3 rounds, `#143`), *Extreme Survival* (4 rounds, `#102`), and *Nightmare Survival* (5 rounds, `#104`, culminating in Round 5 against the Shadowblood Queen). Players lock one 15-card deck across rounds, carry unplayed hands forward, contest early bonus-draw lanes, survive late no-draw rounds, and earn Bronze / Silver / Gold medals based on cumulative score.

## Card Carnival (22 Puzzles)

The formal catalog contains 22 engine-verified puzzles spanning Chapter 6 (Easy, Advanced, Skill Drill) and Chapter 12 (Advanced, Collection). The first three Chapter 6 puzzles remain the original P1 baseline, while puzzles 4–22 are registered as `classic-candidate` reconstructions backed by the [Card Carnival evidence ledger](research/card-carnival.md).

## Local Saves, Progression & Replay

Decks, settings, match records, active Continue saves, active Survival (`qbclassic.survival.v1`) and Tournament (`qbclassic.tournament.v1`) runs, and the local honor/medal ledger (`qbclassic.progress.v1`, including Blood Hunter Rank 1–11 progression with zero content locks) are stored locally in the current origin with corruption recovery backups. Nothing is uploaded by the game. Completed matches support step-by-step `ReplayTimeline` playback for both Replay v1 and v2.

## Languages, Controls, Audio, Art & Desktop

The interface supports 11 locales, Classic Frame (v3), keyboard/gamepad navigation, procedural PS1-style Web Audio sound effects (SFX) alongside optional local private BGM, and an art-free fallback mode or validated private Art Packs (including the accepted 145-card pack and optional derived token packs). In addition to standard web builds, the project supports standalone Windows desktop packaging via `desktop/`.
