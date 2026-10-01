const sizeMapping=new Map(JSON.parse(readFileSync(new URL('../size-mapping/user-size-audit.json',import.meta.url),'utf8')).matches.map((r:any)=>[r.sku,r]));
import {readFileSync} from 'node:fs';
const splitConfig=JSON.parse(readFileSync(new URL('./product-color-split.json',import.meta.url),'utf8'));const colorSplits=splitConfig.enabled===false?{}:splitConfig.items;
const hallConfig=JSON.parse(readFileSync(new URL('./hall-config.json',import.meta.url),'utf8'));
import {installBarcodes} from './barcodes.ts';
import {work} from './work.ts';
import {products} from './products.ts';
import {ledger} from './ledger.ts';
import { randomBytes,randomUUID } from 'node:crypto';
import { command,detail,RUNTIME } from './runtime.ts';
import { transaction,SOURCE } from './db.ts';
const sessions=new Map<string,number>();
const origins=new Set(['http://127.0.0.1:8877','http://localhost:8877']);
const q=(sql:string,args:any[]=[])=>transaction(RUNTIME,tx=>tx.query(sql,args));
export async function handleRuntime(req:any,res:any,url:URL){
 if(!url.pathname.startsWith('/runtime/'))return false;
 res.setHeader('Access-Control-Allow-Credentials','true');
 if(req.method==='OPTIONS'){if(!origins.has(req.headers.origin))throw Error('ORIGIN_NOT_ALLOWED');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.writeHead(204);res.end();return true;}
 const send=(data:any)=>res.end(JSON.stringify({ok:true,data,source:'REAL_TPLUS_RUNTIME',schema:RUNTIME}));
 if(url.pathname==='/runtime/session'&&req.method==='POST'){
  // Explicit loopback-only, single-admin demo capability. Never accepts client roles or historical employee IDs.
  if(!origins.has(req.headers.origin)||!['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))throw Error('OPERATOR_ORIGIN_REQUIRED');
  const token=randomBytes(32).toString('hex');sessions.set(token,Date.now()+8*3600000);res.setHeader('Set-Cookie',`v2_operator=${token}; HttpOnly; SameSite=Strict; Path=/runtime/; Max-Age=28800`);send({operator:{id:'local-admin',name:'管理员',role:'ADMIN'}});return true;
 }
 const token=/v2_operator=([a-f0-9]+)/.exec(req.headers.cookie||'')?.[1];
 if(!token||(sessions.get(token)||0)<Date.now()){res.writeHead(401);res.end(JSON.stringify({ok:false,error:'OPERATOR_SESSION_REQUIRED'}));return true;}
 if(url.pathname==='/runtime/logout'){sessions.delete(token);res.setHeader('Set-Cookie','v2_operator=; HttpOnly; SameSite=Strict; Path=/runtime/; Max-Age=0');send({});return true;}
 if(['/runtime/command','/runtime/work'].includes(url.pathname)&&req.method==='POST'){
  if(!origins.has(req.headers.origin))throw Error('OPERATOR_ORIGIN_REQUIRED');let text='';for await(const chunk of req){text+=chunk;if(text.length>4*1024*1024)throw Error('BODY_TOO_LARGE');}
  const input=JSON.parse(text);send(url.pathname==='/runtime/work'?await work(input):await command(input,{actor:'local-admin'}));return true;
 }
 if(req.method!=='GET'&&!(url.pathname==='/runtime/inventory'&&req.method==='POST'))throw Error('METHOD_NOT_ALLOWED');
 if(url.pathname==='/runtime/hall-config'){send(hallConfig);return true;}
 if(url.pathname==='/runtime/documents'){
  const page=Number(url.searchParams.get('page')||1),size=Number(url.searchParams.get('size')||20);if(!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(size)||size<1||size>200)throw Error('INVALID_PAGE');
  const filters=JSON.parse(url.searchParams.get('filters')||'{}'),args:any[]=[url.searchParams.get('type')||'SALE'];let where='d.document_type=$1';
  const add=(sql:string,val:any)=>{args.push(val);where+=' AND '+sql.replaceAll('?',`$${args.length}`);};
  if(filters.q||filters.number)add(`(position(lower(?) in lower(d.number||' '||r.body::text))>0)`,filters.q||filters.number);
  if(filters.start)add(`r.body->'header'->>'business_date'>=?`,filters.start);if(filters.end)add(`left(r.body->'header'->>'business_date',10)<=?`,filters.end);
  if(filters.businessType)add(`(CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(r.body->'lines') l WHERE (l->>'source_quantity')::numeric<0) THEN '退货/换货' ELSE '销售' END)=?`,filters.businessType);
  if(filters.creatorId)add(`EXISTS(SELECT 1 FROM revision v WHERE v.document_id=d.id AND v.actor_id=?)`,filters.creatorId);
  if(filters.status)add('d.status=?',{'已审核':'APPROVED','未审核':'UNAUDITED','草稿':'DRAFT','已弃审':'UNAUDITED'}[filters.status]||filters.status);
  for(const [key,column] of Object.entries({customerId:'source_party_id',warehouseId:'source_warehouse_id',from:'source_from_warehouse_id',to:'source_to_warehouse_id',salespersonId:'source_employee_id',storeId:'hall_id'})){
   let values=Array.isArray(filters[key])?filters[key]:[filters[key]].filter(Boolean);if(key==='storeId')values=[...new Set(values.flatMap((id:string)=>hallConfig.stores.find((s:any)=>s.id===id)?.sourceIds||[id]))];if(values.length)add(`${key==='storeId'?`coalesce(r.body->'header'->>'hall_id',(SELECT id::text FROM ${SOURCE}.tplus_hall WHERE department_id::text=r.body->'header'->>'source_department_id' LIMIT 1))`:`r.body->'header'->>'${column}'`} IN (SELECT jsonb_array_elements_text(?::jsonb))`,JSON.stringify(values));
  }
  const result=(await q(`WITH matches AS (SELECT d.*,r.body FROM document d JOIN revision r ON r.document_id=d.id AND r.revision=d.current_revision WHERE ${where}), slice AS (SELECT * FROM matches ORDER BY body->'header'->>'business_date' DESC,id LIMIT ${size} OFFSET ${(page-1)*size}) SELECT json_build_object('items',coalesce((SELECT json_agg(slice) FROM slice),'[]'::json),'total',(SELECT count(*) FROM matches),'page',${page},'size',${size}) data`,args)).rows[0].data;send(result);return true;
 }
 if(url.pathname.startsWith('/runtime/document/')){const key=decodeURIComponent(url.pathname.slice('/runtime/document/'.length));const row=(await q(`SELECT id FROM document WHERE id::text=$1 OR number=$1 LIMIT 1`,[key])).rows[0];if(!row)throw Error('NOT_FOUND');send(await detail(row.id));return true;}
 if(url.pathname==='/runtime/products'){send(await products(JSON.parse(url.searchParams.get('query')||'{}')));return true;}
 if(url.pathname==='/runtime/ledger'){send(await ledger(JSON.parse(url.searchParams.get('query')||'{}')));return true;}
 if(url.pathname==='/runtime/product-totals'){
  send((await q(`SELECT v.product_id,sum(x.quantity) quantity FROM (SELECT variant_id sku_id,quantity FROM ${SOURCE}.tplus_inventory_balance_source UNION ALL SELECT sku_id,quantity FROM inventory_delta)x JOIN ${SOURCE}.variant v ON v.id=x.sku_id GROUP BY v.product_id`)).rows);return true;
 }
 if(url.pathname==='/runtime/catalog'){
  await installBarcodes();
  // Finite master collections only; document history remains server paginated.
  const data=(await q(`SELECT json_build_object('products',(SELECT json_agg(p) FROM (SELECT p.*,s.source_payload attributes,c.code category_code,c.name category_name,f.name fit_name,s.source_size_group_id FROM ${SOURCE}.product p LEFT JOIN ${SOURCE}.category c ON c.id=p.category_id LEFT JOIN ${SOURCE}.fit f ON f.id=p.fit_id LEFT JOIN ${SOURCE}.tplus_product_source s ON s.product_id=p.id)p),'skus',(SELECT json_agg(v) FROM (SELECT v.*,jsonb_object_agg(d.code,jsonb_build_object('id',s.id,'name',s.name,'code',s.code)) options FROM ${SOURCE}.variant v JOIN ${SOURCE}.variant_option o ON o.variant_id=v.id JOIN ${SOURCE}.spec_value s ON s.id=o.spec_value_id JOIN ${SOURCE}.spec_dimension d ON d.id=s.dimension_id GROUP BY v.id)v),'barcodes',(SELECT json_agg(b) FROM ${SOURCE}.tplus_product_barcode b)) data`)).rows[0].data;for(const sku of data.skus){const m:any=sizeMapping.get(sku.id);if(!m)throw Error('MISSING_SIZE_MAPPING');sku.options.SIZE={...sku.options.SIZE,sourceName:sku.options.SIZE.name,sourceCode:sku.options.SIZE.code,name:m.target[3],code:m.target[2],standardGroup:m.target[0],standardFit:m.target[1],mappingRows:m.workbookRows};}for(const p of data.products){if(colorSplits[p.code])p.attributes.colorSplit=colorSplits[p.code];}data.barcodes.push(...(await q("SELECT product_id,sku_id,barcode,true sku_binding_known,true generated,scheme_id,evidence FROM generated_barcode")).rows);send(data);return true;
 }
 if(url.pathname==='/runtime/inventory'){
  let input:any={};if(req.method==='POST'){let body='';for await(const chunk of req){body+=chunk;if(body.length>200000)throw Error('BODY_TOO_LARGE');}input=JSON.parse(body);}
  const codes=input.products||JSON.parse(url.searchParams.get('products')||'[]'),warehouses=input.warehouses||JSON.parse(url.searchParams.get('warehouses')||'[]');
  const page=Number(url.searchParams.get('page')||1),size=Number(url.searchParams.get('size')||200);
  if(!Array.isArray(codes)||codes.length>3000||!Array.isArray(warehouses)||warehouses.length>200||!Number.isSafeInteger(page)||page<1||![100,200,500].includes(size))throw Error('INVALID_INVENTORY_QUERY');
  const result=(await q(`WITH cells AS (
   SELECT p.code,p.id product_id,c.spec_value_id color_id,z.spec_value_id size_id,coalesce(b.warehouse_id,i.warehouse_id) warehouse_id,coalesce(b.quantity,0)+coalesce(i.quantity,0) quantity
   FROM ${SOURCE}.tplus_inventory_balance_source b FULL JOIN inventory_delta i ON i.sku_id=b.variant_id AND i.warehouse_id=b.warehouse_id
   JOIN ${SOURCE}.variant v ON v.id=coalesce(b.variant_id,i.sku_id) JOIN ${SOURCE}.product p ON p.id=v.product_id
   JOIN ${SOURCE}.variant_option c ON c.variant_id=v.id JOIN ${SOURCE}.spec_dimension cd ON cd.id=c.dimension_id AND cd.code='COLOR'
   JOIN ${SOURCE}.variant_option z ON z.variant_id=v.id JOIN ${SOURCE}.spec_dimension zd ON zd.id=z.dimension_id AND zd.code='SIZE'
   WHERE p.code IN (SELECT jsonb_array_elements_text($1::jsonb)) AND coalesce(b.warehouse_id,i.warehouse_id)::text IN (SELECT jsonb_array_elements_text($2::jsonb))
  ), grouped AS (SELECT code,color_id,warehouse_id,jsonb_object_agg(size_id,quantity) values,sum(quantity) total FROM cells GROUP BY code,color_id,warehouse_id HAVING bool_or(quantity<>0)),
  ranked AS (SELECT *,row_number() OVER(ORDER BY code,color_id,warehouse_id)-1 index FROM grouped),
  slice AS (SELECT * FROM ranked ORDER BY index LIMIT ${size} OFFSET ${(page-1)*size}),
  totals AS (SELECT code,color_id,jsonb_object_agg(size_id,quantity) cols FROM (SELECT code,color_id,size_id,sum(quantity) quantity FROM cells WHERE code IN (SELECT code FROM slice) GROUP BY code,color_id,size_id)s GROUP BY code,color_id),
  product_totals AS (SELECT code,jsonb_object_agg(size_id,quantity) cols FROM (SELECT code,size_id,sum(quantity) quantity FROM cells WHERE code IN (SELECT code FROM slice) GROUP BY code,size_id)s GROUP BY code)
  SELECT json_build_object('rows',coalesce((SELECT json_agg(slice) FROM slice),'[]'::json),'rowCount',(SELECT count(*) FROM ranked),'productCount',(SELECT count(DISTINCT code) FROM grouped),'total',(SELECT coalesce(sum(quantity),0) FROM cells),'colors',(SELECT json_agg(x) FROM (SELECT t.*, (SELECT min(index) FROM ranked r WHERE r.code=t.code AND r.color_id=t.color_id) first,(SELECT max(index) FROM ranked r WHERE r.code=t.code AND r.color_id=t.color_id) last FROM totals t)x),'products',(SELECT json_agg(x) FROM (SELECT t.*,(SELECT min(index) FROM ranked r WHERE r.code=t.code) first,(SELECT max(index) FROM ranked r WHERE r.code=t.code) last FROM product_totals t)x)) data`,[JSON.stringify(codes),JSON.stringify(warehouses)])).rows[0].data;send(result);return true;
 }
 if(url.pathname==='/runtime/stock'){
  const codes=JSON.parse(url.searchParams.get('products')||'[]');if(!Array.isArray(codes)||codes.length>100)throw Error('MAX_100_PRODUCTS');
  send((await q(`SELECT coalesce(b.warehouse_id,i.warehouse_id) warehouse_id,coalesce(b.variant_id,i.sku_id) variant_id,coalesce(b.quantity,0)+coalesce(i.quantity,0) quantity FROM ${SOURCE}.tplus_inventory_balance_source b FULL JOIN inventory_delta i ON i.sku_id=b.variant_id AND i.warehouse_id=b.warehouse_id JOIN ${SOURCE}.variant v ON v.id=coalesce(b.variant_id,i.sku_id) JOIN ${SOURCE}.product p ON p.id=v.product_id WHERE p.code IN (SELECT jsonb_array_elements_text($1::jsonb))`,[JSON.stringify(codes)])).rows);return true;
 }
 throw Error('NOT_FOUND');
}
