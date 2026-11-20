import { constants } from 'node:fs';
import { lstat, realpath, open } from 'node:fs/promises';
import path from 'node:path';
/** Explicit private raw key only. No generation, environment lookup, chmod or logging. */
export async function readProductionCredentialRequestKey(filename: string): Promise<Buffer> {
  try {
    if (typeof filename !== 'string' || !path.isAbsolute(filename) || path.resolve(filename) !== filename || await realpath(filename) !== filename) throw Error();
    const parent=await lstat(path.dirname(filename)),before=await lstat(filename),uid=process.getuid?.();
    if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o022)!==0 || !before.isFile() || before.isSymbolicLink()
      || (before.mode & 0o777)!==0o600 || uid===undefined || before.uid!==uid || before.size!==32) throw Error();
    const file=await open(filename,constants.O_RDONLY|constants.O_NOFOLLOW);
    try {
      const first=await file.stat();
      if(first.dev!==before.dev || first.ino!==before.ino || first.uid!==uid || !first.isFile() || (first.mode&0o777)!==0o600 || first.size!==32) throw Error();
      const bytes=Buffer.alloc(33);const {bytesRead}=await file.read(bytes,0,33,0);const after=await file.stat();
      if(bytesRead!==32 || after.dev!==first.dev || after.ino!==first.ino || after.size!==32 || after.mode!==first.mode || after.uid!==first.uid || after.mtimeMs!==first.mtimeMs || after.ctimeMs!==first.ctimeMs) throw Error();
      return Buffer.from(bytes.subarray(0,32));
    } finally { await file.close(); }
  } catch { throw new TypeError('Private credential request key is unavailable or invalid'); }
}
