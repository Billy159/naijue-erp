/** Deterministic SYNTHETIC catalogue source. No I/O/SQL/network at import time. */
import {createHash} from 'node:crypto';
import {detail as baseDetail} from '../../../../apps/web/src/transfers/tests/fixtures.ts';
import {CATALOGUE_PRICE_KEYS} from '../../../../packages/application/src/catalogue-price-input.ts';
export const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const bytes=value=>Buffer.byteLength(JSON.stringify(value));
export const SOURCE_LIMIT=16*1024*1024,CHUNK_LIMIT=4*1024*1024,RESPONSE_LIMIT=8*1024*1024;
const evidence={synthetic:true,purpose:'OPT01 source-contract fixture only; no real source or SQL authority'};
const entry=(entity,sourceKey,nativeId,values,references={})=>({entity,sourceKey,nativeId,values,references,originalEvidence:evidence});
const ref=e=>({entity:e.entity,sourceKey:e.sourceKey,nativeId:e.nativeId,nativeSnapshot:{id:e.nativeId,...e.values}});
const chunks=(rows,n=200)=>Array.from({length:Math.ceil(rows.length/n)},(_,i)=>rows.slice(i*n,(i+1)*n));
export function createSharedMemberFixture({longNameBytes=4300}={}){
 if(!Number.isSafeInteger(longNameBytes)||longNameBytes<1||longNameBytes>65536)throw Error('Original native per-value bounds only');
 const short=[0,1].map(n=>entry('SIZE','size:short:'+n,id(20000+n),{code:null,name:'S'+n}));
 const long=Array.from({length:998},(_,n)=>{const prefix='SHARED-'+String(n).padStart(3,'0')+'-';return entry('SIZE','size:long:'+n,id(30000+n),{code:null,name:prefix+'A'.repeat(longNameBytes-prefix.length)});});
 const sizes=[...short,...long];
 const old=[0,1].map(n=>entry('SIZE_GROUP','group:old:'+n,id(10000+n),{code:'OLD-'+n,name:'Original A'+n}));
 const target=[0,1].map(n=>entry('SIZE_GROUP','group:target:'+n,id(11000+n),{code:n?'Z-TARGET':'A-TARGET',name:'Preexisting B'+n}));
 const filler=Array.from({length:97},(_,n)=>entry('SIZE_GROUP','group:filler:'+n,id(50000+n),{code:'B-F'+String(n).padStart(3,'0'),name:'Nonempty filler '+n}));
 const ordered=[target[0],...filler,...old,target[1]];
 const membership=(g,s,order)=>entry('SIZE_GROUP_MEMBER','member:'+g.sourceKey+':'+s.sourceKey,null,{display_order:order},{size_group_id:ref(g),size_id:ref(s)});
 const firstMembers=new Map(ordered.map(g=>[g.nativeId,g===old[1]?short[1]:short[0]]));
 const groupChunks=chunks(ordered,100).map(gs=>gs.flatMap(g=>[g,membership(g,firstMembers.get(g.nativeId),0)]));
 const rest=target.flatMap(g=>sizes.slice(1).map((s,i)=>membership(g,s,i+1)));
 const core=[entry('CATEGORY','category:root',id(60000),{name:'Synthetic root',display_order:0}),entry('COLOR','color:one',id(61000),{code:'01',name:'Synthetic color',enabled:true}),entry('FIT','fit:one',id(62000),{code:'A',name:'Synthetic A fit',enabled:true}),entry('SEASON','season:one',id(63000),{code:'SYNTHETIC',name:'Synthetic season',display_order:0})];
 const binding={batchId:id(1),fixedSourceNamespace:'synthetic:opt01-shared-members-v1',selectionSha256:hash('SYNTHETIC OPT01 selection, not real import approval'),authorizedPayloadHash:hash('SYNTHETIC future payload, no publication')};
 const mapping={version:'NATIVE_CATALOGUE_OCCURRENCE_CANDIDATE_V1',...binding,baseManifestSha256:hash('SYNTHETIC original occurrence manifest'),groups:[core,...chunks(sizes),...groupChunks,...chunks(rest)]};
 const groupView=g=>{const members=target.includes(g)?sizes:[firstMembers.get(g.nativeId)];return {id:g.nativeId,name:g.values.name,sizes:members.map((s,i)=>({id:s.nativeId,name:s.values.name,displayOrder:i}))};};
 const dictionary=ordered.map(groupView),targetGroups=target.map(groupView),oldGroups=old.map(groupView);
 const original=baseDetail(),currentSkus=original.document.lines.map((line,n)=>({id:line.skuId,skuCode:'SYNTHETIC-SKU-'+n,productId:id(40000+n),productCode:'P'+n,productName:'Synthetic product '+n,colorId:core[1].nativeId,colorName:core[1].values.name,fitId:core[2].nativeId,fitName:core[2].values.name,sizeId:short[n].nativeId,sizeName:short[n].values.name,sizeGroupId:target[n].nativeId,barcodeAvailability:'UNAVAILABLE'}));
 original.catalog={skus:currentSkus.map(({id,skuCode,sizeName,barcodeAvailability,...s},n)=>({skuId:id,...s,sizeGroupId:old[n].nativeId})),sizeGroups:oldGroups.map((g,n)=>({sizeGroupId:g.id,code:old[n].values.code,name:g.name,members:g.sizes.map(s=>({sizeId:s.id,code:null,name:s.name,displayOrder:s.displayOrder}))}))};
 const commands=target.map((g,n)=>({action:'EDIT',requestKey:'SYNTHETIC-migrate-'+n,id:currentSkus[n].productId,expectedVersion:1,values:{productCode:currentSkus[n].productCode,name:currentSkus[n].productName,categoryId:core[0].nativeId,supplierId:null,seasonIds:[core[3].nativeId],sizeGroupId:g.nativeId,year:2026,systemItemCode:'123456'+n,thickness:null,collarPantsType:null,defaultBarcodeSchemeId:null,enabled:true,prices:Object.fromEntries(CATALOGUE_PRICE_KEYS.map(k=>[k,k==='retail_price'?'1.00':null]))},skus:[],barcodes:[]}));
 return {mapping,binding,core,sizes,short,long,ordered,dictionary,targetGroups,oldGroups,original,currentSkus,commands,longNameBytes,page(page,pageSize=100){return {page,pageSize,total:dictionary.length,items:dictionary.slice((page-1)*pageSize,page*pageSize)};}};
}
export const tupleEnvelope=groups=>({version:1,groups:groups.map(g=>[g.id,g.name,g.sizes.map(s=>[s.id,s.name,s.displayOrder])])});
/** Actual prepare() input, excluding only prepared-output fields. */
export const inputOf=chunk=>({batchId:chunk.batchId,fixedSourceNamespace:chunk.fixedSourceNamespace,selection:chunk.selection,rows:chunk.rows.map(({source,sourceKeyField,nativeId,decisions,references})=>({source,sourceKeyField,nativeId,decisions,references})),schemaProfile:'EXACT26',validatorVersion:'NATIVE_CATALOGUE_IMPORT_EXACT26_V1'});
