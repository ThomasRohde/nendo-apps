// Slip: a Smalltalk environment in a Nendo file. The VM and its kernel run in this frame; the
// classes, methods and Workspace pages a person makes are kept as records, so the file is the
// image's source. Code that arrives from outside Slip (another client, an undo) is compiled
// and said so. Objects are not kept: a doit's results live until the view closes.
import { Image, KERNEL_FILES } from './vm/image.mjs';
import { STClass } from './vm/vm.mjs';
import { E, F, SIDE, SETUP_TITLE, schemaOperations, hasSchema, classValues, methodValues, methodKey, recordMethodKey, valuesDiffer,
  definitionOrder, loadRecords, defineFromValues, compileFromValues } from './records.mjs';

const nendo = window.nendo ?? null;
const $ = id => document.getElementById(id);
const FIRST_PAGE = `"Select an expression and press Ctrl+D to do it, or Ctrl+P to print its result.
With nothing selected, the line the caret is on is evaluated."

3 + 4.
(1 to: 10) inject: 0 into: [:sum :each | sum + each].
100 factorial printString size.
#(5 3 9 1) asSortedCollection asArray.
Transcript show: 'Hello from Slip'; cr.

Object subclass: #Counter
	instanceVariableNames: 'count'
	classVariableNames: ''
	package: 'Examples'.
Counter compile: 'increment
	count := (count ifNil: [0]) + 1.
	^count' classified: 'counting'.
Counter new increment; increment; increment.
`;

let image = null;
let vm = null;
let kernel = new Set();       // the kernel's class names: their definitions are not kept
let context = null;
let framed = false;
let persisting = false;       // the file has Slip's record types and is writable
let classRecords = new Map(); // class name -> record
let methodRecords = new Map(); // methodKey -> record
let pages = [];               // { id, record, title, source, dirty }
let currentId = null;
let running = null;           // the evaluation in progress
let setupPending = null;      // { proposalId }
let unsaved = { classes: new Set(), methods: new Map() }; // made before the file could keep them
let outsideCount = 0;
let armed = false;
// What the lane reads: whether Slip has started, and its image.
window.slip = { ready: false, get image() { return image; }, get persisting() { return persisting; }, get running() { return Boolean(running); } };

// ---- Small helpers -------------------------------------------------------------------

function h(tag, attributes = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on')) element.addEventListener(key.slice(2), value);
    else if (key === 'class') element.className = value;
    else element.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) if (child !== null && child !== undefined && child !== false)
    element.append(child instanceof Node ? child : String(child));
  return element;
}
const remember = (key, value) => { try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage off */ } };
const recall = key => { try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; } };
let statusTimer = 0;
function say(text, { problem = false } = {}) {
  const line = $('status');
  line.textContent = text;
  line.classList.toggle('problem-line', problem);
  clearTimeout(statusTimer);
  if (text) statusTimer = setTimeout(() => { line.textContent = ''; }, problem ? 8000 : 4000);
}
const readOnly = () => context?.readOnly === true;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const classNamed = name => { const value = vm.globalBinding(name)?.f[1]; return value instanceof STClass && !value.isMeta ? value : null; };
function allClasses() {
  const out = [];
  const walk = cls => { out.push(cls); for (const sub of cls.subclasses) walk(sub); };
  walk(vm.classes.Object);
  return out;
}
const userClasses = () => allClasses().filter(c => !kernel.has(c.name));

// ---- The write queue -----------------------------------------------------------------
// One write at a time, in order. A job reads the image when it runs, not when it was queued,
// so several compiles of one method write its last source once or twice, never an old one.

let queue = Promise.resolve();
const inFlight = new Map(); // key -> jobs queued
function enqueue(key, job) {
  inFlight.set(key, (inFlight.get(key) ?? 0) + 1);
  queue = queue.then(job).catch(error => say(`Slip could not keep ${key}: ${error.message}`, { problem: true })).finally(() => {
    const left = inFlight.get(key) - 1;
    if (left > 0) inFlight.set(key, left); else inFlight.delete(key);
    renderTally();
  });
}
const busyWith = key => inFlight.has(key);

