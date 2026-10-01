/** Local stage 03C read-only boundary. No importer or command service is imported. */
import { createServer } from 'node:http';

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
const exec = promisify(execFile);
export const DATABASE = process.env.POSTGRES_DB || 'business_management';
export const SCHEMA = 'tplus_demo_20260922_a2';
export const BATCH = 'TPLUS-20260922-A2';
const q = value => "'" + String(value).replaceAll("'", "''") + "'";
const batch = q(BATCH);
export async function read(sql) {
  if (process.env.POSTGRES_DB !== DATABASE || process.env.POSTGRES_SCHEMA !== SCHEMA) throw new Error('EXPLICIT_DATABASE_SCHEMA_REQUIRED');
  const { stdout } = await exec(process.env.PSQL_BIN || 'psql', ['-X','-qAt','-v','ON_ERROR_STOP=1','-h',process.env.POSTGRES_HOST || '127.0.0.1','-p',process.env.POSTGRES_PORT || '5432','-U',process.env.POSTGRES_USER || process.env.USER,'-d',DATABASE,'-c',
    `BEGIN READ ONLY; SET LOCAL search_path=${SCHEMA},pg_catalog; SET LOCAL standard_conforming_strings=on; SET LOCAL statement_timeout='15s'; ${sql}; ROLLBACK;`], { timeout:20000, maxBuffer:16*1024*1024, env:{...process.env,PGOPTIONS:'-c default_transaction_read_only=on'} });
  return JSON.parse(stdout.trim());
}
const pageArgs = params => {
  const page = Number(params.get('page') || 1), size = Number(params.get('size') || 50);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(size) || size < 1 || size > 200) throw Object.assign(new Error('INVALID_PAGE_SIZE'),{status:400});
  return { page, size, offset:(page-1)*size };
};
const like = (column, value) => `position(lower(${q(value)}) in lower(coalesce(${column},'')))>0`;
const eq = (column, params, key) => params.get(key) ? `${column}::text=${q(params.get(key))}` : 'true';
async function paged(sql, params, order) {
  const {page,size,offset} = pageArgs(params);
  return read(`WITH results AS (${sql}), slice AS (SELECT * FROM results ORDER BY ${order} LIMIT ${size} OFFSET ${offset}) SELECT json_build_object('items',coalesce((SELECT json_agg(slice) FROM slice),'[]'::json),'total',(SELECT count(*) FROM results),'page',${page},'size',${size})`);
}
export async function controls() {
  return read(`SELECT json_build_object(
    'database',current_database(),'schema',current_schema(),'transactionReadOnly',current_setting('transaction_read_only'),
    'batch',(SELECT row_to_json(r) FROM (SELECT batch_id,status,success_count,failure_count FROM tplus_import_run WHERE batch_id=${batch})r),
    'categories',(SELECT count(*) FROM category),'products',(SELECT count(*) FROM product),'skus',(SELECT count(*) FROM variant),
    'productBarcodes',(SELECT count(*) FROM tplus_product_barcode WHERE batch_id=${batch}),
    'purchases',(SELECT count(*) FROM tplus_history_document WHERE batch_id=${batch} AND document_kind='purchase'),
    'purchaseLines',(SELECT count(*) FROM tplus_history_line WHERE batch_id=${batch} AND line_kind='purchase'),
    'sales',(SELECT count(*) FROM tplus_history_document WHERE batch_id=${batch} AND document_kind='sale'),
    'saleLines',(SELECT count(*) FROM tplus_history_line WHERE batch_id=${batch} AND line_kind='sale'),
    'funds',(SELECT count(*) FROM tplus_sales_fund WHERE batch_id=${batch}),
    'multiFundSales',(SELECT count(*) FROM (SELECT target_document_id FROM tplus_sales_fund WHERE batch_id=${batch} GROUP BY target_document_id HAVING count(*)>1)f),
    'transfers',(SELECT count(*) FROM tplus_history_document WHERE batch_id=${batch} AND document_kind='transfer'),
    'transferLines',(SELECT count(*) FROM tplus_history_line WHERE batch_id=${batch} AND line_kind='transfer'),
    'inventoryKeys',(SELECT count(*) FROM tplus_inventory_balance_source WHERE batch_id=${batch}),
    'inventoryTotal',(SELECT sum(quantity)::text FROM tplus_inventory_balance_source WHERE batch_id=${batch}),
    'negativeKeys',(SELECT count(*) FROM tplus_inventory_balance_source WHERE batch_id=${batch} AND quantity<0),
    'inventoryPosting',(SELECT count(*) FROM inventory_posting),'inventoryMovement',(SELECT count(*) FROM inventory_movement),
    'quarantine',(SELECT json_agg(f) FROM (SELECT dataset_path,record_count,status FROM tplus_import_file WHERE batch_id=${batch} AND status='QUARANTINED' ORDER BY dataset_path)f),
    'unresolved',(SELECT count(*) FROM tplus_history_line l LEFT JOIN variant v ON v.id=l.sku_id LEFT JOIN product p ON p.id=l.product_id LEFT JOIN tplus_history_document d ON d.target_document_id=l.target_document_id AND d.batch_id=l.batch_id WHERE v.id IS NULL OR p.id IS NULL OR d.target_document_id IS NULL),
    'unsafeHistory',(SELECT count(*) FROM tplus_history_document WHERE batch_id=${batch} AND (NOT read_only OR audit_status IS NOT NULL OR runtime_audit_replay_allowed)),
    'unsafeFunds',(SELECT count(*) FROM tplus_sales_fund WHERE batch_id=${batch} AND (NOT read_only OR runtime_funds_effect)),
    'inventoryDifferences',(SELECT count(*) FROM tplus_inventory_balance_source s FULL JOIN inventory_balance b USING(variant_id,warehouse_id) WHERE s.quantity IS DISTINCT FROM b.quantity))`);
}
const products = `SELECT p.id,p.code,p.name,p.category_id,p.fit_id,p.counterparty_id,p.enabled,u.name AS unit,c.code AS category_code,c.name AS category_name,f.name AS fit_name,s.source_size_group_id,(s.source_payload - 'source' - 'categoryDecision' - 'categoryDecisionLineage') || jsonb_build_object('historicalCategory',s.source_payload->'source'->>'所属类别','sourceSupplierCode',s.source_payload->'source'->>'默认供应商编码','sourceSupplierName',s.source_payload->'source'->>'默认供应商') AS attributes,(SELECT sum(b.quantity) FROM variant v JOIN tplus_inventory_balance_source b ON b.variant_id=v.id AND b.batch_id=${batch} WHERE v.product_id=p.id) AS stock_total FROM product p JOIN tplus_product_source s ON s.product_id=p.id AND s.batch_id=${batch} JOIN category c ON c.id=p.category_id JOIN unit u ON u.id=p.unit_id LEFT JOIN fit f ON f.id=p.fit_id`;
const variants = `SELECT v.id,v.product_id,p.code AS product_code,jsonb_object_agg(d.code,jsonb_build_object('id',s.id,'code',s.code,'name',s.name)) AS options FROM variant v JOIN product p ON p.id=v.product_id JOIN variant_option o ON o.variant_id=v.id JOIN spec_dimension d ON d.id=o.dimension_id JOIN spec_value s ON s.id=o.spec_value_id`;
const docSelect = `SELECT d.*,p.name AS party_name,w.name AS warehouse_name,fw.name AS from_warehouse_name,tw.name AS to_warehouse_name,e.name AS employee_name,h.id AS hall_id,h.name AS hall_name FROM tplus_history_document d LEFT JOIN counterparty p ON p.id=d.source_party_id LEFT JOIN warehouse w ON w.id=d.source_warehouse_id LEFT JOIN warehouse fw ON fw.id=d.source_from_warehouse_id LEFT JOIN warehouse tw ON tw.id=d.source_to_warehouse_id LEFT JOIN tplus_employee e ON e.id=d.source_employee_id AND e.batch_id=d.batch_id LEFT JOIN tplus_hall h ON h.department_id=d.source_department_id AND h.batch_id=d.batch_id`;
const reference = {
  categories:'SELECT c.*,p.code AS parent_code FROM category c LEFT JOIN category p ON p.id=c.parent_id',
  warehouses:'SELECT * FROM warehouse',
  halls:`SELECT * FROM tplus_hall WHERE batch_id=${batch}`,
  employees:`SELECT * FROM tplus_employee WHERE batch_id=${batch}`,
  parties:`SELECT p.*, (SELECT json_agg(DISTINCT role ORDER BY role) FROM tplus_party_role pr WHERE pr.batch_id=${batch} AND pr.party_id=p.id) AS roles, (SELECT pr.source_payload FROM tplus_party_role pr WHERE pr.batch_id=${batch} AND pr.party_id=p.id ORDER BY role LIMIT 1) AS source_payload FROM counterparty p WHERE EXISTS (SELECT 1 FROM tplus_party_role pr WHERE pr.batch_id=${batch} AND pr.party_id=p.id)`,
  customers:`SELECT p.*,r.source_payload FROM counterparty p JOIN tplus_party_role r ON r.party_id=p.id WHERE r.batch_id=${batch} AND r.role='customer'`,
  suppliers:`SELECT p.*,r.source_payload FROM counterparty p JOIN tplus_party_role r ON r.party_id=p.id WHERE r.batch_id=${batch} AND r.role='supplier'`,
  colors:"SELECT s.* FROM spec_value s JOIN spec_dimension d ON d.id=s.dimension_id WHERE d.code='COLOR'",
  sizes:"SELECT s.* FROM spec_value s JOIN spec_dimension d ON d.id=s.dimension_id WHERE d.code='SIZE'",
  fits:'SELECT * FROM fit',
  'size-groups':'SELECT * FROM size_group',
  'payment-methods':`SELECT * FROM tplus_payment_method WHERE batch_id=${batch}`,
  'fund-accounts':`SELECT * FROM tplus_fund_account WHERE batch_id=${batch}`,
};
export async function route(path, params) {
  if (path === '/health' || path === '/controls') return controls();
  const ref = path.match(/^\/reference\/([a-z-]+)$/);
  if (ref && reference[ref[1]]) {
    const name=ref[1], terms=[];
    if(name==='employees') {
      const query=params.get('q') || '';
      terms.push(`(${like('r.name',query)} OR EXISTS (SELECT 1 FROM tplus_hall h WHERE h.batch_id=${batch} AND h.id=r.hall_id AND ${like('h.name',query)}))`);
      if(params.get('role')) terms.push(params.get('role')==='UNSET' ? 'r.role IS NULL' : eq('r.role',params,'role'));
      terms.push(eq('r.hall_id',params,'hallId'));
    } else {
      terms.push(like('r.name',params.get('q') || ''));
      if(name==='parties' && params.get('role')) terms.push(`${q(params.get('role'))}=ANY(ARRAY(SELECT json_array_elements_text(r.roles)))`);
    }
    return paged(`SELECT * FROM (${reference[name]})r WHERE ${terms.join(' AND ')}`,params,'name,id');
  }
  if (path === '/products') {
    const terms=[like("p.code||' '||p.name||' '||coalesce(s.source_payload->>'defaultBarcode','')",params.get('q')||'')];
    for(const [key,column] of [['supplierId','p.counterparty_id'],['fitId','p.fit_id'],['year',"s.source_payload->>'year'"],['thickness',"s.source_payload->>'thickness'"]]) terms.push(eq(column,params,key));
    if(params.get('category'))terms.push(`p.category_id IN (WITH RECURSIVE cats AS (SELECT id FROM category WHERE code=${q(params.get('category'))} UNION ALL SELECT c.id FROM category c JOIN cats ON c.parent_id=cats.id) SELECT id FROM cats)`);
    return paged(`${products} WHERE ${terms.join(' AND ')}`,params,'code,id');
  }
  const product=path.match(/^\/products\/([^/]+)(?:\/(skus|barcodes|inventory))?$/);
  if(product){const code=decodeURIComponent(product[1]),where=`p.code=${q(code)}`;
    if(product[2]==='skus')return paged(`${variants} WHERE ${where} GROUP BY v.id,p.code`,params,'id');
    if(product[2]==='barcodes')return paged(`SELECT b.* FROM tplus_product_barcode b JOIN product p ON p.id=b.product_id WHERE b.batch_id=${batch} AND ${where}`,params,'source_id');
    if(product[2]==='inventory')return inventory(params,code);
    return read(`SELECT coalesce((SELECT row_to_json(r) FROM (${products} WHERE ${where})r),'null'::json)`);
  }
  if(path==='/skus')return paged(`${variants} WHERE ${eq('v.product_id',params,'productId')} GROUP BY v.id,p.code`,params,'id');
  if(path==='/barcodes')return paged(`SELECT * FROM tplus_product_barcode WHERE batch_id=${batch} AND ${like('barcode',params.get('q')||'')}`,params,'source_id');
  if(path==='/inventory')return inventory(params);
  const docs=path.match(/^\/(sales|transfers|purchases)(?:\/([^/]+)(?:\/(lines|funds))?)?$/);
  if(docs){const kind={sales:'sale',transfers:'transfer',purchases:'purchase'}[docs[1]],id=docs[2]&&decodeURIComponent(docs[2]);
    if(id&&docs[3]==='lines')return paged(`SELECT l.* FROM tplus_history_line l JOIN tplus_history_document d ON d.target_document_id=l.target_document_id AND d.batch_id=l.batch_id WHERE l.batch_id=${batch} AND d.document_kind=${q(kind)} AND d.target_document_id::text=${q(id)}`,params,'source_id');
    if(id&&docs[3]==='funds'&&kind==='sale')return paged(`SELECT * FROM tplus_sales_fund WHERE batch_id=${batch} AND target_document_id::text=${q(id)}`,params,'source_id');
    if(id&&docs[3])throw Object.assign(new Error('NOT_FOUND'),{status:404});
    const terms=[`d.batch_id=${batch}`,`d.document_kind=${q(kind)}`];
    if(id)terms.push(`d.target_document_id::text=${q(id)}`);
    if(params.get('q'))terms.push(`(${like("d.source_number||' '||coalesce(p.name,'')",params.get('q'))} OR EXISTS (SELECT 1 FROM tplus_history_line l WHERE l.batch_id=d.batch_id AND l.target_document_id=d.target_document_id AND ${like("l.source_product_code||' '||l.source_product_name",params.get('q'))}))`);
    for(const [key,column]of [['warehouseId','d.source_warehouse_id'],['from','d.source_from_warehouse_id'],['to','d.source_to_warehouse_id'],['customerId','d.source_party_id'],['salespersonId','d.source_employee_id'],['storeId','h.id']])terms.push(eq(column,params,key));
    for(const [key,op]of [['start','>='],['end','<=']])if(params.get(key)){if(!/^\d{4}-\d{2}-\d{2}$/.test(params.get(key)))throw Object.assign(new Error('INVALID_DATE'),{status:400});terms.push(`d.business_date ${op} ${q(params.get(key))}::date`);}
    if(params.get('multiFunds')==='1')terms.push(`(SELECT count(*) FROM tplus_sales_fund f WHERE f.batch_id=d.batch_id AND f.target_document_id=d.target_document_id)>1`);
    if(params.get('businessType'))terms.push(`d.source_payload->>'businessType'=${q(params.get('businessType'))}`);
    if(params.get('status'))terms.push(`d.audit_status=${q(params.get('status'))}`);
    if(id)return read(`SELECT coalesce((SELECT row_to_json(r) FROM (${docSelect} WHERE ${terms.join(' AND ')})r),'null'::json)`);
    return paged(`${docSelect} WHERE ${terms.join(' AND ')}`,params,'business_date DESC,target_document_id');
  }
  throw Object.assign(new Error('NOT_FOUND'),{status:404});
}
async function inventory(params,code) {
  const terms=[`b.batch_id=${batch}`,eq('b.warehouse_id',params,'warehouseId'),eq('b.variant_id',params,'skuId')];
  if(code)terms.push(`p.code=${q(code)}`);
  if(params.get('q'))terms.push(like("p.code||' '||p.name",params.get('q')));
  if(params.get('negative')==='1')terms.push('b.quantity<0');
  return paged(`SELECT b.*,p.code AS product_code,p.name AS product_name,v.product_id,w.name AS warehouse_name FROM tplus_inventory_balance_source b JOIN variant v ON v.id=b.variant_id JOIN product p ON p.id=v.product_id JOIN warehouse w ON w.id=b.warehouse_id WHERE ${terms.join(' AND ')}`,params,'product_code,variant_id,warehouse_id');
}
export async function start(port=8878) {
  const c=await controls();
  if(c.database!==DATABASE||c.schema!==SCHEMA||c.transactionReadOnly!=='on'||c.batch?.status!=='COMMITTED'||c.batch.batch_id!==BATCH)throw Error('BASELINE_NOT_COMMITTED');
  const origins=new Set(['http://127.0.0.1:8877','http://localhost:8877']);
  const server=createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json; charset=utf-8');
    if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host)){res.writeHead(403);return res.end(JSON.stringify({ok:false,error:'HOST_NOT_ALLOWED'}));}res.setHeader('Cache-Control','no-store');
    if(req.headers.origin&&!origins.has(req.headers.origin)){res.writeHead(403);return res.end(JSON.stringify({ok:false,error:'ORIGIN_NOT_ALLOWED'}));}
    if(req.headers.origin){res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');}
    try { if(req.url.startsWith('/runtime/') && await (await import('./runtime/http.ts')).handleRuntime(req,res,new URL(req.url,'http://127.0.0.1')))return; } catch(error) { res.writeHead(400);res.end(JSON.stringify({ok:false,error:error.message}));return; }
    if(req.method!=='GET'){res.writeHead(405,{Allow:'GET'});return res.end(JSON.stringify({ok:false,error:'READ_ONLY'}));}
    try{const url=new URL(req.url,'http://127.0.0.1');const data=await route(url.pathname,url.searchParams);if(!data){res.writeHead(404);return res.end(JSON.stringify({ok:false,error:'NOT_FOUND'}));}res.end(JSON.stringify({ok:true,source:'REAL_TPLUS_HISTORY',readonly:true,database:DATABASE,schema:SCHEMA,batch:BATCH,data}));}
    catch(error){console.error('legacy-api',error.message);res.writeHead(error.status||503);res.end(JSON.stringify({ok:false,error:error.status?error.message:'READ_QUERY_FAILED'}));}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){await start(Number(process.env.LEGACY_API_PORT||8878));console.log('Legacy API + V2 Runtime Overlay http://127.0.0.1:8878');}
