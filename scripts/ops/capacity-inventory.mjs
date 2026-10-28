#!/usr/bin/env node
// A02 finite read-only inventory. No implicit target, deletion, admission or budget selection.
import { lstat, realpath, opendir, statfs, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BoundedPostgresPool } from '../../adapters/postgres/src/bounded-pool.ts';

export const SESSION_INVENTORY_SQL = `/* capacity-inventory:sessions */ SELECT
 count(*)::text AS total,
 count(*) FILTER(WHERE revoked_at IS NULL AND created_at<=CURRENT_TIMESTAMP AND expires_at>CURRENT_TIMESTAMP)::text AS effective,
 count(*) FILTER(WHERE revoked_at IS NULL AND expires_at<=CURRENT_TIMESTAMP)::text AS expired,
 count(*) FILTER(WHERE revoked_at IS NOT NULL)::text AS revoked,
 count(*) FILTER(WHERE revoked_at IS NULL AND created_at>CURRENT_TIMESTAMP AND expires_at>CURRENT_TIMESTAMP)::text AS future_created
 FROM naijue_erp.auth_session`;
export const STORAGE_INVENTORY_SQL = `/* capacity-inventory:storage */ SELECT
 pg_relation_size('naijue_erp.auth_session'::regclass)::text AS relation_bytes,
 pg_indexes_size('naijue_erp.auth_session'::regclass)::text AS index_bytes,
 pg_total_relation_size('naijue_erp.auth_session'::regclass)::text AS total_relation_bytes,
 pg_database_size(current_database())::text AS database_bytes`;
export const INDEX_INVENTORY_SQL = `/* capacity-inventory:indexes */ SELECT c.relname AS name,
 pg_relation_size(c.oid)::text AS bytes FROM pg_catalog.pg_index i
 JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid WHERE i.indrelid='naijue_erp.auth_session'::regclass ORDER BY c.relname`;
const IDENTITY_SQL = `/* capacity-inventory:identity */ SELECT current_database() AS database,current_user AS role,
 (SELECT oid::text FROM pg_catalog.pg_database WHERE datname=current_database()) AS database_oid,
 pg_postmaster_start_time()::text AS postmaster_start,CURRENT_TIMESTAMP::text AS observed_at,
 current_setting('transaction_read_only') AS read_only,current_setting('transaction_isolation') AS isolation`;
const integer = (value, min = 1) => Number.isSafeInteger(value) && value >= min;
const decimal = value => typeof value === 'string' && /^(?:0|[1-9][0-9]*)$/.test(value);
const unknown = reason => ({status: 'UNKNOWN', reason});
function configuration(options) {
  if (!options || !options.postgres || !options.expected || !options.limits || !Array.isArray(options.mediaRoots)) throw Error('EXPLICIT_TARGETS_REQUIRED');
  const {postgres, expected, limits} = options;
  if (![expected.database,expected.role,expected.databaseOid,expected.postmasterStart].every(value => typeof value === 'string' && value.length > 0)
    || expected.database !== postgres.target?.database || expected.role !== postgres.target?.user || !decimal(expected.databaseOid)
    || !integer(postgres.acquisitionTimeoutMillis) || !integer(postgres.queryTimeoutMillis)
    || !integer(postgres.statementTimeoutMillis) || !integer(postgres.disposeTimeoutMillis)
    || !['concurrency','maxEntries','maxDepth','maxDurationMillis'].every(key => integer(limits[key]))
    || limits.concurrency > limits.maxEntries) throw Error('EXPLICIT_FINITE_TARGET_AND_LIMITS_REQUIRED');
  const keys = new Set(), roots = [];
  for (const root of options.mediaRoots) {
    if (!root || typeof root.key !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(root.key) || keys.has(root.key)
      || typeof root.path !== 'string' || !path.isAbsolute(root.path) || path.resolve(root.path) !== root.path) throw Error('EXPLICIT_DISTINCT_MEDIA_ROOTS_REQUIRED');
    keys.add(root.key); roots.push(root.path);
  }
  for (const a of roots) for (const b of roots) if (a !== b && b.startsWith(a + path.sep)) throw Error('OVERLAPPING_MEDIA_ROOTS_REFUSED');
  if (new Set(roots).size !== roots.length) throw Error('OVERLAPPING_MEDIA_ROOTS_REFUSED');
  return structuredClone(options);
}
function one(rows) { if (!Array.isArray(rows) || rows.length !== 1) throw Error('INVENTORY_RESULT_UNAVAILABLE'); return rows[0]; }
function counts(row, names) { for (const name of names) if (!decimal(row[name])) throw Error('INVENTORY_RESULT_UNAVAILABLE'); return Object.fromEntries(names.map(name => [name,row[name]])); }

