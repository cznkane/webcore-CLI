import { createHash, timingSafeEqual } from 'node:crypto';
import { open, lstat, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep, win32 } from 'node:path';

const DIGEST = /^[a-f0-9]{64}$/;
export async function verifyReleaseFile({ root, relativePath, expectedSha256 }, { inspect = lstat, canonical = realpath, openFile = open } = {}) {
  if (typeof root !== 'string' || !isAbsolute(root)) throw new Error('Trusted absolute release root required.');
  if (typeof relativePath !== 'string' || !relativePath || isAbsolute(relativePath) ||
      win32.isAbsolute(relativePath) || relativePath.includes(':') ||
      relativePath.split(/[\\/]/).some(part => part === '..' || part === '.' || !part)) {
    throw new Error('Invalid release path.');
  }
  if (typeof expectedSha256 !== 'string' || !DIGEST.test(expectedSha256)) throw new Error('Trusted release digest required.');
  const rootReal = await canonical(root);
  const target = resolve(rootReal, relativePath);
  const targetReal = await canonical(target);
  const rel = relative(rootReal, targetReal);
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw new Error('Release path escapes trusted root.');
  const stat = await inspect(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Release target must be a regular file.');
  const handle = await openFile(targetReal, 'r');
  try {
    const digest = createHash('sha256');
    const stream = handle.createReadStream({ autoClose: false });
    for await (const chunk of stream) digest.update(chunk);
    if (!timingSafeEqual(digest.digest(), Buffer.from(expectedSha256, 'hex'))) throw new Error('Release integrity mismatch.');
    return Object.freeze({ verified: true, path: targetReal });
  } finally { await handle.close(); }
}
