// What the class browser and the inspector show, read from an image with the examples in it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { exampleRecords } from './definition.mjs';
import { readFileSync } from 'node:fs';
import { hostPath } from '../host.mjs';
import { KEYS, KEYS_SHIFTED, ALL, SIDES, packages, classesIn, protocols, selectors, methodOf, classDefinition, classTemplate, accept, setComment, classNamed,
  fields, moreIndexed, printed, INDEXED_SHOWN } from '../../extensions/slip/tools.mjs';

const { image } = await exampleRecords();
const vm = image.vm;
const stack = classNamed(vm, 'Stack');

test('the packages are the classes\' own and the ones that extend a class', () => {
  const names = packages(vm);
  assert.ok(names.includes('Kernel') && names.includes('Examples'));
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
});

test('a package lists its own classes, then the classes it extends', () => {
  const listed = classesIn(vm, 'Examples');
  assert.deepEqual(listed.filter(c => !c.extended).map(c => c.cls.name), ['Circle', 'Rectangle', 'Shape', 'Stack']);
  assert.deepEqual(listed.filter(c => c.extended).map(c => c.cls.name), ['Integer']);
  assert.ok(!classesIn(vm, 'Kernel').some(c => c.cls.name === 'Stack'));
});

test('protocols and selectors, on either side', () => {
  assert.deepEqual(protocols(stack, SIDES.instance), [ALL, 'initialization', 'operations', 'printing', 'testing']);
  assert.deepEqual(selectors(stack, SIDES.instance, 'operations'), ['pop', 'push:', 'top']);
  assert.equal(selectors(stack, SIDES.instance, ALL).length, 7);
  assert.deepEqual(selectors(stack, SIDES.class, ALL), ['new']);
  assert.equal(methodOf(stack, SIDES.class, 'new').source, 'new\n\t^super new initialize');
});

test('a class definition evaluates back to the same class', () => {
  const text = classDefinition(vm, stack);
  assert.equal(text, 'Object subclass: #Stack\n\tinstanceVariableNames: \'items\'\n\tclassVariableNames: \'\'\n\tpackage: \'Examples\'');
  const { value, error } = image.evaluateSync(text);
  assert.equal(error, null);
  assert.equal(value, stack);
  assert.ok(classDefinition(vm, classNamed(vm, 'Array')).startsWith('ArrayedCollection variableSubclass: #Array'));
  assert.ok(classTemplate('Mine').endsWith('package: \'Mine\''));
});

test('accept compiles into the chosen side and calls the hook; a comment is kept as a class change', () => {
  const heard = [];
  vm.hooks.methodCompiled = (owner, method) => heard.push(`${owner.isMeta ? 'class ' : ''}${method.selector}`);
  vm.hooks.classDefined = cls => heard.push(`class ${cls.name}`);
  accept(vm, stack, SIDES.instance, 'second\n\t^items at: items size - 1', 'accessing');
  accept(vm, stack, SIDES.class, 'with: x\n\t^self new push: x; yourself', 'instance creation');
  setComment(vm, stack, 'A stack.');
  assert.deepEqual(heard, ['second', 'class with:', 'class Stack']);
  assert.equal(image.print('(Stack with: 4) push: 5; second'), '4');
  assert.equal(stack.comment, 'A stack.');
  assert.throws(() => accept(vm, stack, SIDES.instance, 'bad\n\t^(', 'x'), error => typeof error.position === 'number');
});

test('Browse it finds a class by the word, a symbol or a metaclass name', () => {
  assert.equal(classNamed(vm, 'Stack'), stack);
  assert.equal(classNamed(vm, '#Stack'), stack);
  assert.equal(classNamed(vm, 'Stack class'), stack);
  assert.equal(classNamed(vm, 'stack'), null);
  assert.equal(classNamed(vm, 'Transcript'), null, 'A global that is not a class is not browsed.');
});

test('the inspector lists named fields, then indexed slots', () => {
  const value = image.evaluateSync('Stack new push: 1; push: 2; yourself').value;
  assert.deepEqual(fields(vm, value).map(f => f.label), ['items']);
  const items = fields(vm, value)[0].value;
  assert.deepEqual(fields(vm, items).map(f => f.label), ['array', 'firstIndex', 'lastIndex']);
  const array = image.evaluateSync('#(10 20 30)').value;
  assert.deepEqual(fields(vm, array).map(f => `${f.label}=${printed(image, f.value)}`), ['1=10', '2=20', '3=30']);
  assert.deepEqual(fields(vm, 42), [], 'A number has no fields.');
  assert.deepEqual(fields(vm, image.evaluateSync('\'abc\'').value), [], 'A string shows as its value, not as characters.');
  const big = image.evaluateSync('Array new: 500').value;
  assert.equal(fields(vm, big).length, INDEXED_SHOWN);
  assert.equal(moreIndexed(vm, big), 500 - INDEXED_SHOWN);
  assert.ok(fields(vm, stack).some(f => f.label === 'selectors'), 'A class shows its selectors.');
});

test('a printOn: that never ends does not hang the inspector', () => {
  image.print('Object subclass: #Endless instanceVariableNames: \'\' classVariableNames: \'\' package: \'T\'');
  image.print('Endless compile: \'printOn: aStream\n\t[true] whileTrue\' classified: \'printing\'');
  const started = performance.now();
  const text = printed(image, image.evaluateSync('Endless new').value);
  assert.ok(performance.now() - started < 2000, 'It must be stopped within its budget.');
  assert.match(text, /an Endless \(printString failed: #printString took longer than 200 ms/);
});

test('no key of Slip\'s is one Nendo keeps for itself', () => {
  // api.js hands Nendo's own keys to the Workbench before the view hears them (protocol.ts, hostKeys).
  const protocol = readFileSync(hostPath('src', 'Nendo.Workbench', 'src', 'extension-api', 'protocol.ts'), 'utf8');
  const host = JSON.parse(/export const hostKeys[^=]*= Object\.freeze\((\[[^\]]*\])\)/s.exec(protocol)[1].replaceAll('\'', '"').replace(/,\s*\]/, ']'));
  assert.ok(host.includes('Ctrl+K'), 'The host\'s keys were read.');
  const slip = [...Object.keys(KEYS).map(k => `Ctrl+${k.toUpperCase()}`), ...Object.keys(KEYS_SHIFTED).map(k => `Ctrl+Shift+${k.toUpperCase()}`)];
  assert.deepEqual(slip.filter(k => host.includes(k)), []);
});
