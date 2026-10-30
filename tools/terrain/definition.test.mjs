// The shape of a Terrain file: every stage fits a change set, every field the model names is
// declared, the package's settings are the validator's rules, and the demo is the corpus.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STAGES, STAGE_ORDER, PACKAGE_ID, PACKAGE_FOLDER, DEMO_MAPS, demoRecords, demoOperations, fixture, packageFiles } from './definition.mjs';
import { E, F, REFERENCES, NUMBER_FIELDS, CREATE_ORDER } from '../../extensions/terrain/model.mjs';
import { RULES } from '../../extensions/terrain/validate.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaOps = () => STAGES.schema.mutations().flatMap(m => m.operations);

test('each stage fits a change set, and each mutation a call', async () => {
  for (const name of STAGE_ORDER) {
    const mutations = await STAGES[name].mutations({ applicationId: 'app', read: {} });
    const total = mutations.reduce((n, m) => n + m.operations.length, 0);
    assert.ok(mutations.every(m => m.operations.length <= 16), `${name}: a mutation over 16 operations`);
    assert.ok(total <= 128, `${name}: ${total} operations, over 128`);
    assert.ok(mutations.every(m => m.operations.every(o => !o.operationType.startsWith('data.')) || m.operations.every(o => o.operationType.startsWith('data.'))), `${name}: data and definition share a mutation`);
  }
});

test('every field the model names is declared, numbers as Decimal and references bound to their type', () => {
  const fields = new Map(schemaOps().filter(o => o.operationType === 'schema.addField').map(o => [o.payload.fieldId, o.payload]));
  const bound = new Map(schemaOps().filter(o => o.operationType === 'schema.configureReference').map(o => [o.payload.fieldId, o.payload.targetEntityId]));
  assert.deepEqual(schemaOps().filter(o => o.operationType === 'schema.createEntity').map(o => o.payload.entityId).sort(), Object.values(E).sort());
  for (const [entity, ids] of Object.entries(F)) for (const id of Object.values(ids)) assert.ok(fields.has(id), `${entity}: ${id} is not declared`);
  for (const id of NUMBER_FIELDS) assert.equal(fields.get(id).storageKind, 'Decimal', id);
  for (const [entityId, refs] of Object.entries(REFERENCES)) for (const [fieldId, target] of Object.entries(refs)) {
    assert.equal(fields.get(fieldId).storageKind, 'Reference', fieldId);
    assert.equal(bound.get(fieldId), target, `${entityId}: ${fieldId} is not bound to ${target}`);
  }
  assert.deepEqual([...CREATE_ORDER].sort(), Object.values(E).sort());
});

test('the package declares one setting for each validator rule, and the view reads them by that name', async () => {
  const { manifest, files } = await packageFiles(PACKAGE_FOLDER);
  assert.equal(manifest.packageId, PACKAGE_ID);
  const checks = manifest.settings.filter(s => s.id.startsWith('check.')).map(s => s.id.slice(6));
  assert.deepEqual(checks, RULES.map(r => r.id));
  assert.ok(files.some(f => f.path === 'kit/nendo-view-kit.js'));
  const view = await fs.readFile(path.join(PACKAGE_FOLDER, 'view.mjs'), 'utf8');
  assert.match(view, /state\.settings\[`check\.\$\{id\}`\]/);
});

test('the demo is every corpus map in one landscape, each component once, every reference to an earlier record', () => {
  const records = demoRecords();
  assert.equal(records.filter(r => r.entityId === E.map).length, DEMO_MAPS.length);
  const names = records.filter(r => r.entityId === E.component).map(r => r.values[F.component.name]);
  assert.equal(new Set(names).size, names.length);
  for (const shared of ['Delivery tracking', 'Identity', 'Compute']) assert.ok(names.includes(shared), shared);
  const seen = new Set();
  for (const record of records) {
    for (const fieldId of Object.keys(REFERENCES[record.entityId])) {
      const target = record.values[fieldId];
      if (target) assert.ok(seen.has(target), `${record.recordId} points at ${target} before it is made`);
    }
    seen.add(record.recordId);
  }
  assert.equal(demoOperations().length, records.length);
  const f = fixture();
  assert.equal(Object.values(f.records).flat().length, records.length);
  assert.ok(f.records[E.placement].every(r => typeof r.values[F.placement.visibility] === 'number' && typeof r.exact[F.placement.visibility] === 'string'));
});

test('the tea shop keeps its credit', async () => {
  const tea = await fs.readFile(path.join(here, 'corpus', 'tea-shop.owm'), 'utf8');
  assert.match(tea, /Simon Wardley.*CC BY-SA 4\.0/);
});
