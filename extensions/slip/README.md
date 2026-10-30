# Slip

A Smalltalk environment in a Nendo file. `workspace/Slip.nendo` opens on it (`slip.home`, an
`extensionView` with `opensFile`). The package is `org.nendo.slip`; everything in this folder but
`nendo-package.json` and `README.md` is what the file carries.

## Use

- **Workspace pages** hold Smalltalk to evaluate. Put the caret on a line, or select several, and
  press **Ctrl+D** (Do it) or **Ctrl+P** (Print it, which puts the result after the selection and
  selects it). **Ctrl+.** stops a long run. **Ctrl+S** keeps the page now; it is also kept after a
  pause in typing and when the editor loses focus.
- **The Transcript** shows what `Transcript show:` writes, and says when code came in from
  outside Slip.
- **Classes and methods** are made in Smalltalk, as in any Smalltalk:
  `Object subclass: #Greeter instanceVariableNames: 'name' classVariableNames: '' package: 'Mine'`,
  then `Greeter compile: '...' classified: 'greeting'`. Each one is kept in the file as a record
  the moment it compiles.
- **Exceptions** are ANSI's: `on:do:`, `ensure:`, `ifCurtailed:`, `signal`, `return:`,
  `retry`, `resume:`, `pass`, `outer` and `ExceptionSet` (`ZeroDivide, Warning`). An error the VM
  finds (a non-Boolean in `ifTrue:`, a dead block's `^`) is an `Error` a handler can take.
- **An exception no handler takes**, or **Stop** (Ctrl+.), stops the run and leaves a notifier
  under the editor: the message, the stack, and **Debug**, **Proceed** (the `signal` answers nil)
  and **Abandon** (its `ensure:` blocks run). A parse error puts the caret where the parser
  stopped.
- **The Debugger** tab shows the stopped run's stack, the chosen frame's source with the send it
  waits on marked, and its variables; choose one to inspect it. **Into** stops at the next send,
  **Over** at the chosen frame's next send, **Restart** runs the frame again from its start, and
  **Proceed** and **Abandon** end it. **Debug it** (Ctrl+Shift+D) opens the selection in the
  debugger before its first statement. `self halt` stops a run there.
- **The Browser** tab lists packages, classes, protocols and methods. A package lists its own
  classes, then in italics the classes it adds methods to (a protocol such as `*Examples`). Choose a
  method to read and change it; **Accept** (Ctrl+S) compiles it and keeps it. With no method
  chosen, the code pane holds the class definition, which Accept evaluates. **Comment** shows the
  class comment, **New method** a template in the chosen protocol, **New class** a definition to
  fill in, and **Remove method** asks once more before it removes. An edit not accepted is dropped
  only when you choose something else twice.
- **Inspect it** (Ctrl+I) opens the inspector beside the tools: the object's class and
  printString, then its named fields and its indexed slots. Choose a field to inspect what it holds,
  and ‹ to go back. Code in the inspector's box runs with `self` as the inspected object.
- **Browse it** (Ctrl+Shift+B; Ctrl+B is Nendo's own key) opens the browser on the class named by the selection or the word at
  the caret.
- **Keeping an object**: objects live until the view closes, unless kept on purpose.
  `Slip keep: anObject as: 'name'` writes it to the file as STON; `Slip kept: 'name'` makes a new
  copy, `Slip keptNames` lists them and `Slip forget: 'name'` removes one. Blocks cannot be kept.
- **The file's other records**, from Smalltalk: `Nendo entities`, `Nendo records: 'entity.id'`
  (NendoRecords, with `values` by field ID), `Nendo create:values:`, `Nendo update:values:` and
  `Nendo delete:`. The run waits for each answer; the page does not.
- **An agent** changes code by writing `st.class` and `st.method` records over Nendo's MCP server,
  as the file's own skill (`slip-smalltalk`) teaches it; Slip compiles each change as it arrives,
  and a compile error reaches the agent as one of the view's runtime events. To run Smalltalk, an
  agent writes an `st.evaluation` record. It waits in a queue above the editor until you press
  **Run** or **Decline**, unless you turned on the setting **Run an agent's evaluations** (off by
  default, kept on each computer, also offered by the queue's own button). Slip writes the result,
  or the error and its stack, and the Transcript output back into the record.
- **The World** tab shows morphs: `World open: aMorph`, or `aMorph openInWorld`. A morph draws
  itself on a `Canvas` and takes the World's events: a click goes to the morph under it that
  handles it, the keyboard to the one clicked that wants it, a draggable morph can be dropped on
  one that wants it, and `step` runs a few times a second for a morph that wants steps. The kernel
  has `Morph`, `StringMorph`, `ButtonMorph`, `TextFieldMorph` and `WorldMorph`, with `Point`
  (`3 @ 4`), `Rect`, `Color` and `UIEvent`. A colour given as a Symbol (`#accent`, `#text`,
  `#surface`) is Nendo's theme colour of that name, so the morph follows the light or dark theme.
- **Cards** is an app on these morphs: a board of cards in three columns. **Open Cards**, in the
  World tab, files it in from `apps/Cards.st` when the file lacks it, so its classes are kept as
  records and can be read and changed in the Browser, then opens it (`CardsBoard open`). Type a card
  and press Enter, drag a card to another column, press x to remove one. The board is kept as the
  object named `cards`.
- **Sheets** is a spreadsheet written in Smalltalk, about 270 methods in 18 classes: a formula
  lexer and parser, a tree of formula nodes, 24 functions (`SUM`, `AVERAGE`, `IF`, `IFERROR`,
  `CONCAT` ...), exact numbers (`=1/3` stays a fraction), errors that are values (`#DIV/0!`,
  `#REF!`, `#CIRC!`), recalculation in dependency order, and undo. **Open Sheets**, in the World
  tab, files it in from `apps/Sheets.st` and opens it on a small budget. Type in a cell, or start a
  formula with `=` and click the cells it reads; double-click or F2 to edit; drag to select and read
  the sum below; Ctrl+C and Ctrl+V move a formula's relative references; drag a column's edge to
  resize it. **Records** fills the sheet from one of the file's record types. The sheet is kept as
  the object named `sheet`. Add a function as a method `fnNAME:` on `SheetFunctions`, in the Browser.
- **Ask the agent**, in the debugger, sends your agent the stopped run's stack, with its methods
  as the file's records. Nendo asks you first; the reply goes to the Transcript.

## How it works

- `vm/` is the virtual machine: a parser and a compiler to bytecode (`parser.mjs`,
  `compiler.mjs`), an interpreter with real contexts and non-local return (`vm.mjs`), named
  primitives (`primitives.mjs`), and the image that files in source and evaluates in time slices
  of about 8 ms, so a long run never freezes the page (`image.mjs`).
- `kernel/` is the class library in chunk format: a fresh Smalltalk-80 kernel with Pharo syntax
  additions, loaded each time the view starts.
- `tools.mjs` reads what the browser, the inspector and the debugger show from the image, and
  `panes.mjs` draws them. A printString the inspector asks for is stopped after 200 ms, so a `printOn:` that
  never ends cannot hang the page.
- `records.mjs` maps classes, methods and pages to three record types: `st.class`, `st.method`
  and `st.snippet`, and declares two more: `st.object` for kept objects and `st.evaluation` for an
  agent's evaluations. On start Slip compiles the file's classes and methods into the image; after
  that every class defined and method compiled is written back, one write at a time. A change
  from outside (another client, an undo) is compiled when it arrives and named in a notice.
- Exceptions are Smalltalk (`kernel/Exception.st`): `signal` walks the senders for an `on:do:`
  context, and a return that passes an `ensure:` context runs its block. The VM has a few
  context primitives for this, and stops a process for the debugger when `defaultAction` finds
  no handler. A debugger step runs the process until the next send it is watching for.
- `display.mjs` is the World tab's display. Each pointer or key event on the canvas becomes a
  `UIEvent` that `WorldMorph>>handle:on:` takes in a process of its own, one at a time. A `Canvas`
  primitive only adds a drawing operation to a list, which the view paints once the World has
  drawn, so a frame never shows half drawn. The display primitives (`vm/primitives.mjs`) read the
  canvas's size, measure text and answer the theme's colours from Nendo's tokens.
- `bridge.mjs` answers `Nendo request:with:`: the primitive stops the process with the request's
  promise, and the image runs it on with the answer as the send's value, or signals an Error with
  the refusal. It also writes and reads STON, a subset of Smalltalk Object Notation, for kept
  objects. `agent.mjs` is the evaluation queue.
- Objects are not kept unless kept on purpose: what a doit makes lives until the view closes.
  Code is the durable part.
- A file without the three record types still runs Slip, keeps nothing, and offers to ask Nendo
  for them as a proposal (`Slip: keep Smalltalk classes, methods and Workspace pages in this file`).
  A file with them but not the two later ones keeps code, and offers those two
  (`Slip: keep objects, and take an agent's evaluations, in this file`).

## Build and check

- The lane is `pwsh ./tools/Test-Apps.ps1 -Lane Slip` (`tools/Review-Slip.ps1`): the node tests
  in `tools/slip/` (kernel conformance, language, exceptions and debugger, records, package, browser and inspector,
  bridge and agent, display and Cards, Sheets), then `tools/Gate-Slip.mjs`
  against the host's fixture broker.
- `node tools/Build-Slip.mjs --endpoint http://127.0.0.1:PORT/mcp --accept` builds the app into
  an empty, host-created file at Unattended: the record types, the package and the view, then
  the example classes (`tools/slip/examples.st`) and the Start here page. The skill package
  `org.nendo.slip-smalltalk` (`tools/slip/skill/SKILL.md`) goes with the app. `--dry-run` sends
  nothing. `--upgrade` brings a built file up to this folder: the record types it lacks, the
  changed package files and the skill.

Licence: MIT, in `LICENSE.txt`.
