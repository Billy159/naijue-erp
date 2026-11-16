// Stage at scripts/release/unified-install/. Contains no connection inputs.
import {open, lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join} from 'node:path';
import {parseStrictJson} from '../../../packages/application/src/unified-import-contract.ts';
import {assertTrustedRootPath} from './trusted-install-path.mjs';
import {combinedSha256 as hash} from './fresh35-combined-source-v1.mjs';
import {describeFresh35CombinedTarget} from './fresh35-combined-target-v1.mjs';
import {describeFresh35CombinedProgram} from './fresh35-combined-lifecycle-v1.mjs';
import {describeFresh35CombinedCatalog} from './fresh35-combined-catalog-v1.mjs';

export const prefixFixture = Object.freeze({
  manifestSha256: '7d403ffcf72a5e1d849004ed97df624850e525dff09bebfa777633a69633deab',
  scopeSha256: 'c5d5939d20d79b1ef158043f760b00755c0547d04d60c4b33aac8bbf1edd1845',
});
export const prefixInstallOrderName = 'adapters/postgres/patches/prefix155/INSTALL-ORDER.json';
const successorName = 'synthetic-prefix155-successor.json';
const sha = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const need = (condition, code) => { if (!condition) throw Error(`FRESH35_SYNTHETIC_PREFIX155_${code}`); };
const closed = (value, keys) => value && Object.getPrototypeOf(value) === Object.prototype &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const identity = stat => [stat.dev,stat.ino,stat.uid,stat.gid,stat.mode,stat.nlink,stat.size,stat.mtimeNs,stat.ctimeNs].join(':');

export function syntheticPrefix155RecordPath(workspace) {
  need(typeof workspace === 'string' && /^\/var\/lib\/naijue-erp\/fresh35-isolated\/cloud-pg-fresh35-[0-9]{8}-r[1-9][0-9]{0,3}$/.test(workspace), 'WORKSPACE_REQUIRED');
  return join(workspace, successorName);
}

export async function readSyntheticPrefix155Record(workspace) {
  const path = syntheticPrefix155RecordPath(workspace);
  await assertTrustedRootPath(path);
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await file.stat({bigint:true});
    need(before.isFile() && before.uid === 0n && before.gid === 0n && before.nlink === 1n &&
      (before.mode & 0o7777n) === 0o644n && before.size > 0n && before.size <= 16384n, 'PROTECTED_RECORD_REQUIRED');
    const bytes = await file.readFile();
    const after = await file.stat({bigint:true});
    const current = await lstat(path,{bigint:true});
    need(BigInt(bytes.length) === before.size && identity(before) === identity(after) &&
      identity(before) === identity(current), 'RECORD_CHANGED');
    return {value:parseStrictJson(bytes.toString('utf8')), sha256:hash(bytes), identity:identity(before)};
  } finally { await file.close(); }
}

// Parsing and comparison only. The physical host independently observes PG.
export function validateSyntheticPrefix155Record(value, target, baseProgram, catalog) {
  const physical = describeFresh35CombinedTarget(target);
  const program = describeFresh35CombinedProgram(baseProgram);
  const final = describeFresh35CombinedCatalog(catalog);
  need(physical.format === 'FRESH35_COMBINED_TARGET_BINDING_V1' && !physical.purpose &&
    final.format === 'FRESH35_SYNTHETIC_PREFIX155_CATALOG_SPEC_V1', 'EXACT_SYNTHETIC_CATALOG_REQUIRED');
  need(closed(value,['format','target','base','successor','fixture','deploymentManifestSha256']) &&
    value.format === 'FRESH35_SYNTHETIC_PREFIX155_COMMITTED_CATALOG_V1' &&
    hash(JSON.stringify(value.target)) === program.targetSha256 &&
    value.target.proposal.workspaceDirectory === physical.proposal.workspaceDirectory &&
    sha(value.deploymentManifestSha256), 'PHYSICAL_BINDING_DIFFERS');
  const {base,successor,fixture} = value;
  need(closed(base,['programSha256','sourceSetSha256','recordSha256','authorizationSha256','provisionSha256']) &&
    base.programSha256 === program.programSha256 && base.sourceSetSha256 === program.sourceSetSha256 &&
    [base.recordSha256,base.authorizationSha256,base.provisionSha256].every(sha), 'BASE_INSTALL_DIFFERS');
  need(closed(successor,['catalogSpecSha256','modelSha256','catalogSha256','patchSqlSha256']) &&
    successor.catalogSpecSha256 === final.catalogSpecSha256 && successor.modelSha256 === final.modelSha256 &&
    successor.patchSqlSha256 === final.patchSqlSha256 && sha(successor.catalogSha256), 'SUCCESSOR_CATALOG_DIFFERS');
  need(closed(fixture,Object.keys(prefixFixture)) && Object.entries(prefixFixture).every(([key,digest])=>fixture[key]===digest), 'FIXTURE_DIFFERS');
  return value;
}
