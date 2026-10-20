import type {AuthorizedContext} from '../../security/service.js';
import {identifier, object} from '../../security/errors.js';
import {baseFit, fits, record, seasons, sizeGroups, text, fail,imageRoleLabel} from './definitions.js';
import {productIdentities,resolveProductIdentity} from './identity.js';

export interface Option {id:string; name:string; code:string; sourceName?:string; sourceCode?:string; currentGroupId?:string; standardGroup?:string}
export interface ProductRow {id:string; code:string; name:string; enabled:boolean; unit:string|null; fit_name:string|null; attributes:Record<string,unknown>; [key:string]:unknown}
export interface SkuRow {id:string; product_id:string; enabled:boolean; options:Record<string,Option>; fit_id?:string; overlay?:boolean; historicalUnmappedReason?:string; [key:string]:unknown}
export interface BarcodeRow {product_id:string; sku_id:string|null; barcode:string; generated?:boolean; [key:string]:unknown}
export interface Profile {product_id:string; body:Record<string,unknown>; version:number}
export interface Catalog {products:ProductRow[]; skus:SkuRow[]; barcodes:BarcodeRow[]; sourceBarcodes:BarcodeRow[]; profiles:Profile[]; aliases:BarcodeRow[]}
export interface Master {kind:string; id:string; body:Record<string,unknown>; version:number; deleted:boolean}
interface BarcodePolicy {revision:string;source_sha256:string}
interface BarcodeAuthority {sku_id:string;product_id:string;status:string;record:Record<string,unknown>}
interface BarcodeSupplement {sku_id:string;status:string;barcode:string|null;record:Record<string,unknown>}
interface BarcodeReadState {
  sourceBarcodes:BarcodeRow[];generated:BarcodeRow[];aliases:BarcodeRow[];policy:BarcodePolicy|null;
  managed:{product_id:string}[];authorities:BarcodeAuthority[];supplements:BarcodeSupplement[];
}
function barcodeSkuSelection(source:string,runtime:string):string {
  return `SELECT v.id FROM ${source}.variant v WHERE v.product_id=ANY($1::uuid[])
    UNION ALL SELECT v.id FROM ${runtime}.variant_overlay v WHERE v.product_id=ANY($1::uuid[])
      AND NOT EXISTS(SELECT 1 FROM ${source}.variant src WHERE src.id=v.id)`;
}

/** One action-local read of code/filter facts; there is no cross-request cache. */
async function barcodeReadState({session,repo}:AuthorizedContext,productIds:readonly string[]):Promise<BarcodeReadState> {
  const s=repo.source,r=repo.runtime;
  const rows=(sql:string)=>`coalesce((SELECT jsonb_agg(row) FROM (${sql}) row),'[]'::jsonb)`;
  return (await session.query<{state:BarcodeReadState}>(`SELECT jsonb_build_object(
    'sourceBarcodes',${rows(`SELECT product_id,sku_id,barcode FROM ${s}.tplus_product_barcode WHERE product_id=ANY($1::uuid[])`)},
    'generated',${rows(`SELECT product_id,sku_id,barcode,true generated,evidence FROM ${r}.generated_barcode WHERE product_id=ANY($1::uuid[])`)},
    'aliases',${rows(`SELECT product_id,sku_id,barcode,origin FROM ${r}.product_barcode_alias WHERE product_id=ANY($1::uuid[])`)},
    'policy',(SELECT jsonb_build_object('revision',revision,'source_sha256',source_sha256) FROM ${r}.barcode_authority_policy WHERE singleton),
    'managed',${rows(`SELECT product_id FROM ${r}.barcode_authority_product WHERE product_id=ANY($1::uuid[])`)},
    'authorities',${rows(`SELECT sku_id,product_id,status,record FROM ${r}.barcode_authority_record WHERE product_id=ANY($1::uuid[])`)},
    'supplements',${rows(`SELECT sku_id,status,barcode,record FROM ${r}.barcode_scheme_supplement WHERE sku_id IN (${barcodeSkuSelection(s,r)})`)}) state`,[productIds])).rows[0]!.state;
}

/** Overlay and source mapping facts are restricted to this batch's original SKUs. */
async function barcodeSpecState({session,repo}:AuthorizedContext,productIds:readonly string[]) {
  return (await session.query<{overlays:{id:string;fit_id:string;group_name:string}[];pack:unknown}>(`SELECT
    coalesce((SELECT jsonb_agg(row) FROM (SELECT id,fit_id,group_name FROM ${repo.runtime}.variant_overlay WHERE product_id=ANY($1::uuid[])) row),'[]'::jsonb) overlays,
    (SELECT jsonb_build_object('packSha256',value->'packSha256','items',
      (SELECT jsonb_object_agg(id::text,value->'items'->id::text) FROM (${barcodeSkuSelection(repo.source,repo.runtime)}) selected_sku
        WHERE jsonb_typeof(value->'items')='object' AND (value->'items') ? id::text))
      FROM ${repo.source}.system_setting WHERE key='inventory.standard-size-mappings') pack`,[productIds])).rows[0]!;
}

