# Game rules and compatibility

The Web and Windows apps use the shared TypeScript engine in `src/engine.ts`. The board has three rows and five columns. Each player uses a 15-card deck; a new match starts with five cards and includes one opening mulligan. Cards place pawns, claim spaces, and trigger abilities. Line strength and the end-of-match result are calculated by the same engine used by the Bot and replay reader.

## Turns

New matches use `qb-classic-turn-draw-v1`. After both players finish the opening mulligan, the first player acts from their five-card hand. The second player draws before their first action. Later, the player whose turn ends draws one card if one is available; the second consecutive PASS ends the match without another draw. A player's turn can continue after a PASS when the other player still has a legal move.

Legacy saves and replays retain the behavior associated with their recorded rules version. The compatibility reader does not silently reinterpret an old record as a new match.

## Abilities and limitations

The engine implements card placement, pawn influence, replacements, triggered abilities, dynamic power, destruction, generated cards, Bot actions, and score calculation. The 145-card catalog includes cards with incomplete rule coverage; visual inclusion does not imply complete gameplay support.

Card #134's J-Squad rule is not implemented. Some complex ability interactions remain candidate implementations because their exact behavior is not yet established. When a rules change affects old saves or replays, the rules version and compatibility handling must be updated explicitly.
