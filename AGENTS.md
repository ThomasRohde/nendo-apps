# Nendo apps repository instructions

## What this is

The apps for Nendo, moved out of the host's repository under
[ADR-0040](https://github.com/ThomasRohde/nendo/blob/main/docs/decisions/0040-apps-live-in-their-own-repository.md).
`README.md` is for the people who download them; `CONTRIBUTING.md` lists the packages, their
demo files and lanes, and how a release is made. The host checkout sits beside this one, at `../nendo`, and is the
authority for everything an app relies on: read its `AGENTS.md`, `docs/vision.md`, the
accepted ADRs and `docs/contracts/custom-views.md` there. An app never needs a change to the
host to work; when it does, that is a host change made and gated in `../nendo`.

## Plan and record work

The work is planned in the host's Nendo Development planner, as for the host: read
`../nendo/docs/dogfooding.md` and use the registered `nendo` MCP server (`.mcp.json`,
`.codex/config.toml`, port 41787). Name a work item by its Reference and title, read its
Decision standing first, write planner records directly over MCP (only a definition change
goes as a proposal the person accepts), and record exact check outcomes.

## Which gate a change needs

- An app change needs that app's lane, `pwsh ./tools/Test-Apps.ps1 -Lane <App>`, with every new
  guard falsified. That is enough to commit and push it. It never needs the host's gate or a new
  installer: the app reaches a file as a proposal.
- Run every lane, `pwsh ./tools/Test-Apps.ps1`, now and then, and after the host changes its view
  contract, view kit or tokens. The host's `Test-Production.ps1 -WithApps` runs it against the
  host it just built.
- A release is `pwsh ./tools/Build-Release.ps1 -Publish`. It publishes to the world, and its
  web apps go on GitHub Pages, so run it only when the owner asks. A new app or demo file needs
  its row in `README.md` and its card in `site/index.html`.
- When the kit changes in the host, copy `../nendo/tools/view-kit/nendo-view-kit.js` into every
  package here that carries it, and raise those packages' versions.

## Files and line endings

Every tracked text file is UTF-8 without a BOM and ends its lines with LF; `Test-Apps.ps1`
refuses a CRLF file or a BOM by name. The host's `AGENTS.md` explains the traps on this machine:
never `perl -pi`; Python only with `newline=''`; a Bash command over about 8 KB is silently
truncated, so write files with the Write tool. Run `tools/*.ps1` through the PowerShell tool from
the repository root.

## Workspace

`workspace/` holds the apps' demo files and some of the owner's own files. Never delete,
overwrite, reset or use one as a failure fixture, and never edit `.nendo` storage directly: write
through Nendo or its MCP server. `workspace/README.md` says which are tracked.

## Artifacts

`artifacts/` is git-ignored scratch for lane output. Delete freely.

## Honest reporting

As in the host: report exact commands and literal outcomes, distinguish what was measured from
what was reported, and name the lane and its scope rather than calling something verified.