function productRowsSql(s:string,r:string,selected:(column:string)=>string,identityOnly=false):string {
  const identityAttributes=(column:string)=>`CASE WHEN jsonb_typeof(${column})='object' THEN
    (CASE WHEN ${column} ? 'sourceSizeGroupName' THEN jsonb_build_object('sourceSizeGroupName',${column}->'sourceSizeGroupName') ELSE '{}'::jsonb END)
    || (CASE WHEN ${column} ? 'sourceSizeGroupCode' THEN jsonb_build_object('sourceSizeGroupCode',${column}->'sourceSizeGroupCode') ELSE '{}'::jsonb END)
    ELSE '{}'::jsonb END`;
  const sourceAttributes=identityOnly?identityAttributes('ps.source_payload'):"coalesce(ps.source_payload,'{}'::jsonb)";
  const overlayAttributes=identityOnly?identityAttributes('p.body'):'p.body';
  return `SELECT p.id,p.code,coalesce(pp.body->>'name',p.name) name,
    coalesce((pp.body->>'enabled')::boolean,p.enabled) enabled,u.name unit,p.unit_id,p.fit_id,p.counterparty_id,
    c.code category_code,c.name category_name,f.name fit_name,ps.source_size_group_id,g.name source_group_name,
    ${sourceAttributes} attributes,p.created_at,NULL::text source_type,NULL::text stock_total
    FROM ${s}.product p LEFT JOIN ${s}.unit u ON u.id=p.unit_id LEFT JOIN ${s}.category c ON c.id=p.category_id
    LEFT JOIN ${s}.fit f ON f.id=p.fit_id LEFT JOIN ${r}.product_profile_overlay pp ON pp.product_id=p.id
    LEFT JOIN LATERAL (SELECT * FROM ${s}.tplus_product_source ps WHERE ps.product_id=p.id
      AND ps.batch_id=(SELECT batch_id FROM ${s}.tplus_import_run WHERE status='COMMITTED' ORDER BY committed_at DESC NULLS LAST,started_at DESC LIMIT 1)) ps ON true
    LEFT JOIN ${s}.size_group g ON g.id=ps.source_size_group_id
    WHERE NOT EXISTS(SELECT 1 FROM ${r}.product_overlay h WHERE h.id=p.id AND h.deleted)${selected('p.id')}
    UNION ALL SELECT p.id,p.code,coalesce(pp.body->>'name',p.body->>'name'),coalesce((pp.body->>'enabled')::boolean,true),
      p.body->>'unit',(p.body->>'unitId')::uuid,NULL::uuid,NULL::uuid,p.body->>'categoryId',coalesce(cm.body->>'name',c.name),
      coalesce(p.body->>'fitId','A')||'版',NULL::uuid,NULL::text,${overlayAttributes},p.created_at,'V2',NULL::text
    FROM ${r}.product_overlay p LEFT JOIN ${r}.product_profile_overlay pp ON pp.product_id=p.id
    LEFT JOIN ${s}.category c ON c.code=p.body->>'categoryId'
    LEFT JOIN ${r}.product_master_overlay cm ON cm.kind='categories' AND cm.id=p.body->>'categoryId'
    WHERE NOT p.deleted AND NOT EXISTS(SELECT 1 FROM ${s}.product src WHERE src.id=p.id)${selected('p.id')}`;
}

