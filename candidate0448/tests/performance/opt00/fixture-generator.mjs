import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {BASELINE,NEGATIVE_CASES} from './scenario-spec.mjs';
export function canonicalJson(value){
 if(value===null||typeof value!=='object'){if(value===undefined||!['string','number','boolean','object'].includes(typeof value)||typeof value==='number'&&!Number.isFinite(value))throw new TypeError('Explicit JSON facts required');return JSON.stringify(value);}
 if(Array.isArray(value)){if(value.some((_,i)=>!Object.hasOwn(value,i))||Object.keys(value).length!==value.length)throw new TypeError('Dense arrays required');return '['+value.map(canonicalJson).join(',')+']';}
 if(Object.getPrototypeOf(value)!==Object.prototype)throw new TypeError('Plain JSON required');return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonicalJson(value[key])).join(',')+'}';
}
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export const dataHash=value=>sha256(canonicalJson(value));
export const minorToYuan=text=>{const value=BigInt(text);return `${value/100n}.${String(value%100n).padStart(2,'0')}`;};
export function syntheticId(kind,n){if(!/^[a-z][a-zA-Z]+$/.test(kind)||!Number.isSafeInteger(n)||n<0)throw new TypeError('Fixture identity required');const h=sha256(`OPT00_ONLY:${kind}:${n}`);return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;}
export function createFixture(){
 const halls=[0,1].map(i=>({id:syntheticId('hall',i),name:`SYNTHETIC 厅 ${i}`,enabled:true}));
 const warehouses=[0,1,2].map(i=>({id:syntheticId('warehouse',i),name:`SYNTHETIC 仓 ${i}`,hallId:halls[i%2].id,hallName:halls[i%2].name,enabled:true,hallEnabled:true,hasNonzeroInventory:true,source:i===2?'POST_CUTOFF_CREATED':'CUTOFF_MEMBER'}));
 const sizes=['S','M','L','XL'].map((name,i)=>({id:syntheticId('size',i),name,displayOrder:i}));
 const groups=[0,1].map(i=>({id:syntheticId('sizeGroup',i),name:`SYNTHETIC 尺码组 ${i}`,sizes}));
 const fits=[0,1].map(i=>({id:syntheticId('fit',i),code:i?'Y':'X',name:i?'Y版（修身）':'X版（宽松）',enabled:true,version:1}));
 const colors=[0,1].map(i=>({id:syntheticId('color',i),name:`SYNTHETIC 颜色 ${i}`}));
 const products=Array.from({length:600},(_,i)=>({id:syntheticId('product',i),code:i>=550?`A-OPT00-00000-COLLISION-${i}`:`OPT00-${String(i).padStart(5,'0')}`,name:`SYNTHETIC 商品 ${i}${i%11===0?' 超长可换行名称 不允许截断或固定高度'.repeat(3):''}`,sizeGroupId:groups[i%2].id,retailPriceMinor:String(12500+i%73*17),retailPrice:minorToYuan(String(12500+i%73*17)),enabled:true,source:i<400?'CUTOFF_MEMBER':'POST_CUTOFF_CREATED',ordinal:i}));
 const skus=products.flatMap((p,i)=>colors.flatMap((c,color)=>sizes.map((s,size)=>({id:syntheticId('sku',i*8+color*4+size),skuCode:`OPT00-SKU-${String(i*8+color*4+size).padStart(6,'0')}`,productId:p.id,productCode:p.code,productName:p.name,colorId:c.id,colorName:c.name,fitId:fits[i%2].id,fitName:fits[i%2].name,sizeId:s.id,sizeName:s.name,sizeGroupId:p.sizeGroupId,barcodeAvailability:'UNAVAILABLE'}))));
 const documents=['sales','transfer'].flatMap(kind=>Array.from({length:130},(_,i)=>({id:syntheticId(kind,i),kind,ordinal:i,source:i===7||i===8||i>=3&&i%3===0?'CUTOFF_HISTORY':'RUNTIME_LEDGER',hallId:halls[i%2].id,createdAt:i===7?null:BASELINE.fixedClock,createdByAccountId:i===7?null:syntheticId('account',i%2),businessType:kind==='sales'?(i===5?'RETURN':'SALE'):null,hasGifts:kind==='sales'&&i===4,historyRevision:i===8?1:0})));
 return {format:'opt00-logical-fixture-v1',datasetVersion:BASELINE.datasetVersion,fixedClock:BASELINE.fixedClock,safety:{syntheticOnly:true,databaseSeeded:false,fixtureAdapter:'PENDING_SCHEMA_REVIEW',realDataReferenced:false},halls,warehouses,sizes,groups,fits,colors,products,skus,documents,
  inventoryCases:[100,200,500].map(rowCount=>({rowCount,productIds:products.slice(0,rowCount).map(p=>p.id),geometry:['long-name-wrap','delayed-image','fixed-columns','horizontal-scroll','settings-reopen','collapse-expand']})),
  stockVariants:['UNKNOWN','CONFIRMED','MISSING','READ_FAILED'].map(state=>({variantOnly:true,fact:state==='CONFIRMED'?{state,quantity:'0'}:{state}})),
  publicationSpec:{actualAdmission:'PENDING',cutoffWarehouseIds:warehouses.filter(w=>w.source==='CUTOFF_MEMBER').map(w=>w.id),cutoffSkuIds:skus.slice(0,3200).map(s=>s.id),absenceIsZeroOnlyAfterActualAdmission:true},
  actors:[{accountId:syntheticId('account',0),staffId:syntheticId('staff',0),loginName:'OPT00_SYNTHETIC_ONLY',role:'ADMIN',hallId:null,authVersion:1},{accountId:syntheticId('account',1),staffId:syntheticId('staff',1),role:'SALESPERSON',hallId:halls[0].id}],
  filters:{numberedPages:[1,2,3],productPageSize:100,narrowProductIds:products.slice(12,15).map(p=>p.id),importedProductIds:products.slice(0,400).map(p=>p.id),newSkuProductIds:products.slice(400).map(p=>p.id)},
  exactLookupTrap:{targetProductId:products[0].id,substring:products[0].code,otherMatchingProductIds:products.slice(550).map(p=>p.id)},negativeCases:NEGATIVE_CASES.map(name=>({name,isolatedVariantRequired:true,applyToBaseline:false})),
  resetProtocol:{method:'NEW owned synthetic target or VERIFIED_UNCHANGED receipt; never truncate unknown target',readBaseline:'No SAVE/approve mutations; correctness clones separate',cold:'New browser context/cache off if actually supported; otherwise label first-open/no-store and uncontrolled process cache. No DB/OS cache flush'}};
}
export async function writeFixture(outdir){if(!path.isAbsolute(outdir))throw new TypeError('Absolute fresh directory required');const fixture=createFixture(),bytes=canonicalJson(fixture)+'\n';await mkdir(outdir,{recursive:false});await writeFile(path.join(outdir,'fixture.json'),bytes,{flag:'wx'});const manifest={format:'opt00-fixture-manifest-v1',datasetVersion:fixture.datasetVersion,dataSha256:dataHash(fixture),fileSha256:sha256(bytes),counts:{products:600,skus:4800,logicalDocuments:260},actualDatabase:'PENDING',actualBrowser:'PENDING'};await writeFile(path.join(outdir,'fixture-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});return manifest;}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){if(process.argv.length!==4||process.argv[2]!=='--outdir')throw new TypeError('Use --outdir ABS_FRESH_DIRECTORY');process.stdout.write(JSON.stringify(await writeFixture(process.argv[3]),null,2)+'\n');}
