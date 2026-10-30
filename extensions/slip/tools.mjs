// What Slip's class browser and inspector show, read from an image. No page here: the view
// draws it, and the tests read it.
import { STClass, STObject, Closure, Context, F, Ch } from './vm/vm.mjs';
import { OP } from './vm/compiler.mjs';

export const ALL = '-- all --';
/** Slip's keys, with Ctrl, and with Ctrl+Shift; none of them may be one of Nendo's own. */
export const KEYS = { d: 'doit', p: 'printit', i: 'inspectit', '.': 'stop', s: 'keep' };
export const KEYS_SHIFTED = { b: 'browseit', d: 'debugit' };
export const SIDES = { instance: 'instance', class: 'class' };
export const METHOD_TEMPLATE = 'messageSelectorAndArgumentNames\n\t"comment stating purpose of message"\n\n\t| temporary variable names |\n\tstatements';

/** Every class of the image, metaclasses left out, by name. */
export function classes(vm) {
  const out = [];
  const walk = cls => { if (!cls.isMeta) out.push(cls); for (const sub of cls.subclasses) walk(sub); };
  walk(vm.classes.Object);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// A method in protocol *Examples belongs to the Examples package, whichever class holds it.
const extensionOf = protocol => protocol?.startsWith('*') ? protocol.slice(1) : null;
const sidesOf = cls => [cls, cls.cls];

/** The packages, sorted: each class's own, and each package that extends another's class. */
export function packages(vm) {
  const names = new Set();
  for (const cls of classes(vm)) {
    names.add(cls.package || 'Unpackaged');
    for (const side of sidesOf(cls)) for (const m of side.methods.values()) { const pkg = extensionOf(m.protocol); if (pkg) names.add(pkg); }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/**
 * The classes a package shows: its own, then the classes of other packages it adds methods to,
 * marked as extended.
 */
export function classesIn(vm, pkg) {
  const own = [], extended = [];
  for (const cls of classes(vm)) {
    if ((cls.package || 'Unpackaged') === pkg) own.push({ cls, extended: false });
    else if (sidesOf(cls).some(side => [...side.methods.values()].some(m => extensionOf(m.protocol) === pkg))) extended.push({ cls, extended: true });
  }
  return [...own, ...extended];
}

export const sideOf = (cls, side) => side === SIDES.class ? cls.cls : cls;

/** A class side's protocols, sorted, after the entry for all of them. */
export function protocols(cls, side) {
  const names = new Set([...sideOf(cls, side).methods.values()].map(m => m.protocol || 'as yet unclassified'));
  return [ALL, ...[...names].sort((a, b) => a.localeCompare(b))];
}

/** The selectors of one protocol, or of all, sorted. */
export function selectors(cls, side, protocol) {
  return [...sideOf(cls, side).methods.values()]
    .filter(m => protocol === ALL || (m.protocol || 'as yet unclassified') === protocol)
    .map(m => m.selector).sort((a, b) => a.localeCompare(b));
}

export const methodOf = (cls, side, selector) => sideOf(cls, side).methods.get(selector) ?? null;

const quoted = text => `'${String(text).replaceAll('\'', '\'\'')}'`;

/** The message that defines a class as it now stands, as the browser shows it to change. */
export function classDefinition(vm, cls) {
  const maker = cls.format === 'variable' ? 'variableSubclass:' : cls.format === 'bytes' ? 'variableByteSubclass:' : 'subclass:';
  return `${cls.superclass ? cls.superclass.name : 'nil'} ${maker} #${cls.name}\n` +
    `\tinstanceVariableNames: ${quoted(cls.ivars.join(' '))}\n` +
    `\tclassVariableNames: ${quoted([...cls.classVars.keys()].join(' '))}\n` +
    `\tpackage: ${quoted(cls.package || 'Unpackaged')}`;
}

/** The class side's own instance variables, as a metaclass keeps them. */
export const classSideDefinition = cls => `${cls.name} class\n\tinstanceVariableNames: ${quoted(cls.cls.ivars.join(' '))}`;

/** A new class's definition in a package, for the person to fill in. */
export const classTemplate = pkg => `Object subclass: #NameOfSubclass\n\tinstanceVariableNames: ''\n\tclassVariableNames: ''\n\tpackage: ${quoted(pkg || 'Unpackaged')}`;

/** Compiles a method into a class side, kept like any other compile. Throws a parse error. */
export function accept(vm, cls, side, source, protocol) {
  return vm.installSource(sideOf(cls, side), source, protocol || undefined);
}

/** Sets a class's comment, kept as a change to its class. */
export function setComment(vm, cls, text) {
  cls.comment = text;
  if (!vm.quiet) vm.hooks.classDefined?.(cls);
}

/** The class a word names, for Browse it: a class, or a metaclass's class. */
export function classNamed(vm, word) {
  const name = String(word ?? '').trim().replace(/^#/, '').replace(/\s+class$/, '');
  if (!/^[A-Z][A-Za-z0-9_]*$/.test(name)) return null;
  const value = vm.globalBinding(name)?.f[1];
  return value instanceof STClass && !value.isMeta ? value : null;
}

// ---- The inspector -------------------------------------------------------------------

export const INDEXED_SHOWN = 200;
const PRINT_BUDGET_MS = 200;
const PRINT_LENGTH = 300;

/** A value's printString, cut short, never hanging: a slow or broken printOn: is described. */
export function printed(image, value) {
  const text = image.printString(value, PRINT_BUDGET_MS);
  return text.length > PRINT_LENGTH ? `${text.slice(0, PRINT_LENGTH)}…` : text;
}

/**
 * The fields the inspector lists for an object: its instance variables by name, then its
 * indexed slots by number, the first INDEXED_SHOWN of them. Each is {label, value, kind}.
 */
export function fields(vm, value) {
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'bigint' || value instanceof F || value instanceof Ch) return [];
  if (value instanceof STClass) {
    const cls = value;
    const own = cls.isMeta ? cls.thisClass : cls;
    return [
      { label: 'superclass', value: cls.superclass ?? null, kind: 'named' },
      ...(cls.isMeta ? [] : [{ label: 'name', value: vm.str(cls.name), kind: 'named' }, { label: 'package', value: vm.str(cls.package || ''), kind: 'named' }, { label: 'comment', value: vm.str(cls.comment || ''), kind: 'named' }]),
      { label: 'instanceVariables', value: vm.array(cls.ivars.map(n => vm.str(n))), kind: 'named' },
      { label: 'selectors', value: vm.array([...cls.methods.keys()].sort().map(s => vm.symbol(s))), kind: 'named' },
      ...(own ? [...own.classVars].map(([name, association]) => ({ label: name, value: association.f[1], kind: 'classVariable' })) : []),
    ];
  }
  if (value instanceof Closure) return [{ label: 'receiver', value: value.receiver, kind: 'named' }, { label: 'numArgs', value: value.block.numArgs, kind: 'named' }];
  if (value instanceof Context) return [{ label: 'receiver', value: value.receiver, kind: 'named' }, { label: 'sender', value: value.sender, kind: 'named' }];
  if (!(value instanceof STObject)) return [];
  const names = vm.allInstVarNames(vm.classOf(value));
  const out = names.map((name, i) => ({ label: name, value: value.f[i] ?? null, kind: 'named' }));
  if (Array.isArray(value.idx) && !vm.isString(value) && value.s === undefined) {
    value.idx.slice(0, INDEXED_SHOWN).forEach((item, i) => out.push({ label: String(i + 1), value: item ?? null, kind: 'indexed' }));
  }
  return out;
}

/** How many indexed slots an object has beyond those the inspector lists. */
export function moreIndexed(vm, value) {
  return value instanceof STObject && Array.isArray(value.idx) && !vm.isString(value) && value.s === undefined ? Math.max(0, value.idx.length - INDEXED_SHOWN) : 0;
}

/** The inspector's title for an object: its class and printString. */
export function titleOf(image, value) {
  return { className: image.vm.className(image.vm.classOf(value)), printed: printed(image, value) };
}

// ---- The debugger --------------------------------------------------------------------

/** A frame's name, as a stack shows it: "Stack>>pop" or "[] in Stack>>pop". */
export const frameLabel = (vm, ctx) => vm.stackOf(ctx, 1)[0] ?? '?';

const methodOfFrame = ctx => ctx.method.methodClass ? ctx.method : ctx.method.method ?? null;

/** The source a frame runs: its method's, or the doit's. */
export const frameSource = ctx => methodOfFrame(ctx)?.source ?? '';

const SELECTOR = /^(?:[A-Za-z_][A-Za-z0-9_]*:?|[-+*/\\<>=~@%|&?,]+)/;

/**
 * Where a frame is, as a range of its source: the send it waits on, or with next, the send it
 * makes next (the frame a step stopped in). Null when the frame has no send there.
 */
export function frameRange(ctx, { next = false } = {}) {
  const { code, positions } = ctx.method;
  let best = -1, position = -1, first = -1, firstPosition = -1;
  for (let i = 0; i < positions.length; i += 2) {
    const at = positions[i], pos = positions[i + 1];
    if (pos < 0 || (code[at] !== OP.SEND && code[at] !== OP.SUPER)) continue;
    if (first < 0 || at < first) { first = at; firstPosition = pos; }
    const fits = next ? at >= ctx.pc && (best < 0 || at < best) : at < ctx.pc && at > best;
    if (fits) { best = at; position = pos; }
  }
  // A loop's jump back leaves no send after the pc: the next one is its first again.
  if (position < 0 && next) position = firstPosition;
  if (position < 0) return null;
  const source = frameSource(ctx);
  const word = SELECTOR.exec(source.slice(position))?.[0] ?? '';
  return { start: position, end: position + Math.max(1, word.length) };
}

/** A frame's fields: self, then its temporaries and those of the blocks and method around it. */
export function frameFields(vm, ctx) {
  const out = [{ label: 'self', value: ctx.receiver ?? null }];
  const seen = new Set(['self']);
  for (let c = ctx; c; c = c.outer) {
    const names = c.method.tempNames ?? [];
    c.temps.forEach((value, i) => {
      const label = names[i] ?? `temp ${i + 1}`;
      if (seen.has(label)) return;
      seen.add(label);
      out.push({ label, value: value ?? null });
    });
  }
  return out;
}

/** What a stopped process says: the exception's text, or why it stopped. */
export function stoppedTitle(vm, proc) {
  const { kind, exception } = proc.suspended ?? {};
  if (kind === 'unhandled') return vm.exceptionText(exception);
  if (kind === 'interrupt') return 'Stopped.';
  if (kind === 'debug') return 'Debug it: stopped before the first statement.';
  return 'Stepping.';
}

/** The frame the debugger shows first: the one that signalled, below the machinery. */
export function firstFrame(vm, proc, frames) {
  if (proc.suspended?.kind !== 'unhandled') return 0;
  const at = frames.indexOf(vm.signallerContext(proc.suspended.exception));
  return at < 0 ? 0 : at;
}
