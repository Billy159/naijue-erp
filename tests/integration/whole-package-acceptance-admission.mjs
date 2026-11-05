/** Required independently reviewed installed-catalog admission for engine cases.
 * Uses the unchanged OS-trusted installation record and genuine source-spec gate.
 * No caller reference, inferred approval, record writes or successor activation.
 * One isolated target per trusted record/executor. NOT EXECUTED on import.
 * Caller must retain exclusive physical-client ownership and prevent concurrent
 * DDL/ACL/admin changes from this check through case completion/cleanup.
 * ROLLBACK releases the read snapshot: this is not a persistent admission lease
 * and does not enforce an external administrator lock or close the DDL race. */
import { fileURLToPath } from 'node:url';
import { loadWholeCatalogSpec, verifyWholeInstalledCatalog } from '../../scripts/release/unified-install/whole-catalog-gate.mjs';
import { loadWholeBatchClosureSpecV1, verifyWholeBatchClosureInstalledV1 } from '../../scripts/release/unified-install/whole-batch-closure-catalog-v1.mjs';
import { loadWholeInstallationRecord } from '../../scripts/release/unified-install/whole-installation-record.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const ack = (result, command) => {
  const value = result && Object.getOwnPropertyDescriptor(result, 'command');
  if (!value || !Object.hasOwn(value, 'value') || value.value !== command) throw Error('ACCEPTANCE_CATALOG_CONTROL_UNCERTAIN');
};
export async function admitWholePackageAcceptanceTarget(client) {
  // Fail before BEGIN if no independently installed trusted reference exists.
  const spec = await loadWholeCatalogSpec(root);
  const reviewed = await loadWholeInstallationRecord(spec);
  let began = false, rollbackAttempted = false;
  try {
    ack(await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'), 'BEGIN'); began = true;
    const admission = await verifyWholeInstalledCatalog(client, spec, reviewed);
    rollbackAttempted = true;
    ack(await client.query('ROLLBACK'), 'ROLLBACK'); began = false;
    return admission;
  } catch (error) {
    if (began && !rollbackAttempted) {
      try { ack(await client.query('ROLLBACK'), 'ROLLBACK'); } catch { /* Never report admission. */ }
    }
    try { await client.end(); } catch { /* The target remains unadmitted. */ }
    throw error;
  }
}

/** Explicit successor lane only. The versioned verifier independently loads its
 * fixed OS-trusted record; absence/mismatch cannot fall back to the old profile.
 * Same exclusive-client/no-concurrent-admin-change prerequisite as above. */
export async function admitWholeBatchClosureAcceptanceTargetV1(client) {
  const spec = await loadWholeBatchClosureSpecV1(root);
  let began = false, rollbackAttempted = false;
  try {
    ack(await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'), 'BEGIN'); began = true;
    const admission = await verifyWholeBatchClosureInstalledV1(client, spec);
    rollbackAttempted = true;
    ack(await client.query('ROLLBACK'), 'ROLLBACK'); began = false;
    return admission;
  } catch (error) {
    if (began && !rollbackAttempted) {
      try { ack(await client.query('ROLLBACK'), 'ROLLBACK'); } catch { /* Never report admission. */ }
    }
    try { await client.end(); } catch { /* The target remains unadmitted. */ }
    throw error;
  }
}
