import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

test('stdio MCP exposes list scopes, guarded selection, and diagnostics', async () => {
  const script = fileURLToPath(new URL('../server/index.js', import.meta.url));
  const child = spawn(process.execPath, [script], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
  child.stdin.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) + '\n');
  const [code] = await once(child, 'exit');
  assert.equal(code, 0, stderr);
  const response = JSON.parse(stdout.trim());
  const tool = response.result.tools.find(item => item.name === 'webcore_list_pistons');
  const diagnostics = response.result.tools.find(item => item.name === 'webcore_diagnose');
  assert.ok(tool);
  assert.deepEqual(tool.inputSchema.properties.scope.enum, ['all', 'active', 'paused']);
  assert.match(tool.description, /If piston_count is 0/);
  assert.match(tool.description, /explicit empty list/);
  const select = response.result.tools.find(item => item.name === 'webcore_select_piston');
  assert.deepEqual(select.inputSchema.required, ['list_id', 'number', 'expected_name']);
  const get = response.result.tools.find(item => item.name === 'webcore_get_piston');
  assert.deepEqual(get.inputSchema.required, ['id', 'expected_name']);
  const verify = response.result.tools.find(item => item.name === 'webcore_verify_piston_update');
  assert.deepEqual(verify.inputSchema.required, ['id', 'expected_name', 'expected_body_hash']);
  assert.match(verify.description, /Read-only/);
  assert.ok(diagnostics);
  assert.match(diagnostics.description, /read-only/);
  assert.match(diagnostics.description, /without endpoint URLs, access tokens/);
  const readOnlyNames = [
    'webcore_status', 'webcore_diagnose', 'webcore_list_devices', 'webcore_get_device',
    'webcore_list_pistons', 'webcore_select_piston', 'webcore_get_piston',
    'webcore_lookup_language', 'webcore_prepare_piston_update',
    'webcore_verify_piston_update', 'webcore_get_activity'
  ];
  for (const name of readOnlyNames) {
    const item = response.result.tools.find(candidate => candidate.name === name);
    assert.equal(item.annotations?.readOnlyHint, true, name);
    assert.equal(item.annotations?.destructiveHint, false, name);
    assert.equal(item.annotations?.openWorldHint, false, name);
  }
  for (const name of ['webcore_create_piston', 'webcore_pause_piston', 'webcore_resume_piston']) {
    const item = response.result.tools.find(candidate => candidate.name === name);
    assert.equal(item.annotations?.readOnlyHint, false, name);
    assert.equal(item.annotations?.destructiveHint, false, name);
    assert.equal(item.annotations?.openWorldHint, false, name);
  }
  for (const name of ['webcore_apply_piston_update', 'webcore_test_piston']) {
    const item = response.result.tools.find(candidate => candidate.name === name);
    assert.equal(item.annotations?.readOnlyHint, false, name);
    assert.equal(item.annotations?.destructiveHint, true, name);
    assert.equal(item.annotations?.openWorldHint, false, name);
  }
});
