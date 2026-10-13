import test from 'node:test';
import assert from 'node:assert/strict';
import { createVmIpcVerifier, signVmIpcMessage } from '../server/vm-worker-ipc-auth.js';
const key = Buffer.alloc(32, 7);
const base = { version: 1, requestId: 'r'.repeat(24), operation: 'run_webcore_tests', releaseSha256: 'a'.repeat(64), approvalId: 'b'.repeat(32), issuedAt: 100000 };
const signed = (m = base) => ({ ...m, mac: signVmIpcMessage(m, key) });
test('IPC verifies exact authenticated request and rejects replay', () => {
  const verify = createVmIpcVerifier({ secret: key, now: () => 100001 });
  assert.deepEqual(verify.verify(signed()), { approvalId: base.approvalId, operation: base.operation, releaseSha256: base.releaseSha256 });
  assert.throws(() => verify.verify(signed()), /replay/);
});
test('IPC rejects forged fields, expired messages and absent secret', () => {
  assert.throws(() => createVmIpcVerifier({ secret: Buffer.alloc(3) }), /key/);
  for (const m of [
    { ...signed(), operation: 'run_arbitrary_command' },
    { ...signed(), releaseSha256: 'c'.repeat(64) },
    { ...signed(), extra: 'unexpected' }
  ]) assert.throws(() => createVmIpcVerifier({ secret: key, now: () => 100001 }).verify(m));
  assert.throws(() => createVmIpcVerifier({ secret: key, now: () => 140001 }).verify(signed()), /expired/);
});
test('IPC rejects overflow rather than losing replay protection', () => {
  const verify = createVmIpcVerifier({ secret: key, now: () => 100001, maxEntries: 1 });
  verify.verify(signed());
  const other = { ...base, requestId: 's'.repeat(24) };
  assert.throws(() => verify.verify(signed(other)), /capacity/);
});
