// Stage at scripts/release/unified-install/. Called by the fixed root entry.
import {lstat, open, readFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join} from 'node:path';
import {parseStrictJson} from '../../../packages/application/src/unified-import-contract.ts';
import {combinedSha256 as hash, loadFresh35CompactZeroSource} from './fresh35-combined-source-v1.mjs';
import {describeFresh35CombinedTarget, fresh35CombinedTargetGuard} from './fresh35-combined-target-v1.mjs';
import {buildFresh35CompactZeroCatalog, buildFresh35SyntheticPrefix155Catalog, describeFresh35CombinedCatalog,
  fresh35CombinedCatalogSql, validateFresh35CombinedCatalogObservation, assertFresh35CombinedCatalogCurrent} from './fresh35-combined-catalog-v1.mjs';
import {FRESH35_COMBINED_AUTHORIZATION_PATH, describeFresh35CombinedProgram,
  loadFresh35CombinedAuthorization} from './fresh35-combined-lifecycle-v1.mjs';
import {FRESH35_COMBINED_RECORD_PATH, validateFresh35CombinedRecord} from './fresh35-combined-record-v1.mjs';
import {publishInstallationRecord} from './publish-installation-record.mjs';
import {assertTrustedRootPath} from './trusted-install-path.mjs';
import {prefixFixture, prefixInstallOrderName, syntheticPrefix155RecordPath, validateSyntheticPrefix155Record} from './synthetic-prefix155-record.mjs';

const need = (condition, code) => { if (!condition) throw Error(`FRESH35_SYNTHETIC_SQL39_${code}`); };
const statIdentity = s => [s.dev,s.ino,s.uid,s.gid,s.mode,s.nlink,s.size,s.mtimeNs,s.ctimeNs].join(':');

async function readProtectedParentRecord(workspace, readPrivate) {
  await assertTrustedRootPath(FRESH35_COMBINED_RECORD_PATH);
  const file=await open(FRESH35_COMBINED_RECORD_PATH,constants.O_RDONLY|constants.O_NOFOLLOW);
  try {
    const before=await file.stat({bigint:true});
    need(before.isFile()&&before.uid===0n&&before.gid===0n&&before.nlink===1n&&
      (before.mode&0o7777n)===0o644n&&before.size>0n&&before.size<=65536n,'PROTECTED_PARENT_REQUIRED');
    const bytes=await file.readFile();
    const actual=await lstat(FRESH35_COMBINED_RECORD_PATH,{bigint:true});
    const published=parseStrictJson(await readPrivate(join(workspace,'installation-result.json')));
    need(BigInt(bytes.length)===before.size&&statIdentity(before)===statIdentity(await file.stat({bigint:true}))&&
      statIdentity(before)===statIdentity(actual)&&published.state==='RECORD_DURABLY_PUBLISHED'&&
      published.recordPublished===true&&published.recordSha256===hash(bytes),'PARENT_PUBLICATION_DIFFERS');
    return bytes;
  } finally {await file.close();}
}

