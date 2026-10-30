// Slip's Smalltalk parser: source text to a syntax tree. The syntax is Smalltalk-80 with
// Pharo's additions: dynamic arrays { }, byte arrays #[ ], scaled radix numbers and pragmas.
// Every node carries `start` and `end`, offsets into the source, for errors and the debugger.

export class ParseError extends Error {
  constructor(message, position) { super(message); this.name = 'ParseError'; this.position = position; }
}

const isLetter = c => /[A-Za-z_]/.test(c);
const isDigit = c => c >= '0' && c <= '9';
const isSpace = c => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';
const BINARY = '+-*/\\<>=~@%|&?,';
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Splits source into tokens. Each token is {type, value, start, end, glued}. */
export function tokenize(source) {
  const tokens = [];
  let i = 0;
  const n = source.length;
  while (true) {
    let gap = false;
    while (i < n) {
      if (isSpace(source[i])) { i++; gap = true; continue; }
      if (source[i] === '"') {
        const close = source.indexOf('"', i + 1);
        if (close < 0) throw new ParseError('A comment is not closed.', i);
        i = close + 1; gap = true; continue;
      }
      break;
    }
    const start = i;
    const push = (type, value) => tokens.push({ type, value, start, end: i, glued: !gap });
    if (i >= n) { push('eof', null); return tokens; }
    const c = source[i];
    if (isLetter(c)) {
      while (i < n && (isLetter(source[i]) || isDigit(source[i]))) i++;
      // A keyword is a word with a colon, but not the colon of an assignment.
      if (source[i] === ':' && source[i + 1] !== '=') { i++; push('keyword', source.slice(start, i)); }
      else push('word', source.slice(start, i));
      continue;
    }
    if (isDigit(c)) { const value = readNumber(source, i); i = value.end; push('number', value); continue; }
    if (c === '\'') { const value = readString(source, i); i = value.end; push('string', value.text); continue; }
    if (c === '$') {
      if (i + 1 >= n) throw new ParseError('A character literal has no character.', i);
      const cp = source.codePointAt(i + 1);
      i += 1 + (cp > 0xffff ? 2 : 1);
      push('char', cp);
      continue;
    }
    if (c === '#') {
      const next = source[i + 1];
      if (next === '(') { i += 2; push('litArray', null); continue; }
      if (next === '[') { i += 2; push('byteArray', null); continue; }
      if (next === '\'') { const value = readString(source, i + 1); i = value.end; push('symbol', value.text); continue; }
      if (next !== undefined && isLetter(next)) {
        i++;
        while (i < n && (isLetter(source[i]) || isDigit(source[i]) || source[i] === ':')) i++;
        push('symbol', source.slice(start + 1, i));
        continue;
      }
      if (next !== undefined && BINARY.includes(next)) {
        i++;
        while (i < n && BINARY.includes(source[i])) i++;
        push('symbol', source.slice(start + 1, i));
        continue;
      }
      i++; push('hash', '#'); continue;
    }
    if (c === ':' && source[i + 1] === '=') { i += 2; push('assign', ':='); continue; }
    if (c === ':') { i++; push('colon', ':'); continue; }
    if (c === '^') { i++; push('caret', '^'); continue; }
    if ('()[]{}.;'.includes(c)) { i++; push(c, c); continue; }
    if (BINARY.includes(c)) {
      i++;
      // A binary selector is one or more operator characters; a minus only joins at the start.
      while (i < n && BINARY.includes(source[i]) && source[i] !== '-') i++;
      push('binary', source.slice(start, i));
      continue;
    }
    throw new ParseError(`Unexpected character ${JSON.stringify(c)}.`, i);
  }
}

function readString(source, at) {
  let i = at + 1, text = '';
  while (true) {
    if (i >= source.length) throw new ParseError('A string is not closed.', at);
    if (source[i] === '\'') {
      if (source[i + 1] === '\'') { text += '\''; i += 2; continue; }
      return { text, end: i + 1 };
    }
    text += source[i++];
  }
}

function digitsIn(source, i, radix) {
  let j = i;
  while (j < source.length) {
    const d = DIGITS.indexOf(source[j]);
    if (d < 0 || d >= radix) break;
    j++;
  }
  return j;
}

function toBig(text, radix) {
  let value = 0n;
  const big = BigInt(radix);
  for (const ch of text) value = value * big + BigInt(DIGITS.indexOf(ch));
  return value;
}

