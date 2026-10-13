import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { performApprovedWorkerOperation } from '../server/vm-worker-driver.js';

// Runs real Node processes on the Windows CI runner, not mocks. This is a
// development-only acceptance test; it does not enable the production worker.
test('real Windows Node subprocesses complete the full approved syntax plan', { skip: process.platform !== 'win32', timeout: 120000 }, async () => {
  const result = await performApprovedWorkerOperation(
    { operation: 'run_webcore_syntax_check', executable: 'node.exe', args: ['--check', 'server/index.js'] },
    { nodeExecutable: process.execPath, checkoutDirectory: resolve(new URL('..', import.meta.url).pathname.slice(1)), timeoutMs: 15000 }
  );
  assert.deepEqual(result, { ok: true, exitCode: 0 });
});
