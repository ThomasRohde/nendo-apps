# Building the apps

This is for changing the apps. To use them, the [README](README.md) is all you need.

| App | Package | Demo file | Lane |
| --- | --- | --- | --- |
| Dependency graph | [`extensions/dependency-graph`](extensions/dependency-graph/README.md) | none | `Review-NendoGraph.ps1` |
| Work dependencies | [`extensions/work-dependencies`](extensions/work-dependencies/README.md) | none | `Review-WorkDependencies.ps1` |
| Gantt | [`extensions/gantt`](extensions/gantt/README.md) | none | `Review-Gantt.ps1` |
| Capability Atlas | [`extensions/bcm-atlas`](extensions/bcm-atlas/README.md) | `workspace/BCM.nendo` | `Review-BcmAtlas.ps1` |
| Archi | [`extensions/archi`](extensions/archi/README.md) | `workspace/Archi.nendo` | `Review-ArchiWorkbench.ps1` |
| Manuscript | [`extensions/manuscript`](extensions/manuscript/README.md) | `workspace/Manuscript.nendo` | `Review-Manus.ps1` |
| Deck | [`extensions/deck`](extensions/deck/README.md) | `workspace/Deck.nendo` | `Review-Deck.ps1` |
| Brandkits | `extensions/brandkits` | `workspace/Brandkits.nendo` | `Review-Brandkits.ps1` |
| Garden | [`extensions/garden`](extensions/garden/README.md) | `workspace/Garden.nendo` | `Review-Garden.ps1` |
| Clay | [`extensions/clay`](extensions/clay/README.md) | `workspace/Clay.nendo` | none |

Billable, Envelope, Desk, Sketchboard, Dynamo and Casefile were built in the file by an agent;
their views have no source folder here, and the file is the source. **Export…** in
**Studio › Screens › Custom views** writes one out as a folder.

## The host beside it

This repository has no copy of Nendo's tooling. Every lane and builder uses the Nendo checkout
beside it, `../nendo`, or the one `NENDO_HOST` names: its built view API
(`src/Nendo.Workbench/dist/_nendo/api.js`), the fixture broker (`tools/Graph-FixtureServer.mjs`),
the view kit and tokens, the package uploader (`tools/Put-NendoPackage.mjs`) and the MCP client.
`tools/Host.ps1` and `tools/host.mjs` find it. Build its Workbench once
(`npm --prefix ../nendo/src/Nendo.Workbench run build`); a lane builds it when it is missing.

## Running the lanes

From the repository root, in PowerShell:

```powershell
pwsh ./tools/Test-Apps.ps1                   # every lane
pwsh ./tools/Test-Apps.ps1 -Lane Gantt,Deck  # some of them
```

Garden and Manuscript need their node packages first: `npm ci --prefix tools/garden` and
`npm ci --prefix tools/manus`. Nendo's own gate runs this script with
`pwsh ./tools/Test-Production.ps1 -WithApps`.

## Putting an app into a file

With Nendo running, the file open and agent access at **Shape app**:

```powershell
node ../nendo/tools/Put-NendoPackage.mjs extensions/gantt
```

The person accepts the proposal in Nendo. See the host's
[Authoring a custom view](https://github.com/ThomasRohde/nendo/blob/main/docs/custom-view-authoring.md).

## Making a release

A release carries every tracked file under `workspace/` and every package under `extensions/` as
`<folder>.zip`, with `SHA256SUMS.txt`. Close the demo files in Nendo first: an open file is
refused by name.

```powershell
pwsh ./tools/Build-Release.ps1            # collect into artifacts/release/ only
pwsh ./tools/Build-Release.ps1 -Publish   # and create the GitHub release v<yyyy.MM.dd>
```

The README links to `releases/latest/download/<name>`, so its links follow the newest release.
A new demo file or package needs a row in the README too.
