[CmdletBinding()]
# Every app's lane, against the host checkout beside this repository (tools/Host.ps1). Run it from
# the repository root through the PowerShell tool. -Lane runs some of them by name, for example
# -Lane Gantt,Deck; the repository checks run either way.
param([string[]] $Lane)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
. (Join-Path $PSScriptRoot 'Host.ps1')

$lanes = [ordered]@{
    NendoGraph       = 'Offline dependency graph'
    WorkDependencies = 'Work-dependency view'
    Gantt            = 'Gantt, with the view kit and its tokens'
    BcmAtlas         = 'Capability Atlas'
    ArchiWorkbench   = 'Archi workbench'
    Manus            = 'Manuscript'
    Deck             = 'Deck'
    Brandkits        = 'Brandkits'
    Garden           = 'Garden'
    Slip             = 'Slip'
}
if ($Lane) {
    # pwsh -File passes -Lane Gantt,Deck as one string.
    $Lane = @($Lane | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    $unknown = @($Lane | Where-Object { -not $lanes.Contains($_) })
    if ($unknown.Count -gt 0) { throw "No lane named $($unknown -join ', '). The lanes are: $($lanes.Keys -join ', ')." }
}

Push-Location $repoRoot
try {
    Write-Host "Host: $hostRoot ($(& git -C $hostRoot rev-parse --short HEAD))"

    Write-Host '== Line endings and byte order marks =='
    # LF only and no BOM in every tracked text file, as in the host.
    $rows = @(& git -c 'core.quotePath=false' ls-files --eol)
    if ($LASTEXITCODE -ne 0) { throw 'git ls-files --eol failed.' }
    $text = @($rows | Where-Object { $_ -notmatch '^i/-text' } | ForEach-Object { ($_ -split "`t", 2)[1] })
    $crlf = @($rows | Where-Object { $_ -match '\sw/(crlf|mixed)\s' } | ForEach-Object { ($_ -split "`t", 2)[1] })
    if ($crlf.Count -gt 0) { throw "Tracked file(s) with CRLF line endings; replace CRLF with LF in bytes:`n$($crlf -join "`n")" }
    $bom = @($text | Where-Object {
        $full = Join-Path $repoRoot $_
        if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { return $false }
        $stream = [IO.File]::OpenRead($full)
        try { $head = [byte[]]::new(3); $read = $stream.Read($head, 0, 3) } finally { $stream.Dispose() }
        $read -eq 3 -and $head[0] -eq 0xEF -and $head[1] -eq 0xBB -and $head[2] -eq 0xBF
    })
    if ($bom.Count -gt 0) { throw "Tracked file(s) that begin with a byte order mark:`n$($bom -join "`n")" }
    Write-Host "OK       $($text.Count) tracked text path(s): LF, no byte order mark."

    Write-Host '== Binary assets =='
    & pwsh -NoProfile -File (Join-Path $hostRoot 'tools/Test-BinaryAssets.ps1') -Root $repoRoot
    if ($LASTEXITCODE -ne 0) { throw 'Binary asset check failed.' }

    Write-Host '== View language =='
    & node --test (Join-Path $PSScriptRoot 'view-language.test.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'A view marks its English text as the person''s language, or its page does not declare English.' }

    foreach ($name in $lanes.Keys) {
        if ($Lane -and $name -notin $Lane) { continue }
        Write-Host "== $($lanes[$name]) =="
        $started = [DateTime]::UtcNow
        & pwsh -NoProfile -File (Join-Path $PSScriptRoot "Review-$name.ps1")
        if ($LASTEXITCODE -ne 0) { throw "$($lanes[$name]) lane failed (tools/Review-$name.ps1)." }
        Write-Host ("OK       {0} in {1:N0} s" -f $lanes[$name], ([DateTime]::UtcNow - $started).TotalSeconds)
    }
    Write-Host 'App lanes passed.'
} finally {
    Pop-Location
}