// A number literal: 42, 16r1F, 1.5, 1.5e3, 2e10 (an integer), 1/2 is a send and not a literal.
function readNumber(source, at) {
  let i = digitsIn(source, at, 10);
  let radix = 10, intText = source.slice(at, i);
  if (source[i] === 'r') {
    radix = Number(intText);
    if (radix < 2 || radix > 36) throw new ParseError(`A radix must be 2 to 36, not ${radix}.`, at);
    const j = digitsIn(source, i + 1, radix);
    if (j === i + 1) throw new ParseError('A radix number has no digits.', at);
    intText = source.slice(i + 1, j);
    i = j;
  }
  let fraction = null;
  if (source[i] === '.' && i + 1 < source.length && DIGITS.indexOf(source[i + 1]) >= 0 && DIGITS.indexOf(source[i + 1]) < radix) {
    const j = digitsIn(source, i + 1, radix);
    fraction = source.slice(i + 1, j);
    i = j;
  }
  let exponent = 0;
  if (source[i] === 'e' && (isDigit(source[i + 1] ?? '') || (source[i + 1] === '-' && isDigit(source[i + 2] ?? '')))) {
    let j = i + 1;
    const negative = source[j] === '-';
    if (negative) j++;
    const k = digitsIn(source, j, 10);
    exponent = Number(source.slice(j, k)) * (negative ? -1 : 1);
    i = k;
  }
  if (fraction === null && exponent >= 0) {
    return { kind: 'integer', value: toBig(intText, radix) * BigInt(radix) ** BigInt(exponent), end: i };
  }
  let value;
  if (radix === 10) value = Number(`${intText}.${fraction ?? '0'}e${exponent}`);
  else {
    value = Number(toBig(intText, radix));
    if (fraction) for (let k = 0; k < fraction.length; k++) value += DIGITS.indexOf(fraction[k]) / radix ** (k + 1);
    value *= radix ** exponent;
  }
  return { kind: 'float', value, end: i };
}

class Parser {
  constructor(source) {
    this.source = source;
    this.tokens = tokenize(source);
    this.at = 0;
  }
  get token() { return this.tokens[this.at]; }
  peek(k = 1) { return this.tokens[Math.min(this.at + k, this.tokens.length - 1)]; }
  next() { const t = this.tokens[this.at]; if (t.type !== 'eof') this.at++; return t; }
  is(type, value) { const t = this.token; return t.type === type && (value === undefined || t.value === value); }
  fail(message, token = this.token) { throw new ParseError(message, token.start); }
  expect(type, value, what) {
    if (!this.is(type, value)) this.fail(`${what ?? `Expected ${value ?? type}`}, but found ${this.describe(this.token)}.`);
    return this.next();
  }
  describe(t) { return t.type === 'eof' ? 'the end' : JSON.stringify(this.source.slice(t.start, t.end)); }

  // ---- Methods and doits ------------------------------------------------------------

  method() {
    const start = this.token.start;
    let selector = '';
    const args = [];
    if (this.is('word')) selector = this.next().value;
    else if (this.is('binary')) { selector = this.next().value; args.push(this.argName()); }
    else if (this.is('keyword')) {
      while (this.is('keyword')) { selector += this.next().value; args.push(this.argName()); }
    } else this.fail('A method begins with its selector.');
    const pragmas = [];
    let temps = [];
    // Pragmas may come before or after the temporaries.
    for (let round = 0; round < 3; round++) {
      if (this.is('binary', '<')) pragmas.push(this.pragma());
      else if (this.is('binary', '|') || this.is('binary', '||')) temps = temps.concat(this.temporaries());
      else break;
    }
    const body = this.statements(true);
    if (!this.is('eof')) this.fail(`Expected the end of the method, but found ${this.describe(this.token)}.`);
    return { type: 'method', selector, args, temps, pragmas, body, start, end: this.source.length };
  }

  doit() {
    const start = this.token.start;
    let temps = [];
    if (this.is('binary', '|') || this.is('binary', '||')) temps = this.temporaries();
    const body = this.statements(true);
    if (!this.is('eof')) this.fail(`Expected the end, but found ${this.describe(this.token)}.`);
    return { type: 'method', selector: 'DoIt', args: [], temps, pragmas: [], body, start, end: this.source.length, doit: true };
  }

  argName() {
    const t = this.expect('word', undefined, 'Expected an argument name');
    return { name: t.value, start: t.start };
  }

  pragma() {
    const open = this.next();
    let keyword = '';
    const args = [];
    if (this.is('word')) keyword = this.next().value;
    else while (this.is('keyword')) {
      keyword += this.next().value;
      args.push(this.literalValue());
    }
    if (!keyword) this.fail('A pragma needs a keyword.', open);
    this.expect('binary', '>', 'A pragma ends with >');
    return { keyword, args };
  }

  literalValue() {
    const node = this.primary();
    if (node.type !== 'lit') this.fail('A pragma argument must be a literal.');
    return node.value;
  }

