// The package Slip.nendo carries, and what the builder sends.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { packageFiles, buildMutations, upgradeMutations, exampleRecords, skillFile, FILE_BOUND, PACKAGE_BOUND, PACKAGE_ID, PACKAGE_FOLDER, SKILL_ID } from './definition.mjs';
import { KERNEL_FILES } from '../../extensions/slip/vm/image.mjs';
import { E, CORE, schemaOperations } from '../../extensions/slip/records.mjs';
import { SETTING } from '../../extensions/slip/agent.mjs';

test('the package keeps to the view contract\'s bounds', async () => {
  const { manifest, files } = await packageFiles();
  assert.equal(manifest.packageId, PACKAGE_ID);
  for (const file of files) assert.ok(file.bytes.length <= FILE_BOUND, `${file.path} is ${file.bytes.length} bytes.`);
  const total = files.reduce((n, f) => n + f.bytes.length, 0);
  assert.ok(total <= PACKAGE_BOUND, `The package is ${total} bytes.`);
});

test('the package carries every kernel file the image loads, and every module the view imports', async () => {
  const { files } = await packageFiles();
  const paths = new Set(files.map(f => f.path));
  for (const name of KERNEL_FILES) assert.ok(paths.has(`kernel/${name}`), `kernel/${name} is missing.`);
  const seen = new Set(), queue = ['slip.mjs'];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    assert.ok(paths.has(file), `${file} is imported but not in the package.`);
    const source = readFileSync(path.join(PACKAGE_FOLDER, file), 'utf8');
    for (const [, spec] of source.matchAll(/^import[^'"]*['"](\.[^'"]+)['"]/gm)) queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)));
  }
});

test('the view loads Nendo\'s API and its own module, and nothing from the network', () => {
  const page = readFileSync(path.join(PACKAGE_FOLDER, 'index.html'), 'utf8');
  assert.match(page, /<html lang="en">/);
  assert.match(page, /<script src="\/_nendo\/api\.js"><\/script>/);
  assert.match(page, /<script type="module" src="slip\.mjs"><\/script>/);
  assert.doesNotMatch(page, /https?:\/\//);
});

test('the examples file in and work', async () => {
  const { image, records } = await exampleRecords();
  assert.equal(image.print('(Stack new push: 1; push: 2; yourself) pop'), '2');
  assert.equal(image.print('Stack new push: 1; push: 2; yourself'), 'a Stack#(1 2)');
  assert.equal(image.print('(Rectangle width: 2 height: 3) area'), '6');
  assert.equal(image.print('(1 to: 500) select: [:n | n isPerfect]'), '#(6 28 496)');
  assert.equal(image.print('(Rectangle width: 1 height: 2) < (Circle radius: 1)'), 'true');
  const classes = records.filter(r => r.entityId === E.cls).map(r => r.values['st.class.name']).sort();
  assert.deepEqual(classes, ['Circle', 'Rectangle', 'Shape', 'Stack']);
  assert.ok(records.some(r => r.entityId === E.method && r.values['st.method.className'] === 'Integer'), 'A method added to a kernel class is kept.');
  assert.equal(new Set(records.map(r => r.recordId)).size, records.length, 'Record IDs are unique.');
});

test('the build sends the package, the view and the examples in calls of at most 12', async () => {
  const { definition, data, files } = await buildMutations();
  for (const mutation of [...definition, ...data]) assert.ok(mutation.operations.length <= 12);
  const operations = definition.flatMap(m => m.operations);
  const puts = new Set(operations.filter(o => o.operationType === 'extension.putFile' && o.payload.packageId === PACKAGE_ID).map(o => o.payload.path));
  assert.deepEqual([...puts].sort(), files.map(f => f.path));
  assert.ok(operations.some(o => o.operationType === 'extension.putFile' && o.payload.packageId === SKILL_ID && o.payload.path === 'SKILL.md'), 'The file carries its skill.');
  assert.ok(operations.some(o => o.operationType === 'ui.addNode' && o.payload.properties.opensFile === true && o.payload.properties.packageId === PACKAGE_ID));
  assert.ok(operations.length <= 128 && data.flatMap(m => m.operations).length <= 128, 'Each change set carries at most 128 operations.');
});

test('a required field travels in the same mutation as the creation of its record type', async () => {
  // The host refuses a required schema.addField for a record type an earlier mutation made (NPROP004).
  const { definition } = await buildMutations();
  for (const mutation of definition)
    for (const operation of mutation.operations)
      if (operation.operationType === 'schema.addField' && operation.payload.required)
        assert.ok(mutation.operations.some(o => o.operationType === 'schema.createEntity' && o.payload.entityId === operation.payload.entityId),
          `${operation.payload.fieldId} is required but is not in the mutation that creates ${operation.payload.entityId} ("${mutation.description}").`);
  for (const mutation of definition) assert.ok(mutation.operations.length <= 16, `"${mutation.description}" holds ${mutation.operations.length} operations; a call carries 16.`);
});

test('the package declares the agent setting, off by default and kept on each computer', async () => {
  const { manifest } = await packageFiles();
  const setting = manifest.settings.find(s => s.id === SETTING);
  assert.ok(setting, 'The package declares agentEvaluations.');
  assert.deepEqual([setting.type, setting.default, setting.layers], ['toggle', false, 'personal']);
  // The host's rules for a declaration (ADR-0038): id, title of 1 to 120, help of at most 500.
  assert.match(setting.id, /^[a-z][a-zA-Z0-9_.-]{0,63}$/);
  assert.ok(setting.title.length <= 120 && setting.help.length <= 500);
  const { definition } = await buildMutations();
  const set = definition.flatMap(m => m.operations).find(o => o.operationType === 'extension.setPackage' && o.payload.packageId === PACKAGE_ID);
  assert.deepEqual(set.payload.settings, manifest.settings, 'The build declares the settings the manifest does.');
});

test('the skill opens with the frontmatter Nendo requires, named after its package', async () => {
  const text = (await skillFile()).bytes.toString('utf8');
  const front = /^---\nname: ([^\n]+)\ndescription: ([^\n]+)\n---\n/.exec(text);
  assert.ok(front, 'SKILL.md opens with name and description between --- lines.');
  assert.equal(front[1], SKILL_ID.split('.').at(-1));
  assert.match(front[1], /^[a-z0-9]+(-[a-z0-9]+)*$/);
  assert.ok(front[2].length >= 1 && front[2].length <= 1024);
  for (const entityId of Object.values(E)) assert.ok(text.includes(`\`${entityId}\``), `The skill names ${entityId}.`);
});

test('an upgrade adds the record types a file lacks, the skill, and only the changed files', async () => {
  const { files, manifest } = await packageFiles();
  const held = { version: '0.3.0', files: files.filter(f => f.path !== 'agent.mjs').map(f => ({ path: f.path, sha256: f.path === 'slip.mjs' ? 'old' : f.sha256 })).concat([{ path: 'gone.js', sha256: 'x' }]) };
  const describe = operations => ({ entities: operations.filter(o => o.operationType === 'schema.createEntity').map(o => ({ entityId: o.payload.entityId,
    fields: operations.filter(f => f.operationType === 'schema.addField' && f.payload.entityId === o.payload.entityId).map(f => ({ fieldId: f.payload.fieldId })) })) });
  const { mutations, changed, removed, types, version } = await upgradeMutations(held, { schema: describe(schemaOperations({ only: CORE })) });
  assert.equal(version, manifest.version);
  assert.deepEqual(types.sort(), [E.evaluation, E.object].sort());
  assert.deepEqual(changed.sort(), ['agent.mjs', 'slip.mjs', `${SKILL_ID}/SKILL.md`].sort());
  assert.deepEqual(removed, ['gone.js']);
  const operations = mutations.flatMap(m => m.operations);
  assert.ok(operations.find(o => o.payload.path === 'slip.mjs' && o.payload.expectedSha256 === 'old'), 'A changed file is put over the content it replaces.');
  assert.ok(operations.find(o => o.payload.path === 'agent.mjs' && o.payload.expectedSha256 === 'absent'));
  for (const mutation of mutations) for (const operation of mutation.operations)
    if (operation.operationType === 'schema.addField' && operation.payload.required)
      assert.ok(mutation.operations.some(o => o.operationType === 'schema.createEntity' && o.payload.entityId === operation.payload.entityId));
  const again = await upgradeMutations({ version: manifest.version, files: files.map(f => ({ path: f.path, sha256: f.sha256 })) },
    { heldSkill: { files: [{ path: 'SKILL.md', sha256: (await skillFile()).sha256 }] }, schema: describe(schemaOperations()) });
  assert.deepEqual([again.changed, again.removed, again.types], [[], [], []], 'An up-to-date file needs nothing.');
});