async function postgresInventory(pool, expected) {
  let client, began = false, discard, output;
  try {
    client = await pool.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); began = true;
    const identity = one((await client.query(IDENTITY_SQL)).rows);
    if (identity.database !== expected.database || identity.role !== expected.role || identity.database_oid !== expected.databaseOid
      || identity.postmaster_start !== expected.postmasterStart || identity.read_only !== 'on' || identity.isolation !== 'repeatable read') throw Error('EXACT_TARGET_OR_READ_ONLY_MISMATCH');
    const sessions = counts(one((await client.query(SESSION_INVENTORY_SQL)).rows),['total','effective','expired','revoked','future_created']);
    if (BigInt(sessions.total) !== ['effective','expired','revoked','future_created'].reduce((sum,name)=>sum+BigInt(sessions[name]),0n)) throw Error('INVENTORY_COUNTS_INCONSISTENT');
    const bytes = counts(one((await client.query(STORAGE_INVENTORY_SQL)).rows),['relation_bytes','index_bytes','total_relation_bytes','database_bytes']);
    const indexes = (await client.query(INDEX_INVENTORY_SQL)).rows;
    if (!Array.isArray(indexes) || indexes.some(row => typeof row.name !== 'string' || !decimal(row.bytes))) throw Error('INVENTORY_INDEXES_UNAVAILABLE');
    output = {status:'OBSERVED',identity,sessions,bytes,indexes,
      sessionMeaning:'Mutually exclusive temporal states: revoked takes precedence; effective means unrevoked and currently in its time window, not proof of account/role/hall authorization.',
      physicalSizeMeaning:'Physical byte observations share the read transaction but are not MVCC-frozen under concurrent storage growth.',
      pgVolumeFree:unknown('REMOTE_PG_VOLUME_NOT_PROBED'),walVolumeFree:unknown('REMOTE_WAL_VOLUME_NOT_PROBED')};
  } catch { output = unknown('POSTGRES_INVENTORY_FAILED'); discard = Error('CAPACITY_INVENTORY_FAILED'); }
  finally {
    if (client) {
      if (began) try { await client.query('ROLLBACK'); } catch { discard = Error('CAPACITY_INVENTORY_CLEANUP_FAILED'); output = unknown('POSTGRES_ROLLBACK_UNCONFIRMED'); }
      try { client.release(discard); } catch { output = unknown('POSTGRES_RELEASE_UNCONFIRMED'); }
    }
  }
  return output;
}

