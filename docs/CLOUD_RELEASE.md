# Cloud Windows build and release

The Windows ZIP distributed from GitHub Releases is built on GitHub Actions using the committed public source. Do not build or upload a local Windows ZIP as a release asset. The build and publish workflows are separate so a maintainer can download and manually test the exact cloud artifact before publishing it.

## Build an artifact for testing

`.github/workflows/windows-build.yml` runs on every push to `main` and can also be started from **Actions → Windows x64 cloud build → Run workflow**. The manually selected branch may build for testing, but only an artifact from the current `main` commit is eligible for publication.

The build uses a `windows-2022` x64 runner, CPython 3.11.9 x64, Node.js 22.20.0 x64, the npm lockfile, and pinned Python build requirements. It checks the complete Git history and source whitelist, runs TypeScript and regression tests, checks the local generator/resource boundary, builds the Web Game, reuses `desktop/build-windows.ps1`, then audits the ZIP and nested `source.zip` before uploading the artifact.

The artifact name is `qbc-windows-x64-<run-id>-<attempt>`. Download it from the successful Actions run, extract the Actions artifact wrapper, then verify and test the contained `QueensBloodClassic-Windows-x64.zip`:

```powershell
Get-FileHash .\QueensBloodClassic-Windows-x64.zip -Algorithm SHA256
Get-Content .\QueensBloodClassic-Windows-x64.zip.sha256
```

Compare the hash printed by `Get-FileHash` with the first field in the sidecar. `build-manifest.json` records the source commit, package version, Actions run/attempt, runner image and package/source archive hashes. Keep this manifest with the tested artifact. The Actions artifact is retained for 90 days; if it expires, run a new cloud build and manually test that new artifact.

Use the steps in [the Windows portable guide](../desktop/PORTABLE_README.txt) for GUI acceptance. Test the exact artifact whose run ID and source commit will be entered in the publish workflow. Do not add a private Art Pack or personal save to the artifact.

## Publish the tested artifact

`.github/workflows/publish-release.yml` is started manually from the `main` branch after GUI acceptance. It does not run another Windows build. Enter:

1. `version`: exact `package.json`/`VERSION.txt` version without `v`.
2. `source_commit`: full 40-character commit recorded by the accepted artifact.
3. `build_run_id`: the Actions run that produced the artifact.
4. `artifact_name`: exact name shown on that run, including run attempt.
5. Set `gui_accepted` after personally testing the Windows GUI.
6. Type `PUBLISH_PRE_RELEASE` in `publish_confirmation`.

The workflow refuses publication unless the repository is public, the dispatch comes from `main`, `main` still points to the selected source commit, the selected build run succeeded on `main`, and the run/artifact/version/commit/hash metadata all match. It re-audits the Windows ZIP, embedded source ZIP and all reachable Git history. It creates or verifies the tag at that exact commit, uploads the original tested ZIP, SHA-256 sidecar and build manifest, then publishes a non-Draft Pre-release. It never rebuilds the Windows ZIP during publication.

Build jobs have only `contents: read`. The separate publish job has `actions: read` to fetch the chosen Actions artifact and `contents: write` only for creating the exact tag and release. Both workflows use the built-in `GITHUB_TOKEN`; no personal token is stored in source or workflow settings. Third-party Actions are pinned to full commit SHAs.

If validation fails, nothing is published. If an asset upload fails after a draft release has been created, the release remains a draft and cannot be mistaken for a public release; inspect the matching draft and uploaded asset hashes before retrying. The workflow will not replace a conflicting tag, existing published release or unverifiable draft asset.

## Current release notes

The bilingual notes for this version are in [`docs/releases/v0.8.0-rc.2.md`](releases/v0.8.0-rc.2.md). They state that this is an unofficial FF7 fan project, players provide their own FF7 Original PC resources, all 145 Classic Art routes can be generated locally, and the Windows build has not had an independent clean-VM compatibility test. They also preserve the current rule and art limitations.
