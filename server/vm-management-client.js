import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';

// Provisioned by the administrator installer. No path, executable, argument,
// environment or shell override is accepted from an MCP request.
const HOST = 'C:\\ProgramData\\SmartHome\\VmManagement\\bin\\VmManagement.exe';
const ENABLED = 'C:\\ProgramData\\SmartHome\\VmManagement\\installed.json';
export const vmOperations = Object.freeze(['run_webcore_tests', 'run_webcore_syntax_check', 'stage_release', 'deploy_release', 'rollback_release', 'restart_mcp']);
export function vmManagementInstalled() { return process.platform === 'win32' && existsSync(HOST) && existsSync(ENABLED); }
export function validateVmEnvelope(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('Invalid VM request.');
  const fields = request.action === 'request' ? ['action', 'operation', 'commit', 'sha256', 'expectedCurrentSha256'] : request.action === 'status' ? ['action', 'requestId'] : request.action === 'health' ? ['action'] : [];
  if (!fields.length || Object.keys(request).sort().join(',') !== fields.sort().join(',')) throw new Error('Unexpected VM request fields.');
  if (request.action === 'request') {
    if (!vmOperations.includes(request.operation) || !/^[a-f0-9]{40}$/.test(request.commit) || !/^[a-f0-9]{64}$/.test(request.sha256) || !/^[a-f0-9]{64}$/.test(request.expectedCurrentSha256)) throw new Error('Invalid VM operation scope.');
  }
  if (request.action === 'status' && !/^[a-f0-9]{48}$/.test(request.requestId)) throw new Error('Invalid VM request identifier.');
  return request;
}
export async function callVmManagement(request) {
  validateVmEnvelope(request);
  if (!vmManagementInstalled()) throw new Error('Windows VM management is not installed.');
  return new Promise((resolve, reject) => {
    const child = execFile(HOST, ['client'], { windowsHide: true, shell: false, timeout: 15000, maxBuffer: 65536, env: { SystemRoot: process.env.SystemRoot ?? 'C:\\Windows' } }, (error, stdout) => {
      if (error) return reject(new Error('VM management request failed closed.'));
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error('Invalid VM management response.')); }
    });
    child.stdin.end(JSON.stringify(request));
  });
}
export const vmManagementTools = [
  { name: 'vm_management_health', description: 'Read installed VM management release and recovery state. No execution.', annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }, inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'vm_management_status', description: 'Read the outcome of the exact scoped VM request. A restart can terminate this MCP session; reconnect and inspect health. Local process verification is separate from end-to-end acceptance.', annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }, inputSchema: { type: 'object', properties: { requestId: { type: 'string', minLength: 48 } }, required: ['requestId'], additionalProperties: false } },
  { name: 'vm_management_request', description: 'Queue ONE fixed Windows maintenance operation after reviewing its exact release commit and SHA-256. Requires separate local operator approval in the installed approval window within five minutes. MCP cannot approve or supply commands, paths, arguments or environment. Tests run under a restricted identity. Deployment accepts only merged canonical commits and verifies the approved archive digest. No piston/device operations.', annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true }, inputSchema: { type: 'object', properties: { operation: { type: 'string', enum: vmOperations }, commit: { type: 'string', minLength: 40 }, sha256: { type: 'string', minLength: 64 }, expectedCurrentSha256: { type: 'string', minLength: 64 } }, required: ['operation', 'commit', 'sha256', 'expectedCurrentSha256'], additionalProperties: false } }
];