const fsDefault = {lstat,realpath,opendir,statfs};
async function canonicalDirectory(directory, io) {
  let current = path.parse(directory).root;
  for (const part of path.relative(current,directory).split(path.sep).filter(Boolean)) {
    current = path.join(current,part); const stat = await io.lstat(current,{bigint:true});
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw Error('MEDIA_PATH_NOT_CANONICAL_DIRECTORY');
  }
  if (await io.realpath(directory) !== directory) throw Error('MEDIA_PATH_NOT_CANONICAL_DIRECTORY');
  return io.lstat(directory,{bigint:true});
}
async function mediaInventory(root, limits, io, now) {
  const observedAt = new Date().toISOString();
  const started = now(), pending = [{directory:root.path,depth:0,group:'other'}];
  const physical = new Set(), fileInodes = new Set(), entriesByGroup = Object.fromEntries(['stages','keys','other'].map(name=>[name,{files:0,directories:0,allocatedBytes:0n}]));
  let entries = 0, files = 0, directories = 0, symbolicLinks = 0, specialFiles = 0, allocated = 0n, apparent = 0n, stageDirectories = 0, keyFiles = 0, failed = false, stopped = false;
  const reasonCodes = new Set(); let volume = unknown('MEDIA_VOLUME_NOT_PROBED'), rootStat;
  const stop = reason => { stopped = true; failed = true; reasonCodes.add(reason); };
  const active = () => { if (now() - started > limits.maxDurationMillis) stop('MEDIA_DURATION_LIMIT'); return !stopped; };
  const allocation = (stat, group) => {
    if (typeof stat.blocks !== 'bigint' || stat.blocks < 0n || stat.size < 0n) { stop('MEDIA_ALLOCATION_UNAVAILABLE'); return; }
    const bytes = stat.blocks * 512n, identity = `${stat.dev}:${stat.ino}`;
    if (!physical.has(identity)) { physical.add(identity); allocated += bytes; }
    entriesByGroup[group].allocatedBytes += bytes;
  };
  const processDirectory = async task => {
    let dir, before;
    try {
      if (!active()) return;
      before = await canonicalDirectory(task.directory,io); if (!active()) return;
      dir = await io.opendir(task.directory);
      while (active()) {
        const entry = await dir.read(); if (entry === null) break;
        if (++entries > limits.maxEntries) { stop('MEDIA_ENTRY_LIMIT'); break; }
        const filename = path.join(task.directory,entry.name);
        if (path.dirname(filename) !== task.directory || entry.name === '.' || entry.name === '..') { stop('MEDIA_ENTRY_INVALID'); break; }
        const stat = await io.lstat(filename,{bigint:true}); if (!active()) break;
        const group = task.depth === 0 && ['stages','keys'].includes(entry.name) ? entry.name : task.group;
        if (stat.isSymbolicLink()) { symbolicLinks++; allocation(stat,group); continue; }
        if (stat.dev !== rootStat.dev) { stop('MEDIA_NESTED_VOLUME'); break; }
        if (stat.isDirectory()) {
          allocation(stat,group);
          directories++; entriesByGroup[group].directories++;
          if (group === 'stages' && task.depth === 1) stageDirectories++;
          if (task.depth + 1 > limits.maxDepth) { stop('MEDIA_DEPTH_LIMIT'); break; }
          pending.push({directory:filename,depth:task.depth+1,group});
        } else if (stat.isFile()) {
          files++; entriesByGroup[group].files++; if (group === 'keys') keyFiles++;
          apparent += stat.size;
          // Key manifests are hard links to stage manifests: charge physical allocation once.
          allocation(stat,group);fileInodes.add(`${stat.dev}:${stat.ino}`);
        } else { specialFiles++;stop('MEDIA_SPECIAL_ENTRY_ALLOCATION_UNKNOWN'); }
      }
      const after = await io.lstat(task.directory,{bigint:true});
      if (after.isSymbolicLink() || after.dev !== before.dev || after.ino !== before.ino || after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs) stop('MEDIA_DIRECTORY_CHANGED');
    } catch { stop('MEDIA_IO_FAILED'); }
    finally { if (dir) try { await dir.close(); } catch { stop('MEDIA_DIRECTORY_CLOSE_UNCONFIRMED'); } }
  };
  try {
    rootStat = await canonicalDirectory(root.path,io);
    allocation(rootStat,'other');
    const space = await io.statfs(root.path,{bigint:true});
    if (space.bsize <= 0n || space.bavail < 0n || space.bfree < 0n || space.blocks < 0n) throw Error('MEDIA_SPACE_UNAVAILABLE');
    volume = {status:'OBSERVED',scope:'LOCAL_MEDIA_ROOT_FILESYSTEM_ONLY',device:rootStat.dev.toString(),
      availableBytes:(space.bavail*space.bsize).toString(),freeBytes:(space.bfree*space.bsize).toString(),totalBytes:(space.blocks*space.bsize).toString()};
    while (pending.length && active()) await Promise.all(pending.splice(0,limits.concurrency).map(processDirectory));
  } catch { failed = true; reasonCodes.add('MEDIA_ROOT_OR_SPACE_FAILED'); }
  const result = {key:root.key,observedAt,finishedAt:new Date().toISOString(),status:failed?'UNKNOWN':'OBSERVED',complete:!failed,reasonCodes:[...reasonCodes].sort(),volume,
    counts: failed ? null : {files,directories,symbolicLinks,specialFiles,stageDirectories,keyFiles},
    allocatedBytes:failed?null:allocated.toString(),apparentEntryBytes:failed?null:apparent.toString(),uniqueFileInodes:failed?null:fileInodes.size,
    groups:failed?null:Object.fromEntries(Object.entries(entriesByGroup).map(([key,value])=>[key,{...value,allocatedBytes:value.allocatedBytes.toString()}])),
    meanings:['Allocated bytes include root, traversed directories, files and symlink inode allocation, using st_blocks*512 with dev/inode de-duplication. Symlink targets are excluded.',
      'Group allocated bytes count each directory entry and may overlap through hard links; do not sum group bytes as total physical storage.',
      'Names/content/manifests/keys are not exported or read. No reference, orphan, expiry or deletion eligibility judgment.',
      'Not a frozen filesystem snapshot: detected directory replacement/concurrent entry changes fail UNKNOWN. No intentional symlink traversal.',
      'Traversal concurrency/entry/depth/elapsed checks stop further work; already-started native filesystem operations settle and directory handles close before returning. No claim of cancelling an uninterruptible OS IO.']};
  return result;
}

