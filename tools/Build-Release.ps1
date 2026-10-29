#Requires -Version 7.0
<#
.SYNOPSIS
Collects a release of the apps: every tracked demo file under workspace/ and every package
under extensions/ as <folder>.zip, with SHA256SUMS.txt, into artifacts/release/.

.DESCRIPTION
The demo files are checked first with the host's Test-BinaryAssets.ps1, so a file that is open
in Nendo or not whole is refused by name rather than released. A package .zip holds the package
folder's files at its root, which is what Import package… reads.

With -Publish it creates the GitHub release <Tag> on ThomasRohde/nendo-apps with gh and uploads
every file. The README links to releases/latest/download/<name>, so the names never carry a
version.
#>
[CmdletBinding()]
param(
    [string] $Tag = ('v' + (Get-Date -Format 'yyyy.MM.dd')),
    [switch] $Publish
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Host.ps1')

$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'artifacts/release'

& (Join-Path $hostRoot 'tools/Test-BinaryAssets.ps1') -Root $root
if (-not $?) { throw 'The demo files did not pass the binary-asset check; nothing was released.' }

if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Force $out | Out-Null

$tracked = @(git -C $root ls-files -- 'workspace/*.nendo')
if ($LASTEXITCODE -ne 0) { throw 'git ls-files failed.' }
if ($tracked.Count -eq 0) { throw 'No tracked .nendo files under workspace/.' }
foreach ($file in $tracked) {
    Copy-Item (Join-Path $root $file) (Join-Path $out (Split-Path -Leaf $file))
}

$packages = Get-ChildItem (Join-Path $root 'extensions') -Directory |
    Where-Object { Test-Path (Join-Path $_.FullName 'nendo-package.json') }
foreach ($package in $packages) {
    $zip = Join-Path $out ($package.Name + '.zip')
    Compress-Archive -Path (Join-Path $package.FullName '*') -DestinationPath $zip
}

$assets = Get-ChildItem $out -File | Sort-Object Name
$sums = $assets | ForEach-Object {
    '{0}  {1}' -f (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant(), $_.Name
}
[IO.File]::WriteAllText((Join-Path $out 'SHA256SUMS.txt'), (($sums -join "`n") + "`n"))

Write-Host ("{0} demo files and {1} packages in {2}" -f $tracked.Count, $packages.Count, $out)

if ($Publish) {
    $versions = $packages | ForEach-Object {
        $manifest = Get-Content (Join-Path $_.FullName 'nendo-package.json') -Raw | ConvertFrom-Json
        '| {0} | {1} |' -f $manifest.title, $manifest.version
    }
    $notes = @(
        'Download a `.nendo` file and open it in Nendo, or import a view''s `.zip` into a file of your own.'
        'The [README](https://github.com/ThomasRohde/nendo-apps#readme) says what each app does.'
        ''
        '| View | Version |'
        '| --- | --- |'
    ) + $versions
    $notesFile = Join-Path $root 'artifacts/release-notes.md'
    [IO.File]::WriteAllText($notesFile, (($notes -join "`n") + "`n"))
    $files = @(Get-ChildItem $out -File | ForEach-Object FullName)
    gh release create $Tag --repo ThomasRohde/nendo-apps --title "Nendo apps $($Tag.TrimStart('v'))" --notes-file $notesFile @files
    if ($LASTEXITCODE -ne 0) { throw "gh release create $Tag failed." }
}