export async function installSyntheticPrefix155({root, target, paths, baseProgram, provisionSha256, deploymentManifestSha256,
  readPrivate, assertProvisionCurrent, openOwner}) {
  const physical = describeFresh35CombinedTarget(target);
  const workspace = physical.proposal.workspaceDirectory;
  const recordPath = syntheticPrefix155RecordPath(workspace);
  const recordBytes = await readProtectedParentRecord(workspace, readPrivate);
  const record = validateFresh35CombinedRecord(parseStrictJson(recordBytes.toString('utf8')),baseProgram);
  need(record.format==='FRESH35_COMBINED_INSTALLATION_RECORD_V1' && physical.format==='FRESH35_COMBINED_TARGET_BINDING_V1',
    'SYNTHETIC_PARENT_REQUIRED');
  const program = describeFresh35CombinedProgram(baseProgram);
  await loadFresh35CombinedAuthorization(baseProgram);
  const authBytes = await readPrivate(FRESH35_COMBINED_AUTHORIZATION_PATH);
  const consumed = parseStrictJson(await readPrivate(FRESH35_COMBINED_AUTHORIZATION_PATH+'.consumed'));
  need(hash(authBytes) === record.authorizationSha256 && consumed.authorizationSha256 === record.authorizationSha256 &&
    consumed.programSha256 === program.programSha256, 'PARENT_AUTHORIZATION_DIFFERS');
  const assertInputsCurrent=async()=>{
    await assertProvisionCurrent();
    need(hash(await readProtectedParentRecord(workspace,readPrivate))===hash(recordBytes)&&
      hash(await readPrivate(FRESH35_COMBINED_AUTHORIZATION_PATH))===record.authorizationSha256,
      'PARENT_INSTALL_AUTHORIZATION_CHANGED');
    const current=parseStrictJson(await readPrivate(FRESH35_COMBINED_AUTHORIZATION_PATH+'.consumed'));
    need(current.authorizationSha256===consumed.authorizationSha256&&current.programSha256===consumed.programSha256,
      'PARENT_INSTALL_CONSUMPTION_CHANGED');
  };
  await assertInputsCurrent();
  const source = await loadFresh35CompactZeroSource(root,paths);
  const parent = await buildFresh35CompactZeroCatalog(source,target,paths);
  const successor = await buildFresh35SyntheticPrefix155Catalog(source,target,paths);
  const descriptor = describeFresh35CombinedCatalog(successor);
  const manifestRaw=await readFile(join(root,prefixInstallOrderName),'utf8');
  need(hash(manifestRaw)===descriptor.patchSqlSha256,'PREFIX155_INSTALL_ORDER_DIFFERS');
  const order=parseStrictJson(manifestRaw);
  need(Array.isArray(order)&&order.length===12,'PREFIX155_TWELVE_LAYERS_REQUIRED');
  const layers=[];
  for(const [index,row] of order.entries()){
    const expected='sql/'+String(index+1).padStart(2,'0')+'-';
    need(row.order===index+1&&typeof row.file==='string'&&row.file.startsWith(expected)&&
      /^[a-z0-9/-]+[.]sql$/.test(row.file),'PREFIX155_LAYER_PATH_DIFFERS');
    const leaf=row.file.slice(4);
    const raw=await readFile(join(root,'adapters/postgres/patches/prefix155',leaf),'utf8');
    need(hash(raw)===row.sha256&&Buffer.byteLength(raw)===row.bytes&&
      raw.includes('\nBEGIN;\n')&&raw.endsWith('COMMIT;\n'),'PREFIX155_LAYER_BYTES_DIFFERS');
    layers.push(raw);
  }
  const base = {programSha256:program.programSha256,sourceSetSha256:program.sourceSetSha256,
    recordSha256:hash(recordBytes),authorizationSha256:record.authorizationSha256,provisionSha256};
  // O_EXCL within the already authorized, new synthetic workspace. Retain this
  // reservation on failure, including an ambiguous SQL COMMIT.
  await publishInstallationRecord(recordPath+'.attempt',JSON.stringify({base,patchSqlSha256:descriptor.patchSqlSha256})+'\n');
  const client = await openOwner();
  const send = async (sql,tag) => {
    const result = await client.query(sql);
    need(result.command === tag && client.getTransactionStatus() === (['COMMIT','ROLLBACK'].includes(tag)?'I':'T'), 'OWNER_WIRE_ACK_REQUIRED');
    return result;
  };
  const observe = async catalog => {
    const sql = fresh35CombinedCatalogSql(catalog,source,target);
    await send(sql.guardSql,'DO');
    const result = await send(sql.observationSql,'SELECT');
    need(result.rows?.length === 1 && typeof result.rows[0].catalog_json === 'string','OWNER_OBSERVATION_REQUIRED');
    return validateFresh35CombinedCatalogObservation(result.rows[0].catalog_json,catalog,source,target);
  };
  let observed;
  try {
    await send('BEGIN ISOLATION LEVEL READ COMMITTED','BEGIN');
    await send(fresh35CombinedTargetGuard(target),'DO');
    await observe(parent);
    await send('ROLLBACK','ROLLBACK');
    for(const [index,layer] of layers.entries()){
      const response=await client.query(layer);
      const replies=Array.isArray(response)?response:[response];
      need(replies[0]?.command==='BEGIN'&&replies.at(-1)?.command==='COMMIT'&&
        client.getTransactionStatus()==='I','PREFIX155_LAYER_COMMIT_UNCONFIRMED');
      await publishInstallationRecord(recordPath+'.layer-'+String(index+1),
        JSON.stringify({order:index+1,sqlSha256:hash(layer),commitAcknowledged:true})+'\n');
    }
    await send('BEGIN ISOLATION LEVEL READ COMMITTED','BEGIN');
    observed = await observe(successor);
    await assertFresh35CombinedCatalogCurrent(successor);
    await assertInputsCurrent();
    await send('ROLLBACK','ROLLBACK');
  } finally {
    try {
      if (['T','E'].includes(client.getTransactionStatus())) await send('ROLLBACK','ROLLBACK');
    } finally {
      try { await client.end(); }
      catch (error) { client.connection?.stream?.destroy(); throw error; }
    }
  }
  const value = {format:'FRESH35_SYNTHETIC_PREFIX155_COMMITTED_CATALOG_V1',target:physical,base,
    successor:{catalogSpecSha256:descriptor.catalogSpecSha256,modelSha256:descriptor.modelSha256,
      catalogSha256:observed.catalogSha256,patchSqlSha256:descriptor.patchSqlSha256},
    fixture:prefixFixture,deploymentManifestSha256};
  validateSyntheticPrefix155Record(value,target,baseProgram,successor);
  await assertInputsCurrent();
  await publishInstallationRecord(recordPath,JSON.stringify(value)+'\n');
  return {state:'SYNTHETIC_PREFIX155_OWNER_CATALOG_COMMITTED',successor:value.successor};
}
