// What a Wardley map is in the file, and how a map's waiting edits become record writes. Pure: no
// DOM, no window.nendo, so the view, the build script and node's tests share it.
//
// One landscape, many maps: a component is one record, and a map only places it. A component
// stands where its latest Accepted assessment puts it; on one map a drawn position that is not yet
// confirmed takes its place, and is drawn hollow.

export const E = {
  map: 'tr.map', component: 'tr.component', placement: 'tr.placement', link: 'tr.link', hiddenLink: 'tr.hiddenLink',
  note: 'tr.note', movement: 'tr.movement', inertia: 'tr.inertia', assessment: 'tr.assessment',
};
export const F = {
  map: { title: 'tr.map.title', purpose: 'tr.map.purpose', stages: 'tr.map.stages', customStages: 'tr.map.customStages', asOf: 'tr.map.asOf',
    status: 'tr.map.status', owner: 'tr.map.owner', lines: 'tr.map.lines', syntax: 'tr.map.syntax' },
  component: { name: 'tr.component.name', type: 'tr.component.type', description: 'tr.component.description', sourcing: 'tr.component.sourcing',
    mark: 'tr.component.mark', pipelineOf: 'tr.component.pipelineOf' },
  placement: { map: 'tr.placement.map', component: 'tr.placement.component', visibility: 'tr.placement.visibility', evolution: 'tr.placement.evolution',
    labelX: 'tr.placement.labelX', labelY: 'tr.placement.labelY', pipelineFrom: 'tr.placement.pipelineFrom', pipelineTo: 'tr.placement.pipelineTo',
    order: 'tr.placement.order' },
  link: { from: 'tr.link.from', to: 'tr.link.to', kind: 'tr.link.kind', flow: 'tr.link.flow', line: 'tr.link.line', label: 'tr.link.label' },
  hiddenLink: { map: 'tr.hiddenLink.map', link: 'tr.hiddenLink.link' },
  note: { map: 'tr.note.map', kind: 'tr.note.kind', number: 'tr.note.number', text: 'tr.note.text', points: 'tr.note.points' },
  movement: { component: 'tr.movement.component', to: 'tr.movement.to', kind: 'tr.movement.kind', evolvedName: 'tr.movement.evolvedName',
    labelX: 'tr.movement.labelX', labelY: 'tr.movement.labelY', note: 'tr.movement.note' },
  inertia: { component: 'tr.inertia.component', kind: 'tr.inertia.kind', note: 'tr.inertia.note' },
  assessment: { component: 'tr.assessment.component', date: 'tr.assessment.date', evolution: 'tr.assessment.evolution', method: 'tr.assessment.method',
    note: 'tr.assessment.note', by: 'tr.assessment.by', status: 'tr.assessment.status' },
};

export const COMPONENT_TYPES = ['User', 'Need', 'Activity', 'Practice', 'Data', 'Knowledge'];
export const SOURCING = ['Build', 'Buy', 'Outsource'];
export const MARKS = ['Market', 'Ecosystem'];
export const STAGE_SETS = ['Activities', 'Practices', 'Data', 'Knowledge', 'Custom'];
export const MAP_STATUS = ['Draft', 'Published'];
export const SYNTAXES = ['OnlineWardleyMaps', 'Mermaid'];
export const LINK_KINDS = ['Dependency', 'Flow'];
export const FLOWS = ['Forward', 'Back', 'Both'];
export const LINES = ['Solid', 'Dashed'];
export const NOTE_KINDS = ['Note', 'Annotation', 'Legend', 'Accelerator', 'Deaccelerator'];
export const MOVEMENT_KINDS = ['Expected', 'Planned'];
export const INERTIA_KINDS = ['Sunk capital', 'Existing practice', 'Contracts', 'Skills', 'Culture', 'Other'];
export const METHODS = ['Characteristics', 'Judgement', 'Workshop', 'Agent', 'Imported'];
export const ASSESSMENT_STATUS = ['Proposed', 'Accepted', 'Rejected'];

/** The words of each stage set, from genesis to commodity. */
export const STAGE_WORDS = {
  Activities: ['Genesis', 'Custom built', 'Product (+rental)', 'Commodity (+utility)'],
  Practices: ['Novel', 'Emerging', 'Good', 'Best'],
  Data: ['Unmodelled', 'Divergent', 'Convergent', 'Modelled'],
  Knowledge: ['Concept', 'Hypothesis', 'Theory', 'Accepted'],
};
/**
 * Where each stage ends, as OnlineWardleyMaps draws its bands. Not yet checked against its code:
 * the design names that as an open fact, and a later step makes the bounds a setting of the file.
 */
