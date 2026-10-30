// The shape of a Terrain file: the record types, the lists and record pages, the Terrain view
// and the demo landscape, one stage per change set. tools/Build-Terrain.mjs sends them; this file
// only says what they are. extensions/terrain/README.md gives the reasons.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { E, F, COMPONENT_TYPES, SOURCING, MARKS, STAGE_SETS, MAP_STATUS, SYNTAXES, LINK_KINDS, FLOWS, LINES, NOTE_KINDS, MOVEMENT_KINDS,
  INERTIA_KINDS, METHODS, ASSESSMENT_STATUS, REFERENCES, CREATE_ORDER, NUMBER_FIELDS, hostValues } from '../../extensions/terrain/model.mjs';
import { importMap } from '../../extensions/terrain/owm.mjs';

export const SURFACE = 'terrain';
export const CALL_CHARACTERS = 200_000;
export const PACKAGE_ID = 'org.nendo.terrain';
const here = path.dirname(fileURLToPath(import.meta.url));
export const PACKAGE_FOLDER = path.resolve(here, '..', '..', 'extensions', 'terrain');
export const CORPUS_FOLDER = path.resolve(here, 'corpus');
export const NEW_FILE_LABEL = 'Wardley maps';
export const SEED_DATE = '2026-10-30';
export const VIEW_NODE = 'tr.view';
/** The demo's maps, in the order they are imported into one landscape. */
export const DEMO_MAPS = ['order-to-delivery.owm', 'customer-care.owm', 'identity.owm', 'tea-shop.owm'];

const op = (operationType, payload) => ({ operationType, payload });
const field = (entityId, fieldId, displayName, storageKind, presentation, { required = false, options = [] } = {}) =>
  op('schema.addField', { entityId, fieldId, displayName, storageKind, required, presentation, options });
const text = (entityId, fieldId, displayName, required = false) => field(entityId, fieldId, displayName, 'Text', 'singleLine', { required });
const long = (entityId, fieldId, displayName) => field(entityId, fieldId, displayName, 'Text', 'longText');
const markdown = (entityId, fieldId, displayName) => field(entityId, fieldId, displayName, 'Text', 'markdown');
const choice = (entityId, fieldId, displayName, options, required = false) => field(entityId, fieldId, displayName, 'Text', 'singleChoice', { required, options });
const date = (entityId, fieldId, displayName, required = false) => field(entityId, fieldId, displayName, 'Date', 'date', { required });
const number = (entityId, fieldId, displayName, required = false) => field(entityId, fieldId, displayName, 'Decimal', null, { required });
const integer = (entityId, fieldId, displayName) => field(entityId, fieldId, displayName, 'Integer', null);
const reference = (entityId, fieldId, displayName, required = false) => field(entityId, fieldId, displayName, 'Reference', null, { required });
const bind = (entityId, fieldId, targetEntityId, labelFieldId) => op('schema.configureReference', { entityId, fieldId, targetEntityId, labelFieldId });
const tone = (entityId, fieldId, choiceId, toneName) => op('schema.setChoiceMetadata', { entityId, fieldId, choiceId, displayName: choiceId, retired: false, tone: toneName });

function chunk(operations, description, size = 16) {
  const mutations = [];
  const total = Math.ceil(operations.length / size);
  for (let start = 0; start < operations.length; start += size) {
    mutations.push({ description: total > 1 ? `${description} (${mutations.length + 1} of ${total})` : description, operations: operations.slice(start, start + size) });
  }
  return mutations;
}

/** Screen nodes carry their position within their parent, counted here. */
function tree() {
  const positions = new Map();
  const operations = [];
  const add = (nodeId, kind, parentNodeId, properties = {}) => {
    const key = parentNodeId ?? '';
    const position = positions.get(key) ?? 0;
    positions.set(key, position + 1);
    operations.push(op('ui.addNode', { surfaceId: SURFACE, nodeId, parentNodeId, kind, position, properties }));
    return nodeId;
  };
  const bindings = (parentNodeId, fieldIds) => { for (const fieldId of fieldIds) add(`${parentNodeId}.${fieldId}`, 'fieldBinding', parentNodeId, { fieldId }); };
  return { add, bindings, asMutations: description => chunk(operations, description) };
}

