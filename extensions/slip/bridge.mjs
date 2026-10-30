// Slip's bridge to Nendo, as Smalltalk sees it: Nendo's records as NendoRecord objects, and
// objects kept on purpose with Slip keep:as:, written as STON text in st.object records. No page
// here: the view hands it its window.nendo, and the tests a fake one.
import { STObject, STClass, F as Float, Ch, Closure, Context, Method } from './vm/vm.mjs';
import { formatFloat } from './vm/primitives.mjs';
import { E, F } from './records.mjs';

/** A refusal the bridge raises: the Smalltalk side signals it as an Error with this text. */
export class BridgeError extends Error {}

// ---- Values between Smalltalk and Nendo -----------------------------------------------

/** A Smalltalk value as a record value: text, a number, true or false, null, or a list of them. */
export function toRecordValue(vm, value) {
  if (value === null || value === undefined || value === true || value === false) return value ?? null;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number.isSafeInteger(Number(value)) ? Number(value) : String(value);
  if (value instanceof Float) return value.v;
  if (value instanceof Ch) return String.fromCodePoint(value.code);
  if (vm.isString(value)) return vm.js(value);
  if (value instanceof STObject && value.cls === vm.classes.Array) return value.idx.map(item => toRecordValue(vm, item));
  throw new BridgeError(`${vm.describe(value)} cannot be a record's value; give it text, a number, a Boolean, nil or an Array of them.`);
}

/** A record value as Smalltalk sees it. An object Slip has no class for comes as its JSON text. */
export function fromRecordValue(vm, value) {
  if (value === null || value === undefined || value === true || value === false) return value ?? null;
  if (typeof value === 'number') return Number.isInteger(value) ? value : new Float(value);
  if (typeof value === 'string') return vm.str(value);
  if (Array.isArray(value)) return vm.array(value.map(item => fromRecordValue(vm, item)));
  return vm.str(JSON.stringify(value));
}

/** A record as a NendoRecord: entityId, recordId, version and a Dictionary of its values. */
export function recordObject(vm, record) {
  const values = vm.sendSync(vm.classes.Dictionary, 'new');
  for (const [field, value] of Object.entries(record.values ?? {})) vm.sendSync(values, 'at:put:', [vm.str(field), fromRecordValue(vm, value)]);
  const object = new STObject(vm.classes.NendoRecord, 4);
  object.f[0] = vm.str(record.entityId);
  object.f[1] = vm.str(record.recordId);
  object.f[2] = record.version ?? null;
  object.f[3] = values;
  object.record = record;
  return object;
}

/** The values a Dictionary holds, keyed by field ID, as a write takes them. */
export function valuesOf(vm, dictionary) {
  if (!(dictionary instanceof STObject) || !isKind(vm, dictionary, vm.classes.Dictionary)) throw new BridgeError('The values must be a Dictionary of field IDs and values.');
  const out = {};
  for (const association of dictionary.f[1].idx) {
    if (!association) continue;
    const key = association.f[0];
    if (!vm.isString(key)) throw new BridgeError(`A field ID must be text, not ${vm.describe(key)}.`);
    out[vm.js(key)] = toRecordValue(vm, association.f[1]);
  }
  return out;
}

function isKind(vm, object, cls) {
  for (let c = vm.classOf(object); c; c = c.superclass) if (c === cls) return true;
  return false;
}

// ---- STON: the text a kept object is written as -----------------------------------------
// A subset of STON (Smalltalk Object Notation): nil, true, false, numbers, 'strings', #symbols,
// [Arrays], ClassName[elements] for OrderedCollection and Set, Dictionary{key:value},
// ClassName{#ivar:value} for any other object, Class['Name'] for a class, Character['a'],
// and @n for the n-th object written, so shared parts and cycles come back as they were.

