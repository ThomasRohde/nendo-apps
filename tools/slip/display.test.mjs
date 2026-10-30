// The display: geometry and colour, the Canvas's operations, the World's events, and the Cards
// app on them, headless: the display's hook is a fake of the given size.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { bootImage, root } from './image.mjs';
import { uiEvent, newCanvas } from '../../extensions/slip/display.mjs';
import { createBridge } from '../../extensions/slip/bridge.mjs';
import { E, F } from '../../extensions/slip/records.mjs';

const yieldTo = fn => setImmediate(fn);
const CARDS = readFileSync(path.join(root, 'apps', 'Cards.st'), 'utf8');

function fakeNendo() {
  const store = { [E.object]: [] };
  let n = 0;
  return {
    store,
    has: () => true,
    schema: { describe: async () => ({ entities: [] }) },
    records: {
      queryAll: async ({ entityId }) => store[entityId] ?? [],
      create: async (entityId, values) => { const r = { entityId, recordId: `${entityId}.${++n}`, version: 1, values: { ...values } }; (store[entityId] ??= []).push(r); return r; },
      update: async (record, values) => { Object.assign(record.values, values); record.version++; return record; },
      delete: async record => { store[record.entityId] = store[record.entityId].filter(r => r !== record); },
    },
  };
}

/** An image with a display of 900 by 600, the bridge to a file in memory, and a World open. */
function setup({ dark = false, display = true, nendo = fakeNendo(), objects = new Map() } = {}) {
  const shown = { opened: 0 };
  const image = bootImage();
  const vm = image.vm;
  if (display) vm.hooks.display = { open: () => { shown.opened++; }, size: () => [900, 600], dark: () => dark };
  vm.hooks.request = createBridge(vm, { nendo, objects, canKeep: () => true });
  const world = () => vm.globalBinding('World').f[1];
  /** Hands the World one event; answers the operations it drew, or null when it did not draw. */
  const event = async (type, x = 0, y = 0, options = {}) => {
    const canvas = newCanvas(vm);
    const outcome = await image.send(world(), 'handle:on:', [uiEvent(vm, type, x, y, options), canvas], { yieldTo });
    if (outcome.error) throw outcome.error;
    if (outcome.suspended) throw new Error(`stopped: ${vm.exceptionText(outcome.suspended.suspended.exception)}`);
    return outcome.value === true ? canvas.ops : null;
  };
  const run = async source => {
    const outcome = await image.evaluate(source, { yieldTo });
    if (outcome.suspended) return `stopped: ${vm.exceptionText(outcome.suspended.suspended.exception)}`;
    if (outcome.error) throw outcome.error;
    return image.printString(outcome.value);
  };
  const xy = source => { const [x, y] = image.print(source).split('@').map(Number); return [x, y]; };
  const click = async (x, y) => { await event('mouseDown', x, y); return event('mouseUp', x, y); };
  const type = async text => { for (const key of text) await event('keyDown', 0, 0, { key }); };
  return { image, vm, shown, nendo, objects, world, event, run, xy, click, type };
}

const texts = ops => ops.filter(op => op[0] === 'text').map(op => op[1]);

test('points, rectangles and colours do their arithmetic in Smalltalk', () => {
  const { image } = setup();
  assert.equal(image.print('(3 @ 4) + 1'), '4@5');
  assert.equal(image.print('(10 @ 20) - (3 @ 5) * 2'), '14@30');
  assert.equal(image.print('(3 @ 4) dist: 0 @ 0'), '5.0');
  assert.equal(image.print('(0 @ 0 extent: 10 @ 20) printString'), '\'0@0 corner: 10@20\'');
  assert.equal(image.print('((0 @ 0 corner: 10 @ 10) containsPoint: 10 @ 5)'), 'false', 'The corner is outside.');
  assert.equal(image.print('((0 @ 0 corner: 10 @ 10) insetBy: 2) = (2 @ 2 corner: 8 @ 8)'), 'true');
  assert.equal(image.print('(Color r: 0 g: 0 b: 0) lighter'), '(Color r: 64 g: 64 b: 64)');
  assert.equal(image.print('Color text = Color black'), 'false');
});

test('the theme colours follow the display\'s dark theme', () => {
  assert.equal(setup({ dark: true }).image.print('Color isDark'), 'true');
  assert.equal(setup({ dark: false }).image.print('Color isDark'), 'false');
  assert.notEqual(setup({ dark: true }).image.print('Color background'), setup().image.print('Color background'));
});

test('a morph made in one theme draws in the theme the display shows now', async () => {
  const theme = { dark: false };
  const image = bootImage();
  image.vm.hooks.display = { open: () => {}, size: () => [400, 300], dark: () => theme.dark };
  const draw = () => image.evaluateSync('| c | c := Canvas new. (Smalltalk at: #B) fullDrawOn: c. c').value.ops;
  image.evaluateSync('Smalltalk at: #B put: (ButtonMorph label: \'Go\' action: nil)');
  const light = draw();
  theme.dark = true;
  const dark = draw();
  assert.notEqual(dark[0][6], light[0][6], 'The button\'s colour follows the theme.');
  assert.equal(dark[0][6], image.print('Color accent').replace('(Color r: ', 'rgba(').replace(' g: ', ', ').replace(' b: ', ', ').replace(')', ', 1)'));
});

