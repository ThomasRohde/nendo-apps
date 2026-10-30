// The package Slip.nendo carries, and what the builder sends.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { packageFiles, buildMutations, exampleRecords, FILE_BOUND, PACKAGE_BOUND, PACKAGE_ID, PACKAGE_FOLDER } from './definition.mjs';
import { KERNEL_FILES } from '../../extensions/slip/vm/image.mjs';
import { E } from '../../extensions/slip/records.mjs';

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
  const puts = new Set(operations.filter(o => o.operationType === 'extension.putFile').map(o => o.payload.path));
  assert.deepEqual([...puts].sort(), files.map(f => f.path));
  assert.ok(operations.some(o => o.operationType === 'ui.addNode' && o.payload.properties.opensFile === true && o.payload.properties.packageId === PACKAGE_ID));
  assert.ok(operations.length <= 128 && data.flatMap(m => m.operations).length <= 128, 'Each change set carries at most 128 operations.');
});
