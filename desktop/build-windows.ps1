param([Parameter(Mandatory=$true)][string]$Python,[Parameter(Mandatory=$true)][string]$Out)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$target=[IO.Path]::GetFullPath($Out)
if(Test-Path -LiteralPath $target){throw 'Choose a new output directory'}
$commit=(& git -C $root rev-parse HEAD).Trim()
$export=Join-Path $target 'source'
New-Item -ItemType Directory -Path $export -Force | Out-Null
$zip=Join-Path $target 'source.zip'
& git -C $root archive --format=zip --output=$zip $commit
if($LASTEXITCODE){throw 'Git archive failed'}
Expand-Archive -LiteralPath $zip -DestinationPath $export
# Build script reads Git HEAD again; export is inside this sole repository.
Push-Location $export
try {
  & node desktop/freeze-game.mjs
  if($LASTEXITCODE){throw 'Game build failed'}
  & $Python desktop/freeze.py --source $export --out (Join-Path $target 'freeze') --commit $commit
  if($LASTEXITCODE){throw 'Freeze failed'}
} finally {Pop-Location}