async function syncClass(name) {
  const cls = classNamed(name);
  if (!cls || kernel.has(name)) return;
  const values = classValues(vm, cls);
  const record = classRecords.get(name);
  if (record && !valuesDiffer(values, record.values)) return;
  classRecords.set(name, record ? await nendo.records.update(record, values) : await nendo.records.create(E.cls, values));
}

async function syncMethod(owner, selector) {
  const side = owner.isMeta ? SIDE.class : SIDE.instance;
  const key = methodKey(vm.instanceClass(owner).name, side, selector);
  const method = owner.methods.get(selector);
  const record = methodRecords.get(key);
  if (!method) {
    if (record) { await nendo.records.delete(record); methodRecords.delete(key); }
    return;
  }
  const values = methodValues(vm, owner, method);
  if (record && !valuesDiffer(values, record.values)) return;
  methodRecords.set(key, record ? await nendo.records.update(record, values) : await nendo.records.create(E.method, values));
}

function keepClass(cls) {
  if (cls.isMeta || kernel.has(cls.name)) return;
  if (!persisting) { unsaved.classes.add(cls.name); return; }
  enqueue(cls.name, () => syncClass(cls.name));
}
function keepMethod(owner, selector) {
  const key = methodKey(vm.instanceClass(owner).name, owner.isMeta ? SIDE.class : SIDE.instance, selector);
  if (!persisting) { unsaved.methods.set(key, { owner, selector }); return; }
  enqueue(key, () => syncMethod(owner, selector));
}
function flushUnsaved() {
  const { classes, methods } = unsaved;
  unsaved = { classes: new Set(), methods: new Map() };
  for (const name of classes) enqueue(name, () => syncClass(name));
  for (const [key, { owner, selector }] of methods) enqueue(key, () => syncMethod(owner, selector));
  for (const page of pages) if (!page.record) { page.dirty = true; savePage(page); }
}

// ---- Transcript ----------------------------------------------------------------------

let transcriptText = '';
let transcriptFrame = 0;
function transcript(text) {
  transcriptText = (transcriptText + text).slice(-200000);
  if (transcriptFrame) return;
  transcriptFrame = requestAnimationFrame(() => {
    transcriptFrame = 0;
    const pane = $('transcript');
    const atEnd = pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 4;
    pane.textContent = transcriptText;
    if (atEnd) pane.scrollTop = pane.scrollHeight;
  });
}

// ---- Starting ------------------------------------------------------------------------

async function boot() {
  image = new Image({
    classDefined: keepClass,
    methodCompiled: (owner, method) => keepMethod(owner, method.selector),
    methodRemoved: (owner, selector) => keepMethod(owner, selector),
    transcript,
  });
  vm = image.vm;
  const started = performance.now();
  const texts = await Promise.all(KERNEL_FILES.map(async name => {
    const answer = await fetch(new URL(`kernel/${name}`, import.meta.url));
    if (!answer.ok) throw new Error(`the kernel file ${name} did not load (${answer.status})`);
    return answer.text();
  }));
  const byName = new Map(KERNEL_FILES.map((name, i) => [name, texts[i]]));
  image.loadKernelSync(name => byName.get(name));
  kernel = new Set(allClasses().map(c => c.name));
  transcript(`Slip ${kernel.size} kernel classes loaded in ${Math.round(performance.now() - started)} ms.\n`);
}

async function connect() {
  if (!nendo) return false;
  try { context = await nendo.ready; }
  catch (error) { if (error.code === 'not-framed') return false; throw error; }
  framed = true;
  applyTheme(context.theme);
  nendo.on('context', next => { context = next; applyTheme(next.theme); renderNotices(); });
  nendo.on('theme', applyTheme);
  nendo.on('changes', pullSoon);
  if (nendo.has('ui.setToolbar')) nendo.on('command', command => run(command.id));
  return true;
}

