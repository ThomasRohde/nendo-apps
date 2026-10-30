# Terrain

Wardley maps in one `.nendo` file. `workspace/Terrain.nendo` opens on the Terrain view (`tr.view`, an
`extensionView` with `opensFile`). The package is `org.nendo.terrain`; everything in this folder but
`nendo-package.json` and `README.md` is what the file carries. `tools/Build-Terrain.mjs` builds a
Terrain file from `tools/terrain/definition.mjs` into an empty file Nendo has open, and brings a
built file's package up to this folder with `upgrade`. `tools/Review-Terrain.ps1` is its lane.

This is the first step of the app: the records, the map with waiting edits and Commit,
OnlineWardleyMaps text in and out, SVG and PNG export, and the structural checks. Doctrine,
gameplay, climatic patterns, a timeline of the landscape and the agent's skill are later steps.

## One landscape

A component is one record, whatever number of maps show it. A placement is one map's position for
it: visibility, and a drawn evolution. Links belong to the landscape, so a link two components have
is on every map that shows both; a map that must not draw one keeps a hidden link for it. Import
follows the same rule: a component already in the file is matched by name and keeps what its line
does not state, its inertia and its movements.

| Record type | What it holds |
| --- | --- |
| Maps (`tr.map`) | Title, purpose, stage words (or the map's own), as-of date, status, owner, text lines, syntax |
| Components (`tr.component`) | Name, type, description, sourcing, mark, the component a pipeline belongs to |
| Placements (`tr.placement`) | Map, component, visibility, drawn evolution, label offset, pipeline bounds, order |
| Links (`tr.link`) | From, to, kind, flow, line, label |
| Hidden links (`tr.hiddenLink`) | Map and link: a landscape link this map does not draw |
| Notes (`tr.note`) | Map, kind (note, annotation, legend, accelerator and the like), number, text, points |
| Movements (`tr.movement`) | Component, target evolution, kind, evolved name, label offset, note |
| Inertia (`tr.inertia`) | Component, kind, note |
| Assessments (`tr.assessment`) | Component, date, evolution, method, note, by whom, status |

## Where a component stands

A component's evolution is its latest Accepted assessment on or before the map's as-of date. A
position that only the map has drawn, with no assessment behind it, is drawn hollow, with a dashed
outline, so the map never shows a guess as a judgement. **Confirm positions**, on by default, makes
Commit date an assessment today for each drawn position; turned off, the drawn positions are kept
as they are and stay hollow.

## Waiting edits

Every gesture, the text pane included, changes a working copy. Nothing reaches the file until
Commit, which writes one batch: creates, then updates, then deletes, each update with its record's
version. A commit over 200 writes is refused before any request, and says how many it holds.
Discard drops the waiting edits. Undo steps back through the waiting edits first, and then takes
back this visit's commits one at a time through Nendo's own undo. Waiting edits are kept in the
browser's storage for this file; when a record changed underneath one, a banner says how many are
held, and Commit is refused until they are discarded or made again.

## Text

The text pane shows the map as OnlineWardleyMaps text and takes it back. A line Terrain does not
read is kept in its place. Each map keeps the order of its lines in **Text lines**, so printing
what was read gives back the same bytes. Typing a position makes the same edit a drag makes. A line
that does not parse is marked, and changes nothing until it does. A changed name with the same
numbers is a rename; a new name with new numbers is a new component.

## Checks

The validator is off until the person turns it on, and each rule is a package setting
(`check.<rule>`) a person or the file can switch off:

| Rule | Level | What it finds |
| --- | --- | --- |
| `cycle` | Error | A loop of dependencies |
| `range` | Error | A visibility or evolution outside 0 to 1 |
| `upward` | Warning | A dependency on a component drawn more visible than the one that needs it |
| `orphan` | Warning | A component with no link on this map |
| `no-user` | Warning | A map with no anchor |

## Choices that differ from the design

- **Nudge is Shift+Arrow.** The design says Alt+Arrow, but Alt+ArrowLeft and Alt+ArrowRight are
  Nendo's Back and Forward, and the host refuses them for a view. Shift+Arrow moves the selected
  component by 0.01; the plain arrows move between components.
- **The paper takes the frame's width.** Until the person zooms, the map is fitted to the width of
  the frame, never above its own size, so its right edge is never off the frame.

## Not yet checked

The stage bounds, 0.17, 0.4 and 0.7 of evolution, are what OnlineWardleyMaps is believed to draw.
They have not been compared with its source. A map printed by Terrain and opened there is at the
same numbers whatever the bounds are; only the place of the dashed stage lines can differ.

## Credits

The tea shop in the demo follows Simon Wardley's example, which is licensed CC BY-SA 4.0
(`tools/terrain/corpus/tea-shop.owm` carries the credit). The OnlineWardleyMaps text format is by
Damon Skelhorn and contributors. The view is MIT licensed (`LICENSE.txt`).
