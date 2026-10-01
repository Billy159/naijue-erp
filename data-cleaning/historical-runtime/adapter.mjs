/** Pure source adapter. UUIDs/source identities survive; no storage, Seed or write fallback.
 * 2026-09-23: fundsRecords is the 0..N settlement contract. V2 command lifecycle is
 * pending the consistency gate; current source-readonly transport is NOT a permanent
 * business policy. Do not fake APPROVED without its durable baseline-effect state. */
export const SOURCE='REAL_TPLUS_HISTORY';
const meta={source:SOURCE,readonly:true};
export function decimal(value){if(value===null||value===undefined||value==='')return null;const n=Number(value);if(!Number.isFinite(n))throw Error('INVALID_SOURCE_DECIMAL');return n;}
// Exact source money at cents precision; never silently round a 4-decimal price.
export function cents(value){if(value==null||value==='')return null;const s=String(value);if(!/^-?\d+(?:\.\d{1,4})?$/.test(s))throw Error('INVALID_SOURCE_MONEY');const [a,b='']=s.replace(/^-/,'').split('.');if(b.slice(2).replaceAll('0',''))return null;const n=BigInt(a)*100n+BigInt(b.slice(0,2).padEnd(2,'0'));if(n>BigInt(Number.MAX_SAFE_INTEGER))throw Error('SOURCE_MONEY_RANGE');return Number(n)*(s.startsWith('-')?-1:1);}
export function category(row){return {...meta,id:row.code,uuid:row.id,name:row.name,parent:row.parent_code||'all',standard:true,disabled:!row.enabled};}
export function historicalAttributes(a){
  const category=String(a.source?.['所属类别']||a.historicalCategory||a.categoryDecision?.old_category_for_review_only||'');
  const years=[...new Set(category.match(/(?:19|20)\d{2}/g)||[])];
  const seasons=['春','夏','秋','冬'].filter(x=>category.includes(x));
  return {year:a.year??(years.length===1?years[0]:null),season:a.season??(seasons.length?seasons.join('、'):null),attributeLineage:{yearSeason:{sourceField:'所属类别',sourceValue:category,rule:'explicit-year-and-season-v1'},supplier:{sourceField:'默认供应商编码',sourceCode:a.source?.['默认供应商编码']??a.sourceSupplierCode??null,sourceName:a.source?.['默认供应商']??a.sourceSupplierName??null}}};
}
export const FITS=Object.freeze([['Y','修身','3'],['A','标准','5'],['B','宽松','6'],['C','加肥','7'],['D','加肥加大','8'],['E','特体','9']].map(([id,label,barcodeCode])=>Object.freeze({id,code:id,name:id+'版（'+label+'）',barcodeCode,fixed:true})));
export function compatibleFit(name){
 const value=String(name||'').trim();
 const explicit=value.toUpperCase().match(/([YABCDE])\s*版/);
 const code=explicit?.[1]||(FITS.some(f=>f.id===value.toUpperCase())?value.toUpperCase():/特体/.test(value)?'E':/加肥加大/.test(value)?'D':/加肥/.test(value)?'C':/宽松|偏大|大版/.test(value)?'B':/修身|偏小/.test(value)?'Y':'A');
 return FITS.find(f=>f.id===code);
}
export function product(row,skus=[],barcodes=[],balances=[]){
  const a=row.attributes||{},colors=new Map(),sizes=new Map();if(a.colorSplit)skus=skus.map(s=>({...s,options:{...s.options,COLOR:{...s.options.COLOR,name:a.colorSplit.colorName,code:a.colorSplit.colorCode}}}));
  for(const sku of skus){if(sku.product_id!==row.id)throw Error('SKU_PRODUCT_MISMATCH');for(const [key,map]of [['COLOR',colors],['SIZE',sizes]]){const x=sku.options[key];if(!x)throw Error('MISSING_SKU_DIMENSION');map.set(x.id,x);}}
  const colorIds=[...colors.keys()],sizeIds=[...sizes.keys()],stock={},bindings={},skuByCell={};
  for(const s of skus){const key=s.options.COLOR.id+'|'+s.options.SIZE.id;if(skuByCell[key])throw Error('LEGACY_CELL_COLLISION');skuByCell[key]=s.id;bindings[key]={current:'',history:[],skuId:s.id,readonly:true};}
  for(const b of barcodes){if(b.product_id!==row.id)throw Error('BARCODE_PRODUCT_MISMATCH');if(b.sku_binding_known&&b.sku_id){const cell=Object.keys(skuByCell).find(k=>skuByCell[k]===b.sku_id);if(!cell)throw Error('BARCODE_SKU_MISSING');if(b.generated){bindings[cell].current=b.barcode;bindings[cell].currentMeta={schemeId:b.scheme_id,source:'V2_GENERATED',evidence:b.evidence};}else bindings[cell].history.push(b.barcode);}}
  const bySku=new Map(skus.map(s=>[s.id,s]));
  for(const b of balances){const sku=bySku.get(b.variant_id);if(!sku)throw Error('INVENTORY_SKU_MISSING');const c=colorIds.indexOf(sku.options.COLOR.id),s=sizeIds.indexOf(sku.options.SIZE.id);stock[b.warehouse_id]??=colorIds.map(()=>sizeIds.map(()=>null));stock[b.warehouse_id][c][s]=decimal(b.quantity);}
  return {...a,...historicalAttributes(a),...meta,schemeId:({0:"2020",8:"2018",6:"2021",2:"2021fit",9:"2023"})[a.sourceBarcodeSchemeCode]||a.schemeId||"",barcodeItemCode:(row.code.match(/(?<![0-9])[0-9]{7}(?![0-9])/g)||[]).length===1?row.code.match(/(?<![0-9])[0-9]{7}(?![0-9])/)[0]:"",id:row.code,displayId:a.colorSplit?.baseCode||row.code,styleNumber:a.colorSplit?.baseCode||row.code,colorSplit:a.colorSplit||null,uuid:row.id,name:row.name,categoryId:row.category_code,category:row.category_name,fitId:compatibleFit(row.fit_name).id,fit:compatibleFit(row.fit_name).name,fitBarcodeCode:compatibleFit(row.fit_name).barcodeCode,sourceFit:{id:row.fit_id,name:row.fit_name},supplierId:row.counterparty_id,enabled:row.enabled,unit:row.unit,sizeSystem:'legacy',sourceGroupId:row.source_size_group_id,sourceGroupName:a.sourceSizeGroupCode,groupId:[...sizes.values()].some(s=>s.standardGroup)?([...sizes.values()].some(s=>s.standardGroup?.includes('裤'))?'PANTS':'UPPER'):row.source_size_group_id,legacyGroupName:[...new Set([...sizes.values()].map(s=>s.standardGroup).filter(Boolean))].join('、')||a.sourceSizeGroupCode,legacySizeRecords:[...sizes.values()],colorIds,sizeIds,colors:[...colors.values()].map(x=>x.name),sizes:[...sizes.values()].map(x=>x.name),barcodes:bindings,productBarcodes:structuredClone(barcodes),skuByCell,stock,stockTotal:decimal(row.stock_total),price:decimal(a.price),purchasePrice:decimal(a.purchasePrice),minimumPrice:decimal(a.minimumPrice),images:a.images||[],sourceFacts:{...meta,attributes:structuredClone(a)}};
}
export function line(row){return {...meta,id:row.source_id,uuid:row.target_line_id,skuId:row.sku_id,productUuid:row.product_id,productId:row.source_product_code,name:row.source_product_name,colorId:row.color_id,sizeId:row.size_id,color:row.source_color_name,size:row.source_size_name,quantity:decimal(row.source_quantity),unit:row.unit,priceCents:cents(row.unit_price),sourceUnitPrice:row.unit_price,amountCents:cents(row.amount),referenceCents:null,gift:null,warehouseId:row.warehouse_id,sourceLineage:structuredClone(row.source_lineage)};}
export function fund(row){return {...meta,id:row.source_id,settlementId:row.settlement_id,methodId:row.payment_method_id,accountId:row.fund_account_id,methodName:row.source_payment_method_name,accountName:row.source_fund_account_name,amountCents:cents(row.amount),direction:row.direction,settledAt:row.settled_at,sourceBusinessDate:row.source_business_date,reference:row.reference||{batchId:row.batch_id,sourceDocumentId:row.source_document_id,targetDocumentId:row.target_document_id,sourceId:row.source_id,settlementId:row.settlement_id},sourceFacts:structuredClone(row.source_payload)};}
export function sale(row,lines,funds){
  if(lines.length!==row.line_count)throw Error('INCOMPLETE_DOCUMENT_LINES');
  if(funds.some(x=>x.target_document_id!==row.target_document_id)||lines.some(x=>x.target_document_id!==row.target_document_id))throw Error('DOCUMENT_ID_MISMATCH');
  const a=row.source_payload,records=funds.map(fund);
  return {...meta,id:row.source_number,uuid:row.target_document_id,sourceId:row.source_id,date:row.business_date,datePrecision:'day',status:row.audit_status,revision:null,auditWorkflow:false,creator:null,created:row.created_at,updated:null,customerId:row.source_party_id,customerName:row.party_name,warehouseId:row.source_warehouse_id,warehouseName:row.warehouse_name,salespersonId:row.source_employee_id,salespersonName:row.employee_name,storeId:row.hall_id,storeName:row.hall_name,businessType:a.businessType,note:a.note,adjustmentCents:cents(a.rounding),sourceAmountCents:cents(a.amountAfterRounding),lines:lines.map(line),fundsRecords:records,links:[],history:[],sourceFacts:structuredClone(a)};
}
export function transfer(row,lines,products){
  if(lines.length!==row.line_count)throw Error('INCOMPLETE_DOCUMENT_LINES');const quantities={},items=new Set();
  for(const l of lines){if(l.target_document_id!==row.target_document_id)throw Error('DOCUMENT_ID_MISMATCH');const p=products.find(p=>p.uuid===l.product_id);if(!p)throw Error('PRODUCT_NOT_LOADED');const c=p.colorIds.indexOf(l.color_id),s=p.sizeIds.indexOf(l.size_id);if(c<0||s<0)throw Error('SKU_NOT_LOADED');const key=[p.id,c,s].join('|');quantities[key]=(quantities[key]||0)+decimal(l.source_quantity);items.add(p.id);}
  return {...meta,id:row.source_number,uuid:row.target_document_id,sourceId:row.source_id,date:row.business_date,status:row.audit_status,revision:null,version:null,from:row.source_from_warehouse_id,to:row.source_to_warehouse_id,fromName:row.from_warehouse_name,toName:row.to_warehouse_name,q:quantities,items:[...items],lines:lines.map(line),hiddenColors:[],scans:[],history:[],creator:null,created:row.created_at,updated:null,saved:true,sourceFacts:structuredClone(row.source_payload)};
}
export const denyWrite=()=>({ok:false,code:'REAL_DATA_READ_ONLY',error:'真实数据模式只读，本次操作未提交'});
export class LegacyClient {
  constructor(base='http://127.0.0.1:8878',fetcher=globalThis.fetch){this.base=base;this.fetcher=fetcher;this.realDataMode=true;}
  async get(path,query={}){const url=new URL(path,this.base);for(const [k,v]of Object.entries(query))if(v!==undefined&&v!==null&&v!=='')url.searchParams.set(k,String(v));const response=await this.fetcher(url);const body=await response.json();if(!response.ok||!body.ok)throw Error(body.error||'LEGACY_API_FAILED');if(body.database!=='business_management'||body.schema!=='tplus_demo_20260922_a2'||body.batch!=='TPLUS-20260922-A2'||!body.readonly)throw Error('WRONG_DATA_SPACE');return body.data;}
  // Only explicitly requested entity detail collections may be assembled, never a whole history list.
  async detailPages(path){const result=[];let page=1,total;do{const part=await this.get(path,{page,size:200});total=part.total;result.push(...part.items);page++;if(page>100)throw Error('DETAIL_TOO_LARGE');}while(result.length<total);return result;}
  async product(code){const path='/products/'+encodeURIComponent(code);const row=await this.get(path);const [skus,barcodes,balances]=await Promise.all([this.detailPages(path+'/skus'),this.detailPages(path+'/barcodes'),this.detailPages(path+'/inventory')]);return product(row,skus,barcodes,balances);}
  async sale(id){const path='/sales/'+encodeURIComponent(id);const row=await this.get(path);const [lines,funds]=await Promise.all([this.detailPages(path+'/lines'),this.detailPages(path+'/funds')]);return sale(row,lines,funds);}
  async transfer(id){const path='/transfers/'+encodeURIComponent(id),row=await this.get(path),lines=await this.detailPages(path+'/lines');const codes=[...new Set(lines.map(x=>x.source_product_code))],products=[];for(const code of codes)products.push(await this.product(code));return transfer(row,lines,products);}
  command(){return denyWrite();}
}
