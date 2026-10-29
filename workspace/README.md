# Workspace

The apps' demo files, out of the sweepable `artifacts/`. Each carries its app's package as the
person last accepted it. The host's own reference files (Nendo Station, Swarm, Herbarium) and the
live planner are in the `nendo` repository's `workspace/`.

| File | What it is | In git |
| --- | --- | --- |
| `BCM.nendo` | Capability Atlas: a business capability model of the fictional Northstar organisation, 635 capabilities with applications and initiatives, and the [Capability Atlas package](../extensions/bcm-atlas/README.md) in the file. | Yes |
| `Archi.nendo` | An ArchiMate 3.2 model with the [Archi workbench](../extensions/archi/README.md) in the file. Built by `tools/Build-Archi.mjs`. | Yes |
| `Garden.nendo` | [Garden](../docs/design/garden.md), a garden of Markdown notes whose `[[links]]`, `#tags` and `- [ ]` tasks are records, with the [Garden view](../extensions/garden/README.md) (reading first, a living d3 graph) and its own agent skill in the file. Built by `tools/Build-Garden.mjs`. | Yes |
| `Deck.nendo` | [Deck](../extensions/deck/README.md): slide decks with twenty-one layouts, six templates, brand kits from Brandkits, Present with a presenter console and rehearsal, and HTML and PowerPoint export, with an example deck and its own agent skill in the file. Built by `tools/Build-Deck.mjs`. | Yes |
| `Manuscript.nendo` | A new file of the Manuscript app (File > New manuscript, ADR-0022): the owner's paper in progress, *Malleable Software in One File: Nendo as a Case Study*, with real screenshots. | Yes |
| `Milo.nendo` | A Manuscript file holding the owner's picture book *Milo and the Paper Boat*. | Yes |
| `Clay.nendo` | [Clay](../extensions/clay/README.md), a collect-anything app that starts empty and grows its own shape. | Yes |
| `Brandkits.nendo` | Brand kits made with the launched agent, with the [Brandkits package](../extensions/brandkits/nendo-package.json) in the file. | Yes |
| `Billable.nendo`, `Envelope.nendo`, `Desk.nendo`, `Sketchboard.nendo`, `Dynamo.nendo`, `Casefile.nendo` | Apps an agent built in the file, with no package source in this repository: what they hold is in the file itself. | Yes |

## Rules

- **Never** delete, overwrite, reset or use one of these as a failure fixture.
- `.nendo` storage is never edited directly by an agent. Write through the host:
  the Nendo application, or the `nendo` MCP server against the file it has open.
- Host-owned sidecars (`-wal`, `-shm`, journal, write-owner) belong to Nendo while
  it holds a file open. `.gitignore` keeps them out of git; leave them alone.

## What is in git

Every file here is tracked, and every one is released: `tools/Build-Release.ps1` copies them
into a GitHub release, and the README links to them there. The demo files are tracked. They change only when somebody rebuilds them, and they are
worth still having after a sweep.

The host's `tools/Test-BinaryAssets.ps1`, which `tools/Test-Apps.ps1` runs over this repository, opens every tracked file here and checks the SQLite
header, that the length is a whole number of pages, and that the file declares Nendo's
application id (`0x4E454E44`). That is a structural check, not a checksum: SQLite
carries none over the database file, so a flipped byte inside a page is not caught.

A file that is open in Nendo cannot be read, and the lane names it as open rather than
corrupt, for example: `workspace/BCM.nendo is open in Nendo (BCM.nendo.write-owner is
beside it). Close it, or open another file in Nendo, and run again.` The gate still
fails, because a file nobody could check is not a pass.
