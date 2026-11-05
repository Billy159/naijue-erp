/** Bounded read-only observation over an independently authorized exclusive pg
 * client. No connector, installer, publisher, record or admission is provided. */
import { FRESH35_CATALOG_QUERY, describeFresh35CatalogSpec, requireFresh35Identity, validateFresh35CatalogPacket } from './fresh35-catalog-contract.mjs';
const busy=new WeakSet(),quarantined=new WeakSet();
export const FRESH35_COLLECTOR_LIMITS=Object.freeze({totalMs:20000,queryMs:6000,cleanupMs:2000,maxPacketBytes:16*1024*1024});
const ack=(result,command)=>{const descriptor=result&&Object.getOwnPropertyDescriptor(result,'command');if(!descriptor||!Object.hasOwn(descriptor,'value')||descriptor.value!==command)throw Error('FRESH35_CATALOG_ACK_INVALID');};
const setup=Object.freeze(['SET LOCAL statement_timeout=6000','SET LOCAL lock_timeout=2000','SET LOCAL idle_in_transaction_session_timeout=10000','SET LOCAL search_path=pg_catalog,naijue_erp,pg_temp']);
const ready=client=>typeof client.getTransactionStatus==='function'&&client.readyForQuery===true&&client._queryable===true&&client._ending===false&&client.pipeline===false&&client._activeQuery==null&&Array.isArray(client._queryQueue)&&client._queryQueue.length===0&&Array.isArray(client._sentQueryQueue)&&client._sentQueryQueue.length===0;
function bounded(promise,ms){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('FRESH35_CATALOG_QUERY_TIMEOUT')),ms);Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value)},error=>{clearTimeout(timer);reject(error)});});}
function quarantine(client,code){quarantined.add(client);return Object.assign(Error(code),{cleanup:'CALLER_MUST_DISCARD',connectionReusable:false});}
export async function collectFresh35Catalog(client,spec,expectedIdentity){
 const source=describeFresh35CatalogSpec(spec);requireFresh35Identity(expectedIdentity);const target={...expectedIdentity};
 if(!client||typeof client.query!=='function')throw Error('FRESH35_CATALOG_CLIENT_REQUIRED');
 if(busy.has(client))throw Error('FRESH35_CATALOG_CLIENT_BUSY');if(quarantined.has(client))throw Error('FRESH35_CATALOG_CLIENT_QUARANTINED');
 if(!ready(client)||client.getTransactionStatus()!=='I')throw Error('FRESH35_CATALOG_EXCLUSIVE_IDLE_CLIENT_REQUIRED');
 busy.add(client);const deadline=Date.now()+FRESH35_COLLECTOR_LIMITS.totalMs;let result,problem,failed=false,began=false,uncertain=false;
 const send=async(sql,values,cleanup=false)=>{
  const before=client.getTransactionStatus();if(!ready(client)||(sql.startsWith('BEGIN')?before!=='I':cleanup?!['T','E'].includes(before):before!=='T'))throw Error('FRESH35_CATALOG_WIRE_STATE_INVALID');
  const ms=cleanup?FRESH35_COLLECTOR_LIMITS.cleanupMs:Math.min(FRESH35_COLLECTOR_LIMITS.queryMs,deadline-Date.now());if(ms<=0)throw Error('FRESH35_CATALOG_TOTAL_TIMEOUT');
  let response;try{response=await bounded(client.query({text:sql,values,query_timeout:ms}),ms);}catch(error){if(error?.message==='FRESH35_CATALOG_QUERY_TIMEOUT'||!ready(client))uncertain=true;throw error;}
  if(!ready(client)||client.getTransactionStatus()!==(cleanup?'I':'T')){uncertain=true;throw Error('FRESH35_CATALOG_WIRE_STATE_INVALID');}
  ack(response,sql.startsWith('BEGIN')?'BEGIN':cleanup?'ROLLBACK':sql.startsWith('SET')?'SET':'SELECT');return response;
 };
 try{
  await send('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');began=true;
  for(const sql of setup)await send(sql);
  const response=await send(FRESH35_CATALOG_QUERY,[JSON.stringify(source.routinePins)]);
  if(response.rows?.length!==1||typeof response.rows[0].catalog_json!=='string')throw Error('FRESH35_CATALOG_OBSERVATION_MISSING');
  const catalogJson=response.rows[0].catalog_json,observation=validateFresh35CatalogPacket(catalogJson,spec,target);
  result=Object.freeze({source:'SUPPLIED_CLIENT_OBSERVATION_NOT_AUTHENTICATED_EXECUTION',catalogJson,observation});
 }catch(error){problem=error;failed=true;}finally{
  // A rejected BEGIN while still idle has no owned transaction to roll back.
  // Unknown in-flight state must never queue a retry/ROLLBACK behind that query.
  if(uncertain){problem=quarantine(client,'FRESH35_CATALOG_CONNECTION_UNCERTAIN');failed=true;}
  else if(began||ready(client)&&['T','E'].includes(client.getTransactionStatus())){
   try{await send('ROLLBACK',undefined,true);}catch{problem=quarantine(client,'FRESH35_CATALOG_ROLLBACK_UNCERTAIN');failed=true;}
  }
  busy.delete(client);
 }
 if(failed)throw problem;return result;
}