export const PURPOSE = [
  'Wardley maps. Every map is a view of one landscape: a Component is one record on every map that',
  'shows it, and a Map only places it (a Placement, with its visibility on that map). Where a component',
  'stands on the evolution axis is its latest Accepted Assessment; a drawn evolution on a placement is',
  'that map\'s own position, not yet confirmed. Links belong to the landscape, and a map draws every link',
  'between two components it places unless it hides it. Movements, inertia and notes are as in',
  'OnlineWardleyMaps, whose text the Terrain view reads and writes. Positions are exact decimals.',
].join('\n');

const ENTITIES = Object.values(E);

export const STAGES = {
  schema: {
    title: 'Terrain: the record types',
    makes: ENTITIES,
    mutations: () => [
      { description: 'Say what this file is for, and give it a look of its own', operations: [
        op('application.setPurpose', { purpose: PURPOSE }),
        op('application.setLook', { tone: 'teal', letter: 'T' }),
        op('application.setNewFileLabel', { label: NEW_FILE_LABEL }),
      ] },
      { description: 'Create Maps', operations: [
        op('schema.createEntity', { entityId: E.map, displayName: 'Maps' }),
        text(E.map, F.map.title, 'Title', true),
        markdown(E.map, F.map.purpose, 'Purpose'),
        choice(E.map, F.map.stages, 'Stage words', STAGE_SETS),
        text(E.map, F.map.customStages, 'Custom stage words'),
        date(E.map, F.map.asOf, 'As of'),
        choice(E.map, F.map.status, 'Status', MAP_STATUS),
        text(E.map, F.map.owner, 'Owner'),
        long(E.map, F.map.lines, 'Text lines'),
        choice(E.map, F.map.syntax, 'Came from', SYNTAXES),
      ] },
      { description: 'Create Components', operations: [
        op('schema.createEntity', { entityId: E.component, displayName: 'Components' }),
        text(E.component, F.component.name, 'Name', true),
        choice(E.component, F.component.type, 'Type', COMPONENT_TYPES, true),
        markdown(E.component, F.component.description, 'Description'),
        choice(E.component, F.component.sourcing, 'Sourcing', SOURCING),
        choice(E.component, F.component.mark, 'Mark', MARKS),
        reference(E.component, F.component.pipelineOf, 'Pipeline of'),
      ] },
      { description: 'Create Placements', operations: [
        op('schema.createEntity', { entityId: E.placement, displayName: 'Placements' }),
        reference(E.placement, F.placement.map, 'Map', true),
        reference(E.placement, F.placement.component, 'Component', true),
        number(E.placement, F.placement.visibility, 'Visibility', true),
        number(E.placement, F.placement.evolution, 'Drawn evolution'),
        number(E.placement, F.placement.labelX, 'Label x'),
        number(E.placement, F.placement.labelY, 'Label y'),
        number(E.placement, F.placement.pipelineFrom, 'Pipeline from'),
        number(E.placement, F.placement.pipelineTo, 'Pipeline to'),
        integer(E.placement, F.placement.order, 'Text order'),
      ] },
      { description: 'Create Links and Hidden links', operations: [
        op('schema.createEntity', { entityId: E.link, displayName: 'Links' }),
        reference(E.link, F.link.from, 'From', true),
        reference(E.link, F.link.to, 'To', true),
        choice(E.link, F.link.kind, 'Kind', LINK_KINDS, true),
        choice(E.link, F.link.flow, 'Flow', FLOWS),
        choice(E.link, F.link.line, 'Line', LINES),
        text(E.link, F.link.label, 'Label'),
        op('schema.createEntity', { entityId: E.hiddenLink, displayName: 'Hidden links' }),
        reference(E.hiddenLink, F.hiddenLink.map, 'Map', true),
        reference(E.hiddenLink, F.hiddenLink.link, 'Link', true),
      ] },
      { description: 'Create Notes and Movements', operations: [
        op('schema.createEntity', { entityId: E.note, displayName: 'Notes' }),
        reference(E.note, F.note.map, 'Map', true),
        choice(E.note, F.note.kind, 'Kind', NOTE_KINDS, true),
        integer(E.note, F.note.number, 'Number'),
        long(E.note, F.note.text, 'Text'),
        long(E.note, F.note.points, 'Points'),
        op('schema.createEntity', { entityId: E.movement, displayName: 'Movements' }),
        reference(E.movement, F.movement.component, 'Component', true),
        number(E.movement, F.movement.to, 'To evolution', true),
        choice(E.movement, F.movement.kind, 'Kind', MOVEMENT_KINDS, true),
        text(E.movement, F.movement.evolvedName, 'Evolved name'),
        number(E.movement, F.movement.labelX, 'Label x'),
        number(E.movement, F.movement.labelY, 'Label y'),
        markdown(E.movement, F.movement.note, 'Note'),
      ] },
      { description: 'Create Inertia and Assessments', operations: [
        op('schema.createEntity', { entityId: E.inertia, displayName: 'Inertia' }),
        reference(E.inertia, F.inertia.component, 'Component', true),
        choice(E.inertia, F.inertia.kind, 'Kind', INERTIA_KINDS),
        markdown(E.inertia, F.inertia.note, 'Note'),
        op('schema.createEntity', { entityId: E.assessment, displayName: 'Assessments' }),
        reference(E.assessment, F.assessment.component, 'Component', true),
        date(E.assessment, F.assessment.date, 'Date', true),
        number(E.assessment, F.assessment.evolution, 'Evolution', true),
        choice(E.assessment, F.assessment.method, 'Method', METHODS, true),
        markdown(E.assessment, F.assessment.note, 'Note'),
        text(E.assessment, F.assessment.by, 'By'),
        choice(E.assessment, F.assessment.status, 'Status', ASSESSMENT_STATUS, true),
      ] },
      { description: 'Point every reference at what it names', operations: [
        bind(E.component, F.component.pipelineOf, E.component, F.component.name),
        bind(E.placement, F.placement.map, E.map, F.map.title),
        bind(E.placement, F.placement.component, E.component, F.component.name),
        bind(E.link, F.link.from, E.component, F.component.name),
        bind(E.link, F.link.to, E.component, F.component.name),
        bind(E.hiddenLink, F.hiddenLink.map, E.map, F.map.title),
        bind(E.hiddenLink, F.hiddenLink.link, E.link, F.link.label),
        bind(E.note, F.note.map, E.map, F.map.title),
        bind(E.movement, F.movement.component, E.component, F.component.name),
        bind(E.inertia, F.inertia.component, E.component, F.component.name),
        bind(E.assessment, F.assessment.component, E.component, F.component.name),
      ] },
    ],
  },

  colour: {
    title: 'Terrain: colour the choices',
    needs: ENTITIES,
    appliedWhen: async read => (await read.schema(E.assessment)).fields.find(f => f.fieldId === F.assessment.status)?.choices.some(c => c.tone) ?? false,
    mutations: () => chunk(TONES.flatMap(([entityId, fieldId, pairs]) => pairs.map(([choiceId, toneName]) => tone(entityId, fieldId, choiceId, toneName))), 'Colour the choices'),
  },

  screens: {
    title: 'Terrain: the lists and the record pages',
    needs: ENTITIES,
    appliedWhen: async read => read.hasNode('tr.map.list'),
    mutations: () => {
      const t = tree();
      const maps = t.add('tr.map.list', 'recordList', null, { definitionVersion: 3, entityId: E.map, title: 'Maps', orderByFieldId: F.map.title, orderDirection: 'ascending' });
      t.bindings(maps, [F.map.title, F.map.status, F.map.owner, F.map.asOf]);
      const components = t.add('tr.component.list', 'recordList', null, { definitionVersion: 3, entityId: E.component, title: 'Components', orderByFieldId: F.component.name, orderDirection: 'ascending' });
      t.bindings(components, [F.component.name, F.component.type, F.component.sourcing, F.component.mark]);
      const assessments = t.add('tr.assessment.list', 'recordList', null, { definitionVersion: 3, entityId: E.assessment, title: 'Assessments', orderByFieldId: F.assessment.date, orderDirection: 'descending' });
      t.bindings(assessments, [F.assessment.component, F.assessment.date, F.assessment.evolution, F.assessment.method, F.assessment.status]);

      const mapPage = t.add('tr.map.page', 'detailSurface', null, { definitionVersion: 3, entityId: E.map, title: 'Map', titleFieldId: F.map.title, accentFieldId: F.map.status });
      t.bindings(mapPage, [F.map.purpose, F.map.stages, F.map.customStages, F.map.asOf, F.map.status, F.map.owner, F.map.syntax]);
      const placed = t.add('tr.map.page.placements', 'relatedList', mapPage, { targetEntityId: E.placement, viaFieldId: F.placement.map, title: 'Components on this map', orderByFieldId: F.placement.order, orderDirection: 'ascending' });
      t.bindings(placed, [F.placement.component, F.placement.visibility, F.placement.evolution]);
      const notes = t.add('tr.map.page.notes', 'relatedList', mapPage, { targetEntityId: E.note, viaFieldId: F.note.map, title: 'Notes' });
      t.bindings(notes, [F.note.kind, F.note.number, F.note.text]);

      const componentPage = t.add('tr.component.page', 'detailSurface', null, { definitionVersion: 3, entityId: E.component, title: 'Component', titleFieldId: F.component.name, accentFieldId: F.component.type });
      t.bindings(componentPage, [F.component.description, F.component.type, F.component.sourcing, F.component.mark, F.component.pipelineOf]);
      const onMaps = t.add('tr.component.page.placements', 'relatedList', componentPage, { targetEntityId: E.placement, viaFieldId: F.placement.component, title: 'On maps' });
      t.bindings(onMaps, [F.placement.map, F.placement.visibility, F.placement.evolution]);
      const judged = t.add('tr.component.page.assessments', 'relatedList', componentPage, { targetEntityId: E.assessment, viaFieldId: F.assessment.component, title: 'Assessments', orderByFieldId: F.assessment.date, orderDirection: 'descending' });
      t.bindings(judged, [F.assessment.date, F.assessment.evolution, F.assessment.method, F.assessment.status]);
      const needs = t.add('tr.component.page.links', 'relatedList', componentPage, { targetEntityId: E.link, viaFieldId: F.link.from, title: 'Needs' });
      t.bindings(needs, [F.link.to, F.link.kind, F.link.label]);
      const movements = t.add('tr.component.page.movements', 'relatedList', componentPage, { targetEntityId: E.movement, viaFieldId: F.movement.component, title: 'Movements' });
      t.bindings(movements, [F.movement.to, F.movement.kind, F.movement.evolvedName]);

      const assessmentPage = t.add('tr.assessment.page', 'detailSurface', null, { definitionVersion: 3, entityId: E.assessment, title: 'Assessment', titleFieldId: F.assessment.component, accentFieldId: F.assessment.status });
      t.bindings(assessmentPage, [F.assessment.date, F.assessment.evolution, F.assessment.method, F.assessment.status, F.assessment.by, F.assessment.note]);
      const placementPage = t.add('tr.placement.page', 'detailSurface', null, { definitionVersion: 3, entityId: E.placement, title: 'Placement', titleFieldId: F.placement.component });
      t.bindings(placementPage, [F.placement.map, F.placement.visibility, F.placement.evolution, F.placement.labelX, F.placement.labelY, F.placement.pipelineFrom, F.placement.pipelineTo, F.placement.order]);
      const linkPage = t.add('tr.link.page', 'detailSurface', null, { definitionVersion: 3, entityId: E.link, title: 'Link', titleFieldId: F.link.label, accentFieldId: F.link.kind });
      t.bindings(linkPage, [F.link.from, F.link.to, F.link.kind, F.link.flow, F.link.line]);
      return t.asMutations('The lists and the record pages');
    },
  },

  view: {
    title: 'Terrain: the map view, which the file opens on',
    needs: ENTITIES,
    appliedWhen: async read => read.hasNode(VIEW_NODE),
    mutations: async () => {
      const files = await packageMutations(PACKAGE_FOLDER, PACKAGE_ID, 'Put the Terrain package into the file');
      const node = op('ui.addNode', { surfaceId: SURFACE, nodeId: VIEW_NODE, parentNodeId: null, kind: 'extensionView', beforeNodeId: 'tr.map.list',
        properties: { definitionVersion: 3, title: 'Map', packageId: PACKAGE_ID, entityId: E.map, opensFile: true } });
      return [...files, { description: 'Show the map view, and open the file on it', operations: [node] }];
    },
  },

};

