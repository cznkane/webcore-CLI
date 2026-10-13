import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { VmApprovalLedger } from '../server/vm-approval-ledger.js';
import { createVmWorkerCoordinator } from '../server/vm-worker-coordinator.js';
import { createVmWorkerFrameHandler } from '../server/vm-worker-frame-handler.js';
import { signVmIpcMessage } from '../server/vm-worker-ipc-auth.js';
const digest = 'a'.repeat(64);
test('authenticated IPC admission executes once and rejects replay and forged approval', async () => {
  const secret = randomBytes(32), ledger = new VmApprovalLedger(), events = [];
  const approvalId = ledger.issue({ operation: 'run_webcore_tests', releaseSha256: digest });
  const coordinator = createVmWorkerCoordinator({ ledger, releaseSha256: digest, audit: async e => events.push(e.outcome) });
  let calls = 0;
  const handler = createVmWorkerFrameHandler({
    secret, coordinator, approvedId: async () => approvalId,
    perform: async () => { calls++; return { ok: true }; },
    audit: async e => events.push(e.event)
  });
  const msg = { version: 1, requestId: randomBytes(18).toString('base64url'), approvalId,
    operation: 'run_webcore_tests', releaseSha256: digest, issuedAt: Date.now() };
  msg.mac = signVmIpcMessage(msg, secret);
  const frame = Buffer.from(JSON.stringify(msg));
  assert.deepEqual(await handler(frame), { operation: 'run_webcore_tests', ok: true });
  assert.equal(calls, 1);
  assert.deepEqual(events, ['ipc_admitted', 'approved', 'started', 'succeeded']);
  await assert.rejects(handler(frame), /replay/);
  const forged = { ...msg, requestId: randomBytes(18).toString('base64url'), approvalId: randomBytes(24).toString('base64url') };
  forged.mac = signVmIpcMessage(forged, secret);
  await assert.rejects(handler(Buffer.from(JSON.stringify(forged))), /Approval mismatch/);
  assert.equal(calls, 1);
});
test('unauthenticated and malformed frames never reach approval source', async () => {
  const secret = randomBytes(32);
  let reached = false;
  const handler = createVmWorkerFrameHandler({ secret, coordinator: { execute: async () => { reached = true; } },
    approvedId: async () => { reached = true; }, perform: async () => {}, audit: async () => {} });
  await assert.rejects(handler(Buffer.from('{broken')), /JSON/);
  await assert.rejects(handler(Buffer.from('{}')), /envelope/);
  assert.equal(reached, false);
});
