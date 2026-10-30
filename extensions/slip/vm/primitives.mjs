// Slip's primitives: the operations a method names with <primitive: 'name'>. A primitive
// answers a value, or FAIL, and then the method's Smalltalk code runs instead, which raises
// the right error or handles the cases the primitive left out (a Fraction, for example). A
// primitive that starts a new context itself (a block's value, perform:) answers SWITCHED.
import { F, Ch, STObject, STClass, Method, Closure, Context, SmalltalkError } from './vm.mjs';
import { tokenize } from './parser.mjs';

export const FAIL = Symbol('fail');
export const SWITCHED = Symbol('switched');

const SAFE = n => Number.isSafeInteger(n);
const kind = x => typeof x === 'number' ? 'i' : typeof x === 'bigint' ? 'b' : x instanceof F ? 'f' : null;
const isInt = x => typeof x === 'number' || typeof x === 'bigint';
const big = x => typeof x === 'bigint' ? x : BigInt(x);
const num = x => x instanceof F ? x.v : Number(x);

function floorDiv(a, b) {
  const q = a / b;
  return (a % b !== 0n && (a < 0n) !== (b < 0n)) ? q - 1n : q;
}

export function formatFloat(v) {
  if (Number.isNaN(v)) return 'Float nan';
  if (v === Infinity) return 'Float infinity';
  if (v === -Infinity) return 'Float negativeInfinity';
  let s = String(v);
  if (s.includes('e')) {
    let [mantissa, exponent] = s.split('e');
    if (!mantissa.includes('.')) mantissa += '.0';
    return `${mantissa}e${exponent.replace('+', '')}`;
  }
  if (!s.includes('.')) s += '.0';
  return s;
}

// FNV-1a with a final mix: a hashed collection takes the low bits, so they must vary.
function stringHash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return h & 0x3fffffff;
}

