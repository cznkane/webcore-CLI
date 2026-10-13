import test from 'node:test';
import assert from 'node:assert/strict';
import { makeVmAuditEvent, appendVmAuditEvent } from '../server/vm-worker-audit.js';
const base = { eventId: 'event_123456789012', operation: 'run_webcore_tests', outcome: 'denied', releaseSha256: 'a'.repeat(64) };
test('audit records contain metadata only', async () => {
  let written;
  await appendVmAuditEvent('audit.jsonl', { ...base, secret: 'never-persist-this' }, {
    append: async (_path, line) => { written = line; }
  });
  const record = JSON.parse(written);
  assert.deepEqual(Object.keys(record), ['eventId', 'operation', 'outcome', 'releaseSha256', 'timestamp']);
  assert.equal(written.includes('never-persist-this'), false);
});
test('audit rejects unknown operations and outcomes', () => {
  assert.throws(() => makeVmAuditEvent({ ...base, operation: 'shell' }));
  assert.throws(() => makeVmAuditEvent({ ...base, outcome: 'arbitrary' }));
  assert.throws(() => makeVmAuditEvent({ ...base, releaseSha256: 'bad' }));
});
test('audit append failures propagate', async () => {
  await assert.rejects(appendVmAuditEvent('audit.jsonl', base, {
    append: async () => { throw new Error('disk full'); }
  }), /disk full/);
});
