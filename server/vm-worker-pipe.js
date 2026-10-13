import { createServer } from 'node:net';

// Local-only framing transport for a separately provisioned restricted worker.
// Deliberately no default endpoint, listener activation or command dispatch.
// A real deployment must independently enforce named-pipe DACLs and peer identity.
export function createVmWorkerPipeServer({ pipePath, handleFrame, maxBytes = 4096, createServerImpl = createServer }) {
  if (process.platform !== 'win32') throw new Error('Windows worker transport only.');
  if (typeof pipePath !== 'string' || !pipePath.startsWith('\\\\\\\\.\\\\pipe\\\\') || !/^[A-Za-z0-9_-]{8,64}$/.test(pipePath.slice(9))) throw new Error('Invalid named pipe.');
  if (typeof handleFrame !== 'function') throw new Error('Frame handler required.');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 256 || maxBytes > 16384) throw new Error('Invalid frame size.');
  const server = createServerImpl(socket => {
    let bytes = 0;
    let done = false;
    const fail = () => { done = true; socket.destroy(); };
    socket.on('data', chunk => {
      if (done) return;
      bytes += chunk.length;
      if (bytes > maxBytes || chunk.includes(10)) { fail(); return; }
      // No dispatch: authenticated IPC and OS peer verification must be
      // installed before enabling a listener. Reject all incoming traffic.
      fail();
    });
    socket.on('error', () => { done = true; });
  });
  return Object.freeze({ server, pipePath, enabled: false });
}
