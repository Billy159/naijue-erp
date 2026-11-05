/** Offline, uninstalled successor integration. Never admits a runtime catalog.
 * The old reviewed initializer runs first. This follow-on candidate verifies its
 * exact predecessor, replaces closure and rechecks the full access cohort in one
 * transaction. It must not be fed to the existing runtime installation record. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');
const signature = 'naijue_erp.standard_whole_package_closed_v2(uuid)';
const cohort = Object.freeze({
  kernel: Object.freeze({ file: '0027_standard_import_whole_package_v2.sql', sha256: 'f784d786f47255dcaa2958df07d3f3bf2d0056b5bdb2d77c5565ea5ee782f435' }),
  closure: Object.freeze({ file: '0027_standard_whole_closure_singletons_candidate.sql', sha256: '81e568fb146c239668f7cc57ad370a2a9a0a65ee81cd23ef7d1876f66829277c' }),
  access: Object.freeze({ file: '0027_standard_import_whole_package_access_v2.sql', sha256: 'a4210b92e4589dc31b5bf5f49af66b166d24dface7523095bc21adf2e8d9d5a8' }),
});
export async function readWholeClosureIntegrationSources(sourceRoot) {
  return Object.fromEntries(await Promise.all(Object.entries(cohort).map(async ([name, entry]) =>
    [name, await readFile(resolve(sourceRoot, 'adapters/postgres/patches', entry.file), 'utf8')])));
}
function routineBody(sql) {
  const matches = [...sql.matchAll(/CREATE OR REPLACE FUNCTION naijue_erp\.standard_whole_package_closed_v2\(root_operation uuid\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/g)];
  if (matches.length !== 1) throw Error('WHOLE_CLOSURE_INTEGRATION_ROUTINE_INVALID');
  return matches[0][1];
}
function transactionBody(sql) {
  if ((sql.match(/^BEGIN;$/gm) || []).length !== 1 || (sql.match(/^COMMIT;$/gm) || []).length !== 1 || !sql.endsWith('COMMIT;\n'))
    throw Error('WHOLE_CLOSURE_INTEGRATION_TRANSACTION_INVALID');
  return sql.replace(/^BEGIN;\n/m, '').slice(0, -'COMMIT;\n'.length);
}
export function compileWholeClosureIntegrationCandidate(sources) {
  if (!sources || Object.keys(sources).sort().join(',') !== 'access,closure,kernel') throw Error('WHOLE_CLOSURE_INTEGRATION_SOURCE_DIFFERS');
  for (const [name, entry] of Object.entries(cohort))
    if (typeof sources[name] !== 'string' || hash(sources[name]) !== entry.sha256) throw Error('WHOLE_CLOSURE_INTEGRATION_SOURCE_DIFFERS');
  const before = hash(routineBody(sources.kernel)), after = hash(routineBody(sources.closure));
  const originalPin = JSON.stringify({ signature, sha256: before, new: true });
  const successorPin = JSON.stringify({ signature, sha256: after, new: true });
  if (before === after || sources.access.split(originalPin).length !== 2 || !sources.closure.includes(`IS DISTINCT FROM '${before}'`))
    throw Error('WHOLE_CLOSURE_INTEGRATION_PREDECESSOR_INVALID');
  // Only the immutable expected body digest changes. Owner/ACL/trigger checks,
  // metadata predicates and exact wrapper permissions remain byte-for-byte.
  const accessSql = sources.access.replace(originalPin, successorPin);
  const sql = '-- UNINSTALLED REVIEW CANDIDATE. Runtime catalog successor required.\n' +
    '-- PostgreSQL execution and metadata/ACL preservation are NOT VERIFIED.\n' +
    'BEGIN;\n' + transactionBody(sources.closure) + '\n' + transactionBody(accessSql) + 'COMMIT;\n';
  return {
    sql, accessSql,
    manifest: {
      format: 'WHOLE_CLOSURE_INTEGRATION_REVIEW_CANDIDATE_V1', engineExecuted: false, reviewed: false,
      runtimeCatalogAdmitted: false, sqlSha256: hash(sql),
      routineChanges: [{ signature, before, after }],
      sourcePins: Object.values(cohort).map(entry => ({ path: 'adapters/postgres/patches/' + entry.file, sha256: entry.sha256 })),
      requiredNextGate: 'INDEPENDENT_ENGINE_AND_METADATA_REVIEW_THEN_VERSIONED_RUNTIME_CATALOG_SUCCESSOR',
    },
  };
}
export async function renderWholeClosureIntegrationCandidate(sourceRoot) {
  return compileWholeClosureIntegrationCandidate(await readWholeClosureIntegrationSources(sourceRoot));
}

// Explicit successor candidate entry. The original singleton renderer and its
// artifact are unchanged. This proposal is NOT a genuine runtime source spec.
const batchCandidate = Object.freeze({ file: '0027_standard_whole_closure_batch_binding_candidate.sql', sha256: '3d6d3df968d2926a45d50efb89c158961e8e2f58a1f07d451fd81f117dc7b608' });
export function compileWholeBatchClosureIntegrationCandidate(sources, batchSql) {
  const original = compileWholeClosureIntegrationCandidate(sources);
  if (typeof batchSql !== 'string' || hash(batchSql) !== batchCandidate.sha256) throw Error('WHOLE_BATCH_INTEGRATION_SOURCE_DIFFERS');
  const { before, after: intermediate } = original.manifest.routineChanges[0];
  const after = hash(routineBody(batchSql));
  if (after === intermediate || !batchSql.includes(`IS DISTINCT FROM '${intermediate}'`)) throw Error('WHOLE_BATCH_INTEGRATION_PREDECESSOR_INVALID');
  const predecessorPin = JSON.stringify({ signature, sha256: before, new: true });
  const successorPin = JSON.stringify({ signature, sha256: after, new: true });
  const accessSql = sources.access.replace(predecessorPin, successorPin);
  const sql = '-- UNINSTALLED COMBINED REVIEW CANDIDATE. Runtime admission REFUSED.\n' +
    '-- Contains 2 GRANT and 8 REVOKE statements; target-specific authorization required.\n' +
    'BEGIN;\n' + transactionBody(sources.closure) + '\n' + transactionBody(batchSql) + '\n' + transactionBody(accessSql) + 'COMMIT;\n';
  const changes = [{ signature, before, after }];
  return {
    sql, accessSql,
    catalogPinProposal: {
      format: 'WHOLE_CLOSURE_CATALOG_PIN_PROPOSAL_V1', independentlyReviewed: false,
      installedCatalogSha256: null, sourceSpecSha256: null, changes,
      requiredDisposition: 'REVIEW_AND_VERSION_SOURCE_COHORT_THEN_INDEPENDENTLY_ATTEST_INSTALLED_CATALOG',
    },
    manifest: {
      format: 'WHOLE_BATCH_CLOSURE_INTEGRATION_REVIEW_CANDIDATE_V1', engineExecuted: false, reviewed: false,
      runtimeCatalogAdmitted: false, admissionDisposition: 'REFUSED_PENDING_VERSIONED_INSTALLATION_REVIEW',
      sqlSha256: hash(sql), routineChanges: changes,
      predecessorChain: [{ signature, before, after: intermediate }, { signature, before: intermediate, after }],
      sourcePins: [...original.manifest.sourcePins, { path: 'adapters/postgres/patches/' + batchCandidate.file, sha256: batchCandidate.sha256 }],
      permissions: { grantStatements: 2, revokeStatements: 8, changedFromExistingAccessPolicy: false, executed: false, actualAclDeltaVerified: false },
    },
  };
}
export async function renderWholeBatchClosureIntegrationCandidate(sourceRoot) {
  return compileWholeBatchClosureIntegrationCandidate(await readWholeClosureIntegrationSources(sourceRoot),
    await readFile(resolve(sourceRoot, 'adapters/postgres/patches', batchCandidate.file), 'utf8'));
}