test('a Canvas collects drawing operations, and refuses a wrong argument by name', () => {
  const { image, vm } = setup();
  const canvas = image.evaluateSync('| c | c := Canvas new. c fillRect: (1 @ 2 extent: 30 @ 40) color: Color red; drawString: \'Hi\' at: 5 @ 6 size: 12 bold: true color: (Color r: 0 g: 0 b: 255 alpha: 0.5); clipTo: (0 @ 0 extent: 9 @ 9) during: [c line: 0 @ 0 to: 9 @ 9 color: Color black width: 2]. c').value;
  assert.deepEqual(canvas.ops, [
    ['fill', 1, 2, 30, 40, 'rgba(220, 38, 38, 1)'],
    ['text', 'Hi', 5, 6, 12, true, 'rgba(0, 0, 255, 0.5)'],
    ['clip', 0, 0, 9, 9],
    ['line', 0, 0, 9, 9, 'rgba(0, 0, 0, 1)', 2],
    ['unclip'],
  ]);
  assert.match(image.evaluateSync('Canvas new fillRect: 3 color: Color red').error.message, /fillRect:color: takes a Rect and a Color/);
  assert.equal(vm.classOf(canvas).name, 'Canvas');
});

test('a World opens only where there is a display', () => {
  const { image } = setup({ display: false });
  assert.match(image.evaluateSync('World open: Morph new').error.message, /There is no display here/);
  const shown = setup();
  assert.equal(shown.image.print('(World open: Morph new) world == World'), 'true');
  assert.equal(shown.shown.opened, 1);
  assert.equal(shown.image.print('World extent'), '900@600', 'The World takes the display\'s size.');
});

test('the World gives a click to the morph under it, the keyboard to the field clicked, and draws only when something changed', async () => {
  const { image, event, click, type } = setup();
  image.evaluateSync(`| b f |
    Smalltalk at: #Clicks put: 0.
    b := ButtonMorph label: 'Go' action: [Smalltalk at: #Clicks put: (Smalltalk at: #Clicks) + 1].
    World open: b. b position: 10 @ 10.
    f := TextFieldMorph new. f action: [:text | Smalltalk at: #Typed put: text].
    World open: f. f position: 10 @ 100`);
  assert.ok(texts(await event('redraw')).includes('Go'));
  assert.equal(await event('mouseMove', 500, 500), null, 'Nothing changed, so nothing is drawn.');
  await click(20, 20);
  assert.equal(image.print('Smalltalk at: #Clicks'), '1');
  await event('mouseDown', 20, 20);
  await event('mouseUp', 400, 400);
  assert.equal(image.print('Smalltalk at: #Clicks'), '1', 'A click let go outside the button does not fire it.');
  await click(20, 110);
  await type(['H', 'i', 'x', 'Backspace', '!']);
  const ops = await event('keyDown', 0, 0, { key: 'Enter' });
  assert.equal(image.print('Smalltalk at: #Typed'), '\'Hi!\'');
  assert.ok(ops, 'Enter changed the field, so the World drew.');
  await click(500, 500);
  assert.equal(image.print('World focus'), 'nil', 'A click on the World takes the keyboard away.');
});

test('a morph is dragged and dropped on one that wants it, or goes back where it was', async () => {
  const { image, event } = setup();
  image.evaluateSync(`Morph subclass: #Bin instanceVariableNames: 'got' classVariableNames: '' package: 'Test'.
    Bin compile: 'wantsDroppedMorph: m ^true'. Bin compile: 'acceptDroppedMorph: m event: e got := m. m delete'. Bin compile: 'got ^got'.
    Morph subclass: #Chip instanceVariableNames: '' classVariableNames: '' package: 'Test'.
    Chip compile: 'isDraggable ^true'.
    Smalltalk at: #TheBin put: (World open: Bin new). TheBin bounds: (400 @ 0 extent: 100 @ 100).
    Smalltalk at: #TheChip put: (World open: Chip new). TheChip bounds: (0 @ 0 extent: 50 @ 50)`);
  await event('mouseDown', 10, 10);
  assert.equal(image.print('World grabbed == TheChip'), 'true');
  await event('mouseMove', 210, 10);
  assert.equal(image.print('TheChip position'), '200@0', 'The chip follows the pointer.');
  await event('mouseUp', 210, 10);
  assert.equal(image.print('TheChip position'), '0@0', 'Dropped on nothing that wants it, it goes back.');
  assert.equal(image.print('TheChip owner == World'), 'true');
  await event('mouseDown', 10, 10);
  await event('mouseMove', 420, 20);
  await event('mouseUp', 420, 20);
  assert.equal(image.print('TheBin got == TheChip'), 'true');
  assert.equal(image.print('TheChip owner'), 'nil');
});

