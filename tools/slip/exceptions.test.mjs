// Exceptions as ANSI has them, and the debugger's hold on a stopped process.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootImage } from './image.mjs';
import { frameLabel, frameSource, frameRange, frameFields, firstFrame, stoppedTitle } from '../../extensions/slip/tools.mjs';

const image = bootImage();
const vm = image.vm;
const print = source => image.print(source);
const now = { yieldTo: fn => setImmediate(fn) };

image.print('Object subclass: #Probe instanceVariableNames: \'\' classVariableNames: \'\' package: \'T\'');
image.print('Probe compile: \'early: log\n\t[^#early] ensure: [log add: #ensured].\n\t^#late\' classified: \'t\'');
image.print('Probe compile: \'twice: n\n\t| r |\n\tr := n * 2.\n\t^r\' classified: \'t\'');
image.print('Probe compile: \'fail\n\t^self error: \'\'probe failed\'\'\' classified: \'t\'');

test('on:do: answers the handler block\'s value, or what return: gives', () => {
  assert.equal(print('[1/0] on: ZeroDivide do: [:e | 7]'), '7');
  assert.equal(print('[1/0] on: ZeroDivide do: [:e | e return: 5]'), '5');
  assert.equal(print('[1/0. 99] on: Error do: [:e | e return]'), 'nil');
  assert.equal(print('[3 + 4] on: Error do: [:e | 0]'), '7', 'With no exception, the block\'s own value.');
  assert.equal(print('[nil foo] on: MessageNotUnderstood do: [:e | e message selector]'), '#foo');
  assert.equal(print('[Probe new fail] on: Error do: [:e | e messageText]'), '\'probe failed\'');
});

test('a handler takes only what it handles; an ExceptionSet takes each of its classes', () => {
  assert.equal(print('[[1/0] on: MessageNotUnderstood do: [:e | #inner]] on: ZeroDivide do: [:e | #outer]'), '#outer');
  assert.equal(print('[nil foo] on: ZeroDivide, MessageNotUnderstood do: [:e | #either]'), '#either');
  assert.equal(print('[Error signal: \'x\'] on: Exception do: [:e | e class name]'), '\'Error\'');
});

test('resume: answers from signal; an Error cannot be resumed', () => {
  assert.equal(print('[(Warning signal: \'w\') + 1] on: Warning do: [:e | e resume: 41]'), '42');
  assert.equal(print('[(Notification signal) isNil] value'), 'true', 'A Notification no one takes answers nil.');
  assert.equal(print('[[(Error signal: \'e\') + 1] on: Error do: [:e | e resume: 1]] on: Error do: [:e | e messageText]'), '\'Error is not resumable.\'');
});

test('retry runs the protected block again; pass and outer reach the handler outside', () => {
  assert.equal(print('| n | n := 0. [n := n + 1. n < 3 ifTrue: [Error signal]. n] on: Error do: [:e | e retry]'), '3');
  assert.equal(print('[[1/0] on: ZeroDivide do: [:e | e pass]] on: ZeroDivide do: [:e | #outside]'), '#outside');
  assert.equal(print('[[(Warning signal) + 1] on: Warning do: [:e | e outer + 10]] on: Warning do: [:e | e resume: 5]'), '15',
    'outer answers the outer handler\'s resumption, and the inner handler goes on with it.');
});

test('ensure: runs its block once, on every way out; ifCurtailed: only on an early one', () => {
  assert.equal(print('| log | log := OrderedCollection new. [log add: 1] ensure: [log add: 2]. log asArray'), '#(1 2)');
  assert.equal(print('| log | log := OrderedCollection new. [[1/0] ensure: [log add: #ensured]] on: ZeroDivide do: [:e | log add: #handled]. log asArray'),
    '#(#handled #ensured)', 'The handler runs, then the unwind on the way out.');
  assert.equal(print('| log | log := OrderedCollection new. (Probe new early: log) -> log asArray'), '#early->#(#ensured)',
    'A block\'s ^ that passes an ensure: runs its block.');
  assert.equal(print('| log | log := OrderedCollection new. [3] ifCurtailed: [log add: #cut]. log size'), '0');
  assert.equal(print('| log | log := OrderedCollection new. [[1/0] ifCurtailed: [log add: #cut]] on: ZeroDivide do: [:e | 0]. log asArray'), '#(#cut)');
});

