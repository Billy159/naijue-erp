#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// Python helpers remain self-contained when delivered by the existing T45 carrier.
// Only this generated block is copied; the JSON is the editable source of facts.
const root = new URL('../../', import.meta.url);
const begin = '# BEGIN GENERATED RELEASE CONTRACT';
const end = '# END GENERATED RELEASE CONTRACT';

export function contractBlock(contract, sourceBytes = Buffer.from(JSON.stringify(contract, null, 2) + '\n')) {
  const keys = ['format', 'migrationCount', 'fontLicense', 'runtimeSqlPatches', 'full', 'node', 'requestBodyBudgets', 'entrypoints'];
  if (!contract || Object.keys(contract).sort().join() !== keys.sort().join()
      || contract.format !== 'naijue-release-contract-v1' || contract.migrationCount !== 26
      || !Array.isArray(contract.runtimeSqlPatches) || !Array.isArray(contract.requestBodyBudgets)
      || !/^24\.[0-9]+\.[0-9]+$/.test(contract.node)) throw Error('INVALID_RELEASE_CONTRACT');
  const exactKeys = (value, names) => value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join() === [...names].sort().join();
  if (!exactKeys(contract.fontLicense, ['source', 'member'])
      || contract.fontLicense.source !== 'apps/web/demo-replica/frontend/assets/fonts/LICENSE.txt'
      || contract.fontLicense.member !== 'web/source-styles/assets/fonts/LICENSE.txt'
      || !exactKeys(contract.full, ['profile', 'patchLevel', 'catalogProfiles'])
      || typeof contract.full.profile !== 'string' || !/^source-confirmed-native-exact26-r3-v[1-9][0-9]*$/.test(contract.full.profile)
      || typeof contract.full.patchLevel !== 'string' || !/^26_[A-Za-z0-9_]+$/.test(contract.full.patchLevel)) {
    throw Error('INVALID_RELEASE_CONTRACT');
  }
  // Registered profile semantics are finite, not caller-selectable ACL relaxations.
  const profiles = {
    'legacy-v1': {format: 'EXACT26_RUNTIME_CATALOG_EXPORT_V1', patchLevel: '26_hv2_history_set_guards_from_v22', aclProofField: null},
    'complete-write-v6': {format: 'EXACT26_RUNTIME_CATALOG_EXPORT_V6', patchLevel: '26_hv2_history_set_guards_complete_write_xmin_from_v22', aclProofField: 'complete_write_xmin_acl_match'},
    'recorded-live-ledger-v7': {format: 'EXACT26_RUNTIME_CATALOG_EXPORT_V7', patchLevel: '26_hv2_live_ledger_pairs_complete_write_xmin_from_v22', aclProofField: 'complete_write_xmin_acl_match', observationProofField: 'recorded_live_balance_contract_match', requiredObservation: 'RECORDED_LIVE_LEDGER_PAIRS_V7', runtimeSqlPatch: 'adapters/postgres/patches/0026-live-ledger-balance-pairs.sql'},
    'recorded-live-write-v8': {"format": "EXACT26_RUNTIME_CATALOG_EXPORT_V8", "patchLevel": "26_hv2_live_pairs_complete_write_acl_v8_from_v7", "aclProofField": "complete_write_system_acl_match_v8", "deleteAclProofField": "normal_delete_acl_match_v8", "observationProofField": "recorded_live_balance_contract_match", "requiredObservation": "RECORDED_LIVE_LEDGER_PAIRS_COMPLETE_WRITE_V8", "runtimeSqlPatch": "adapters/postgres/patches/0026-live-ledger-balance-pairs.sql"},
  };
  if (contract.full.patchLevel !== profiles['legacy-v1'].patchLevel) throw Error('INVALID_RELEASE_LEGACY_PROFILE_DRIFT');
  if (!exactKeys(contract.full.catalogProfiles, Object.keys(profiles))) throw Error('INVALID_RELEASE_CATALOG_PROFILE');
  for (const [name, expected] of Object.entries(profiles)) {
    const actual = contract.full.catalogProfiles[name];
    if (!exactKeys(actual, Object.keys(expected)) || Object.entries(expected).some(([key, value]) => actual[key] !== value))
      throw Error('INVALID_RELEASE_CATALOG_PROFILE');
  }
  if (!exactKeys(contract.entrypoints, ['frontend', 'backend'])) throw Error('INVALID_RELEASE_ENTRYPOINTS');
  for (const kind of ['frontend', 'backend']) {
    const entry = contract.entrypoints[kind];
    if (!exactKeys(entry, ['source', 'member']) || typeof entry.source !== 'string' || typeof entry.member !== 'string'
        || !(kind === 'frontend'
          ? /^apps\/web\/demo-replica\/frontend\/[A-Za-z0-9_-]+\.ts$/.test(entry.source) && /^web\/[A-Za-z0-9_-]+\.js$/.test(entry.member)
          : /^apps\/api\/src\/production[-A-Za-z0-9_]*\.ts$/.test(entry.source) && /^backend\/production[-A-Za-z0-9_]*\.js$/.test(entry.member))) {
      throw Error('INVALID_RELEASE_ENTRYPOINTS');
    }
  }
  const sources = new Set(), members = new Set(), routes = new Set();
  for (const row of contract.runtimeSqlPatches) {
    if (!exactKeys(row, ['source', 'member']) || typeof row.source !== 'string' || typeof row.member !== 'string'
        || !/^adapters\/postgres\/patches\/[A-Za-z0-9_-]+\.sql$/.test(row.source)
        || row.member !== row.source.slice('adapters/postgres/'.length)
        || sources.has(row.source) || members.has(row.member)) throw Error('INVALID_RELEASE_PATCH');
    sources.add(row.source); members.add(row.member);
  }
  // Packaged source artifact only; this registration never applies SQL or grants.
  // A V7 descriptor may not borrow the original11 patch closure without its DDL.
  const livePatch = contract.runtimeSqlPatches.at(-1);
  if (!livePatch || livePatch.source !== profiles['recorded-live-ledger-v7'].runtimeSqlPatch
      || livePatch.member !== 'patches/0026-live-ledger-balance-pairs.sql')
    throw Error('INVALID_RELEASE_V7_STORAGE_PATCH');
  for (const row of contract.requestBodyBudgets) {
    if (!exactKeys(row, ['path', 'bytes']) || typeof row.path !== 'string'
        || !/^\/api\/[a-z0-9/-]+$/.test(row.path) || routes.has(row.path)
        || !Number.isSafeInteger(row.bytes) || row.bytes <= 0) throw Error('INVALID_RELEASE_BODY_BUDGET');
    routes.add(row.path);
  }
  // An ASCII JSON literal avoids Python escape or platform encoding differences.
  const literal = JSON.stringify(contract).replace(/[\u007f-\uffff]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  if (literal.includes("'''")) throw Error('INVALID_RELEASE_LITERAL');
  const source = JSON.stringify({path: 'config/release-contract.json', bytes: sourceBytes.length,
    sha256: createHash('sha256').update(sourceBytes).digest('hex')});
  return `${begin}\n# Generated from config/release-contract.json; edit that source, then regenerate.\nRELEASE_CONTRACT = json.loads(r'''${literal}''')\nRELEASE_CONTRACT_SOURCE = json.loads(r'''${source}''')\n${end}`;
}

// Current helper requires capacityHost; boot-entry selects this exact pin first.
// Legacy FULL approval remains immutable and is never used as a fallback.
export function requireReviewedCapacityHelper(deploy, boot) {
  const declarations = [...boot.matchAll(/^[ \t]*DEPLOYMENT_CAPACITY_SHA256\b[^\r\n]*$/gm)];
  const pin = declarations.length === 1 && declarations[0][0].match(/^DEPLOYMENT_CAPACITY_SHA256 = '([a-f0-9]{64})'$/);
  if (!pin) throw Error('DEPLOYMENT_CAPACITY_PIN_REQUIRED');
  if (createHash('sha256').update(deploy).digest('hex') !== pin[1])
    throw Error('DEPLOYMENT_HELPER_REAPPROVAL_REQUIRED');
  return pin[1];
}

export async function generateReleaseContract(check = false) {
  const sourceBytes = await readFile(new URL('config/release-contract.json', root));
  const block = contractBlock(JSON.parse(sourceBytes), sourceBytes);
  const deployPath = new URL('scripts/release/deploy-candidate.py', root);
  const oldDeploy = await readFile(deployPath, 'utf8');
  const pattern = /# BEGIN GENERATED RELEASE CONTRACT[\s\S]*?# END GENERATED RELEASE CONTRACT/;
  if (!pattern.test(oldDeploy)) throw Error('RELEASE_CONTRACT_MARKERS_MISSING');
  const deploy = oldDeploy.replace(pattern, () => block);
  const bootPath = new URL('scripts/release/boot-entry.py', root);
  const oldBoot = await readFile(bootPath, 'utf8');
  if (check) {
    if (deploy !== oldDeploy) throw Error('RELEASE_CONTRACT_GENERATED_OUTPUT_STALE');
    requireReviewedCapacityHelper(deploy, oldBoot);
  } else {
    if (deploy !== oldDeploy) await writeFile(deployPath, deploy);
    // Approval pins are not generated facts. A distinct reviewed change is required.
    requireReviewedCapacityHelper(deploy, oldBoot);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.slice(2).some(arg => arg !== '--check') || process.argv.length > 3) throw Error('USAGE');
  await generateReleaseContract(process.argv.includes('--check'));
}
