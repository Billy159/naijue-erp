#!/usr/bin/env node
/** DISABLED candidate finalization for an already-installed, independently reviewed
 * successor. Never installs SQL, captures approval or runs on import. Future use
 * requires target/record-publication authorization and an exclusive admin window.
 * Do not launch as root: checks inside Node cannot establish trusted startup or
 * prevent preload/static-import execution. Independent pre-Node launch assurance
 * and a separately reviewed successor are required before enabling this path. */
import { open, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname } from 'node:path';
import { parseStrictJson } from '../../../packages/application/src/unified-import-contract.ts';
import { assertTrustedRootPath, assertTrustedRootTree } from './trusted-install-path.mjs';
import { publishInstallationRecord } from './publish-installation-record.mjs';
import { WHOLE_CATALOG_QUERY, verifyWholeCatalogPacket } from './whole-catalog-gate.mjs';
import { loadWholeBatchClosureSpecV1 } from './whole-batch-closure-catalog-v1.mjs';
import { WHOLE_BATCH_CLOSURE_RECORD_V1_PATH, validateWholeBatchClosureRecordV1 } from './whole-batch-closure-record-v1.mjs';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const directory = dirname(WHOLE_BATCH_CLOSURE_RECORD_V1_PATH);
const reviewPath = directory + '/whole-batch-closure-review-v1.json';
const configPath = directory + '/whole-batch-closure-finalize-config-v1.json';
const need = (ok, code) => { if (!ok) throw Error(code); };
const ack = (result, tag) => {
  const value = result && Object.getOwnPropertyDescriptor(result, 'command');
  need(value && Object.hasOwn(value, 'value') && value.value === tag, 'FINALIZE_CONTROL_ACK_INVALID');
};
async function rootJson(path, privateFile = false) {
  await assertTrustedRootPath(path);
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    need(stat.isFile() && stat.uid === 0 && stat.nlink === 1 && (stat.mode & (privateFile ? 0o077 : 0o022)) === 0 && stat.size > 0 && stat.size <= 65536, 'FINALIZE_ROOT_INPUT_UNTRUSTED');
    const text = await file.readFile('utf8'); need(Buffer.byteLength(text) <= 65536, 'FINALIZE_INPUT_TOO_LARGE');
    return { text, value: parseStrictJson(text) };
  } finally { await file.close(); }
}
export function validateWholeBatchFinalizerReview(value, spec) {
  need(value && Object.keys(value).sort().join(',') === 'combinedSqlSha256,format,record' && value.format === 'WHOLE_BATCH_CLOSURE_INDEPENDENT_REVIEW_V1', 'FINALIZE_INDEPENDENT_REVIEW_REQUIRED');
  need(value.combinedSqlSha256 === spec.combined_sql_sha256, 'FINALIZE_REVIEWED_SQL_DIFFERS');
  validateWholeBatchClosureRecordV1(value.record, spec);
  return structuredClone(value);
}
async function main() {
  throw Error('FINALIZE_TRUSTED_PRE_NODE_LAUNCH_REQUIRED');
  // Unreachable candidate only. No argv/env/config token may bypass this stop.
  // This blocks the candidate's operations, not Node startup or static imports.
  need(process.argv.length === 3 && process.argv[2] === '--finalize-reviewed-batch-closure-v1', 'FINALIZE_EXPLICIT_INVOCATION_REQUIRED');
  need(process.getuid?.() === 0, 'FINALIZE_ROOT_REQUIRED');
  need(!Object.keys(process.env).some(key => key === 'DATABASE_URL' || key.startsWith('PG') || key === 'NODE_OPTIONS' || key === 'NODE_PATH' || key.startsWith('LD_') || key.startsWith('DYLD_')), 'FINALIZE_CLEAN_ENVIRONMENT_REQUIRED');
  await assertTrustedRootPath(process.execPath); await assertTrustedRootTree(root);
  for (const path of [dirname(directory), directory]) {
    const stat = await lstat(path);
    need(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === 0 && (stat.mode & 0o022) === 0, 'FINALIZE_DIRECTORY_UNTRUSTED');
  }
  // Do not contact PostgreSQL if any record already exists. Publisher also uses
  // exclusive no-overwrite publication against races; never unlink the record.
  try { await lstat(WHOLE_BATCH_CLOSURE_RECORD_V1_PATH); throw Error('FINALIZE_RECORD_ALREADY_EXISTS'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const spec = await loadWholeBatchClosureSpecV1(root);
  const reviewInput = await rootJson(reviewPath), review = validateWholeBatchFinalizerReview(reviewInput.value, spec);
  const configInput = await rootJson(configPath, true), config = configInput.value;
  need(config && Object.keys(config).sort().join(',') === 'database,host,noConcurrentDdlAclAdminChanges,password,port,user', 'FINALIZE_CONFIG_INVALID');
  if (config.noConcurrentDdlAclAdminChanges !== true) throw Error('FINALIZE_EXCLUSIVE_WINDOW_REQUIRED');
  need(['127.0.0.1', '::1'].includes(config.host) && Number.isSafeInteger(config.port) && config.port > 1024 && config.port <= 65535 &&
    typeof config.database === 'string' && /^synthetic_whole_[a-z0-9_]{1,48}$/.test(config.database) && config.database === review.record.binding.database_name && config.user === review.record.binding.controller && typeof config.password === 'string', 'FINALIZE_CONFIG_TARGET_DIFFERS');
  const { Client } = await import('pg');
  const client = new Client({ host: config.host, port: config.port, database: config.database, user: config.user, password: () => config.password,
    ssl: false, application_name: 'whole-batch-closure-finalizer-v1', connectionTimeoutMillis: 5000, query_timeout: 15000,
    options: '-c search_path=pg_catalog -c statement_timeout=10000 -c lock_timeout=2000' });
  let began = false, rollbackAttempted = false;
  try {
    await client.connect();
    ack(await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'), 'BEGIN'); began = true;
    ack(await client.query('SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp'), 'SET');
    const result = await client.query(WHOLE_CATALOG_QUERY, [JSON.stringify(spec.pins)]); ack(result, 'SELECT');
    need(result.rows?.length === 1 && typeof result.rows[0].catalog_json === 'string', 'FINALIZE_CATALOG_REJECTED');
    const raw = result.rows[0].catalog_json;
    verifyWholeCatalogPacket(raw, review.record.binding, spec.source_spec_sha256);
    rollbackAttempted = true; ack(await client.query('ROLLBACK'), 'ROLLBACK'); began = false;
  } finally {
    try { if (began && !rollbackAttempted) ack(await client.query('ROLLBACK'), 'ROLLBACK'); }
    finally { await client.end(); }
  }
  need((await loadWholeBatchClosureSpecV1(root)).source_spec_sha256 === spec.source_spec_sha256, 'FINALIZE_SOURCE_CHANGED');
  need((await rootJson(reviewPath)).text === reviewInput.text, 'FINALIZE_REVIEW_CHANGED');
  need((await rootJson(configPath, true)).text === configInput.text, 'FINALIZE_CONFIG_CHANGED');
  // Publish the independently reviewed record, never a newly observed digest.
  await publishInstallationRecord(WHOLE_BATCH_CLOSURE_RECORD_V1_PATH, JSON.stringify(review.record) + '\n');
  process.stdout.write('Reviewed successor installation record published; engine acceptance remains separate.\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => {
  if (/^[A-Z][A-Z0-9_]+$/.test(error?.message ?? '')) process.stderr.write(error.message + '\n');
  process.stderr.write(error?.message === 'INSTALL_RECORD_PUBLISHED_DURABILITY_UNKNOWN'
    ? 'Record publication occurred but durability is uncertain. Inspect the existing record and target; do not retry blindly.\n'
    : 'Finalization not confirmed. Inspect the authorized setup without logging private configuration.\n');
  process.exitCode = 1;
});