test('the World steps the morphs that want it', async () => {
  const { image, event } = setup();
  image.evaluateSync(`Morph subclass: #Ticker instanceVariableNames: 'n' classVariableNames: '' package: 'Test'.
    Ticker compile: 'wantsSteps ^true'. Ticker compile: 'step n := (n ifNil: [0]) + 1'. Ticker compile: 'n ^n'.
    Smalltalk at: #T put: (World open: Ticker new)`);
  await event('step');
  await event('step');
  assert.equal(image.print('T n'), '2');
});

// ---- Cards

async function cards(options) {
  const s = setup(options);
  const result = s.image.fileIn(CARDS, 'Cards.st');
  assert.deepEqual(result.errors, []);
  assert.equal(await s.run('CardsBoard open. World submorphs size'), '1');
  s.board = 'World submorphs first';
  s.state = () => s.image.print(`${s.board} state`);
  s.kept = () => s.nendo.store[E.object].find(r => r.values[F.object.name] === 'cards')?.values[F.object.ston];
  return s;
}

test('Cards opens with its sample cards, in three columns that fill the World', async () => {
  const s = await cards();
  assert.equal(s.state(), '#(#(\'Drag this card to Doing\' \'Add a card: type it above, then press Enter\') #(\'Read CardsBoard in the Browser\') #(\'Open the Cards board\'))');
  const ops = await s.event('redraw');
  for (const text of ['Cards', 'To do  2', 'Doing  1', 'Done  1', 'Drag this card to Doing']) assert.ok(texts(ops).includes(text), `It draws ${text}.`);
  assert.equal(s.image.print(`${s.board} bounds`), '0@0 corner: 900@600');
  assert.equal(s.image.print(`${s.board} columns last right`), '883');
  await s.event('resize', 600, 400);
  assert.equal(s.image.print(`${s.board} bounds`), '0@0 corner: 600@400', 'It follows the World\'s size.');
});

test('a card typed and entered is added to To do, and the board is kept in the file', async () => {
  const s = await cards();
  const [fx, fy] = s.xy(`(${s.board} submorphs detect: [:m | m isKindOf: TextFieldMorph]) center`);
  await s.click(fx, fy);
  await s.type(['B', 'u', 'y', ' ', 'm', 'i', 'l', 'k']);
  await s.event('keyDown', 0, 0, { key: 'Enter' });
  assert.match(s.state(), /^#\(#\('Drag this card to Doing' 'Add a card: type it above, then press Enter' 'Buy milk'\)/);
  assert.match(s.kept(), /'Buy milk'/, 'The board is kept as STON in an st.object record.');
  assert.ok(texts(await s.event('redraw')).includes('Kept in this file.'));
  await s.event('redraw');
  s.image.evaluateSync(`${s.board} instVarAt: 9 put: 0`);
  await s.event('step');
  assert.ok(!texts(await s.event('redraw')).includes('Kept in this file.'), 'The note goes once its time is up.');
});

test('a card dragged to another column moves there, at the place it was dropped, and is kept', async () => {
  const s = await cards();
  const [cx, cy] = s.xy(`${s.board} columns first cards first center`);
  const [dx] = s.xy(`${s.board} columns second center`);
  const [, top] = s.xy(`${s.board} columns second cards first center`);
  await s.event('mouseDown', cx, cy);
  await s.event('mouseMove', dx, top - 30);
  await s.event('mouseUp', dx, top - 30);
  assert.equal(s.state(), '#(#(\'Add a card: type it above, then press Enter\') #(\'Drag this card to Doing\' \'Read CardsBoard in the Browser\') #(\'Open the Cards board\'))');
  assert.match(s.kept(), /\['Drag this card to Doing','Read CardsBoard in the Browser'\]/);
  assert.equal(s.image.print(`${s.board} columns second cards first top`), s.image.print(`${s.board} columns first cards first top`), 'The column laid its cards out again.');
});

test('x removes a card; a board opened again reads what was kept', async () => {
  const nendo = fakeNendo(), objects = new Map();
  const s = await cards({ nendo, objects });
  const [bx, by] = s.xy(`(${s.board} columns last cards first submorphs first) center`);
  await s.click(bx, by);
  assert.equal(s.state(), '#(#(\'Drag this card to Doing\' \'Add a card: type it above, then press Enter\') #(\'Read CardsBoard in the Browser\') #())');
  const again = await cards({ nendo, objects });
  assert.equal(again.state(), s.state(), 'A new image reads the kept board.');
});

test('a board that cannot be kept says so, and goes on working', async () => {
  const s = setup();
  s.vm.hooks.request = createBridge(s.vm, { nendo: fakeNendo(), objects: new Map(), canKeep: () => false });
  s.image.fileIn(CARDS, 'Cards.st');
  await s.run('CardsBoard open');
  await s.run('World submorphs first addCard: \'One more\'');
  assert.match(s.image.print('World submorphs first state'), /'One more'/);
  assert.match(texts(await s.event('redraw')).join('\n'), /Not kept: .*cannot keep objects yet/);
});
