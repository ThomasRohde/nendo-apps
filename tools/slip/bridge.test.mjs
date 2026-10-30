// The bridge to Nendo from Smalltalk, kept objects as STON, and an agent's evaluations.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootImage } from './image.mjs';
import { createBridge, writeSton, readSton } from '../../extensions/slip/bridge.mjs';
import { createAgentQueue, answerValues } from '../../extensions/slip/agent.mjs';
import { E, F, STATE, CORE, schemaOperations, missingEntities, hasSchema } from '../../extensions/slip/records.mjs';

// A file in memory, answering as window.nendo does.
function fakeNendo(store = {}) {
  let n = 0;
  const writes = [];
  return {
    store, writes,
    has: () => true,
    schema: { describe: async () => ({ entities: Object.keys(store).map(entityId => ({ entityId, fields: [] })) }) },
    records: {
      queryAll: async ({ entityId }) => store[entityId] ?? [],
      create: async (entityId, values) => { const r = { entityId, recordId: `${entityId}.${++n}`, version: 1, values: { ...values } }; (store[entityId] ??= []).push(r); writes.push(['create', entityId]); return r; },
      update: async (record, values) => { if (record.version !== store[record.entityId].find(r => r.recordId === record.recordId)?.version) throw new Error('stale'); Object.assign(record.values, values); record.version++; writes.push(['update', record.recordId]); return record; },
      delete: async record => { store[record.entityId] = store[record.entityId].filter(r => r !== record); writes.push(['delete', record.recordId]); },
    },
  };
}

function setup({ canKeep = true } = {}) {
  const image = bootImage();
  const nendo = fakeNendo({ 'x.task': [{ entityId: 'x.task', recordId: 'r1', version: 1, values: { 'x.task.title': 'Write', 'x.task.size': 3 } }] });
  const objects = new Map();
  image.vm.hooks.request = createBridge(image.vm, { nendo, objects, canKeep: () => canKeep });
  const run = async source => {
    const outcome = await image.evaluate(source, { yieldTo: fn => setImmediate(fn) });
    if (outcome.suspended) return `stopped: ${image.vm.exceptionText(outcome.suspended.suspended.exception)}`;
    return outcome.error ? `error: ${outcome.error.message}` : image.printString(outcome.value);
  };
  return { image, nendo, objects, run };
}

test('Smalltalk reads, makes, changes and deletes the file\'s records, and waits for each answer', async () => {
  const { nendo, run } = setup();
  assert.equal(await run('Nendo entities'), '#(\'x.task\')');
  assert.equal(await run('((Nendo records: \'x.task\') first at: \'x.task.title\'), \' \', (Nendo records: \'x.task\') first recordId'), '\'Write r1\'');
  assert.equal(await run('(Nendo create: \'x.task\' values: (Dictionary new at: \'x.task.title\' put: \'Read\'; at: \'x.task.size\' put: 2.5; yourself)) values size'), '2');
  assert.deepEqual(nendo.store['x.task'][1].values, { 'x.task.title': 'Read', 'x.task.size': 2.5 });
  assert.equal(await run('| r | r := (Nendo records: \'x.task\') first. (Nendo update: r values: (Dictionary new at: \'x.task.size\' put: 4; yourself)) version'), '2');
  assert.equal(await run('Nendo delete: (Nendo records: \'x.task\') last'), 'true');
  assert.equal(nendo.store['x.task'].length, 1);
});

test('a refused request is an Error where it was sent, which a handler can take', async () => {
  const { run } = setup();
  assert.equal(await run('[Nendo records: 3] on: Error do: [:e | e messageText]'), '\'A record type must be text, not 3.\'');
  assert.equal(await run('Nendo create: \'x.task\' values: (Dictionary new at: \'x.task.title\' put: [1]; yourself)'),
    'stopped: a BlockClosure cannot be a record\'s value; give it text, a number, a Boolean, nil or an Array of them.');
});

test('a request outside a Workspace run is an error, not a hang', () => {
  const { image } = setup();
  const { error } = image.evaluateSync('Nendo entities');
  assert.match(error.message, /only a run in the Workspace/);
});

