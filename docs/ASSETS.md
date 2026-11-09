# Add local Classic Art

Queen's Blood Classic runs without card art. To add it, create a private Art Pack on your own computer from FF7 Original PC game data that you lawfully obtained. The repository and ordinary Web build do not include game archives, extracted models or textures, or generated card images.

## Windows app

1. Start the app and choose **Generate Art Pack**.
2. Select your FF7 Original data folder. The app checks the expected archives locally.
3. Build all cards or a small selected set. Output is written to a new folder under your user data directory.
4. Use the verified pack to start the Game. You can also select an existing Art Pack instead.

You can skip card art and play with the built-in fallback. The app does not modify the selected FF7 files.

## Browser

Run `npm ci` and `npm run dev`, open the local URL, then go to **Config → Classic Art** and choose the generated Art Pack folder. Review the validation result and enable it. The browser reads local files for the current session; after a page refresh, select the pack again. You can remove the pack to return to fallback art.

The pack format is documented in [Art Pack v1](ART_PACK_CONTRACT.md); generation steps and supported input layout are in [the generator guide](LOCAL_ART_GENERATOR.md). Keep the original installation and generated Art Pack private. #134's J-Squad rule is not implemented yet, some complex rules remain candidates, and artwork may be refined.
