// A map as OnlineWardleyMaps text, both ways. The text is a view of the records: it is printed
// from them, and text that is typed or imported becomes the same waiting edits as a drag. Lines
// that Terrain does not model are kept word for word, at their place, in the map's Text lines.
// Pure: no DOM, so node's tests read and print every corpus map.

import { E, F, decimal, of, copy, mapView, componentNamed, assessedEvolution, newId, removeFromMap, dropDangling, pointsText, nameOf } from './model.mjs';

const POSITION = String.raw`\[\s*([^,\[\]]+?)\s*,\s*([^,\[\]]+?)\s*\]`;
const DECORATORS = { '(build)': ['sourcing', 'Build'], '(buy)': ['sourcing', 'Buy'], '(outsource)': ['sourcing', 'Outsource'],
  '(market)': ['mark', 'Market'], '(ecosystem)': ['mark', 'Ecosystem'], 'inertia': ['inertia', true], '(inertia)': ['inertia', true] };
const FLOW_SIGNS = { '>': 'Forward', '<': 'Back', '<>': 'Both' };
const FLOW_SIGN = { Forward: '>', Back: '<', Both: '<>' };
/** The keywords OnlineWardleyMaps knows that Terrain keeps as they are, without modelling them. */
const KEPT_KEYWORDS = /^(style|size|evolution|y-axis|url|submap|market|ecosystem|build|buy|outsource|pioneers|settlers|townplanners|x-axis)\b/;

const position = (v, e) => {
  const visibility = decimal(v), evolution = decimal(e);
  return visibility === null || evolution === null ? null : { visibility, evolution };
};
const error = (text, reason) => ({ kind: 'error', text, reason });