// Reads the file's classes, methods and pages into the image. Nothing it loads is written back.
async function loadFile() {
  const schema = await nendo.schema.describe();
  if (!hasSchema(schema)) { persisting = false; return; }
  const [classes, methods, pageRecords] = await Promise.all([E.cls, E.method, E.page].map(entityId => nendo.records.queryAll({ entityId }, { max: 20000 })));
  classRecords = new Map(classes.map(r => [r.values[F.cls.name], r]));
  methodRecords = new Map(methods.map(r => [recordMethodKey(r.values), r]));
  const loaded = loadRecords(image, classes, methods);
  if (loaded.classes || loaded.methods) transcript(`This file's code: ${plural(loaded.classes, 'class', 'classes')}, ${plural(loaded.methods, 'method')}.\n`);
  for (const problem of loaded.problems) transcript(`Not loaded: ${problem}\n`);
  takePages(pageRecords);
  persisting = !readOnly();
}

function takePages(records) {
  const local = pages.filter(p => !p.record);
  pages = records.map(r => {
    const old = pages.find(p => p.id === r.recordId);
    if (old?.dirty) return { ...old, record: r };
    return { id: r.recordId, record: r, title: r.values[F.page.title] ?? '', source: r.values[F.page.source] ?? '', dirty: false };
  }).concat(local).sort((a, b) => a.title.localeCompare(b.title));
}

// ---- Changes from outside ------------------------------------------------------------

let pullTimer = 0, pulling = false;
function pullSoon() { clearTimeout(pullTimer); pullTimer = setTimeout(pull, 250); }

async function pull() {
  if (pulling) { pullSoon(); return; }
  pulling = true;
  try {
    if (!persisting) {
      await loadFile();
      if (persisting) { setupPending = null; flushUnsaved(); say('This file now keeps Slip\'s classes, methods and pages.'); }
      render();
      return;
    }
    await queue;
    const [classes, methods, pageRecords] = await Promise.all([E.cls, E.method, E.page].map(entityId => nendo.records.queryAll({ entityId }, { max: 20000 })));
    let came = 0;
    vm.quiet++;
    try {
      for (const r of definitionOrder(classes, name => kernel.has(name))) {
        const name = r.values[F.cls.name];
        const known = classRecords.get(name);
        classRecords.set(name, r);
        if (busyWith(name) || known?.version === r.version) continue;
        const cls = classNamed(name);
        if (cls && !valuesDiffer(classValues(vm, cls), r.values)) continue;
        try { defineFromValues(vm, r.values); came++; }
        catch (error) { transcript(`Not loaded: the class ${name}: ${error.message}\n`); }
      }
      const seen = new Map(methods.map(r => [recordMethodKey(r.values), r]));
      for (const [key, r] of seen) {
        const known = methodRecords.get(key);
        methodRecords.set(key, r);
        if (busyWith(key) || known?.version === r.version) continue;
        const owner = classNamed(r.values[F.method.className]);
        const target = owner && (r.values[F.method.side] === SIDE.class ? owner.cls : owner);
        const now = target?.methods.get(r.values[F.method.selector]);
        if (now && now.source === r.values[F.method.source] && (now.protocol ?? '') === (r.values[F.method.protocol] ?? '')) continue;
        try { compileFromValues(vm, r.values); came++; }
        catch (error) { transcript(`Not loaded: ${key}: ${error.message}\n`); }
      }
      for (const [key, r] of [...methodRecords]) {
        if (seen.has(key) || busyWith(key)) continue;
        methodRecords.delete(key);
        const owner = classNamed(r.values[F.method.className]);
        const target = owner && (r.values[F.method.side] === SIDE.class ? owner.cls : owner);
        if (target?.methods.has(r.values[F.method.selector])) { vm.removeMethod(target, r.values[F.method.selector]); came++; }
      }
    } finally { vm.quiet--; }
    if (came) { outsideCount += came; transcript(`${plural(came, 'change')} to the code came in from outside Slip.\n`); }
    const shown = currentPage();
    const before = shown && !shown.dirty ? shown.source : null;
    takePages(pageRecords);
    const after = currentPage();
    if (after && before !== null && after.id === shown.id && after.source !== before) $('editor').value = after.source;
    render();
  } catch (error) {
    say(`Slip could not read the file: ${error.message}`, { problem: true });
  } finally { pulling = false; }
}