  temporaries() {
    if (this.is('binary', '||')) { this.next(); return []; }
    this.next();
    const temps = [];
    while (this.is('word')) { const t = this.next(); temps.push({ name: t.value, start: t.start }); }
    this.expect('binary', '|', 'The temporaries end with |');
    return temps;
  }

  statements(top) {
    const list = [];
    while (true) {
      while (this.is('.')) this.next();
      if (this.is('eof') || this.is(']') || this.is('}') || this.is(')')) break;
      if (this.is('caret')) {
        const caret = this.next();
        const value = this.expression();
        list.push({ type: 'return', value, start: caret.start, end: value.end });
        while (this.is('.')) this.next();
        if (!(this.is('eof') || this.is(']') || this.is('}') || this.is(')'))) this.fail('Nothing may follow a return in the same sequence.');
        break;
      }
      list.push(this.expression());
      if (this.is('.')) continue;
      break;
    }
    return list;
  }

  expression() {
    if (this.is('word') && this.peek().type === 'assign') {
      const name = this.next();
      this.next();
      const value = this.expression();
      return { type: 'assign', name: name.value, value, start: name.start, end: value.end, nameStart: name.start };
    }
    const first = this.keywordSend(this.primary());
    if (!this.is(';')) return first;
    if (first.type !== 'send') this.fail('A cascade needs a message before the semicolon.');
    const messages = [{ selector: first.selector, args: first.args, start: first.selectorStart }];
    while (this.is(';')) {
      this.next();
      const start = this.token.start;
      let selector = '', args = [];
      if (this.is('word')) selector = this.next().value;
      else if (this.is('binary')) { selector = this.next().value; args.push(this.unarySend(this.primary())); }
      else if (this.is('keyword')) {
        while (this.is('keyword')) { selector += this.next().value; args.push(this.binarySend(this.unarySend(this.primary()))); }
      } else this.fail('A message must follow a semicolon.');
      messages.push({ selector, args, start });
    }
    return { type: 'cascade', receiver: first.receiver, messages, start: first.start, end: this.tokens[this.at - 1].end };
  }

  keywordSend(receiver) {
    const head = this.binarySend(this.unarySend(receiver));
    if (!this.is('keyword')) return head;
    const selectorStart = this.token.start;
    let selector = '';
    const args = [];
    while (this.is('keyword')) {
      selector += this.next().value;
      args.push(this.binarySend(this.unarySend(this.primary())));
    }
    return { type: 'send', receiver: head, selector, args, start: head.start, end: args[args.length - 1].end, selectorStart };
  }

  binarySend(receiver) {
    let node = receiver;
    while (this.is('binary')) {
      const op = this.next();
      const arg = this.unarySend(this.primary());
      node = { type: 'send', receiver: node, selector: op.value, args: [arg], start: node.start, end: arg.end, selectorStart: op.start };
    }
    return node;
  }

  unarySend(receiver) {
    let node = receiver;
    while (this.is('word') && this.peek().type !== 'assign') {
      const t = this.next();
      node = { type: 'send', receiver: node, selector: t.value, args: [], start: node.start, end: t.end, selectorStart: t.start };
    }
    return node;
  }

  primary() {
    const t = this.token;
    switch (t.type) {
      case 'word': {
        this.next();
        if (t.value === 'nil') return { type: 'lit', value: { kind: 'nil' }, start: t.start, end: t.end };
        if (t.value === 'true') return { type: 'lit', value: { kind: 'true' }, start: t.start, end: t.end };
        if (t.value === 'false') return { type: 'lit', value: { kind: 'false' }, start: t.start, end: t.end };
        return { type: 'var', name: t.value, start: t.start, end: t.end };
      }
      case 'number': this.next(); return { type: 'lit', value: numberLiteral(t.value, false), start: t.start, end: t.end };
      case 'binary':
        // A minus glued to a number is a negative literal.
        if (t.value === '-' && this.peek().type === 'number' && this.peek().glued) {
          this.next();
          const num = this.next();
          return { type: 'lit', value: numberLiteral(num.value, true), start: t.start, end: num.end };
        }
        this.fail(`Expected a value, but found ${this.describe(t)}.`);
        break;
      case 'string': this.next(); return { type: 'lit', value: { kind: 'string', value: t.value }, start: t.start, end: t.end };
      case 'symbol': this.next(); return { type: 'lit', value: { kind: 'symbol', value: t.value }, start: t.start, end: t.end };
      case 'char': this.next(); return { type: 'lit', value: { kind: 'char', value: t.value }, start: t.start, end: t.end };
      case 'litArray': { this.next(); const items = this.literalArrayItems(); return { type: 'lit', value: { kind: 'array', items }, start: t.start, end: this.tokens[this.at - 1].end }; }
      case 'byteArray': { this.next(); const bytes = this.byteArrayItems(); return { type: 'lit', value: { kind: 'bytes', bytes }, start: t.start, end: this.tokens[this.at - 1].end }; }
      case '(': {
        this.next();
        const inner = this.expression();
        this.expect(')', undefined, 'Expected )');
        return { ...inner, parens: true };
      }
      case '[': return this.block();
      case '{': {
        this.next();
        const elements = this.statements(false);
        if (elements.some(e => e.type === 'return')) this.fail('A brace array cannot hold a return.', t);
        const close = this.expect('}', undefined, 'Expected }');
        return { type: 'array', elements, start: t.start, end: close.end };
      }
      default:
        this.fail(`Expected a value, but found ${this.describe(t)}.`);
    }
  }