/** One line of OnlineWardleyMaps text as what it says. */
export function parseLine(text) {
  const line = text.trim();
  if (line === '' || line.startsWith('//')) return { kind: 'raw', text };
  let m;
  if ((m = /^title\s+(.+)$/.exec(line))) return { kind: 'title', text: m[1].trim() };
  if ((m = new RegExp(`^(anchor|component)\\s+(.+?)\\s*${POSITION}(.*)$`).exec(line))) {
    const at = position(m[3], m[4]);
    if (!at) return error(text, `The position of ${m[2]} is not two numbers.`);
    const result = { kind: 'component', keyword: m[1], name: m[2].trim(), ...at, labelX: null, labelY: null, inertia: false, sourcing: null, mark: null };
    let rest = m[5].trim();
    const label = new RegExp(`^label\\s*${POSITION}`).exec(rest) ?? new RegExp(`\\blabel\\s*${POSITION}`).exec(rest);
    if (label) {
      const x = decimal(label[1]), y = decimal(label[2]);
      if (x === null || y === null) return error(text, `The label of ${result.name} is not two numbers.`);
      result.labelX = x; result.labelY = y;
      rest = (rest.slice(0, label.index) + rest.slice(label.index + label[0].length)).trim();
    }
    for (const word of rest.split(/\s+/).filter(Boolean)) {
      const decorator = DECORATORS[word.toLowerCase()];
      if (!decorator) return error(text, `"${word}" after ${result.name} is not a word Terrain reads. It reads label, inertia, (build), (buy), (outsource), (market) and (ecosystem).`);
      result[decorator[0]] = decorator[1];
    }
    if (m[1] === 'anchor' && (result.sourcing || result.mark || result.inertia)) return error(text, `${result.name} is an anchor, a user, which takes no sourcing, mark or inertia.`);
    return result;
  }
  if (/^(anchor|component)\b/.test(line)) return error(text, 'A component needs a name and a position, such as: component Kettle [0.45, 0.57]');
  if ((m = /^evolve\s+(.+?)(?:\s*->\s*(.+?))?\s+([^\s\[\]]+)(?:\s+label\s*\[\s*([^,\]]+?)\s*,\s*([^\]]+?)\s*\])?\s*$/.exec(line))) {
    const to = decimal(m[3]);
    if (to === null) return error(text, `The evolve of ${m[1]} does not end in a number.`);
    const labelX = m[4] === undefined ? null : decimal(m[4]), labelY = m[5] === undefined ? null : decimal(m[5]);
    if (m[4] !== undefined && (labelX === null || labelY === null)) return error(text, `The label of the evolve of ${m[1]} is not two numbers.`);
    return { kind: 'evolve', name: m[1].trim(), newName: m[2]?.trim() || null, to, labelX, labelY };
  }
  if (/^evolve\b/.test(line)) return error(text, 'An evolve needs a name and a number, such as: evolve Kettle 0.62');
  if ((m = new RegExp(`^pipeline\\s+(.+?)\\s*${POSITION}\\s*$`).exec(line))) {
    const from = decimal(m[2]), to = decimal(m[3]);
    if (from === null || to === null) return error(text, `The range of the pipeline of ${m[1]} is not two numbers.`);
    return { kind: 'pipeline', name: m[1].trim(), from, to };
  }
  if ((m = new RegExp(`^(note|accelerator|deaccelerator)\\s+(.+?)\\s*${POSITION}\\s*$`).exec(line))) {
    const at = position(m[3], m[4]);
    if (!at) return error(text, `The position of the ${m[1]} is not two numbers.`);
    return { kind: m[1], text: m[2].trim(), ...at };
  }
  if ((m = new RegExp(`^annotations\\s*${POSITION}\\s*$`).exec(line))) {
    const at = position(m[1], m[2]);
    if (!at) return error(text, 'The position of the annotations is not two numbers.');
    return { kind: 'annotations', ...at };
  }
  if ((m = /^annotation\s+(\d+)\s*(\[\s*\[.*?\]\s*\]|\[[^\[\]]*\])\s*(.*)$/.exec(line))) {
    const points = [...m[2].matchAll(new RegExp(POSITION, 'g'))].map(p => position(p[1], p[2]));
    if (points.length === 0 || points.some(p => p === null)) return error(text, `The points of annotation ${m[1]} are not pairs of numbers.`);
    return { kind: 'annotation', number: Number(m[1]), points: points.map(p => [p.visibility, p.evolution]), text: m[3].trim() };
  }
  if (/^(note|accelerator|deaccelerator|annotations?|pipeline)\b/.test(line)) return error(text, `This ${line.split(/\s/)[0]} is missing its position.`);
  if ((m = /^title\b/.exec(line))) return error(text, 'A title needs words after it.');
  if (KEPT_KEYWORDS.test(line)) return { kind: 'raw', text };
  if ((m = /^(.+?)\s*\+(?:'([^']*)')?(<>|<|>)\s*(.+?)$/.exec(line))) {
    return { kind: 'link', from: m[1].trim(), to: m[4].trim(), flow: FLOW_SIGNS[m[3]], label: m[2] ?? null };
  }
  if ((m = /^(.+?)\s*->\s*(.+?)(?:\s*;\s*(.*?))?\s*$/.exec(line))) {
    return { kind: 'link', from: m[1].trim(), to: m[2].trim(), flow: null, label: m[3] ? m[3] : null };
  }
  return { kind: 'raw', text };
}

/**
 * The whole text as lines, each with its number from 1. A name given to two components, or a
 * pair linked twice, is a mistake in the text: said by its line, so nothing half-read is applied.
 */
