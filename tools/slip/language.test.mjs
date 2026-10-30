// The language beyond single expressions: the parser, classes and methods, super, non-local
// return, errors and their traces, the Transcript, and evaluation in time slices.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootImage } from './image.mjs';
import { tokenize, parseMethod, parseDoit, ParseError } from '../../extensions/slip/vm/parser.mjs';

test('the tokenizer reads literals as Smalltalk writes them', () => {
  const kinds = tokenize('#foo #with:with: $a \'it\'\'s\' 16rFF 1.5e2 -3 #(1 #b) #[1 2] := ^').map(t => t.type);
  assert.deepEqual(kinds.slice(0, 5), ['symbol', 'symbol', 'char', 'string', 'number']);
  assert.ok(kinds.includes('litArray') && kinds.includes('byteArray') && kinds.includes('assign') && kinds.includes('caret'));
  const string = tokenize('\'it\'\'s\'')[0];
  assert.equal(string.value, 'it\'s');
});

test('a method parses to its selector, arguments, temporaries and primitive', () => {
  const method = parseMethod('at: index put: value\n\t<primitive: \'basicAtPut\'>\n\t| old |\n\told := self at: index.\n\t^old');
  assert.equal(method.selector, 'at:put:');
  assert.deepEqual(method.args.map(a => a.name), ['index', 'value']);
  assert.deepEqual(method.temps.map(a => a.name), ['old']);
  assert.deepEqual(method.pragmas.map(p => p.keyword), ['primitive:']);
});

test('a parse error names what was expected and where', () => {
  assert.throws(() => parseDoit('3 + '), error => error instanceof ParseError && typeof error.position === 'number' && /expected/i.test(error.message));
  assert.throws(() => parseDoit('(3 + 4'), error => error instanceof ParseError && /\)/.test(error.message));
});

test('a class is defined, given methods, and used', () => {
  const image = bootImage();
  image.print('Object subclass: #Account instanceVariableNames: \'balance\' classVariableNames: \'\' package: \'Bank\'');
  image.print('Account compile: \'deposit: n\n\tbalance := (balance ifNil: [0]) + n\' classified: \'money\'');
  image.print('Account compile: \'balance\n\t^balance ifNil: [0]\' classified: \'accessing\'');
  image.print('Account class compile: \'with: n\n\t^self new deposit: n; yourself\' classified: \'instance creation\'');
  assert.equal(image.print('(Account with: 30) deposit: 12; balance'), '42');
  assert.equal(image.print('Account new printString'), '\'an Account\'');
  assert.equal(image.print('Account category'), '\'Bank\'');
  assert.equal(image.print('(Account includesSelector: #deposit:)'), 'true');
  assert.equal(image.print('Account class name'), '\'Account class\'');
});

test('super sends start the lookup above the method\'s class', () => {
  const image = bootImage();
  image.print('Object subclass: #A instanceVariableNames: \'\' classVariableNames: \'\' package: \'T\'');
  image.print('A subclass: #B instanceVariableNames: \'\' classVariableNames: \'\' package: \'T\'');
  image.print('B subclass: #C instanceVariableNames: \'\' classVariableNames: \'\' package: \'T\'');
  image.print('A compile: \'who\n\t^#(a)\' classified: \'t\'');
  image.print('B compile: \'who\n\t^super who , #(b)\' classified: \'t\'');
  assert.equal(image.print('C new who'), '#(#a #b)');
});

test('reshaping a class keeps its methods working on the new layout', () => {
  const image = bootImage();
  image.print('Object subclass: #P instanceVariableNames: \'x\' classVariableNames: \'\' package: \'T\'');
  image.print('P compile: \'x: n\n\tx := n\' classified: \'t\'. P compile: \'x\n\t^x\' classified: \'t\'');
  image.print('Object subclass: #P instanceVariableNames: \'y x\' classVariableNames: \'\' package: \'T\'');
  assert.equal(image.print('(P new x: 5; yourself) x'), '5');
});

test('a block\'s ^ returns from the method that made it', () => {
  const image = bootImage();
  image.print('Object subclass: #Finder instanceVariableNames: \'\' classVariableNames: \'\' package: \'T\'');
  image.print('Finder compile: \'find: n in: list\n\tlist do: [:each | each = n ifTrue: [^#found]].\n\t^#missing\' classified: \'t\'');
  assert.equal(image.print('Finder new find: 2 in: #(1 2 3)'), '#found');
  assert.equal(image.print('Finder new find: 9 in: #(1 2 3)'), '#missing');
});