  block() {
    const open = this.next();
    const params = [];
    while (this.is('colon')) {
      this.next();
      const name = this.expect('word', undefined, 'Expected a block argument name');
      params.push({ name: name.value, start: name.start });
    }
    let temps = [];
    if (params.length) {
      if (this.is('binary', '||')) { this.next(); temps = this.temporariesAfterBar(); }
      else if (this.is('binary', '|')) this.next();
      else if (!this.is(']')) this.fail('Block arguments end with |.');
    }
    if (this.is('binary', '|') || this.is('binary', '||')) temps = temps.concat(this.temporaries());
    const body = this.statements(false);
    const close = this.expect(']', undefined, 'Expected ]');
    return { type: 'block', params, temps, body, start: open.start, end: close.end };
  }

  // [:x || t | ...]: the first bar closed the arguments, the second opened the temporaries.
  temporariesAfterBar() {
    const temps = [];
    while (this.is('word')) { const t = this.next(); temps.push({ name: t.value, start: t.start }); }
    this.expect('binary', '|', 'The temporaries end with |');
    return temps;
  }

  literalArrayItems() {
    const items = [];
    while (!this.is(')')) {
      const t = this.token;
      if (t.type === 'eof') this.fail('A literal array is not closed.');
      if (t.type === '(' || t.type === 'litArray') { this.next(); items.push({ kind: 'array', items: this.literalArrayItems() }); continue; }
      if (t.type === '[' || t.type === 'byteArray') { this.next(); items.push({ kind: 'bytes', bytes: this.byteArrayItems() }); continue; }
      if (t.type === 'word') {
        this.next();
        if (t.value === 'nil') items.push({ kind: 'nil' });
        else if (t.value === 'true') items.push({ kind: 'true' });
        else if (t.value === 'false') items.push({ kind: 'false' });
        else items.push({ kind: 'symbol', value: t.value });
        continue;
      }
      if (t.type === 'keyword') {
        // Keywords written together are one symbol: #(at:put:) holds #at:put:.
        let name = this.next().value;
        while (this.is('keyword') && this.token.glued) name += this.next().value;
        items.push({ kind: 'symbol', value: name });
        continue;
      }
      if (t.type === 'binary') {
        if (t.value === '-' && this.peek().type === 'number' && this.peek().glued) { this.next(); items.push(numberLiteral(this.next().value, true)); continue; }
        this.next(); items.push({ kind: 'symbol', value: t.value }); continue;
      }
      if (t.type === 'number') { this.next(); items.push(numberLiteral(t.value, false)); continue; }
      if (t.type === 'string') { this.next(); items.push({ kind: 'string', value: t.value }); continue; }
      if (t.type === 'symbol') { this.next(); items.push({ kind: 'symbol', value: t.value }); continue; }
      if (t.type === 'char') { this.next(); items.push({ kind: 'char', value: t.value }); continue; }
      this.fail(`${this.describe(t)} cannot stand in a literal array.`);
    }
    this.next();
    return items;
  }

  byteArrayItems() {
    const bytes = [];
    while (!this.is(']')) {
      const t = this.expect('number', undefined, 'A byte array holds numbers 0 to 255');
      if (t.value.kind !== 'integer' || t.value.value > 255n) this.fail('A byte array holds numbers 0 to 255.', t);
      bytes.push(Number(t.value.value));
    }
    this.next();
    return bytes;
  }
}

function numberLiteral(token, negative) {
  if (token.kind === 'integer') return { kind: 'integer', value: negative ? -token.value : token.value };
  return { kind: 'float', value: negative ? -token.value : token.value };
}

export const parseMethod = source => new Parser(source).method();
export const parseDoit = source => new Parser(source).doit();
export const parseExpression = source => new Parser(source).doit();
