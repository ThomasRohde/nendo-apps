#Requires -Version 7.0
<#
.SYNOPSIS
Exports every tracked demo file under workspace/ as a Nendo web page and a Nendo web app, for
people without Nendo installed: artifacts/web/pages/<Name>.html and artifacts/web/site/<slug>/.

.DESCRIPTION
The export is the host's own (File → Web page… in Nendo), run by tools/web-export/Export.cs
against copies of the demo files, so the workspace files are only read. The runtime page is the
host's browser host, artifacts/browser-host/Nendo.html in the host checkout, built with its
tools/Build-BrowserHost.ps1 when it is missing or with -RebuildRuntime.

site/index.html is copied in as the site's front page. Every exported app must have a link on
it, and every link on it an exported app, or the build stops and names the mismatch.
#>
[CmdletBinding()]
param([switch] $RebuildRuntime)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Host.ps1')

$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'artifacts/web'
$runtime = Join-Path $hostRoot 'artifacts/browser-host/Nendo.html'
$worker = Join-Path $hostRoot 'src/Nendo.Workbench/web-app/sw.js'

if ($RebuildRuntime -or -not (Test-Path $runtime)) {
    & pwsh -NoProfile -File (Join-Path $hostRoot 'tools/Build-BrowserHost.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'The host''s browser host did not build.' }
}
if (-not (Test-Path $worker)) { throw "The host has no service worker at $worker." }

if (Test-Path $out) { Remove-Item -Recurse -Force $out }
$sources = Join-Path $out 'sources'
New-Item -ItemType Directory -Force $sources | Out-Null

$tracked = @(git -C $root ls-files -- 'workspace/*.nendo')
if ($LASTEXITCODE -ne 0 -or $tracked.Count -eq 0) { throw 'No tracked .nendo files under workspace/.' }
$copies = foreach ($file in $tracked) {
    $copy = Join-Path $sources (Split-Path -Leaf $file)
    Copy-Item (Join-Path $root $file) $copy
    $copy
}

$script = Join-Path $out 'Export.cs'
$text = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'web-export/Export.cs'))
$text = $text.Replace('#:project HOST/', '#:project ' + ($hostRoot -replace '\\', '/') + '/')
[IO.File]::WriteAllText($script, $text)

$pages = Join-Path $out 'pages'
$site = Join-Path $out 'site'
$lines = & dotnet run $script -- $runtime $worker $pages $site @copies 2>&1
if ($LASTEXITCODE -ne 0) { throw "The web export failed:`n$($lines | Out-String)" }
$apps = @($lines | Where-Object { $_ -is [string] -and $_.StartsWith('{') } | ForEach-Object { $_ | ConvertFrom-Json })
if ($apps.Count -ne $tracked.Count) { throw "Exported $($apps.Count) of $($tracked.Count) files:`n$($lines | Out-String)" }
Remove-Item -Recurse -Force $sources

Copy-Item (Join-Path $root 'site/*') $site -Recurse
$front = [IO.File]::ReadAllText((Join-Path $site 'index.html'))
$linked = @([regex]::Matches($front, 'href="\./([a-z0-9-]+)/"') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
$exported = @($apps.slug | Sort-Object -Unique)
$missing = @($exported | Where-Object { $_ -notin $linked })
$extra = @($linked | Where-Object { $_ -notin $exported })
if ($missing -or $extra) {
    throw "site/index.html does not match the exported apps. Not linked: $($missing -join ', '); linked but not exported: $($extra -join ', ')."
}

foreach ($app in $apps) {
    Write-Host ('{0,-12} page {1,6:N1} MB   app {2,6:N1} MB   icon {3}' -f $app.name, ($app.page / 1MB), ($app.app / 1MB),
        $(if ($app.picture) { 'picture' } else { "$($app.tone) $($app.letter)" }))
}
Write-Host ("{0} web pages in {1}, and a site of {0} web apps in {2}" -f $apps.Count, $pages, $site)
