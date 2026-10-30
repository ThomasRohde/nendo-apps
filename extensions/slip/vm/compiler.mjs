// Slip's compiler: a syntax tree to bytecode for the interpreter in vm.mjs. Code is a flat
// array of opcodes with their operands inline; an operand may be a JavaScript object (a
// literal, a block, a global's association). Blocks are compiled to their own code. The
// common control messages (ifTrue:, and:, whileTrue:, to:do: and their kin) are inlined when
// their arguments are literal blocks, as every Smalltalk compiler does.
import { parseMethod, parseDoit, ParseError } from './parser.mjs';

export const OP = {
  SELF: 0, LIT: 1, TEMP: 2, STORE_TEMP: 3, IVAR: 4, STORE_IVAR: 5, GLOBAL: 6, STORE_GLOBAL: 7,
  POP: 8, DUP: 9, SEND: 10, SUPER: 11, BLOCK: 12, RETURN: 13, BLOCK_RETURN: 14, NONLOCAL_RETURN: 15,
  NIL: 16, TRUE: 17, FALSE: 18, ARRAY: 19, THIS_CONTEXT: 20, JUMP: 21, JUMP_FALSE: 22, JUMP_TRUE: 23,
};

export class CompileError extends Error {
  constructor(message, position) { super(message); this.name = 'CompileError'; this.position = position; }
}

const RESERVED = new Set(['self', 'super', 'nil', 'true', 'false', 'thisContext']);

class Scope {
  // A real scope owns a temps array at run time: a method or a block that is not inlined.
  // An inlined block's scope lends its names to the nearest real scope.
  constructor(parent, real) {
    this.parent = parent;
    this.vars = new Map();       // name -> { index, kind: 'arg' | 'temp' }
    this.isReal = real;
    this.owner = real ? this : parent.owner;
    this.count = 0;              // temps allocated, for a real scope
    this.names = [];             // a real scope's temp names by index, its inlined blocks' too
    this.realDepth = real ? (parent ? parent.realDepthOf() + 1 : 0) : parent.realDepth;
  }
  realDepthOf() { return this.realDepth; }
  declare(name, kind, position) {
    if (RESERVED.has(name)) throw new CompileError(`${name} is a reserved word and cannot be a variable.`, position);
    if (this.vars.has(name)) throw new CompileError(`${name} is declared twice.`, position);
    const index = this.owner.count++;
    this.owner.names[index] = name;
    this.vars.set(name, { index, kind });
    return index;
  }
  lookup(name) {
    for (let s = this; s; s = s.parent) {
      const v = s.vars.get(name);
      if (v) return { ...v, depth: this.realDepth - s.realDepth };
    }
    return null;
  }
}

class CodeUnit {
  // The code of a method or of one real block.
  constructor() { this.code = []; this.positions = []; this.blocks = []; }
  emit(position, ...items) {
    this.positions.push(this.code.length, position ?? -1);
    for (const item of items) this.code.push(item);
    return this.code.length;
  }
  patch(at, value) { this.code[at] = value; }
  get here() { return this.code.length; }
}

/**
 * Compiles method source for a class. Answers a method description the VM installs:
 * {selector, numArgs, numTemps, code, positions, primitive, pragmas, source, blocks}.
 * options.bindings (a Map of name -> association) and options.autoBind serve a Workspace.
 */
export function compile(vm, source, cls, options = {}) {
  let tree;
  try { tree = options.doit ? parseDoit(source) : parseMethod(source); }
  catch (error) {
    if (error instanceof ParseError) throw new CompileError(error.message, error.position);
    throw error;
  }
  return new Compiler(vm, source, cls, options).method(tree);
}

class Compiler {
  constructor(vm, source, cls, options) {
    this.vm = vm;
    this.source = source;
    this.cls = cls;
    this.options = options;
    this.instVars = cls ? vm.allInstVarNames(cls) : [];
  }

