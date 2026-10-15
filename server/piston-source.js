import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { WebcoreError } from './client.js';

export const SOURCE_REPOSITORY = 'cznkane/smart-home-hubitat';
export const SOURCE_MAX_BYTES = 1024 * 1024;
const fail = code => { throw new WebcoreError('Pinned piston source rejected; inspect the source reference and integrity evidence.', code); };

// A site-scoped data reader, never a URL proxy, local-file reader or code loader.
export async function resolvePistonProposal(args, { fetchImpl = fetch } = {}) {
  const inline = Object.hasOwn(args, 'proposed');
  const pinned = Object.hasOwn(args, 'source');
  if (inline === pinned) fail('SOURCE_ARGUMENTS');
  if (inline) {
    if (!args.proposed || typeof args.proposed !== 'object' || Array.isArray(args.proposed)) fail('SOURCE_ARGUMENTS');
    return { proposed: args.proposed };
  }
  const s = args.source;
  if (!s || typeof s !== 'object' || Array.isArray(s) ||
      Object.keys(s).sort().join(',') !== 'commit,path,sha256' ||
      typeof s.commit !== 'string' || !/^[a-f0-9]{40}$/.test(s.commit) ||
      typeof s.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(s.sha256) ||
      typeof s.path !== 'string' ||
      !/^school_calendar\/cutover\/\d{4}-\d{2}-\d{2}\/(?:baselines|candidates|resized_test_candidates)\/[A-Za-z0-9_]{1,80}\.json$/.test(s.path)) fail('SOURCE_ARGUMENTS');
  const signal = AbortSignal.timeout(10000);
  let response;
  try {
    response = await fetchImpl(`https://raw.githubusercontent.com/${SOURCE_REPOSITORY}/${s.commit}/${s.path}`,
      { method: 'GET', redirect: 'error', credentials: 'omit', signal, headers: { Accept: 'application/json, text/plain' } });
  } catch { fail('SOURCE_FETCH_FAILED'); }
  if (!response.ok) { await response.body?.cancel(); fail('SOURCE_FETCH_FAILED'); }
  const declared = Number(response.headers.get('content-length'));
  if (declared > SOURCE_MAX_BYTES) { await response.body?.cancel(); fail('SOURCE_TOO_LARGE'); }
  if (!response.body) fail('SOURCE_FETCH_FAILED');
  const reader = response.body.getReader();
  let size = 0;
  const parts = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > SOURCE_MAX_BYTES) { await reader.cancel(); fail('SOURCE_TOO_LARGE'); }
      parts.push(value);
    }
  } catch (error) {
    if (error.code === 'SOURCE_TOO_LARGE') throw error;
    fail('SOURCE_FETCH_FAILED');
  } finally { reader.releaseLock(); }
  const bytes = Buffer.concat(parts);
  if (createHash('sha256').update(bytes).digest('hex') !== s.sha256) fail('SOURCE_HASH_MISMATCH');
  let proposed;
  try { proposed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail('SOURCE_INVALID_JSON'); }
  if (!proposed || typeof proposed !== 'object' || Array.isArray(proposed)) fail('SOURCE_INVALID_JSON');
  // Normalization/native validation still runs in the original prepare/apply path.
  return { proposed, source_provenance: { repository: SOURCE_REPOSITORY, ...s, bytes: size } };
}

export function requireSourceApplyHashes(args) {
  if (!Object.hasOwn(args, 'source')) return;
  for (const key of ['expected_remote_hash', 'expected_proposed_hash', 'expected_body_hash']) {
    if (typeof args[key] !== 'string' || !/^[a-f0-9]{64}$/.test(args[key])) fail('SOURCE_APPROVAL_HASHES_REQUIRED');
  }
}