export const STAGE_BOUNDS = [0.17, 0.4, 0.7];

/** The order a batch creates record types in, so nothing is written before what it points at. */
export const CREATE_ORDER = [E.map, E.component, E.placement, E.link, E.hiddenLink, E.note, E.movement, E.inertia, E.assessment];
/** The reference fields of each record type, with the type each names. */
export const REFERENCES = {
  [E.map]: {},
  [E.component]: { [F.component.pipelineOf]: E.component },
  [E.placement]: { [F.placement.map]: E.map, [F.placement.component]: E.component },
  [E.link]: { [F.link.from]: E.component, [F.link.to]: E.component },
  [E.hiddenLink]: { [F.hiddenLink.map]: E.map, [F.hiddenLink.link]: E.link },
  [E.note]: { [F.note.map]: E.map },
  [E.movement]: { [F.movement.component]: E.component },
  [E.inertia]: { [F.inertia.component]: E.component },
  [E.assessment]: { [F.assessment.component]: E.component },
};
/** The number fields, kept as exact digits and written as {$nendoNumber}. */
export const NUMBER_FIELDS = new Set([F.placement.visibility, F.placement.evolution, F.placement.labelX, F.placement.labelY,
  F.placement.pipelineFrom, F.placement.pipelineTo, F.movement.to, F.movement.labelX, F.movement.labelY, F.assessment.evolution]);
export const BATCH_LIMIT = 200;

// ---------------------------------------------------------------- numbers

/**
 * A decimal as its canonical digits: a leading zero, no trailing zeros, no plus, so .38 is 0.38
 * and 0.50 is 0.5. Answers null for anything that is not a plain decimal. Never goes through a
 * float, so 0.63 stays 0.63.
 */
export function decimal(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && typeof value.$nendoNumber === 'string') value = value.$nendoNumber;
  if (typeof value === 'number') { if (!Number.isFinite(value)) return null; value = String(value); }
  if (typeof value !== 'string') return null;
  const match = /^\s*([+-]?)(\d*)(?:\.(\d*))?\s*$/.exec(value);
  if (!match || (match[2] === '' && (match[3] ?? '') === '')) return null;
  const whole = match[2].replace(/^0+(?=\d)/, '') || '0';
  const part = (match[3] ?? '').replace(/0+$/, '');
  const digits = part ? `${whole}.${part}` : whole;
  return match[1] === '-' && digits !== '0' ? `-${digits}` : digits;
}
export const toNumber = digits => digits === null || digits === undefined ? null : Number(digits);
/** A number the view computed (a drag), as the digits a map keeps: two places, as OnlineWardleyMaps writes them. */
export const fromNumber = (n, places = 2) => decimal(n.toFixed(places));
export const clamp01 = n => Math.min(1, Math.max(0, n));

/** A record's value of a field as it is kept here: exact digits for a number field, the value otherwise. */
export function valueOf(record, fieldId) {
  const raw = record.values?.[fieldId];
  if (NUMBER_FIELDS.has(fieldId)) return decimal(record.exact?.[fieldId] ?? raw);
  return raw ?? null;
}

/** A record as the host answers it, reduced to what the model keeps: numbers as exact digits. */
export function fromHost(record) {
  const values = {};
  for (const fieldId of Object.keys(record.values ?? {})) values[fieldId] = valueOf(record, fieldId);
  return { entityId: record.entityId, recordId: record.recordId, version: record.version, values };
}

const same = (a, b) => (a ?? null) === (b ?? null);

// ---------------------------------------------------------------- the landscape

/** The records as one Map by record ID, from the lists the view reads, each type by itself. */
export function recordsOf(lists) {
  const records = new Map();
  for (const list of Object.values(lists)) for (const record of list) records.set(record.recordId, fromHost(record));
  return records;
}

export const of = (records, entityId) => [...records.values()].filter(r => r.entityId === entityId);
export const maps = records => of(records, E.map).sort((a, b) => (a.values[F.map.title] ?? '').localeCompare(b.values[F.map.title] ?? ''));
export const nameOf = component => component?.values[F.component.name] ?? '';

/** The component named `name`, exactly; names are unique in the file. */
export function componentNamed(records, name) {
  for (const record of records.values()) if (record.entityId === E.component && nameOf(record) === name) return record;
  return null;
}

