import { spawn } from 'node:child_process';
import { win32 } from 'node:path';

// Inert helper for a future restricted worker. Never invoke this from the
// privileged MCP service. Windows Job Object enforcement and identity
// isolation remain mandatory before any real worker is commissioned.
export async function runFixedNodeOperation({ executable, args, cwd, timeoutMs = 30000, expectedExecutable }, { spawnProcess = spawn } = {}) {
  if (typeof executable !== 'string' || !win32.isAbsolute(executable) || !/^[A-Za-z]:/.test(executable) || win32.basename(executable).toLowerCase() !== 'node.exe' || executable.includes('"') || executable.includes(String.fromCharCode(10)) || executable.includes(String.fromCharCode(13))) {
    throw new Error('Only a pinned Node executable is permitted.');
  }
  if (typeof expectedExecutable !== 'string' || executable !== expectedExecutable) throw new Error('Trusted Node executable identity required.');
  const validArgs = Array.isArray(args) && (
    (args.length === 1 && args[0] === '--test') ||
    (args.length === 2 && args[0] === '--check' && args[1] === 'server/index.js')
  );
  if (!validArgs) throw new Error('Unapproved Node arguments.');
  if (typeof cwd !== 'string' || !win32.isAbsolute(cwd) || !/^[A-Za-z]:/.test(cwd) || cwd.includes('"') || cwd.includes(String.fromCharCode(10)) || cwd.includes(String.fromCharCode(13))) throw new Error('Absolute Windows working directory required.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) throw new Error('Invalid timeout.');
  return await new Promise((resolve, reject) => {
    const child = spawnProcess(executable, args, {
      cwd, shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'],
      env: { SystemRoot: process.env.SystemRoot ?? 'C:\\Windows', PATH: '' }
    });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      child.kill('SIGKILL');
      settled = true;
      reject(new Error('Operation timed out; process-tree termination not yet guaranteed.'));
    }, timeoutMs);
    child.once('error', () => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      reject(new Error('Approved operation failed to start.'));
    });
    child.once('close', (code, signal) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      resolve(Object.freeze({ ok: code === 0 && signal === null, exitCode: code, timedOut: false }));
    });
  });
}
