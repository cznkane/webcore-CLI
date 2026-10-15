// Read-only log processing. Transport is intentionally not implemented until a
// supported Hubitat log retrieval mechanism and its authentication are verified.
const MAX_ENTRIES = 200;
const SECRET = /((?:access_token|token|password|authorization|api_key|client_secret)\s*[:=]\s*)([^\s&;,]+)/gi;
const URL_SECRET = /([?&](?:access_token|token|api_key|client_secret)=)[^&#\s]+/gi;

export function sanitizeLogMessage(message) {
  if (typeof message !== 'string') return '';
  return message.replace(URL_SECRET, '$1[REDACTED]').replace(SECRET, '$1[REDACTED]').slice(0, 2048);
}

export function filterHubitatLogs(entries, { deviceIds = [], level, since, limit = 100 } = {}) {
  if (!Array.isArray(entries)) throw new TypeError('Log entries must be an array.');
  if (!Array.isArray(deviceIds) || deviceIds.some(id => !/^[0-9]{1,10}$/.test(String(id)))) throw new TypeError('Invalid device IDs.');
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ENTRIES) throw new RangeError('Log limit must be 1..200.');
  if (level !== undefined && !['error', 'warn', 'info', 'debug', 'trace'].includes(level)) throw new TypeError('Invalid log level.');
  if (since !== undefined && (!Number.isFinite(Date.parse(since)))) throw new TypeError('Invalid since timestamp.');
  const allowed = new Set(deviceIds.map(String));
  return entries.filter(row => {
    if (!row || typeof row !== 'object') return false;
    if (allowed.size && !allowed.has(String(row.deviceId ?? ''))) return false;
    if (level && row.level !== level) return false;
    if (since && !(Date.parse(row.timestamp) >= Date.parse(since))) return false;
    return true;
  }).slice(0, limit).map(row => ({
    timestamp: typeof row.timestamp === 'string' ? row.timestamp : null,
    deviceId: /^[0-9]{1,10}$/.test(String(row.deviceId)) ? String(row.deviceId) : null,
    level: ['error','warn','info','debug','trace'].includes(row.level) ? row.level : 'unknown',
    message: sanitizeLogMessage(row.message)
  }));
}

export async function getHubitatLogs() {
  const error = new Error('Hubitat log transport has not been verified; no Hubitat request was made.');
  error.code = 'HUBITAT_LOG_TRANSPORT_UNAVAILABLE';
  throw error;
}
