// Terrain's pure modules: the round trip of every corpus map, where a component stands on a date,
// what a commit sends, the validator's rules, and the text pane's edits. tools/Review-Terrain.ps1
// runs every *.test.mjs here.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { E, F, decimal, mapView, assessedEvolution, difference, commitPlan, copy, move, confirm, addComponent, addLink, BATCH_LIMIT } from '../../extensions/terrain/model.mjs';
import { parse, parseLine, print, applyText, importMap } from '../../extensions/terrain/owm.mjs';
import { validate } from '../../extensions/terrain/validate.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const corpus = fs.readdirSync(path.join(here, 'corpus')).filter(f => f.endsWith('.owm')).sort()
  .map(name => ({ name, text: fs.readFileSync(path.join(here, 'corpus', name), 'utf8') }));
const counter = () => { let n = 0; return entityId => `${entityId}.r.t${(n += 1)}`; };
const TODAY = '2026-10-30';
const imported = (text, working = new Map(), ids = counter()) => {
  const result = importMap(working, new Map(), text, { today: TODAY, ids });
  assert.equal(result.errors, undefined, JSON.stringify(result.errors));
  return result;
};
/** Records as plain data, to compare two copies. */
const plain = records => JSON.stringify([...records.values()].map(r => [r.recordId, r.entityId, Object.entries(r.values).sort()]).sort());

test('the corpus is there: the tea shop and the three Northstar maps', () => {
  assert.deepEqual(corpus.map(c => c.name), ['customer-care.owm', 'identity.owm', 'order-to-delivery.owm', 'tea-shop.owm']);
});

test('round trip: text to records to text to records gives the same records, and a second print the same bytes', () => {
  for (const { name, text } of corpus) {
    const first = imported(text);
    const printed = print(first.working, first.mapId);
    const second = imported(printed);
    assert.equal(plain(second.working), plain(first.working), `${name}: the records differ after a round trip`);
    assert.equal(print(second.working, second.mapId), printed, `${name}: a second print differs`);
  }
});

test('round trip: every line Terrain does not model comes back word for word, after the same line', () => {
  const meaning = line => JSON.stringify(parseLine(line ?? ''));
  for (const { name, text } of corpus) {
    const { working, mapId } = imported(text);
    const printed = print(working, mapId).split('\n');
    const original = text.split('\n');
    const kept = parse(text).lines.filter(l => l.kind === 'raw' && l.source.trim() !== '');
    assert.ok(kept.length >= 1, `${name} has no line to keep`);
    let from = 0;
    for (const line of kept) {
      const at = printed.indexOf(line.source, from);
      assert.ok(at >= 0, `${name}: "${line.source}" was dropped or moved before an earlier kept line`);
      assert.equal(meaning(printed[at - 1]), meaning(original[line.line - 2]), `${name}: "${line.source}" no longer follows the line it followed`);
      from = at + 1;
    }
  }
});

test('numbers stay exact: .38 prints as 0.38 and 0.630 as 0.63, never through a float', () => {
  assert.equal(decimal('.38'), '0.38');
  assert.equal(decimal('0.630'), '0.63');
  assert.equal(decimal({ $nendoNumber: '0.1' }), '0.1');
  assert.equal(decimal('-0'), '0');
  const { working, mapId } = imported('title T\ncomponent A [.38, 0.630]\n');
  assert.match(print(working, mapId), /component A \[0\.38, 0\.63\]/);
});

test('a map the text pane cannot read is refused by its line, and nothing is applied', () => {
  const { errors } = parse('title T\ncomponent A [0.5]\ncomponent B [0.2, 0.3]\ncomponent B [0.1, 0.1]\nA->B\nB->A\n');
  assert.deepEqual(errors.map(e => e.line), [2, 4, 6]);
});

// ---------------------------------------------------------------- time

test('as of a date: the latest Accepted assessment on or before it; Proposed and Rejected never count', () => {
  const records = new Map();
  const add = (recordId, date, evolution, status) => records.set(recordId, { entityId: E.assessment, recordId, version: 1, values: {
    [F.assessment.component]: 'c', [F.assessment.date]: date, [F.assessment.evolution]: evolution, [F.assessment.status]: status } });
  add('a1', '2026-02-10', '0.3', 'Accepted');
  add('a2', '2026-06-02', '0.48', 'Accepted');
  add('a3', '2026-10-20', '0.56', 'Proposed');
  add('a4', '2026-09-01', '0.9', 'Rejected');
  const cases = [['2026-01-01', null], ['2026-05-01', '0.3'], ['2026-06-02', '0.48'], ['2026-07-01', '0.48'], ['2026-10-30', '0.48']];
  for (const [date, expected] of cases) assert.equal(assessedEvolution(records, 'c', date), expected, date);
});

// ---------------------------------------------------------------- commit