export async function productMasters({session,repo}:AuthorizedContext): Promise<Master[]> {
  return (await session.query<Master>(`SELECT kind,id,body,deleted,version FROM ${repo.runtime}.product_master_overlay ORDER BY kind,id`)).rows;
}
/** Reads never install DDL or generate codes. Only the active source batch supplies attributes. */
export async function catalog(context:AuthorizedContext, productIds?:readonly string[]): Promise<Catalog> {
  return readCatalog(context,productIds,false);
}
async function readCatalog(context:AuthorizedContext, productIds:readonly string[]|undefined,identityOnly:boolean): Promise<Catalog> {
  const {session,repo}=context,s=repo.source,r=repo.runtime;
  const selectedIds=productIds===undefined?undefined:[...new Set(productIds.map(id=>identifier(id,true)))];
  if(selectedIds&&(!selectedIds.length||selectedIds.length>100))return fail('商品导出每批须为 1–100 个商品');
  const selected=(column:string)=>selectedIds?` AND ${column}=ANY($1::uuid[])`:'';
  const selectedValues=selectedIds?[selectedIds]:[];
  const products=(await session.query<ProductRow>(productRowsSql(s,r,selected,identityOnly)+' ORDER BY code',selectedValues)).rows;
  const profileBody=identityOnly?`jsonb_build_object('disabledSkuIds',body->'disabledSkuIds','removedHistoricalBarcodes',body->'removedHistoricalBarcodes') body`:'body';
  const profiles=(await session.query<Profile>(`SELECT product_id,${profileBody},version FROM ${r}.product_profile_overlay WHERE true${selected('product_id')}`,selectedValues)).rows;
  const skus=(await session.query<SkuRow>(`SELECT v.id,v.product_id,v.enabled,v.version,
    coalesce((SELECT jsonb_object_agg(d.code,jsonb_build_object('id',sv.id,'name',sv.name,'code',sv.code))
      FROM ${s}.variant_option vo JOIN ${s}.spec_dimension d ON d.id=vo.dimension_id JOIN ${s}.spec_value sv ON sv.id=vo.spec_value_id WHERE vo.variant_id=v.id),'{}') options
    FROM ${s}.variant v WHERE true${selected('v.product_id')} UNION ALL SELECT v.id,v.product_id,true,1,
      jsonb_build_object('COLOR',jsonb_build_object('id',v.color_id,'name',coalesce(cm.body->>'name',sv.name),'code',coalesce(cm.body->>'code',sv.code)),
        'SIZE',jsonb_build_object('id',v.size_id,'name',v.size_name,'code',v.size_code,'sourceName',v.size_name,'sourceCode',v.size_code,'standardGroup',v.group_name))
    FROM ${r}.variant_overlay v LEFT JOIN ${s}.spec_value sv ON sv.id=v.color_id
    LEFT JOIN ${r}.product_master_overlay cm ON cm.kind='colors' AND cm.id=v.color_id::text
    WHERE NOT EXISTS(SELECT 1 FROM ${s}.variant src WHERE src.id=v.id)${selected('v.product_id')}`,selectedValues)).rows;
  const specState=selectedIds?await barcodeSpecState(context,selectedIds):undefined;
  const overlays=specState?specState.overlays:(await session.query<{id:string;fit_id:string;group_name:string}>(`SELECT id,fit_id,group_name FROM ${r}.variant_overlay WHERE true${selected('product_id')}`,selectedValues)).rows;
  const pack=record(specState?specState.pack:(await session.query<{value:unknown}>(`SELECT value FROM ${s}.system_setting WHERE key='inventory.standard-size-mappings'`)).rows[0]?.value);
  const items=record(pack['items']),byProduct=new Map(products.map(p=>[p.id,p]));
  const profilesByProduct=new Map(profiles.map(p=>[p.product_id,p])),overlaysBySku=new Map(overlays.map(v=>[v.id,v]));
  const disabledByProduct=new Map(profiles.map(p=>[p.product_id,new Set(Array.isArray(p.body?.['disabledSkuIds'])?p.body['disabledSkuIds']:[])]));
  const groups=sizeGroups(),groupsById=new Map(groups.map(g=>[g.id,g])),groupsByName=new Map(groups.map(g=>[g.name,g]));
  for (const sku of skus) {
    const p=byProduct.get(sku.product_id),overlay=overlaysBySku.get(sku.id),size=sku.options['SIZE'];
    sku.enabled=sku.enabled!==false&&!disabledByProduct.get(sku.product_id)?.has(sku.id);
    if (overlay) {sku.overlay=true;sku.fit_id=overlay.fit_id;const group=groupsByName.get(overlay.group_name);if(size&&group)size.currentGroupId=group.id;continue;}
    sku.fit_id=baseFit(p?.fit_name);
    if (!p||!size) {sku.historicalUnmappedReason='MISSING_SIZE_MAPPING';continue;}
    const mapping=record(items[sku.id]),source=record(mapping['source']),target=record(mapping['target']);
    const verified=typeof pack['packSha256']==='string'&&/^[0-9a-f]{64}$/.test(pack['packSha256'])
      && source['sku']===sku.id&&source['product']===p.code&&source['color']===sku.options['COLOR']?.code
      && source['sourceCode']===size.code&&source['sourceSize']===size.name
      && source['sourceGroup']===(p['source_group_name']||p.attributes['sourceSizeGroupName']||p.attributes['sourceSizeGroupCode'])
      && ['group','fit','code','size'].every(k=>typeof target[k]==='string'&&target[k])&&(size.name!=='无尺码'||target['size']==='无尺码');
    size.sourceName=size.name;size.sourceCode=size.code;
    const group=groupsByName.get(String(target['group']))||groupsById.get(String(target['group']));
    if (verified&&group?.sizes.some(v=>v.name===target['size'])) {
      size.name=String(target['size']);size.code=size.sourceName==='无尺码'&&size.sourceCode==='910'?'910':String(target['code']);
      size.currentGroupId=group.id;size.standardGroup=group.name;
      // A display fit never rebinds the original SKU; it is used only after the exact source check.
      sku.fit_id=String(target['fit']);
    } else sku.historicalUnmappedReason=Object.keys(mapping).length?'SOURCE_IDENTITY_MISMATCH':'MISSING_SIZE_MAPPING';
  }
  const codeState=identityOnly?await barcodeReadState(context,selectedIds!):undefined;
  const sourceBarcodes=codeState?codeState.sourceBarcodes:(await session.query<BarcodeRow>(`SELECT product_id,sku_id,barcode,sku_binding_known,is_default,binding_scope,source_payload FROM ${s}.tplus_product_barcode WHERE true${selected('product_id')}`,selectedValues)).rows;
  let barcodes=[...sourceBarcodes,...(codeState?codeState.generated:(await session.query<BarcodeRow>(`SELECT product_id,sku_id,barcode,true generated,scheme_id,evidence FROM ${r}.generated_barcode WHERE true${selected('product_id')}`,selectedValues)).rows)];
  let aliases=codeState?codeState.aliases:(await session.query<BarcodeRow>(`SELECT product_id,sku_id,barcode,historical_note,origin FROM ${r}.product_barcode_alias WHERE true${selected('product_id')}`,selectedValues)).rows;
  const policy=codeState?codeState.policy:(await session.query<BarcodePolicy>(`SELECT revision,source_sha256 FROM ${r}.barcode_authority_policy WHERE singleton`)).rows[0];
  if (policy) {
    const managed=new Set((codeState?codeState.managed:(await session.query<{product_id:string}>(`SELECT product_id FROM ${r}.barcode_authority_product WHERE true${selected('product_id')}`,selectedValues)).rows).map(v=>v.product_id));
    const authorities=codeState?codeState.authorities:(await session.query<BarcodeAuthority>(`SELECT sku_id,product_id,status,record FROM ${r}.barcode_authority_record WHERE true${selected('product_id')}`,selectedValues)).rows;
    const supplements=codeState?codeState.supplements:(await session.query<BarcodeSupplement>(`SELECT sku_id,status,barcode,record FROM ${r}.barcode_scheme_supplement WHERE ${selectedIds?`sku_id IN (${barcodeSkuSelection(s,r)})`:'true'}`,selectedValues)).rows;
    const authorityBySku=new Map(authorities.map(a=>[a.sku_id,a])),supplementBySku=new Map(supplements.map(a=>[a.sku_id,a]));
    for(const p of products)if(managed.has(p.id))p.attributes={...p.attributes,excelBarcodeAuthority:{active:true,revision:policy.revision,sourceSha256:policy.source_sha256}};
    for(const sku of skus)if(managed.has(sku.product_id)) {
      const entry=authorityBySku.get(sku.id),supplement=supplementBySku.get(sku.id);
      sku['barcodeAuthority']={status:supplement?.status||entry?.status||'MISSING_IN_APPROVED_EXCEL',originalBarcode:entry?.record['barcode']??null,barcodeRequired:supplement?.status!=='NOT_REQUIRED'};
      if(sku.overlay&&entry&&sku.options['SIZE']) {
        const m=record(entry.record['displayMapping']),group=groupsById.get(String(m['groupId']));
        const size=group?.sizes.find(v=>v.name===m['name']);
        if(size){Object.assign(sku.options['SIZE'],{sourceName:entry.record['sizeName'],sourceCode:entry.record['sourceSizeCode'],name:size.name,code:size.code,currentGroupId:group!.id,standardGroup:group!.name});}
      }
    }
    barcodes=barcodes.filter(b=>!managed.has(b.product_id)||b.generated&&(record(b['evidence'])['rule']===policy.revision||(supplementBySku.get(String(b.sku_id))?.status==='ACTIVE'&&supplementBySku.get(String(b.sku_id))?.barcode===b.barcode)));
    aliases=aliases.filter(a=>!managed.has(a.product_id)||a['origin']==='MANUAL');
  }
  if(!identityOnly) {
    const images=(await session.query<{id:string;product_id:string;role:string;name:string;color_name:string|null;sort_order:number}>(`SELECT id,product_id,role,name,color_name,sort_order FROM ${r}.product_image WHERE role NOT LIKE 'history/%'${selected('product_id')} ORDER BY sort_order,id`,selectedValues)).rows;
    const imagesByProduct=new Map<string,typeof images>();
    for(const image of images){const rows=imagesByProduct.get(image.product_id)||[];rows.push(image);imagesByProduct.set(image.product_id,rows);}
    for (const p of products) {
      const profile=profilesByProduct.get(p.id),priorImages=Array.isArray(profile?.body['images'])?profile.body['images'].map(record):[];
      const priorImageByMedia=new Map<unknown,Record<string,unknown>>();
      for(const image of priorImages)if(!priorImageByMedia.has(image['mediaId']))priorImageByMedia.set(image['mediaId'],image);
      const currentImages=(imagesByProduct.get(p.id)||[]).map(i=>({id:i.id,mediaId:i.id,role:imageRoleLabel(i.role),name:i.name,colorName:i.color_name,
        colorId:priorImageByMedia.get(i.id)?.['colorId']||'',url:`/api/media/${i.id}`,sortOrder:i.sort_order}));
      p.attributes={...p.attributes,images:currentImages};if(profile)profile.body={...profile.body,images:currentImages};
    }
  }
  const removed=new Map(profiles.map(p=>[p.product_id,new Set(Array.isArray(p.body['removedHistoricalBarcodes'])?p.body['removedHistoricalBarcodes']:[])]));
  return {products,skus,sourceBarcodes,barcodes:barcodes.filter(b=>b.generated||!removed.get(b.product_id)?.has(b.barcode)),aliases,profiles};
}

