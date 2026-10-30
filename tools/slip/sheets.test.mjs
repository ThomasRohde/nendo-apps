// Sheets, the spreadsheet in apps/Sheets.st: its formula language, its recalculation, and its
// grid driven by the World's events, headless on a display of 1000 by 640.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { bootImage, root } from './image.mjs';
import { uiEvent, newCanvas } from '../../extensions/slip/display.mjs';
import { createBridge } from '../../extensions/slip/bridge.mjs';
import { E, F } from '../../extensions/slip/records.mjs';

const yieldTo = fn => setImmediate(fn);
const SHEETS = readFileSync(path.join(root, 'apps', 'Sheets.st'), 'utf8');

function fakeNendo() {
  const store = {
    [E.object]: [],
    'x.task': [
      { entityId: 'x.task', recordId: 'r1', version: 1, values: { 'x.task.title': 'Write', 'x.task.hours': 3 } },
      { entityId: 'x.task', recordId: 'r2', version: 1, values: { 'x.task.title': '=not a formula', 'x.task.hours': 4.5 } },
    ],
  };
  let n = 0;
  return {
    store,
    has: () => true,
    schema: { describe: async () => ({ entities: Object.keys(store).map(entityId => ({ entityId, fields: [] })) }) },
    records: {
      queryAll: async ({ entityId }) => store[entityId] ?? [],
      create: async (entityId, values) => { const r = { entityId, recordId: `${entityId}.${++n}`, version: 1, values: { ...values } }; (store[entityId] ??= []).push(r); return r; },
      update: async (record, values) => { Object.assign(record.values, values); record.version++; return record; },
      delete: async record => { store[record.entityId] = store[record.entityId].filter(r => r !== record); },
    },
  };
}

function setup({ nendo = fakeNendo(), objects = new Map() } = {}) {
  const image = bootImage();
  const vm = image.vm;
  vm.hooks.display = { open: () => {}, size: () => [1000, 640], dark: () => false };
  vm.hooks.request = createBridge(vm, { nendo, objects, canKeep: () => true });
  const result = image.fileIn(SHEETS, 'Sheets.st');
  assert.deepEqual(result.errors, []);
  const print = source => image.print(source);
  const world = () => vm.globalBinding('World').f[1];
  const event = async (type, x = 0, y = 0, options = {}) => {
    const canvas = newCanvas(vm);
    const outcome = await image.send(world(), 'handle:on:', [uiEvent(vm, type, x, y, options), canvas], { yieldTo });
    if (outcome.error) throw outcome.error;
    if (outcome.suspended) throw new Error(`stopped: ${vm.exceptionText(outcome.suspended.suspended.exception)}`);
    return outcome.value === true ? canvas.ops : null;
  };
  const run = async source => {
    const outcome = await image.evaluate(source, { yieldTo });
    if (outcome.suspended) throw new Error(`stopped: ${vm.exceptionText(outcome.suspended.suspended.exception)}`);
    if (outcome.error) throw outcome.error;
    return image.printString(outcome.value);
  };
  return { image, vm, nendo, objects, print, event, run };
}

/** A sheet with these cells, and the printString of each name asked. */
function sheet(cells, ...names) {
  const { print } = setup();
  const puts = Object.entries(cells).map(([name, source]) => `s at: '${name}' put: '${source.replaceAll('\'', '\'\'')}'.`).join(' ');
  return names.map(name => print(`| s | s := Sheet new. ${puts} SheetFormat text: (s at: '${name}')`));
}

test('the formula language: precedence, text, comparison, percent, exact decimals', () => {
  assert.deepEqual(sheet({ A1: '=1+2*3', A2: '=(1+2)*3', A3: '=2^3^2', A4: '=-2^2', A5: '=10%*50', A6: '=0.1+0.2', A7: '="a"&"b"&1', A8: '=1/3*3', A9: '=3>2', A10: '="abc"<"ABD"' },
    'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10'),
  ['\'7\'', '\'9\'', '\'64\'', '\'4\'', '\'5\'', '\'0.3\'', '\'ab1\'', '\'1\'', '\'TRUE\'', '\'TRUE\'']);
});

