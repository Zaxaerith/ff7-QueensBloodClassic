# Generate a private Art Pack locally

The generator reads only a game-data folder that you select. It does not download FF7 files, scan the computer, modify the installation, or upload the selected files. The project contains all 145 Classic Art recipe routes; this describes generation capability, not completion of every card rule.

## Requirements and commands

Use Python 3.11 or newer and Pillow 13.0.0. From the project directory:

```powershell
python -m pip install -r tools/requirements-art.txt
python tools/qb-assets.py inspect --source "<your-FF7-data-folder>"
python tools/qb-assets.py plan --source "<your-FF7-data-folder>" --cards 041,086,106 --json
python tools/qb-assets.py build --source "<your-FF7-data-folder>" --cards 041,086,106 --out "<new-private-output-folder>" --jsonl
```

Use `--cards all` to request all numbered recipes. The output path must not already exist. Keep output outside the public source snapshot and do not commit or share it.

The generator supports the known FF7 Original PC data layouts documented by the CLI's inspect/plan output. It does not promise support for every disc edition, language, or modified installation. `inspect` checks archive structure; `plan` checks source requirements for the selected cards; `build` validates the model parts it actually uses. A successful pack includes a v1 manifest, a build report with per-file hashes, and its generated portraits.

## Load the result

The Windows app can build and load a pack directly, or select an existing pack. In the browser, open Config → Classic Art, select the pack folder, validate it, and enable it. Browser-selected art lasts for the current page session; reselect after refreshing. See [Art Pack v1](ART_PACK_CONTRACT.md).

Generation is local and produces private derived art. Do not include FF7 installation files, extracted assets, or generated packs in source archives or public Web builds. Card #134's J-Squad rule remains unfinished, some complex rules remain candidates, and the art can still be refined.
