import {qaPrincipal,qaReferenceRead,type QaReferenceProfile} from '../demo-replica/frontend/qa-reference-fixtures.mts';
import {createSyntheticManagementTransport,MANAGEMENT_SYNTHETIC_ORIGIN,syntheticId,type SyntheticReadFailure} from '../management-browser-harness/synthetic-transport.ts';
import {createSyntheticSalesTransport} from './sales-transport.ts';
import {createSyntheticTransferTransport} from './transfer-transport.ts';
import {createSyntheticInventoryPartiesTransport} from './inventory-parties-transport.ts';
import type {SyntheticCall,SyntheticTransactionFailure} from './types.ts';
import {createSyntheticStoreSettingsTransport,storeSettingsSyntheticPaths} from './store-settings-transport.ts';
import {reviewProfile,type UnifiedReviewProfile} from './review-profile.ts';
export const UNIFIED_SYNTHETIC_ORIGIN=MANAGEMENT_SYNTHETIC_ORIGIN;
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const error=(status:number)=>json({error:{code:status===401?'UNAUTHENTICATED':status===403?'FORBIDDEN':'SERVICE_UNAVAILABLE',message:'Explicit synthetic state, no real service called'}},status);
const managementPaths=new Set(['/product-management/query','/product-management/candidates/query','/dictionary-read/size-groups/query','/dictionary-read/seasons/query','/dictionary-read/barcode-schemes/query','/dictionary-read/barcode-scheme/query','/catalogue-settings-read/categories/query','/catalogue-settings-read/colors/query','/catalogue-settings-read/fits/query']);
const postPaths=new Set([...managementPaths,...storeSettingsSyntheticPaths,'/auth/logout','/inventory/query','/inventory/candidates/query','/products/basics/query','/products/specifications/query','/products/images/query','/products/image/query','/current-form/sales-references/query','/current-form/transfer-warehouses/query','/current-form/products/query','/current-form/product-skus/query','/sales/prepare-create','/sales/commands','/sales/query','/sales/detail/query','/sales/references/query','/transfers/prepare-create','/transfers/commands','/transfers/query','/transfers/detail/query','/transfers/warehouses/query']);
const receipt=/^\/(?:sales|transfers)\/receipts\/[A-Za-z0-9._:%-]{1,600}$/;
const party=/^\/(customers|suppliers)(?:\/(?:candidates|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}))?$/;
/** One closed injected boundary for one actual Application, with one identity.
 * No fallback to real network, no credentials, no database or stock writes. */
