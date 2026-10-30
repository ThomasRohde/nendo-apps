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
- **Errors** show their message and the stack under the editor. A parse error puts the caret
  where the parser stopped.

## How it works

- `vm/` is the virtual machine: a parser and a compiler to bytecode (`parser.mjs`,
  `compiler.mjs`), an interpreter with real contexts and non-local return (`vm.mjs`), named
  primitives (`primitives.mjs`), and the image that files in source and evaluates in time slices
  of about 8 ms, so a long run never freezes the page (`image.mjs`).
- `kernel/` is the class library in chunk format: a fresh Smalltalk-80 kernel with Pharo syntax
  additions, loaded each time the view starts.
- `records.mjs` maps classes, methods and pages to three record types: `st.class`, `st.method`
  and `st.snippet`. On start Slip compiles the file's classes and methods into the image; after
  that every class defined and method compiled is written back, one write at a time. A change
  from outside (another client, an undo) is compiled when it arrives and named in a notice.
- Objects are not kept: what a doit makes lives until the view closes. Code is the durable part.
- A file without the three record types still runs Slip, keeps nothing, and offers to ask Nendo
  for them as a proposal (`Slip: keep Smalltalk classes, methods and Workspace pages in this file`).

Not in this version: exception handling (`on:do:`, `ensure:`), the debugger, the class browser
and the inspector. They come in later steps of the work item.

## Build and check

- The lane is `pwsh ./tools/Test-Apps.ps1 -Lane Slip` (`tools/Review-Slip.ps1`): the node tests
  in `tools/slip/` (kernel conformance, language, records, package), then `tools/Gate-Slip.mjs`
  against the host's fixture broker.
- `node tools/Build-Slip.mjs --endpoint http://127.0.0.1:PORT/mcp --accept` builds the app into
  an empty, host-created file at Unattended: the record types, the package and the view, then
  the example classes (`tools/slip/examples.st`) and the Start here page. `--dry-run` sends
  nothing.

Licence: MIT, in `LICENSE.txt`.