/**
 * Where the assessments put a component on `asOf` (a date as yyyy-mm-dd, or null for every one):
 * the latest Accepted assessment on or before that date, the later record first on one date.
 * Proposed and Rejected ones never count. Null when none does.
 */
export function assessedEvolution(records, componentId, asOf = null) {
  let best = null;
  for (const record of records.values()) {
    if (record.entityId !== E.assessment || record.values[F.assessment.component] !== componentId) continue;
    if (record.values[F.assessment.status] !== 'Accepted') continue;
    const date = record.values[F.assessment.date] ?? '';
    if (asOf !== null && date > asOf) continue;
    if (best === null || date > best.date || (date === best.date && record.recordId > best.recordId)) best = { date, recordId: record.recordId, evolution: record.values[F.assessment.evolution] };
  }
  return best?.evolution ?? null;
}

/** The maps that place a component, by record. */
export const mapsShowing = (records, componentId) => of(records, E.placement).filter(p => p.values[F.placement.component] === componentId)
  .map(p => records.get(p.values[F.placement.map])).filter(Boolean);

/**
 * One map as it is drawn on `asOf`: its placed components with where each stands, the links
 * between them that it does not hide, their movements and inertia, and its notes.
 */
export function mapView(records, mapId, asOf = null) {
  const map = records.get(mapId);
  if (!map) return null;
  const placements = of(records, E.placement).filter(p => p.values[F.placement.map] === mapId)
    .sort((a, b) => (Number(a.values[F.placement.order] ?? 0) - Number(b.values[F.placement.order] ?? 0)) || a.recordId.localeCompare(b.recordId));
  const byComponent = new Map();
  const items = [];
  for (const placement of placements) {
    const component = records.get(placement.values[F.placement.component]);
    if (!component || byComponent.has(component.recordId)) continue;
    const drawn = placement.values[F.placement.evolution] ?? null;
    const assessed = assessedEvolution(records, component.recordId, asOf);
    const evolution = drawn ?? assessed ?? '0.5';
    const item = {
      placementId: placement.recordId, componentId: component.recordId, name: nameOf(component),
      type: component.values[F.component.type] ?? 'Activity', sourcing: component.values[F.component.sourcing] ?? null,
      mark: component.values[F.component.mark] ?? null,
      visibility: placement.values[F.placement.visibility] ?? '0.5', evolution, drawn, assessed,
      // A drawn position is unconfirmed until an assessment says the same.
      unconfirmed: drawn !== null && drawn !== assessed,
      labelX: placement.values[F.placement.labelX] ?? null, labelY: placement.values[F.placement.labelY] ?? null,
      pipeline: placement.values[F.placement.pipelineFrom] != null && placement.values[F.placement.pipelineTo] != null
        ? { from: placement.values[F.placement.pipelineFrom], to: placement.values[F.placement.pipelineTo] } : null,
      inertia: false,
    };
    byComponent.set(component.recordId, item);
    items.push(item);
  }
  const hidden = new Set(of(records, E.hiddenLink).filter(h => h.values[F.hiddenLink.map] === mapId).map(h => h.values[F.hiddenLink.link]));
  const links = of(records, E.link)
    .filter(l => byComponent.has(l.values[F.link.from]) && byComponent.has(l.values[F.link.to]) && !hidden.has(l.recordId))
    .map(l => ({ linkId: l.recordId, from: l.values[F.link.from], to: l.values[F.link.to], kind: l.values[F.link.kind] ?? 'Dependency',
      flow: l.values[F.link.flow] ?? null, line: l.values[F.link.line] ?? 'Solid', label: l.values[F.link.label] ?? null }))
    .sort((a, b) => a.linkId.localeCompare(b.linkId));
  const movements = of(records, E.movement).filter(m => byComponent.has(m.values[F.movement.component]))
    .map(m => ({ movementId: m.recordId, componentId: m.values[F.movement.component], to: m.values[F.movement.to], kind: m.values[F.movement.kind] ?? 'Expected',
      evolvedName: m.values[F.movement.evolvedName] ?? null, labelX: m.values[F.movement.labelX] ?? null, labelY: m.values[F.movement.labelY] ?? null }))
    .sort((a, b) => a.movementId.localeCompare(b.movementId));
  for (const inertia of of(records, E.inertia)) {
    const item = byComponent.get(inertia.values[F.inertia.component]);
    if (item) item.inertia = true;
  }
  const notes = of(records, E.note).filter(n => n.values[F.note.map] === mapId)
    .map(n => ({ noteId: n.recordId, kind: n.values[F.note.kind] ?? 'Note', number: n.values[F.note.number] ?? null, text: n.values[F.note.text] ?? '',
      points: parsePoints(n.values[F.note.points]) }))
    .sort((a, b) => a.noteId.localeCompare(b.noteId));
  return { map, mapId, title: map.values[F.map.title] ?? '', stages: map.values[F.map.stages] ?? 'Activities', items, byComponent, links, movements, notes };
}