test('references, ranges and functions read the cells; text and empty cells are skipped as a spreadsheet does', () => {
  const cells = { A1: '3', A2: '4.5', A3: 'note', A4: '', A5: '=SUM(A1:A4)', B1: '=AVERAGE(A1:A3)', B2: '=MAX(A1:A2)*2', B3: '=COUNT(A1:A3)',
    B4: '=IF(A1>2, "big", "small")', B5: '=ROUND(10/3, 2)', B6: '=MEDIAN(1,5,3,9)', B7: '=CONCAT(A3, "-", A1)', B8: '=LEN(UPPER(A3))', B9: '=AND(A1>1, NOT(A1>5))' };
  assert.deepEqual(sheet(cells, 'A5', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9'),
    ['\'7.5\'', '\'3.75\'', '\'9\'', '\'2\'', '\'big\'', '\'3.33\'', '\'4\'', '\'note-3\'', '\'4\'', '\'TRUE\'']);
});

test('errors are values: they pass through formulas, and IF and IFERROR can step around them', () => {
  assert.deepEqual(sheet({ A1: '=1/0', A2: '=A1+1', A3: '=IFERROR(A1, 0)', A4: '=IF(TRUE, 1, A1)', A5: '=FOO(1)', A6: '=SUM(1,', A7: '="x"*2', A8: '=A1:A2' },
    'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8'),
  ['\'#DIV/0!\'', '\'#DIV/0!\'', '\'0\'', '\'1\'', '\'#NAME?\'', '\'#ERROR!\'', '\'#VALUE!\'', '\'#VALUE!\'']);
});

test('a change recalculates what depends on it, in order, however far down', () => {
  const { print } = setup();
  assert.equal(print(`| s | s := Sheet new.
    s at: 'A1' put: '1'. s at: 'A2' put: '=A1*2'. s at: 'A3' put: '=A2+A1'. s at: 'A4' put: '=SUM(A1:A3)'.
    s at: 'A1' put: '10'.
    {s at: 'A2'. s at: 'A3'. s at: 'A4'}`), '#(20 30 60)');
});

test('a circle is caught: its cells answer #CIRC!, and breaking it brings them back', () => {
  const { print } = setup();
  assert.equal(print(`| s | s := Sheet new.
    s at: 'A1' put: '=C1+1'. s at: 'B1' put: '=A1'. s at: 'C1' put: '=B1'. s at: 'D1' put: '=C1*2'.
    {s at: 'A1'. s at: 'B1'. s at: 'D1'}`), '{#CIRC!. #CIRC!. #CIRC!}');
  assert.equal(print(`| s | s := Sheet new.
    s at: 'A1' put: '=C1+1'. s at: 'B1' put: '=A1'. s at: 'C1' put: '=B1'. s at: 'C1' put: '5'.
    {s at: 'A1'. s at: 'B1'}`), '#(6 6)');
  assert.equal(print('| s | s := Sheet new. s at: \'A1\' put: \'=SUM(A1:A3)\'. s at: \'A1\''), '#CIRC!', 'A range that holds its own cell is a circle.');
});

test('a formula prints back as text, and moves its relative references when it is moved', () => {
  const { print } = setup();
  assert.equal(print('(SheetParser parse: \'(1+2)*3-(4-5)&"q""t"\') printString'), '\'(1+2)*3-(4-5)&"q""t"\'');
  assert.equal(print('((SheetParser parse: \'SUM(A1:B2)+$C$3*D$4-$E5\') shiftedBy: 2 @ 3) printString'), '\'SUM(C4:D5)+$C$3*F$4-$E8\'');
  assert.equal(print('((SheetParser parse: \'A1+1\') shiftedBy: 0 @ -1) printString'), '\'#REF!!+1\''.replace('!!', '!'));
});

test('undo and redo walk the changes back and forth', () => {
  const { print } = setup();
  assert.equal(print(`| s out | s := Sheet new. out := OrderedCollection new.
    s at: 'A1' put: '1'. s at: 'B1' put: '=A1*3'. s at: 'A1' put: '2'.
    out add: (s at: 'B1'). s undo. out add: (s at: 'B1'). s undo. out add: (s at: 'B1'). s redo. s redo. out add: (s at: 'B1').
    out add: s canRedo. out asArray`), '#(6 3 nil 6 false)');
});

test('the grid: type, Enter, arrows, a double click to edit, Escape, and the formula bar', async () => {
  const s = setup();
  await s.run('SheetsApp open');
  const app = 'World submorphs first';
  const grid = `${app} grid`;
  const centre = async place => (await s.run(`(${grid} rectOf: ${place}) center`)).split('@').map(Number);
  const key = (k, options = {}) => s.event('keyDown', 0, 0, { key: k, ...options });
  const type = async text => { for (const k of text) await key(k); };
  await s.event('mouseDown', ...await centre('6 @ 3'));
  await s.event('mouseUp', ...await centre('6 @ 3'));
  assert.equal(await s.run(`${grid} cursor`), '6@3');
  await type('=D7*2');
  assert.equal(await s.run(`${grid} editText`), '\'=D7*2\'');
  const ops = await s.event('redraw');
  assert.ok(ops.some(op => op[0] === 'frame' && op[5] === 'rgba(234, 88, 12, 1)'), 'While a formula is typed, the cells it reads are framed.');
  assert.ok(ops.some(op => op[0] === 'text' && op[1] === '=D7*2'), 'The formula bar shows the text being typed.');
  await key('Enter');
  assert.equal(await s.run(`${app} sheet at: 'F3'`), '(1474/5)');
  assert.equal(await s.run(`${grid} cursor`), '6@4', 'Enter moves down.');
  await key('ArrowUp');
  await key('ArrowLeft');
  assert.equal(await s.run(`${grid} cursor`), '5@3');
  const [x, y] = await centre('2 @ 2');
  await s.event('mouseDown', x, y);
  await s.event('mouseUp', x, y);
  await s.event('mouseDown', x, y, { clicks: 2 });
  await s.event('mouseUp', x, y);
  assert.equal(await s.run(`${grid} editText`), '\'3\'', 'A double click edits the cell\'s text.');
  await key('Backspace');
  await type('7');
  await key('Escape');
  assert.equal(await s.run(`${app} sheet at: 'B2'`), '3', 'Escape leaves the cell as it was.');
  await key('7');
  await key('Tab');
  assert.equal(await s.run(`${app} sheet at: 'D2'`), '(175/2)', 'Typing replaces the cell, and its formulas follow.');
  assert.equal(await s.run(`${grid} cursor`), '3@2', 'Tab moves right.');
});

test('a click while a formula waits for a value puts that cell\'s name in it', async () => {
  const s = setup();
  await s.run('SheetsApp open');
  const grid = 'World submorphs first grid';
  const centre = async place => (await s.run(`(${grid} rectOf: ${place}) center`)).split('@').map(Number);
  await s.event('mouseDown', ...await centre('6 @ 2'));
  await s.event('mouseUp', ...await centre('6 @ 2'));
  for (const k of '=') await s.event('keyDown', 0, 0, { key: k });
  await s.event('mouseDown', ...await centre('2 @ 3'));
  await s.event('mouseUp', ...await centre('2 @ 3'));
  await s.event('keyDown', 0, 0, { key: '+' });
  await s.event('mouseDown', ...await centre('3 @ 3'));
  await s.event('mouseUp', ...await centre('3 @ 3'));
  await s.event('keyDown', 0, 0, { key: 'Enter' });
  assert.equal(await s.run('World submorphs first sheet sourceAt: 6 @ 2'), '\'=B3+C3\'');
  assert.equal(await s.run('World submorphs first sheet at: \'F2\''), '(46/5)');
});

test('a dragged range is summed in the status line, copied and pasted with its references moved, and undone', async () => {
  const s = setup();
  await s.run('SheetsApp open');
  const app = 'World submorphs first';
  const grid = `${app} grid`;
  const centre = async place => (await s.run(`(${grid} rectOf: ${place}) center`)).split('@').map(Number);
  await s.event('mouseDown', ...await centre('4 @ 2'));
  await s.event('mouseMove', ...await centre('4 @ 5'));
  await s.event('mouseUp', ...await centre('4 @ 5'));
  assert.equal(await s.run(`${grid} selectedPlaces size`), '4');
  const ops = await s.event('redraw');
  assert.ok(ops.some(op => op[0] === 'text' && op[1].startsWith('Sum 147.4   Average 36.85   Count 4')), 'The status line sums the range.');
  await s.event('keyDown', 0, 0, { key: 'c', ctrl: true });
  await s.event('mouseDown', ...await centre('5 @ 2'));
  await s.event('mouseUp', ...await centre('5 @ 2'));
  await s.event('keyDown', 0, 0, { key: 'v', ctrl: true });
  assert.equal(await s.run(`${app} sheet sourceAt: 5 @ 3`), '\'=C3*D3\'', 'A pasted formula reads the cells as far from it as before.');
  await s.event('keyDown', 0, 0, { key: 'z', ctrl: true });
  assert.equal(await s.run(`${app} sheet sourceAt: 5 @ 3`), '\'\'', 'Ctrl+Z takes the paste back.');
  await s.event('keyDown', 0, 0, { key: 'y', ctrl: true });
  assert.equal(await s.run(`${app} sheet sourceAt: 5 @ 3`), '\'=C3*D3\'');
});

test('the wheel scrolls, a column\'s edge in the header resizes it, and Sum sums the column above', async () => {
  const s = setup();
  await s.run('SheetsApp open');
  const app = 'World submorphs first';
  const grid = `${app} grid`;
  const [gx, gy] = (await s.run(`${grid} center`)).split('@').map(Number);
  await s.event('wheel', gx, gy, { delta: 120 });
  assert.equal(await s.run(`${grid} visibleRows first`), '5');
  await s.event('wheel', gx, gy, { delta: -400 });
  assert.equal(await s.run(`${grid} visibleRows first`), '1');
  const edge = Number(await s.run(`(${grid} xOfColumn: 2) + (${app} sheet widthOf: 2)`));
  const top = Number(await s.run(`${grid} top + 10`));
  await s.event('mouseDown', edge, top);
  await s.event('mouseMove', edge + 50, top);
  await s.event('mouseUp', edge + 50, top);
  assert.equal(await s.run(`${app} sheet widthOf: 2`), '146');
  await s.run(`${grid} select: 3 @ 6 extending: false`);
  await s.run(`${app} insertSum`);
  assert.equal(await s.run(`${app} sheet sourceAt: 3 @ 6`), '\'=SUM(C2:C5)\'');
});

test('the sheet is kept in the file, and a new image opens it again', async () => {
  const nendo = fakeNendo(), objects = new Map();
  const s = setup({ nendo, objects });
  await s.run('SheetsApp open');
  await s.run('World submorphs first grid put: (Dictionary new at: 1 @ 12 put: \'kept?\'; yourself)');
  await new Promise(resolve => setTimeout(resolve, 20));
  const kept = nendo.store[E.object].find(r => r.values[F.object.name] === 'sheet');
  assert.match(kept.values[F.object.ston], /'A12':'kept\?'/);
  const again = setup({ nendo, objects });
  await again.run('SheetsApp open');
  assert.equal(await again.run('World submorphs first sheet at: \'A12\''), '\'kept?\'');
  assert.equal(await again.run('World submorphs first sheet at: \'D8\''), '(737/4)');
});

test('Records reads the file\'s records into the sheet: a header, a row each, and text that would read as a formula kept as text', async () => {
  const s = setup();
  await s.run('SheetsApp open');
  await s.run('World submorphs first readRecords: \'x.task\'');
  const at = name => s.run(`World submorphs first sheet at: '${name}'`);
  assert.deepEqual([await at('A1'), await at('B1'), await at('A2'), await at('B2'), await at('B3')], ['\'hours\'', '\'title\'', '3', '\'Write\'', '\'=not a formula\'']);
  assert.equal(await at('D8'), 'nil', 'The example is gone.');
  await s.run('World submorphs first undo');
  assert.equal(await at('D8'), '(737/4)', 'Undo puts the sheet back.');
});