test('an error the VM finds is an Error a handler can take', () => {
  assert.equal(print('[3 ifTrue: [1]] on: Error do: [:e | e messageText]'), '\'3 is not a Boolean, so it cannot choose a branch.\'');
  const { error } = image.evaluateSync('3 ifTrue: [1]. 4');
  assert.match(error.message, /^3 is not a Boolean/, 'Unhandled, it ends the run with its text.');
});

test('an exception no handler takes ends a run with no debugger, naming the signaller', () => {
  const { error } = image.evaluateSync('Probe new fail');
  assert.equal(error.message, 'probe failed');
  assert.equal(error.trace[0], 'Probe>>fail', 'The trace starts where the error was raised, below the machinery.');
});

test('the debugger opens on the signaller, and Proceed answers nil from signal', async () => {
  const outcome = await image.evaluate('(Probe new fail) isNil', now);
  const proc = outcome.suspended;
  assert.equal(proc?.suspended.kind, 'unhandled');
  assert.equal(stoppedTitle(vm, proc), 'probe failed');
  const frames = vm.framesOf(proc);
  const at = firstFrame(vm, proc, frames);
  assert.equal(frameLabel(vm, frames[at]), 'Probe>>fail');
  const range = frameRange(frames[at]);
  assert.equal(frameSource(frames[at]).slice(range.start, range.end), 'error:', 'The frame marks the send it waits on.');
  const proceeded = await image.continue(proc, now);
  assert.equal(image.printString(proceeded.value), 'true');
});

test('Debug it steps over a doit statement by statement, showing its temps', async () => {
  const proc = image.debug('| a b | a := 3 + 4. b := a * 2. b printString');
  const marked = () => { const frame = vm.framesOf(proc)[0]; const r = frameRange(frame, { next: true }); return frameSource(frame).slice(r.start, r.end); };
  assert.equal(marked(), '+');
  await image.continue(proc, { mode: 'over', ...now });
  assert.equal(marked(), '*');
  assert.deepEqual(frameFields(vm, vm.framesOf(proc)[0]).map(f => `${f.label}=${image.printString(f.value)}`), ['self=nil', 'a=7', 'b=nil']);
  const done = await image.continue(proc, { mode: 'proceed', ...now });
  assert.equal(image.printString(done.value), '\'14\'');
});

test('Into enters a method; Restart puts a frame back at its start', async () => {
  const proc = image.debug('Probe new twice: 5');
  for (let i = 0; i < 10 && frameLabel(vm, vm.framesOf(proc)[0]) !== 'Probe>>twice:'; i++) await image.continue(proc, { mode: 'into', ...now });
  const frame = vm.framesOf(proc)[0];
  assert.equal(frameLabel(vm, frame), 'Probe>>twice:');
  await image.continue(proc, { mode: 'over', ...now });
  assert.equal(frame.temps[1], 10, 'r is set after Over.');
  image.restart(proc, frame);
  assert.equal(frame.pc, 0);
  assert.equal(frame.temps[1], null, 'Restart clears the temps, not the arguments.');
  assert.equal(frame.temps[0], 5);
  const done = await image.continue(proc, now);
  assert.equal(done.value, 10);
});

test('a Halt stops the run; Stop does too, and Abandon runs its ensure: blocks', async () => {
  const halted = await image.evaluate('3 halt. 4', now);
  assert.equal(stoppedTitle(vm, halted.suspended), 'Halt');
  assert.equal((await image.continue(halted.suspended, now)).value, 4);
  image.shown.length = 0;
  let slices = 0;
  const evaluation = image.evaluate('[[true] whileTrue: [3 + 4]] ensure: [Transcript show: \'cleaned\']',
    { slice: 2, yieldTo: fn => { if (++slices === 3) evaluation.stop(); setImmediate(fn); } });
  const stopped = (await evaluation).suspended;
  assert.equal(stoppedTitle(vm, stopped), 'Stopped.');
  assert.ok(frameRange(vm.framesOf(stopped)[0], { next: true }), 'A loop stopped anywhere still marks a send.');
  assert.equal(image.abandon(stopped), null);
  assert.ok(stopped.done);
  assert.equal(image.shown.join(''), 'cleaned');
});
