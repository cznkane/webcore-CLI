import test from 'node:test';
import assert from 'node:assert/strict';
import { managementAvailable, managementToolNames, runManagementReadOnly } from '../server/windows-management.js';

test('disabled by default and unavailable outside Windows', async () => {
  assert.equal(managementAvailable({}, 'win32'), false);
  assert.equal(managementAvailable({ WEBCORE_WINDOWS_MANAGEMENT_READONLY: 'enabled' }, 'linux'), false);
  await assert.rejects(runManagementReadOnly('vm_status', { env: {}, os: 'win32' }), /not enabled/);
});
test('rejects arbitrary operation names without launching a process', async () => {
  await assert.rejects(runManagementReadOnly('powershell', { env: { WEBCORE_WINDOWS_MANAGEMENT_READONLY: 'enabled' }, os: 'win32' }), /Unknown/);
});
test('every exposed diagnostic is fixed, structured and bounded', async () => {
  for (const name of managementToolNames) {
    let calls = 0;
    const runner = (binary, args, options, cb) => {
      calls++;
      assert.equal(binary, 'powershell.exe');
      assert.equal(args[0], '-NoProfile');
      assert.equal(args[1], '-NonInteractive');
      assert.equal(options.timeout, 8000);
      assert.equal(options.maxBuffer, 65536);
      cb(null, '{"ok":true}', '');
    };
    const result = await runManagementReadOnly(name, { env: { WEBCORE_WINDOWS_MANAGEMENT_READONLY: 'enabled' }, os: 'win32', runner });
    assert.equal(calls, 1);
    assert.equal(result.read_only, true);
    assert.deepEqual(result.result, { ok: true });
  }
});
test('does not return command stderr or unstructured output', async () => {
  const options = { env: { WEBCORE_WINDOWS_MANAGEMENT_READONLY: 'enabled' }, os: 'win32' };
  await assert.rejects(runManagementReadOnly('vm_status', { ...options, runner: (a,b,c,cb) => cb(new Error('secret'), '', 'secret') }), /operation failed/);
  await assert.rejects(runManagementReadOnly('vm_status', { ...options, runner: (a,b,c,cb) => cb(null, 'not json') }), /invalid structured/);
});
