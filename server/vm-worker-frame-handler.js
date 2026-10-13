import { createVmIpcVerifier } from './vm-worker-ipc-auth.js';

// Message-level admission only. This does not grant access to an OS pipe:
// production still requires restrictive Windows pipe DACL and peer identity.
export function createVmWorkerFrameHandler({ secret, coordinator, approvedId, perform, audit, now }) {
  if (!coordinator || typeof coordinator.execute !== 'function' || typeof perform !== 'function' ||
      typeof audit !== 'function' || typeof approvedId !== 'function') throw new Error('Trusted worker dependencies required.');
  const verifier = createVmIpcVerifier({ secret, ...(now ? { now } : {}) });
  return async function handleFrame(frame) {
    if (!Buffer.isBuffer(frame) || frame.length > 4096 || frame.length < 2) throw new Error('Invalid IPC frame.');
    let message;
    try { message = JSON.parse(frame.toString('utf8')); } catch { throw new Error('Invalid IPC JSON.'); }
    const request = verifier.verify(message);
    // Operator authorization is checked against the independent approval source,
    // not the request's self-asserted approval ID.
    const trustedApproval = await approvedId(request);
    if (typeof trustedApproval !== 'string') throw new Error('Trusted approval unavailable.');
    await audit({ event: 'ipc_admitted', operation: request.operation });
    return coordinator.execute(request, { approvedId: trustedApproval, perform });
  };
}
