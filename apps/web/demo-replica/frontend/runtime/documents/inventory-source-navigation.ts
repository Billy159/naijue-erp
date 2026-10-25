import type { InventoryLedgerEntry } from '../../../../src/inventory/ledger-contracts.ts';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import type { QueryRead } from '../../../../src/loading/latest-query.ts';
import { HttpQueryError, type HttpQueryOptions } from '../../../../src/transport/http-query.ts';
import { createSalesHttpReader } from '../../../../src/sales/http-reader.ts';
import { createTransferHttpReader } from '../../../../src/transfers/http-reader.ts';
import { entityId } from '../../../../../../packages/domain/src/values.ts';
import { createHistoryReader } from './history-reader.ts';

/** Resolve a clicked source through its own original document authorization.
 * The host owns lazy loading, navigation/dirty guards and access-error handling.
 * Scope or click cancellation never yields a late navigation target. */
export async function resolveInventorySourceRoute({ http, scope, entry, signal: clickSignal }: {
 readonly http: HttpQueryOptions; readonly scope: ReadScope; readonly entry: InventoryLedgerEntry; readonly signal?: AbortSignal;
}): Promise<string | null> {
 const signal=clickSignal?AbortSignal.any([scope.signal,clickSignal]):scope.signal;
 const active=()=>scope.active&&!signal.aborted;
 if(!active())return null;
 const source=entry.source;
 let kind:'sales'|'transfers',id:string;
 try{
  if(source.kind==='SALES'||source.kind==='HISTORY_REVISION'&&source.documentKind==='SALES'){kind='sales';id=entityId('sales',source.salesId);}
  else if(source.kind==='TRANSFER'||source.kind==='HISTORY_REVISION'&&source.documentKind==='TRANSFER'){kind='transfers';id=entityId('transfer',source.transferId);}
  else return null;
 }catch{return null;}
 const read=<P>(parameters:P):QueryRead<P>=>({parameters,signal,identity:scope.identity,routeInstanceId:scope.routeInstanceId,entityId:scope.entityId});
 try{
  let route:string;
  if(source.kind==='HISTORY_REVISION'){
   const target=await createHistoryReader(http).readTarget(kind,read({documentId:id}));
   if(!target||!active())return null;
   route=(kind==='sales'?'sales':'transfer')+'/history/'+encodeURIComponent(target.batchId)+'/'+encodeURIComponent(target.documentId)+'/'+target.effectiveVersion;
  }else if(kind==='sales'){
   const detail=await createSalesHttpReader(http).readDetail(read({salesId:entityId('sales',id)}));
   route='sales/view/'+encodeURIComponent(detail.document.header.id);
  }else{
   const detail=await createTransferHttpReader(http).readDetail(read({transferId:entityId('transfer',id)}));
   route='transfer/view/'+encodeURIComponent(detail.document.header.id);
  }
  return active()?route:null;
 }catch(error){if(!active()||error instanceof HttpQueryError&&error.kind==='not-found')return null;throw error;}
}
