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
| Terrain | [`extensions/terrain`](extensions/terrain/README.md) | `workspace/Terrain.nendo` | `Review-Terrain.ps1` |
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

## Web pages and the web app site

`pwsh ./tools/Build-WebPages.ps1` exports every tracked demo file the way Nendo's
**File › Web page…** does, with the host's own export code (`tools/web-export/Export.cs`, run
against copies): one page each in `artifacts/web/pages/<Name>.html`, and one web app each in
`artifacts/web/site/<slug>/`, whose icons are the file's own picture. The runtime is the host's
browser host page, `../nendo/artifacts/browser-host/Nendo.html`, built by its
`tools/Build-BrowserHost.ps1` when missing; `-RebuildRuntime` builds it again, which a host change
to the Engine or the Workbench needs.

`site/index.html` is the site's front page. The build stops when an exported app has no link on it,
or a link has no app, so a new demo file needs its card there as well as its row in the README.

## Making a release

A release carries every tracked file under `workspace/`, each of them as a web page, every package
under `extensions/` as `<folder>.zip`, the web app site as `site.zip`, and `SHA256SUMS.txt`.
`-Publish` then starts `.github/workflows/pages.yml` on `main`, which puts `site.zip` on GitHub
Pages at https://thomasrohde.github.io/nendo-apps/. To publish an earlier release's site again,
run `gh workflow run pages.yml --ref main -f tag=<tag>`. Close the demo files in Nendo first: an open file is
refused by name.

```powershell
pwsh ./tools/Build-Release.ps1            # collect into artifacts/release/ only
pwsh ./tools/Build-Release.ps1 -Publish   # and create the GitHub release v<yyyy.MM.dd>
```

A second release on one day needs its own `-Tag`, such as `-Tag v2026.10.29.2`.

The README links to `releases/latest/download/<name>`, so its links follow the newest release.
A new demo file or package needs a row in the README too.
