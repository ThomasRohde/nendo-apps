// Slip's virtual machine: the object memory, the classes, and a bytecode interpreter whose
// contexts are real objects, so thisContext, non-local return and (later) the debugger work.
// It never touches the page or Nendo: the view and the tests drive it through image.mjs.
import { OP, compile, CompileError } from './compiler.mjs';
import { installPrimitives, FAIL, SWITCHED } from './primitives.mjs';

// ---- Values ---------------------------------------------------------------------------
// nil, true and false are JavaScript's null, true and false. A SmallInteger is a JavaScript
// number that is a safe integer; a LargeInteger is a BigInt. Everything else is an object
// with a `cls`: a Float, a Character, or an STObject with fixed fields `f` and, when its class
// is indexable, indexed fields `idx`.

export class F { constructor(v) { this.v = v; } }
export class Ch { constructor(code) { this.code = code; } }
export class STObject {
  constructor(cls, fixed, indexed) {
    this.cls = cls;
    this.f = fixed > 0 ? new Array(fixed).fill(null) : [];
    if (indexed !== undefined) this.idx = indexed;
  }
}

export class STClass {
  constructor(name, superclass, meta) {
    this.cls = meta;              // the metaclass, or Metaclass for a metaclass
    this.name = name;
    this.superclass = superclass;
    this.methods = new Map();
    this.ivars = [];              // its own instance variable names
    this.format = 'fixed';
    this.classVars = new Map();   // name -> association
    this.package = '';
    this.comment = '';
    this.isMeta = false;
    this.thisClass = null;        // for a metaclass, its class
    this.subclasses = new Set();
    this.cache = new Map();
    this.cacheEpoch = -1;
  }
}

export class Method {
  constructor(cls) { this.cls = cls; }
}

export class Closure {
  constructor(cls, block, outer, receiver) { this.cls = cls; this.block = block; this.outer = outer; this.receiver = receiver; }
}

export class Context {
  constructor(cls, method, receiver, sender, outer, closure) {
    this.cls = cls;
    this.method = method;       // a Method, or a block for a block context
    this.receiver = receiver;
    this.temps = method.numTemps ? new Array(method.numTemps).fill(null) : [];
    this.stack = [];
    this.pc = 0;
    this.sender = sender;
    this.outer = outer;
    this.home = outer ? outer.home : this;
    this.closure = closure;
    this.dead = false;
    this.depth = sender ? sender.depth + 1 : 0;
  }
}

/** A Smalltalk error that no handler took. It ends the evaluation that raised it. */
export class SmalltalkError extends Error {
  constructor(message, details = {}) { super(message); this.name = 'SmalltalkError'; Object.assign(this, details); }
}

export const MAX_DEPTH = 20000;

// An opcode the compiler never emits: the end of the context a VM error is signalled from. A
// handler that returns or retries never reaches it; resuming past such an error does.
const TRAP = 99;
// The VM's own failures that stay JavaScript errors: no Smalltalk code can handle them.
const fatal = error => !(error instanceof SmalltalkError) || error.fatal || error.interrupted;

