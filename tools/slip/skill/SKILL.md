---
name: slip-smalltalk
description: Read and change the Smalltalk code in a Slip file, run Smalltalk in the person's open Slip, and keep objects. Use when the file carries the org.nendo.slip package and the task is about its classes, methods, Workspace pages, kept objects or a failing run.
---

# Smalltalk in a Slip file

This file is a Smalltalk image kept as records. The Slip view (package `org.nendo.slip`)
compiles the records each time it opens, and compiles a changed record as soon as it arrives.
You change code by writing records over the nendo MCP server, as for any record. There is no
other channel and no image file.

## The record types

| Record type | Fields | What it is |
| --- | --- | --- |
| `st.class` | `st.class.name` (required), `st.class.superclass`, `st.class.shape` (`fixed`, `variable` or `bytes`), `st.class.instanceVariables` and `st.class.classVariables` (names separated by spaces), `st.class.package`, `st.class.comment` | One class the person or you defined. Kernel classes (Object, OrderedCollection, ...) have no record. |
| `st.method` | `st.method.className` (required), `st.method.side` (`instance` or `class`), `st.method.selector`, `st.method.protocol`, `st.method.source` (required) | One method. The source is the whole method, starting with its selector line, as a browser shows it. |
| `st.snippet` | `st.snippet.title` (required), `st.snippet.source` | A Workspace page. |
| `st.object` | `st.object.name` (required), `st.object.className`, `st.object.ston` (required) | An object kept with `Slip keep: anObject as: 'name'`, written as STON. |
| `st.evaluation` | `st.evaluation.source` (required), `st.evaluation.state`, `st.evaluation.result`, `st.evaluation.output` | Smalltalk you ask the open Slip to run (below). |

A file may lack `st.object` and `st.evaluation`: Slip offers the person a proposal that adds them.

## Changing code

- **A method**: create or update its `st.method` record. Keep the selector in
  `st.method.selector` the same as the source's first line. `st.method.protocol` is a word
  such as `accessing`; a protocol `*Pkg` puts the method in package Pkg.
- **A class**: create its `st.class` record before its methods. The superclass must be a
  kernel class or a class with a record.
- **Removing a method**: delete its record.
- The dialect is Smalltalk-80 with Pharo's syntax (`{ }` arrays, `#[ ]` byte arrays, pragmas).
  Exceptions are ANSI's: `on:do:`, `ensure:`, `ifCurtailed:`, `signal:`, `retry`, `resume:`,
  `pass`, `outer`. Morphs show in the World tab (below); there is no file system.
- **Compile errors** from your edit show in Slip's Transcript, and reach you as `error` events
  at `nendo://application/extension-events` ("Slip could not compile Foo>>bar: ..."). Read that
  after an edit and fix the record.

Slip shows the person a notice whenever code arrives from outside it, so say in your reply
what you changed and why.

## Running Smalltalk: st.evaluation

You cannot evaluate Smalltalk over MCP. Instead, create an `st.evaluation` record with the
source in `st.evaluation.source` and the state `waiting`. The person's open Slip shows it in a
queue. It runs only when the person presses Run, or when they turned on the package setting
"Run an agent's evaluations" (off by default). Then Slip writes back:

- `st.evaluation.state`: `done`, `failed`, or `declined` when the person declined it;
- `st.evaluation.result`: the result's printString, or the error and its stack;
- `st.evaluation.output`: what the run wrote to the Transcript.

Read the record again after a while; if it still waits, the person has not run it. Never
create many at once: one at a time, each for a reason you can name to the person.

## Kept objects

Objects live only while Slip is open. `Slip keep: anObject as: 'name'` writes one to an
`st.object` record as STON; `Slip kept: 'name'` reads a new copy; `Slip forget: 'name'` removes
it; `Slip keptNames` lists them. Blocks and contexts cannot be kept.

## Morphs and the World

Slip's World tab shows morphs: `World open: aMorph` or `aMorph openInWorld`. Subclass `Morph` and
override `drawOn: aCanvas` (`fillRect:color:`, `fillRoundRect:radius:color:`, `frameRect:color:width:`,
`line:to:color:width:`, `drawString:at:size:bold:color:`, `clipTo:during:`), `extentChanged` to lay
out submorphs, `worldResized:` to follow the World's size, and for events `handlesMouseDown:`,
`mouseDown:`, `mouseUp:`, `wantsKeyboardFocus`, `keyStroke:` (the event's `key` is `'a'`,
`'Enter'`, `'Backspace'`), `isDraggable`, `wantsDroppedMorph:`, `acceptDroppedMorph:event:`, and
`wantsSteps` with `step`. Geometry is `Point` (`3 @ 4`) and `Rect` (`0 @ 0 extent: 100 @ 40`); the
kernel's rectangle is `Rect`. Give a morph a theme colour by name (`color: #accent`; also `#text`,
`#mutedText`, `#surface`, `#panel`, `#background`, `#line`) so it follows light and dark. Kernel
morphs: `StringMorph`, `ButtonMorph label:action:`, `TextFieldMorph` (with `action:`).

The Cards app (package `Cards`: `CardsBoard`, `CardsColumn`, `CardsCard`) is an example: read it
in the file's `st.method` records before writing an app of your own. Its board is kept as the
object `cards`.

## Nendo's records from Smalltalk

Code in the Workspace reaches the file's other records: `Nendo entities`,
`Nendo records: 'entity.id'` (NendoRecords, whose `values` is a Dictionary by field ID),
`Nendo create: 'entity.id' values: aDictionary`, `Nendo update: aRecord values: aDictionary`
and `Nendo delete: aRecord`.
