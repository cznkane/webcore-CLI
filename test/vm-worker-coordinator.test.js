import test from 'node:test';
import assert from 'node:assert/strict';
import { VmApprovalLedger } from '../server/vm-approval-ledger.js';
import { createVmWorkerCoordinator } from '../server/vm-worker-coordinator.js';
const digest = 'a'.repeat(64);
const make = () => {
  const ledger = new VmApprovalLedger();
  const events = [];
  const coordinator = createVmWorkerCoordinator({ ledger, releaseSha256: digest, audit: async e => events.push(e.outcome) });
  const approvalId = ledger.issue({ operation: 'run_webcore_tests', releaseSha256: digest });
  const request = { approvalId, operation: 'run_webcore_tests', releaseSha256: digest };
  return { ledger, events, coordinator, approvalId, request };
};
test('approved operation runs once and audits metadata', async () => {
  const x = make();
  let invoked = 0;
  const result = await x.coordinator.execute(x.request, { approvedId: x.approvalId, perform: async command => {
    invoked++;
    assert.deepEqual(command.args, ['--test']);
    return { ok: true, secret: 'never-return' };
  } });
  assert.deepEqual(result, { operation: 'run_webcore_tests', ok: true });
  assert.equal(invoked, 1);
  assert.deepEqual(x.events, ['approved', 'started', 'succeeded']);
  await assert.rejects(x.coordinator.execute(x.request, { approvedId: x.approvalId, perform: async () => ({ ok: true }) }), /Approval unavailable/);
});
test('audit failure blocks execution', async () => {
  const x = make();
  const coordinator = createVmWorkerCoordinator({ ledger: x.ledger, releaseSha256: digest, audit: async () => { throw new Error('audit offline'); } });
  let invoked = false;
  await assert.rejects(coordinator.execute(x.request, { approvedId: x.approvalId, perform: async () => { invoked = true; } }), /audit offline/);
  assert.equal(invoked, false);
});
test('invalid approval blocks execution', async () => {
  const x = make();
  let invoked = false;
  await assert.rejects(x.coordinator.execute(x.request, { approvedId: 'invalid', perform: async () => { invoked = true; } }), /Trusted approval/);
  assert.equal(invoked, false);
});
