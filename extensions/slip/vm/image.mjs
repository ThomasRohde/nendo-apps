// Slip's image: a VM with its kernel loaded, plus what the view and the tests ask of it:
// file in chunk-format source, evaluate a doit, print a result, and run processes in time
// slices so a long evaluation never freezes the page.
import { VM, SmalltalkError, STClass } from './vm.mjs';

/** The kernel's source files, in the order they load. */
export const KERNEL_FILES = [
  'Object.st', 'Boolean.st', 'Magnitude.st', 'Number.st', 'Character.st',
  'Collection.st', 'Sequenceable.st', 'OrderedCollection.st', 'String.st', 'Hashed.st',
  'Stream.st', 'Block.st', 'Exception.st', 'Class.st', 'System.st',
];

/** Splits chunk-format text at single bangs; a doubled bang stands for one. */
export function chunks(text) {
  const out = [];
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '!') {
      if (text[i + 1] === '!') { current += '!'; i++; continue; }
      out.push(current);
      current = '';
      continue;
    }
    current += c;
  }
  if (current.trim()) out.push(current);
  return out;
}

/** Writes one method as chunk text: its bangs doubled. */
export const chunk = text => text.replaceAll('!', '!!');

export class Image {
  constructor(hooks = {}) {
    this.vm = new VM(hooks);
    this.bindings = new Map();     // the Workspace's variables
    this.queue = [];
  }

  /** Loads the kernel from a function that reads one file's text by name. */
  async loadKernel(read) {
    this.vm.quiet++;
    try {
      for (const name of KERNEL_FILES) this.fileIn(await read(name), name);
    } finally { this.vm.quiet--; }
  }

  loadKernelSync(read) {
    this.vm.quiet++;
    try { for (const name of KERNEL_FILES) this.fileIn(read(name), name); }
    finally { this.vm.quiet--; }
  }

  /**
   * Files in chunk-format source: doits, and methods after a `!Foo methodsFor: 'x'!` line.
   * Answers {methods, doits, errors}; an error names its chunk and does not stop the rest.
   */
  fileIn(text, origin = 'source') {
    const list = chunks(text);
    const result = { methods: 0, doits: 0, errors: [] };
    let i = 0;
    while (i < list.length) {
      const piece = list[i].trim();
      if (piece === '') {
        const header = (list[i + 1] ?? '').trim();
        const match = header.match(/^([A-Z][A-Za-z0-9_]*)(\s+class)?\s+methodsFor:\s*'((?:[^']|'')*)'(?:\s+stamp:\s*'(?:[^']|'')*')?$/);
        i += 2;
        if (!match) {
          if (header) result.errors.push(`${origin}: cannot read the header "${header.slice(0, 60)}".`);
          continue;
        }
        const owner = this.vm.globalBinding(match[1])?.f[1];
        const cls = owner instanceof STClass ? (match[2] ? owner.cls : owner) : null;
        while (i < list.length && list[i].trim() !== '') {
          const source = list[i].replace(/^\s*\n/, '').replace(/\s+$/, '');
          if (!cls) result.errors.push(`${origin}: there is no class ${match[1]}.`);
          else {
            try { this.vm.installSource(cls, source, match[3].replaceAll('\'\'', '\'')); result.methods++; }
            catch (error) { result.errors.push(`${origin}: ${error.message}${error.position !== undefined ? ` (at ${error.position} in ${source.split('\n')[0]})` : ''}`); }
          }
          i++;
        }
        i++;
        continue;
      }
      const proc = this.process(piece);
      if (proc.error) result.errors.push(`${origin}: ${proc.error.message}`);
      else {
        this.vm.run(proc);
        if (proc.error) result.errors.push(`${origin}: ${proc.error.message} in "${piece.slice(0, 60)}"`);
      }
      result.doits++;
      i++;
    }
    return result;
  }

  process(source, receiver = null) {
    try { return this.vm.newProcess(this.vm.doitContext(source, this.bindings, receiver)); }
    catch (error) {
      if (error instanceof SmalltalkError) return { done: true, error };
      throw error;
    }
  }

  /** Evaluates a doit to its end, here and now. Answers {value, error}. For the tests. */
  evaluateSync(source) {
    const proc = this.process(source);
    if (!proc.done) this.vm.run(proc);
    return { value: proc.value, error: proc.error };
  }

  /**
   * The printString of a value, or a plain description when printString itself fails. With a
   * budget, a printOn: that runs too long is stopped and described instead.
   */
  printString(value, budgetMs = Infinity) {
    try { return this.vm.js(this.vm.sendSync(value, 'printString', [], budgetMs)); }
    catch (error) { return `${this.vm.describe(value)} (printString failed: ${error.message})`; }
  }

  displayString(value) {
    try { return this.vm.js(this.vm.sendSync(value, 'displayString')); }
    catch { return this.printString(value); }
  }

  /** Evaluates and answers the result's printString, or throws the error. For the tests. */
  print(source) {
    const { value, error } = this.evaluateSync(source);
    if (error) throw error;
    return this.printString(value);
  }

  /**
   * Evaluates a doit in time slices of about 8 ms, yielding to the page between them.
   * Answers a promise of {value, error, ms}. evaluation.stop() interrupts it. With a receiver,
   * self in the doit is that object, as in an inspector.
   */
  evaluate(source, { slice = 8, yieldTo = defaultYield, receiver = null } = {}) {
    const proc = this.process(source, receiver);
    const started = performance.now();
    const promise = new Promise(resolve => {
      const step = () => {
        if (!proc.done) this.vm.run(proc, slice);
        if (proc.done) resolve({ value: proc.value, error: proc.error, ms: performance.now() - started });
        else yieldTo(step);
      };
      step();
    });
    promise.stop = () => { proc.interrupted = true; };
    promise.process = proc;
    return promise;
  }
}

// A message to itself yields to the page sooner than setTimeout, which browsers clamp.
// The channel is made on first use, so importing this module keeps nothing alive.
let channel = null;
const waiting = [];
function defaultYield(fn) {
  if (typeof MessageChannel === 'undefined' || typeof window === 'undefined') { setTimeout(fn, 0); return; }
  if (!channel) { channel = new MessageChannel(); channel.port1.onmessage = () => waiting.shift()?.(); }
  waiting.push(fn);
  channel.port2.postMessage(0);
}