  method(tree) {
    const scope = new Scope(null, true);
    for (const a of tree.args) scope.declare(a.name, 'arg', a.start);
    for (const t of tree.temps) scope.declare(t.name, 'temp', t.start);
    const unit = new CodeUnit();
    this.unit = unit;
    this.scope = scope;
    this.inBlock = false;
    const body = tree.body;
    if (tree.doit) {
      // A doit answers the value of its last statement.
      if (body.length === 0) unit.emit(tree.start, OP.NIL, OP.RETURN);
      body.forEach((s, i) => {
        if (s.type === 'return') { this.value(s.value); unit.emit(s.start, OP.RETURN); return; }
        this.value(s);
        if (i < body.length - 1) unit.emit(s.start, OP.POP);
        else unit.emit(s.end, OP.RETURN);
      });
    } else {
      this.statementsForEffect(body);
      if (!body.length || body[body.length - 1].type !== 'return') unit.emit(tree.end, OP.SELF, OP.RETURN);
    }
    const primitive = tree.pragmas.find(p => p.keyword === 'primitive:');
    let primitiveName = null;
    if (primitive) {
      const arg = primitive.args[0];
      if (!arg || (arg.kind !== 'string' && arg.kind !== 'symbol' && arg.kind !== 'integer')) throw new CompileError('primitive: takes a name.', tree.start);
      primitiveName = String(arg.value);
    }
    return {
      selector: tree.selector, numArgs: tree.args.length, numTemps: scope.count,
      argNames: tree.args.map(a => a.name), tempNames: scope.names,
      code: unit.code, positions: unit.positions, blocks: unit.blocks,
      primitive: primitiveName, pragmas: tree.pragmas.map(p => p.keyword), source: this.source,
    };
  }

  statementsForEffect(list) {
    for (const s of list) {
      if (s.type === 'return') { this.value(s.value); this.emitReturn(s.start); }
      else { this.value(s); this.unit.emit(s.end, OP.POP); }
    }
  }

  emitReturn(position) { this.unit.emit(position, this.inBlock ? OP.NONLOCAL_RETURN : OP.RETURN); }

  // Compiles statements whose value is the last one's, leaving it on the stack; nil if none.
  // A return inside leaves the sequence; the code after it is never reached.
  sequenceValue(list, position) {
    if (!list.length) { this.unit.emit(position, OP.NIL); return; }
    list.forEach((s, i) => {
      if (s.type === 'return') { this.value(s.value); this.emitReturn(s.start); if (i === list.length - 1) this.unit.emit(s.end, OP.NIL); return; }
      this.value(s);
      if (i < list.length - 1) this.unit.emit(s.end, OP.POP);
    });
  }

  value(node) {
    const u = this.unit;
    switch (node.type) {
      case 'lit': return this.literal(node.value, node.start);
      case 'var': return this.variable(node.name, node.start);
      case 'assign': return this.assign(node);
      case 'send': return this.send(node);
      case 'cascade': return this.cascade(node);
      case 'block': return this.block(node);
      case 'array':
        for (const e of node.elements) this.value(e);
        u.emit(node.start, OP.ARRAY, node.elements.length);
        return;
      default: throw new CompileError(`Cannot compile ${node.type}.`, node.start);
    }
  }

  literal(lit, position) {
    const u = this.unit;
    if (lit.kind === 'nil') return u.emit(position, OP.NIL);
    if (lit.kind === 'true') return u.emit(position, OP.TRUE);
    if (lit.kind === 'false') return u.emit(position, OP.FALSE);
    u.emit(position, OP.LIT, this.vm.literal(lit));
  }

  variable(name, position) {
    const u = this.unit;
    if (name === 'self' || name === 'super') return u.emit(position, OP.SELF);
    if (name === 'thisContext') return u.emit(position, OP.THIS_CONTEXT);
    const local = this.scope.lookup(name);
    if (local) return u.emit(position, OP.TEMP, local.depth, local.index);
    const ivar = this.instVars.indexOf(name);
    if (ivar >= 0) return u.emit(position, OP.IVAR, ivar);
    u.emit(position, OP.GLOBAL, this.binding(name, position, false));
  }

