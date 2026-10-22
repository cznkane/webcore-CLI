// Pure, side-effect-free event envelope validation for future read-only history storage.
// No secrets, endpoints, or raw Hubitat payloads are retained by this module.
const ALLOWED_SOURCES = new Set(['webcore-activity', 'hubitat-event', 'global-snapshot']);
const ALLOWED_KINDS = new Set(['execution', 'device-event', 'variable-observation']);
export function normalizeHistoryEvent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('event must be an object');
  const { source, kind, observedAt, occurredAt, subject, name, value } = input;
  if (!ALLOWED_SOURCES.has(source) || !ALLOWED_KINDS.has(kind)) throw new TypeError('unsupported event source or kind');
  if (!Number.isSafeInteger(observedAt) || observedAt < 0) throw new TypeError('observedAt must be epoch milliseconds');
  if (occurredAt !== null && occurredAt !== undefined && (!Number.isSafeInteger(occurredAt) || occurredAt < 0)) throw new TypeError('occurredAt must be epoch milliseconds');
  if (typeof subject !== 'string' || subject.length < 1 || subject.length > 128) throw new TypeError('invalid subject');
  if (typeof name !== 'string' || name.length < 1 || name.length > 128) throw new TypeError('invalid name');
  if (value !== undefined && value !== null && !['boolean', 'number', 'string'].includes(typeof value)) throw new TypeError('only scalar values may be recorded');
  if (typeof value === 'string' && value.length > 256) throw new TypeError('value too long');
  return Object.freeze({ schemaVersion: 1, source, kind, observedAt, occurredAt: occurredAt ?? null, subject, name, value: value ?? null });
}
