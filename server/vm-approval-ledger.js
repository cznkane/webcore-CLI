import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

const DIGEST = /^[a-f0-9]{64}$/;
const OPERATIONS = new Set(['run_webcore_tests', 'run_webcore_syntax_check']);
const hash = value => createHash('sha256').update(value).digest();
const same = (a, b) => timingSafeEqual(hash(a), hash(b));

// In-memory, one-use approval ledger for the future isolated worker.
// An external trusted operator must issue approvals; MCP requests cannot issue them.
// A restart invalidates all pending approvals (fail closed).
export class VmApprovalLedger {
  #entries = new Map();
  #now;
  constructor({ now = Date.now } = {}) { this.#now = now; }
  issue({ operation, releaseSha256, ttlMs = 60000 }) {
    if (!OPERATIONS.has(operation) || !DIGEST.test(releaseSha256)) throw new Error('Invalid approval scope.');
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1000 || ttlMs > 300000) throw new Error('Invalid approval lifetime.');
    const id = randomBytes(24).toString('base64url');
    this.#entries.set(hash(id).toString('hex'), { operation, releaseSha256, expiresAt: this.#now() + ttlMs });
    return id;
  }
  consume({ approvalId, operation, releaseSha256 }) {
    if (typeof approvalId !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(approvalId)) throw new Error('Invalid approval.');
    const key = hash(approvalId).toString('hex');
    const entry = this.#entries.get(key);
    // Consume before checking scope: a failed attempt burns the approval.
    this.#entries.delete(key);
    if (!entry || this.#now() >= entry.expiresAt || !same(entry.operation, operation) || !same(entry.releaseSha256, releaseSha256)) {
      throw new Error('Approval unavailable, expired, or out of scope.');
    }
    return true;
  }
}