export function parse(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n').map((raw, i) => ({ ...parseLine(raw), source: raw, line: i + 1 }));
  // A trailing newline is not a blank line of the map.
  if (lines.length > 1 && lines.at(-1).kind === 'raw' && lines.at(-1).text === '') lines.pop();
  const names = new Map(), pairs = new Set(), pipelines = new Map();
  let title = null;
  for (const entry of lines) {
    if (entry.kind === 'title') {
      if (title !== null) Object.assign(entry, { kind: 'error', reason: `The map has its title on line ${title} already.` });
      else title = entry.line;
    }
    if (entry.kind === 'pipeline') {
      if (pipelines.has(entry.name)) Object.assign(entry, { kind: 'error', reason: `${entry.name} has its pipeline on line ${pipelines.get(entry.name)} already.` });
      else pipelines.set(entry.name, entry.line);
    }
    if (entry.kind === 'link' && entry.from === entry.to) Object.assign(entry, { kind: 'error', reason: `${entry.from} is linked to itself.` });
    if (entry.kind === 'component') {
      if (names.has(entry.name)) Object.assign(entry, { kind: 'error', reason: `${entry.name} is on line ${names.get(entry.name)} already. Names are unique in the file.` });
      else names.set(entry.name, entry.line);
    }
    if (entry.kind === 'link') {
      const pair = [entry.from, entry.to].sort().join('\u0000');
      if (pairs.has(pair)) Object.assign(entry, { kind: 'error', reason: `${entry.from} and ${entry.to} are linked on an earlier line already.` });
      else pairs.add(pair);
    }
  }
  return { lines, errors: lines.filter(entry => entry.kind === 'error').map(entry => ({ line: entry.line, reason: entry.reason })) };
}

// ---------------------------------------------------------------- printing

const at = (v, e) => `[${v}, ${e}]`;

/** The text layout a map keeps: modelled lines by key, other lines word for word. */
export function layoutOf(map) {
  try {
    const layout = JSON.parse(map?.values[F.map.lines] ?? '[]');
    return Array.isArray(layout) ? layout.filter(entry => typeof entry === 'string' || (entry && typeof entry.t === 'string')) : [];
  } catch { return []; }
}

/**
 * A map as OnlineWardleyMaps text. The same records always print the same text: each line where
 * the map's Text lines put it, then any modelled line they do not name, in a fixed order.
 */