export function createSyntheticUnifiedTransport(onCall?: (call:SyntheticCall)=>void, profile:UnifiedReviewProfile='standard',dataset?:QaReferenceProfile){
 const selected=reviewProfile(profile);
 const management=createSyntheticManagementTransport(),sales=createSyntheticSalesTransport(undefined,dataset),transfers=createSyntheticTransferTransport(undefined,selected,dataset),inventoryParties=createSyntheticInventoryPartiesTransport(),storeSettings=createSyntheticStoreSettingsTransport();
 let authorized=false,nextFailure:SyntheticReadFailure='none',nextDelay=0;
 const calls:SyntheticCall[]=[];
 return Object.freeze({calls:()=>Object.freeze([...calls]),authorize(){authorized=true;management.authorize();},revoke(){authorized=false;management.revoke();},
  setNextReadFailure(value:SyntheticReadFailure){if(!['none','forbidden','unavailable','network','empty'].includes(value))throw new TypeError('Invalid synthetic read failure');nextFailure=value;},
  setNextReadDelay(ms:number){if(!Number.isSafeInteger(ms)||ms<0||ms>5000)throw new TypeError('Invalid synthetic delay');nextDelay=ms;},
  setTransactionFailure(value:SyntheticTransactionFailure){if(!['none','candidate403','prepare403','prepareUnavailable','proofMissing','saveUncertain'].includes(value))throw new TypeError('Invalid synthetic transaction failure');sales.setFailure(value);transfers.setFailure(value);},
  setPreparationDelay(ms:number){sales.setPreparationDelay(ms);transfers.setPreparationDelay(ms);},
  savedCounts:()=>({sales:sales.savedCount(),transfers:transfers.savedCount()}),
  http:Object.freeze({origin:UNIFIED_SYNTHETIC_ORIGIN,basePath:'/api',fetch:async(input:string,init:RequestInit):Promise<Response>=>{
   const url=new URL(input),path=url.pathname.slice(4),method=init.method??'GET';
   if(url.origin!==UNIFIED_SYNTHETIC_ORIGIN||url.username||url.password||url.hash||!url.pathname.startsWith('/api/')||init.credentials!=='same-origin')throw new TypeError('Closed synthetic transport rejected external or malformed request');
   const isParty=party.test(path),isReceipt=receipt.test(path);
   if(path==='/auth/login'||path==='/auth/password'||(!postPaths.has(path)&&path!=='/auth/session'&&!isParty&&!isReceipt)||(method!==(path==='/auth/session'||isParty||isReceipt?'GET':'POST'))||(!isParty&&url.search))throw new TypeError('Synthetic transport rejected unsupported operation before reading its body');
   if(isParty){const allowed=path.endsWith('/candidates')?['search','page','pageSize']:path==='/customers'||path==='/suppliers'?['search','enabled','page','pageSize']:[];if([...url.searchParams.keys()].some(key=>!allowed.includes(key))||new Set(url.searchParams.keys()).size!==[...url.searchParams.keys()].length)throw new TypeError('Invalid synthetic party query');}
   if(init.signal?.aborted)throw new DOMException('Synthetic read aborted','AbortError');
   const call=Object.freeze({method,path,syntheticOnly:true as const});calls.push(call);onCall?.(call);
   if(path==='/auth/session')return authorized?json({principal:dataset?qaPrincipal:{accountId:syntheticId(900),staffId:syntheticId(901),loginName:'SYNTHETIC-UNIFIED-ONLY',role:'ADMIN',hallId:null,authVersion:1}}):error(401);
   if(path==='/auth/logout'){authorized=false;management.revoke();return json({ok:true});}
   if(!authorized)return error(401);
   const isRead=!path.endsWith('/commands')&&!path.endsWith('/prepare-create')&&!isReceipt;
   let failure:SyntheticReadFailure='none';
   if(isRead){failure=nextFailure;nextFailure='none';const delay=nextDelay;nextDelay=0;if(delay)await new Promise(resolve=>setTimeout(resolve,delay));if(failure==='forbidden')return error(403);if(failure==='unavailable')return error(503);if(failure==='network')throw new Error('Synthetic dropped read');}
   if(dataset&&isRead){const fixture=qaReferenceRead(path,init.body?JSON.parse(String(init.body)):{},failure==='empty',new Headers(init.headers).get('x-naijue-current-form-recommendation'));if(fixture)return fixture;}
   if(managementPaths.has(path)){management.setNextFailure(failure);return management.http.fetch(input,init);}
   const body=init.body?JSON.parse(String(init.body)):null;
   if(storeSettingsSyntheticPaths.has(path))return storeSettings.request(path,body,failure==='empty');
   if(path.startsWith('/products/')&&transfers.hasReadOnlyProduct(body?.productId))return transfers.readOnlyProduct(path,body.productId,failure==='empty');
   if(path.startsWith('/inventory/')||isParty||(path.startsWith('/products/')&&inventoryParties.hasProduct(body?.productId)))return inventoryParties.request(url,init,failure==='empty');
   if(path.startsWith('/products/'))return management.http.fetch(input,init);
   if(failure==='empty')return json({page:body.page,pageSize:body.pageSize,exactTotal:'0',items:[]});
   const transaction=path.startsWith('/transfers/')||path==='/current-form/transfer-warehouses/query'?transfers:sales;
   return transaction.http.fetch(input,init);
  }})
 });
}
