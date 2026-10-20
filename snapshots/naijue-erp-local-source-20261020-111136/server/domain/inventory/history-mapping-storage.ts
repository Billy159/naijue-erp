import {createHash} from 'node:crypto';
import type {DataSession} from '../../database/session.js';
import {HistoryError, historyDigest, type HistoryMapping} from './history-plan.js';

const format = 'T33-MAPPING-CHUNKS-v1';
const chunkByteLimit = 262144;
const byteDigest = (text:string):string => createHash('sha256').update(text).digest('hex');
export interface HistoryMappingStorage {
  readonly format: typeof format;
  readonly mappingCount: number;
  readonly chunkCount: number;
  readonly mappingsSha256: string;
  readonly payloadBytes: number;
  readonly payloadSha256: string;
}
interface MappingChunk {readonly payload:string; readonly sha256:string}
export interface PreparedHistoryMappings {readonly descriptor:HistoryMappingStorage; readonly chunks:readonly MappingChunk[]}

/** Split the complete JSON at UTF-8 boundaries, including evidence entries larger than one chunk. */
export function prepareHistoryMappings(mappings:readonly HistoryMapping[]):PreparedHistoryMappings {
  const text=JSON.stringify(mappings),bytes=Buffer.from(text),chunks:MappingChunk[]=[];
  for (let start=0;start<bytes.length;) {
    let end=Math.min(start+chunkByteLimit,bytes.length);
    while (end<bytes.length && (bytes[end]! & 0xc0)===0x80) end--;
    const payload=bytes.subarray(start,end).toString('utf8');
    chunks.push({payload,sha256:byteDigest(payload)});start=end;
  }
  return {descriptor:{format,mappingCount:mappings.length,chunkCount:chunks.length,mappingsSha256:historyDigest(mappings),
    payloadBytes:bytes.length,payloadSha256:byteDigest(text)},chunks};
}
function assertSchema(runtime:string):void {
  if (!/^"[a-z][a-z0-9_]{0,62}"$/.test(runtime)) throw new HistoryError('INVALID_HISTORY_SCHEMA');
}
export async function persistHistoryMappings(session:DataSession,runtime:string,runId:string,manifestSha256:string,
  prepared:PreparedHistoryMappings):Promise<number> {
  assertSchema(runtime);
  for (const [index,chunk] of prepared.chunks.entries()) {
    await session.query(`INSERT INTO ${runtime}.inventory_history_mapping_chunk(run_id,manifest_sha256,ordinal,payload_sha256,payload)
      VALUES($1,$2,$3,$4,$5) RETURNING ordinal`,[runId,manifestSha256,index+1,chunk.sha256,chunk.payload]);
  }
  return prepared.chunks.length;
}
interface StoredChunk {ordinal:number; manifest_sha256:string; payload_sha256:string; payload:string}
function corrupt():never {throw new HistoryError('HISTORY_MAPPING_STORAGE_CORRUPT');}

/** Ordered content and its immutable run binding must agree before any consumer uses it. */
export async function readHistoryMappings(session:DataSession,runtime:string,runId:string,manifestSha256:string,
  storage:unknown):Promise<readonly HistoryMapping[]> {
  assertSchema(runtime);
  const descriptor=storage as HistoryMappingStorage | null;
  if (!descriptor || descriptor.format!==format || !Number.isSafeInteger(descriptor.mappingCount) || descriptor.mappingCount<0
    || !Number.isSafeInteger(descriptor.chunkCount) || descriptor.chunkCount<1
    || !Number.isSafeInteger(descriptor.payloadBytes) || descriptor.payloadBytes<2 || descriptor.chunkCount>descriptor.payloadBytes
    || typeof descriptor.payloadSha256!=='string' || !/^[a-f0-9]{64}$/.test(descriptor.payloadSha256)
    || typeof descriptor.mappingsSha256!=='string' || !/^[a-f0-9]{64}$/.test(descriptor.mappingsSha256)) corrupt();
  const rows=(await session.query<StoredChunk>(`SELECT ordinal,manifest_sha256,payload_sha256,payload
    FROM ${runtime}.inventory_history_mapping_chunk WHERE run_id=$1 ORDER BY ordinal`,[runId])).rows;
  if (rows.length!==descriptor.chunkCount) corrupt();
  const payloads:string[]=[];let bytes=0;
  for (const [index,row] of rows.entries()) {
    if (row.ordinal!==index+1 || row.manifest_sha256!==manifestSha256 || typeof row.payload!=='string' || !row.payload
      || Buffer.byteLength(row.payload)>chunkByteLimit || byteDigest(row.payload)!==row.payload_sha256) corrupt();
    bytes+=Buffer.byteLength(row.payload);if (bytes>descriptor.payloadBytes) corrupt();
    payloads.push(row.payload);
  }
  const payload=payloads.join('');
  if (bytes!==descriptor.payloadBytes || byteDigest(payload)!==descriptor.payloadSha256) corrupt();
  let mappings:readonly HistoryMapping[];
  try {mappings=JSON.parse(payload) as readonly HistoryMapping[];} catch {corrupt();}
  if (!Array.isArray(mappings)) corrupt();
  if (mappings.length!==descriptor.mappingCount || historyDigest(mappings)!==descriptor.mappingsSha256) corrupt();
  return mappings;
}
