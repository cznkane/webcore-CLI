import { win32 } from 'node:path';

// The worker must never accept paths from an untrusted MCP request.
// These checks are not a substitute for immutable NTFS ACLs.
export function validateTrustedWorkerPaths({ nodePath, releaseRoot, auditPath }) {
  for (const [name, path] of Object.entries({ nodePath, releaseRoot, auditPath })) {
    if (typeof path !== 'string' || !win32.isAbsolute(path) || !/^[A-Za-z]:\\/.test(path) ||
        /[\r\n"]/u.test(path) || path.includes('..') || path.includes(':', 2)) {
      throw new Error('Invalid trusted worker ' + name + '.');
    }
  }
  if (win32.basename(nodePath).toLowerCase() !== 'node.exe') throw new Error('Invalid trusted Node path.');
  const normalized = [nodePath, releaseRoot, auditPath].map(path => win32.normalize(path).toLowerCase());
  if (new Set(normalized).size !== 3) throw new Error('Worker paths must be distinct.');
  return Object.freeze({ nodePath, releaseRoot, auditPath });
}