/** Pure arithmetic only; callers supply approved T/r/B/R/inflight. This selects no production observation window or budget. */
export function observationWindowSessionBound({rateTokens,rateIntervalMillis,windowMillis,burst,restarts,inFlight}) {
  if (![rateTokens,rateIntervalMillis,windowMillis,burst,restarts,inFlight].every(value=>integer(value,0)) || rateIntervalMillis===0) throw Error('EXPLICIT_WINDOW_INPUTS_REQUIRED');
  const numerator=BigInt(rateTokens)*BigInt(windowMillis),denominator=BigInt(rateIntervalMillis);
  return ((numerator+denominator-1n)/denominator+BigInt(burst)*(BigInt(restarts)+1n)+BigInt(inFlight)).toString();
}

export async function inventoryCapacity(input, dependencies = {}) {
  const options=configuration(input),io=dependencies.fs??fsDefault,now=dependencies.now??(()=>performance.now());
  const observedAt=new Date().toISOString();
  const pool=dependencies.pool??new BoundedPostgresPool(options.postgres);
  let postgres,media=[];
  try {
    postgres=await postgresInventory(pool,options.expected);
    // One root at a time; configured concurrency applies within each actual root.
    for (const root of options.mediaRoots) media.push(await mediaInventory(root,options.limits,io,now));
  } finally {
    if (!dependencies.pool) try { await pool.dispose(); } catch { postgres=unknown('POSTGRES_POOL_DISPOSAL_UNCONFIRMED'); }
  }
  return {format:'A02_READ_ONLY_CAPACITY_INVENTORY_V1',observedAt,finishedAt:new Date().toISOString(),status:postgres?.status==='OBSERVED'&&media.every(root=>root.status==='OBSERVED')?'OBSERVED':'UNKNOWN',
    postgres,media,mediaScope:options.mediaRoots.length?'EXPLICIT_LOCAL_ROOTS_ONLY':'NOT_REQUESTED',
    notMeasured:['Remote PostgreSQL/WAL/backup/system filesystem free space','WAL generation or per-new-session physical growth','Actual writer topology, restart boundary, observation window approval, production low-water thresholds or SLO'],
    mutationsPerformed:false,deletionAuthorized:false};
}

async function privateConfiguration(filename) {
  if (!path.isAbsolute(filename)) throw Error('PRIVATE_ABSOLUTE_CONFIGURATION_REQUIRED');
  const parent=path.dirname(filename); await canonicalDirectory(parent,fsDefault);
  const before=await lstat(filename,{bigint:true});
  if (!before.isFile() || before.isSymbolicLink() || (before.mode&0o077n)!==0n || before.size>65536n) throw Error('BOUNDED_PRIVATE_CONFIGURATION_REQUIRED');
  const handle=await open(filename,constants.O_RDONLY|constants.O_NOFOLLOW);
  try {
    const opened=await handle.stat({bigint:true}); if (opened.dev!==before.dev||opened.ino!==before.ino||opened.size!==before.size) throw Error('PRIVATE_CONFIGURATION_CHANGED');
    const bytes=Buffer.alloc(Number(before.size)+1),{bytesRead}=await handle.read(bytes,0,bytes.length,0),after=await handle.stat({bigint:true});
    if (BigInt(bytesRead)!==before.size || after.size!==before.size||after.mtimeNs!==before.mtimeNs||after.ctimeNs!==before.ctimeNs) throw Error('PRIVATE_CONFIGURATION_CHANGED');
    return JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(bytes.subarray(0,bytesRead)));
  } finally { await handle.close(); }
}
if (process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length!==4||process.argv[2]!=='--config') throw Error('EXPLICIT_CONFIGURATION_REQUIRED');
    const report=await inventoryCapacity(await privateConfiguration(process.argv[3]));console.log(JSON.stringify(report,null,2));process.exitCode=report.status==='OBSERVED'?0:2;
  } catch { console.error(JSON.stringify({status:'UNKNOWN',reason:'EXPLICIT_PRIVATE_TARGET_CONFIGURATION_OR_INVENTORY_UNAVAILABLE'}));process.exitCode=2; }
}
