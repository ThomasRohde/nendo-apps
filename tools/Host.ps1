# Dot-sourced by every lane: the Nendo host checkout these apps run against (ADR-0040 in the
# host). NENDO_HOST names it; otherwise it is ../nendo beside this repository.
$hostRoot = [IO.Path]::GetFullPath($(if ($env:NENDO_HOST) { $env:NENDO_HOST } else { Join-Path $PSScriptRoot '../../nendo' }))
if (-not (Test-Path -LiteralPath (Join-Path $hostRoot 'src/Nendo.Workbench/package.json'))) {
    throw "No Nendo host checkout at $hostRoot. Clone nendo beside nendo-apps, or set NENDO_HOST to one."
}
# The host's view-kit tests check this repository's packages, and must find at least these.
$env:NENDO_PACKAGES_ROOT = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$env:NENDO_PACKAGES_KNOWN = 'extensions/gantt/kit/nendo-view-kit.js,extensions/gantt/gantt.css,extensions/dependency-graph/graph.css'