/** A note's points, JSON pairs of [visibility, evolution] as digits; an empty list for anything else. */
export function parsePoints(text) {
  try {
    const points = JSON.parse(text ?? '[]');
    return Array.isArray(points) ? points.filter(p => Array.isArray(p) && p.length === 2).map(([v, e]) => [decimal(v) ?? '0', decimal(e) ?? '0']) : [];
  } catch { return []; }
}
export const pointsText = points => JSON.stringify(points.map(([v, e]) => [v, e]));

/** The words a map shows for its four stages. */
export function stageWords(map) {
  const set = map?.values[F.map.stages] ?? 'Activities';
  if (set === 'Custom') {
    const words = String(map.values[F.map.customStages] ?? '').split(/\s*(?:->|\n|;)\s*/).filter(Boolean);
    if (words.length === 4) return words;
  }
  return STAGE_WORDS[set] ?? STAGE_WORDS.Activities;
}

/** The stage an evolution falls in, 0 to 3. */
export const stageOf = evolution => STAGE_BOUNDS.filter(bound => Number(evolution) >= bound).length;

// ---------------------------------------------------------------- waiting edits

/** A working copy: the records as they are plus every waiting edit. Each edit copies before it changes. */
export const copy = records => new Map([...records].map(([id, r]) => [id, { ...r, values: { ...r.values } }]));

