// Slip's records: the schema it asks for, the values a class or method is kept as, and a
// file's code loaded back into a fresh image.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootImage } from './image.mjs';
import { E, F, SIDE, schemaOperations, hasSchema, classValues, methodValues, recordMethodKey, definitionOrder, loadRecords }
  from '../../extensions/slip/records.mjs';

// The schema as schema.describe answers it, made from the operations.
function describe(operations) {
  const entities = [];
  for (const { operationType, payload } of operations) {
    if (operationType === 'schema.createEntity') entities.push({ entityId: payload.entityId, fields: [] });
    if (operationType === 'schema.addField') entities.find(e => e.entityId === payload.entityId).fields.push({ fieldId: payload.fieldId });
  }
  return { entities };
}

test('the schema operations make every record type and field Slip keeps', () => {
  assert.ok(hasSchema(describe(schemaOperations())));
  assert.ok(hasSchema(describe(schemaOperations({ plain: true }))));
  assert.ok(!schemaOperations({ plain: true }).some(o => o.operationType === 'schema.setChoiceMetadata'), 'The plain set carries no choice colours.');
  const partial = describe(schemaOperations().filter(o => o.payload.fieldId !== F.method.source));
  assert.ok(!hasSchema(partial), 'A file without the method source field cannot keep methods.');
});

test('each field ID belongs to its record type', () => {
  for (const { operationType, payload } of schemaOperations())
    if (operationType === 'schema.addField') assert.ok(payload.fieldId.startsWith(`${payload.entityId}.`), payload.fieldId);
});

let id = 0;
const record = (entityId, values) => ({ entityId, recordId: `r${++id}`, version: 1, values });

function keep(image) {
  const vm = image.vm;
  const classes = [], methods = [];
  const kernel = new Set(Object.keys(vm.classes));
  for (const name of ['Shape', 'Circle', 'Square']) {
    const cls = vm.globalBinding(name).f[1];
    classes.push(record(E.cls, classValues(vm, cls)));
    for (const side of [cls, cls.cls]) for (const method of side.methods.values()) methods.push(record(E.method, methodValues(vm, side, method)));
  }
  const integer = vm.classes.Integer;
  methods.push(record(E.method, methodValues(vm, integer, integer.methods.get('double'))));
  assert.ok(!classes.some(r => kernel.has(r.values[F.cls.name])));
  return { classes, methods };
}

function author(image) {
  image.print('Object subclass: #Shape instanceVariableNames: \'name\' classVariableNames: \'Count\' package: \'Shapes\'');
  image.print('Shape subclass: #Circle instanceVariableNames: \'radius\' classVariableNames: \'\' package: \'Shapes\'');
  image.print('Shape subclass: #Square instanceVariableNames: \'side\' classVariableNames: \'\' package: \'Shapes\'');
  image.print('Shape compile: \'area\n\t^self subclassResponsibility\' classified: \'measuring\'');
  image.print('Circle compile: \'radius: r\n\tradius := r\' classified: \'accessing\'');
  image.print('Circle compile: \'area\n\t^radius * radius * 355 / 113\' classified: \'measuring\'');
  image.print('Square compile: \'side: s\n\tside := s\' classified: \'accessing\'');
  image.print('Square compile: \'area\n\t^side * side\' classified: \'measuring\'');
  image.print('Square class compile: \'side: s\n\t^self new side: s\' classified: \'instance creation\'');
  image.print('Integer compile: \'double\n\t"Twice me!"\n\t^self * 2\' classified: \'*Shapes\'');
}

test('a class is kept with its superclass, variables, package and comment', () => {
  const image = bootImage();
  author(image);
  const values = classValues(image.vm, image.vm.globalBinding('Shape').f[1]);
  assert.equal(values[F.cls.name], 'Shape');
  assert.equal(values[F.cls.superclass], 'Object');
  assert.equal(values[F.cls.instanceVariables], 'name');
  assert.equal(values[F.cls.classVariables], 'Count');
  assert.equal(values[F.cls.package], 'Shapes');
  assert.equal(values[F.cls.shape], 'fixed');
});