const TONES = [
  [E.map, F.map.status, [['Draft', 'amber'], ['Published', 'green']]],
  [E.component, F.component.type, [['User', 'violet'], ['Need', 'blue'], ['Activity', 'teal'], ['Practice', 'orange'], ['Data', 'amber'], ['Knowledge', 'grey']]],
  [E.component, F.component.sourcing, [['Build', 'blue'], ['Buy', 'teal'], ['Outsource', 'grey']]],
  [E.assessment, F.assessment.status, [['Proposed', 'violet'], ['Accepted', 'green'], ['Rejected', 'grey']]],
  [E.link, F.link.kind, [['Dependency', 'grey'], ['Flow', 'blue']]],
];

/**
 * The demo goes in as several change sets, each at most 128 operations, in the order Import makes
 * the records: each set creates only what points at records the sets before it made.
 */
export const DEMO_PART = 120;
const demoParts = () => Math.ceil(demoRecords().length / DEMO_PART);
for (let part = 1; part <= demoParts(); part += 1) {
  STAGES[`demo-${part}`] = {
    title: `Terrain: the demo landscape, three Northstar maps and the tea shop (${part} of ${demoParts()})`,
    needs: ENTITIES,
    appliedWhen: async read => {
      const first = demoRecords()[(part - 1) * DEMO_PART];
      return (await read.records(first.entityId)).some(r => r.recordId === first.recordId);
    },
    mutations: () => chunk(demoOperations().slice((part - 1) * DEMO_PART, part * DEMO_PART), `The demo landscape, part ${part}`),
  };
}

