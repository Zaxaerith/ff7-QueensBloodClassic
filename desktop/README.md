# Windows desktop app

The Windows app uses pywebview and WebView2 to host the same Game as the browser build. It can open the game without card art, select a local FF7 Original data folder, build a private Art Pack, and load an existing pack. Game data and generated art stay on the user's device.

## Run from source

Requirements: Windows, Node.js 22.12+, CPython 3.11 x64, and Microsoft Edge WebView2 Runtime.

```powershell
npm ci
python -m pip install -r desktop/requirements.txt
python desktop/run.py
```

## Build a portable folder

Use CPython 3.11.9 x64. Install the pinned desktop and build dependencies, then build from a committed source snapshot:

```powershell
python -m pip install -r desktop/requirements.txt -r desktop/requirements-build.txt
pwsh -NoProfile -File desktop/build-windows.ps1 -Python (Get-Command python).Source -Out .parallel-check/windows-rc
```

The build script exports `HEAD` from Git and does not package uncommitted working-tree files. The output contains the Game, GUI executable, generator worker, required runtimes, license notices, version metadata, file hashes, and a matching `source.zip`. Do not copy a private Art Pack into the build directory. WebView2 Runtime is installed separately; the app does not install it automatically.

For player setup and first launch, see [PORTABLE_README.txt](PORTABLE_README.txt). This preview has not been tested in an independent clean Windows virtual machine.