test('a method is kept with its side, selector, protocol and exact source', () => {
  const image = bootImage();
  author(image);
  const square = image.vm.globalBinding('Square').f[1];
  const values = methodValues(image.vm, square.cls, square.cls.methods.get('side:'));
  assert.equal(values[F.method.className], 'Square');
  assert.equal(values[F.method.side], SIDE.class);
  assert.equal(values[F.method.selector], 'side:');
  assert.equal(values[F.method.protocol], 'instance creation');
  assert.equal(values[F.method.source], 'side: s\n\t^self new side: s');
  assert.equal(recordMethodKey(values), 'Square class side:');
});

test('a file\'s code loads into a fresh image and works, whatever order its records come in', () => {
  const first = bootImage();
  author(first);
  const kept = keep(first);
  const fresh = bootImage({ classDefined: () => assert.fail('Loading must write nothing back.'), methodCompiled: () => assert.fail('Loading must write nothing back.') });
  const loaded = loadRecords(fresh, [...kept.classes].reverse(), [...kept.methods].reverse());
  assert.deepEqual(loaded.problems, []);
  assert.equal(loaded.classes, 3);
  assert.equal(loaded.methods, kept.methods.length);
  assert.equal(fresh.print('(Square side: 3) area + (Circle new radius: 1; area)'), '(1372/113)');
  assert.equal(fresh.print('21 double'), '42');
  assert.equal(fresh.print('Circle superclass'), 'Shape');
});

test('definition order puts every superclass before its subclasses', () => {
  const rows = [['C', 'B'], ['B', 'A'], ['A', 'Object'], ['D', 'Object']].map(([name, superclass]) => record(E.cls, { [F.cls.name]: name, [F.cls.superclass]: superclass }));
  const order = definitionOrder(rows, name => name === 'Object').map(r => r.values[F.cls.name]);
  assert.ok(order.indexOf('A') < order.indexOf('B') && order.indexOf('B') < order.indexOf('C'), order.join(' '));
});

test('a broken record is named and does not stop the rest', () => {
  const image = bootImage();
  const classes = [record(E.cls, { [F.cls.name]: 'Orphan', [F.cls.superclass]: 'Missing' }), record(E.cls, { [F.cls.name]: 'Fine', [F.cls.superclass]: 'Object' })];
  const methods = [
    record(E.method, { [F.method.className]: 'Fine', [F.method.side]: SIDE.instance, [F.method.selector]: 'ok', [F.method.source]: 'ok\n\t^1' }),
    record(E.method, { [F.method.className]: 'Fine', [F.method.side]: SIDE.instance, [F.method.selector]: 'bad', [F.method.source]: 'bad\n\t^(1' }),
    record(E.method, { [F.method.className]: 'Nobody', [F.method.side]: SIDE.instance, [F.method.selector]: 'x', [F.method.source]: 'x\n\t^1' }),
  ];
  const loaded = loadRecords(image, classes, methods);
  assert.equal(loaded.classes, 1);
  assert.equal(loaded.methods, 1);
  assert.equal(loaded.problems.length, 3);
  assert.match(loaded.problems.join('\n'), /Orphan: its superclass Missing is not defined/);
  assert.match(loaded.problems.join('\n'), /Fine bad:/);
  assert.match(loaded.problems.join('\n'), /there is no class Nobody/);
  assert.equal(image.print('Fine new ok'), '1');
});

test('a kernel class cannot be reshaped from a record', () => {
  const image = bootImage();
  const loaded = loadRecords(image, [record(E.cls, { [F.cls.name]: 'Point', [F.cls.superclass]: 'Object', [F.cls.instanceVariables]: 'a b c' })], []);
  if (image.vm.classes.Point) assert.equal(loaded.problems.length, 1, 'Reshaping a kernel class must be refused.');
  const array = loadRecords(image, [record(E.cls, { [F.cls.name]: 'Array', [F.cls.superclass]: 'Object', [F.cls.instanceVariables]: 'oops' })], []);
  assert.equal(array.problems.length, 1, 'Reshaping Array must be refused.');
  assert.equal(image.print('#(1 2) size'), '2');
});
