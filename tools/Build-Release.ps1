#Requires -Version 7.0
<#
.SYNOPSIS
Collects a release of the apps into artifacts/release/: every tracked demo file under
workspace/, each of them as a Nendo web page (<Name>.html), every package under extensions/ as
<folder>.zip, the web app site as site.zip, and SHA256SUMS.txt.

.DESCRIPTION
The demo files are checked first with the host's Test-BinaryAssets.ps1, so a file that is open
in Nendo or not whole is refused by name rather than released. A package .zip holds the package
folder's files at its root, which is what Import package… reads. The web pages and the site come
from tools/Build-WebPages.ps1; .github/workflows/pages.yml publishes site.zip on GitHub Pages;
-Publish starts it on main once the release exists.

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

& (Join-Path $PSScriptRoot 'Build-WebPages.ps1')
if (-not $?) { throw 'The web pages did not build; nothing was released.' }
$web = Join-Path $root 'artifacts/web'
Copy-Item (Join-Path $web 'pages/*.html') $out
Compress-Archive -Path (Join-Path $web 'site/*') -DestinationPath (Join-Path $out 'site.zip')

$assets = Get-ChildItem $out -File | Sort-Object Name
$sums = $assets | ForEach-Object {
    '{0}  {1}' -f (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant(), $_.Name
}
[IO.File]::WriteAllText((Join-Path $out 'SHA256SUMS.txt'), (($sums -join "`n") + "`n"))

Write-Host ("{0} demo files, {0} web pages, {1} packages and the site in {2}" -f $tracked.Count, $packages.Count, $out)

if ($Publish) {
    $versions = $packages | ForEach-Object {
        $manifest = Get-Content (Join-Path $_.FullName 'nendo-package.json') -Raw | ConvertFrom-Json
        '| {0} | {1} |' -f $manifest.title, $manifest.version
    }
    $notes = @(
        'Download a `.nendo` file and open it in Nendo, or import a view''s `.zip` into a file of your own.'
        'Without Nendo, open an app at https://thomasrohde.github.io/nendo-apps/, or download its `.html` web page and open it in a browser.'
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
    gh workflow run pages.yml --repo ThomasRohde/nendo-apps --ref main -f tag=$Tag
    if ($LASTEXITCODE -ne 0) { throw "The release $Tag is published, but its site was not sent to GitHub Pages: gh workflow run pages.yml failed." }
    Write-Host 'GitHub Pages deploy started: gh run list --repo ThomasRohde/nendo-apps --workflow pages.yml'
}