const quote = text => `'${text.replaceAll('\\', '\\\\').replaceAll('\'', '\\\'')}'`;
// A symbol with a colon is quoted, so a Dictionary's #key:value reads one way only.
const plainSymbol = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** An object's STON text. Throws BridgeError for what cannot be kept: a block, a context. */
export function writeSton(vm, root) {
  const C = vm.classes;
  const seen = new Map();
  const write = value => {
    if (value === null || value === undefined) return 'nil';
    if (value === true || value === false) return String(value);
    if (typeof value === 'number' || typeof value === 'bigint') return String(value);
    if (value instanceof Float) return Number.isFinite(value.v) ? formatFloat(value.v) : `Float['${formatFloat(value.v)}']`;
    if (value instanceof Ch) return `Character[${quote(String.fromCodePoint(value.code))}]`;
    if (value instanceof STClass) {
      if (value.isMeta) throw new BridgeError(`${vm.className(value)} is a metaclass, which cannot be kept.`);
      return `Class[${quote(value.name)}]`;
    }
    if (value instanceof Closure || value instanceof Context || value instanceof Method) throw new BridgeError(`${vm.describe(value)} cannot be kept: code runs only while Slip is open.`);
    if (value.s !== undefined) return plainSymbol.test(value.s) ? `#${value.s}` : `#${quote(value.s)}`;
    if (vm.isString(value) && value.cls === C.String) return quote(vm.js(value));
    if (seen.has(value)) return `@${seen.get(value)}`;
    seen.set(value, seen.size + 1);
    const cls = value.cls;
    if (cls === C.Array) return `[${value.idx.map(write).join(',')}]`;
    if (cls === C.OrderedCollection) return `OrderedCollection[${value.f[0].idx.slice(value.f[1] - 1, value.f[2]).map(write).join(',')}]`;
    if (cls === C.Set) return `Set[${value.f[1].idx.filter(e => e !== null && e !== undefined).map(write).join(',')}]`;
    if (cls === C.Dictionary) return `Dictionary{${value.f[1].idx.filter(Boolean).map(a => `${write(a.f[0])}:${write(a.f[1])}`).join(',')}}`;
    if (cls === C.ByteArray) return `ByteArray[${quote(value.idx.map(b => b.toString(16).padStart(2, '0')).join(''))}]`;
    if (!(value instanceof STObject) || value.idx !== undefined) throw new BridgeError(`${vm.describe(value)} cannot be kept: Slip keeps named fields, Arrays, OrderedCollections, Sets and Dictionaries.`);
    const names = vm.allInstVarNames(cls);
    return `${cls.name}{${names.map((name, i) => `#${name}:${write(value.f[i] ?? null)}`).join(',')}}`;
  };
  return write(root);
}

/** The object a STON text describes, made in the image. Throws BridgeError when it cannot be read. */
export function readSton(vm, text) {
  const C = vm.classes;
  let at = 0;
  const made = [];
  const fail = what => { throw new BridgeError(`The kept text cannot be read at ${at}: ${what}.`); };
  const space = () => { while (/\s/.test(text[at] ?? '')) at++; };
  const expect = c => { space(); if (text[at] !== c) fail(`${c} was expected`); at++; };
  const string = () => {
    at++;
    let out = '';
    while (at < text.length && text[at] !== '\'') { if (text[at] === '\\') at++; out += text[at++]; }
    if (text[at] !== '\'') fail('a string does not end');
    at++;
    return out;
  };
  const list = (close, item) => {
    const out = [];
    space();
    if (text[at] === close) { at++; return out; }
    while (true) {
      out.push(item());
      space();
      if (text[at] === ',') { at++; continue; }
      if (text[at] === close) { at++; return out; }
      fail(`, or ${close} was expected`);
    }
  };
  const classNamed = name => {
    const cls = vm.globalBinding(name)?.f[1];
    if (!(cls instanceof STClass) || cls.isMeta) fail(`there is no class ${name}`);
    return cls;
  };
  const read = () => {
    space();
    const c = text[at];
    if (c === '\'') return vm.str(string());
    if (c === '#') {
      at++;
      if (text[at] === '\'') return vm.symbol(string());
      const word = /^[A-Za-z0-9_]*/.exec(text.slice(at))[0];
      if (!word) fail('a symbol was expected');
      at += word.length;
      return vm.symbol(word);
    }
    if (c === '@') { at++; const n = Number(/^\d+/.exec(text.slice(at))?.[0] ?? fail('a reference needs a number')); at += String(n).length; return made[n - 1] ?? fail(`there is no object @${n}`); }
    if (c === '[') { at++; const array = vm.array([]); made.push(array); array.idx = list(']', read); return array; }
    const number = /^-?\d+(\.\d+)?(e-?\d+)?/.exec(text.slice(at));
    if (number) {
      at += number[0].length;
      if (number[1] || number[2]) return new Float(Number(number[0]));
      const n = BigInt(number[0]);
      return n >= BigInt(Number.MIN_SAFE_INTEGER) && n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : n;
    }
    const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(at))?.[0] ?? fail('a value was expected');
    at += word.length;
    if (word === 'nil') return null;
    if (word === 'true') return true;
    if (word === 'false') return false;
    space();
    if (word === 'Class' || word === 'Character' || word === 'Float' || word === 'ByteArray') {
      expect('['); space();
      if (text[at] !== '\'') fail('a string was expected');
      const inner = string();
      expect(']');
      if (word === 'Class') return classNamed(inner);
      if (word === 'Character') return vm.ch(inner.codePointAt(0));
      if (word === 'Float') return new Float(inner === 'Float nan' ? NaN : inner === 'Float infinity' ? Infinity : -Infinity);
      const bytes = new STObject(C.ByteArray, 0, inner.match(/../g)?.map(h => parseInt(h, 16)) ?? []);
      made.push(bytes);
      return bytes;
    }
    const cls = classNamed(word);
    if (text[at] === '[') {
      at++;
      const collection = vm.sendSync(cls, 'new');
      made.push(collection);
      for (const item of list(']', read)) vm.sendSync(collection, 'add:', [item]);
      return collection;
    }
    if (text[at] !== '{') fail(`[ or { was expected after ${word}`);
    at++;
    if (cls === C.Dictionary) {
      const dictionary = vm.sendSync(cls, 'new');
      made.push(dictionary);
      list('}', () => { const key = read(); expect(':'); vm.sendSync(dictionary, 'at:put:', [key, read()]); return null; });
      return dictionary;
    }
    if (cls.format !== 'fixed') fail(`${word} is not an object of named fields`);
    const object = new STObject(cls, vm.allInstVarNames(cls).length);
    made.push(object);
    const names = vm.allInstVarNames(cls);
    list('}', () => {
      space();
      if (text[at] !== '#') fail('a field name was expected');
      at++;
      const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(at))?.[0] ?? fail('a field name was expected');
      at += name.length;
      expect(':');
      const value = read();
      const index = names.indexOf(name);
      if (index >= 0) object.f[index] = value;
      return null;
    });
    return object;
  };
  const value = read();
  space();
  if (at < text.length) fail('the text goes on after the object');
  return value;
}