export async function productReference(context:AuthorizedContext,kind:string):Promise<Record<string,unknown>[]> {
  const {session,repo}=context;
  if(kind==='fits')return fits;
  if(kind==='size-groups')return sizeGroups().map(g=>({...g}));
  if(kind==='sizes')return sizeGroups().flatMap(g=>g.sizes.map(v=>({...v,groupId:g.id,groupName:g.name})));
  if(kind==='seasons')return seasons;
  if(kind==='units')return (await session.query(`SELECT id,code,name,enabled,quantity_scale FROM ${repo.source}.unit ORDER BY code`)).rows;
  if(kind==='categories')return (await session.query(`SELECT c.id,c.code,c.name,c.enabled,p.code parent_code FROM ${repo.source}.category c LEFT JOIN ${repo.source}.category p ON p.id=c.parent_id ORDER BY c.code`)).rows;
  if(kind==='colors')return (await session.query(`SELECT sv.id,sv.code,sv.name,sv.enabled FROM ${repo.source}.spec_value sv JOIN ${repo.source}.spec_dimension d ON d.id=sv.dimension_id AND d.code='COLOR' ORDER BY sv.sort_order,sv.code`)).rows;
  return [];
}

export async function resolveBarcode(context:AuthorizedContext,input:unknown):Promise<unknown> {
  const code=text(input,'条码',80),{session,repo}=context,s=repo.source,r=repo.runtime;
  // This lookup is a superset, not an authority decision. The existing catalogue
  // still applies deletion, removed-code and Excel/manual-alias rules in this action.
  // Keep every exact match across both namespaces; never take the first SKU/product.
  const productIds=(await session.query<{product_id:string}>(`SELECT product_id FROM ${s}.tplus_product_barcode WHERE barcode=$1
    UNION SELECT product_id FROM ${r}.generated_barcode WHERE barcode=$1
    UNION SELECT product_id FROM ${r}.product_barcode_alias WHERE barcode=$1
    UNION SELECT id FROM ${s}.product WHERE code=$1
    UNION SELECT id FROM ${r}.product_overlay WHERE code=$1 ORDER BY product_id`,[code])).rows.map(row=>row.product_id);
  const data:Catalog={products:[],skus:[],barcodes:[],sourceBarcodes:[],aliases:[],profiles:[]};
  // Respect the existing bounded catalogue read without truncating ambiguous codes.
  for(let offset=0;offset<productIds.length;offset+=100) {
    const part=await readCatalog(context,productIds.slice(offset,offset+100),true);
    data.products.push(...part.products);data.skus.push(...part.skus);
    data.barcodes.push(...part.barcodes);data.sourceBarcodes.push(...part.sourceBarcodes);
    data.aliases.push(...part.aliases);data.profiles.push(...part.profiles);
  }
  return resolveProductIdentity(data,code);
}

