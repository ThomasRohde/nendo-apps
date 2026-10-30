// What Slip.nendo is made of: its purpose, Slip's record types, the package and the view that
// opens the file, and the example code and Workspace page it starts with. Build-Slip.mjs sends
// it; the tests read it.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { bootImage } from './image.mjs';
import { E, F, schemaOperations, classValues, methodValues, recordMethodKey } from '../../extensions/slip/records.mjs';

export const PACKAGE_FOLDER = path.resolve(import.meta.dirname, '../../extensions/slip');
export const PACKAGE_ID = 'org.nendo.slip';
export const VIEW_NODE = 'slip.home';
export const TITLE = 'Slip: a Smalltalk environment, and the record types it keeps code in';
export const PURPOSE = 'A Smalltalk environment. Evaluate code in a Workspace and print the results; classes and methods you make are kept in this file as records, and compiled again each time Slip opens.';
// A view's file may be at most 4 MiB and its package 16 MiB (the host's view contract).
export const FILE_BOUND = 4 * 1024 * 1024;
export const PACKAGE_BOUND = 16 * 1024 * 1024;
// The development planners: never a target.
export const PLANNERS = ['application-d0b7c0e877744c1c81cf0fdd013cae2e', 'application-5c52097771f342d5a648fcb514318e7c', 'application-7efd926c073f4be9974be19bbc39ff41'];

export const START_PAGE = `"Welcome to Slip, a Smalltalk in this file.

Put the caret on a line and press Ctrl+D to do it, or Ctrl+P to print its result
after it. Select several lines to evaluate them together. Ctrl+. stops a long run."

3 + 4.
(2 raisedTo: 100) printString.
(1 to: 30) select: [:n | n isPrime].
#(5 3 9 1) asSortedCollection asArray.
Transcript show: 'Hello from Slip'; cr.

"This file carries example classes. Print these:"
Stack new push: 1; push: 2; yourself.
(Circle radius: 2) area.
{Circle radius: 1. Rectangle width: 2 height: 3} asSortedCollection asArray.
(1 to: 1000) select: [:n | n isPerfect].

"A class you define, and every method you compile, is kept in the file:"
Object subclass: #Greeter
	instanceVariableNames: 'name'
	classVariableNames: ''
	package: 'Mine'.
Greeter compile: 'name: aString
	name := aString' classified: 'accessing'.
Greeter compile: 'greet
	^''Hello, '' , name , ''!''' classified: 'greeting'.
(Greeter new name: 'Smalltalk') greet.
`;

const op = (operationType, payload) => ({ operationType, payload });
// A record ID from a name or a method key; a binary selector's characters are spelled out, so
// Shape>>< and Shape>><= get different IDs.
const slug = text => text.replace(/[^A-Za-z0-9 :]/g, c => ` x${c.charCodeAt(0).toString(16)}`).trim().replace(/[ :]+/g, '-').replace(/-$/, '').toLowerCase();

