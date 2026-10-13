import { createHmac, timingSafeEqual } from 'node:crypto';

// Pure authenticated-message verifier for a future local IPC transport.
// The secret is provisioned independently and never returned to MCP callers.
// This module opens no listener and performs no execution.
const ID = /^[A-Za-z0-9_-]{16,128}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const OPERATIONS = new Set(['run_webcore_tests', 'run_webcore_syntax_check']);
const canonical = m => JSON.stringify([m.version, m.requestId, m.operation, m.releaseSha256, m.approvalId, m.issuedAt]);
export function signVmIpcMessage(message, secret) {
  if (!Buffer.isBuffer(secret) || secret.length < 32) throw new Error('IPC key not provisioned.');
  return createHmac('sha256', secret).update(canonical(message)).digest('hex');
}
export function createVmIpcVerifier({ secret, now = Date.now, maxAgeMs = 30000, maxEntries = 1024 }) {
  if (!Buffer.isBuffer(secret) || secret.length < 32) throw new Error('IPC key not provisioned.');
  if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs < 1000 || maxAgeMs > 60000) throw new Error('Invalid IPC age limit.');
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 10000) throw new Error('Invalid IPC replay limit.');
  const seen = new Map();
  return Object.freeze({
    verify(message) {
      if (!message || typeof message !== 'object' || Array.isArray(message) ||
          Object.keys(message).sort().join(',') !== 'approvalId,issuedAt,mac,operation,releaseSha256,requestId,version' ||
          message.version !== 1 || !ID.test(message.requestId) || !ID.test(message.approvalId) ||
          !OPERATIONS.has(message.operation) || !DIGEST.test(message.releaseSha256) ||
          !Number.isSafeInteger(message.issuedAt) || typeof message.mac !== 'string' || !DIGEST.test(message.mac)) {
        throw new Error('Invalid IPC envelope.');
      }
      const t = now();
      if (!Number.isSafeInteger(t) || message.issuedAt > t || t - message.issuedAt > maxAgeMs) throw new Error('IPC message expired.');
      const expected = Buffer.from(signVmIpcMessage(message, secret), 'hex');
      if (!timingSafeEqual(Buffer.from(message.mac, 'hex'), expected)) throw new Error('IPC authentication failed.');
      for (const [id, expiry] of seen) if (expiry <= t) seen.delete(id);
      if (seen.has(message.requestId)) throw new Error('IPC replay rejected.');
      if (seen.size >= maxEntries) throw new Error('IPC replay capacity exhausted.');
      seen.set(message.requestId, t + maxAgeMs);
      return Object.freeze({ approvalId: message.approvalId, operation: message.operation, releaseSha256: message.releaseSha256 });
    }
  });
}
