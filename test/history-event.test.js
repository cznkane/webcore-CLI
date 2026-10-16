import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHistoryEvent } from '../server/history-event.js';

const base = { source: 'global-snapshot', kind: 'variable-observation', observedAt: 1792155600084, occurredAt: null, subject: 'School Mornings', name: '@KidsPresent', value: false };
test('preserves false boolean and unknown event time', () => {
  const result = normalizeHistoryEvent(base);
  assert.equal(result.value, false);
  assert.equal(result.occurredAt, null);
  assert.equal(result.schemaVersion, 1);
  assert.ok(Object.isFrozen(result));
});
test('distinguishes string true from boolean true', () => {
  assert.equal(normalizeHistoryEvent({ ...base, value: 'true' }).value, 'true');
  assert.equal(normalizeHistoryEvent({ ...base, value: true }).value, true);
});
test('rejects raw objects and unsafe fields', () => {
  assert.throws(() => normalizeHistoryEvent({ ...base, value: { access_token: 'secret' } }), TypeError);
  assert.throws(() => normalizeHistoryEvent({ ...base, source: 'unknown' }), TypeError);
  assert.throws(() => normalizeHistoryEvent({ ...base, observedAt: '2026-10-16' }), TypeError);
});
