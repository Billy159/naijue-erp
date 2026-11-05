/** Fresh synthetic V7 file/SQL protocol only; never a real catalog, review, grant,
 * deployment approval, engine result, or upgrade of an existing V1–V6 receipt. */
import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BoundedPostgresResult } from '../../adapters/postgres/src/bounded-pool.ts';
import { NATIVE_RUNTIME26_IDENTITY_PROBE, NATIVE_RUNTIME26_LIVE_LEDGER_PAIRS_V7_METADATA_PROBE } from '../../adapters/postgres/src/native-import-accounting-capability.ts';

export function createSyntheticV7Fixture(target: { readonly database: string; readonly user: string }, purposes: readonly string[] = [
  'PRODUCT_SEASONS_READ', 'CURRENT_CUSTOMER_READ_WRITE', 'CURRENT_FORM_READ', 'HISTORY_READ', 'INVENTORY_ADMISSION'
]) {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'NEW-SYNTHETIC-API-LIVE-V7-'));
  const independent = join(directory, 'independent.json'), reviewFile = join(directory, 'review.json');
  const hash = (value: string) => createHash('sha256').update(value).digest('hex'), digest = '7'.repeat(64);
  const exactTarget = { database: target.database, databaseOid: '123', actingRole: target.user, sessionUser: target.user,
    serverAddress: null, serverPort: null, postmasterStart: '2026-10-30 00:00:00+00' };
  const receipt = JSON.stringify({ result: 'PASS', notice: 'NEW_SYNTHETIC_V7_DRIVER_PROTOCOL_ONLY_NOT_ACTUAL_CATALOG_OR_APPROVAL' });
  writeFileSync(independent, receipt, { mode: 0o600 });
  const body = JSON.stringify({ version: 'C_NATIVE_RUNTIME26_REVIEW_V1', decision: 'ACCEPT_EXACT_RUNTIME26_TARGET_METADATA', target: exactTarget,
    catalog: { format: 'EXACT26_RUNTIME_CATALOG_EXPORT_V7', patchLevel: '26_hv2_live_ledger_pairs_complete_write_xmin_from_v22', sha256: digest },
    purposes, scope: 'EXACT_TARGET_METADATA_ONLY', independentReview: { path: independent, sha256: hash(receipt), result: 'PASS' }, realImportExecutionAuthorized: false });
  writeFileSync(reviewFile, body, { mode: 0o600 });
  const observation = { identity: { database: exactTarget.database, database_oid: exactTarget.databaseOid, database_owner: 'synthetic_owner',
    current_user: exactTarget.actingRole, session_user: exactTarget.sessionUser, server_version_num: '170011', server_addr: null, server_port: null,
    postmaster_start: exactTarget.postmasterStart, replication_role: 'origin' }, migration_versions: Array.from({ length: 26 }, (_, i) => i + 1),
    catalog_sha256: digest, source_routines_match: true, complete_write_xmin_acl_match: true, recorded_live_balance_contract_match: true };
  return { review: { reviewFile, trustedReviewSha256: hash(body) }, observation,
    query(sql: string): BoundedPostgresResult | undefined {
      if (sql === NATIVE_RUNTIME26_LIVE_LEDGER_PAIRS_V7_METADATA_PROBE) return { rows: [structuredClone(observation)], rowCount: 1 };
      if (sql === NATIVE_RUNTIME26_IDENTITY_PROBE) return { rows: [{ identity: structuredClone(observation.identity) }], rowCount: 1 };
      return undefined;
    }, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}
