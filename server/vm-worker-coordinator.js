import { VmWorkerGate } from './vm-worker-concurrency.js';
import { validateWorkerRequest } from './vm-worker-policy.js';
import { makeVmAuditEvent } from './vm-worker-audit.js';

// Non-executing orchestration core. Caller must be a separately authenticated,
// low-privilege Windows worker, never the privileged MCP service.
// This module intentionally does NOT create IPC, approvals or processes.
export function createVmWorkerCoordinator({ ledger, audit, releaseSha256, gate = new VmWorkerGate(), now = Date.now }) {
  if (!ledger || typeof ledger.consume !== 'function' || typeof audit !== 'function') throw new Error('Trusted worker dependencies required.');
  if (typeof releaseSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(releaseSha256)) throw new Error('Trusted release digest required.');
  return Object.freeze({
    async execute(request, { approvedId, perform }) {
      if (typeof perform !== 'function') throw new Error('Restricted operation executor required.');
      return gate.run(async () => {
        const command = validateWorkerRequest(request, {
          expectedReleaseSha256: releaseSha256,
          expectedApprovalId: approvedId
        });
        // Consume before any execution, including failed execution.
        ledger.consume({ approvalId: request.approvalId, operation: request.operation, releaseSha256 });
        const event = (outcome) => makeVmAuditEvent({
          eventId: request.approvalId,
          operation: request.operation,
          outcome,
          releaseSha256,
          timestamp: new Date(now()).toISOString()
        });
        await audit(event('approved')); // Fail closed if audit is unavailable.
        await audit(event('started'));
        try {
          const result = await perform(command);
          await audit(event(result?.ok === true ? 'succeeded' : 'failed'));
          return Object.freeze({ operation: command.operation, ok: result?.ok === true });
        } catch (error) {
          await audit(event('failed'));
          throw error;
        }
      });
    }
  });
}