interface ProductPageInput {page:number;size:number;filters:Record<string,unknown>}
function queryObject(value:unknown):Record<string,unknown> {
  try {return object(typeof value==='string'?JSON.parse(value):value);} catch {return fail('商品查询参数无效');}
}
export function productPageInput(input:unknown):ProductPageInput {
  const outer=object(input),q=outer['query']===undefined?outer:queryObject(outer['query']);
  if(outer['query']!==undefined&&Object.keys(outer).some(key=>key!=='query'))return fail('商品查询参数不能混用');
  if(Object.keys(q).some(key=>!['page','size','filters'].includes(key)))return fail('商品查询字段无效');
  const integer=(value:unknown,fallback:number)=>value===undefined?fallback:typeof value==='number'?value:typeof value==='string'&&/^[1-9]\d*$/.test(value)?Number(value):NaN;
  const page=integer(q['page'],1),size=integer(q['size'],50);
  if(!Number.isSafeInteger(page)||page<1||page>1000000||![20,50,100,200,500].includes(size))return fail('分页参数无效');
  const filters=q['filters']===undefined?{}:queryObject(q['filters']);
  for(const [key,value]of Object.entries(filters)) {
    if(!['products','q','years','categories','seasons','supplierId','fitId','thickness','shapeCode'].includes(key))return fail('商品筛选字段无效');
    if(key==='q'?typeof value!=='string'||value.length>3000:value===null||!Array.isArray(value)||value.length>3000||value.some(v=>typeof v!=='string'||v.length>128||v.includes('\0')))return fail('商品筛选值无效');
  }
  if(Buffer.byteLength(JSON.stringify(filters))>1048576)return fail('商品筛选资料过大');
  if(typeof filters['q']==='string'&&filters['q'].includes('\0'))return fail('商品筛选值无效');
  return {page,size,filters};
}
function baseFitSql(name:string):string {
  return `coalesce(upper(substring(coalesce(${name},'') from '(?i)([YABCDE])\\s*版')),
    CASE WHEN ${name} LIKE '%特体%' THEN 'E' WHEN ${name} LIKE '%加肥加大%' THEN 'D'
      WHEN ${name} LIKE '%加肥%' THEN 'C' WHEN ${name} ~ '宽松|偏大|大版' THEN 'B'
      WHEN ${name} ~ '修身|偏小' THEN 'Y' ELSE 'A' END)`;
}
function jsonTruthy(value:string):string {return `(${value} IS NOT NULL AND ${value} NOT IN ('null'::jsonb,'false'::jsonb,'0'::jsonb,'""'::jsonb))`;}
function productFitFilterSql(s:string,r:string):string {
  const group=`CASE WHEN nullif(p.source_group_name,'') IS NOT NULL THEN to_jsonb(p.source_group_name)
    WHEN ${jsonTruthy("p.attributes->'sourceSizeGroupName'")} THEN p.attributes->'sourceSizeGroupName' ELSE p.attributes->'sourceSizeGroupCode' END`;
  return `EXISTS(SELECT 1 FROM (
    SELECT id,product_id FROM ${s}.variant WHERE product_id=p.id UNION ALL
    SELECT ov.id,ov.product_id FROM ${r}.variant_overlay ov WHERE ov.product_id=p.id AND NOT EXISTS(SELECT 1 FROM ${s}.variant src WHERE src.id=ov.id)
  ) v LEFT JOIN ${r}.variant_overlay ov ON ov.id=v.id
    LEFT JOIN ${s}.variant_option vc ON vc.variant_id=v.id AND vc.dimension_id=(SELECT id FROM ${s}.spec_dimension WHERE code='COLOR')
    LEFT JOIN ${s}.spec_value cv ON cv.id=vc.spec_value_id
    LEFT JOIN ${s}.variant_option vs ON vs.variant_id=v.id AND vs.dimension_id=(SELECT id FROM ${s}.spec_dimension WHERE code='SIZE')
    LEFT JOIN ${s}.spec_value sz ON sz.id=vs.spec_value_id
    LEFT JOIN ${s}.system_setting setting ON setting.key='inventory.standard-size-mappings'
    CROSS JOIN LATERAL (SELECT setting.value->'items'->v.id::text mapping) m
    CROSS JOIN LATERAL (SELECT m.mapping->'source' src,m.mapping->'target' target) map
    WHERE EXISTS(SELECT 1 FROM jsonb_array_elements_text($1::jsonb->'fitId') wanted(value) WHERE wanted.value=
      CASE WHEN ov.id IS NOT NULL THEN ov.fit_id WHEN sz.id IS NOT NULL
        AND jsonb_typeof(setting.value->'packSha256')='string' AND setting.value->>'packSha256' ~ '^[0-9a-f]{64}$'
        AND map.src->'sku'=to_jsonb(v.id::text) AND map.src->'product'=to_jsonb(p.code)
        AND (CASE WHEN cv.code IS NULL THEN NOT coalesce(map.src ? 'color',false) ELSE map.src->'color'=to_jsonb(cv.code) END)
        AND map.src->'sourceCode'=to_jsonb(sz.code) AND map.src->'sourceSize'=to_jsonb(sz.name)
        AND (CASE WHEN (${group}) IS NULL THEN NOT coalesce(map.src ? 'sourceGroup',false) ELSE
          jsonb_typeof((${group})) IN ('string','number','boolean','null') AND map.src->'sourceGroup'=(${group}) END)
        AND NOT EXISTS(SELECT 1 FROM unnest(ARRAY['group','fit','code','size']) key
          WHERE jsonb_typeof(map.target->key) IS DISTINCT FROM 'string' OR map.target->>key='')
        AND (sz.name<>'无尺码' OR map.target->>'size'='无尺码')
        AND EXISTS(SELECT 1 FROM jsonb_array_elements($3::jsonb) g WHERE (g->>'id'=map.target->>'group' OR g->>'name'=map.target->>'group')
          AND EXISTS(SELECT 1 FROM jsonb_array_elements(g->'sizes') size WHERE size->>'name'=map.target->>'size'))
        THEN map.target->>'fit' ELSE ${baseFitSql('p.fit_name')} END))`;
}
function exactProductCodeFilterSql(s:string,r:string):string {
  const managed=`EXISTS(SELECT 1 FROM ${r}.barcode_authority_policy WHERE singleton) AND EXISTS(SELECT 1 FROM ${r}.barcode_authority_product WHERE product_id=p.id)`;
  return `(EXISTS(SELECT 1 FROM ${s}.tplus_product_barcode b WHERE b.product_id=p.id AND b.barcode=$2
      AND NOT (${managed}) AND NOT (CASE WHEN jsonb_typeof(p.body->'removedHistoricalBarcodes')='array'
        THEN (p.body->'removedHistoricalBarcodes') ? b.barcode ELSE false END))
    OR EXISTS(SELECT 1 FROM ${r}.generated_barcode b WHERE b.product_id=p.id AND b.barcode=$2 AND (NOT (${managed})
      OR EXISTS(SELECT 1 FROM ${r}.barcode_authority_policy policy WHERE singleton AND jsonb_typeof(b.evidence->'rule')='string' AND b.evidence->>'rule'=policy.revision)
      OR EXISTS(SELECT 1 FROM ${r}.barcode_scheme_supplement sp WHERE sp.sku_id=b.sku_id AND sp.status='ACTIVE' AND sp.barcode=b.barcode)))
    OR EXISTS(SELECT 1 FROM ${r}.product_barcode_alias b WHERE b.product_id=p.id AND b.barcode=$2 AND (NOT (${managed}) OR b.origin='MANUAL')))`;
}
interface ProductPageResult {codes:string[];productIds:string[];total:number;page:number;size:number;catalogVersion:string}
function catalogVersionSql(s:string,r:string):string {
  // Only bounded metadata is read: never hash the approval body, images or profiles.
  // Profile/master versions are monotonic on supported writes; source rows are batch-bound.
  return `md5(jsonb_build_object(
    'source',(SELECT jsonb_build_array(batch_id,manifest_sha256,committed_at) FROM ${s}.tplus_import_run WHERE status='COMMITTED' ORDER BY committed_at DESC NULLS LAST,started_at DESC LIMIT 1),
    'products',(SELECT jsonb_build_array(count(*),md5(string_agg(id::text||code||deleted::text||updated_at::text,'|' ORDER BY id))) FROM ${r}.product_overlay),
    'profiles',(SELECT jsonb_build_array(count(*),coalesce(sum(version),0)) FROM ${r}.product_profile_overlay),
    'masters',(SELECT jsonb_build_array(count(*),coalesce(sum(version),0)) FROM ${r}.product_master_overlay),
    'mapping',(SELECT updated_at FROM ${s}.system_setting WHERE key='inventory.standard-size-mappings'),
    'authority',(SELECT jsonb_build_array(revision,source_sha256,updated_at) FROM ${r}.barcode_authority_policy WHERE singleton)
  )::text)`;
}
/** Filter/count/page keys in SQL before reading any catalogue detail. */
export async function productPage(context:AuthorizedContext,input:unknown):Promise<ProductPageResult> {
  const {page,size,filters}=productPageInput(input),{session,repo}=context,s=repo.source,r=repo.runtime;
  const list=(key:string,value:string)=>`(coalesce(jsonb_array_length($1::jsonb->'${key}'),0)=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text($1::jsonb->'${key}') wanted(value) WHERE wanted.value=coalesce(${value},'')))`;
  const fallback=(key:string,value:string)=>`CASE WHEN ${jsonTruthy(`p.body->'${key}'`)} THEN p.body->>'${key}' ELSE ${value} END`;
  const statement=`WITH product_rows AS (${productRowsSql(s,r,()=> '')}), product_meta AS (
      SELECT p.*, (CASE WHEN jsonb_typeof(p.attributes)='object' THEN p.attributes ELSE '{}'::jsonb END)
        || (CASE WHEN jsonb_typeof(pp.body)='object' THEN pp.body ELSE '{}'::jsonb END) body
      FROM product_rows p LEFT JOIN ${r}.product_profile_overlay pp ON pp.product_id=p.id
    ), matched AS (SELECT p.id,p.code,p.created_at FROM product_meta p WHERE
      ${list('products','p.code')} AND ${list('years',"p.body->>'year'")}
      AND ${list('categories',fallback('categoryId','p.category_code'))} AND ${list('supplierId',fallback('supplierId','p.counterparty_id::text'))}
      AND ${list('thickness',"p.body->>'thickness'")} AND ${list('shapeCode',"p.body->>'shapeCode'")}
      AND (coalesce(jsonb_array_length($1::jsonb->'seasons'),0)=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text($1::jsonb->'seasons') wanted(value)
        WHERE position(wanted.value in coalesce(p.body->>'season',''))>0))
      AND (coalesce(jsonb_array_length($1::jsonb->'fitId'),0)=0 OR ${productFitFilterSql(s,r)})
      AND ($2='' OR position(lower($2) in lower(p.code||' '||coalesce(p.name,'null')||' '||coalesce(p.body->>'barcodeItemCode','')))>0
        OR ${exactProductCodeFilterSql(s,r)})
    ), page_rows AS (SELECT id,code,created_at FROM matched ORDER BY created_at DESC,code,id LIMIT $4 OFFSET $5)
    SELECT (SELECT count(*)::text FROM matched) total,coalesce((SELECT jsonb_agg(row ORDER BY created_at DESC,code,id) FROM page_rows row),'[]'::jsonb) items,
      ${catalogVersionSql(s,r)} AS "catalogVersion"`;
  const row=(await session.query<{total:string;items:{id:string;code:string}[];catalogVersion:string}>(statement,[JSON.stringify(filters),String(filters['q']||'').trim(),JSON.stringify(sizeGroups()),size,(page-1)*size])).rows[0]!;
  const total=Number(row.total);if(!Number.isSafeInteger(total)||total<0)return fail('商品总数无效');
  return {codes:row.items.map(p=>p.code),productIds:row.items.map(p=>p.id),total,page,size,catalogVersion:row.catalogVersion};
}
const emptyCatalog=():Catalog=>({products:[],skus:[],barcodes:[],sourceBarcodes:[],aliases:[],profiles:[]});
function appendCatalog(target:Catalog,part:Catalog):void {
  target.products.push(...part.products);target.skus.push(...part.skus);target.barcodes.push(...part.barcodes);
  target.sourceBarcodes.push(...part.sourceBarcodes);target.aliases.push(...part.aliases);target.profiles.push(...part.profiles);
}
export async function catalogPage(context:AuthorizedContext,input:unknown) {
  if(productPageInput(input).size>100)return fail('商品目录每页最多100个商品');
  const page=await productPage(context,input),data=emptyCatalog();
  for(let offset=0;offset<page.productIds.length;offset+=100)appendCatalog(data,await catalog(context,page.productIds.slice(offset,offset+100)));
  const byId=new Map(data.products.map(p=>[p.id,p]));data.products=page.productIds.flatMap(id=>byId.has(id)?[byId.get(id)!]:[]);
  return {...page,catalog:data,identities:productIdentities(data)};
}
/** Legacy full identity response builds only bounded identity facts, without images/full profiles. */
export async function identityCatalog(context:AuthorizedContext) {
  const {session,repo}=context;
  const ids=(await session.query<{id:string}>(`SELECT id FROM (${productRowsSql(repo.source,repo.runtime,()=> '',true)}) p ORDER BY code`)).rows.map(p=>p.id);
  const result:ReturnType<typeof productIdentities>={version:1,products:[],skus:[],productCodes:[]};
  for(let offset=0;offset<ids.length;offset+=100) {
    const part=productIdentities(await readCatalog(context,ids.slice(offset,offset+100),true));
    result.products.push(...part.products);result.skus.push(...part.skus);result.productCodes.push(...part.productCodes);
  }
  return result;
}
export function productId(value:unknown):string{return identifier(value,true);}
