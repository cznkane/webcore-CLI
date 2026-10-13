import test from 'node:test';
import assert from 'node:assert/strict';
import { VmWorkerGate, VmWorkerBusyError } from '../server/vm-worker-concurrency.js';

test('worker refuses concurrent execution and unlocks after success', async () => {
  const gate = new VmWorkerGate();
  let release;
  const first = gate.run(() => new Promise(resolve => { release = resolve; }));
  assert.equal(gate.busy, true);
  await assert.rejects(gate.run(async () => 'second'), VmWorkerBusyError);
  release('first');
  assert.equal(await first, 'first');
  assert.equal(gate.busy, false);
  assert.equal(await gate.run(async () => 'next'), 'next');
});
test('worker unlocks after failure', async () => {
  const gate = new VmWorkerGate();
  await assert.rejects(gate.run(async () => { throw new Error('failure'); }), /failure/);
  assert.equal(gate.busy, false);
});
test('worker rejects invalid tasks', async () => {
  const gate = new VmWorkerGate();
  await assert.rejects(gate.run(null), TypeError);
});