  binding(name, position, assigning) {
    const classVar = this.cls ? this.vm.classVariableBinding(this.cls, name) : null;
    if (classVar) return classVar;
    const global = this.vm.globalBinding(name);
    if (global) return global;
    if (this.options.bindings) {
      const existing = this.options.bindings.get(name);
      if (existing) return existing;
      if (this.options.autoBind && /^[a-z]/.test(name)) {
        const assoc = this.vm.newAssociation(name, null);
        this.options.bindings.set(name, assoc);
        return assoc;
      }
    }
    if (/^[A-Z]/.test(name)) return this.vm.undeclaredBinding(name);
    throw new CompileError(`${name} is not declared.`, position);
  }

  assign(node) {
    const u = this.unit;
    const name = node.name;
    if (RESERVED.has(name)) throw new CompileError(`Cannot assign to ${name}.`, node.start);
    this.value(node.value);
    const local = this.scope.lookup(name);
    if (local) {
      if (local.kind === 'arg') throw new CompileError(`Cannot assign to the argument ${name}.`, node.start);
      return u.emit(node.start, OP.STORE_TEMP, local.depth, local.index);
    }
    const ivar = this.instVars.indexOf(name);
    if (ivar >= 0) return u.emit(node.start, OP.STORE_IVAR, ivar);
    u.emit(node.start, OP.STORE_GLOBAL, this.binding(name, node.start, true));
  }

  cascade(node) {
    const u = this.unit;
    const isSuper = node.receiver.type === 'var' && node.receiver.name === 'super';
    this.value(node.receiver);
    node.messages.forEach((m, i) => {
      const last = i === node.messages.length - 1;
      if (!last) u.emit(m.start, OP.DUP);
      for (const a of m.args) this.value(a);
      u.emit(m.start, isSuper ? OP.SUPER : OP.SEND, m.selector, m.args.length);
      if (!last) u.emit(m.start, OP.POP);
    });
  }

  send(node) {
    if (this.inline(node)) return;
    const u = this.unit;
    const isSuper = node.receiver.type === 'var' && node.receiver.name === 'super' && !node.receiver.parens;
    this.value(node.receiver);
    for (const a of node.args) this.value(a);
    u.emit(node.selectorStart ?? node.start, isSuper ? OP.SUPER : OP.SEND, node.selector, node.args.length);
  }

  // ---- Blocks -----------------------------------------------------------------------

  block(node) {
    const outerUnit = this.unit, outerScope = this.scope, outerInBlock = this.inBlock;
    const scope = new Scope(outerScope, true);
    for (const p of node.params) scope.declare(p.name, 'arg', p.start);
    for (const t of node.temps) scope.declare(t.name, 'temp', t.start);
    const unit = new CodeUnit();
    this.unit = unit; this.scope = scope; this.inBlock = true;
    this.sequenceValue(node.body, node.end);
    unit.emit(node.end, OP.BLOCK_RETURN);
    this.unit = outerUnit; this.scope = outerScope; this.inBlock = outerInBlock;
    const block = {
      numArgs: node.params.length, numTemps: scope.count, code: unit.code, positions: unit.positions,
      blocks: unit.blocks, argNames: node.params.map(p => p.name), tempNames: scope.names,
      start: node.start, end: node.end,
    };
    outerUnit.blocks.push(block);
    outerUnit.emit(node.start, OP.BLOCK, block);
  }

  // The body of a literal block, compiled in place. Its arguments are bound by the caller.
  inlinedBody(node, args = []) {
    const outerScope = this.scope;
    const scope = new Scope(outerScope, false);
    const indices = args.map(name => scope.declare(name, 'temp', node.start));
    for (const t of node.temps) scope.declare(t.name, 'temp', t.start);
    this.scope = scope;
    // Temps of an inlined block start each pass as nil.
    for (const t of node.temps) { const v = scope.lookup(t.name); this.unit.emit(t.start, OP.NIL, OP.STORE_TEMP, v.depth, v.index, OP.POP); }
    this.sequenceValue(node.body, node.end);
    this.scope = outerScope;
    return indices;
  }

