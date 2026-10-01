import {readFileSync} from 'node:fs';
import {sizeMapping} from './size-mapping.ts';
import {currentSizeGroups} from '../../frontend/product-size-groups.mjs';
const splitConfig=JSON.parse(readFileSync(new URL('./product-color-split.json',import.meta.url),'utf8'));const colorSplits=splitConfig.enabled===false?{}:splitConfig.items;
const hallConfig=JSON.parse(readFileSync(new URL('./hall-config.json',import.meta.url),'utf8'));
import {installBarcodes} from './barcodes.ts';
import {work} from './work.ts';
import {products} from './products.ts';
import {productProfiles,saveProductProfile,deleteProduct} from './product-profile.ts';
import {productMasters,changeProductMaster} from './product-master.ts';
import {ledger} from './ledger.ts';

import { command,detail,RUNTIME,ensureMasterReferences,registerMasterReference } from './runtime.ts';
import { ensureSpec } from './specs.ts';
import { transaction,SOURCE } from './db.ts';
import {AUTH_SCHEMA,installEmployeeAuth,loginEmployee,employeeSession,logoutEmployee,employeeAccounts,saveEmployeeAccount,runtimeAccess,authCookieName} from './employee-auth.ts';
let authInstalled:Promise<void>|undefined;
const origins=new Set(['http://127.0.0.1:8877','http://localhost:8877']);
const q=(sql:string,args:any[]=[])=>transaction(RUNTIME,tx=>tx.query(sql,args));
export async function handleRuntime(req:any,res:any,url:URL){
 if(!url.pathname.startsWith('/runtime/'))return false;
 res.setHeader('Access-Control-Allow-Credentials','true');
 if(req.method==='OPTIONS'){if(!origins.has(req.headers.origin))throw Error('ORIGIN_NOT_ALLOWED');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.writeHead(204);res.end();return true;}
 const send=(data:any)=>res.end(JSON.stringify({ok:true,data,source:'REAL_TPLUS_RUNTIME',schema:RUNTIME}));
 await (authInstalled??=installEmployeeAuth());
 const token=new RegExp('(?:^|;\\s*)'+authCookieName+'=([a-f0-9]+)').exec(req.headers.cookie||'')?.[1];
 const reject=(status:number,error:string)=>{res.writeHead(status);res.end(JSON.stringify({ok:false,error}));return true;};
 const body=async(limit=65536)=>{let text='';for await(const chunk of req){text+=chunk;if(text.length>limit)throw Error('BODY_TOO_LARGE')}return JSON.parse(text||'{}');};
 if(url.pathname==='/runtime/session'&&req.method==='POST'){
  if(!origins.has(req.headers.origin)||!['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))throw Error('OPERATOR_ORIGIN_REQUIRED');
  try{const input=await body(),session=await loginEmployee(input.loginName,input.password);res.setHeader('Set-Cookie',`${authCookieName}=${session.token}; HttpOnly; SameSite=Strict; Path=/runtime/; Max-Age=28800`);send({employee:session.employee});}catch(e:any){return reject(401,e.message)}return true;
 }
 const employee=await employeeSession(token);
 if(url.pathname==='/runtime/session'&&req.method==='GET'){send({employee});return true;}
 if(url.pathname==='/runtime/logout'&&req.method==='POST'){if(token)await logoutEmployee(token);res.setHeader('Set-Cookie',`${authCookieName}=; HttpOnly; SameSite=Strict; Path=/runtime/; Max-Age=0`);send({});return true;}
 if(!employee)return reject(401,'登录已失效，请重新登录');
 if(!runtimeAccess(employee,url.pathname))return reject(403,'无权访问此功能');
 if(url.pathname==='/runtime/employees'&&req.method==='GET'){send(await employeeAccounts(employee));return true;}
 if(url.pathname==='/runtime/employees'&&req.method==='POST'){
  if(!origins.has(req.headers.origin))throw Error('OPERATOR_ORIGIN_REQUIRED');
  const result=await saveEmployeeAccount(employee,await body());
  if(result.id===employee.id&&result.loginEnabled&&result.employmentStatus==='在职')await transaction(AUTH_SCHEMA,tx=>tx.query('UPDATE employee_session SET employee_version=$2 WHERE token=$1 RETURNING token',[token,result.authVersion]));
  send(result);return true;
 }
 if(url.pathname==='/runtime/product-profile'&&req.method==='POST'){
  if(!origins.has(req.headers.origin))throw Error('OPERATOR_ORIGIN_REQUIRED');let body='';for await(const chunk of req){body+=chunk;if(body.length>64*1024*1024)throw Error('PRODUCT_PROFILE_TOO_LARGE')}
  send(await saveProductProfile(JSON.parse(body)));return true;
 }
 if(url.pathname==='/runtime/product-delete'&&req.method==='POST'){
  if(!origins.has(req.headers.origin))throw Error('OPERATOR_ORIGIN_REQUIRED');let body='';for await(const chunk of req){body+=chunk;if(body.length>20000)throw Error('BODY_TOO_LARGE')}
  send(await deleteProduct(JSON.parse(body)));return true;
 }
 if(url.pathname==='/runtime/product-master'&&req.method==='POST'){
  if(!origins.has(req.headers.origin))throw Error('OPERATOR_ORIGIN_REQUIRED');let body='';for await(const chunk of req){body+=chunk;if(body.length>512*1024)throw Error('PRODUCT_MASTER_TOO_LARGE')}
  send(await changeProductMaster(JSON.parse(body)));return true;
 }
 if(['/runtime/command','/runtime/work','/runtime/specs/ensure','/runtime/master-reference'].includes(url.pathname)&&req.method==='POST'){
  if(!origins.has(req.headers.origin))throw Error('OPERATOR_ORIGIN_REQUIRED');let text='';for await(const chunk of req){text+=chunk;if(text.length>4*1024*1024)throw Error('BODY_TOO_LARGE');}
  const input=JSON.parse(text);if(!runtimeAccess(employee,url.pathname,input))return reject(403,'无权访问此功能');if(url.pathname==='/runtime/command')await ensureMasterReferences();send(url.pathname==='/runtime/work'?await work(input,{id:employee.id,name:employee.name}):url.pathname==='/runtime/specs/ensure'?await ensureSpec(input):url.pathname==='/runtime/master-reference'?await registerMasterReference(input):await command(input,{actor:employee.id}));return true;
 }
 if(req.method!=='GET'&&!(url.pathname==='/runtime/inventory'&&req.method==='POST'))throw Error('METHOD_NOT_ALLOWED');
 if(url.pathname==='/runtime/hall-config'){send(hallConfig);return true;}
 if(url.pathname==='/runtime/warehouse-stock'){
  const result=await q(`WITH cells AS (
    SELECT warehouse_id,variant_id,sum(quantity) quantity FROM (
      SELECT warehouse_id,variant_id,quantity FROM inventory_balance_base
      UNION ALL SELECT warehouse_id,sku_id variant_id,quantity FROM inventory_delta
    ) combined GROUP BY warehouse_id,variant_id
  ) SELECT warehouse_id::text id,coalesce(sum(abs(quantity)),0)::text absolute_quantity,
    coalesce(sum(quantity),0)::text net_quantity,count(*) FILTER (WHERE quantity<>0)::int nonzero_skus
    FROM cells GROUP BY warehouse_id`);
  send(result.rows);return true;
 }
 if(url.pathname==='/runtime/recommendations'){
  const hallId=url.searchParams.get('hallId')||'';
  if(!hallId||hallId.length>100)throw Error('INVALID_HALL');
  const sourceIds=hallConfig.stores.find((s:any)=>s.id===hallId)?.sourceIds||[hallId];
  const result=await q(`WITH recent AS (
    SELECT r.body,row_number() OVER(ORDER BY coalesce(d.business_day::text,nullif(left(r.body->'header'->>'business_date',10),'')) DESC NULLS LAST,d.updated_at DESC,d.id DESC) sequence
    FROM document d JOIN revision r ON r.document_id=d.id AND r.revision=d.current_revision
    WHERE d.document_type='SALE' AND d.status='APPROVED'
      AND coalesce(r.body->'header'->>'hall_id',
        (SELECT id::text FROM ${SOURCE}.tplus_hall WHERE department_id::text=r.body->'header'->>'source_department_id' LIMIT 1))
        IN (SELECT jsonb_array_elements_text($1::jsonb))
  ), ranked_accounts AS (
    SELECT DISTINCT ON (f->>'payment_method_id') f->>'payment_method_id' method_id,
      f->>'fund_account_id' account_id,recent.sequence
    FROM recent CROSS JOIN LATERAL jsonb_array_elements(coalesce(recent.body->'fundsRecords','[]'::jsonb)) f
    WHERE f->>'payment_method_id' IS NOT NULL AND f->>'fund_account_id' IS NOT NULL
    ORDER BY f->>'payment_method_id',recent.sequence
  ) SELECT json_build_object(
    'customerId',(SELECT body->'header'->>'source_party_id' FROM recent
      WHERE nullif(body->'header'->>'source_party_id','') IS NOT NULL ORDER BY sequence LIMIT 1),
    'accounts',coalesce((SELECT json_agg(json_build_object('methodId',method_id,'accountId',account_id)) FROM ranked_accounts),'[]'::json)
  ) data`,[JSON.stringify(sourceIds)]);
  send(result.rows[0].data);return true;
 }
 if(url.pathname==='/runtime/documents/suggest'){
  const type=url.searchParams.get('type')||'TRANSFER',term=(url.searchParams.get('q')||'').trim();
  if(!['TRANSFER','SALE'].includes(type)||term.length>120)throw Error('INVALID_DOCUMENT_SEARCH');
  if(!term){send([]);return true;}
  const rows=await q(`SELECT d.number,coalesce(d.business_day::text,left(r.body->'header'->>'business_date',10)) date FROM document d JOIN revision r ON r.document_id=d.id AND r.revision=d.current_revision WHERE d.document_type=$1 AND position(lower($2) in lower(d.number))>0 ORDER BY CASE WHEN lower(d.number)=lower($2) THEN 0 ELSE 1 END,d.business_day DESC NULLS LAST,d.number LIMIT 8`,[type,term]);
  send(rows.rows);return true;
 }
 if(url.pathname==='/runtime/documents'){
  const page=Number(url.searchParams.get('page')||1),size=Number(url.searchParams.get('size')||20);if(!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(size)||size<1||size>200)throw Error('INVALID_PAGE');
  const filters=JSON.parse(url.searchParams.get('filters')||'{}'),args:any[]=[url.searchParams.get('type')||'SALE'];let where='d.document_type=$1';
  const add=(sql:string,val:any)=>{args.push(val);where+=' AND '+sql.replaceAll('?',`$${args.length}`);};
  if(filters.q||filters.number)add(`position(lower(?) in lower(d.number))>0`,filters.number||filters.q);
  if(filters.start)add(args[0]==='TRANSFER'?`d.business_day>=?::date`:`r.body->'header'->>'business_date'>=?`,filters.start);if(filters.end)add(args[0]==='TRANSFER'?`d.business_day<=?::date`:`left(r.body->'header'->>'business_date',10)<=?`,filters.end);
  const businessTypes=(Array.isArray(filters.businessType)?filters.businessType:[filters.businessType]).filter(Boolean);
  if(businessTypes.length)add(`(CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(r.body->'lines','[]'::jsonb)) l WHERE coalesce(nullif(l->>'source_quantity',''),'0')::numeric<0) THEN '退货/换货' ELSE '销售' END) IN (SELECT jsonb_array_elements_text(?::jsonb))`,JSON.stringify(businessTypes));
  if(filters.creatorId)add(`coalesce(r.body->'header'->'source_payload'->'v2_creator'->>'id',(SELECT v.actor_id FROM revision v WHERE v.document_id=d.id AND v.actor_id IS NOT NULL ORDER BY v.revision LIMIT 1))=?`,filters.creatorId);
  const statusCodes=[...new Set((Array.isArray(filters.status)?filters.status:[filters.status]).filter(Boolean).flatMap((value:string)=>['未审核','草稿','已弃审'].includes(value)?['DRAFT','UNAUDITED']:value==='已审核'?['APPROVED']:['已删除','已作废'].includes(value)?['DELETED']:[value]))];
  if(statusCodes.length)add('d.status IN (SELECT jsonb_array_elements_text(?::jsonb))',JSON.stringify(statusCodes));
  for(const [key,column] of Object.entries({customerId:'source_party_id',warehouseId:'source_warehouse_id',from:'source_from_warehouse_id',to:'source_to_warehouse_id',salespersonId:'source_employee_id',storeId:'hall_id'})){
   let values=Array.isArray(filters[key])?filters[key]:[filters[key]].filter(Boolean);if(key==='storeId')values=[...new Set(values.flatMap((id:string)=>hallConfig.stores.find((s:any)=>s.id===id)?.sourceIds||[id]))];if(values.length)add(`${key==='storeId'?`coalesce(r.body->'header'->>'hall_id',(SELECT id::text FROM ${SOURCE}.tplus_hall WHERE department_id::text=r.body->'header'->>'source_department_id' LIMIT 1))`:`r.body->'header'->>'${column}'`} IN (SELECT jsonb_array_elements_text(?::jsonb))`,JSON.stringify(values));
  }
  const sortDate=args[0]==='TRANSFER'?'business_day':"body->'header'->>'business_date'";
  const result=(await q(`WITH matches AS (SELECT d.*,r.body FROM document d JOIN revision r ON r.document_id=d.id AND r.revision=d.current_revision WHERE ${where}), slice AS (SELECT * FROM matches ORDER BY ${sortDate} DESC,id LIMIT ${size} OFFSET ${(page-1)*size}) SELECT json_build_object('items',coalesce((SELECT json_agg(slice) FROM slice),'[]'::json),'total',(SELECT count(*) FROM matches),'page',${page},'size',${size}) data`,args)).rows[0].data;send(result);return true;
 }
 if(url.pathname.startsWith('/runtime/document/')){const key=decodeURIComponent(url.pathname.slice('/runtime/document/'.length));const row=(await q(`SELECT id FROM document WHERE id::text=$1 OR number=$1 LIMIT 1`,[key])).rows[0];if(!row)throw Error('NOT_FOUND');send(await detail(row.id));return true;}
 if(url.pathname==='/runtime/products'){send(await products(JSON.parse(url.searchParams.get('query')||'{}')));return true;}
 if(url.pathname==='/runtime/product-masters'){send(await productMasters());return true;}
 if(url.pathname==='/runtime/ledger'){send(await ledger(JSON.parse(url.searchParams.get('query')||'{}')));return true;}
 if(url.pathname==='/runtime/product-totals'){
  send((await q(`SELECT v.product_id,sum(x.quantity) quantity FROM (SELECT variant_id sku_id,quantity FROM inventory_balance_base UNION ALL SELECT sku_id,quantity FROM inventory_delta)x JOIN (SELECT id,product_id FROM ${SOURCE}.variant UNION ALL SELECT id,product_id FROM variant_overlay)v ON v.id=x.sku_id GROUP BY v.product_id`)).rows);return true;
 }
 if(url.pathname==='/runtime/catalog'){
  await installBarcodes();
  // Finite master collections only; document history remains server paginated.
  const data=(await q(`SELECT json_build_object('products',(SELECT json_agg(p) FROM (SELECT p.id,p.code,p.name,p.enabled,NULL::text source_type,NULL::numeric stock_total,''::text unit,p.fit_id,p.counterparty_id,CASE WHEN media.images IS NULL THEN s.source_payload ELSE coalesce(s.source_payload,'{}'::jsonb)||jsonb_build_object('images',media.images) END attributes,c.code category_code,c.name category_name,f.name fit_name,s.source_size_group_id FROM ${SOURCE}.product p LEFT JOIN ${SOURCE}.category c ON c.id=p.category_id LEFT JOIN ${SOURCE}.fit f ON f.id=p.fit_id LEFT JOIN ${SOURCE}.tplus_product_source s ON s.product_id=p.id LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('id',i.id,'role',i.role,'name',i.name,'url',i.path,'colorName',i.color_name) ORDER BY i.sort_order,i.name) images FROM product_image i WHERE i.product_id=p.id) media ON true WHERE NOT EXISTS(SELECT 1 FROM product_overlay hidden WHERE hidden.id=p.id AND hidden.deleted) UNION ALL SELECT n.id,n.code,n.body->>'name',true,'V2',0::numeric,''::text,NULL::uuid,NULL::uuid,n.body,c.code,coalesce(o.body->>'name',c.name,n.body->>'categoryId'),coalesce(n.body->>'fitId','A')||'版',NULL::uuid FROM product_overlay n LEFT JOIN ${SOURCE}.category c ON c.code=n.body->>'categoryId' LEFT JOIN product_master_overlay o ON o.kind='categories' AND o.id=n.body->>'categoryId' AND o.deleted=false WHERE n.deleted=false AND NOT EXISTS(SELECT 1 FROM ${SOURCE}.product source WHERE source.id=n.id))p),'skus',(SELECT json_agg(v) FROM (SELECT v.*,jsonb_object_agg(d.code,jsonb_build_object('id',s.id,'name',s.name,'code',s.code)) options FROM ${SOURCE}.variant v JOIN ${SOURCE}.variant_option o ON o.variant_id=v.id JOIN ${SOURCE}.spec_value s ON s.id=o.spec_value_id JOIN ${SOURCE}.spec_dimension d ON d.id=s.dimension_id GROUP BY v.id)v),'barcodes',(SELECT json_agg(b) FROM ${SOURCE}.tplus_product_barcode b)) data`)).rows[0].data;for(const sku of data.skus){const m:any=sizeMapping.get(sku.id);if(!m||!sku.options?.SIZE){sku.historicalUnmappedReason='MISSING_SIZE_MAPPING';continue;}sku.options.SIZE={...sku.options.SIZE,sourceName:sku.options.SIZE.name,sourceCode:sku.options.SIZE.code,name:m.sourceCode==='910'&&m.sourceSize==='无尺码'?'无尺码':(m.targetSize||sku.options.SIZE.name),code:m.targetSize?m.target[2]:sku.options.SIZE.code,standardGroup:m.targetSize?m.target[0]:null,currentGroupId:m.targetSize?m.targetGroup:null,standardFit:m.target[1],mappingRows:m.workbookRows};}
  // The old T+ 910 means 无尺码. The new pants table reuses 910 for 40;
  // keep imported SKU display tied to its original meaning.
  for(const sku of data.skus){const mapping:any=sizeMapping.get(sku.id);if(mapping?.sourceCode==='910'&&mapping.sourceSize==='无尺码'&&sku.options?.SIZE){sku.options.SIZE.name='无尺码';sku.options.SIZE.code='910';}}
  const added=(await q(`SELECT v.id,v.product_id,v.color_id,v.size_id,v.fit_id,v.size_name,v.size_code,v.group_name,coalesce(o.body->>'name',c.name) color_name,coalesce(o.body->>'code',c.code) color_code FROM variant_overlay v LEFT JOIN ${SOURCE}.spec_value c ON c.id=v.color_id LEFT JOIN product_master_overlay o ON o.kind='colors' AND o.id=v.color_id::text AND o.deleted=false`)).rows;
  for(const v of added)data.skus.push({id:v.id,product_id:v.product_id,fit_id:v.fit_id,overlay:true,options:{COLOR:{id:v.color_id,name:v.color_name,code:v.color_code},SIZE:{id:v.size_id,name:v.size_name,code:v.size_code,sourceName:v.size_name,sourceCode:v.size_code,standardGroup:v.group_name,standardFit:v.fit_id,mappingRows:[]}}});
  for(const p of data.products){if(colorSplits[p.code])p.attributes.colorSplit=colorSplits[p.code];}
  data.barcodes.push(...(await q("SELECT product_id,sku_id,barcode,true sku_binding_known,true generated,scheme_id,evidence FROM generated_barcode")).rows);
  Object.assign(data,await productProfiles());
  const policy=(await q('SELECT revision,source_sha256,body FROM barcode_authority_policy WHERE singleton')).rows[0];
  if(policy){
   const managed=new Set((await q('SELECT product_id FROM barcode_authority_product')).rows.map((x:any)=>x.product_id));
   const rows=(await q('SELECT sku_id,product_id,status,record FROM barcode_authority_record')).rows;
   const records=new Map(rows.map((x:any)=>[x.sku_id,x]));
   const supplements=new Map((await q('SELECT sku_id,status,barcode,record FROM barcode_scheme_supplement')).rows.map((x:any)=>[x.sku_id,x]));
   const schemes=new Map<string,Set<string>>();
   for(const row of rows){const ids=schemes.get(row.product_id)||new Set<string>();ids.add(row.record.schemeId);schemes.set(row.product_id,ids);}
   data.barcodeAuthority={active:true,revision:policy.revision,sourceFile:policy.body.sourceFile,sourceSha256:policy.source_sha256,schemeSupplement:policy.body.schemeSupplement||null,historyFinalized:policy.body.historyFinalized||null};
   for(const p of data.products)if(managed.has(p.id)){
    p.attributes={...(p.attributes||{}),excelBarcodeAuthority:data.barcodeAuthority};
    const ids=schemes.get(p.id);if(ids?.size===1)p.attributes.excelBarcodeSchemeId=[...ids][0];
   }
   for(const sku of data.skus)if(managed.has(sku.product_id)){
    const entry:any=records.get(sku.id);
    const supplement:any=supplements.get(sku.id);
    sku.barcodeAuthority={status:supplement?.status==='NOT_REQUIRED'?'NOT_REQUIRED':supplement?.status==='ACTIVE'?'SCHEME_SUPPLEMENT':entry?.status||'MISSING_IN_APPROVED_EXCEL',rows:entry?.record.rows||[],originalBarcode:entry?.record.barcode||null,supplementBarcode:supplement?.status==='ACTIVE'?supplement.barcode:null,pendingReason:supplement?.status==='EXCEPTION'?supplement.record.reason:null,barcodeRequired:supplement?.status!=='NOT_REQUIRED',finalDecision:supplement?.status==='NOT_REQUIRED'?supplement.record.decision:null};
    if(sku.overlay&&entry&&sku.options?.SIZE){
     const r=entry.record,original=r.displayMapping,group=currentSizeGroups().find(g=>g.id===original?.groupId),size=group?.sizes.find(s=>s.name===original?.name),m=original&&{...original,...(group?{groupName:group.name}:{}),...(size?.code?{code:size.code}:{})};
     sku.options.SIZE={...sku.options.SIZE,sourceName:r.sizeName,sourceCode:r.sourceSizeCode,...(m?{name:m.name,code:m.code,standardGroup:m.groupName,currentGroupId:m.groupId}:{})};
    }
   }
   // Original T+ barcode rows remain source evidence, outside the active scan bindings.
   data.barcodes=data.barcodes.filter((b:any)=>!managed.has(b.product_id)||b.generated&&(b.evidence?.rule===policy.revision||b.evidence?.rule===policy.body.schemeSupplement?.revision&&(supplements.get(b.sku_id) as any)?.status==='ACTIVE'&&(supplements.get(b.sku_id) as any)?.barcode===b.barcode));
   data.aliases=data.aliases.filter((a:any)=>!managed.has(a.product_id)||a.origin==='MANUAL');
  }
  const removed=new Map<string,Set<string>>(data.profiles.map((profile:any)=>[profile.product_id,new Set<string>(profile.body.removedHistoricalBarcodes||[])]));
  data.barcodes=data.barcodes.filter((barcode:any)=>barcode.generated||!removed.get(barcode.product_id)?.has(barcode.barcode));
  send(data);return true;
 }
 if(url.pathname==='/runtime/inventory'){
  let input:any={};if(req.method==='POST'){let body='';for await(const chunk of req){body+=chunk;if(body.length>200000)throw Error('BODY_TOO_LARGE');}input=JSON.parse(body);}
  const codes=input.products||JSON.parse(url.searchParams.get('products')||'[]'),warehouses=input.warehouses||JSON.parse(url.searchParams.get('warehouses')||'[]');
  const page=Number(url.searchParams.get('page')||1),size=Number(url.searchParams.get('size')||200),unit=url.searchParams.get('unit')||'row';
  if(!Array.isArray(codes)||codes.length>3000||!Array.isArray(warehouses)||warehouses.length>200||!Number.isSafeInteger(page)||page<1||![100,200,500].includes(size)||!['row','product'].includes(unit))throw Error('INVALID_INVENTORY_QUERY');
  const result=(await q(`WITH balances AS (
   SELECT warehouse_id,variant_id,sum(quantity) quantity FROM (SELECT * FROM inventory_balance_base UNION ALL SELECT warehouse_id,sku_id,quantity FROM inventory_delta)b GROUP BY warehouse_id,variant_id
  ), skus AS (
   SELECT v.id,v.product_id,c.spec_value_id color_id,z.spec_value_id size_id FROM ${SOURCE}.variant v
   JOIN ${SOURCE}.variant_option c ON c.variant_id=v.id JOIN ${SOURCE}.spec_dimension cd ON cd.id=c.dimension_id AND cd.code='COLOR'
   JOIN ${SOURCE}.variant_option z ON z.variant_id=v.id JOIN ${SOURCE}.spec_dimension zd ON zd.id=z.dimension_id AND zd.code='SIZE'
   UNION ALL SELECT id,product_id,color_id,size_id FROM variant_overlay
  ), product_refs AS (
   SELECT id,code FROM ${SOURCE}.product UNION ALL SELECT id,code FROM product_overlay p WHERE NOT p.deleted AND NOT EXISTS(SELECT 1 FROM ${SOURCE}.product src WHERE src.id=p.id)
  ), cells AS (
   SELECT p.code,p.id product_id,v.color_id,v.size_id,b.warehouse_id,sum(b.quantity) quantity FROM balances b JOIN skus v ON v.id=b.variant_id JOIN product_refs p ON p.id=v.product_id
   WHERE p.code IN (SELECT jsonb_array_elements_text($1::jsonb)) AND b.warehouse_id::text IN (SELECT jsonb_array_elements_text($2::jsonb))
   GROUP BY p.code,p.id,v.color_id,v.size_id,b.warehouse_id
  ), grouped AS (SELECT code,color_id,warehouse_id,jsonb_object_agg(size_id,quantity) values,sum(quantity) total FROM cells GROUP BY code,color_id,warehouse_id HAVING bool_or(quantity<>0)),
  ranked AS (SELECT *,row_number() OVER(ORDER BY code,color_id,warehouse_id)-1 index FROM grouped),
  product_ranked AS (SELECT code,row_number() OVER(ORDER BY code)-1 product_index FROM (SELECT DISTINCT code FROM grouped)p),
  slice AS (SELECT r.* FROM ranked r ${unit==='product'?`JOIN product_ranked p ON p.code=r.code WHERE p.product_index>=${(page-1)*size} AND p.product_index<${page*size}`:`ORDER BY r.index LIMIT ${size} OFFSET ${(page-1)*size}`}),
  totals AS (SELECT code,color_id,jsonb_object_agg(size_id,quantity) cols FROM (SELECT code,color_id,size_id,sum(quantity) quantity FROM cells WHERE code IN (SELECT code FROM slice) GROUP BY code,color_id,size_id)s GROUP BY code,color_id),
  product_totals AS (SELECT code,jsonb_object_agg(size_id,quantity) cols FROM (SELECT code,size_id,sum(quantity) quantity FROM cells WHERE code IN (SELECT code FROM slice) GROUP BY code,size_id)s GROUP BY code),
  color_ranges AS (SELECT code,color_id,min(index) first,max(index) last FROM ranked GROUP BY code,color_id),
  product_ranges AS (SELECT code,min(index) first,max(index) last FROM ranked GROUP BY code)
  SELECT json_build_object('rows',coalesce((SELECT json_agg(slice) FROM slice),'[]'::json),'rowCount',(SELECT count(*) FROM ranked),'productCount',(SELECT count(DISTINCT code) FROM grouped),'total',(SELECT coalesce(sum(quantity),0) FROM cells),'colors',(SELECT json_agg(x) FROM (SELECT t.*,r.first,r.last FROM totals t LEFT JOIN color_ranges r USING(code,color_id))x),'products',(SELECT json_agg(x) FROM (SELECT t.*,r.first,r.last FROM product_totals t LEFT JOIN product_ranges r USING(code))x)) data`,[JSON.stringify(codes),JSON.stringify(warehouses)])).rows[0].data;send(result);return true;
 }
 if(url.pathname==='/runtime/stock'){
  const codes=JSON.parse(url.searchParams.get('products')||'[]');if(!Array.isArray(codes)||codes.length>100)throw Error('MAX_100_PRODUCTS');
  send((await q(`WITH balances AS (
   SELECT warehouse_id,variant_id,sum(quantity) quantity FROM (SELECT * FROM inventory_balance_base UNION ALL SELECT warehouse_id,sku_id,quantity FROM inventory_delta)b GROUP BY warehouse_id,variant_id
  ), skus AS (SELECT id,product_id FROM ${SOURCE}.variant UNION ALL SELECT id,product_id FROM variant_overlay),
  product_refs AS (SELECT id,code FROM ${SOURCE}.product UNION ALL SELECT id,code FROM product_overlay p WHERE NOT p.deleted AND NOT EXISTS(SELECT 1 FROM ${SOURCE}.product src WHERE src.id=p.id))
  SELECT b.warehouse_id,b.variant_id,b.quantity,p.id product_id,p.code product_code FROM balances b JOIN skus v ON v.id=b.variant_id JOIN product_refs p ON p.id=v.product_id WHERE p.code IN (SELECT jsonb_array_elements_text($1::jsonb))`,[JSON.stringify(codes)])).rows);return true;
 }
 throw Error('NOT_FOUND');
}
