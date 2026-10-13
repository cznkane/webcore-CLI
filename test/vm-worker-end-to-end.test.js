import test from 'node:test';
import assert from 'node:assert/strict';
import { VmApprovalLedger } from '../server/vm-approval-ledger.js';
import { createVmWorkerCoordinator } from '../server/vm-worker-coordinator.js';
import { performApprovedWorkerOperation } from '../server/vm-worker-driver.js';
import { syntaxCheckFiles } from '../server/vm-worker-syntax-plan.js';

const digest = 'd'.repeat(64);
const config = { nodeExecutable: 'C:\\Tools\\node.exe', checkoutDirectory: 'C:\\Staging\\release' };

test('one-use approval flows through coordinator into exact 11-file driver', async () => {
  const ledger = new VmApprovalLedger();
  const events = [];
  const calls = [];
  const coordinator = createVmWorkerCoordinator({ ledger, releaseSha256: digest, audit: async event => events.push(event.outcome) });
  const approvalId = ledger.issue({ operation: 'run_webcore_syntax_check', releaseSha256: digest });
  const request = { approvalId, operation: 'run_webcore_syntax_check', releaseSha256: digest };
  const options = { approvedId: approvalId, perform: command => performApprovedWorkerOperation(command, config, {
    run: async spec => { calls.push(spec); return { ok: true, exitCode: 0 }; }
  }) };
  assert.deepEqual(await coordinator.execute(request, options), { operation: 'run_webcore_syntax_check', ok: true });
  assert.deepEqual(calls.map(c => c.args), syntaxCheckFiles.map(file => ['--check', file]));
  assert.deepEqual(events, ['approved', 'started', 'succeeded']);
  await assert.rejects(coordinator.execute(request, options), /Approval unavailable/);
  assert.equal(calls.length, syntaxCheckFiles.length);
});

test('driver failure is audited and cannot be retried with consumed approval', async () => {
  const ledger = new VmApprovalLedger();
  const events = [];
  const coordinator = createVmWorkerCoordinator({ ledger, releaseSha256: digest, audit: async e => events.push(e.outcome) });
  const approvalId = ledger.issue({ operation: 'run_webcore_tests', releaseSha256: digest });
  const request = { approvalId, operation: 'run_webcore_tests', releaseSha256: digest };
  let count = 0;
  const options = { approvedId: approvalId, perform: command => performApprovedWorkerOperation(command, config, {
    run: async () => { count++; return { ok: false, exitCode: 1 }; }
  }) };
  assert.deepEqual(await coordinator.execute(request, options), { operation: 'run_webcore_tests', ok: false });
  assert.deepEqual(events, ['approved', 'started', 'failed']);
  await assert.rejects(coordinator.execute(request, options), /Approval unavailable/);
  assert.equal(count, 1);
});