test('a ^ from a block whose method has returned is an error, not a crash', () => {
  const image = bootImage();
  image.print('Object subclass: #Maker instanceVariableNames: \'\' classVariableNames: \'\' package: \'T\'');
  image.print('Maker compile: \'make\n\t^[^1]\' classified: \'t\'');
  const { error } = image.evaluateSync('Maker new make value');
  assert.ok(error, 'The dead return must fail.');
  assert.match(error.message, /block tried to return from a method that has already returned/i);
});

test('an unknown message names its receiver and the selector, with a trace', () => {
  const image = bootImage();
  const { error } = image.evaluateSync('3 fooBar: 4');
  assert.match(error.message, /^MessageNotUnderstood: 3 does not understand #fooBar:$/);
  assert.ok(error.trace.includes('UndefinedObject>>DoIt'));
});

test('errors say what went wrong', () => {
  const image = bootImage();
  const message = source => image.evaluateSync(source).error?.message ?? 'no error';
  assert.match(message('1 / 0'), /ZeroDivide/);
  assert.match(message('#(1 2) at: 3'), /index 3 is out of bounds|SubscriptOutOfBounds/i);
  assert.match(message('self error: \'boom\''), /boom/);
  assert.match(message('nil foo'), /nil does not understand #foo/);
  assert.match(message('OrderedCollection new removeFirst'), /empty/i);
  assert.match(message('Dictionary new at: #missing'), /missing|not found/i);
});

test('deep recursion ends in an error, not a stack overflow of the page', () => {
  const image = bootImage();
  image.print('Object subclass: #Deep instanceVariableNames: \'\' classVariableNames: \'\' package: \'T\'');
  image.print('Deep compile: \'down: n\n\t^self down: n + 1\' classified: \'t\'');
  const { error } = image.evaluateSync('Deep new down: 1');
  assert.ok(error, 'Unbounded recursion must fail.');
  assert.match(error.message, /depth|recursion/i);
});

test('the Workspace keeps its variables from one doit to the next', () => {
  const image = bootImage();
  image.print('x := 6');
  assert.equal(image.print('x * 7'), '42');
});

test('Transcript show: reaches the hook', () => {
  const image = bootImage();
  image.print('Transcript show: \'one\'; cr; show: 2 printString; tab; show: \'x\'');
  assert.equal(image.shown.join(''), 'one\n2\tx');
});

test('the hooks hear a class defined, a method compiled and a method removed', () => {
  const heard = [];
  const image = bootImage({
    classDefined: cls => heard.push(`class ${cls.name}`),
    methodCompiled: (owner, method) => heard.push(`compiled ${owner.name ?? ''} ${method.selector}`),
    methodRemoved: (owner, selector) => heard.push(`removed ${selector}`),
  });
  image.print('Object subclass: #H instanceVariableNames: \'\' classVariableNames: \'\' package: \'T\'');
  image.print('H compile: \'a\n\t^1\' classified: \'t\'');
  image.print('H removeSelector: #a');
  assert.deepEqual(heard, ['class H', 'compiled H a', 'removed a']);
});

test('a long evaluation runs in slices, and stop stops it for the debugger', async () => {
  const image = bootImage();
  let slices = 0;
  const evaluation = image.evaluate('[true] whileTrue: [3 + 4]', { slice: 5, yieldTo: fn => { slices++; if (slices === 4) evaluation.stop(); setImmediate(fn); } });
  const outcome = await evaluation;
  assert.ok(slices >= 4, `It must yield between slices, and yielded ${slices} times.`);
  assert.equal(outcome.suspended?.suspended.kind, 'interrupt', 'A stopped evaluation waits, stopped, for the debugger.');
  image.abandon(outcome.suspended);
  assert.ok(outcome.suspended.done, 'Abandon ends it.');
});

test('a slice keeps to its budget', async () => {
  const image = bootImage();
  const lengths = [];
  let last = performance.now();
  const evaluation = image.evaluate('| n | n := 0. 1 to: 3000000 do: [:i | n := n + i]. n', { slice: 8, yieldTo: fn => { const now = performance.now(); lengths.push(now - last); setImmediate(() => { last = performance.now(); fn(); }); } });
  const outcome = await evaluation;
  assert.equal(image.printString(outcome.value), '4500001500000');
  assert.ok(lengths.length > 1, 'The loop must take more than one slice.');
  assert.ok(Math.max(...lengths) < 100, `No slice may hold the page for long; the longest took ${Math.round(Math.max(...lengths))} ms.`);
});