const NAMES = {
  // The kernel's classes: name, superclass, instance variables, format.
  // Behavior and its subclasses are created first, by hand, in boot().
  list: [
    ['UndefinedObject', 'Object', '', 'immediate'],
    ['Boolean', 'Object', '', 'immediate'],
    ['True', 'Boolean', '', 'immediate'],
    ['False', 'Boolean', '', 'immediate'],
    ['Magnitude', 'Object', '', 'fixed'],
    ['Character', 'Magnitude', '', 'immediate'],
    ['Number', 'Magnitude', '', 'fixed'],
    ['Integer', 'Number', '', 'fixed'],
    ['SmallInteger', 'Integer', '', 'immediate'],
    ['LargePositiveInteger', 'Integer', '', 'special'],
    ['LargeNegativeInteger', 'LargePositiveInteger', '', 'special'],
    ['Float', 'Number', '', 'special'],
    ['Fraction', 'Number', 'numerator denominator', 'fixed'],
    ['Association', 'Magnitude', 'key value', 'fixed'],
    ['Message', 'Object', 'selector arguments', 'fixed'],
    ['Collection', 'Object', '', 'fixed'],
    ['SequenceableCollection', 'Collection', '', 'fixed'],
    ['ArrayedCollection', 'SequenceableCollection', '', 'fixed'],
    ['Array', 'ArrayedCollection', '', 'variable'],
    ['String', 'ArrayedCollection', '', 'chars'],
    ['Symbol', 'String', '', 'chars'],
    ['ByteArray', 'ArrayedCollection', '', 'bytes'],
    ['OrderedCollection', 'SequenceableCollection', 'array firstIndex lastIndex', 'fixed'],
    ['SortedCollection', 'OrderedCollection', 'sortBlock', 'fixed'],
    ['Interval', 'SequenceableCollection', 'start stop step', 'fixed'],
    ['HashedCollection', 'Collection', 'tally array', 'fixed'],
    ['Set', 'HashedCollection', '', 'fixed'],
    ['Dictionary', 'HashedCollection', '', 'fixed'],
    ['Stream', 'Object', '', 'fixed'],
    ['PositionableStream', 'Stream', 'collection position readLimit', 'fixed'],
    ['ReadStream', 'PositionableStream', '', 'fixed'],
    ['WriteStream', 'PositionableStream', 'writeLimit', 'fixed'],
    ['TranscriptStream', 'Object', '', 'fixed'],
    ['BlockClosure', 'Object', '', 'special'],
    ['CompiledMethod', 'Object', '', 'special'],
    ['Context', 'Object', '', 'special'],
    ['Exception', 'Object', 'messageText signalContext handlerContext outerContext', 'fixed'],
    ['Error', 'Exception', '', 'fixed'],
    ['ZeroDivide', 'Error', '', 'fixed'],
    ['MessageNotUnderstood', 'Error', 'message receiver', 'fixed'],
    ['SubscriptOutOfBounds', 'Error', '', 'fixed'],
    ['NotFound', 'Error', '', 'fixed'],
    ['Notification', 'Exception', '', 'fixed'],
    ['Warning', 'Exception', '', 'fixed'],
    ['Halt', 'Exception', '', 'fixed'],
    ['ExceptionSet', 'Object', 'exceptions', 'fixed'],
    ['Nendo', 'Object', '', 'fixed'],
    ['NendoRecord', 'Object', 'entityId recordId version values', 'fixed'],
    ['Slip', 'Object', '', 'fixed'],
    ['SystemDictionary', 'Object', '', 'fixed'],
    ['Random', 'Object', '', 'fixed'],
    ['Time', 'Object', '', 'fixed'],
  ],
};

