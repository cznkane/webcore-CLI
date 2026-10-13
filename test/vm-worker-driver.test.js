import test from 'node:test';
import assert from 'node:assert/strict';
import { performApprovedWorkerOperation } from '../server/vm-worker-driver.js';
import { syntaxCheckFiles } from '../server/vm-worker-syntax-plan.js';
const config = { nodeExecutable: 'C:\\Tools\\node.exe', checkoutDirectory: 'C:\\Staging\\release' };
const syntax = { operation: 'run_webcore_syntax_check', executable: 'node.exe', args: ['--check', 'server/index.js'] };
const tests = { operation: 'run_webcore_tests', executable: 'node.exe', args: ['--test'] };
test('runs each exact syntax-check file without a shell', async () => {
  const calls = [];
  const result = await performApprovedWorkerOperation(syntax, config, { run: async c => { calls.push(c); return { ok: true, exitCode: 0 }; } });
  assert.equal(result.ok, true);
  assert.deepEqual(calls.map(c => c.args), syntaxCheckFiles.map(f => ['--check', f]));
  assert.ok(calls.every(c => c.expectedExecutable === config.nodeExecutable && c.cwd === config.checkoutDirectory));
});
test('stops immediately on syntax failure', async () => {
  let calls = 0;
  const result = await performApprovedWorkerOperation(syntax, config, { run: async () => { calls++; return { ok: false, exitCode: 1 }; } });
  assert.equal(result.ok, false);
  assert.equal(calls, 1);
});
test('runs tests only with fixed arguments and rejects arbitrary operations', async () => {
  const calls = [];
  await performApprovedWorkerOperation(tests, config, { run: async c => { calls.push(c); return { ok: true, exitCode: 0 }; } });
  assert.deepEqual(calls[0].args, ['--test']);
  await assert.rejects(() => performApprovedWorkerOperation({ ...tests, args: ['--eval', 'x'] }, config, { run: async () => ({ ok: true }) }));
  await assert.rejects(() => performApprovedWorkerOperation({ ...tests, operation: 'restart_service' }, config, { run: async () => ({ ok: true }) }));
});
