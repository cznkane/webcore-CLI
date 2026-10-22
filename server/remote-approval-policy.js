// Issue #47: pure, fail-closed validation for a future independently authenticated browser gateway.
// This module NEVER issues native grants and MUST NOT be wired to MCP as an approval authority.
import { timingSafeEqual } from 'node:crypto';

const HEX48 = /^[a-f0-9]{48}$/;
const HEX40 = /^[a-f0-9]{40}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const OPERATIONS = new Set(['run_webcore_tests','run_webcore_syntax_check','stage_release','deploy_release','rollback_release','restart_mcp']);
const exactKeys = (obj, keys) => obj && typeof obj === 'object' && !Array.isArray(obj) &&
  Object.keys(obj).sort().join(',') === [...keys].sort().join(',');
const equal = (a,b) => typeof a === 'string' && typeof b === 'string' &&
  Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function validateRemoteApproval({request, session, submission, origin, now = Date.now()}) {
  if (!exactKeys(request,['requestId','targetMachineId','nativeOperationId','operation','commit','sha256','expectedCurrentSha256','expiresAt','status'])) return {ok:false,reason:'invalid_request'};
  if (!HEX48.test(request.requestId) || !/^machine:[a-z0-9][a-z0-9-]{1,63}$/.test(request.targetMachineId) || !/^native:[a-z0-9_]{3,64}$/.test(request.nativeOperationId) || request.nativeOperationId !== 'native:' + request.operation || !OPERATIONS.has(request.operation) || !HEX40.test(request.commit) ||
      !HEX64.test(request.sha256) || !HEX64.test(request.expectedCurrentSha256) || request.status !== 'pending') return {ok:false,reason:'invalid_scope'};
  const expiry = Date.parse(request.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now || expiry > now + 5*60_000) return {ok:false,reason:'expired_or_invalid'};
  if (!exactKeys(session,['humanId','authenticatedAt','authMethod','csrf','origin','expiresAt','requesterId'])) return {ok:false,reason:'invalid_session'};
  if (typeof session.humanId !== 'string' || !session.humanId || session.humanId === session.requesterId ||
      session.authMethod !== 'webauthn-user-verified' || !Number.isFinite(session.authenticatedAt) ||
      now - session.authenticatedAt < 0 || now - session.authenticatedAt > 2*60_000 ||
      !Number.isFinite(session.expiresAt) || session.expiresAt <= now ||
      typeof origin !== 'string' || !origin.startsWith('https://') || origin !== session.origin)
    return {ok:false,reason:'authentication_required'};
  if (!exactKeys(submission,['action','requestId','targetMachineId','nativeOperationId','operation','commit','sha256','expectedCurrentSha256','csrf'])) return {ok:false,reason:'invalid_submission'};
  if (!['approve','deny'].includes(submission.action) || !equal(submission.csrf,session.csrf) ||
      !equal(submission.requestId,request.requestId) || submission.targetMachineId !== request.targetMachineId || submission.nativeOperationId !== request.nativeOperationId || submission.operation !== request.operation ||
      !equal(submission.commit,request.commit) || !equal(submission.sha256,request.sha256) ||
      !equal(submission.expectedCurrentSha256,request.expectedCurrentSha256)) return {ok:false,reason:'scope_or_csrf_mismatch'};
  return {ok:true, action:submission.action, requestId:request.requestId, humanId:session.humanId};
}
