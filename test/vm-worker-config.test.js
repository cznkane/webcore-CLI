import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTrustedWorkerPaths } from '../server/vm-worker-config.js';
const good = { nodePath: 'C:\\Program Files\\nodejs\\node.exe', releaseRoot: 'C:\\SmartHome\\releases', auditPath: 'C:\\SmartHome\\audit\\worker.jsonl' };
test('trusted worker config accepts fixed absolute Windows paths', () => {
  assert.deepEqual(validateTrustedWorkerPaths(good), good);
});
test('trusted worker config rejects relative, alternate stream and executable substitution', () => {
  for (const config of [
    { ...good, nodePath: 'node.exe' },
    { ...good, nodePath: 'C:\\tools\\cmd.exe' },
    { ...good, releaseRoot: '..\\releases' },
    { ...good, auditPath: 'C:\\audit\\log:stream' },
    { ...good, auditPath: good.nodePath }
  ]) assert.throws(() => validateTrustedWorkerPaths(config));
});