export const STAGE_ORDER = ['schema', 'colour', 'screens', 'view', ...Object.keys(STAGES).filter(name => name.startsWith('demo-'))];

// ---- The demo: every corpus map in one landscape, as Import makes it, under stable record IDs. ----

/** The demo's records in write order, as the working copy the view's Import would make. */
export function demoRecords() {
  let n = 0;
  const ids = entityId => `${entityId}.r.demo-${String((n += 1)).padStart(3, '0')}`;
  let working = new Map();
  for (const name of DEMO_MAPS) {
    const result = importMap(working, new Map(), fs.readFileSync(path.join(CORPUS_FOLDER, name), 'utf8'), { today: SEED_DATE, ids });
    if (result.errors) throw new Error(`${name}: ${JSON.stringify(result.errors)}`);
    working = result.working;
    working.get(result.mapId).values[F.map.status] = 'Published';
    working.get(result.mapId).values[F.map.owner] = name === 'tea-shop.owm' ? 'After Simon Wardley, CC BY-SA 4.0' : 'Northstar';
  }
  const rank = entityId => CREATE_ORDER.indexOf(entityId);
  return [...working.values()].sort((a, b) => rank(a.entityId) - rank(b.entityId) || a.recordId.localeCompare(b.recordId));
}

export function demoOperations() {
  return demoRecords().map(r => op('data.createRecord', { entityId: r.entityId, recordId: r.recordId, values: hostValues(dropNulls(r.values)),
    expectedTargetVersions: Object.fromEntries(Object.keys(REFERENCES[r.entityId]).filter(f => r.values[f] != null).map(f => [f, 1])) }));
}
const dropNulls = values => Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null && v !== undefined));

