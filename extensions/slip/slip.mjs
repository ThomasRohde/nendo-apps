// Slip: a Smalltalk environment in a Nendo file. The VM and its kernel run in this frame; the
// classes, methods and Workspace pages a person makes are kept as records, so the file is the
// image's source. Code that arrives from outside Slip (another client, an undo) is compiled
// and said so. Objects are not kept: a doit's results live until the view closes.
import { Image, KERNEL_FILES } from './vm/image.mjs';
import { STClass } from './vm/vm.mjs';
import { E, F, SIDE, SETUP_TITLE, MORE_TITLE, schemaOperations, hasSchema, missingEntities, classValues, methodValues, methodKey, recordMethodKey, valuesDiffer,
  definitionOrder, loadRecords, defineFromValues, compileFromValues } from './records.mjs';
import { createBridge } from './bridge.mjs';
import { createAgentQueue, SETTING } from './agent.mjs';
import { classNamed as classOfWord, KEYS, KEYS_SHIFTED, stoppedTitle, frameLabel } from './tools.mjs';
import { createBrowser, createInspector, createDebugger } from './panes.mjs';

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
let missing = [];             // Slip's record types the file lacks, once it keeps code
let objects = new Map();      // a kept object's name -> its st.object record
let agentAllowed = false;     // the package setting: run an agent's evaluations as they come
let agent = null;
let capturing = null;         // the Transcript text an agent's evaluation writes
// What the lane reads: whether Slip has started, and its image.
window.slip = { ready: false, get image() { return image; }, get persisting() { return persisting; }, get running() { return Boolean(running); },
  get stopped() { return Boolean(stopped); }, get debugging() { return Boolean(debug?.process); } };
let tab = 'workspace';
let activeEditor = 'editor';  // the text area Do it, Print it and the others act on
let browser = null, inspector = null, debug = null;
// A run that stopped for the debugger, shown as a notifier under its text area, and where a
// run the debugger has came from: { proc, id, how, source, start, end }.
let stopped = null;
let debugging = null;

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
  if (capturing !== null) capturing += text;
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
  vm.hooks.request = createBridge(vm, { nendo, objects, canKeep: () => persisting && !missing.includes(E.object) });
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
  if (nendo.has('settings.all')) {
    try { agentAllowed = (await nendo.settings.all())[SETTING] === true; } catch { agentAllowed = false; }
    nendo.on('settingsChanged', values => { agentAllowed = values?.[SETTING] === true; renderAgent(); if (agentAllowed) agent.drain(); });
  }
  return true;
}

// Reads the file's classes, methods and pages into the image. Nothing it loads is written back.
async function loadFile() {
  const schema = await nendo.schema.describe();
  if (!hasSchema(schema)) { persisting = false; return; }
  missing = missingEntities(schema);
  const [classes, methods, pageRecords] = await Promise.all([E.cls, E.method, E.page].map(entityId => nendo.records.queryAll({ entityId }, { max: 20000 })));
  await readLater();
  classRecords = new Map(classes.map(r => [r.values[F.cls.name], r]));
  methodRecords = new Map(methods.map(r => [recordMethodKey(r.values), r]));
  const loaded = loadRecords(image, classes, methods);
  if (loaded.classes || loaded.methods) transcript(`This file's code: ${plural(loaded.classes, 'class', 'classes')}, ${plural(loaded.methods, 'method')}.\n`);
  for (const problem of loaded.problems) transcript(`Not loaded: ${problem}\n`);
  takePages(pageRecords);
  persisting = !readOnly();
}

