// Terrain's map view: one map of the landscape, drawn in SVG, edited by draft and commit as Archi
// edits a view. Drags, typing in the text pane and deletions are waiting edits, kept in this
// browser with their map; Commit writes their net difference as one revision, and Undo takes a
// commit back whole (ADR-0023). The model, the text and the checks are in the pure modules.

import * as M from './model.mjs';
import { E, F } from './model.mjs';
import { print, applyText, importMap, newMap } from './owm.mjs';
import { validate } from './validate.mjs';
import { drawMap, geometry, WHITE, PAPER } from './draw.mjs';

const nendo = window.nendo;
const $ = id => document.getElementById(id);
const TYPES = Object.values(E);
const READ_MAX = 50000;
const STEPS_KEPT = 100;
const NUDGE = 0.01;

const state = {
  committed: new Map(), working: new Map(), mapId: null, selected: null,
  undo: [], redo: [], commits: [], undone: [],
  textOpen: true, validateOpen: false, confirm: true, zoom: 1, fitted: true,
  readOnly: false, nativeChrome: false, loaded: false, settings: {}, textErrors: [], conflicts: [],
  viewId: 'terrain', cut: [],
};

const describe = error => error?.message ?? String(error);
function setStatus(text, problem = false) {
  $('summary').textContent = text;
  $('summary').classList.toggle('problem', problem);
}

// ---------------------------------------------------------------- reading

let newestRead = null;
function readAll() {
  const reading = (async () => {
    const lists = await Promise.all(TYPES.map(entityId => nendo.records.queryAll({ entityId }, { max: READ_MAX + 1 })));
    if (reading !== newestRead) return newestRead;
    state.cut = TYPES.filter((_, i) => lists[i].length > READ_MAX);
    state.committed = M.recordsOf(lists.map(list => list.slice(0, READ_MAX)));
    const { working, conflicts } = M.apply(state.committed, keptEdits());
    state.working = working;
    state.conflicts = conflicts;
    if (!state.loaded) {
      state.loaded = true;
      state.mapId = kept('map') ?? null;
    }
    if (!state.mapId || !state.working.has(state.mapId)) state.mapId = M.maps(state.working)[0]?.recordId ?? null;
    if (state.selected && !state.working.has(state.selected)) state.selected = null;
    render({ text: true });
    if (state.fitted) fitWidth();
  })();
  newestRead = reading;
  return reading;
}

let pendingRead = null;
function schedule() {
  clearTimeout(pendingRead);
  pendingRead = setTimeout(() => readAll().catch(error => setStatus(`The map could not be read. ${describe(error)}`, true)), 120);
}

// ---------------------------------------------------------------- waiting edits

/** The browser keeps the waiting edits and the open map; a reload or another screen loses neither. */
const storeKey = name => `terrain:${state.viewId}:${name}`;
function kept(name) { try { return JSON.parse(localStorage.getItem(storeKey(name)) ?? 'null'); } catch { return null; } }
function keep(name, value) {
  try { if (value === null) localStorage.removeItem(storeKey(name)); else localStorage.setItem(storeKey(name), JSON.stringify(value)); } catch { /* this visit only */ }
}
const keptEdits = () => kept('edits') ?? [];
const waiting = () => M.overlay(state.committed, state.working);
function keepEdits() {
  const entries = waiting();
  keep('edits', entries.length ? entries : null);
}

/** One gesture: a step Undo takes back, made on a copy so a failed gesture changes nothing. */
function edit(label, gesture, { text = true } = {}) {
  if (state.readOnly) { setStatus('This file is open read-only.', true); return false; }
  const next = M.copy(state.working);
  try { gesture(next); } catch (error) { setStatus(describe(error), true); return false; }
  state.undo.push({ label, entries: waiting() });
  if (state.undo.length > STEPS_KEPT) state.undo.shift();
  state.redo = [];
  state.working = M.dropDangling(next);
  keepEdits();
  render({ text });
  return true;
}

function undo() {
  if (state.undo.length) {
    const step = state.undo.pop();
    state.redo.push({ label: step.label, entries: waiting() });
    state.working = M.apply(state.committed, step.entries).working;
    keepEdits();
    render({ text: true });
    setStatus(`Undid ${step.label}.`);
    return;
  }
  const commit = state.commits.pop();
  if (!commit) { setStatus('Nothing to undo.'); return; }
  nendo.records.undo(commit.revision, { label: `Undo ${commit.label}`.slice(0, 80) }).then(answer => {
    state.undone.push({ label: commit.label, revision: answer.revision });
    setStatus(`Undid ${commit.label}. The file is as it was before that commit.`);
    return readAll();
  }).catch(error => { state.commits.push(commit); setStatus(`Undo was refused: ${describe(error)}`, true); });
}