export function print(records, mapId, asOf = null) {
  const view = mapView(records, mapId, asOf);
  if (!view) return '';
  const name = id => view.byComponent.get(id)?.name ?? '';
  const lines = new Map();
  lines.set('title', `title ${view.title}`);
  for (const item of view.items) {
    let line = `${item.type === 'User' ? 'anchor' : 'component'} ${item.name} ${at(item.visibility, item.evolution)}`;
    if (item.labelX !== null && item.labelY !== null) line += ` label ${at(item.labelX, item.labelY)}`;
    if (item.inertia && item.type !== 'User') line += ' inertia';
    if (item.sourcing && item.type !== 'User') line += ` (${item.sourcing.toLowerCase()})`;
    if (item.mark && item.type !== 'User') line += ` (${item.mark.toLowerCase()})`;
    lines.set(`c:${item.componentId}`, line);
  }
  for (const item of view.items) if (item.pipeline) lines.set(`p:${item.componentId}`, `pipeline ${item.name} ${at(item.pipeline.from, item.pipeline.to)}`);
  for (const movement of view.movements) {
    let line = `evolve ${name(movement.componentId)}${movement.evolvedName ? `->${movement.evolvedName}` : ''} ${movement.to}`;
    if (movement.labelX !== null && movement.labelY !== null) line += ` label ${at(movement.labelX, movement.labelY)}`;
    lines.set(`e:${movement.movementId}`, line);
  }
  for (const link of view.links) {
    const line = link.kind === 'Flow'
      ? `${name(link.from)}+${link.label ? `'${link.label}'` : ''}${FLOW_SIGN[link.flow ?? 'Forward']}${name(link.to)}`
      : `${name(link.from)}->${name(link.to)}${link.label ? `; ${link.label}` : ''}`;
    lines.set(`l:${link.linkId}`, line);
  }
  for (const note of view.notes) {
    const [first] = note.points.length ? note.points : [['0', '0']];
    const line = note.kind === 'Annotation'
      ? `annotation ${note.number ?? 1} ${note.points.length > 1 ? `[${note.points.map(([v, e]) => at(v, e)).join(',')}]` : at(first[0], first[1])}${note.text ? ` ${note.text}` : ''}`
      : note.kind === 'Legend' ? `annotations ${at(first[0], first[1])}`
        : `${note.kind.toLowerCase()} ${note.text} ${at(first[0], first[1])}`;
    lines.set(`n:${note.noteId}`, line);
  }
  const out = [], printed = new Set();
  for (const entry of layoutOf(view.map)) {
    if (typeof entry !== 'string') { out.push(entry.t); continue; }
    if (lines.has(entry) && !printed.has(entry)) { out.push(lines.get(entry)); printed.add(entry); }
  }
  if (!printed.has('title')) { out.unshift(lines.get('title')); printed.add('title'); }
  for (const [key, line] of lines) if (!printed.has(key)) out.push(line);
  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------- reading text into the records

/**
 * The working copy with a map's text applied: the same waiting edits a person's drags, typing and
 * deletions would make. `mode` is 'edit' for the text pane and 'import' for a new map from text.
 *
 * - A name the map shows is that component. A name another map shows places that record here.
 * - A line whose name changed but whose numbers stayed the same is a rename (in the text pane).
 * - A new name makes a component: in the pane at a drawn position to confirm; on import with an
 *   Imported assessment dated `today`. A known component whose position differs gets a drawn one.
 * - A component, link, movement or note the text no longer names leaves this map. A link that
 *   another map still draws is hidden here rather than deleted.
 * - A link, evolve or pipeline that names a component the map does not show is kept as text.
 *
 * Answers { working, applied } or { errors } when a line does not parse; then nothing is applied.
 */
export function applyText(working, committed, mapId, text, { mode = 'edit', today, ids = null } = {}) {
  const parsed = parse(text);
  if (parsed.errors.length) return { errors: parsed.errors };
  const w = copy(working);
  const map = w.get(mapId);
  if (!map) return { errors: [{ line: 0, reason: 'The map is no longer in the file.' }] };
  const before = mapView(w, mapId);
  const create = (entityId, values) => { const recordId = newId(entityId, ids); w.set(recordId, { entityId, recordId, version: null, values }); return recordId; };
  const lines = parsed.lines;

  // Components first: which line is which placement.
  const lineOf = new Map(); // line -> componentId
  const used = new Set();
  const componentLines = lines.filter(l => l.kind === 'component');
  for (const line of componentLines) {
    const item = before.items.find(i => i.name === line.name && !used.has(i.placementId));
    if (item) { lineOf.set(line, item); used.add(item.placementId); }
  }
  if (mode === 'edit') {
    // A changed name on a line whose numbers stayed the same is a rename, as OnlineWardleyMaps renames.
    for (const line of componentLines) {
      if (lineOf.has(line) || componentNamed(w, line.name)) continue;
      const item = before.items.find(i => !used.has(i.placementId) && i.visibility === line.visibility && i.evolution === line.evolution);
      if (item) { lineOf.set(line, item); used.add(item.placementId); w.get(item.componentId).values[F.component.name] = line.name; }
    }
  }
  for (const item of before.items) if (!used.has(item.placementId)) removeFromMap(w, committed, item.placementId);
  let order = 0;
  const placed = new Map(); // name -> componentId, after this text
  for (const line of componentLines) {
    order += 1;
    let componentId, placementId;
    const item = lineOf.get(line);
    if (item) { componentId = item.componentId; placementId = item.placementId; }
    else {
      const known = componentNamed(w, line.name);
      if (known) componentId = known.recordId;
      else {
        componentId = create(E.component, { [F.component.name]: line.name, [F.component.type]: line.keyword === 'anchor' ? 'User' : 'Activity' });
        if (mode === 'import') create(E.assessment, { [F.assessment.component]: componentId, [F.assessment.date]: today, [F.assessment.evolution]: line.evolution,
          [F.assessment.method]: 'Imported', [F.assessment.status]: 'Accepted' });
      }
      placementId = create(E.placement, { [F.placement.map]: mapId, [F.placement.component]: componentId });
    }
    const component = w.get(componentId), placement = w.get(placementId);
    const type = component.values[F.component.type] ?? 'Activity';
    component.values[F.component.type] = line.keyword === 'anchor' ? 'User' : type === 'User' ? 'Activity' : type;
    // On import a known component keeps what its line does not say; in the pane the line is all of it.
    const keep = mode === 'import' && !!(item || componentNamed(working, line.name));
    if (!keep || line.sourcing) component.values[F.component.sourcing] = line.sourcing;
    if (!keep || line.mark) component.values[F.component.mark] = line.mark;
    const assessed = assessedEvolution(w, componentId);
    Object.assign(placement.values, {
      [F.placement.visibility]: line.visibility,
      [F.placement.evolution]: line.evolution === assessed ? null : line.evolution,
      [F.placement.labelX]: line.labelX, [F.placement.labelY]: line.labelY,
      [F.placement.pipelineFrom]: null, [F.placement.pipelineTo]: null, [F.placement.order]: order,
    });
    const inertia = of(w, E.inertia).filter(i => i.values[F.inertia.component] === componentId);
    if (line.inertia && inertia.length === 0) create(E.inertia, { [F.inertia.component]: componentId });
    if (!line.inertia && !keep) for (const record of inertia) w.delete(record.recordId);
    lineOf.set(line, { componentId, placementId });
    placed.set(line.name, componentId);
  }

  // Then what joins them, each by the names the text gives.
  const keys = new Map(); // line -> key in the layout
  for (const line of componentLines) keys.set(line, `c:${lineOf.get(line).componentId}`);
  const hidden = of(w, E.hiddenLink).filter(h => h.values[F.hiddenLink.map] === mapId);
  const seenLinks = new Set();
  for (const line of lines.filter(l => l.kind === 'link')) {
    const from = placed.get(line.from), to = placed.get(line.to);
    if (!from || !to) { Object.assign(line, { kind: 'raw', text: line.source }); continue; }
    let link = of(w, E.link).find(l => (l.values[F.link.from] === from && l.values[F.link.to] === to) || (l.values[F.link.from] === to && l.values[F.link.to] === from));
    if (!link) link = w.get(create(E.link, { [F.link.line]: 'Solid' }));
    Object.assign(link.values, { [F.link.from]: from, [F.link.to]: to, [F.link.kind]: line.flow ? 'Flow' : 'Dependency', [F.link.flow]: line.flow, [F.link.label]: line.label });
    link.values[F.link.line] ??= 'Solid';
    for (const h of hidden.filter(h => h.values[F.hiddenLink.link] === link.recordId)) w.delete(h.recordId);
    seenLinks.add(link.recordId);
    keys.set(line, `l:${link.recordId}`);
  }
  const onMap = new Set(placed.values());
  const elsewhere = link => of(w, E.map).some(other => other.recordId !== mapId && mapView(w, other.recordId).links.some(l => l.linkId === link.recordId));
  for (const link of of(w, E.link)) {
    if (seenLinks.has(link.recordId) || !onMap.has(link.values[F.link.from]) || !onMap.has(link.values[F.link.to])) continue;
    if (of(w, E.hiddenLink).some(h => h.values[F.hiddenLink.map] === mapId && h.values[F.hiddenLink.link] === link.recordId)) continue;
    if (elsewhere(link)) create(E.hiddenLink, { [F.hiddenLink.map]: mapId, [F.hiddenLink.link]: link.recordId });
    else w.delete(link.recordId);
  }

  const seenMovements = new Set();
  for (const line of lines.filter(l => l.kind === 'evolve')) {
    const componentId = placed.get(line.name);
    if (!componentId) { Object.assign(line, { kind: 'raw', text: line.source }); continue; }
    let movement = of(w, E.movement).find(m => m.values[F.movement.component] === componentId && !seenMovements.has(m.recordId));
    if (!movement) movement = w.get(create(E.movement, { [F.movement.component]: componentId, [F.movement.kind]: 'Expected' }));
    Object.assign(movement.values, { [F.movement.to]: line.to, [F.movement.evolvedName]: line.newName, [F.movement.labelX]: line.labelX, [F.movement.labelY]: line.labelY });
    seenMovements.add(movement.recordId);
    keys.set(line, `e:${movement.recordId}`);
  }
  // An import never takes a movement away from a component another map shows.
  if (mode !== 'import') for (const movement of of(w, E.movement)) if (onMap.has(movement.values[F.movement.component]) && !seenMovements.has(movement.recordId)) w.delete(movement.recordId);

  for (const line of lines.filter(l => l.kind === 'pipeline')) {
    const componentId = placed.get(line.name);
    if (!componentId) { Object.assign(line, { kind: 'raw', text: line.source }); continue; }
    const placement = w.get(lineOf.get(componentLines.find(c => c.name === line.name)).placementId);
    placement.values[F.placement.pipelineFrom] = line.from;
    placement.values[F.placement.pipelineTo] = line.to;
    keys.set(line, `p:${componentId}`);
  }

  // Notes, matched to the map's own of the same kind in the order the text gives them.
  const KIND = { note: 'Note', annotation: 'Annotation', annotations: 'Legend', accelerator: 'Accelerator', deaccelerator: 'Deaccelerator' };
  const layout = layoutOf(map);
  const rank = id => { const i = layout.indexOf(`n:${id}`); return i < 0 ? Infinity : i; };
  const existing = of(w, E.note).filter(n => n.values[F.note.map] === mapId).sort((a, b) => rank(a.recordId) - rank(b.recordId) || a.recordId.localeCompare(b.recordId));
  const usedNotes = new Set();
  for (const line of lines.filter(l => KIND[l.kind])) {
    const kind = KIND[line.kind];
    let note = existing.find(n => n.values[F.note.kind] === kind && !usedNotes.has(n.recordId));
    if (!note) note = w.get(create(E.note, { [F.note.map]: mapId, [F.note.kind]: kind }));
    const points = line.points ?? [[line.visibility, line.evolution]];
    Object.assign(note.values, { [F.note.text]: line.kind === 'annotations' ? null : line.text, [F.note.number]: line.kind === 'annotation' ? line.number : null,
      [F.note.points]: pointsText(points) });
    usedNotes.add(note.recordId);
    keys.set(line, `n:${note.recordId}`);
  }
  for (const note of existing) if (!usedNotes.has(note.recordId)) w.delete(note.recordId);

  const title = lines.find(l => l.kind === 'title');
  if (title) map.values[F.map.title] = title.text;
  map.values[F.map.lines] = JSON.stringify(lines.map(line => line.kind === 'title' ? 'title' : line.kind === 'raw' ? { t: line.source } : keys.get(line) ?? { t: line.source }));
  if (mode === 'import') map.values[F.map.syntax] = 'OnlineWardleyMaps';
  dropDangling(w);
  return { working: w, applied: true };
}

/** A new, empty map record in a working copy, ready for text to be applied to it. */
export function newMap(working, title, ids = null) {
  const recordId = newId(E.map, ids);
  working.set(recordId, { entityId: E.map, recordId, version: null, values: { [F.map.title]: title, [F.map.stages]: 'Activities', [F.map.status]: 'Draft',
    [F.map.lines]: JSON.stringify(['title']), [F.map.syntax]: 'OnlineWardleyMaps' } });
  return recordId;
}

/** Imports text as a new map. Never moves another map. */
export function importMap(working, committed, text, options = {}) {
  const parsed = parse(text);
  if (parsed.errors.length) return { errors: parsed.errors };
  const w = copy(working);
  const title = parsed.lines.find(l => l.kind === 'title')?.text ?? 'Imported map';
  const mapId = newMap(w, title, options.ids);
  const result = applyText(w, committed, mapId, text, { ...options, mode: 'import' });
  return result.errors ? result : { ...result, mapId };
}

export { nameOf };