// ---- The requests Smalltalk makes ------------------------------------------------------

/**
 * The handler for Nendo request:with:. env: { nendo, canKeep(), objects: Map name -> record }.
 * Each request answers a promise of a Smalltalk value, or rejects with the text of its error.
 */
export function createBridge(vm, env) {
  const need = method => { if (!env.nendo?.has?.(method)) throw new BridgeError('Nendo\'s records can be reached only when Slip runs in a Nendo file.'); };
  const text = (value, what) => { if (!vm.isString(value)) throw new BridgeError(`${what} must be text, not ${vm.describe(value)}.`); return vm.js(value); };
  const recordOf = value => {
    if (!(value instanceof STObject) || value.cls !== vm.classes.NendoRecord || !value.record) throw new BridgeError(`${vm.describe(value)} is not a NendoRecord that Slip read.`);
    return value.record;
  };
  const keepable = () => { if (!env.canKeep()) throw new BridgeError('This file cannot keep objects yet. Ask Nendo for Slip\'s record type for kept objects in the notice above the editor.'); };
  const handlers = {
    async entities() {
      need('schema.describe');
      const schema = await env.nendo.schema.describe();
      return vm.array(schema.entities.map(e => vm.str(e.entityId)));
    },
    async records([entityId]) {
      need('records.query');
      const records = await env.nendo.records.queryAll({ entityId: text(entityId, 'A record type') }, { max: 5000 });
      return vm.array(records.map(r => recordObject(vm, r)));
    },
    async create([entityId, values]) {
      need('records.create');
      return recordObject(vm, await env.nendo.records.create(text(entityId, 'A record type'), valuesOf(vm, values)));
    },
    async update([record, values]) {
      need('records.update');
      return recordObject(vm, await env.nendo.records.update(recordOf(record), valuesOf(vm, values)));
    },
    async delete([record]) {
      need('records.delete');
      await env.nendo.records.delete(recordOf(record));
      return true;
    },
    async keep([name, object]) {
      need('records.create');
      keepable();
      const key = text(name, 'A kept object\'s name');
      const values = { [F.object.name]: key, [F.object.className]: vm.classOf(object).name, [F.object.ston]: writeSton(vm, object) };
      const held = env.objects.get(key);
      env.objects.set(key, held ? await env.nendo.records.update(held, values) : await env.nendo.records.create(E.object, values));
      return object;
    },
    async kept([name]) {
      const key = text(name, 'A kept object\'s name');
      const held = env.objects.get(key);
      if (!held) throw new BridgeError(`Nothing is kept as ${key}.`);
      return readSton(vm, String(held.values[F.object.ston] ?? ''));
    },
    async keptNames() {
      return vm.array([...env.objects.keys()].sort().map(name => vm.symbol(name)));
    },
    async forget([name]) {
      need('records.delete');
      const key = text(name, 'A kept object\'s name');
      const held = env.objects.get(key);
      if (!held) return false;
      await env.nendo.records.delete(held);
      env.objects.delete(key);
      return true;
    },
  };
  // The primitive asks while the interpreter runs; a handler starts only after it has stopped,
  // since making objects (readSton, recordObject) runs Smalltalk of its own.
  return (selector, args) => {
    const handler = handlers[selector];
    if (!handler) return Promise.reject(new BridgeError(`Nendo has no request #${selector}.`));
    return Promise.resolve().then(() => handler(args));
  };
}
