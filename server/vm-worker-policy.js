import { createHash, timingSafeEqual } from 'node:crypto';

// Policy module for a future dedicated non-admin worker. No process spawning,
// IPC listener, network endpoint, or service integration is enabled here.
const OPERATIONS = Object.freeze({
  run_webcore_tests: Object.freeze({ executable: 'node.exe', args: Object.freeze(['--test']) }),
  run_webcore_syntax_check: Object.freeze({ executable: 'npm.cmd', args: Object.freeze(['run', 'check']) })
});
const SHA256 = /^[a-f0-9]{64}$/;
const APPROVAL_ID = /^[a-zA-Z0-9_-]{16,128}$/;
export const workerOperationNames = Object.freeze(Object.keys(OPERATIONS));

export function validateWorkerRequest(request, { expectedReleaseSha256, expectedApprovalId } = {}) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('Invalid worker request.');
  if (Object.keys(request).sort().join(',') !== 'approvalId,operation,releaseSha256') throw new Error('Unexpected worker request fields.');
  if (!Object.hasOwn(OPERATIONS, request.operation)) throw new Error('Operation is not allowlisted.');
  if (typeof request.approvalId !== 'string' || !APPROVAL_ID.test(request.approvalId)) throw new Error('Invalid approval identifier.');
  if (typeof request.releaseSha256 !== 'string' || !SHA256.test(request.releaseSha256)) throw new Error('Invalid release digest.');
  if (typeof expectedReleaseSha256 !== 'string' || !SHA256.test(expectedReleaseSha256)) throw new Error('Trusted release digest required.');
  if (typeof expectedApprovalId !== 'string' || !APPROVAL_ID.test(expectedApprovalId)) throw new Error('Trusted approval required.');
  const digestA = Buffer.from(request.releaseSha256, 'hex');
  const digestB = Buffer.from(expectedReleaseSha256, 'hex');
  if (!timingSafeEqual(digestA, digestB)) throw new Error('Release digest mismatch.');
  const approvalA = createHash('sha256').update(request.approvalId).digest();
  const approvalB = createHash('sha256').update(expectedApprovalId).digest();
  if (!timingSafeEqual(approvalA, approvalB)) throw new Error('Approval mismatch.');
  return Object.freeze({ operation: request.operation, executable: OPERATIONS[request.operation].executable, args: OPERATIONS[request.operation].args });
}

// No raw stdout/stderr: callers get status metadata only.
export function summarizeWorkerResult(operation, exitCode, durationMs) {
  if (!Object.hasOwn(OPERATIONS, operation)) throw new Error('Unknown operation.');
  if (!Number.isInteger(exitCode) || exitCode < 0 || exitCode > 255) throw new Error('Invalid exit code.');
  if (!Number.isSafeInteger(durationMs) || durationMs < 0) throw new Error('Invalid duration.');
  return Object.freeze({ operation, ok: exitCode === 0, exitCode, durationMs });
}