// ---- Giving the file Slip's record types ---------------------------------------------

async function proposeSetup() {
  if (setupPending) { say(`Accept "${SETUP_TITLE}" in Nendo's review.`); return; }
  if (!nendo.has('proposals.prepare')) { say('This version of Nendo cannot take a proposal from a view. Build the file with Slip\'s record types instead.', { problem: true }); return; }
  let answer;
  try { answer = await nendo.proposals.prepare(SETUP_TITLE, schemaOperations()); }
  catch (error) {
    if (!/expectedDefinitionRevision/.test(error.message ?? '')) {
      say(error.code === 'proposal-waiting' ? 'Another proposal from Slip is waiting in Nendo. Accept or reject it first.' : `Nendo did not take it: ${error.message}`, { problem: true });
      return;
    }
    try { answer = await nendo.proposals.prepare(SETUP_TITLE, schemaOperations({ plain: true })); }
    catch (again) { say(`Nendo did not take it: ${again.message}`, { problem: true }); return; }
  }
  if (answer.state === 'invalid') {
    const why = answer.diagnostics?.find(d => d.severity !== 'warning') ?? answer.diagnostics?.[0];
    say(`Nendo could not add Slip's record types: ${why?.message ?? why?.code ?? 'the change was invalid'}`, { problem: true });
    return;
  }
  setupPending = { proposalId: answer.proposalId };
  renderNotices();
  watchSetup();
}

async function watchSetup() {
  if (!setupPending) return;
  let state;
  try { state = (await nendo.proposals.get(setupPending.proposalId)).state; }
  catch { state = 'gone'; }
  if (state === 'previewable') { setTimeout(watchSetup, 1500); return; }
  if (state !== 'active') { setupPending = null; say(`"${SETUP_TITLE}" was not accepted. Slip keeps your work on this page only.`); renderNotices(); return; }
  pull();
}

// ---- Pages ---------------------------------------------------------------------------

const currentPage = () => pages.find(p => p.id === currentId) ?? null;

