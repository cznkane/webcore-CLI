import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyReleaseFile } from '../server/vm-release-integrity.js';

test('release file must match trusted digest and remain under root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vm-release-'));
  try {
    const content = 'fixed test release';
    await writeFile(join(root, 'manifest.txt'), content);
    const expectedSha256 = createHash('sha256').update(content).digest('hex');
    assert.equal((await verifyReleaseFile({ root, relativePath: 'manifest.txt', expectedSha256 })).verified, true);
    await assert.rejects(verifyReleaseFile({ root, relativePath: 'manifest.txt', expectedSha256: '0'.repeat(64) }), /integrity mismatch/);
    await assert.rejects(verifyReleaseFile({ root, relativePath: '../outside', expectedSha256 }), /Invalid release path/);
    await assert.rejects(verifyReleaseFile({ root, relativePath: 'manifest.txt', expectedSha256: 'invalid' }), /digest/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