function redo() {
  if (state.redo.length) {
    const step = state.redo.pop();
    state.undo.push({ label: step.label, entries: waiting() });
    state.working = M.apply(state.committed, step.entries).working;
    keepEdits();
    render({ text: true });
    setStatus(`Redid ${step.label}.`);
    return;
  }
  const undone = state.undone.pop();
  if (!undone) { setStatus('Nothing to redo.'); return; }
  nendo.records.redo(undone.revision, { label: `Redo ${undone.label}`.slice(0, 80) }).then(answer => {
    state.commits.push({ label: undone.label, revision: answer.revision });
    return readAll();
  }).catch(error => { state.undone.push(undone); setStatus(`Redo was refused: ${describe(error)}`, true); });
}

function discard() {
  if (!waiting().length) { setStatus('Nothing waits.'); return; }
  state.undo.push({ label: 'Discard', entries: waiting() });
  state.working = M.copy(state.committed);
  keepEdits();
  render({ text: true });
  setStatus('Discarded the waiting edits. Undo brings them back.');
}

let committing = false;
async function commit() {
  if (committing) return;
  if (state.readOnly) { setStatus('This file is open read-only.', true); return; }
  const next = M.copy(state.working);
  let confirmed = 0;
  if (state.confirm && state.mapId) confirmed = M.confirm(next, state.mapId, M.today());
  const plan = M.commitPlan(state.committed, next);
  if (plan.writes.length === 0) { setStatus('Nothing waits to be committed.'); return; }
  if (plan.refused) { setStatus(plan.refused, true); return; }
  const title = mapTitle() || 'the map';
  const label = `Commit ${title}`.slice(0, 80);
  committing = true;
  try {
    const answer = await nendo.records.batch(plan.writes, { label });
    state.commits.push({ label, revision: answer.revision });
    state.undone = [];
    state.undo = []; state.redo = [];
    state.working = next;
    keep('edits', null);
    setStatus(`Committed ${plan.writes.length} record ${plan.writes.length === 1 ? 'write' : 'writes'}${confirmed ? `, with ${confirmed} position${confirmed === 1 ? '' : 's'} confirmed as assessments dated today` : ''}. Undo takes it back.`);
    await readAll();
  } catch (error) {
    const stale = /version|changed|stale|conflict/i.test(`${error?.code ?? ''} ${describe(error)}`);
    setStatus(stale
      ? `Not committed: somebody changed these records since you read them. Terrain read them again; your edits still wait. Look them over and commit again. (${describe(error)})`
      : `Not committed: ${describe(error)} Your edits still wait.`, true);
    if (stale) await readAll().catch(() => undefined);
  } finally { committing = false; }
}

// ---------------------------------------------------------------- the map

const view = () => state.mapId ? M.mapView(state.working, state.mapId) : null;
const mapTitle = () => state.working.get(state.mapId)?.values[F.map.title] ?? '';
const enabled = id => state.settings[`check.${id}`] !== false;
let issues = [];

function render({ text = false } = {}) {
  $('app').setAttribute('aria-busy', 'false');
  $('text-pane').hidden = !state.textOpen;
  const current = view();
  $('empty').hidden = current !== null;
  $('paper-wrap').hidden = current === null;
  issues = current && state.validateOpen ? validate(state.working, state.mapId, { enabled }) : [];
  if (current) {
    const flagged = new Set(issues.flatMap(issue => issue.componentIds));
    $('paper').innerHTML = drawMap(current, { words: M.stageWords(current.map), colors: paperColors(), selected: state.selected, issues: flagged });
    const svg = $('paper').querySelector('svg');
    svg.setAttribute('width', String(Math.round(PAPER.width * state.zoom)));
    svg.setAttribute('height', String(Math.round(PAPER.height * state.zoom)));
    drawHandle(svg, current);
    rover?.refresh();
    textAlternative(current);
  } else $('paper').replaceChildren();
  if (text) printText();
  renderInspector(current);
  renderValidator();
  declareToolbar();
  keep('map', state.mapId);
  const count = waiting().length;
  if (!$('summary').classList.contains('problem')) setStatus(summary(current, count));
  if (state.conflicts.length) showHeld(`${state.conflicts.length} of your waiting edits were made to records somebody has changed since. A commit will be refused until you discard them or make them again.`);
}

function summary(current, count) {
  if (!current) return `${M.maps(state.working).length} maps`;
  const unconfirmed = current.items.filter(i => i.unconfirmed).length;
  return `${current.title} · ${current.items.length} components · ${current.links.length} links${unconfirmed ? ` · ${unconfirmed} not yet confirmed` : ''}${count ? ` · ${count} waiting ${count === 1 ? 'edit' : 'edits'}` : ''}`;
}

/** White paper in both themes unless this computer chose the theme's own colours. */
function paperColors() {
  if (state.settings.paper !== 'theme') return WHITE;
  const token = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(`--nendo-${name}`).trim() || fallback;
  return { ...WHITE, paper: token('surface', WHITE.paper), ink: token('ink', WHITE.ink), muted: token('muted', WHITE.muted), line: token('line-strong', WHITE.line),
    band: token('line', WHITE.band), fill: token('surface', WHITE.fill), accent: token('cobalt', WHITE.accent), inertia: token('ink', WHITE.inertia) };
}