function newPage(title = 'Workspace', source = '') {
  const page = { id: `local-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, record: null, title: uniqueTitle(title), source, dirty: true };
  pages.push(page);
  return page;
}
function uniqueTitle(base) {
  const taken = new Set(pages.map(p => p.title));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
}

function show(page) {
  const old = currentPage();
  if (old && old !== page) { old.source = $('editor').value; savePage(old); }
  currentId = page.id;
  remember('slip.page', page.record ? page.id : null);
  $('editor').value = page.source;
  $('title').value = page.title;
  $('result').hidden = true;
  armed = false;
  render();
}

let idleTimer = 0;
function edited() {
  const page = currentPage();
  if (!page) return;
  page.source = $('editor').value;
  page.dirty = true;
  renderSaved();
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => savePage(page), 1500);
}

function savePage(page) {
  if (!page?.dirty) return;
  if (!persisting) { storeLocal(); page.dirty = false; renderSaved(); return; }
  const key = `page ${page.id}`;
  if (busyWith(key)) { setTimeout(() => savePage(page), 300); return; }
  enqueue(key, async () => {
    if (!page.dirty) return;
    const values = { [F.page.title]: page.title || 'Untitled', [F.page.source]: page.source };
    page.dirty = false;
    const wasLocal = !page.record;
    page.record = page.record ? await nendo.records.update(page.record, values) : await nendo.records.create(E.page, values);
    if (wasLocal) { page.id = page.record.recordId; if (currentId !== page.id && !pages.some(p => p.id === currentId)) currentId = page.id; }
    if (currentPage() === page) remember('slip.page', page.id);
    storeLocal();
    renderSaved();
    renderPages();
  });
}
function storeLocal() { if (!persisting) remember('slip.pages', pages.map(({ id, title, source }) => ({ id, title, source }))); }

async function deletePage() {
  const page = currentPage();
  if (!page) return;
  if (!armed) { armed = true; renderSaved(); setTimeout(() => { armed = false; renderSaved(); }, 3000); return; }
  armed = false;
  pages = pages.filter(p => p !== page);
  if (page.record && persisting) enqueue(`page ${page.id}`, () => nendo.records.delete(page.record));
  storeLocal();
  show(pages[0] ?? newPage('Workspace', FIRST_PAGE));
}

// ---- Evaluating ----------------------------------------------------------------------

// The selection, or the line the caret is on when nothing is selected; selects what it took.
function takeSource() {
  const editor = $('editor');
  let start = editor.selectionStart, end = editor.selectionEnd;
  if (start === end) {
    start = editor.value.lastIndexOf('\n', start - 1) + 1;
    end = editor.value.indexOf('\n', end);
    if (end < 0) end = editor.value.length;
    editor.setSelectionRange(start, end);
  }
  return { source: editor.value.slice(start, end), start, end };
}

async function evaluate(print) {
  if (running) { say('Slip is still running. Press Ctrl+. to stop it.'); return; }
  const { source, start, end } = takeSource();
  if (!source.trim()) { say('Select something to evaluate.'); return; }
  running = image.evaluate(source);
  renderRunning();
  let outcome;
  try { outcome = await running; } finally { running = null; renderRunning(); }
  const editor = $('editor');
  if (outcome.error) { showError(outcome.error, start); return; }
  const printed = image.printString(outcome.value);
  if (print && editor.value.slice(start, end) === source) {
    editor.setRangeText(` ${printed}`, end, end, 'select');
    editor.focus();
    edited();
    $('result').hidden = true;
  } else showResult(printed, outcome.ms);
}

function showResult(printed, ms) {
  const box = $('result');
  box.classList.remove('problem');
  box.replaceChildren(h('span', { class: 'ok' }, '✓ '), printed, h('span', { class: 'trace' }, `${Math.max(1, Math.round(ms))} ms`));
  box.hidden = false;
}

function showError(error, start) {
  const box = $('result');
  box.classList.add('problem');
  const title = error.interrupted ? 'Stopped.' : error.message;
  box.replaceChildren(h('span', { class: 'title' }, title), ...(error.trace?.length && !error.interrupted ? [h('span', { class: 'trace' }, error.trace.join('\n'))] : []));
  box.hidden = false;
  if (error.position !== undefined) { const at = start + error.position; $('editor').focus(); $('editor').setSelectionRange(at, at); }
}

function stop() {
  if (!running) { say('Nothing is running.'); return; }
  running.stop();
}

function run(command) {
  if (command === 'doit') evaluate(false);
  else if (command === 'printit') evaluate(true);
  else if (command === 'stop') stop();
}

// ---- Drawing -------------------------------------------------------------------------

function render() {
  renderPages();
  renderSaved();
  renderTally();
  renderNotices();
  renderRunning();
}

function renderPages() {
  $('pages').replaceChildren(...pages.map(page => h('li', {},
    h('button', { type: 'button', class: 'page-link', 'aria-current': page.id === currentId ? 'true' : null, onclick: () => show(page) }, page.title || 'Untitled'))));
}

function renderSaved() {
  const page = currentPage();
  $('saved').textContent = !page ? '' : page.dirty ? 'Not kept yet' : persisting ? 'Kept in the file' : 'Kept in this browser';
  const button = $('delete-page');
  button.dataset.armed = armed ? 'true' : '';
  button.textContent = armed ? 'Delete it?' : 'Delete page';
}

function renderTally() {
  if (!vm) return;
  const classes = plural(userClasses().length, 'class', 'classes');
  const writing = [...inFlight.values()].reduce((a, b) => a + b, 0);
  $('tally').textContent = persisting ? `${classes}, ${plural(methodRecords.size, 'method')} kept${writing ? ' · keeping…' : ''}` : `${classes} of your own`;
}

function renderNotices() {
  const notices = [];
  if (framed && !persisting && readOnly())
    notices.push(h('div', { class: 'notice' }, h('p', {}, 'This file is open read-only. Slip runs, but keeps nothing you make.')));
  else if (framed && !persisting)
    notices.push(h('div', { class: 'notice setup' },
      h('p', {}, setupPending ? `Accept "${SETUP_TITLE}" in Nendo's review, and Slip keeps your work in the file.`
        : 'This file cannot keep Smalltalk yet. Slip asks Nendo for three record types: classes, methods and Workspace pages. You accept the change in Nendo\'s review.'),
      setupPending ? null : h('button', { type: 'button', onclick: proposeSetup }, 'Ask Nendo')));
  if (!framed)
    notices.push(h('div', { class: 'notice' }, h('p', {}, 'Slip runs outside Nendo here. Pages stay in this browser; classes and methods last until you close the page.')));
  if (outsideCount)
    notices.push(h('div', { class: 'notice outside' },
      h('p', {}, `${plural(outsideCount, 'change')} to the code came in from outside Slip: another client or an undo changed the file. They are compiled and live now. The Transcript names them.`),
      h('button', { type: 'button', onclick: () => { outsideCount = 0; renderNotices(); } }, 'Dismiss')));
  $('notices').replaceChildren(...notices);
}

