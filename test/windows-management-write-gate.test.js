import test from 'node:test';
import assert from 'node:assert/strict';
import { managementTestToolNames, managementTestsAvailable, runManagementTest } from '../server/windows-management.js';

test('privileged MCP exposes no VM test execution tools', () => {
  assert.deepEqual(managementTestToolNames, []);
});
test('VM test execution remains disabled regardless of environment', () => {
  assert.equal(managementTestsAvailable({ WEBCORE_WINDOWS_MANAGEMENT_TESTS: 'enabled' }, 'win32'), false);
});
test('VM test execution fails closed without invoking a runner', async () => {
  let invoked = false;
  await assert.rejects(runManagementTest('vm_run_webcore_tests', {
    confirm: true,
    runner() { invoked = true; }
  }), /isolated, verified worker/);
  assert.equal(invoked, false);
});