/** The handle a link is drawn from: beside the selected component. */
function drawHandle(svg, current) {
  const item = current.items.find(i => i.placementId === state.selected);
  if (!item || state.readOnly) return;
  const g = geometry();
  const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  handle.setAttribute('class', 'tr-handle');
  handle.setAttribute('cx', String(g.x(item.evolution) + 22));
  handle.setAttribute('cy', String(g.y(item.visibility)));
  handle.setAttribute('r', '5');
  handle.setAttribute('fill', WHITE.accent);
  handle.setAttribute('aria-label', `Draw a link from ${item.name}`);
  const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
  title.textContent = 'Drag to another component to link them';
  handle.append(title);
  svg.append(handle);
}

let kit = null, rover = null;
function textAlternative(current) {
  if (!kit) return;
  kit.textAlternative($('paper'), { label: `Components of ${current.title}`, items: current.items.map(item => ({
    name: item.name,
    detail: `${M.stageWords(current.map)[M.stageOf(item.evolution)]}, evolution ${item.evolution}, visibility ${item.visibility}${item.unconfirmed ? ', not yet confirmed' : ''}; on ${M.mapsShowing(state.working, item.componentId).length} map(s)`,
  })) });
}

// ---------------------------------------------------------------- gestures on the paper

const svgPoint = event => {
  const svg = $('paper').querySelector('svg');
  const point = svg.createSVGPoint();
  point.x = event.clientX; point.y = event.clientY;
  return point.matrixTransform(svg.getScreenCTM().inverse());
};
const positionAt = point => {
  const g = geometry();
  return { visibility: M.fromNumber(M.clamp01(g.visibility(point.y))), evolution: M.fromNumber(M.clamp01(g.evolution(point.x))) };
};

let drag = null;
function onPointerDown(event) {
  if (event.button !== 0 || !view()) return;
  const handle = event.target.closest('.tr-handle');
  const node = event.target.closest('.tr-component');
  if (handle) {
    drag = { kind: 'link', from: view().items.find(i => i.placementId === state.selected), start: svgPoint(event) };
  } else if (node) {
    select(node.dataset.id);
    if (state.readOnly) return;
    const item = view().items.find(i => i.placementId === node.dataset.id);
    drag = { kind: 'move', item, start: svgPoint(event), moved: false };
  } else return;
  event.preventDefault();
  $('paper').setPointerCapture?.(event.pointerId);
  $('paper').classList.add('dragging');
}

function onPointerMove(event) {
  if (!drag) return;
  const point = svgPoint(event);
  const svg = $('paper').querySelector('svg');
  if (drag.kind === 'link') {
    let line = svg.querySelector('.tr-rubber');
    if (!line) {
      line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('class', 'tr-rubber');
      line.setAttribute('stroke', WHITE.accent);
      line.setAttribute('stroke-dasharray', '4 3');
      svg.append(line);
    }
    const g = geometry();
    line.setAttribute('x1', String(g.x(drag.from.evolution))); line.setAttribute('y1', String(g.y(drag.from.visibility)));
    line.setAttribute('x2', String(point.x)); line.setAttribute('y2', String(point.y));
    return;
  }
  const g = geometry();
  let x = g.x(drag.item.evolution) + (point.x - drag.start.x), y = g.y(drag.item.visibility) + (point.y - drag.start.y);
  // Shift keeps it on one axis: the one it has moved along more.
  if (event.shiftKey) { if (Math.abs(point.x - drag.start.x) > Math.abs(point.y - drag.start.y)) y = g.y(drag.item.visibility); else x = g.x(drag.item.evolution); }
  drag.to = positionAt({ x, y });
  drag.moved = drag.moved || Math.hypot(point.x - drag.start.x, point.y - drag.start.y) > 2;
  const node = svg.querySelector(`.tr-component[data-id="${CSS.escape(drag.item.placementId)}"]`);
  node?.setAttribute('transform', `translate(${x - g.x(drag.item.evolution)} ${y - g.y(drag.item.visibility)})`);
}

function onPointerUp(event) {
  if (!drag) return;
  const current = drag;
  drag = null;
  $('paper').classList.remove('dragging');
  if (current.kind === 'link') {
    $('paper').querySelector('.tr-rubber')?.remove();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.tr-component');
    const to = target && view().items.find(i => i.placementId === target.dataset.id);
    if (to && to.componentId !== current.from.componentId) edit(`Link ${current.from.name} to ${to.name}`, w => M.addLink(w, current.from.componentId, to.componentId));
    return;
  }
  if (current.moved && current.to) edit(`Move ${current.item.name}`, w => M.move(w, current.item.placementId, current.to.visibility, current.to.evolution));
  else render();
}

function onDoubleClick(event) {
  if (!view() || state.readOnly) return;
  const node = event.target.closest('.tr-component');
  if (node) { select(node.dataset.id); startRename(); return; }
  if (!event.target.closest('svg')) return;
  const at = positionAt(svgPoint(event));
  askName({ x: event.clientX, y: event.clientY }, '', name => edit(`Add ${name}`, w => {
    const known = M.componentNamed(w, name);
    if (known) {
      if (M.mapView(w, state.mapId).byComponent.has(known.recordId)) throw new Error(`${name} is on this map already.`);
      state.selected = M.placeComponent(w, state.mapId, known.recordId, at.visibility, at.evolution === M.assessedEvolution(w, known.recordId) ? null : at.evolution);
    } else state.selected = M.addComponent(w, state.mapId, { name, ...at }).placementId;
  }));
}