// ---- What the fixture broker serves the view in tools/Review-Terrain.ps1. --------------------------

export function fixture({ demo = true } = {}) {
  const schemaOps = STAGES.schema.mutations().flatMap(m => m.operations);
  const entities = schemaOps.filter(o => o.operationType === 'schema.createEntity').map(o => ({ entityId: o.payload.entityId, displayName: o.payload.displayName, hierarchy: null, linkRule: null, fields: [] }));
  const byId = Object.fromEntries(entities.map(e => [e.entityId, e]));
  for (const o of schemaOps) {
    if (o.operationType === 'schema.addField') {
      const p = o.payload;
      byId[p.entityId].fields.push({ fieldId: p.fieldId, displayName: p.displayName, storageKind: p.storageKind.toLowerCase(), required: p.required, presentation: p.presentation,
        calculated: false, expression: null, choices: (p.options ?? []).map(id => ({ id, displayName: id, retired: false, tone: null })), reference: null, scale: null });
    }
    if (o.operationType === 'schema.configureReference') {
      byId[o.payload.entityId].fields.find(x => x.fieldId === o.payload.fieldId).reference = { targetEntityId: o.payload.targetEntityId, labelFieldId: o.payload.labelFieldId };
    }
  }
  const records = Object.fromEntries(entities.map(e => [e.entityId, []]));
  if (demo) {
    for (const r of demoRecords()) {
      const values = dropNulls(r.values);
      const exact = Object.fromEntries(Object.entries(values).filter(([f]) => NUMBER_FIELDS.has(f)));
      // A number field arrives as a JSON number with its exact digits beside it, as the host answers.
      const shown = Object.fromEntries(Object.entries(values).map(([f, v]) => [f, NUMBER_FIELDS.has(f) ? Number(v) : v]));
      records[r.entityId].push({ entityId: r.entityId, recordId: r.recordId, version: 1, values: shown, labels: {}, exact, calculated: {} });
    }
  }
  return {
    changeSequence: 1,
    schema: { entities, commands: [] },
    hierarchies: {},
    records,
    commandEffects: {},
    context: { viewId: VIEW_NODE, kind: 'extensionView', placement: 'screen', title: 'Map', entityId: E.map, recordId: null,
      bindings: { labelFieldId: null, statusFieldId: null, fields: [], filters: [] }, theme: 'light' },
  };
}