let toolbarState = null;
function renderRunning() {
  const state = running ? 'running' : 'idle';
  document.body.dataset.running = running ? 'true' : '';
  if (framed && nendo.has('ui.setToolbar')) {
    if (toolbarState === state) return;
    toolbarState = state;
    nendo.ui.setToolbar({ items: [
      { kind: 'button', id: 'doit', label: 'Do it', disabled: Boolean(running) },
      { kind: 'button', id: 'printit', label: 'Print it', disabled: Boolean(running) },
      { kind: 'button', id: 'stop', label: 'Stop', disabled: !running },
    ] }).catch(() => { $('own-toolbar').hidden = false; });
  } else {
    $('own-toolbar').hidden = false;
    for (const button of $('own-toolbar').querySelectorAll('button')) button.disabled = (button.dataset.command === 'stop') !== Boolean(running);
  }
}

function applyTheme(theme) {
  if (theme?.mode === 'light' || theme?.mode === 'dark') document.documentElement.dataset.theme = theme.mode;
}

// ---- Wiring --------------------------------------------------------------------------

document.addEventListener('keydown', event => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  const key = event.key.toLowerCase();
  const command = { d: 'doit', p: 'printit', '.': 'stop' }[key];
  if (command) { event.preventDefault(); run(command); return; }
  if (key === 's') { event.preventDefault(); const page = currentPage(); if (page) { page.source = $('editor').value; savePage(page); } }
});
$('editor').addEventListener('keydown', event => {
  if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey) return;
  event.preventDefault();
  $('editor').setRangeText('\t', $('editor').selectionStart, $('editor').selectionEnd, 'end');
  edited();
});
$('editor').addEventListener('input', edited);
$('editor').addEventListener('blur', () => savePage(currentPage()));
$('title').addEventListener('input', () => { const page = currentPage(); if (!page) return; page.title = $('title').value; page.dirty = true; renderPages(); renderSaved(); clearTimeout(idleTimer); idleTimer = setTimeout(() => savePage(page), 1500); });
$('title').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); $('editor').focus(); } });
$('new-page').addEventListener('click', () => { const page = newPage(); show(page); savePage(page); $('editor').focus(); });
$('delete-page').addEventListener('click', deletePage);
$('clear-transcript').addEventListener('click', () => { transcriptText = ''; $('transcript').textContent = ''; });
$('own-toolbar').addEventListener('click', event => { const command = event.target.closest('button')?.dataset.command; if (command) run(command); });
window.addEventListener('pagehide', () => { const page = currentPage(); if (page) { page.source = $('editor').value; savePage(page); } });

async function start() {
  try {
    await boot();
    if (await connect()) await loadFile();
    if (!persisting) pages = pages.concat((recall('slip.pages') ?? []).map(p => ({ ...p, record: null, dirty: false })));
    const wanted = pages.find(p => p.id === recall('slip.page')) ?? pages[0] ?? newPage('Workspace', FIRST_PAGE);
    show(wanted);
    savePage(wanted);
  } catch (error) {
    $('tally').textContent = 'Not started';
    say(`Slip could not start: ${error.message}`, { problem: true });
  } finally { $('app').removeAttribute('aria-busy'); window.slip.ready = true; }
}
start();
