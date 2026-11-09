# Art Pack v1

The browser and Windows app read a local Art Pack using the shared v1 manifest. Card rules and images are independent: an image can be present even when a card's rule is unfinished.

## Files

```text
<pack>/
  visual-manifest.json
  build-report.json
  portraits/<slug>.png
  models/<slug>.json             optional metadata, not executed by the game
```

The manifest has a `version: 1` and a `cards` array. Each row has a unique numeric `cardId`, optional `ff7OriginalEntityId`, optional `modelSources` (`field`, `battle`, or `world`), `portraitPath`, and `preview3dPath` (currently `null`). Numbered cards use IDs 1–145; generated token cards may use IDs 1000 or greater. Missing entries use the game's normal card fallback.

Paths are relative to the pack and must not contain an absolute prefix, URL scheme, backslash, parent segment, percent escape, query, or fragment. Portrait paths use `portraits/<lowercase-slug>.png`; model metadata uses `models/<lowercase-slug>.json`. A manifest does not cause a model to be loaded or executed.

## Build report and validation

`build-report.json` must identify schema `qb-local-asset-report`, version 1, and a successful complete build. Its `generatedFiles` array lists each delivered file once with a lowercase SHA-256; `size` may also be included. The importer checks paths, referenced files, hashes, image signatures, and PNG decoding. Failed or incomplete builds are rejected.

The browser importer accepts a folder selected by the user and uses files in the current browser session. After refreshing, select the pack again. The Windows app can validate a selected pack and stores its private data under the user's data directory. Neither client uploads the original game files.

The normal Web build contains no generated/private art, FF7 archives, or extracted models and textures. An Art Pack is a local input, not a source-code dependency or a redistribution grant. See [the local generator guide](LOCAL_ART_GENERATOR.md) and [asset setup](ASSETS.md).