/** An inline field for a name, at a point in the window; Enter keeps it, Escape drops it. */
function askName(at, value, done) {
  const input = $('rename');
  const box = $('stage').getBoundingClientRect();
  input.style.left = `${Math.max(0, at.x - box.left)}px`;
  input.style.top = `${Math.max(0, at.y - box.top)}px`;
  input.value = value;
  input.hidden = false;
  input.focus();
  input.select();
  const finish = keepIt => {
    input.removeEventListener('keydown', onKey);
    input.removeEventListener('blur', onBlur);
    input.hidden = true;
    const name = input.value.trim();
    if (keepIt && name && name !== value) done(name);
  };
  const onKey = event => {
    if (event.key === 'Enter') { event.preventDefault(); finish(true); }
    if (event.key === 'Escape') { event.preventDefault(); finish(false); }
  };
  const onBlur = () => finish(true);
  input.addEventListener('keydown', onKey);
  input.addEventListener('blur', onBlur);
}

function startRename() {
  const item = view()?.items.find(i => i.placementId === state.selected);
  if (!item || state.readOnly) return;
  const node = $('paper').querySelector(`.tr-component[data-id="${CSS.escape(item.placementId)}"]`);
  const box = node?.getBoundingClientRect() ?? { left: 40, top: 40 };
  askName({ x: box.left, y: box.top }, item.name, name => edit(`Rename ${item.name}`, w => M.rename(w, item.componentId, name)));
}

function select(placementId, { focus = false } = {}) {
  state.selected = placementId;
  render();
  if (focus) $('paper').querySelector(`.tr-component[data-id="${CSS.escape(placementId)}"]`)?.focus();
}

function nudge(dx, dy) {
  const item = view()?.items.find(i => i.placementId === state.selected);
  if (!item || state.readOnly) return;
  const visibility = M.fromNumber(M.clamp01(Number(item.visibility) + dy));
  const evolution = M.fromNumber(M.clamp01(Number(item.evolution) + dx));
  edit(`Nudge ${item.name}`, w => M.move(w, item.placementId, visibility, evolution));
  $('paper').querySelector(`.tr-component[data-id="${CSS.escape(item.placementId)}"]`)?.focus();
}

function removeSelected() {
  const item = view()?.items.find(i => i.placementId === state.selected);
  if (!item) return;
  if (edit(`Take ${item.name} off the map`, w => M.removeFromMap(w, state.committed, item.placementId))) state.selected = null;
  render();
}

function deleteFromLandscape() {
  const item = view()?.items.find(i => i.placementId === state.selected);
  if (!item) return;
  const cost = M.landscapeCost(state.working, item.componentId);
  $('confirm-delete-title').textContent = `Delete ${item.name} from the landscape?`;
  $('confirm-delete-text').textContent = `This takes it off ${cost.maps} map${cost.maps === 1 ? '' : 's'}, with ${cost.links} link${cost.links === 1 ? '' : 's'} and ${cost.assessments} assessment${cost.assessments === 1 ? '' : 's'}. It waits until you commit.`;
  $('confirm-delete').returnValue = '';
  $('confirm-delete').onclose = () => {
    if ($('confirm-delete').returnValue !== 'delete') return;
    if (edit(`Delete ${item.name}`, w => M.deleteFromLandscape(w, item.componentId))) { state.selected = null; render(); }
  };
  $('confirm-delete').showModal();
}

// ---------------------------------------------------------------- the text pane

let typing = null;
function printText() {
  const area = $('text');
  if (document.activeElement === area && state.textErrors.length) return;
  const text = state.mapId ? print(state.working, state.mapId) : '';
  if (document.activeElement === area && area.value === text) return;
  if (document.activeElement !== area) area.value = text;
  state.textErrors = [];
  renderTextErrors();
}

/** Typing is read when it pauses; a line that does not parse is marked, and the map keeps the last text that did. */
function onTyped() {
  clearTimeout(typing);
  typing = setTimeout(applyTyped, 400);
}
function applyTyped() {
  if (!state.mapId) return;
  const text = $('text').value;
  if (text === print(state.working, state.mapId)) { state.textErrors = []; renderTextErrors(); return; }
  const result = applyText(state.working, state.committed, state.mapId, text, { mode: 'edit', today: M.today() });
  if (result.errors) { state.textErrors = result.errors; renderTextErrors(); return; }
  state.textErrors = [];
  edit('Edit the text', w => { for (const id of [...w.keys()]) if (!result.working.has(id)) w.delete(id); for (const [id, r] of result.working) w.set(id, r); }, { text: false });
  renderTextErrors();
}
function renderTextErrors() {
  $('text-errors').replaceChildren(...state.textErrors.map(e => Object.assign(document.createElement('li'), { textContent: `Line ${e.line}: ${e.reason}` })));
}

