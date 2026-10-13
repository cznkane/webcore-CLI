import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('Windows adapter enables only readonly diagnostics before loading adjacent server', () => {
  const source = readFileSync(new URL('../windows-readonly-launcher.cjs', import.meta.url), 'utf8');
  const env = { existing: 'preserved' };
  const calls = [];
  runInNewContext(source, {
    process: { env },
    require(path) {
      assert.equal(env.WEBCORE_WINDOWS_MANAGEMENT_READONLY, 'enabled');
      calls.push(path);
    }
  });
  assert.deepEqual(env, { existing: 'preserved', WEBCORE_WINDOWS_MANAGEMENT_READONLY: 'enabled' });
  assert.deepEqual(calls, ['./server/index.js']);
});
