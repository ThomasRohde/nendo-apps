// An agent's evaluations: st.evaluation records an agent writes over MCP, which the open Slip
// runs and answers in the same record. They run on their own only when the person turned on
// the package's setting (off by default); until then each waits in a queue the Workspace shows,
// with Run and Decline. No page here: the view draws the queue, and the tests drive it.
import { E, F, STATE } from './records.mjs';

export const SETTING = 'agentEvaluations';
const RESULT_LENGTH = 20000;
const cut = text => text.length > RESULT_LENGTH ? `${text.slice(0, RESULT_LENGTH)}…` : text;

/** Whether an evaluation record waits to run: its state is waiting, or not set. */
export const isWaiting = record => (record.values?.[F.evaluation.state] ?? STATE.waiting) === STATE.waiting || record.values?.[F.evaluation.state] === '';

/** The values that answer an evaluation: done with its printString, or failed with the error. */
export function answerValues(image, outcome, output) {
  const vm = image.vm;
  if (outcome.suspended) vm.endAsError(outcome.suspended);
  const proc = outcome.suspended ?? outcome;
  const error = proc.error ?? outcome.error;
  if (error) return { [F.evaluation.state]: STATE.failed, [F.evaluation.result]: cut([error.message, ...(error.trace ?? [])].join('\n')), [F.evaluation.output]: cut(output) };
  return { [F.evaluation.state]: STATE.done, [F.evaluation.result]: cut(image.printString(outcome.value, 1000)), [F.evaluation.output]: cut(output) };
}

/**
 * env: { nendo, image(), evaluate(source) -> promise of an outcome (the view tracks it, so Stop
 * reaches it), capture(on) -> the Transcript text written while on, allowed() -> the setting,
 * changed() }. take() is given the file's evaluation records whenever they are read.
 */
export function createAgentQueue(env) {
  let waiting = [];          // records that wait, oldest first
  const busy = new Set();    // record IDs being run or answered
  let draining = false;

  function take(records) {
    waiting = records.filter(r => isWaiting(r) && !busy.has(r.recordId))
      .sort((a, b) => String(a.recordId).localeCompare(String(b.recordId)));
    env.changed();
    if (env.allowed()) drain();
  }

  async function drain() {
    if (draining) return;
    draining = true;
    try { while (env.allowed() && waiting.length) await run(waiting[0]); }
    finally { draining = false; }
  }

  async function run(record) {
    if (busy.has(record.recordId)) return;
    busy.add(record.recordId);
    waiting = waiting.filter(r => r.recordId !== record.recordId);
    env.changed();
    try {
      env.capture(true);
      let outcome, output;
      try { outcome = await env.evaluate(String(record.values[F.evaluation.source] ?? '')); }
      finally { output = env.capture(false); }
      await env.nendo.records.update(record, answerValues(env.image(), outcome, output));
    } catch (error) {
      env.say?.(`Slip could not answer the agent's evaluation: ${error.message}`);
    } finally { busy.delete(record.recordId); env.changed(); }
  }

  async function decline(record) {
    if (busy.has(record.recordId)) return;
    busy.add(record.recordId);
    waiting = waiting.filter(r => r.recordId !== record.recordId);
    env.changed();
    try { await env.nendo.records.update(record, { [F.evaluation.state]: STATE.declined }); }
    catch (error) { env.say?.(`Slip could not decline it: ${error.message}`); }
    finally { busy.delete(record.recordId); env.changed(); }
  }

  return { take, run, decline, drain, get waiting() { return waiting; }, get running() { return busy.size > 0; }, entityId: E.evaluation };
}
