import {validateZeroAmountArchive,zeroAmountArchiveSummary} from './unified-zero-amount-archive.ts';
/** Execute only on the existing restricted importer connection. The installed narrow trace function is granted only to that role.
 * The read operation never creates roles, permissions or financial records. */
export const ZERO_ARCHIVE_READ_SQL = 'SELECT * FROM naijue_erp.standard_zero_amount_archive_trace($1::uuid)';
export async function readZeroAmountArchive(client:{query:(sql:string,params:unknown[])=>Promise<{rows:Record<string,unknown>[]}>},salesId:string,sourceKey?:string){
 if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(salesId))throw Error('ZERO_ARCHIVE_SALES_ID_INVALID');
 const result=await client.query(ZERO_ARCHIVE_READ_SQL,[salesId]);
 if(result.rows.length>1)throw Error('ZERO_ARCHIVE_AMBIGUOUS_PARENT');
 if(result.rows.length===0)throw Error('ZERO_ARCHIVE_PARENT_NOT_FOUND');
 const row=result.rows[0]!;const proof=row.proof as Record<string,unknown>;
 if(!proof||proof.target_id!==salesId||proof.source_key!==row.sales_source_key||proof.source_system!==row.source_namespace)throw Error('ZERO_ARCHIVE_PARENT_PROOF_INVALID');
 const archive=proof.zero_amount_archive as {records?:{source_refs?:{file_sha256:string}[]}[]}|undefined;
 // The server proof is already receipt/audit/source-hash bound. Do not claim
 // its declared locators independently prove original business truth.
 const hashes=new Set((archive?.records??[]).flatMap(r=>(r.source_refs??[]).map(ref=>ref.file_sha256)));
 const all=archive===undefined?[]:validateZeroAmountArchive(archive,{sourceNamespace:String(row.source_namespace),salesSourceKey:String(row.sales_source_key),sourceFileHashes:hashes});
 const records=sourceKey===undefined?all:all.filter(r=>r.source_key===sourceKey);
 return {sales_id:salesId,sales_source_key:row.sales_source_key,records,...zeroAmountArchiveSummary(records)};
}
