import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

// This audit writer is inert until an independently provisioned, non-admin
// worker supplies a protected absolute destination. Never log credentials,
// raw commands, environment variables, stdout, or stderr.
const OPERATIONS = new Set(['run_webcore_tests', 'run_webcore_syntax_check']);
const OUTCOMES = new Set(['approved', 'denied', 'started', 'succeeded', 'failed', 'timed_out']);
const EVENT_ID = /^[A-Za-z0-9_-]{16,128}$/;
const SHA256 = /^[a-f0-9]{64}$/;
export function makeVmAuditEvent({ eventId, operation, outcome, releaseSha256, timestamp = new Date().toISOString() }) {
  if (typeof eventId !== 'string' || !EVENT_ID.test(eventId)) throw new Error('Invalid audit event ID.');
  if (!OPERATIONS.has(operation) || !OUTCOMES.has(outcome)) throw new Error('Invalid audit event.');
  if (typeof releaseSha256 !== 'string' || !SHA256.test(releaseSha256)) throw new Error('Invalid audit release digest.');
  if (typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp))) throw new Error('Invalid audit timestamp.');
  return Object.freeze({ eventId, operation, outcome, releaseSha256, timestamp });
}
export async function appendVmAuditEvent(filePath, event, { append = appendFile } = {}) {
  if (typeof filePath !== 'string' || !filePath) throw new Error('Audit destination required.');
  const clean = makeVmAuditEvent(event);
  await append(filePath, JSON.stringify(clean) + '\n', { encoding: 'utf8', flag: 'a' });
  return true;
}