// ---------------------------------------------------------------- panels

function renderInspector(current) {
  const body = $('inspector-body');
  const item = current?.items.find(i => i.placementId === state.selected);
  if (!current) { $('inspector-title').textContent = 'Map'; body.replaceChildren(); return; }
  if (!item) {
    $('inspector-title').textContent = 'Map';
    body.replaceChildren(
      field('Title', input(current.title, value => edit('Rename the map', w => { w.get(state.mapId).values[F.map.title] = value; }))),
      field('Stage words', choose(M.STAGE_SETS.filter(s => s !== 'Custom'), current.stages, value => edit('Change the stage words', w => { w.get(state.mapId).values[F.map.stages] = value; }))),
      Object.assign(document.createElement('p'), { className: 'hint', textContent: 'Double-click the paper to add a component. Drag a component to move it; Shift keeps it on one axis. Select one and drag its blue handle to another to link them.' }),
    );
    return;
  }
  $('inspector-title').textContent = item.name;
  const component = state.working.get(item.componentId);
  const others = M.mapsShowing(state.working, item.componentId).filter(m => m.recordId !== state.mapId);
  const list = document.createElement('ul');
  list.className = 'maps-list';
  for (const map of others) {
    const li = document.createElement('li');
    const button = Object.assign(document.createElement('button'), { type: 'button', textContent: map.values[F.map.title] });
    button.addEventListener('click', () => openMap(map.recordId, item.componentId));
    li.append(button);
    list.append(li);
  }
  const set = (fieldId, label) => value => edit(`${label} of ${item.name}`, w => { w.get(item.componentId).values[fieldId] = value || null; });
  body.replaceChildren(
    field('Name', input(item.name, value => edit(`Rename ${item.name}`, w => M.rename(w, item.componentId, value)))),
    field('Type', choose(M.COMPONENT_TYPES, item.type, set(F.component.type, 'Type'))),
    field('Sourcing', choose(['', ...M.SOURCING], item.sourcing ?? '', set(F.component.sourcing, 'Sourcing'))),
    field('Mark', choose(['', ...M.MARKS], item.mark ?? '', set(F.component.mark, 'Mark'))),
    field('Description', area(component.values[F.component.description] ?? '', set(F.component.description, 'Description'))),
    Object.assign(document.createElement('p'), { className: 'hint', textContent: `${M.stageWords(current.map)[M.stageOf(item.evolution)]} at ${item.evolution}, visibility ${item.visibility}.${item.unconfirmed ? ' Drawn here, not yet confirmed: Commit confirms it.' : ''}${item.assessed !== null && item.unconfirmed ? ` The landscape puts it at ${item.assessed}.` : ''}` }),
    Object.assign(document.createElement('p'), { className: 'hint', textContent: others.length ? 'Also on:' : 'On no other map.' }),
    list,
  );
}

function field(label, control) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const id = `f-${label.toLowerCase().replace(/\W+/g, '-')}`;
  control.id = id;
  wrap.append(Object.assign(document.createElement('label'), { htmlFor: id, textContent: label }), control);
  return wrap;
}
function input(value, done) {
  const element = Object.assign(document.createElement('input'), { value });
  element.disabled = state.readOnly;
  element.addEventListener('change', () => { const next = element.value.trim(); if (next && next !== value) done(next); });
  return element;
}
function area(value, done) {
  const element = Object.assign(document.createElement('textarea'), { value, rows: 3 });
  element.disabled = state.readOnly;
  element.addEventListener('change', () => { if (element.value !== value) done(element.value); });
  return element;
}
function choose(options, value, done) {
  const element = document.createElement('select');
  element.disabled = state.readOnly;
  for (const option of options) element.append(new Option(option || '(none)', option, false, option === value));
  element.addEventListener('change', () => done(element.value));
  return element;
}

function renderValidator() {
  $('validator').hidden = !state.validateOpen;
  if (!state.validateOpen) return;
  $('validator-none').hidden = issues.length > 0 || !state.mapId;
  $('issues').replaceChildren(...issues.map(issue => {
    const li = document.createElement('li');
    li.className = issue.level;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.rule = issue.rule;
    button.append(Object.assign(document.createElement('span'), { className: 'level', textContent: issue.level }), issue.text);
    button.addEventListener('click', () => {
      const placement = view()?.items.find(i => i.componentId === issue.componentIds[0]);
      if (placement) select(placement.placementId, { focus: true });
    });
    li.append(button);
    return li;
  }));
}

function openMap(mapId, componentId = null) {
  state.mapId = mapId;
  state.selected = componentId ? (M.mapView(state.working, mapId)?.byComponent.get(componentId)?.placementId ?? null) : null;
  render({ text: true });
}

function showHeld(text) { $('held-text').textContent = text; $('held').hidden = false; }

// ---------------------------------------------------------------- import and new map