let counter = 0;
/** A new record ID of a type, unique in the file. Tests pass their own `ids`. */
export const newId = (entityId, ids = null) => ids ? ids(entityId) : `${entityId}.r.${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${(counter += 1)}`}`;

/**
 * The net difference between the records as the file holds them and a working copy, as the
 * writes of one batch: creates in the order of CREATE_ORDER, then updates of only the fields that
 * changed, then deletes with what points at a record before it. Two drags of one component are
 * one field set. A reference to a record the file holds carries the version it was read at,
 * unless the batch touches that record first.
 */
export function difference(committed, working) {
  const creates = [], updates = [], deletes = [];
  for (const record of working.values()) {
    const before = committed.get(record.recordId);
    if (!before) { creates.push(record); continue; }
    const values = {};
    for (const fieldId of new Set([...Object.keys(before.values), ...Object.keys(record.values)])) {
      if (!same(before.values[fieldId], record.values[fieldId])) values[fieldId] = record.values[fieldId] ?? null;
    }
    if (Object.keys(values).length > 0) updates.push({ record: before, values });
  }
  for (const record of committed.values()) if (!working.has(record.recordId)) deletes.push(record);
  const rank = entityId => CREATE_ORDER.indexOf(entityId);
  creates.sort((a, b) => rank(a.entityId) - rank(b.entityId) || a.recordId.localeCompare(b.recordId));
  // A component created in this batch that another created component's pipeline names comes first.
  deletes.sort((a, b) => rank(b.entityId) - rank(a.entityId) || a.recordId.localeCompare(b.recordId));
  updates.sort((a, b) => rank(a.record.entityId) - rank(b.record.entityId) || a.record.recordId.localeCompare(b.record.recordId));
  const touched = new Set();
  const targets = (entityId, values) => {
    const out = {};
    for (const fieldId of Object.keys(REFERENCES[entityId] ?? {})) {
      const target = values[fieldId];
      if (target === null || target === undefined || touched.has(target)) continue;
      const held = committed.get(target);
      if (held) out[fieldId] = held.version;
    }
    return Object.keys(out).length ? { targetVersions: out } : {};
  };
  const writes = [];
  for (const record of creates) {
    writes.push({ op: 'create', entityId: record.entityId, recordId: record.recordId, values: hostValues(record.values), ...targets(record.entityId, record.values) });
    touched.add(record.recordId);
  }
  for (const { record, values } of updates) {
    writes.push({ op: 'update', entityId: record.entityId, recordId: record.recordId, version: record.version, values: hostValues(values), ...targets(record.entityId, values) });
    touched.add(record.recordId);
  }
  for (const record of deletes) writes.push({ op: 'delete', entityId: record.entityId, recordId: record.recordId, version: record.version });
  return writes;
}

/** Values as the host takes them: a number field's digits as {$nendoNumber}, so none is rounded. */
export function hostValues(values) {
  const out = {};
  for (const [fieldId, value] of Object.entries(values)) {
    if (value === undefined) continue;
    out[fieldId] = NUMBER_FIELDS.has(fieldId) && value !== null ? { $nendoNumber: value } : value;
  }
  return out;
}

/** The waiting edits as a list a browser can keep: each changed record, created or deleted, with the version it was made from. */
export function overlay(committed, working) {
  const entries = [];
  for (const record of working.values()) {
    const before = committed.get(record.recordId);
    if (!before) entries.push({ op: 'create', entityId: record.entityId, recordId: record.recordId, values: record.values });
    else if (Object.keys({ ...before.values, ...record.values }).some(f => !same(before.values[f], record.values[f]))) {
      const values = {};
      for (const f of Object.keys({ ...before.values, ...record.values })) if (!same(before.values[f], record.values[f])) values[f] = record.values[f] ?? null;
      entries.push({ op: 'update', entityId: record.entityId, recordId: record.recordId, base: before.version, values });
    }
  }
  for (const record of committed.values()) if (!working.has(record.recordId)) entries.push({ op: 'delete', entityId: record.entityId, recordId: record.recordId, base: record.version });
  return entries;
}

/**
 * The waiting edits laid over the records as the file now holds them. An edit of a record changed
 * or deleted since it was made is a conflict: it is said, and kept, so a commit is refused as
 * stale rather than writing over somebody else's change.
 */
export function apply(committed, entries) {
  const working = copy(committed);
  const conflicts = [];
  for (const entry of entries) {
    const held = committed.get(entry.recordId);
    if (entry.op === 'create') { if (!held) working.set(entry.recordId, { entityId: entry.entityId, recordId: entry.recordId, version: null, values: { ...entry.values } }); continue; }
    if (!held) { conflicts.push(entry.recordId); continue; }
    if (held.version !== entry.base) conflicts.push(entry.recordId);
    if (entry.op === 'delete') working.delete(entry.recordId);
    else Object.assign(working.get(entry.recordId).values, entry.values);
  }
  // A record whose reference was deleted since is dropped with it, so the copy never points at nothing.
  return { working: dropDangling(working), conflicts };
}

/** Removes every record that points at one the copy no longer holds, until none does. */
export function dropDangling(working) {
  for (let changed = true; changed;) {
    changed = false;
    for (const record of [...working.values()]) {
      for (const fieldId of Object.keys(REFERENCES[record.entityId] ?? {})) {
        const target = record.values[fieldId];
        if (target === null || target === undefined || working.has(target)) continue;
        if (fieldId === F.component.pipelineOf) { record.values[fieldId] = null; continue; }
        working.delete(record.recordId); changed = true; break;
      }
    }
  }
  return working;
}

// ---------------------------------------------------------------- gestures on a working copy

const create = (working, entityId, values, ids) => {
  const recordId = newId(entityId, ids);
  working.set(recordId, { entityId, recordId, version: null, values });
  return recordId;
};

/** A new component placed on a map where it was dropped: a drawn position, hollow until confirmed. */
export function addComponent(working, mapId, { name, visibility, evolution, type = 'Activity' }, ids = null) {
  if (componentNamed(working, name)) throw new Error(`A component named ${name} is already in the landscape. Names are unique in the file.`);
  const componentId = create(working, E.component, { [F.component.name]: name, [F.component.type]: type }, ids);
  const order = nextOrder(working, mapId);
  const placementId = create(working, E.placement, { [F.placement.map]: mapId, [F.placement.component]: componentId,
    [F.placement.visibility]: visibility, [F.placement.evolution]: evolution, [F.placement.order]: order }, ids);
  return { componentId, placementId };
}

/** Places a component the landscape already holds on a map, at its visibility there. */
export function placeComponent(working, mapId, componentId, visibility, evolution = null, ids = null) {
  return create(working, E.placement, { [F.placement.map]: mapId, [F.placement.component]: componentId,
    [F.placement.visibility]: visibility, [F.placement.evolution]: evolution, [F.placement.order]: nextOrder(working, mapId) }, ids);
}

const nextOrder = (working, mapId) => Math.max(0, ...of(working, E.placement).filter(p => p.values[F.placement.map] === mapId)
  .map(p => Number(p.values[F.placement.order] ?? 0))) + 1;

/** A drag: this map's visibility, and a drawn evolution that waits for confirmation. */
export function move(working, placementId, visibility, evolution) {
  const placement = working.get(placementId);
  if (!placement) return;
  placement.values[F.placement.visibility] = visibility;
  const component = placement.values[F.placement.component];
  // Dragged back onto where the assessments put it, the map follows the landscape again.
  placement.values[F.placement.evolution] = evolution === assessedEvolution(working, component) ? null : evolution;
}

/** A dependency between two components, unless one already joins them in either direction. */
export function addLink(working, from, to, ids = null, values = {}) {
  if (from === to) return null;
  const existing = of(working, E.link).find(l => (l.values[F.link.from] === from && l.values[F.link.to] === to) || (l.values[F.link.from] === to && l.values[F.link.to] === from));
  if (existing) return existing.recordId;
  return create(working, E.link, { [F.link.from]: from, [F.link.to]: to, [F.link.kind]: 'Dependency', [F.link.line]: 'Solid', ...values }, ids);
}

export function rename(working, componentId, name) {
  const holder = componentNamed(working, name);
  if (holder && holder.recordId !== componentId) throw new Error(`A component named ${name} is already in the landscape. Names are unique in the file.`);
  working.get(componentId).values[F.component.name] = name;
}

/**
 * Takes a component off one map: its placement, and the hidings of links it no longer draws. A
 * component the file does not hold yet and no other map places goes with it.
 */
export function removeFromMap(working, committed, placementId) {
  const placement = working.get(placementId);
  if (!placement) return;
  const componentId = placement.values[F.placement.component];
  working.delete(placementId);
  if (!committed.has(componentId) && !of(working, E.placement).some(p => p.values[F.placement.component] === componentId)) deleteFromLandscape(working, componentId);
  dropDangling(working);
}

/** What deleting a component from the landscape takes with it, counted for the question first. */
export function landscapeCost(working, componentId) {
  const touches = r => Object.keys(REFERENCES[r.entityId] ?? {}).some(f => r.values[f] === componentId && f !== F.component.pipelineOf);
  const going = [...working.values()].filter(touches);
  const count = entityId => going.filter(r => r.entityId === entityId).length;
  return { links: count(E.link), assessments: count(E.assessment), placements: count(E.placement),
    maps: new Set(going.filter(r => r.entityId === E.placement).map(r => r.values[F.placement.map])).size, records: going.length };
}

export function deleteFromLandscape(working, componentId) {
  working.delete(componentId);
  return dropDangling(working);
}

/**
 * Confirms a map's drawn positions: each becomes an Accepted assessment dated `today`, and the
 * map follows the landscape again. Answers how many it confirmed.
 */
export function confirm(working, mapId, today, { method = 'Judgement', note = null } = {}, ids = null) {
  let count = 0;
  for (const placement of of(working, E.placement)) {
    if (placement.values[F.placement.map] !== mapId) continue;
    const drawn = placement.values[F.placement.evolution];
    if (drawn === null || drawn === undefined) continue;
    const componentId = placement.values[F.placement.component];
    if (drawn !== assessedEvolution(working, componentId)) {
      create(working, E.assessment, { [F.assessment.component]: componentId, [F.assessment.date]: today, [F.assessment.evolution]: drawn,
        [F.assessment.method]: method, [F.assessment.status]: 'Accepted', [F.assessment.note]: note }, ids);
      count += 1;
    }
    placement.values[F.placement.evolution] = null;
  }
  return count;
}

/** Today in the person's own time zone, as yyyy-mm-dd. */
export function today(now = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * What Commit sends: the net difference as one batch, or a refusal said before anything is sent
 * when it is more than one batch can hold. The edits then keep waiting.
 */
export function commitPlan(committed, working) {
  const writes = difference(committed, working);
  if (writes.length > BATCH_LIMIT) {
    return { writes, refused: `This commit needs ${writes.length} record writes, and one commit holds at most ${BATCH_LIMIT}. Nothing was sent; your edits still wait. Commit part of them, or discard some.` };
  }
  return { writes, refused: null };
}