test('STON writes an object\'s fields and collections, and reads back the same shape, cycles included', () => {
  const { image } = setup();
  const vm = image.vm;
  const value = image.evaluateSync('| d | d := Dictionary new. d at: #list put: (OrderedCollection new add: 3/4; add: 2.5; add: $x; add: #\'at:put:\'; add: Object; yourself). d at: #me put: d. d at: #set put: (Set with: 1). d at: #big put: 100 factorial. d').value;
  const text = writeSton(vm, value);
  assert.match(text, /^Dictionary\{/);
  assert.match(text, /OrderedCollection\[Fraction\{#numerator:3,#denominator:4\},2\.5,Character\['x'\],#'at:put:',Class\['Object'\]\]/);
  assert.match(text, /#me:@1/, 'A cycle is written as a reference.');
  const back = readSton(vm, text);
  image.bindings.set('back', vm.globalBinding('back', true));
  vm.globalBinding('back', true).f[1] = back;
  assert.equal(image.print('(back at: #me) == back'), 'true');
  assert.equal(image.print('(back at: #list) asArray'), '{(3/4). 2.5. $x. #at:put:. Object}');
  assert.equal(image.print('(back at: #big) = 100 factorial'), 'true');
  assert.equal(writeSton(vm, back), text, 'Written again, it is the same text.');
  assert.throws(() => writeSton(vm, image.evaluateSync('[1]').value), /cannot be kept/);
  assert.throws(() => readSton(vm, 'NoSuchClass{}'), /no class NoSuchClass/);
});

test('Slip keep:as: writes an st.object record; kept: reads a new copy; forget: removes it', async () => {
  const { nendo, objects, run } = setup();
  assert.equal(await run('Slip keep: (OrderedCollection with: 1 with: \'two\') as: \'pair\'. Slip keptNames'), '#(#pair)');
  assert.equal(await run('(Slip kept: \'pair\') last'), '\'two\'', 'kept: makes the collection again.');
  const record = nendo.store[E.object][0];
  assert.equal(record.values[F.object.ston], 'OrderedCollection[1,\'two\']');
  assert.equal(record.values[F.object.className], 'OrderedCollection');
  assert.equal(await run('Slip keep: 7 as: \'pair\'. Slip kept: \'pair\''), '7', 'Keeping a name again replaces it.');
  assert.equal(nendo.store[E.object].length, 1);
  assert.equal(await run('Slip forget: \'pair\''), 'true');
  assert.equal(objects.size, 0);
  assert.equal(await run('[Slip kept: \'pair\'] on: Error do: [:e | e messageText]'), '\'Nothing is kept as pair.\'');
});

test('a file without the record type for kept objects says how to get it', async () => {
  const { run } = setup({ canKeep: false });
  assert.match(await run('Slip keep: 3 as: \'n\''), /cannot keep objects yet/);
});

test('the two later record types are offered on their own; code needs only the first three', () => {
  const describe = operations => ({ entities: operations.filter(o => o.operationType === 'schema.createEntity').map(o => ({ entityId: o.payload.entityId,
    fields: operations.filter(f => f.operationType === 'schema.addField' && f.payload.entityId === o.payload.entityId).map(f => ({ fieldId: f.payload.fieldId })) })) });
  const core = describe(schemaOperations({ only: CORE }));
  assert.ok(hasSchema(core));
  assert.deepEqual(missingEntities(core).sort(), [E.evaluation, E.object].sort());
  assert.deepEqual(missingEntities(describe(schemaOperations())), []);
  const later = schemaOperations({ only: [E.object, E.evaluation] });
  assert.ok(later.every(o => [E.object, E.evaluation].includes(o.payload.entityId)));
});

// ---- An agent's evaluations

function queue({ allowed = false } = {}) {
  const image = bootImage({});
  const nendo = fakeNendo({ [E.evaluation]: [] });
  let output = '';
  image.vm.hooks.transcript = text => { output += text; };
  let captured = null;
  const state = { allowed };
  const agent = createAgentQueue({ nendo, image: () => image, changed: () => {}, allowed: () => state.allowed,
    evaluate: source => image.evaluate(source, { yieldTo: fn => setImmediate(fn) }),
    capture: on => { if (on) { captured = output.length; return ''; } const text = output.slice(captured); captured = null; return text; } });
  const ask = source => nendo.records.create(E.evaluation, { [F.evaluation.source]: source, [F.evaluation.state]: STATE.waiting });
  return { image, nendo, agent, ask, state };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 50));

test('with the setting off, an evaluation waits until the person runs it, and is answered in its record', async () => {
  const { nendo, agent, ask } = queue();
  const record = await ask('Transcript show: \'hi\'. 3 + 4');
  agent.take(nendo.store[E.evaluation]);
  await settle();
  assert.equal(agent.waiting.length, 1, 'Off by default: nothing runs on its own.');
  assert.equal(record.values[F.evaluation.state], STATE.waiting);
  await agent.run(record);
  assert.deepEqual([record.values[F.evaluation.state], record.values[F.evaluation.result], record.values[F.evaluation.output]], [STATE.done, '7', 'hi']);
  assert.equal(agent.waiting.length, 0);
});

test('a failing evaluation is answered with its error and stack; a declined one says so', async () => {
  const { nendo, agent, ask } = queue();
  const failing = await ask('nil foo');
  const declined = await ask('Smalltalk at: #Danger put: 1');
  agent.take(nendo.store[E.evaluation]);
  await agent.run(failing);
  assert.equal(failing.values[F.evaluation.state], STATE.failed);
  assert.match(failing.values[F.evaluation.result], /^MessageNotUnderstood: nil does not understand #foo\nUndefinedObject>>DoIt/);
  await agent.decline(declined);
  assert.equal(declined.values[F.evaluation.state], STATE.declined);
  agent.take(nendo.store[E.evaluation]);
  assert.equal(agent.waiting.length, 0, 'Answered records do not wait again.');
});

test('with the setting on, each waiting evaluation runs as it comes, in order', async () => {
  const { nendo, agent, ask, state } = queue({ allowed: true });
  await ask('1 + 1');
  await ask('2 + 2');
  agent.take(nendo.store[E.evaluation]);
  for (let i = 0; i < 40 && nendo.store[E.evaluation].some(r => r.values[F.evaluation.state] === STATE.waiting); i++) await settle();
  assert.deepEqual(nendo.store[E.evaluation].map(r => r.values[F.evaluation.result]), ['2', '4']);
  state.allowed = false;
  await ask('3 + 3');
  agent.take(nendo.store[E.evaluation]);
  await settle();
  assert.equal(nendo.store[E.evaluation][2].values[F.evaluation.state], STATE.waiting, 'Turned off again, it waits.');
});

test('an evaluation that would stop for the debugger is answered as failed', () => {
  const image = bootImage();
  const proc = image.process('1/0');
  image.vm.run(proc);
  const values = answerValues(image, { suspended: proc }, '');
  assert.equal(values[F.evaluation.state], STATE.failed);
  assert.match(values[F.evaluation.result], /^ZeroDivide: Division by zero/);
});