function newMapGesture() {
  let mapId = null;
  const taken = new Set(M.maps(state.working).map(m => m.values[F.map.title]));
  let title = 'New map';
  for (let n = 2; taken.has(title); n += 1) title = `New map ${n}`;
  if (edit(`Add ${title}`, w => { mapId = newMap(w, title); })) openMap(mapId);
}

function openImport() {
  $('import-text').value = '';
  $('import-errors').replaceChildren();
  $('import').returnValue = '';
  $('import').showModal();
}
$('import-form').addEventListener('submit', event => {
  if (event.submitter?.value !== 'import') return;
  const result = importMap(state.working, state.committed, $('import-text').value, { today: M.today() });
  if (result.errors) {
    event.preventDefault();
    $('import-errors').replaceChildren(...result.errors.map(e => Object.assign(document.createElement('li'), { textContent: `Line ${e.line}: ${e.reason}` })));
    return;
  }
  const title = result.working.get(result.mapId).values[F.map.title];
  edit(`Import ${title}`, w => { for (const [id, r] of result.working) w.set(id, r); });
  openMap(result.mapId);
});

// ---------------------------------------------------------------- export

async function exportAs(kind) {
  const current = view();
  if (!current) return;
  const svg = drawMap(current, { words: M.stageWords(current.map), colors: WHITE });
  const name = (current.title || 'map').replace(/[\\/:*?"<>|]+/g, ' ').trim();
  if (kind === 'svg') return download(new Blob([svg], { type: 'image/svg+xml' }), `${name}.svg`);
  if (kind === 'owm') return download(new Blob([print(state.working, state.mapId)], { type: 'text/plain' }), `${name}.owm.txt`);
  const scale = { png1: 1, png2: 2, png4: 4, copy: 2 }[kind];
  const png = await picture(svg, scale);
  if (kind === 'copy') {
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]); setStatus('Copied the map as a picture.'); }
    catch (error) { setStatus(`The picture could not be copied: ${describe(error)}`, true); }
    return;
  }
  download(png, `${name}${scale > 1 ? `@${scale}x` : ''}.png`);
}