test('two drags of one component commit as one field set, and a commit over 200 writes is refused before any request', () => {
  const { working: committed, mapId } = imported(corpus.find(c => c.name === 'tea-shop.owm').text);
  for (const r of committed.values()) r.version = 1;
  const working = copy(committed);
  const kettle = mapView(working, mapId).items.find(i => i.name === 'Kettle');
  move(working, kettle.placementId, '0.4', '0.5');
  move(working, kettle.placementId, '0.42', '0.55');
  const writes = difference(committed, working);
  assert.equal(writes.length, 1, JSON.stringify(writes));
  assert.deepEqual(writes[0], { op: 'update', entityId: E.placement, recordId: kettle.placementId, version: 1,
    values: { [F.placement.visibility]: { $nendoNumber: '0.42' }, [F.placement.evolution]: { $nendoNumber: '0.55' } } });
  const big = copy(committed);
  const ids = counter();
  for (let i = 0; i < 100; i += 1) addComponent(big, mapId, { name: `Extra ${i}`, visibility: '0.5', evolution: '0.5' }, e => `x.${ids(e)}`);
  const plan = commitPlan(committed, big);
  assert.equal(plan.writes.length, 200);
  assert.equal(plan.refused, null);
  addComponent(big, mapId, { name: 'One too many', visibility: '0.5', evolution: '0.5' }, e => `y.${ids(e)}`);
  const over = commitPlan(committed, big);
  assert.ok(over.writes.length > BATCH_LIMIT && /at most 200/.test(over.refused), over.refused);
});

test('a commit creates before it points, and names the version of every record it points at', () => {
  const { working: committed, mapId } = imported('title T\nanchor U [0.9, 0.5]\ncomponent A [0.5, 0.5]\nU->A\n');
  for (const r of committed.values()) r.version = 3;
  const working = copy(committed);
  const { componentId } = addComponent(working, mapId, { name: 'B', visibility: '0.3', evolution: '0.7' }, counter());
  const a = mapView(working, mapId).items.find(i => i.name === 'A').componentId;
  addLink(working, a, componentId, e => `${e}.r.link`);
  const writes = difference(committed, working);
  assert.deepEqual(writes.map(w => w.entityId), [E.component, E.placement, E.link]);
  assert.deepEqual(writes[1].targetVersions, { [F.placement.map]: 3 });
  assert.deepEqual(writes[2].targetVersions, { [F.link.from]: 3 });
});

test('confirm turns drawn positions into Accepted assessments dated today, and the map follows the landscape again', () => {
  const { working, mapId } = imported('title T\ncomponent A [0.5, 0.4]\n');
  const item = mapView(working, mapId).items[0];
  move(working, item.placementId, '0.5', '0.6');
  assert.equal(mapView(working, mapId).items[0].unconfirmed, true);
  assert.equal(confirm(working, mapId, '2026-11-01', {}, counter()), 1);
  const after = mapView(working, mapId).items[0];
  assert.equal(after.unconfirmed, false);
  assert.equal(after.evolution, '0.6');
  assert.equal(after.drawn, null);
});

// ---------------------------------------------------------------- the text pane

test('a typed line makes the same waiting edit as the matching drag', () => {
  const { working: committed, mapId } = imported(corpus.find(c => c.name === 'tea-shop.owm').text);
  const dragged = copy(committed);
  const kettle = mapView(dragged, mapId).items.find(i => i.name === 'Kettle');
  move(dragged, kettle.placementId, '0.43', '0.5');
  const typed = applyText(committed, committed, mapId, print(committed, mapId).replace('component Kettle [0.43, 0.35]', 'component Kettle [0.43, 0.5]'), { today: TODAY, ids: counter() });
  assert.equal(typed.errors, undefined);
  assert.deepEqual(difference(committed, typed.working), difference(committed, dragged));
});

test('a changed name on a line whose numbers stayed the same is a rename; a new name with new numbers is a new component', () => {
  const { working: committed, mapId } = imported('title T\nanchor U [0.9, 0.5]\ncomponent Kettle [0.4, 0.3]\nU->Kettle\n');
  const renamed = applyText(committed, committed, mapId, 'title T\nanchor U [0.9, 0.5]\ncomponent Electric kettle [0.4, 0.3]\nU->Electric kettle\n', { today: TODAY, ids: counter() });
  const writes = difference(committed, renamed.working);
  assert.deepEqual(writes.map(w => [w.op, w.entityId]), [['update', E.component]]);
  assert.deepEqual(writes[0].values, { [F.component.name]: 'Electric kettle' });
  const replaced = applyText(committed, committed, mapId, 'title T\nanchor U [0.9, 0.5]\ncomponent Teapot [0.4, 0.35]\nU->Teapot\n', { today: TODAY, ids: counter() });
  const ops = difference(committed, replaced.working).map(w => `${w.op} ${w.entityId}`);
  assert.ok(ops.includes(`create ${E.component}`) && ops.includes(`delete ${E.placement}`), ops.join(', '));
});