export async function packageFiles(folder = PACKAGE_FOLDER) {
  const manifest = JSON.parse(await fs.readFile(path.join(folder, 'nendo-package.json'), 'utf8'));
  const names = (await fs.readdir(folder, { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile())
    .map(entry => path.relative(folder, path.join(entry.parentPath ?? entry.path, entry.name)).split(path.sep).join('/'))
    .filter(name => name !== 'nendo-package.json' && name !== 'README.md' && !name.split('/').some(part => part.startsWith('.')))
    .sort();
  const files = [];
  for (const name of names) {
    const bytes = await fs.readFile(path.join(folder, name));
    files.push({ path: name, bytes, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
  }
  return { manifest, files };
}

/** The example code as the records Slip keeps it in, read from an image it was filed into. */
export async function exampleRecords() {
  const image = bootImage();
  const kernel = new Set();
  const walk = cls => { kernel.add(cls.name); for (const sub of cls.subclasses) walk(sub); };
  walk(image.vm.classes.Object);
  const touched = [];
  image.vm.hooks.methodCompiled = (owner, method) => touched.push([owner, method.selector]);
  const result = image.fileIn(await fs.readFile(path.join(import.meta.dirname, 'examples.st'), 'utf8'), 'examples.st');
  if (result.errors.length) throw new Error(`The examples do not file in: ${result.errors.join('; ')}`);
  const records = [];
  const walkMine = cls => { if (!kernel.has(cls.name)) records.push({ entityId: E.cls, recordId: `st.class.${slug(cls.name)}`, values: classValues(image.vm, cls) }); for (const sub of cls.subclasses) walkMine(sub); };
  walkMine(image.vm.classes.Object);
  const seen = new Set();
  for (const [owner, selector] of touched) {
    const values = methodValues(image.vm, owner, owner.methods.get(selector));
    const key = recordMethodKey(values);
    if (seen.has(key)) continue;
    seen.add(key);
    records.push({ entityId: E.method, recordId: `st.method.${slug(key)}`, values });
  }
  records.push({ entityId: E.page, recordId: 'st.snippet.start-here', values: { [F.page.title]: 'Start here', [F.page.source]: START_PAGE } });
  return { records, image };
}

/** Every operation of the build, in calls of at most 12, definition before data. */
export async function buildMutations() {
  const { manifest, files } = await packageFiles();
  // The host takes a required field only in the mutation that creates its record type, so each
  // record type and its fields travel together, as one mutation.
  const schema = [];
  for (const operation of schemaOperations()) {
    if (operation.operationType === 'schema.createEntity') schema.push([]);
    schema.at(-1).push(operation);
  }
  const definition = [
    op('extension.setPackage', { packageId: manifest.packageId, title: manifest.title, entryPoint: manifest.entryPoint ?? 'index.html', version: manifest.version, description: manifest.description }),
  ];
  for (const file of files) for (let offset = 0; offset < Math.max(1, file.bytes.length); offset += 70 * 1024)
    definition.push(op('extension.putFile', { packageId: manifest.packageId, path: file.path,
      base64: file.bytes.subarray(offset, offset + 70 * 1024).toString('base64'), ...(offset === 0 ? { expectedSha256: 'absent' } : { append: true }) }));
  definition.push(op('ui.addNode', { surfaceId: 'slip', nodeId: VIEW_NODE, parentNodeId: null, kind: 'extensionView', position: 0,
    properties: { definitionVersion: 3, title: 'Slip', packageId: manifest.packageId, opensFile: true } }));
  const data = (await exampleRecords()).records.map(r => op('data.createRecord', { entityId: r.entityId, recordId: r.recordId, values: r.values }));
  const chunk = (operations, description) => {
    const out = [];
    for (let at = 0; at < operations.length; at += 12) out.push({ description: `${description} (${out.length + 1})`, operations: operations.slice(at, at + 12) });
    return out;
  };
  const types = schema.map((operations, i) => ({ description: `Slip record type ${operations[0].payload.entityId}`, operations: i === 0 ? [op('application.setPurpose', { purpose: PURPOSE }), ...operations] : operations }));
  return { definition: [...types, ...chunk(definition, 'Slip app')], data: chunk(data, 'Slip examples'), files, manifest };
}

// ---- What the fixture broker serves the view in tools/Review-Slip.ps1.

/** The file as the view reads it: Slip's record types and the example records. */
export async function fixture() {
  const operations = schemaOperations();
  const entities = operations.filter(o => o.operationType === 'schema.createEntity').map(o => ({ entityId: o.payload.entityId, displayName: o.payload.displayName, hierarchy: null, fields: [] }));
  const byId = Object.fromEntries(entities.map(e => [e.entityId, e]));
  for (const { operationType, payload: p } of operations) if (operationType === 'schema.addField')
    byId[p.entityId].fields.push({ fieldId: p.fieldId, displayName: p.displayName, storageKind: p.storageKind, required: p.required, presentation: p.presentation,
      calculated: false, choices: (p.options ?? []).map(id => ({ id, displayName: id, retired: false, tone: null })), reference: null, scale: null });
  const records = Object.fromEntries(entities.map(e => [e.entityId, []]));
  for (const r of (await exampleRecords()).records) records[r.entityId].push({ entityId: r.entityId, recordId: r.recordId, version: 1, values: r.values, labels: {}, exact: {}, calculated: {} });
  return { changeSequence: 1, schema: { entities, commands: [] }, records,
    context: { viewId: VIEW_NODE, kind: 'extensionView', placement: 'screen', title: 'Slip', entityId: null, recordId: null,
      bindings: { labelFieldId: null, statusFieldId: null, fields: [], filters: [] }, theme: 'light' } };
}
