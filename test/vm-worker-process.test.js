import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { runFixedNodeOperation } from '../server/vm-worker-process.js';

const base = { executable: 'C:\\TrustedNode\\node.exe', args: ['--test'], cwd: 'C:\\TrustedRelease' };
test('fixed Node execution rejects arbitrary commands and flags', async () => {
  for (const invalid of [
    { ...base, executable: 'powershell.exe' },
    { ...base, executable: 'node.exe' },
    { ...base, executable: 'C:\\Untrusted\\other.exe' },
    { ...base, args: ['--eval', 'process.exit()'] },
    { ...base, args: ['--check', '../outside.js'] },
    { ...base, cwd: '../relative' },
    { ...base, timeoutMs: 999999 }
  ]) await assert.rejects(runFixedNodeOperation(invalid), /permitted|arguments|directory|timeout/);
});
test('fixed runner disables shell and suppresses child output', async () => {
  let options;
  const result = await runFixedNodeOperation(base, { spawnProcess: (_exe, _args, opts) => {
    options = opts;
    const child = new EventEmitter();
    child.kill = () => true;
    queueMicrotask(() => child.emit('close', 0, null));
    return child;
  } });
  assert.equal(result.ok, true);
  assert.equal(options.shell, false);
  assert.deepEqual(options.stdio, ['ignore', 'ignore', 'ignore']);
});
test('runner returns sanitized failure status', async () => {
  const result = await runFixedNodeOperation(base, { spawnProcess: () => {
    const child = new EventEmitter();
    child.kill = () => true;
    queueMicrotask(() => child.emit('close', 1, null));
    return child;
  } });
  assert.deepEqual(result, { ok: false, exitCode: 1, timedOut: false });
});