export class VM {
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.globals = new Map();        // name -> association
    this.symbols = new Map();
    this.chars = new Map();
    this.epoch = 0;
    this.nextHash = 1;
    this.processes = [];
    this.quiet = 0;                  // while > 0, compiles and definitions call no hooks
    this.boot();
    this.primitives = installPrimitives(this);
  }

  // ---- Boot -------------------------------------------------------------------------

  boot() {
    const make = (name, superclass) => {
      const cls = new STClass(name, superclass, null);
      if (superclass) superclass.subclasses.add(cls);
      return cls;
    };
    const Object_ = make('Object', null);
    const Behavior = make('Behavior', Object_);
    const ClassDescription = make('ClassDescription', Behavior);
    const Class = make('Class', ClassDescription);
    const Metaclass = make('Metaclass', ClassDescription);
    this.classes = { Object: Object_, Behavior, ClassDescription, Class, Metaclass };
    for (const cls of [Object_, Behavior, ClassDescription, Class, Metaclass]) cls.format = 'special';
    Object_.format = 'fixed';
    for (const cls of Object.values(this.classes)) this.attachMeta(cls);
    for (const [name, superName, ivars, format] of NAMES.list) {
      const cls = make(name, this.classes[superName]);
      cls.ivars = ivars ? ivars.split(' ') : [];
      cls.format = format;
      this.attachMeta(cls);
      this.classes[name] = cls;
    }
    for (const cls of Object.values(this.classes)) { cls.package = 'Kernel'; this.globalBinding(cls.name, true).f[1] = cls; }
    this.nil = null;
    this.globalBinding('Smalltalk', true).f[1] = new STObject(this.classes.SystemDictionary, 0);
    this.globalBinding('Transcript', true).f[1] = new STObject(this.classes.TranscriptStream, 0);
  }

  attachMeta(cls) {
    const meta = new STClass(null, cls.superclass ? cls.superclass.cls : this.classes.Class, this.classes.Metaclass);
    meta.isMeta = true;
    meta.thisClass = cls;
    meta.format = 'special';
    if (meta.superclass) meta.superclass.subclasses.add(meta);
    cls.cls = meta;
  }

  // ---- Objects ----------------------------------------------------------------------

  classOf(x) {
    if (x === null || x === undefined) return this.classes.UndefinedObject;
    if (x === true) return this.classes.True;
    if (x === false) return this.classes.False;
    switch (typeof x) {
      case 'number': return this.classes.SmallInteger;
      case 'bigint': return x < 0n ? this.classes.LargeNegativeInteger : this.classes.LargePositiveInteger;
      default:
        if (x instanceof F) return this.classes.Float;
        if (x instanceof Ch) return this.classes.Character;
        return x.cls;
    }
  }

  ch(code) {
    let c = this.chars.get(code);
    if (!c) { c = new Ch(code); this.chars.set(code, c); }
    return c;
  }

  str(text) { return new STObject(this.classes.String, 0, Array.from(String(text), c => this.ch(c.codePointAt(0)))); }

  symbol(name) {
    let s = this.symbols.get(name);
    if (!s) {
      s = new STObject(this.classes.Symbol, 0, Array.from(name, c => this.ch(c.codePointAt(0))));
      s.s = name;
      this.symbols.set(name, s);
    }
    return s;
  }

  /** The JavaScript text of a String or Symbol. */
  js(o) {
    if (o && o.s !== undefined) return o.s;
    if (o && o.idx && (o.cls === this.classes.String || this.inherits(o.cls, this.classes.String))) return o.idx.map(c => String.fromCodePoint(c.code)).join('');
    throw new SmalltalkError('Expected a String.');
  }

  isString(o) { return !!(o && o.idx && this.inherits(this.classOf(o), this.classes.String)); }
  isSymbol(o) { return !!(o && o.s !== undefined); }

  array(items) { return new STObject(this.classes.Array, 0, items); }

  newAssociation(key, value) {
    const a = new STObject(this.classes.Association, 2);
    a.f[0] = typeof key === 'string' ? this.symbol(key) : key;
    a.f[1] = value;
    return a;
  }

  identityHash(o) {
    if (o === null || o === undefined) return 0;
    if (o === true) return 1;
    if (o === false) return 2;
    if (typeof o === 'number') return o;
    if (typeof o === 'bigint') return Number(o % 1000000007n);
    if (o instanceof Ch) return o.code;
    if (o.h === undefined) o.h = this.nextHash++ & 0x3fffffff;
    return o.h;
  }

  /** Normalises an integer result: a BigInt in the safe range becomes a number. */
  int(b) {
    if (typeof b === 'number') return b;
    return b >= -9007199254740991n && b <= 9007199254740991n ? Number(b) : b;
  }

  literal(lit) {
    switch (lit.kind) {
      case 'nil': return null;
      case 'true': return true;
      case 'false': return false;
      case 'integer': return this.int(lit.value);
      case 'float': return new F(lit.value);
      case 'string': return this.str(lit.value);
      case 'symbol': return this.symbol(lit.value);
      case 'char': return this.ch(lit.value);
      case 'array': return this.array(lit.items.map(item => this.literal(item)));
      case 'bytes': return new STObject(this.classes.ByteArray, 0, lit.bytes.slice());
      default: throw new Error(`Unknown literal ${lit.kind}`);
    }
  }

  // ---- Classes ----------------------------------------------------------------------

  inherits(cls, ancestor) {
    for (let c = cls; c; c = c.superclass) if (c === ancestor) return true;
    return false;
  }

  allInstVarNames(cls) {
    const chain = [];
    for (let c = cls; c; c = c.superclass) chain.unshift(c);
    return chain.flatMap(c => c.ivars);
  }

  instanceClass(cls) { return cls.isMeta ? cls.thisClass : cls; }

  className(cls) { return cls.isMeta ? `${cls.thisClass.name} class` : cls.name; }

  classVariableBinding(cls, name) {
    for (let c = this.instanceClass(cls); c; c = c.superclass) {
      const b = c.classVars.get(name);
      if (b) return b;
    }
    return null;
  }

  globalBinding(name, create = false) {
    let b = this.globals.get(name);
    if (!b && create) { b = this.newAssociation(name, null); this.globals.set(name, b); }
    if (b && b.undeclared && !create) return null;
    return b ?? null;
  }

  // A capitalised name a method uses before it is defined: bound now, filled in when defined.
  undeclaredBinding(name) {
    let b = this.globals.get(name);
    if (!b) { b = this.newAssociation(name, null); b.undeclared = true; this.globals.set(name, b); }
    return b;
  }

  setGlobal(name, value) {
    const b = this.globals.get(name) ?? this.globalBinding(name, true);
    b.f[1] = value;
    delete b.undeclared;
    return value;
  }

  /** Defines a class, or changes one. Answers the class. */
  defineClass({ name, superclass, ivars = [], classVars = [], pkg = '', format = null }) {
    if (!/^[A-Z][A-Za-z0-9_]*$/.test(name)) throw new SmalltalkError(`${name} is not a valid class name.`);
    const existingBinding = this.globals.get(name);
    let cls = existingBinding && existingBinding.f[1] instanceof STClass && !existingBinding.f[1].isMeta ? existingBinding.f[1] : null;
    if (cls && cls.package === 'Kernel' && this.classes[name] === cls && (cls.superclass !== superclass || cls.format !== (format ?? cls.format))) {
      throw new SmalltalkError(`${name} is a kernel class; its superclass and shape cannot change.`);
    }
    const inheritedFormat = superclass ? (['variable', 'chars', 'bytes'].includes(superclass.format) ? superclass.format : 'fixed') : 'fixed';
    const fmt = format ?? inheritedFormat;
    const inherited = superclass ? this.allInstVarNames(superclass) : [];
    for (const v of ivars) {
      if (!/^[a-z_][A-Za-z0-9_]*$/.test(v)) throw new SmalltalkError(`${v} is not a valid instance variable name.`);
      if (inherited.includes(v)) throw new SmalltalkError(`${v} is already an instance variable of ${superclass.name}.`);
    }
    let reshaped = false;
    if (!cls) {
      cls = new STClass(name, superclass, null);
      if (superclass) superclass.subclasses.add(cls);
      this.attachMeta(cls);
    } else {
      reshaped = cls.superclass !== superclass || cls.ivars.join(' ') !== ivars.join(' ');
      if (cls.superclass !== superclass) {
        cls.superclass?.subclasses.delete(cls);
        cls.cls.superclass?.subclasses.delete(cls.cls);
        cls.superclass = superclass;
        superclass?.subclasses.add(cls);
        cls.cls.superclass = superclass ? superclass.cls : this.classes.Class;
        cls.cls.superclass.subclasses.add(cls.cls);
      }
    }
    cls.ivars = ivars;
    cls.format = cls.format === 'special' || cls.format === 'immediate' ? cls.format : fmt;
    cls.package = pkg || cls.package;
    for (const v of classVars) {
      if (!/^[A-Z][A-Za-z0-9_]*$/.test(v)) throw new SmalltalkError(`${v} is not a valid class variable name; it must begin with a capital letter.`);
      if (!cls.classVars.has(v)) cls.classVars.set(v, this.newAssociation(v, null));
    }
    for (const v of [...cls.classVars.keys()]) if (!classVars.includes(v)) cls.classVars.delete(v);
    this.setGlobal(name, cls);
    this.epoch++;
    if (reshaped) this.recompileAll(cls);
    if (!this.quiet) this.hooks.classDefined?.(cls);
    return cls;
  }

  // Instance variable indices moved: compile every method of the class and its subclasses again.
  recompileAll(cls) {
    const each = c => {
      for (const side of [c, c.cls]) for (const m of [...side.methods.values()]) {
        try { this.installSource(side, m.source, m.protocol, { quiet: true }); }
        catch (error) { this.hooks.transcript?.(`${this.className(side)}>>${m.selector} no longer compiles: ${error.message}\n`); }
      }
      for (const sub of c.subclasses) each(sub);
    };
    each(cls);
  }

  // ---- Methods ----------------------------------------------------------------------

  compileMethod(cls, source) {
    try { return compile(this, source, cls); }
    catch (error) {
      if (error instanceof CompileError) throw new SmalltalkError(`${this.className(cls)}: ${error.message}`, { position: error.position, compileError: true });
      throw error;
    }
  }

  install(cls, desc, protocol = 'as yet unclassified') {
    const m = new Method(this.classes.CompiledMethod);
    Object.assign(m, desc);
    m.methodClass = cls;
    m.protocol = protocol;
    m.primitiveFn = desc.primitive ? this.primitives.get(desc.primitive) ?? null : null;
    if (desc.primitive && !m.primitiveFn) throw new SmalltalkError(`There is no primitive named ${desc.primitive}.`);
    const own = (b) => { b.method = m; b.blocks.forEach(own); };
    m.blocks.forEach(own);
    cls.methods.set(m.selector, m);
    this.epoch++;
    return m;
  }

  /** Compiles and installs method source. Answers the method. */
  installSource(cls, source, protocol, { quiet = false } = {}) {
    const m = this.install(cls, this.compileMethod(cls, source), protocol ?? cls.methods.get(this.selectorOf(source))?.protocol);
    if (!quiet && !this.quiet) this.hooks.methodCompiled?.(cls, m);
    return m;
  }

  selectorOf(source) {
    try { return compile(this, source, null, {}).selector; } catch { return null; }
  }

  removeMethod(cls, selector) {
    const had = cls.methods.delete(selector);
    if (had) { this.epoch++; if (!this.quiet) this.hooks.methodRemoved?.(cls, selector); }
    return had;
  }

  lookup(cls, selector) {
    if (cls.cacheEpoch !== this.epoch) { cls.cache.clear(); cls.cacheEpoch = this.epoch; }
    let m = cls.cache.get(selector);
    if (m !== undefined) return m;
    m = null;
    for (let c = cls; c; c = c.superclass) {
      const found = c.methods.get(selector);
      if (found) { m = found; break; }
    }
    cls.cache.set(selector, m);
    return m;
  }

  // ---- Processes --------------------------------------------------------------------

  /** Compiles a doit. Answers a context ready to run, whose receiver is nil. */
  doitContext(source, bindings, receiver = null) {
    let desc;
    try { desc = compile(this, source, this.classOf(receiver), { doit: true, bindings, autoBind: true }); }
    catch (error) {
      if (error instanceof CompileError) throw new SmalltalkError(error.message, { position: error.position, compileError: true });
      throw error;
    }
    const m = new Method(this.classes.CompiledMethod);
    Object.assign(m, desc);
    m.methodClass = this.classOf(receiver);
    m.protocol = 'doits';
    const own = (b) => { b.method = m; b.blocks.forEach(own); };
    m.blocks.forEach(own);
    return new Context(this.classes.Context, m, receiver, null, null, null);
  }

  /** A context that sends selector to receiver with args, as the root of a process. */
  sendContext(receiver, selector, args = []) {
    const desc = { selector: 'DoIt', numArgs: 0, numTemps: 0, code: [OP.LIT, receiver, ...args.flatMap(a => [OP.LIT, a]), OP.SEND, selector, args.length, OP.RETURN],
      positions: [], blocks: [], primitive: null, source: '' };
    const m = new Method(this.classes.CompiledMethod);
    Object.assign(m, desc);
    m.methodClass = this.classes.UndefinedObject;
    return new Context(this.classes.Context, m, null, null, null, null);
  }

  newProcess(context) {
    return { ctx: context, done: false, value: undefined, error: null, interrupted: false, suspended: null, watch: null, started: Date.now() };
  }

  /**
   * Runs a process until it ends, stops for the debugger, or spends its time budget. Answers
   * true when it ended or stopped (proc.done or proc.suspended), false when the budget ran out.
   * The interpreter: one switch over the opcodes. A send that runs Smalltalk code makes a new
   * context the active one; a primitive answers at once. An error the VM raises is signalled
   * as a Smalltalk Error from the context it happened in, so a handler can take it.
   */
  run(proc, budgetMs = Infinity) {
    const deadline = budgetMs === Infinity ? Infinity : performance.now() + budgetMs;
    let ctx = proc.ctx;
    let count = 0;
    const watch = proc.watch;
    let skip = watch?.skipFirst ?? false;
    this.active = proc;
    this.interrupt = null;
    try {
      while (true) {
        try {
          while (true) {
            if (proc.interrupted) { proc.interrupted = false; return this.suspend(proc, ctx, { kind: 'interrupt' }); }
            if ((++count & 1023) === 0 && performance.now() > deadline) { proc.ctx = ctx; return false; }
            const code = ctx.method.code;
            const op = code[ctx.pc++];
            switch (op) {
              case OP.SELF: ctx.stack.push(ctx.receiver); break;
              case OP.LIT: ctx.stack.push(code[ctx.pc++]); break;
              case OP.NIL: ctx.stack.push(null); break;
              case OP.TRUE: ctx.stack.push(true); break;
              case OP.FALSE: ctx.stack.push(false); break;
              case OP.TEMP: {
                let c = ctx;
                for (let d = code[ctx.pc++]; d > 0; d--) c = c.outer;
                ctx.stack.push(c.temps[code[ctx.pc++]]);
                break;
              }
              case OP.STORE_TEMP: {
                let c = ctx;
                for (let d = code[ctx.pc++]; d > 0; d--) c = c.outer;
                c.temps[code[ctx.pc++]] = ctx.stack[ctx.stack.length - 1];
                break;
              }
              case OP.IVAR: ctx.stack.push(ctx.receiver.f[code[ctx.pc++]]); break;
              case OP.STORE_IVAR: ctx.receiver.f[code[ctx.pc++]] = ctx.stack[ctx.stack.length - 1]; break;
              case OP.GLOBAL: {
                const b = code[ctx.pc++];
                if (b.undeclared && !(b.f[1])) throw new SmalltalkError(`${b.f[0].s} is not defined.`);
                ctx.stack.push(b.f[1]);
                break;
              }
              case OP.STORE_GLOBAL: code[ctx.pc++].f[1] = ctx.stack[ctx.stack.length - 1]; break;
              case OP.POP: ctx.stack.pop(); break;
              case OP.DUP: ctx.stack.push(ctx.stack[ctx.stack.length - 1]); break;
              case OP.ARRAY: {
                const n = code[ctx.pc++];
                ctx.stack.push(this.array(ctx.stack.splice(ctx.stack.length - n, n)));
                break;
              }
              case OP.BLOCK: ctx.stack.push(new Closure(this.classes.BlockClosure, code[ctx.pc++], ctx, ctx.receiver)); break;
              case OP.THIS_CONTEXT: ctx.stack.push(ctx); break;
              case OP.JUMP: ctx.pc = code[ctx.pc]; break;
              case OP.JUMP_FALSE: case OP.JUMP_TRUE: {
                const v = ctx.stack.pop();
                const target = code[ctx.pc++];
                if (v !== true && v !== false) throw new SmalltalkError(`${this.describe(v)} is not a Boolean, so it cannot choose a branch.`);
                if (v === (op === OP.JUMP_TRUE)) ctx.pc = target;
                break;
              }
              case OP.SEND: case OP.SUPER: {
                // A step in the debugger stops before a send: the one the debugger shows next.
                if (watch !== null) {
                  if (skip) skip = false;
                  else if (watch.test(ctx)) { ctx.pc--; return this.suspend(proc, ctx, { kind: 'step' }); }
                }
                const selector = code[ctx.pc++];
                const argc = code[ctx.pc++];
                this.ctx = ctx;
                this.send(ctx, selector, argc, op === OP.SUPER);
                ctx = this.ctx;
                if (this.interrupt !== null) {
                  const it = this.interrupt;
                  this.interrupt = null;
                  if (it.kind === 'end') { proc.done = true; proc.value = it.value; proc.ctx = null; return true; }
                  return this.suspend(proc, ctx, it);
                }
                break;
              }
              case OP.RETURN: case OP.BLOCK_RETURN: {
                const v = ctx.stack.pop();
                ctx.dead = true;
                const sender = ctx.sender;
                if (!sender) { proc.done = true; proc.value = v; proc.ctx = null; return true; }
                sender.stack.push(v);
                ctx = sender;
                break;
              }
              case OP.NONLOCAL_RETURN: {
                const v = ctx.stack.pop();
                const home = ctx.home;
                if (home.dead) throw new SmalltalkError('A block tried to return from a method that has already returned.');
                // An ensure: or ifCurtailed: on the way runs its block first, in Smalltalk.
                if (this.unwindBetween(ctx, home)) {
                  ctx.stack.push(ctx, v, home);
                  this.ctx = ctx;
                  this.send(ctx, 'nonLocalReturn:to:', 2, false);
                  ctx = this.ctx;
                  break;
                }
                // Every context between here and the home method ends with it.
                for (let c = ctx; c && c !== home; c = c.sender) c.dead = true;
                home.dead = true;
                const sender = home.sender;
                if (!sender) { proc.done = true; proc.value = v; proc.ctx = null; return true; }
                sender.stack.push(v);
                ctx = sender;
                break;
              }
              case TRAP: throw new SmalltalkError(code[ctx.pc], { fatal: true });
              default: throw new Error(`Bad opcode ${op} at ${ctx.pc - 1}`);
            }
          }
        } catch (error) {
          if (fatal(error) || !this.canSignal(ctx)) throw error;
          ctx = this.trapContext(ctx, error.message);
        }
      }
    } catch (error) {
      const failure = error instanceof SmalltalkError ? error : new SmalltalkError(`The VM failed: ${error.message}`, { internal: error });
      failure.trace = this.stackOf(ctx);
      proc.done = true;
      proc.error = failure;
      proc.ctx = null;
      return true;
    } finally {
      this.active = null;
    }
  }

  /**
   * Stops a process: for the debugger ('unhandled', 'interrupt', 'step' or 'debug'), or while it
   * waits for Nendo ('wait', with the promise).
   */
  suspend(proc, ctx, info) {
    proc.ctx = ctx;
    proc.suspended = info;
    proc.watch = null;
    return true;
  }

  // An Error can be signalled once the kernel has Exception>>signal, and while there is room
  // on the stack for the handler search.
  canSignal(ctx) {
    return ctx !== null && ctx.depth < MAX_DEPTH - 200 && this.lookup(this.classes.Error, 'signal') !== null;
  }

  /** A context that signals an Error with the text, above the context the VM failed in. */
  trapContext(ctx, text) {
    const exception = new STObject(this.classes.Error, this.allInstVarNames(this.classes.Error).length);
    exception.f[0] = this.str(text);
    const m = new Method(this.classes.CompiledMethod);
    Object.assign(m, { selector: 'vmError', numArgs: 0, numTemps: 0, positions: [], blocks: [], primitive: null, source: '', trap: true,
      code: [OP.LIT, exception, OP.SEND, 'signal', 0, TRAP, `Slip cannot go on after this error: ${text}`] });
    m.methodClass = this.classes.UndefinedObject;
    return new Context(this.classes.Context, m, null, ctx, null, null);
  }

  isHandler(c) { return !c.closure && c.method.pragmas?.includes('handler') === true; }
  isUnwind(c) { return !c.closure && c.method.pragmas?.includes('unwind') === true; }

  /** Whether an ensure: or ifCurtailed: that has not run its block lies between two contexts. */
  unwindBetween(from, to) {
    for (let c = from.sender; c && c !== to; c = c.sender) if (this.isUnwind(c) && c.temps[1] === null) return true;
    return false;
  }

  /** Whether a context is on the chain of senders from another, itself included. */
  onChain(from, target) {
    for (let c = from; c; c = c.sender) if (c === target) return true;
    return false;
  }

  /** Puts a context back at its start: its arguments kept, its other temps and stack cleared. */
  restartContext(c) {
    c.pc = 0;
    c.stack = [];
    for (let i = c.method.numArgs; i < c.temps.length; i++) c.temps[i] = null;
    c.dead = false;
  }

  send(ctx, selector, argc, isSuper) {
    const stack = ctx.stack;
    const args = argc ? stack.splice(stack.length - argc, argc) : [];
    const receiver = stack.pop();
    let cls;
    if (isSuper) {
      const home = ctx.method.methodClass ? ctx.method : ctx.method.method;
      cls = home.methodClass.superclass;
    } else cls = this.classOf(receiver);
    let method = cls ? this.lookup(cls, selector) : null;
    if (!method) {
      const dnu = this.lookup(this.classOf(receiver), 'doesNotUnderstand:');
      if (!dnu) throw new SmalltalkError(`${this.describe(receiver)} does not understand #${selector}.`);
      const message = new STObject(this.classes.Message, 2);
      message.f[0] = this.symbol(selector);
      message.f[1] = this.array(args);
      this.activate(dnu, receiver, [message], ctx);
      return;
    }
    if (method.primitiveFn) {
      const result = method.primitiveFn(receiver, args, ctx, method);
      if (result !== FAIL) {
        if (result !== SWITCHED) stack.push(result);
        return;
      }
    }
    this.activate(method, receiver, args, ctx);
  }

  activate(method, receiver, args, sender) {
    const c = new Context(this.classes.Context, method, receiver, sender, null, null);
    if (c.depth > MAX_DEPTH) throw new SmalltalkError(`The recursion is too deep (more than ${MAX_DEPTH.toLocaleString('en')} calls).`, { fatal: true });
    for (let i = 0; i < args.length; i++) c.temps[i] = args[i];
    this.ctx = c;
  }

  /** Starts a block's context as the active one, with its arguments. */
  activateBlock(closure, args, sender) {
    const block = closure.block;
    const c = new Context(this.classes.Context, block, closure.receiver, sender, closure.outer, closure);
    if (c.depth > MAX_DEPTH) throw new SmalltalkError(`The recursion is too deep (more than ${MAX_DEPTH.toLocaleString('en')} calls).`, { fatal: true });
    for (let i = 0; i < args.length; i++) c.temps[i] = args[i];
    this.ctx = c;
  }

  /** Sends a message and runs it to its end; with a budget, a run that outlasts it is an error. */
  sendSync(receiver, selector, args = [], budgetMs = Infinity) {
    const proc = this.newProcess(this.sendContext(receiver, selector, args));
    if (!this.run(proc, budgetMs)) throw new SmalltalkError(`#${selector} took longer than ${budgetMs} ms, so it was stopped.`);
    if (proc.suspended) this.endAsError(proc);
    if (proc.error) throw proc.error;
    return proc.value;
  }

  // ---- Exceptions, for the tools ----------------------------------------------------

  /** The text an exception reports: its class and messageText; an Error's text alone. */
  exceptionText(exception) {
    const cls = this.classOf(exception);
    const text = exception.f?.[0];
    if (!this.isString(text)) return cls.name;
    return cls === this.classes.Error ? this.js(text) : `${cls.name}: ${this.js(text)}`;
  }

  /**
   * The context that raised an exception, below the machinery that signals it: Exception's
   * own methods, Object>>error:, halt and doesNotUnderstand:, and a VM error's trap.
   */
  signallerContext(exception) {
    const signal = exception?.f?.[1];
    if (!(signal instanceof Context)) return null;
    let c = signal;
    while (c && this.isMachinery(c)) c = c.sender;
    return c ?? signal;
  }

  isMachinery(c) {
    const m = c.method.methodClass ? c.method : c.method.method;
    if (!m || m.trap) return true;
    const owner = this.instanceClass(m.methodClass);
    for (let k = owner; k; k = k.superclass) if (k === this.classes.Exception) return true;
    return owner === this.classes.Object && ['error:', 'halt', 'doesNotUnderstand:'].includes(m.selector);
  }

  /** Ends a stopped process as an error, for a caller with no debugger. */
  endAsError(proc) {
    const { kind, exception } = proc.suspended;
    const failure = kind === 'unhandled'
      ? new SmalltalkError(this.exceptionText(exception), { errorClass: this.classOf(exception).name })
      : kind === 'wait' ? new SmalltalkError('Nendo answers only a run in the Workspace, which can wait for it.')
        : new SmalltalkError('Interrupted.', { interrupted: true });
    failure.trace = this.stackOf(kind === 'unhandled' ? this.signallerContext(exception) ?? proc.ctx : proc.ctx);
    proc.done = true;
    proc.error = failure;
    proc.ctx = null;
    proc.suspended = null;
  }

  /** The contexts of a stopped process, innermost first, a VM error's trap left out. */
  framesOf(proc, limit = 200) {
    const out = [];
    for (let c = proc.ctx; c && out.length < limit; c = c.sender) if (!c.method.trap) out.push(c);
    return out;
  }

  // ---- Describing -------------------------------------------------------------------

  /** A short description in JavaScript, for errors raised before Smalltalk can print. */
  describe(x) {
    if (x === null || x === undefined) return 'nil';
    if (x === true || x === false) return String(x);
    if (typeof x === 'number' || typeof x === 'bigint') return String(x);
    if (x instanceof F) return String(x.v);
    if (x instanceof Ch) return `$${String.fromCodePoint(x.code)}`;
    if (x instanceof STClass) return this.className(x);
    if (x.s !== undefined) return `#${x.s}`;
    if (this.isString(x)) return `'${this.js(x)}'`;
    const name = this.classOf(x)?.name ?? '?';
    return `${/^[AEIOU]/.test(name) ? 'an' : 'a'} ${name}`;
  }

  /** The stack of a context, innermost first, as lines such as "Foo>>bar" or "[] in Foo>>bar". */
  stackOf(ctx, limit = 40) {
    const lines = [];
    for (let c = ctx; c && lines.length < limit; c = c.sender) {
      if (c.method.trap) continue;
      const m = c.method.methodClass ? c.method : c.method.method;
      const where = m ? `${this.className(m.methodClass)}>>${m.selector}` : '?';
      lines.push(c.closure ? `[] in ${where}` : where);
    }
    return lines;
  }
}

