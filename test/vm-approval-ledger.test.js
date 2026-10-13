import test from 'node:test';
import assert from 'node:assert/strict';
import { VmApprovalLedger } from '../server/vm-approval-ledger.js';
const sha = 'a'.repeat(64);
const operation = 'run_webcore_tests';
test('one-use approval matches operation and release', () => {
  const ledger = new VmApprovalLedger();
  const approvalId = ledger.issue({ operation, releaseSha256: sha });
  assert.equal(ledger.consume({ approvalId, operation, releaseSha256: sha }), true);
  assert.throws(() => ledger.consume({ approvalId, operation, releaseSha256: sha }));
});
test('scope mismatch burns approval', () => {
  const ledger = new VmApprovalLedger();
  const approvalId = ledger.issue({ operation, releaseSha256: sha });
  assert.throws(() => ledger.consume({ approvalId, operation: 'run_webcore_syntax_check', releaseSha256: sha }));
  assert.throws(() => ledger.consume({ approvalId, operation, releaseSha256: sha }));
});
test('expired approvals fail closed', () => {
  let now = 1000;
  const ledger = new VmApprovalLedger({ now: () => now });
  const approvalId = ledger.issue({ operation, releaseSha256: sha, ttlMs: 1000 });
  now = 2000;
  assert.throws(() => ledger.consume({ approvalId, operation, releaseSha256: sha }));
});
test('invalid operations and lifetimes rejected', () => {
  const ledger = new VmApprovalLedger();
  assert.throws(() => ledger.issue({ operation: 'arbitrary', releaseSha256: sha }));
  assert.throws(() => ledger.issue({ operation, releaseSha256: sha, ttlMs: 999999 }));
});
