// Author Slip into an empty, host-created file: its purpose, Slip's three record types, the
// package and the view that opens the file, then the example code and the Start here page.
// Two change sets, the app first. Accepts only with --accept, which the host serves at
// Unattended alone.
import crypto from 'node:crypto';
import { hostTool } from './host.mjs';
import { TITLE, PLANNERS, buildMutations } from './slip/definition.mjs';
const { createNendoMcpClient } = await hostTool('Nendo-McpClient.mjs');
const EXAMPLES_TITLE = 'Slip: the example classes and the Start here page';
const args = process.argv.slice(2), option = name => args[args.indexOf(name) + 1];
const { definition, data, files } = await buildMutations();
const count = mutations => mutations.reduce((n, m) => n + m.operations.length, 0);
console.log(`${count(definition)} definition operations, ${files.length} package files. Proposal: ${TITLE}`);
console.log(`${count(data)} example records. Proposal: ${EXAMPLES_TITLE}`);
if (args.includes('--dry-run')) process.exit(0);
if (!args.includes('--endpoint') || !/^http:\/\/127\.0\.0\.1:\d+\/mcp$/.test(option('--endpoint'))) throw Error('Name the new file host explicitly with --endpoint http://127.0.0.1:PORT/mcp.');
const client = createNendoMcpClient({ endpoint: option('--endpoint') }, 'nendo-slip-builder');
const read = async uri => JSON.parse((await client.rpc('resources/read', { uri })).contents[0].text);
const file = await read('nendo://application/manifest');
if (PLANNERS.includes(file.applicationId)) throw Error('Refused: this endpoint is a development planner.');
const examplesOnly = args.includes('--examples-only');
const entities = (await read('nendo://application/entities')).map(e => e.entityId ?? e);
if (!examplesOnly && entities.length) throw Error('Refused: build only into an empty, newly created Slip file.');
if (examplesOnly && !entities.includes('st.method')) throw Error('Refused: this file has no Slip record types yet. Build the app first.');
if ((await read('nendo://application/proposals')).length) throw Error('Refused: this file already has pending proposals.');

async function send(title, mutations) {
  const lease = await client.tool('nendo.lease.acquire', { idempotencyKey: crypto.randomUUID() }), owned = { applicationHandle: lease.applicationHandle, leaseId: lease.leaseId };
  try {
    const draft = await client.tool('nendo.change_set.begin', { ...owned, title, idempotencyKey: crypto.randomUUID() });
    for (const mutation of mutations)
      await client.tool('nendo.change_set.add_operations', { ...owned, changeSetId: draft.changeSetId, mutations: [mutation], idempotencyKey: crypto.randomUUID() });
    const result = await client.tool('nendo.change_set.validate', { ...owned, changeSetId: draft.changeSetId, idempotencyKey: crypto.randomUUID() });
    if (result.state !== 'previewable' || (result.diagnostics ?? []).some(d => d.severity !== 'warning')) throw Error(`Validation declined: ${JSON.stringify(result.diagnostics)}`);
    console.log(`Validated on the host's clone: ${result.operationCount} canonical operations, ${result.diagnostics.length} diagnostics.`);
    if (!args.includes('--accept')) { console.log(`Nothing is applied. Review and accept in Nendo: ${title}`); return false; }
    const accepted = await client.tool('nendo.change_set.accept', { ...owned, changeSetId: draft.changeSetId, idempotencyKey: crypto.randomUUID() });
    console.log(accepted.applied ? `Accepted: ${title}` : `Not applied (${accepted.state}). The proposal waits in Nendo: ${title}`);
    return accepted.applied === true;
  } finally { await client.tool('nendo.lease.release', owned); }
}

// The examples need the record types, so they follow only once the app is in the file.
if (examplesOnly) await send(EXAMPLES_TITLE, data);
else if (await send(TITLE, definition)) await send(EXAMPLES_TITLE, data);
else console.log('Accept the app first, then run this again with --examples-only to add the examples.');
