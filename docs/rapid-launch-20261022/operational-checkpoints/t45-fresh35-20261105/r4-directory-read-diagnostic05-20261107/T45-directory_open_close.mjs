import { opendir } from 'node:fs/promises';

// Temporary fixed diagnostic input; never an application or import entrypoint.
export async function directoryOpenClose(phase) {
  if (!['0710', '0750'].includes(phase)) throw new Error('FIXED_PHASE_REQUIRED');
  const identity = { uid: process.getuid(), gid: process.getgid(), groups: process.getgroups(), nodeVersion: process.version };
  if (identity.uid !== 61035 || identity.gid !== 61035 || identity.groups.some(value => value !== 61035) || identity.nodeVersion !== 'v24.21.0') {
    return { state: 'IDENTITY_REFUSED', phase, identity, observations: [] };
  }
  const observations = [];
  for (const [slot, path] of [
    ['PACKAGE_ROOT', '/var/lib/naijue-erp/fresh35-production/real-r3/package'],
    ['TABLES_DIRECTORY', '/var/lib/naijue-erp/fresh35-production/real-r3/package/tables'],
  ]) {
    let directory;
    let operation = 'OPENDIR';
    try {
      directory = await opendir(path);
      operation = 'CLOSE';
      await directory.close();
      directory = undefined;
      observations.push({ slot, opened: true, closed: true, code: 'OK' });
    } catch (error) {
      const code = ['EACCES', 'EPERM', 'ENOENT', 'ENOTDIR', 'EIO'].includes(error?.code) ? error.code : 'OTHER_OS_FAILURE';
      observations.push({ slot, opened: operation === 'CLOSE', closed: false, code, operation });
      if (directory) {
        try { await directory.close(); } catch { /* The process owner records failure and reaps this child. */ }
      }
    }
  }
  const expected = phase === '0710'
    ? observations.every(value => value.opened === false && value.code === 'EACCES')
    : observations.every(value => value.opened === true && value.closed === true && value.code === 'OK');
  return { state: expected ? 'EXPECTED_DIRECTORY_OBSERVATIONS' : 'UNEXPECTED_DIRECTORY_OBSERVATIONS', phase, identity, observations, readCalled: false, iterationStarted: false, payloadRead: false };
}