/** The SVG drawn at a scale into a PNG: PAPER's size times the scale, exactly. */
export function picture(svg, scale) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = PAPER.width * scale; canvas.height = PAPER.height * scale;
      const context = canvas.getContext('2d');
      context.scale(scale, scale);
      context.drawImage(image, 0, 0, PAPER.width, PAPER.height);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The picture could not be made.')), 'image/png');
    };
    image.onerror = () => reject(new Error('The map could not be drawn as a picture.'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus(`Exported ${name}.`);
}

// ---------------------------------------------------------------- the toolbar

function toolbarItems() {
  const maps = M.maps(state.working).slice(0, 64);
  const count = waiting().length;
  return [
    // A select needs an option, so an empty file has none until its first map.
    ...(maps.length ? [{ kind: 'select', id: 'map', label: 'Map', options: maps.map(m => ({ value: m.recordId, label: (m.values[F.map.title] || 'Untitled').slice(0, 80) })), value: maps.some(m => m.recordId === state.mapId) ? state.mapId : null }] : []),
    { kind: 'button', id: 'new-map', label: 'New map', icon: 'plus', disabled: state.readOnly },
    { kind: 'button', id: 'import', label: 'Import…', disabled: state.readOnly },
    { kind: 'separator' },
    { kind: 'toggle', id: 'text', label: 'Text', pressed: state.textOpen },
    { kind: 'toggle', id: 'validate', label: 'Validate', pressed: state.validateOpen },
    { kind: 'menu', id: 'export', label: 'Export', icon: 'export', disabled: !state.mapId, items: [
      { id: 'svg', label: 'SVG', detail: 'Every label as text' },
      { id: 'png1', label: 'PNG', detail: '1000 × 700' }, { id: 'png2', label: 'PNG at 2×' }, { id: 'png4', label: 'PNG at 4×' },
      { id: 'copy', label: 'Copy as picture' },
      { kind: 'separator' },
      { id: 'owm', label: 'OnlineWardleyMaps text' },
    ] },
    { kind: 'separator' },
    { kind: 'button', id: 'undo', label: 'Undo', icon: 'undo', iconOnly: true, keys: 'Ctrl+Z', disabled: state.undo.length === 0 && state.commits.length === 0 },
    { kind: 'button', id: 'redo', label: 'Redo', icon: 'redo', iconOnly: true, keys: 'Ctrl+Y', disabled: state.redo.length === 0 && state.undone.length === 0 },
    { kind: 'toggle', id: 'confirm', label: 'Confirm positions', pressed: state.confirm },
    { kind: 'button', id: 'commit', label: count ? `Commit (${count})` : 'Commit', icon: 'check', keys: 'Ctrl+S', disabled: state.readOnly || count === 0 },
    { kind: 'button', id: 'discard', label: 'Discard', disabled: count === 0 },
    { kind: 'separator' },
    { kind: 'button', id: 'zoom-out', label: 'Zoom out', icon: 'minus', iconOnly: true, keys: 'Ctrl+-' },
    { kind: 'button', id: 'zoom-in', label: 'Zoom in', icon: 'plus', iconOnly: true, keys: 'Ctrl+Plus' },
    { kind: 'button', id: 'fit', label: 'Fit', icon: 'fit', iconOnly: true, keys: 'Ctrl+0' },
    { kind: 'button', id: 'find', label: 'Find', keys: 'Ctrl+F', disabled: !state.mapId },
  ];
}

let lastToolbar = '';
function declareToolbar() {
  const items = toolbarItems();
  if (state.nativeChrome) {
    const json = JSON.stringify(items);
    if (json === lastToolbar) return;
    lastToolbar = json;
    nendo.ui.setToolbar({ items }).catch(error => { state.nativeChrome = false; document.body.classList.remove('native-chrome'); setStatus(`Nendo refused the toolbar: ${describe(error)}`, true); ownToolbar(items); });
    return;
  }
  ownToolbar(items);
}

/** Without Nendo's row, the same controls drawn here. */
function ownToolbar(items) {
  const bar = $('own-toolbar');
  bar.hidden = false;
  bar.replaceChildren(...items.filter(i => i.kind !== 'separator').map(item => {
    if (item.kind === 'select') {
      const select = document.createElement('select');
      select.setAttribute('aria-label', item.label);
      for (const option of item.options) select.append(new Option(option.label, option.value, false, option.value === item.value));
      select.addEventListener('change', () => runCommand({ id: item.id, value: select.value }));
      return select;
    }
    if (item.kind === 'menu') {
      const select = document.createElement('select');
      select.setAttribute('aria-label', item.label);
      select.append(new Option(item.label, ''));
      for (const entry of item.items.filter(e => e.id)) select.append(new Option(entry.label, entry.id));
      select.addEventListener('change', () => { if (select.value) runCommand({ id: select.value, value: null }); select.value = ''; });
      return select;
    }
    const button = Object.assign(document.createElement('button'), { type: 'button', textContent: item.label, disabled: !!item.disabled });
    button.dataset.command = item.id;
    if (item.kind === 'toggle') button.setAttribute('aria-pressed', String(!!item.pressed));
    button.addEventListener('click', () => runCommand({ id: item.id, value: item.kind === 'toggle' ? !item.pressed : null }));
    return button;
  }));
}

function zoomTo(zoom, fitted = false) { state.fitted = fitted; state.zoom = Math.min(4, Math.max(0.25, zoom)); render(); }
function fit() {
  const box = $('paper-wrap').getBoundingClientRect();
  zoomTo(Math.min((box.width - 24) / PAPER.width, (box.height - 24) / PAPER.height) || 1);
}
// Until the person zooms, the paper takes the frame's width, never more than its own size, so the
// right edge of the map is never off the frame when the text pane or the side panel is open.
function fitWidth() {
  const width = $('paper-wrap').clientWidth - 24;
  if (width <= 0) return;
  const zoom = Math.min(1, width / PAPER.width);
  if (Math.abs(zoom - state.zoom) > 0.001) zoomTo(zoom, true);
}

function find() {
  const current = view();
  if (!current) return;
  askName({ x: 80, y: 80 }, '', text => {
    const item = current.items.find(i => i.name.toLowerCase().includes(text.toLowerCase()));
    if (item) select(item.placementId, { focus: true }); else setStatus(`No component on this map is named like "${text}".`);
  });
}

function runCommand({ id, value }) {
  switch (id) {
    case 'map': if (value) openMap(value); break;
    case 'new-map': newMapGesture(); break;
    case 'import': openImport(); break;
    case 'text': state.textOpen = value ?? !state.textOpen; $('text-pane').hidden = !state.textOpen; render({ text: true }); if (state.fitted) fitWidth(); break;
    case 'validate': state.validateOpen = value ?? !state.validateOpen; render(); break;
    case 'confirm': state.confirm = value ?? !state.confirm; render(); break;
    case 'undo': undo(); break;
    case 'redo': redo(); break;
    case 'commit': commit(); break;
    case 'discard': discard(); break;
    case 'zoom-in': zoomTo(state.zoom * 1.25); break;
    case 'zoom-out': zoomTo(state.zoom / 1.25); break;
    case 'fit': fit(); break;
    case 'find': find(); break;
    case 'svg': case 'png1': case 'png2': case 'png4': case 'copy': case 'owm': exportAs(id); break;
    case 'remove': removeSelected(); break;
    case 'delete-landscape': deleteFromLandscape(); break;
    case 'rename': startRename(); break;
    default: break;
  }
}

async function onContextMenu(event) {
  const node = event.target.closest('.tr-component');
  if (!node || !state.nativeChrome) return;
  event.preventDefault();
  select(node.dataset.id);
  const picked = await nendo.ui.showMenu([
    { id: 'rename', label: 'Rename', keys: 'F2', disabled: state.readOnly },
    { id: 'remove', label: 'Take off this map', keys: 'Delete', disabled: state.readOnly },
    { kind: 'separator' },
    { id: 'delete-landscape', label: 'Delete from landscape…', danger: true, disabled: state.readOnly },
  ], event).catch(() => null);
  if (picked) runCommand({ id: picked.id, value: picked.value });
}

const NUDGES = { 'Shift+ArrowLeft': [-NUDGE, 0], 'Shift+ArrowRight': [NUDGE, 0], 'Shift+ArrowUp': [0, NUDGE], 'Shift+ArrowDown': [0, -NUDGE] };
/**
 * Shift and an arrow nudge the selected component by 0.01. Heard before the arrow keys move
 * between components, so the nudge never moves the focus too. (Alt and an arrow are Nendo's
 * Back and Forward.)
 */
function onNudge(event) {
  const key = `${event.ctrlKey || event.metaKey ? 'Ctrl+' : ''}${event.altKey ? 'Alt+' : ''}${event.shiftKey ? 'Shift+' : ''}${event.key}`;
  if (!state.selected || !NUDGES[key]) return;
  event.preventDefault();
  event.stopPropagation();
  nudge(...NUDGES[key]);
}

function onKeyDown(event) {
  if (event.target.closest?.('input, textarea, select, dialog')) return;
  const key = `${event.ctrlKey || event.metaKey ? 'Ctrl+' : ''}${event.altKey ? 'Alt+' : ''}${event.shiftKey ? 'Shift+' : ''}${event.key}`;
  if (state.nativeChrome) {
    // Nendo runs the keys its row declares; the view's own keys stay here.
    if (key === 'F2') { event.preventDefault(); startRename(); }
    else if (key === 'Delete' && state.selected) { event.preventDefault(); removeSelected(); }
    else if (key === 'Escape' && state.selected) { state.selected = null; render(); }
    return;
  }
  const own = { 'Ctrl+z': 'undo', 'Ctrl+y': 'redo', 'Ctrl+s': 'commit', 'Ctrl+f': 'find', 'Ctrl+0': 'fit', 'Ctrl+-': 'zoom-out', 'Ctrl+=': 'zoom-in', 'Ctrl++': 'zoom-in', F2: 'rename', Delete: 'remove' };
  if (own[key]) { event.preventDefault(); runCommand({ id: own[key], value: null }); }
  else if (key === 'Escape' && state.selected) { state.selected = null; render(); }
}

// ---------------------------------------------------------------- start

function wire() {
  const paper = $('paper');
  paper.addEventListener('pointerdown', onPointerDown);
  paper.addEventListener('pointermove', onPointerMove);
  paper.addEventListener('pointerup', onPointerUp);
  paper.addEventListener('pointercancel', () => { drag = null; render(); });
  paper.addEventListener('dblclick', onDoubleClick);
  paper.addEventListener('contextmenu', onContextMenu);
  paper.addEventListener('keydown', onNudge, true);
  paper.addEventListener('focusin', event => {
    const node = event.target.closest?.('.tr-component');
    if (node && node.dataset.id !== state.selected) { state.selected = node.dataset.id; renderInspector(view()); }
  });
  paper.addEventListener('click', event => { if (!event.target.closest('.tr-component, .tr-handle') && state.selected) { state.selected = null; render(); } });
  document.addEventListener('keydown', onKeyDown);
  $('text').addEventListener('input', onTyped);
  $('text').addEventListener('blur', () => { if (!state.textErrors.length) printText(); });
  $('held-ok').addEventListener('click', () => { $('held').hidden = true; });
  new ResizeObserver(() => { if (state.fitted) fitWidth(); }).observe($('paper-wrap'));
}

// What the lane reads of the view's state, never what it writes.
window.terrain = Object.freeze({
  get ready() { return state.loaded; }, get mapId() { return state.mapId; }, get selected() { return state.selected; },
  get waiting() { return waiting().length; }, get zoom() { return state.zoom; },
});

if (nendo === undefined) {
  setStatus('Terrain runs inside Nendo. Open Terrain.nendo.', true);
} else {
  import('./kit/nendo-view-kit.js').then(module => {
    kit = module;
    kit.installFocusRing(document);
    rover = kit.roving($('paper'), { items: '.tr-component', orientation: 'spatial', onActivate: item => select(item.dataset.id, { focus: true }) });
  }).catch(() => undefined);
  wire();
  nendo.ready.then(context => {
    state.readOnly = context.readOnly === true;
    state.viewId = context.viewId ?? 'terrain';
    if (nendo.has('ui.setToolbar')) {
      state.nativeChrome = true;
      document.body.classList.add('native-chrome');
      nendo.on('command', command => { try { runCommand(command); } catch (error) { setStatus(describe(error), true); } });
    }
    nendo.on('changes', schedule);
    nendo.on('context', next => { state.readOnly = next.readOnly === true; schedule(); });
    if (nendo.has('settings.all')) {
      nendo.settings.all().then(values => { state.settings = values ?? {}; render(); }).catch(() => undefined);
      nendo.on('settingsChanged', values => { state.settings = values ?? {}; render(); });
    }
    return readAll();
  }).then(() => {
    if (state.cut.length) setStatus(`Read in part: ${state.cut.join(', ')} hold more than ${READ_MAX} records.`, true);
  }).catch(error => setStatus(`Terrain could not start. ${describe(error)}`, true));
}


