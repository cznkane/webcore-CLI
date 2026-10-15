import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolvePistonProposal, requireSourceApplyHashes, SOURCE_MAX_BYTES } from '../server/piston-source.js';

const body = { s: [], v: [], z: 'Unicode ✓' };
const bytes = Buffer.from(JSON.stringify(body));
const digest = data => createHash('sha256').update(data).digest('hex');
const source = { commit: 'a'.repeat(40), path: 'school_calendar/cutover/2026-10-14/resized_test_candidates/TEST_1_01.json', sha256: digest(bytes) };
const fetchBytes = data => async () => new Response(data);

test('pinned source resolves exact bytes through fixed public GET without credentials or redirects', async () => {
  let calls = 0;
  const result = await resolvePistonProposal({ source }, { fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, `https://raw.githubusercontent.com/cznkane/smart-home-hubitat/${source.commit}/${source.path}`);
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.headers.Authorization, undefined);
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(bytes);
  } });
  assert.deepEqual(result.proposed, body);
  assert.equal(result.source_provenance.bytes, bytes.length);
  assert.equal(calls, 1);
});

test('inline proposals retain object semantics and require no network', async () => {
  const result = await resolvePistonProposal({ proposed: body }, { fetchImpl: () => assert.fail('network') });
  assert.equal(result.proposed, body);
});

test('invalid references fail before network; no arbitrary URL/path/ref or mixed proposal', async () => {
  for (const args of [ {}, { proposed: body, source }, { proposed: null }, { source: null },
    ...[{ commit: 'main' }, { sha256: 'x' }, { path: '../secret' }, { path: '/etc/passwd' },
      { path: source.path + '?token=private' }, { path: source.path.replace('TEST_1_01', '%2e%2e') },
      { repository: 'other/repo' }, { url: 'http://127.0.0.1' }].map(change => ({ source: { ...source, ...change } }))
  ]) {
    await assert.rejects(resolvePistonProposal(args, { fetchImpl: () => assert.fail('network') }), { code: 'SOURCE_ARGUMENTS' });
  }
});

test('exact byte integrity checked before JSON parsing; even newline drift fails', async () => {
  for (const data of [Buffer.from('not json'), Buffer.concat([bytes, Buffer.from('\n')])]) {
    await assert.rejects(resolvePistonProposal({ source }, { fetchImpl: fetchBytes(data) }), { code: 'SOURCE_HASH_MISMATCH' });
  }
});

test('rejects invalid UTF-8, JSON, arrays and scalar bodies after byte verification', async () => {
  for (const data of [Buffer.from([0xff]), Buffer.from('invalid secret'), Buffer.from('[]'), Buffer.from('null')]) {
    await assert.rejects(resolvePistonProposal({ source: { ...source, sha256: digest(data) } }, { fetchImpl: fetchBytes(data) }), { code: 'SOURCE_INVALID_JSON' });
  }
});

test('bounded streamed bytes and content-length; no partial parse on oversized responses', async () => {
  for (const response of [new Response(bytes, { headers: { 'content-length': String(SOURCE_MAX_BYTES + 1) } }),
    new Response(Buffer.alloc(SOURCE_MAX_BYTES + 1))]) {
    await assert.rejects(resolvePistonProposal({ source }, { fetchImpl: async () => response }), { code: 'SOURCE_TOO_LARGE' });
  }
});

test('network, redirect and HTTP failures reveal no response, URL or exception contents', async () => {
  for (const fetchImpl of [async () => { throw new Error('private-url-token'); }, async () => new Response('private-body', { status: 403 }),
    async () => new Response(null, { status: 302, headers: { location: 'http://private-host/' } })]) {
    await assert.rejects(resolvePistonProposal({ source }, { fetchImpl }), error => {
      assert.equal(error.code, 'SOURCE_FETCH_FAILED');
      assert.equal(error.message.includes('private'), false);
      return true;
    });
  }
});

test('source apply requires all three complete approval hashes; inline behavior unchanged', () => {
  assert.doesNotThrow(() => requireSourceApplyHashes({ proposed: body }));
  const valid = { source, expected_remote_hash: 'a'.repeat(64), expected_proposed_hash: 'b'.repeat(64), expected_body_hash: 'c'.repeat(64) };
  assert.doesNotThrow(() => requireSourceApplyHashes(valid));
  for (const key of ['expected_remote_hash', 'expected_proposed_hash', 'expected_body_hash']) {
    assert.throws(() => requireSourceApplyHashes({ ...valid, [key]: undefined }), { code: 'SOURCE_APPROVAL_HASHES_REQUIRED' });
  }
});
