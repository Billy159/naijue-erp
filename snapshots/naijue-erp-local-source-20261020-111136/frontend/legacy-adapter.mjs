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
  const a=row.attributes||{},colors=new Map(),sizes=new Map(),validSkus=[],historicalUnmappedSkus=[];
  if(a.colorSplit)skus=skus.map(s=>({...s,options:{...s.options,COLOR:{...s.options?.COLOR,name:a.colorSplit.colorName,code:a.colorSplit.colorCode}}}));
  for(const sku of skus){
   const color=sku.options?.COLOR,size=sku.options?.SIZE;
   if(sku.product_id!==row.id||!color?.id||!size?.id||sku.historicalUnmappedReason){
    historicalUnmappedSkus.push({skuId:sku.id,color:color?.sourceName||color?.name||'',size:size?.sourceName||size?.name||'',fit:sku.fit_id||row.fit_name||'',barcodes:[],warehouses:[],reason:sku.historicalUnmappedReason||'原规格缺少可用维度'});
    continue;
   }
   colors.set(color.id,color);sizes.set(size.id,size);validSkus.push(sku);
  }
  validSkus.sort((left,right)=>Number(!!right.overlay)-Number(!!left.overlay));
  const colorIds=[...colors.keys()],sizeIds=[...sizes.keys()],stock={},bindings={},skuByCell={},skuByFitCell={},baseFit=compatibleFit(row.fit_name).id;
  for(const s of validSkus){const cid=s.options.COLOR.id,sid=s.options.SIZE.id,fitId=s.fit_id||baseFit,key=fitId===baseFit?cid+'|'+sid:cid+'|'+fitId+'|'+sid,fitKey=cid+'|'+fitId+'|'+sid;if(skuByFitCell[fitKey]){historicalUnmappedSkus.push({skuId:s.id,color:s.options.COLOR.sourceName||s.options.COLOR.name,size:s.options.SIZE.sourceName||s.options.SIZE.name,fit:s.fit_id||row.fit_name||'',barcodes:[],warehouses:[],reason:'原规格与另一 SKU 重复'});continue;}skuByFitCell[fitKey]=s.id;if(fitId===baseFit)skuByCell[cid+'|'+sid]=s.id;bindings[key]={current:'',history:[],skuId:s.id,fitId,readonly:true,barcodeStatus:s.barcodeAuthority?.status||null};}
  for(const b of barcodes){if(b.product_id!==row.id)continue;if(b.sku_id&&skus.some(s=>s.id===b.sku_id&&s.product_id===row.id)){const cell=Object.keys(bindings).find(k=>bindings[k].skuId===b.sku_id);if(!cell){const historical=historicalUnmappedSkus.find(x=>x.skuId===b.sku_id);if(historical)historical.barcodes.push(b.barcode);continue;}if(b.generated){bindings[cell].current=b.barcode;bindings[cell].currentMeta={schemeId:b.scheme_id,source:b.evidence?.generated===false?'APPROVED_EXCEL':'V2_GENERATED',evidence:b.evidence};}else{const original=validSkus.find(s=>s.id===b.sku_id);bindings[cell].history.push(b.barcode);bindings[cell].historyMeta??={};bindings[cell].historyMeta[b.barcode]={schemeId:b.scheme_id,originalSpec:[original?.options?.COLOR?.sourceName||original?.options?.COLOR?.name,original?.fit_name||row.fit_name||original?.fit_id,original?.options?.SIZE?.sourceName||original?.options?.SIZE?.name].filter(Boolean).join(' / ')};}}}
  for(const binding of Object.values(bindings))binding.history=[...new Set(binding.history)].filter(code=>code!==binding.current);
  const bySku=new Map(validSkus.filter(s=>skuByFitCell[(s.options.COLOR.id)+'|'+(s.fit_id||baseFit)+'|'+(s.options.SIZE.id)]===s.id).map(s=>[s.id,s]));
  for(const b of balances){const sku=bySku.get(b.variant_id);if(!sku){const historical=historicalUnmappedSkus.find(x=>x.skuId===b.variant_id);if(historical)historical.warehouses.push({warehouseId:b.warehouse_id,quantity:decimal(b.quantity)});continue;}const c=colorIds.indexOf(sku.options.COLOR.id),s=sizeIds.indexOf(sku.options.SIZE.id);stock[b.warehouse_id]??=colorIds.map(()=>sizeIds.map(()=>null));stock[b.warehouse_id][c][s]=(stock[b.warehouse_id][c][s]??0)+decimal(b.quantity);}
  return {...a,...historicalAttributes(a),...meta,schemeId:a.excelBarcodeSchemeId||({0:"2020",8:"2018",6:"2021",2:"2021fit",9:"2023"})[a.sourceBarcodeSchemeCode]||a.schemeId||"",barcodeItemCode:a.excelBarcodeAuthority?.active?(a.barcodeItemCode??a.defaultBarcode??""):(row.code.match(/(?<![0-9])[0-9]{7}(?![0-9])/g)||[]).length===1?row.code.match(/(?<![0-9])[0-9]{7}(?![0-9])/)[0]:"",id:row.code,displayId:a.colorSplit?.baseCode||row.code,styleNumber:a.colorSplit?.baseCode||row.code,colorSplit:a.colorSplit||null,uuid:row.id,name:row.name,categoryId:row.category_code,category:row.category_name,fitId:baseFit,baseFitId:baseFit,fit:compatibleFit(row.fit_name).name,fitBarcodeCode:compatibleFit(row.fit_name).barcodeCode,sourceFit:{id:row.fit_id,name:row.fit_name},supplierId:row.counterparty_id,enabled:row.enabled,unit:row.unit,unitId:row.unit_id,sizeSystem:row.source_type==='V2'&&!a.excelBarcodeAuthority?.active?'standard':'legacy',sourceGroupId:row.source_size_group_id,sourceGroupName:a.sourceSizeGroupCode,groupId:[...sizes.values()].some(s=>s.standardGroup)?([...sizes.values()].some(s=>s.standardGroup?.includes('裤'))?'PANTS':'UPPER'):row.source_size_group_id,legacyGroupName:[...new Set([...sizes.values()].map(s=>s.standardGroup).filter(Boolean))].join('、')||a.sourceSizeGroupCode,legacySizeRecords:[...sizes.values()],colorIds,sizeIds,colors:[...colors.values()].map(x=>x.name),sizes:[...sizes.values()].map(x=>x.name),barcodes:bindings,productBarcodes:structuredClone(barcodes),skuByCell,skuByFitCell,sourceSkuIds:skus.filter(s=>!s.overlay).map(s=>s.id),historicalUnmappedSkus,stock,stockTotal:decimal(row.stock_total),price:decimal(a.price),purchasePrice:decimal(a.purchasePrice),minimumPrice:decimal(a.minimumPrice),images:a.images||[],sourceFacts:{...meta,attributes:structuredClone(a)}};
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
  for(const l of lines){
    if(l.target_document_id!==row.target_document_id)throw Error('DOCUMENT_ID_MISMATCH');
    const candidates=products.filter(p=>p.uuid===l.product_id&&Object.values(p.skuByCell||{}).includes(l.sku_id));
    if(!candidates.length)throw Error('PRODUCT_NOT_LOADED');
    if(candidates.length!==1)throw Error('SKU_NOT_LOADED');
    const p=candidates[0],cells=Object.entries(p.skuByCell).filter(([,id])=>id===l.sku_id);
    if(cells.length!==1)throw Error('SKU_NOT_LOADED');
    const dimensions=cells[0][0].split('|');
    if(dimensions.length!==2||!dimensions[0]||!dimensions[1])throw Error('SKU_NOT_LOADED');
    const [colorId,sizeId]=dimensions;
    // Only omitted redundant dimensions use the uniquely proven SKU relation.
    if(Object.hasOwn(l,'color_id')&&l.color_id!==colorId||Object.hasOwn(l,'size_id')&&l.size_id!==sizeId)throw Error('SKU_NOT_LOADED');
    const c=p.colorIds.indexOf(colorId),s=p.sizeIds.indexOf(sizeId);
    if(c<0||s<0||p.colorIds.lastIndexOf(colorId)!==c||p.sizeIds.lastIndexOf(sizeId)!==s||p.skuByCell[colorId+'|'+sizeId]!==l.sku_id)throw Error('SKU_NOT_LOADED');
    const key=[p.id,c,s].join('|');quantities[key]=(quantities[key]||0)+decimal(l.source_quantity);items.add(p.id);
  }
  return {...meta,id:row.source_number,uuid:row.target_document_id,sourceId:row.source_id,date:row.business_date,status:row.audit_status,revision:null,version:null,from:row.source_from_warehouse_id,to:row.source_to_warehouse_id,fromName:row.from_warehouse_name,toName:row.to_warehouse_name,note:row.note??row.source_payload?.note??'',q:quantities,items:[...items],lines:lines.map(line),hiddenColors:[],scans:[],history:[],creator:null,created:row.created_at,updated:null,saved:true,sourceFacts:structuredClone(row.source_payload)};
}
export const denyWrite=()=>({ok:false,code:'REAL_DATA_READ_ONLY',error:'真实数据模式只读，本次操作未提交'});
export class LegacyClient {
  constructor(client=globalThis.ERP_API){if(!client?.request)throw Error('SERVICE_CLIENT_REQUIRED');this.client=client;this.realDataMode=true;}
  async get(path,query={}){const params=new URLSearchParams();for(const [k,v]of Object.entries(query))if(v!==undefined&&v!==null&&v!=='')params.set(k,String(v));return this.client.request(path+(params.size?'?'+params:''));}
  // Only explicitly requested entity detail collections may be assembled, never a whole history list.
  async detailPages(path){const result=[];let page=1,total;do{const part=await this.get(path,{page,size:200});total=part.total;result.push(...part.items);page++;if(page>100)throw Error('DETAIL_TOO_LARGE');}while(result.length<total);return result;}
  async product(code){const path='/products/'+encodeURIComponent(code);const row=await this.get(path);const [skus,barcodes,balances]=await Promise.all([this.detailPages(path+'/skus'),this.detailPages(path+'/barcodes'),this.detailPages(path+'/inventory')]);return product(row,skus,barcodes,balances);}
  async sale(id){const path='/sales/'+encodeURIComponent(id);const row=await this.get(path);const [lines,funds]=await Promise.all([this.detailPages(path+'/lines'),this.detailPages(path+'/funds')]);return sale(row,lines,funds);}
  async transfer(id){const path='/transfers/'+encodeURIComponent(id),row=await this.get(path),lines=await this.detailPages(path+'/lines');const codes=[...new Set(lines.map(x=>x.source_product_code))],products=[];for(const code of codes)products.push(await this.product(code));return transfer(row,lines,products);}
  command(){return denyWrite();}
}