// ---- Packages: a folder's files as extension operations, in parts a call can carry. ---------------

export async function packageFiles(folder) {
  const manifest = JSON.parse(await fsp.readFile(path.join(folder, 'nendo-package.json'), 'utf8'));
  const names = (await fsp.readdir(folder, { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile())
    .map(entry => path.relative(folder, path.join(entry.parentPath ?? entry.path, entry.name)).split(path.sep).join('/'))
    .filter(name => name !== 'nendo-package.json' && name !== 'README.md' && !name.split('/').some(part => part.startsWith('.') || part === 'node_modules'))
    .sort();
  const files = [];
  for (const name of names) {
    const bytes = await fsp.readFile(path.join(folder, name));
    files.push({ path: name, bytes, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
  }
  return { manifest, files };
}

export async function packageMutations(folder, packageId, description) {
  const { manifest, files } = await packageFiles(folder);
  if (manifest.packageId !== packageId) throw new Error(`${folder} is ${manifest.packageId}, not ${packageId}.`);
  const setPackage = op('extension.setPackage', { packageId, title: manifest.title, entryPoint: manifest.entryPoint ?? 'index.html', version: manifest.version,
    description: manifest.description, settings: manifest.settings ?? [] });
  return fileMutations(files, packageId, description, [setPackage]);
}

/** Each file as extension.putFile parts of 70 KiB, new to the package, in mutations a call can carry. */
export function fileMutations(files, packageId, description, operations = [], held = new Map()) {
  const partBytes = 70 * 1024;
  for (const file of files) {
    for (let offset = 0; offset === 0 || offset < file.bytes.length; offset += partBytes) {
      operations.push(op('extension.putFile', { packageId, path: file.path, base64: file.bytes.subarray(offset, offset + partBytes).toString('base64'),
        ...(offset === 0 ? { expectedSha256: held.get(file.path) ?? 'absent' } : { append: true }) }));
    }
  }
  const mutations = [];
  for (const operation of operations) {
    const size = JSON.stringify(operation).length;
    const last = mutations.at(-1);
    if (!last || last.operations.length === 16 || last.size + size > CALL_CHARACTERS) mutations.push({ description, operations: [], size: 0 });
    mutations.at(-1).operations.push(operation);
    mutations.at(-1).size += size;
  }
  return mutations.map(({ description: d, operations: o }) => ({ description: d, operations: o }));
}