export function installPrimitives(vm) {
  const P = new Map();
  const def = (name, fn) => P.set(name, fn);
  const C = vm.classes;
  const str = t => vm.str(t);
  const js = o => vm.js(o);
  const isStr = o => vm.isString(o);
  const bool = b => b === true;

  // ---- Object ---------------------------------------------------------------------
  def('class', r => vm.classOf(r));
  def('identical', (r, [a]) => r === a);
  def('identityHash', r => vm.identityHash(r));
  def('describe', r => str(vm.describe(r)));
  def('shallowCopy', r => {
    if (r instanceof STObject) {
      const copy = new STObject(r.cls, 0);
      copy.f = r.f.slice();
      if (r.idx) copy.idx = r.idx.slice();
      return copy;
    }
    if (r instanceof F) return new F(r.v);
    return r;
  });
  def('instVarAt', (r, [i]) => (r instanceof STObject && typeof i === 'number' && i >= 1 && i <= r.f.length) ? r.f[i - 1] : FAIL);
  def('instVarAtPut', (r, [i, v]) => {
    if (!(r instanceof STObject) || typeof i !== 'number' || i < 1 || i > r.f.length || r.s !== undefined) return FAIL;
    r.f[i - 1] = v;
    return v;
  });
  def('basicSize', r => (r && r.idx) ? r.idx.length : 0);
  def('basicAt', (r, [i]) => (r && r.idx && typeof i === 'number' && i >= 1 && i <= r.idx.length) ? r.idx[i - 1] : FAIL);
  def('basicAtPut', (r, [i, v]) => {
    if (!(r && r.idx) || typeof i !== 'number' || i < 1 || i > r.idx.length || r.s !== undefined) return FAIL;
    const format = r.cls.format;
    if (format === 'chars' && !(v instanceof Ch)) return FAIL;
    if (format === 'bytes' && !(typeof v === 'number' && v >= 0 && v <= 255)) return FAIL;
    r.idx[i - 1] = v;
    return v;
  });
  def('perform', (r, args, ctx) => {
    const [selector, ...rest] = args;
    if (!vm.isSymbol(selector) || numArgsOf(selector.s) !== rest.length) return FAIL;
    ctx.stack.push(r, ...rest);
    vm.send(ctx, selector.s, rest.length, false);
    return SWITCHED;
  });
  def('performWithArgs', (r, [selector, array], ctx) => {
    if (!vm.isSymbol(selector) || !(array instanceof STObject) || array.cls !== C.Array || numArgsOf(selector.s) !== array.idx.length) return FAIL;
    ctx.stack.push(r, ...array.idx);
    vm.send(ctx, selector.s, array.idx.length, false);
    return SWITCHED;
  });
  def('respondsTo', (r, [selector]) => vm.isSymbol(selector) && vm.lookup(vm.classOf(r), selector.s) !== null);
  def('error', (r, [text]) => { throw new SmalltalkError(isStr(text) ? js(text) : vm.describe(text), { errorClass: 'Error' }); });
  def('signalUnhandled', r => {
    const text = r.f[0];
    const name = vm.classOf(r).name;
    throw new SmalltalkError(isStr(text) ? `${name}: ${js(text)}` : name, { errorClass: name });
  });
  def('halt', () => { throw new SmalltalkError('Halt. The debugger comes in a later step of Slip.', { errorClass: 'Halt' }); });

  // ---- Classes --------------------------------------------------------------------
  const classOnly = fn => (r, args, ctx) => r instanceof STClass ? fn(r, args, ctx) : FAIL;
  def('basicNew', classOnly(cls => {
    const fixed = vm.allInstVarNames(cls).length;
    switch (cls.format) {
      case 'fixed': return new STObject(cls, fixed);
      case 'variable': case 'chars': case 'bytes': return new STObject(cls, fixed, []);
      default: return FAIL;
    }
  }));
  def('basicNewSize', classOnly((cls, [n]) => {
    if (typeof n !== 'number' || n < 0 || n > 16777216) return FAIL;
    const fixed = vm.allInstVarNames(cls).length;
    switch (cls.format) {
      case 'variable': return new STObject(cls, fixed, new Array(n).fill(null));
      case 'chars': return cls === C.Symbol ? FAIL : new STObject(cls, fixed, new Array(n).fill(vm.ch(32)));
      case 'bytes': return new STObject(cls, fixed, new Array(n).fill(0));
      default: return FAIL;
    }
  }));
  def('className', classOnly(cls => str(vm.className(cls))));
  def('superclass', classOnly(cls => cls.superclass));
  def('subclasses', classOnly(cls => vm.array([...cls.subclasses].sort((a, b) => vm.className(a).localeCompare(vm.className(b))))));
  def('selectors', classOnly(cls => vm.array([...cls.methods.keys()].sort().map(s => vm.symbol(s)))));
  def('includesSelector', classOnly((cls, [s]) => vm.isSymbol(s) && cls.methods.has(s.s)));
  def('instVarNames', classOnly(cls => vm.array(cls.ivars.map(str))));
  def('allInstVarNames', classOnly(cls => vm.array(vm.allInstVarNames(cls).map(str))));
  def('classVarNames', classOnly(cls => vm.array([...vm.instanceClass(cls).classVars.keys()].sort().map(str))));
  def('isMeta', classOnly(cls => cls.isMeta));
  def('instanceClass', classOnly(cls => vm.instanceClass(cls)));
  def('packageName', classOnly(cls => str(vm.instanceClass(cls).package)));
  def('comment', classOnly(cls => str(vm.instanceClass(cls).comment)));
  def('commentPut', classOnly((cls, [text]) => {
    if (!isStr(text)) return FAIL;
    const owner = vm.instanceClass(cls);
    owner.comment = js(text);
    if (!vm.quiet) vm.hooks.classDefined?.(owner);
    return cls;
  }));
  def('compileClassified', classOnly((cls, [source, protocol]) => {
    if (!isStr(source)) return FAIL;
    const m = vm.installSource(cls, js(source), isStr(protocol) ? js(protocol) : undefined);
    return vm.symbol(m.selector);
  }));
  def('removeSelector', classOnly((cls, [s]) => vm.isSymbol(s) ? vm.removeMethod(cls, s.s) : FAIL));
  def('methodAt', classOnly((cls, [s]) => vm.isSymbol(s) ? cls.methods.get(s.s) ?? null : FAIL));
  def('defineSubclass', (r, [name, shape, ivars, classVars, pkg]) => {
    if (r !== null && !(r instanceof STClass && !r.isMeta)) return FAIL;
    if (!vm.isSymbol(name) && !isStr(name)) return FAIL;
    const words = o => o === null ? [] : isStr(o) ? js(o).split(/\s+/).filter(Boolean) : null;
    const iv = words(ivars), cv = words(classVars);
    if (iv === null || cv === null) return FAIL;
    const format = vm.isSymbol(shape) && ['fixed', 'variable', 'bytes'].includes(shape.s) ? (shape.s === 'fixed' ? null : shape.s) : null;
    return vm.defineClass({ name: js(name), superclass: r, ivars: iv, classVars: cv, pkg: isStr(pkg) ? js(pkg) : '', format });
  });
  def('methodSelector', r => r instanceof Method ? vm.symbol(r.selector) : FAIL);
  def('methodSource', r => r instanceof Method ? str(r.source) : FAIL);
  def('methodClass', r => r instanceof Method ? r.methodClass : FAIL);
  def('methodProtocol', r => r instanceof Method ? str(r.protocol ?? '') : FAIL);
  def('methodNumArgs', r => r instanceof Method ? r.numArgs : FAIL);

  // ---- Numbers --------------------------------------------------------------------
  // Integers stay exact: a result outside the safe range becomes a BigInt, and a BigInt
  // inside it becomes a number again. Any Float makes the result a Float. Anything else fails
  // and the Smalltalk code coerces it.
  const arith = (intOp, bigOp, floatOp) => (r, [a]) => {
    const kr = kind(r), ka = kind(a);
    if (!kr || !ka) return FAIL;
    if (kr === 'f' || ka === 'f') return floatOp ? new F(floatOp(num(r), num(a))) : FAIL;
    if (kr === 'i' && ka === 'i' && intOp) {
      const v = intOp(r, a);
      if (SAFE(v)) return v;
    }
    return vm.int(bigOp(big(r), big(a)));
  };
  def('add', arith((a, b) => a + b, (a, b) => a + b, (a, b) => a + b));
  def('sub', arith((a, b) => a - b, (a, b) => a - b, (a, b) => a - b));
  def('mul', arith((a, b) => a * b, (a, b) => a * b, (a, b) => a * b));
  def('div', (r, [a]) => {
    const kr = kind(r), ka = kind(a);
    if (!kr || !ka) return FAIL;
    if (kr === 'f' || ka === 'f') { if (num(a) === 0) return FAIL; return new F(num(r) / num(a)); }
    const x = big(r), y = big(a);
    if (y === 0n || x % y !== 0n) return FAIL;
    return vm.int(x / y);
  });
  const intOnly = (fn) => (r, [a]) => {
    const kr = kind(r), ka = kind(a);
    if (!kr || !ka) return FAIL;
    if (kr === 'f' || ka === 'f') {
      const x = num(r), y = num(a);
      if (y === 0) return FAIL;
      return fn.float ? fn.float(x, y) : FAIL;
    }
    const y = big(a);
    if (y === 0n) return FAIL;
    return vm.int(fn(big(r), y));
  };
  const floorDivision = (x, y) => floorDiv(x, y);
  floorDivision.float = (x, y) => vm.int(BigInt(Math.floor(x / y)));
  def('intDiv', intOnly(floorDivision));
  const floorMod = (x, y) => x - floorDiv(x, y) * y;
  floorMod.float = (x, y) => new F(x - Math.floor(x / y) * y);
  def('mod', intOnly(floorMod));
  const truncDiv = (x, y) => x / y;
  truncDiv.float = (x, y) => vm.int(BigInt(Math.trunc(x / y)));
  def('quo', intOnly(truncDiv));
  const truncRem = (x, y) => x % y;
  truncRem.float = (x, y) => new F(x % y);
  def('rem', intOnly(truncRem));
  const compare = test => (r, [a]) => {
    const kr = kind(r), ka = kind(a);
    if (!kr || !ka) return FAIL;
    if (kr === 'f' || ka === 'f') return test(num(r), num(a));
    if (kr === 'i' && ka === 'i') return test(r, a);
    return test(big(r), big(a));
  };
  def('lt', compare((a, b) => a < b));
  def('gt', compare((a, b) => a > b));
  def('le', compare((a, b) => a <= b));
  def('ge', compare((a, b) => a >= b));
  def('eq', compare((a, b) => a === b || a == b));
  def('ne', compare((a, b) => !(a === b || a == b)));
  const bits = fn => (r, [a]) => isInt(r) && isInt(a) ? vm.int(fn(big(r), big(a))) : FAIL;
  def('bitAnd', bits((a, b) => a & b));
  def('bitOr', bits((a, b) => a | b));
  def('bitXor', bits((a, b) => a ^ b));
  def('bitShift', (r, [n]) => {
    if (!isInt(r) || typeof n !== 'number' || Math.abs(n) > 1e6) return FAIL;
    return vm.int(n >= 0 ? big(r) << BigInt(n) : big(r) >> BigInt(-n));
  });
  def('gcd', (r, [a]) => {
    if (!isInt(r) || !isInt(a)) return FAIL;
    let x = big(r) < 0n ? -big(r) : big(r), y = big(a) < 0n ? -big(a) : big(a);
    while (y !== 0n) [x, y] = [y, x % y];
    return vm.int(x);
  });
  def('printBase', (r, [base]) => {
    if (!isInt(r) || typeof base !== 'number' || base < 2 || base > 36) return FAIL;
    return str(r.toString(base).toUpperCase());
  });
  def('numberHash', r => {
    if (isInt(r)) return vm.identityHash(r);
    if (r instanceof F) {
      if (Number.isInteger(r.v) && SAFE(r.v)) return r.v;
      return stringHash(String(r.v));
    }
    return FAIL;
  });
  def('asFloat', r => isInt(r) ? new F(Number(r)) : r instanceof F ? r : FAIL);
  const toInt = fn => r => {
    if (isInt(r)) return r;
    if (!(r instanceof F) || !Number.isFinite(r.v)) return FAIL;
    return vm.int(BigInt(fn(r.v)));
  };
  def('truncated', toInt(Math.trunc));
  def('floor', toInt(Math.floor));
  def('ceiling', toInt(Math.ceil));
  def('rounded', toInt(v => Math.sign(v) * Math.floor(Math.abs(v) + 0.5)));
  const math = fn => r => (kind(r) ? new F(fn(num(r))) : FAIL);
  def('sqrt', r => (kind(r) && num(r) >= 0) ? new F(Math.sqrt(num(r))) : FAIL);
  def('sin', math(Math.sin));
  def('cos', math(Math.cos));
  def('tan', math(Math.tan));
  def('arcTan', math(Math.atan));
  def('arcSin', math(Math.asin));
  def('arcCos', math(Math.acos));
  def('ln', r => (kind(r) && num(r) > 0) ? new F(Math.log(num(r))) : FAIL);
  def('log10', r => (kind(r) && num(r) > 0) ? new F(Math.log10(num(r))) : FAIL);
  def('exp', math(Math.exp));
  def('floatPower', (r, [a]) => (kind(r) && kind(a)) ? new F(Math.pow(num(r), num(a))) : FAIL);
  def('fractionPart', r => r instanceof F ? new F(r.v - Math.trunc(r.v)) : FAIL);
  def('isNaN', r => r instanceof F && Number.isNaN(r.v));
  def('isInfinite', r => r instanceof F && (r.v === Infinity || r.v === -Infinity));
  def('floatPrint', r => r instanceof F ? str(formatFloat(r.v)) : FAIL);
  def('floatConstant', (r, [name]) => {
    const values = { pi: Math.PI, e: Math.E, infinity: Infinity, negativeInfinity: -Infinity, nan: NaN, epsilon: Number.EPSILON };
    return vm.isSymbol(name) && name.s in values ? new F(values[name.s]) : FAIL;
  });
  def('asCharacter', r => (typeof r === 'number' && r >= 0 && r <= 0x10ffff) ? vm.ch(r) : FAIL);

  // ---- Characters -----------------------------------------------------------------
  def('charValue', r => r instanceof Ch ? r.code : FAIL);
  def('charFromValue', (r, [n]) => (typeof n === 'number' && n >= 0 && n <= 0x10ffff) ? vm.ch(n) : FAIL);
  const tests = {
    letter: /\p{L}/u, digit: /\p{Nd}/u, vowel: /[aeiouAEIOU]/, uppercase: /\p{Lu}/u, lowercase: /\p{Ll}/u,
    separator: /\s/u, alphanumeric: /[\p{L}\p{Nd}]/u, punctuation: /\p{P}/u,
  };
  def('charTest', (r, [test]) => {
    if (!(r instanceof Ch) || !vm.isSymbol(test) || !tests[test.s]) return FAIL;
    return tests[test.s].test(String.fromCodePoint(r.code));
  });
  def('charUpper', r => r instanceof Ch ? vm.ch(String.fromCodePoint(r.code).toUpperCase().codePointAt(0)) : FAIL);
  def('charLower', r => r instanceof Ch ? vm.ch(String.fromCodePoint(r.code).toLowerCase().codePointAt(0)) : FAIL);

  // ---- Strings and symbols ----------------------------------------------------------
  const strOnly = fn => (r, args) => isStr(r) ? fn(js(r), args, r) : FAIL;
  def('strEq', strOnly((t, [a]) => isStr(a) ? t === js(a) : false));
  def('strCompare', strOnly((t, [a]) => isStr(a) ? (t < js(a) ? -1 : t > js(a) ? 1 : 0) : FAIL));
  def('strHash', strOnly(t => stringHash(t)));
  def('strConcat', strOnly((t, [a]) => isStr(a) ? str(t + js(a)) : FAIL));
  def('strAsSymbol', strOnly(t => vm.symbol(t)));
  def('strAsString', strOnly(t => str(t)));
  def('strUpper', strOnly((t, args, r) => r.s !== undefined ? vm.symbol(t.toUpperCase()) : str(t.toUpperCase())));
  def('strLower', strOnly((t, args, r) => r.s !== undefined ? vm.symbol(t.toLowerCase()) : str(t.toLowerCase())));
  def('strTrim', strOnly(t => str(t.trim())));
  def('strReversed', strOnly(t => str(Array.from(t).reverse().join(''))));
  def('strIndexOfSub', strOnly((t, [sub, start]) => {
    if (!isStr(sub) || typeof start !== 'number') return FAIL;
    const chars = Array.from(t), needle = Array.from(js(sub));
    outer: for (let i = Math.max(0, start - 1); i + needle.length <= chars.length; i++) {
      for (let j = 0; j < needle.length; j++) if (chars[i + j] !== needle[j]) continue outer;
      return i + 1;
    }
    return 0;
  }));
  def('strReplaceAll', strOnly((t, [a, b]) => (isStr(a) && isStr(b) && js(a)) ? str(t.split(js(a)).join(js(b))) : FAIL));
  def('strSubstrings', strOnly((t, [seps]) => {
    let parts;
    if (seps === null || seps === undefined) parts = t.split(/\s+/);
    else if (isStr(seps)) {
      const set = new Set(Array.from(js(seps)));
      parts = [];
      let current = '';
      for (const c of Array.from(t)) { if (set.has(c)) { parts.push(current); current = ''; } else current += c; }
      parts.push(current);
    } else return FAIL;
    return vm.array(parts.filter(Boolean).map(str));
  }));
  def('strLines', strOnly(t => vm.array(t.split(/\r\n|\r|\n/).map(str))));
  def('strBeginsWith', strOnly((t, [a]) => isStr(a) ? t.startsWith(js(a)) : FAIL));
  def('strEndsWith', strOnly((t, [a]) => isStr(a) ? t.endsWith(js(a)) : FAIL));
  def('strAsNumber', strOnly(t => {
    try {
      const tokens = tokenize(t.trim());
      let negative = false, at = 0;
      if (tokens[0].type === 'binary' && tokens[0].value === '-') { negative = true; at = 1; }
      if (tokens[at].type !== 'number' || tokens[at + 1].type !== 'eof') return null;
      const value = tokens[at].value;
      if (value.kind === 'integer') return vm.int(negative ? -value.value : value.value);
      return new F(negative ? -value.value : value.value);
    } catch { return null; }
  }));
  def('symbolNumArgs', r => vm.isSymbol(r) ? numArgsOf(r.s) : FAIL);
  def('replaceFromToWithStartingAt', (r, [start, stop, source, from]) => {
    if (!(r && r.idx) || r.s !== undefined || !(source && source.idx)) return FAIL;
    if (![start, stop, from].every(n => typeof n === 'number')) return FAIL;
    const count = stop - start + 1;
    if (count < 0 || start < 1 || stop > r.idx.length || from < 1 || from + count - 1 > source.idx.length) return FAIL;
    const format = r.cls.format;
    const items = source.idx.slice(from - 1, from - 1 + count);
    if (format === 'chars' && !items.every(v => v instanceof Ch)) return FAIL;
    if (format === 'bytes' && !items.every(v => typeof v === 'number' && v >= 0 && v <= 255)) return FAIL;
    for (let i = 0; i < count; i++) r.idx[start - 1 + i] = items[i];
    return r;
  });

  // ---- Blocks ---------------------------------------------------------------------
  def('blockValue', (r, args, ctx) => {
    if (!(r instanceof Closure) || r.block.numArgs !== args.length) return FAIL;
    vm.activateBlock(r, args, ctx);
    return SWITCHED;
  });
  def('blockValueWithArgs', (r, [array], ctx) => {
    if (!(r instanceof Closure) || !(array instanceof STObject) || array.cls !== C.Array || r.block.numArgs !== array.idx.length) return FAIL;
    vm.activateBlock(r, array.idx, ctx);
    return SWITCHED;
  });
  def('blockNumArgs', r => r instanceof Closure ? r.block.numArgs : FAIL);

  // ---- The system -----------------------------------------------------------------
  def('transcriptShow', (r, [text]) => {
    if (!isStr(text)) return FAIL;
    vm.hooks.transcript?.(js(text));
    return r;
  });
  const key = k => vm.isSymbol(k) ? k.s : isStr(k) ? js(k) : null;
  def('globalAt', (r, [k]) => {
    const name = key(k);
    const b = name && vm.globals.get(name);
    return b && !b.undeclared ? b.f[1] : FAIL;
  });
  def('globalAtPut', (r, [k, v]) => {
    const name = key(k);
    if (!name || !/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) return FAIL;
    return vm.setGlobal(name, v);
  });
  def('globalIncludes', (r, [k]) => { const b = vm.globals.get(key(k) ?? ''); return !!b && !b.undeclared; });
  def('globalKeys', () => vm.array([...vm.globals.entries()].filter(([, b]) => !b.undeclared).map(([k]) => k).sort().map(k => vm.symbol(k))));
  def('allClasses', () => vm.array([...vm.globals.values()].map(b => b.f[1]).filter(v => v instanceof STClass && !v.isMeta)
    .sort((a, b) => a.name.localeCompare(b.name))));
  def('millis', () => Math.floor(performance.now()));
  def('random', () => new F(Math.random()));

  return P;
}

export function numArgsOf(selector) {
  if (/^[A-Za-z_]/.test(selector)) return (selector.match(/:/g) ?? []).length;
  return 1;
}
