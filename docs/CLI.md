# JSON command-line interface

The CLI is an optional way to create and inspect a match without a browser. It calls the same TypeScript game engine as the Web UI and opens no network listener.

```powershell
node tools/qb-cli.mjs examples/cli/new-match.json
node tools/qb-cli.mjs examples/cli/gi-nattak.json
node tools/qb-cli.mjs examples/cli/bot-vs-bot.json
node tools/qb-cli.mjs examples/cli/match-analysis.json
```

Without a filename, the CLI reads a JSON request from standard input. A request is either an array of operations or an object with `operations` and optional `includeState`. Use `--jsonl` for a persistent one-request-per-line session.

## Main operations

| `op` | Purpose |
| --- | --- |
| `create` | Start a match with a seed, first player, preset, or two explicit decks. |
| `mulligan` | Replace selected opening-hand indices; send an empty list to keep the whole hand. |
| `legal` | List available plays and PASS for the current player. |
| `play` | Place a card using `handIndex` or a matching `cardId`, and `row`/`col`. |
| `pass` | Pass the current turn. |
| `state` / `score` / `events` | Read the board, score, or recent public events. |
| `bot` / `analyze` | Request a bounded Bot move or read-only action analysis. |
| `replay` / `restoreReplay` | Export or restore a supported replay. |
| `cards` / `evidence` | Inspect executable card definitions or the numbered card evidence summary. |

Rows and columns are zero-based (rows 0–2, columns 0–4). A failed operation returns an error for that operation without committing its partial state. A batch with any failed operation exits nonzero.

## Replay and save compatibility

The Game supports earlier replay formats through its compatibility adapters. New matches use rules version `qb-classic-turn-draw-v1`; legacy saves and replays are restored using their recorded version. Replay commands contain the public actions required to rebuild a match, not local card images.

Small fixed examples and replay fixtures live under `examples/cli/` and `tests/fixtures/`. The test suite exercises the CLI and game APIs; see [README](../README.md) for the project test commands.
