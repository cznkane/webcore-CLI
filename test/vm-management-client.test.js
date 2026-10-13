import test from 'node:test';
import assert from 'node:assert/strict';
import { validateVmEnvelope, vmOperations, vmManagementTools } from '../server/vm-management-client.js';
const valid = { action: 'request', operation: 'run_webcore_tests', commit: 'a'.repeat(40), sha256: 'b'.repeat(64), expectedCurrentSha256: 'c'.repeat(64) };
test('management contract has fixed operations and denies caller execution overrides', () => {
  for (const operation of vmOperations) assert.equal(validateVmEnvelope({ ...valid, operation }).operation, operation);
  for (const bad of [{ ...valid, command: 'whoami' }, { ...valid, cwd: 'C:\\' }, { ...valid, env: {} }, { ...valid, operation: 'powershell' }, { ...valid, commit: '../main' }, { ...valid, expectedCurrentSha256: '' }, { action: 'approve', requestId: 'a'.repeat(48) }]) assert.throws(() => validateVmEnvelope(bad));
});
test('VM approval remains outside MCP; status reads and scoped requests are classified correctly', () => {
  assert.equal(vmManagementTools.length, 3);
  assert.ok(vmManagementTools.every(t => !t.name.includes('approve')));
  assert.equal(vmManagementTools.find(t => t.name === 'vm_management_request').annotations.readOnlyHint, false);
  for (const name of ['vm_management_health', 'vm_management_status']) assert.equal(vmManagementTools.find(t => t.name === name).annotations.readOnlyHint, true);
});
