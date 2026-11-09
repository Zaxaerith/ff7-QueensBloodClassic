# Local data and generated output

The game can run with no Art Pack. Saves, deck settings, match records, replays, and generated art are kept locally by the application; they are not part of the public source snapshot or the ordinary Web build.

The Windows app stores its working data in the current user's application data location and keeps generated packs in a separate `packs` directory. Use the app's folder controls to choose an FF7 Original data folder or an existing Art Pack. The app does not write to the selected game installation.

The command-line generator requires a new output directory. A pack contains `visual-manifest.json`, `build-report.json`, and only the generated files it reports. Keep source game files and output private. The browser importer validates a user-selected pack in the browser session and does not persist its images across a refresh.

For the source/build boundary, see [README](../README.md), [Art Pack v1](ART_PACK_CONTRACT.md), and [generator setup](LOCAL_ART_GENERATOR.md).
