import test from 'node:test';
import assert from 'node:assert/strict';
import { createVmWorkerPipeServer } from '../server/vm-worker-pipe.js';
test('pipe transport is disabled off Windows', () => {
  if (process.platform !== 'win32') {
    assert.throws(() => createVmWorkerPipeServer({ pipePath: '\\\\.\\pipe\\WebCoreVmWorker', handleFrame() {} }), /Windows/);
  }
});
test('pipe transport requires explicit endpoint and never starts itself', () => {
  if (process.platform !== 'win32') return;
  let called = false;
  const result = createVmWorkerPipeServer({
    pipePath: '\\\\.\\pipe\\WebCoreVmWorker',
    handleFrame() { called = true; },
    createServerImpl: () => ({ listening: false })
  });
  assert.equal(result.enabled, false);
  assert.equal(result.server.listening, false);
  assert.equal(called, false);
});