test('one landscape: a name another map shows places that record, and import never moves another map', () => {
  let working = new Map();
  const ids = counter();
  const first = imported(corpus.find(c => c.name === 'order-to-delivery.owm').text, working, ids);
  working = first.working;
  const before = print(working, first.mapId);
  const second = imported(corpus.find(c => c.name === 'customer-care.owm').text, working, ids);
  const tracking = [...second.working.values()].filter(r => r.entityId === E.component && r.values[F.component.name] === 'Delivery tracking');
  assert.equal(tracking.length, 1, 'Delivery tracking is two records');
  // A link is the landscape's, so the first map draws the one the second adds; nothing on it moves.
  const positions = text => text.split('\n').filter(l => /^(anchor|component) /.test(l)).join('\n');
  assert.equal(positions(print(second.working, first.mapId)), positions(before), 'importing a map moved or changed a component of another one');
  // Identity stands at 0.62 on both, so neither draws it hollow.
  assert.equal(mapView(second.working, second.mapId).byComponent.get(tracking[0].recordId).unconfirmed, false);
});

test('a link removed from the text is hidden on this map when another map still draws it, deleted otherwise', () => {
  const ids = counter();
  const a = imported('title A\nanchor U [0.9, 0.5]\ncomponent X [0.5, 0.5]\nU->X\n', new Map(), ids);
  const b = imported('title B\nanchor U [0.9, 0.5]\ncomponent X [0.5, 0.5]\nU->X\n', a.working, ids);
  const committed = b.working;
  const edited = applyText(committed, committed, b.mapId, 'title B\nanchor U [0.9, 0.5]\ncomponent X [0.5, 0.5]\n', { today: TODAY, ids });
  const ops = difference(committed, edited.working).map(w => `${w.op} ${w.entityId}`);
  assert.deepEqual(ops, [`create ${E.hiddenLink}`, `update ${E.map}`]);
  assert.equal(mapView(edited.working, a.mapId).links.length, 1);
  const alone = imported('title C\nanchor V [0.9, 0.5]\ncomponent Y [0.5, 0.5]\nV->Y\n');
  const cut = applyText(alone.working, alone.working, alone.mapId, 'title C\nanchor V [0.9, 0.5]\ncomponent Y [0.5, 0.5]\n', { today: TODAY, ids: counter() });
  assert.equal([...cut.working.values()].filter(r => r.entityId === E.link).length, 0);
});

// ---------------------------------------------------------------- the validator

const FIXTURES = {
  cycle: ['title T\nanchor U [0.9, 0.5]\ncomponent A [0.6, 0.5]\ncomponent B [0.4, 0.5]\ncomponent C [0.4, 0.6]\nU->A\nA->B\nB->C\nC->A\n',
    'title T\nanchor U [0.9, 0.5]\ncomponent A [0.6, 0.5]\ncomponent B [0.4, 0.5]\nU->A\nA->B\n'],
  range: ['title T\nanchor U [0.9, 0.5]\ncomponent A [0.6, 1.2]\nU->A\n', 'title T\nanchor U [0.9, 0.5]\ncomponent A [0.6, 1]\nU->A\n'],
  upward: ['title T\nanchor U [0.9, 0.5]\ncomponent A [0.4, 0.5]\ncomponent B [0.6, 0.5]\nU->A\nA->B\n',
    'title T\nanchor U [0.9, 0.5]\ncomponent A [0.6, 0.5]\ncomponent B [0.4, 0.5]\nU->A\nA->B\n'],
  orphan: ['title T\nanchor U [0.9, 0.5]\ncomponent A [0.6, 0.5]\ncomponent B [0.4, 0.5]\nU->A\n',
    'title T\nanchor U [0.9, 0.5]\ncomponent A [0.6, 0.5]\ncomponent B [0.4, 0.5]\nU->A\nA->B\n'],
  'no-user': ['title T\ncomponent A [0.6, 0.5]\n', 'title T\nanchor U [0.9, 0.5]\ncomponent A [0.6, 0.5]\nU->A\n'],
};

test('each rule fires on its fixture and stays quiet on its twin', () => {
  for (const [rule, [fires, quiet]] of Object.entries(FIXTURES)) {
    const on = imported(fires), off = imported(quiet);
    assert.ok(validate(on.working, on.mapId).some(i => i.rule === rule), `${rule} did not fire on its fixture`);
    assert.deepEqual(validate(off.working, off.mapId).map(i => i.rule), [], `the twin of ${rule} is not quiet`);
  }
});

test('a rule turned off is not run', () => {
  const on = imported(FIXTURES.cycle[0]);
  assert.ok(validate(on.working, on.mapId).some(i => i.rule === 'cycle'));
  assert.ok(!validate(on.working, on.mapId, { enabled: id => id !== 'cycle' }).some(i => i.rule === 'cycle'));
});

test('the corpus maps are clean', () => {
  for (const { name, text } of corpus) {
    const { working, mapId } = imported(text);
    assert.deepEqual(validate(working, mapId).map(i => `${i.rule}: ${i.text}`), [], name);
  }
});