  inline(node) {
    const s = node.selector, a = node.args, u = this.unit;
    const isBlock = (n, params = 0) => n && n.type === 'block' && n.params.length === params;
    const jump = (op) => { u.emit(node.selectorStart, op, 0); return u.here - 1; };
    const land = at => u.patch(at, u.here);
    switch (s) {
      case 'ifTrue:': case 'ifFalse:': {
        if (!isBlock(a[0])) return false;
        this.value(node.receiver);
        const skip = jump(s === 'ifTrue:' ? OP.JUMP_FALSE : OP.JUMP_TRUE);
        this.inlinedBody(a[0]);
        const end = jump(OP.JUMP);
        land(skip);
        u.emit(node.end, OP.NIL);
        land(end);
        return true;
      }
      case 'ifTrue:ifFalse:': case 'ifFalse:ifTrue:': {
        if (!isBlock(a[0]) || !isBlock(a[1])) return false;
        this.value(node.receiver);
        const other = jump(s === 'ifTrue:ifFalse:' ? OP.JUMP_FALSE : OP.JUMP_TRUE);
        this.inlinedBody(a[0]);
        const end = jump(OP.JUMP);
        land(other);
        this.inlinedBody(a[1]);
        land(end);
        return true;
      }
      case 'and:': case 'or:': {
        if (!isBlock(a[0])) return false;
        this.value(node.receiver);
        const short = jump(s === 'and:' ? OP.JUMP_FALSE : OP.JUMP_TRUE);
        this.inlinedBody(a[0]);
        const end = jump(OP.JUMP);
        land(short);
        u.emit(node.end, s === 'and:' ? OP.FALSE : OP.TRUE);
        land(end);
        return true;
      }
      case 'whileTrue:': case 'whileFalse:': {
        if (!isBlock(node.receiver) || !isBlock(a[0])) return false;
        const top = u.here;
        this.inlinedBody(node.receiver);
        const exit = jump(s === 'whileTrue:' ? OP.JUMP_FALSE : OP.JUMP_TRUE);
        this.inlinedBody(a[0]);
        u.emit(node.end, OP.POP, OP.JUMP, top);
        land(exit);
        u.emit(node.end, OP.NIL);
        return true;
      }
      case 'whileTrue': case 'whileFalse': {
        if (!isBlock(node.receiver)) return false;
        const top = u.here;
        this.inlinedBody(node.receiver);
        u.emit(node.end, s === 'whileTrue' ? OP.JUMP_TRUE : OP.JUMP_FALSE, top);
        u.emit(node.end, OP.NIL);
        return true;
      }
      case 'to:do:': {
        if (!isBlock(a[1], 1)) return false;
        const block = a[1];
        // The loop variable and the limit live in the enclosing real scope.
        const outerScope = this.scope;
        const loopScope = new Scope(outerScope, false);
        const limitName = ` limit${u.here}`;
        loopScope.vars.set(limitName, { index: loopScope.owner.count++, kind: 'temp' });
        this.scope = loopScope;
        const limit = loopScope.lookup(limitName);
        this.value(node.receiver);
        const counterScope = new Scope(loopScope, false);
        const counterIndex = counterScope.declare(block.params[0].name, 'temp', block.params[0].start);
        const counter = { depth: 0, index: counterIndex };
        this.scope = loopScope;
        u.emit(node.start, OP.STORE_TEMP, counter.depth, counter.index, OP.POP);
        this.value(a[0]);
        u.emit(node.start, OP.STORE_TEMP, limit.depth, limit.index, OP.POP);
        const top = u.here;
        u.emit(node.selectorStart, OP.TEMP, counter.depth, counter.index, OP.TEMP, limit.depth, limit.index, OP.SEND, '<=', 1);
        const exit = jump(OP.JUMP_FALSE);
        this.scope = counterScope;
        for (const t of block.temps) counterScope.declare(t.name, 'temp', t.start);
        for (const t of block.temps) { const v = counterScope.lookup(t.name); u.emit(t.start, OP.NIL, OP.STORE_TEMP, v.depth, v.index, OP.POP); }
        this.sequenceValue(block.body, block.end);
        u.emit(block.end, OP.POP, OP.TEMP, counter.depth, counter.index, OP.LIT, 1, OP.SEND, '+', 1, OP.STORE_TEMP, counter.depth, counter.index, OP.POP, OP.JUMP, top);
        land(exit);
        this.scope = outerScope;
        u.emit(node.end, OP.NIL);
        return true;
      }
      default: return false;
    }
  }
}
