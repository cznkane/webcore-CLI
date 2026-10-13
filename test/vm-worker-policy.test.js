import test from 'node:test';
import assert from 'node:assert/strict';
import { workerOperationNames, validateWorkerRequest, summarizeWorkerResult } from '../server/vm-worker-policy.js';

const sha = 'a'.repeat(64);
const approval = 'approved_change_12345';
const trusted = { expectedReleaseSha256: sha, expectedApprovalId: approval };
const request = { operation: 'run_webcore_tests', releaseSha256: sha, approvalId: approval };
test('only fixed test operations are defined', () => {
  assert.deepEqual(workerOperationNames, ['run_webcore_tests', 'run_webcore_syntax_check']);
});
test('exact trusted release and approval produce fixed command identity', () => {
  const cmd = validateWorkerRequest(request, trusted);
  assert.equal(cmd.executable, 'node.exe');
  assert.deepEqual(cmd.args, ['--test']);
  assert.deepEqual(validateWorkerRequest({ ...request, operation: 'run_webcore_syntax_check' }, trusted).args, ['--check', 'server/index.js', 'server/client.js', 'server/hubitat.js', 'server/piston.js']);
});
test('reject unknown operations, injection fields and mismatched release', () => {
  for (const invalid of [
    { ...request, operation: 'powershell' },
    { ...request, args: ['--eval', 'evil'] },
    { ...request, cwd: 'C:\\Windows' },
    { ...request, releaseSha256: 'b'.repeat(64) },
    { ...request, approvalId: 'unapproved_change_12345' },
    null,
  ]) assert.throws(() => validateWorkerRequest(invalid, trusted));
});
test('fail closed when trust anchors are missing', () => {
  assert.throws(() => validateWorkerRequest(request));
  assert.throws(() => validateWorkerRequest(request, { expectedReleaseSha256: sha }));
});
test('result exposes metadata but no stdout or stderr', () => {
  assert.deepEqual(summarizeWorkerResult('run_webcore_tests', 0, 50), {
    operation: 'run_webcore_tests', ok: true, exitCode: 0, durationMs: 50
  });
  assert.throws(() => summarizeWorkerResult('arbitrary', 0, 1));
});