// The kept objects and an agent's evaluations, where the file has their record types.
async function readLater() {
  if (!missing.includes(E.object)) {
    const kept = await nendo.records.queryAll({ entityId: E.object }, { max: 20000 });
    objects.clear();
    for (const r of kept) objects.set(String(r.values[F.object.name] ?? ''), r);
  }
  if (!missing.includes(E.evaluation)) agent.take(await nendo.records.queryAll({ entityId: E.evaluation }, { max: 2000 }));
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
    if (missing.length) {
      const before = missing.length;
      missing = missingEntities(await nendo.schema.describe());
      if (missing.length < before) { setupPending = null; say('This file now keeps objects and takes an agent\'s evaluations.'); }
    }
    const [classes, methods, pageRecords] = await Promise.all([E.cls, E.method, E.page].map(entityId => nendo.records.queryAll({ entityId }, { max: 20000 })));
    await readLater();
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
        catch (error) { transcript(`Not loaded: ${key}: ${error.message}\n`); reportToAgent(`Slip could not compile ${key}: ${error.message}`); }
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

// A compile error in code from outside reaches the agent that wrote it: Nendo reports an error
// a view does not catch to nendo://application/extension-events (ADR-0032).
function reportToAgent(text) {
  try { globalThis.reportError?.(new Error(text)); } catch { /* nothing to report to */ }
}

const setupTitle = () => persisting ? MORE_TITLE : SETUP_TITLE;
const setupOperations = plain => schemaOperations({ plain, only: persisting ? missing : null });

async function proposeSetup() {
  const SETUP_TITLE = setupTitle();
  if (setupPending) { say(`Accept "${SETUP_TITLE}" in Nendo's review.`); return; }
  if (!nendo.has('proposals.prepare')) { say('This version of Nendo cannot take a proposal from a view. Build the file with Slip\'s record types instead.', { problem: true }); return; }
  let answer;
  try { answer = await nendo.proposals.prepare(SETUP_TITLE, setupOperations(false)); }
  catch (error) {
    if (!/expectedDefinitionRevision/.test(error.message ?? '')) {
      say(error.code === 'proposal-waiting' ? 'Another proposal from Slip is waiting in Nendo. Accept or reject it first.' : `Nendo did not take it: ${error.message}`, { problem: true });
      return;
    }
    try { answer = await nendo.proposals.prepare(SETUP_TITLE, setupOperations(true)); }
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
  if (state !== 'active') {
    setupPending = null;
    say(persisting ? `"${MORE_TITLE}" was not accepted.` : `"${SETUP_TITLE}" was not accepted. Slip keeps your work on this page only.`);
    renderNotices();
    return;
  }
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
function takeSource(editor) {
  let start = editor.selectionStart, end = editor.selectionEnd;
  if (start === end) {
    start = editor.value.lastIndexOf('\n', start - 1) + 1;
    end = editor.value.indexOf('\n', end);
    if (end < 0) end = editor.value.length;
    editor.setSelectionRange(start, end);
  }
  return { source: editor.value.slice(start, end), start, end };
}

// Each text area shows what it evaluated in its own box; in the inspector, self is the object.
const RESULT_BOX = { editor: 'result', 'i-eval': 'i-result', 'b-code': 'b-problem' };

/** Runs an evaluation to its end or its stop, with Stop offered meanwhile. */
async function track(evaluation) {
  running = evaluation;
  renderRunning();
  let outcome;
  try { outcome = await evaluation; } finally { running = null; renderRunning(); }
  browser.render();
  if (inspector.open) inspector.render();
  renderTally();
  return outcome;
}

/** Evaluates in the active text area. how: 'do', 'print' or 'inspect'. */
async function evaluate(how) {
  if (running) { say('Slip is still running. Press Ctrl+. to stop it.'); return; }
  dropStopped();
  const id = activeEditor;
  const { source, start, end } = takeSource($(id));
  if (!source.trim()) { say('Select something to evaluate.'); return; }
  const receiver = id === 'i-eval' ? inspector.value : null;
  const origin = { id, how, source, start, end };
  finish(await track(image.evaluate(source, { receiver })), origin);
}

/** Shows how a run ended, or the notifier for one that stopped. */
function finish(outcome, origin) {
  const { id, how, source, start, end } = origin;
  const editor = $(id);
  if (outcome.suspended) { showStopped(outcome.suspended, origin); return; }
  if (outcome.error) { showError(outcome.error, start, id); return; }
  if (how === 'inspect') { $(RESULT_BOX[id]).hidden = true; inspector.inspect(outcome.value); return; }
  const printed = image.printString(outcome.value, 1000);
  if (how === 'print' && editor.value.slice(start, end) === source) {
    editor.setRangeText(` ${printed}`, end, end, 'select');
    editor.focus();
    if (id === 'editor') edited();
    else editor.dispatchEvent(new Event('input'));
    $(RESULT_BOX[id]).hidden = true;
  } else showResult(printed, outcome.ms, id);
}

/** The notifier: why the run stopped, where, and Debug, Proceed or Abandon. */
function showStopped(proc, origin) {
  stopped = { proc, ...origin };
  const { kind, exception } = proc.suspended;
  const from = kind === 'unhandled' ? vm.signallerContext(exception) ?? proc.ctx : proc.ctx;
  const box = $(RESULT_BOX[origin.id]);
  box.classList.add('problem');
  box.replaceChildren(h('span', { class: 'title' }, stoppedTitle(vm, proc)), h('span', { class: 'trace' }, vm.stackOf(from, 8).join('\n')),
    h('span', { class: 'actions' },
      h('button', { type: 'button', class: 'primary', 'data-act': 'debug', onclick: debugStopped }, 'Debug'),
      h('button', { type: 'button', 'data-act': 'proceed', onclick: proceedStopped }, 'Proceed'),
      h('button', { type: 'button', 'data-act': 'abandon', onclick: () => { dropStopped(); box.hidden = true; } }, 'Abandon')));
  box.hidden = false;
}

/** Abandons the run the notifier holds, if any: its ensure: blocks run. */
function dropStopped() {
  if (!stopped) return;
  const problem = image.abandon(stopped.proc);
  stopped = null;
  if (problem) say(`An ensure: block failed: ${problem}`, { problem: true });
}

async function proceedStopped() {
  if (!stopped || running) return;
  const { proc, ...origin } = stopped;
  stopped = null;
  finish(await track(image.continue(proc)), origin);
}

function debugStopped() {
  if (!stopped) return;
  const { proc, ...origin } = stopped;
  stopped = null;
  $(RESULT_BOX[origin.id]).hidden = true;
  openDebugger(proc, origin);
}

function openDebugger(proc, origin) {
  if (debug.process && debug.process !== proc) image.abandon(debug.process);
  debugging = origin;
  debug.open(proc);
  showTab('debugger');
}

/** Debug it: the selection in the debugger, stopped before its first statement. */
function debugIt() {
  if (running) { say('Slip is still running. Press Ctrl+. to stop it.'); return; }
  dropStopped();
  const id = activeEditor;
  const { source, start, end } = takeSource($(id));
  if (!source.trim()) { say('Select something to debug.'); return; }
  const proc = image.debug(source, { receiver: id === 'i-eval' ? inspector.value : null });
  if (proc.error) { showError(proc.error, start, id); return; }
  $(RESULT_BOX[id]).hidden = true;
  openDebugger(proc, { id, how: 'do', source, start, end });
}

/** A run the debugger had ended: back to where it came from, with its result. */
function debugEnded(outcome, how) {
  const origin = debugging;
  debugging = null;
  showTab(origin?.id === 'b-code' ? 'browser' : 'workspace');
  if (!origin) return;
  if (how === 'abandon') { showResult('Abandoned.', 0, origin.id); return; }
  finish(outcome, origin);
}

/** Opens the browser on the class the selection, or the word at the caret, names. */
function browseIt() {
  const editor = $(activeEditor);
  let start = editor.selectionStart, end = editor.selectionEnd;
  if (start === end) {
    while (start > 0 && /[A-Za-z0-9_]/.test(editor.value[start - 1])) start--;
    while (end < editor.value.length && /[A-Za-z0-9_]/.test(editor.value[end])) end++;
  }
  const word = editor.value.slice(start, end);
  const cls = classOfWord(vm, word) ?? (inspector.open && activeEditor === 'i-eval' && !word.trim() ? vm.classOf(inspector.value) : null);
  if (!cls) { say(word.trim() ? `There is no class named ${word.trim()}.` : 'Put the caret on a class name to browse it.'); return; }
  showTab('browser');
  browser.browse(cls.isMeta ? cls.thisClass : cls);
}

function showResult(printed, ms, id = 'editor') {
  const box = $(RESULT_BOX[id]);
  box.classList.remove('problem');
  box.replaceChildren(h('span', { class: 'ok' }, '✓ '), printed, h('span', { class: 'trace' }, `${Math.max(1, Math.round(ms))} ms`));
  box.hidden = false;
}

function showError(error, start, id = 'editor') {
  const box = $(RESULT_BOX[id]);
  box.classList.add('problem');
  const title = error.interrupted ? 'Stopped.' : error.message;
  box.replaceChildren(h('span', { class: 'title' }, title), ...(error.trace?.length && !error.interrupted ? [h('span', { class: 'trace' }, error.trace.join('\n'))] : []));
  box.hidden = false;
  if (error.position !== undefined) { const at = start + error.position; $(id).focus(); $(id).setSelectionRange(at, at); }
}

function stop() {
  if (!running) { say('Nothing is running.'); return; }
  running.stop();
}

function run(command) {
  if (command === 'doit') evaluate('do');
  else if (command === 'printit') evaluate('print');
  else if (command === 'inspectit') evaluate('inspect');
  else if (command === 'browseit') browseIt();
  else if (command === 'debugit') debugIt();
  else if (command === 'keep') keep();
  else if (command === 'stop') stop();
}

function showTab(name) {
  tab = name === 'browser' || (name === 'debugger' && debug.process) ? name : 'workspace';
  if (tab !== 'debugger') remember('slip.tab', tab);
  for (const pane of ['workspace', 'browser', 'debugger']) {
    $(`${pane}-pane`).hidden = tab !== pane;
    $(`tab-${pane}`).setAttribute('aria-selected', String(tab === pane));
  }
  if (activeEditor !== 'i-eval' && tab !== 'debugger') activeEditor = tab === 'browser' ? 'b-code' : 'editor';
  if (tab === 'browser') browser.render();
}

// ---- The agent -----------------------------------------------------------------------

const idle = () => new Promise(resolve => { const check = () => running ? setTimeout(check, 100) : resolve(); check(); });

/** Runs an agent's evaluation once nothing else runs; Stop reaches it as any run. */
async function evaluateForAgent(source) {
  await idle();
  const first = source.trim().split('\n')[0].slice(0, 80);
  transcript(`An agent's evaluation runs: ${first}\n`);
  const outcome = await track(image.evaluate(source));
  transcript(outcome.error || outcome.suspended ? 'It failed; the agent reads why in its record.\n' : 'It ran; the agent reads the result in its record.\n');
  return outcome;
}

/** Ask the agent, from the debugger: the stack and the methods at fault, as the file's records. */
async function askAgent({ title, frames, chosen }) {
  const labels = frames.map(frame => frameLabel(vm, frame));
  const context = [];
  for (const frame of frames) {
    const method = frame.method.methodClass ? frame.method : frame.method.method;
    if (context.length >= 8 || !method?.methodClass) continue;
    const owner = method.methodClass;
    const key = methodKey(vm.instanceClass(owner).name, owner.isMeta ? SIDE.class : SIDE.instance, method.selector);
    const record = methodRecords.get(key);
    const uri = record && `nendo://application/entity/${encodeURIComponent(E.method)}/records?recordId=${encodeURIComponent(record.recordId)}`;
    if (!record || context.some(item => item.uri === uri)) continue;
    context.push({ uri, title: key.slice(0, 120), text: String(method.source ?? '').slice(0, 3800) });
  }
  const text = `Slip, the Smalltalk in this file, stopped a run: ${title}\n\nThe stack, innermost first:\n${labels.slice(0, 40).join('\n')}\n\n`
    + `I am looking at ${labels[chosen] ?? 'the top frame'}. Find the cause. If a method is at fault, change its st.method record: Slip compiles a changed method as soon as it arrives. Say what you found and what you changed.`;
  say('Asking the agent. Nendo may ask you first.');
  try {
    const answer = await nendo.assistant.ask(text.slice(0, 100000), { context });
    transcript(`The agent answered:\n${answer?.reply ?? ''}\n`);
    say('The agent answered. Its reply is in the Transcript.');
  } catch (error) {
    say(error.code === 'assistant-declined' ? 'The agent was not asked: you said Not now.' : `The agent was not asked: ${error.message}`, { problem: true });
  }
}

function renderAgent() {
  const box = $('agent-queue');
  if (!box || !agent) return;
  const list = agent.waiting;
  box.hidden = list.length === 0;
  if (!list.length) { box.replaceChildren(); return; }
  const canSet = framed && nendo.has('settings.set');
  box.replaceChildren(
    h('p', {}, h('strong', {}, `An agent asks Slip to run ${plural(list.length, 'evaluation')}.`), ' ',
      agentAllowed ? 'Slip runs them as they come, as Slip\'s settings say.' : 'Each runs only when you press Run. Read it first: it runs with everything this page can reach.'),
    h('ol', {}, ...list.slice(0, 5).map(record => h('li', { 'data-record': record.recordId },
      h('pre', {}, String(record.values[F.evaluation.source] ?? '').split('\n').slice(0, 8).join('\n')),
      h('span', { class: 'actions' },
        h('button', { type: 'button', 'data-act': 'run', disabled: Boolean(running), onclick: () => agent.run(record) }, 'Run'),
        h('button', { type: 'button', 'data-act': 'decline', onclick: () => agent.decline(record) }, 'Decline'))))),
    list.length > 5 ? h('p', {}, `And ${list.length - 5} more.`) : null,
    canSet && !agentAllowed ? h('button', { type: 'button', 'data-act': 'allow', onclick: () => nendo.settings.set(SETTING, true).catch(error => say(error.message, { problem: true })) }, 'Run them as they come on this computer') : null);
}

// ---- Drawing -------------------------------------------------------------------------

function render() {
  renderAgent();
  renderPages();
  renderSaved();
  renderTally();
  renderNotices();
  renderRunning();
  browser?.render();
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
  if (framed && persisting && !readOnly() && missing.length)
    notices.push(h('div', { class: 'notice setup' },
      h('p', {}, setupPending ? `Accept "${MORE_TITLE}" in Nendo's review.`
        : 'Slip can also keep objects you keep with Slip keep:as:, and take evaluations an agent asks for. That needs two more record types in this file.'),
      setupPending ? null : h('button', { type: 'button', onclick: proposeSetup }, 'Ask Nendo')));
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
      { kind: 'button', id: 'inspectit', label: 'Inspect it', disabled: Boolean(running) },
      { kind: 'button', id: 'browseit', label: 'Browse it', disabled: Boolean(running) },
      { kind: 'button', id: 'debugit', label: 'Debug it', disabled: Boolean(running) },
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
  // Ctrl+B is Nendo's own key, which api.js hands to the Workbench; Browse it takes Ctrl+Shift+B.
  const command = event.shiftKey ? KEYS_SHIFTED[key] : KEYS[key];
  if (command) { event.preventDefault(); run(command); }
});

// Ctrl+S: in the browser it accepts the code; elsewhere it keeps the Workspace page now.
function keep() {
  if (activeEditor === 'b-code' || document.activeElement?.closest?.('#browser-pane')) { browser.acceptCode(); return; }
  const page = currentPage();
  if (page) { page.source = $('editor').value; savePage(page); }
}
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
for (const id of Object.keys(RESULT_BOX)) $(id).addEventListener('focus', () => { activeEditor = id; });
$('tab-workspace').addEventListener('click', () => showTab('workspace'));
$('tab-browser').addEventListener('click', () => showTab('browser'));
$('tab-debugger').addEventListener('click', () => showTab('debugger'));
$('own-toolbar').addEventListener('click', event => { const command = event.target.closest('button')?.dataset.command; if (command) run(command); });
window.addEventListener('pagehide', () => { const page = currentPage(); if (page) { page.source = $('editor').value; savePage(page); } });

browser = createBrowser({ image: () => image, h, say, remember, recall, changed: () => renderTally() });
inspector = createInspector({ image: () => image, h, say,
  open: on => {
    $('inspector').hidden = !on;
    $('app').dataset.inspecting = String(on);
    if (!on && activeEditor === 'i-eval') activeEditor = tab === 'browser' ? 'b-code' : 'editor';
  } });

debug = createDebugger({ image: () => image, h, say, track, ended: debugEnded,
  canAsk: () => framed && nendo.has('assistant.ask'), ask: askAgent,
  inspect: value => inspector.inspect(value),
  show: on => {
    $('tab-debugger').hidden = !on;
    if (!on && tab === 'debugger') showTab('workspace');
  } });

agent = createAgentQueue({ nendo, image: () => image, say, changed: () => renderAgent(), allowed: () => agentAllowed,
  evaluate: evaluateForAgent,
  capture: on => { if (on) { capturing = ''; return ''; } const text = capturing ?? ''; capturing = null; return text; } });

async function start() {
  try {
    await boot();
    if (await connect()) await loadFile();
    if (!persisting) pages = pages.concat((recall('slip.pages') ?? []).map(p => ({ ...p, record: null, dirty: false })));
    const wanted = pages.find(p => p.id === recall('slip.page')) ?? pages[0] ?? newPage('Workspace', FIRST_PAGE);
    show(wanted);
    savePage(wanted);
    showTab(recall('slip.tab') ?? 'workspace');
  } catch (error) {
    $('tally').textContent = 'Not started';
    say(`Slip could not start: ${error.message}`, { problem: true });
  } finally { $('app').removeAttribute('aria-busy'); window.slip.ready = true; }
}
start();
