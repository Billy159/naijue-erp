import {createSyntheticInventoryReader} from '../preview/synthetic-reader.ts';
import {createSyntheticProductReader} from '../preview/synthetic-product-reader.ts';
import {syntheticId} from '../management-browser-harness/synthetic-transport.ts';
import type {QueryRead} from '../src/loading/latest-query.ts';
import type {CandidateParameters,InventoryParameters} from '../src/inventory/contracts.ts';
import type {ProductImageParameters,ProductParameters} from '../src/inventory/product-contracts.ts';
import {parseInventoryCandidateQuery,parseInventoryQuery} from '../../../packages/application/src/inventory-query-validation.ts';
import {validateSearch,validateCandidateSearch} from '../src/parties/response-validation.ts';
import type {PartySearch,PartyCandidateSearch} from '../src/parties/contracts.ts';
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
/** Existing generated finite complete fixture, encoded to native UUID identities at
 * this acceptance HTTP server boundary. Never used by production. No copied matrix. */
export function createSyntheticInventoryPartiesTransport(){
 const inventory=createSyntheticInventoryReader({productCount:103,delayMs:0}),empty=createSyntheticInventoryReader({productCount:0,delayMs:0}),product=createSyntheticProductReader({delayMs:0});
 const encoded=new Map<string,string>(),decoded=new Map<string,string>();
 function encode(value:unknown):unknown{
  if(typeof value==='string'&&value.startsWith('test-')){let id=encoded.get(value);if(!id){id=syntheticId(800000+encoded.size);encoded.set(value,id);decoded.set(id,value);}return id;}
  if(Array.isArray(value))return value.map(encode);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[encoded.get(key)??(key.startsWith('test-')?encode(key) as string:key),encode(item)]));
  return value;
 }
 function decode(value:unknown):unknown{
  if(typeof value==='string')return decoded.get(value)??value;
  if(Array.isArray(value))return value.map(decode);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[decoded.get(key)??key,decode(item)]));
  return value;
 }
 const read=<P>(parameters:P):QueryRead<P>=>({parameters,signal:new AbortController().signal,identity:{accountId:syntheticId(900),sessionRevision:'SYNTHETIC',permissionRevision:'SYNTHETIC'},routeInstanceId:'SYNTHETIC-HTTP-FIXTURE',entityId:null});
 const partyRows=(kind:'customers'|'suppliers')=>Array.from({length:23},(_,index)=>({id:syntheticId((kind==='customers'?910000:920000)+index),code:`SYN-${kind==='customers'?'C':'S'}-${String(index+1).padStart(3,'0')}`,name:`合成${kind==='customers'?'客户':'供应商'} ${index+1}（非正式）`,enabled:index%5!==4,version:index===22?7:1,createdAt:null,updatedAt:null}));
 return Object.freeze({
  hasProduct:(id:string)=>decoded.get(id)?.startsWith('test-product-')??false,
  async request(url:URL,init:RequestInit,emptyResult=false):Promise<Response>{
   const path=url.pathname.slice(4),body=init.body?JSON.parse(String(init.body)):null;
   if(path==='/inventory/query'){parseInventoryQuery(body);const result=await(emptyResult?empty:inventory).readInventory(read(decode(body) as InventoryParameters));return json(encode(result));}
   if(path==='/inventory/candidates/query'){parseInventoryCandidateQuery(body);return json(encode(await(emptyResult?empty:inventory).readCandidates(read(decode(body) as CandidateParameters))));}
   if(path.startsWith('/products/')){
    const parameters=decode(body) as ProductImageParameters;
    if(path==='/products/basics/query')return json(encode(await product.readProductBasics(read(parameters))));
    if(path==='/products/specifications/query')return json(encode(await product.readProductSpecifications(read(parameters))));
    if(path==='/products/images/query')return json(encode(await product.readProductImages(read(parameters))));
    if(path==='/products/image/query')return json(encode(await product.readProductImage(read(parameters))));
   }
   const match=/^\/(customers|suppliers)(?:\/(.*))?$/.exec(path);
   if(match){
    const family=match[1] as 'customers'|'suppliers',leaf=match[2],rows=partyRows(family);
    // Real host currently opts this preview into explicit read-only capability.
    if(init.method!=='GET')return json({error:{code:'FORBIDDEN',message:'Synthetic preview has no party write capability'}},403);
    if(leaf&&leaf!=='candidates')return rows.some(row=>row.id===leaf)?json(rows.find(row=>row.id===leaf)):json({error:{code:'PARTY_NOT_FOUND',message:'Synthetic absent'}},404);
    const query={search:url.searchParams.get('search')??'',page:Number(url.searchParams.get('page')),pageSize:Number(url.searchParams.get('pageSize'))};
    let matching=emptyResult?[]:rows.filter(row=>`${row.code} ${row.name}`.includes(query.search));
    if(leaf==='candidates'){validateCandidateSearch(query as PartyCandidateSearch);return json({...query,search:undefined,total:matching.length,items:matching.slice((query.page-1)*query.pageSize,query.page*query.pageSize).map(({id,code,name})=>({id,code,name}))});}
    const full={...query,enabled:url.searchParams.get('enabled')};validateSearch(full as PartySearch);matching=matching.filter(row=>full.enabled==='ALL'||row.enabled===(full.enabled==='ENABLED'));
    return json({page:query.page,pageSize:query.pageSize,total:matching.length,items:matching.slice((query.page-1)*query.pageSize,query.page*query.pageSize)});
   }
   throw new TypeError('Unsupported synthetic inventory or party operation');
  }
 });
}
