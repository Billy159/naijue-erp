import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { executeIdempotent } from '../domain/idempotency/index.ts';
import { transaction, identifier, SOURCE, type Transaction } from './db.ts';
export const RUNTIME='v2_runtime_stage03c';
export const BATCH='TPLUS-20260922-A2';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const masterKinds=['warehouses','payments','fundAccounts'];
const masterTable=`CREATE TABLE IF NOT EXISTS master_reference_overlay (
 kind text NOT NULL CHECK(kind IN ('warehouses','payments','fundAccounts')),
 id uuid NOT NULL, name text NOT NULL, enabled boolean NOT NULL,
 method_id uuid, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(kind,id))`;
const masterReady=new Set<string>();
export async function ensureMasterReferences(schema=RUNTIME){if(masterReady.has(schema))return;await transaction(schema,tx=>tx.execute(masterTable));masterReady.add(schema);}
export async function registerMasterReference(input:any,schema=RUNTIME){
 if(!masterKinds.includes(input?.kind)||!uuid.test(input?.id)||typeof input.name!=='string'||!input.name.trim()||input.name.length>200||typeof input.enabled!=='boolean'||input.methodId&&!uuid.test(input.methodId)||input.kind==='fundAccounts'&&input.enabled&&!uuid.test(input.methodId))fail('INVALID_MASTER_REFERENCE');
 await ensureMasterReferences(schema);
 return transaction(schema,async tx=>{await tx.query(`INSERT INTO master_reference_overlay(kind,id,name,enabled,method_id) VALUES($1,$2::uuid,$3,$4,$5::uuid) ON CONFLICT(kind,id) DO UPDATE SET name=excluded.name,enabled=excluded.enabled,method_id=excluded.method_id,updated_at=now() RETURNING id`,[input.kind,input.id,input.name.trim(),input.enabled,input.kind==='fundAccounts'?input.methodId||null:null]);return {id:input.id,kind:input.kind,enabled:input.enabled};});
}
export function scaled(value:any,places=4):bigint{const s=String(value);if(!/^-?\d+(?:\.\d+)?$/.test(s))throw Error('INVALID_DECIMAL');const [a,b='']=s.replace(/^-/,'').split('.');if(b.length>places&&/[1-9]/.test(b.slice(places)))throw Error('DECIMAL_PRECISION');return (BigInt(a)*10n**BigInt(places)+BigInt(b.slice(0,places).padEnd(places,'0')))*(s.startsWith('-')?-1n:1n);}
export function decimal(n:bigint,places=4){const sign=n<0n?'-':'';n=n<0n?-n:n;return sign+(n/10n**BigInt(places))+'.'+String(n%10n**BigInt(places)).padStart(places,'0');}
export async function install(schema=RUNTIME){if(!schema.startsWith('v2_runtime_'))throw Error('OVERLAY_SCHEMA_REQUIRED');const ddl=await readFile(new URL('./schema.sql',import.meta.url),'utf8');await transaction(schema,async tx=>{await tx.execute(`CREATE SCHEMA IF NOT EXISTS ${identifier(schema)}; SET LOCAL search_path=${identifier(schema)},pg_catalog;`);await tx.execute(ddl);});await (await import('./opening-inventory.ts')).installOpeningInventory(schema);}
export async function initialize(schema=RUNTIME){return transaction(schema,async tx=>{
 // Serialize initializers. No inventory table is touched, and existing runtime states are never reset.
 await tx.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,[schema+':initialize']);
 const docs=await tx.query(`INSERT INTO document(id,document_type,number,source_identity,status,baseline_was_included,current_effect_active,active_effect_identity,active_effect_revision,current_revision,business_day)
 SELECT target_document_id,upper(document_kind),source_number,jsonb_build_object('batch',batch_id,'dataset',source_dataset,'sourceId',source_id,'sha256',source_record_sha256),'APPROVED',true,true,'baseline:'||batch_id||':'||target_document_id,1,1,business_date::date
 FROM ${SOURCE}.tplus_history_document WHERE batch_id=$1 ON CONFLICT(id) DO NOTHING RETURNING id`,[BATCH]);
 await tx.query(`INSERT INTO revision(document_id,revision,original_imported,body)
 SELECT d.id,1,true,jsonb_build_object('header',to_jsonb(s),'lines',coalesce(l.items,'[]'::jsonb),'fundsRecords',coalesce(f.items,'[]'::jsonb))
 FROM document d JOIN ${SOURCE}.tplus_history_document s ON s.target_document_id=d.id AND s.batch_id=$1
 LEFT JOIN LATERAL (SELECT jsonb_agg(to_jsonb(x) ORDER BY source_id) items FROM ${SOURCE}.tplus_history_line x WHERE x.target_document_id=d.id AND x.batch_id=$1) l ON true
 LEFT JOIN LATERAL (SELECT jsonb_agg(to_jsonb(x) ORDER BY source_id) items FROM ${SOURCE}.tplus_sales_fund x WHERE x.target_document_id=d.id AND x.batch_id=$1) f ON true
 WHERE NOT EXISTS(SELECT 1 FROM revision r WHERE r.document_id=d.id AND r.revision=1)
 ON CONFLICT DO NOTHING RETURNING document_id`,[BATCH]);
 return {created:docs.rowCount};
 });}
export async function detail(id:string,schema=RUNTIME){return transaction(schema,async tx=>(await tx.query(`SELECT d.*,r.body,(SELECT coalesce(jsonb_agg(to_jsonb(h)||jsonb_build_object('body',(SELECT body FROM revision v WHERE v.document_id=h.document_id AND v.revision=h.revision),'previous_body',(SELECT body FROM revision v WHERE v.document_id=h.document_id AND v.revision=coalesce((SELECT prior.revision FROM version_history prior WHERE prior.document_id=h.document_id AND prior.version<h.version ORDER BY prior.version DESC LIMIT 1),1))) ORDER BY version),'[]'::jsonb) FROM version_history h WHERE h.document_id=d.id) history FROM document d JOIN revision r ON r.document_id=d.id AND r.revision=d.current_revision WHERE d.id=$1::uuid`,[id])).rows[0]);}
export type Command={documentId:string;operation:'approve'|'unapprove'|'save'|'create'|'delete';expectedVersion:number;requestKey:string;body?:any;documentType?:string};
function fail(code:string):never{throw Object.assign(Error(code),{code});}
async function validate(tx:Transaction,type:string,body:any,approve:boolean,original:any=null){
 if(!body||!Array.isArray(body.lines)||!body.lines.length||body.lines.length>10000||!Array.isArray(body.fundsRecords))fail('INVALID_DOCUMENT');
 if(type==='TRANSFER'&&!/^\d{4}-\d{2}-\d{2}$/.test(String(body.header?.business_date||'')))fail('INVALID_BUSINESS_DAY');
 for(const line of body.lines){if(!uuid.test(line.sku_id))fail('INVALID_SKU');scaled(line.source_quantity);if(type==='TRANSFER'){if(!uuid.test(line.from_warehouse_id)||!uuid.test(line.to_warehouse_id)||line.from_warehouse_id===line.to_warehouse_id)fail('INVALID_WAREHOUSE');}else if(!uuid.test(line.warehouse_id))fail('INVALID_WAREHOUSE');}
 const identities=await tx.query(`SELECT (SELECT count(*) FROM (SELECT id FROM ${SOURCE}.variant UNION ALL SELECT id FROM variant_overlay) v WHERE id IN (SELECT (x->>'sku_id')::uuid FROM jsonb_array_elements($1::jsonb)x)) AS found`,[JSON.stringify(body.lines)]);
 if(Number(identities.rows[0].found)!==new Set(body.lines.map((x:any)=>x.sku_id)).size)fail('UNKNOWN_SKU');
 const warehouses=[...new Set(body.lines.flatMap((x:any)=>type==='TRANSFER'?[x.from_warehouse_id,x.to_warehouse_id]:[x.warehouse_id]))];
 const known=await tx.query(`SELECT count(*) n FROM (SELECT id FROM ${SOURCE}.warehouse UNION SELECT id FROM master_reference_overlay WHERE kind='warehouses') known WHERE id IN (SELECT value::uuid FROM jsonb_array_elements_text($1::jsonb))`,[JSON.stringify(warehouses)]);if(Number(known.rows[0].n)!==warehouses.length)fail('UNKNOWN_WAREHOUSE');
 const inbound=[...new Set(body.lines.map((line:any)=>type==='TRANSFER'?line.to_warehouse_id:line.warehouse_id))];
 const enabled=await tx.query(`SELECT count(*) n FROM (SELECT id FROM ${SOURCE}.warehouse UNION SELECT id FROM master_reference_overlay WHERE kind='warehouses') known WHERE id IN (SELECT value::uuid FROM jsonb_array_elements_text($1::jsonb)) AND coalesce((SELECT enabled FROM master_reference_overlay o WHERE o.kind='warehouses' AND o.id=known.id),true)`,[JSON.stringify(inbound)]);if(Number(enabled.rows[0].n)!==inbound.length)fail('INBOUND_WAREHOUSE_DISABLED');
 if(type==='TRANSFER'){
  const outgoing=[...new Set(body.lines.map((line:any)=>line.from_warehouse_id))];
  const inactive=await tx.query(`SELECT id FROM master_reference_overlay WHERE kind='warehouses' AND enabled=false AND id IN (SELECT value::uuid FROM jsonb_array_elements_text($1::jsonb))`,[JSON.stringify(outgoing)]);
  for(const row of inactive.rows){const balance=await tx.query(`WITH cells AS (SELECT variant_id,sum(quantity) quantity FROM (SELECT variant_id,quantity FROM inventory_balance_base WHERE warehouse_id=$1::uuid UNION ALL SELECT sku_id variant_id,quantity FROM inventory_delta WHERE warehouse_id=$1::uuid) balances GROUP BY variant_id) SELECT count(*) FILTER (WHERE quantity<>0) n FROM cells`,[row.id]);if(!Number(balance.rows[0].n))fail('OUTBOUND_WAREHOUSE_DISABLED_EMPTY');}
 }
 if(type==='SALE'){
  const ids=new Set();
  for(const line of body.lines){
   if(!line.source_id||ids.has(line.source_id))fail('DUPLICATE_LINE');ids.add(line.source_id);
   const p=(await tx.query(`SELECT v.product_id,CASE WHEN owned.deleted THEN false ELSE coalesce(p.enabled,true) END enabled,coalesce(profile.body->>'minimumPrice',s.source_payload->>'minimumPrice') minimum FROM (SELECT id,product_id FROM ${SOURCE}.variant UNION ALL SELECT id,product_id FROM variant_overlay)v LEFT JOIN ${SOURCE}.product p ON p.id=v.product_id LEFT JOIN product_overlay owned ON owned.id=v.product_id LEFT JOIN product_profile_overlay profile ON profile.product_id=v.product_id LEFT JOIN ${SOURCE}.tplus_product_source s ON s.product_id=p.id WHERE v.id=$1::uuid`,[line.sku_id])).rows[0];
   if(!p)fail('UNKNOWN_PRODUCT');
   if(line.product_id!==p.product_id)fail('SKU_PRODUCT_MISMATCH');
   const old=original?.lines?.find((l:any)=>l.source_id===line.source_id);
   const unchanged=old&&old.sku_id===line.sku_id&&scaled(old.source_quantity)===scaled(line.source_quantity)&&scaled(old.unit_price??0)===scaled(line.unit_price??0)&&Boolean(old.gift)===Boolean(line.gift);
   const price=scaled(line.unit_price??0),quantity=scaled(line.source_quantity);if(price<0n)fail('INVALID_PRICE');
   if(!unchanged){if(!p.enabled)fail('PRODUCT_DISABLED');if(!line.gift&&p.minimum!=null&&price<scaled(p.minimum))fail('BELOW_MINIMUM_PRICE');
    const raw=price*quantity,rounded=(raw<0n?-1n:1n)*((raw<0n?-raw:raw)+500000n)/1000000n;
    if(scaled(line.amount??0,2)!==rounded)fail('LINE_AMOUNT_MISMATCH');
   }
  }
  let total=0n;for(const fund of body.fundsRecords){const amount=scaled(fund.amount,2);total+=amount;if(!['receipt','refund','zero'].includes(fund.direction)||(amount>0n&&fund.direction!=='receipt')||(amount<0n&&fund.direction!=='refund')||(amount===0n&&fund.direction!=='zero'))fail('INVALID_FUNDS_DIRECTION');if(!uuid.test(fund.payment_method_id)||!uuid.test(fund.fund_account_id))fail('INVALID_FUNDS_REFERENCE');
   const r=await tx.query(`SELECT 1 WHERE (EXISTS(SELECT 1 FROM ${SOURCE}.tplus_payment_method WHERE id=$1::uuid) OR EXISTS(SELECT 1 FROM master_reference_overlay WHERE kind='payments' AND id=$1::uuid)) AND coalesce((SELECT enabled FROM master_reference_overlay WHERE kind='payments' AND id=$1::uuid),true) AND (EXISTS(SELECT 1 FROM ${SOURCE}.tplus_fund_account WHERE id=$2::uuid) OR EXISTS(SELECT 1 FROM master_reference_overlay WHERE kind='fundAccounts' AND id=$2::uuid)) AND coalesce((SELECT enabled FROM master_reference_overlay WHERE kind='fundAccounts' AND id=$2::uuid),true)`,[fund.payment_method_id,fund.fund_account_id]);if(!r.rowCount)fail('UNKNOWN_FUNDS_REFERENCE');
   const inherited=original?.fundsRecords?.some((f:any)=>f.source_id===fund.source_id&&f.payment_method_id===fund.payment_method_id&&f.fund_account_id===fund.fund_account_id);if(!inherited){const allowed=await tx.query(`SELECT 1 WHERE coalesce((SELECT method_id=$2::uuid FROM master_reference_overlay WHERE kind='fundAccounts' AND id=$1::uuid),(SELECT primary_payment_method_id=$2::uuid FROM ${SOURCE}.tplus_fund_account WHERE id=$1::uuid),false)`,[fund.fund_account_id,fund.payment_method_id]);if(!allowed.rowCount)fail('PAYMENT_ACCOUNT_MISMATCH');}
  }
  // Save retains mismatches as unaudited, exactly as the frozen sales workflow; approval enforces equality.
  const due=body.lines.reduce((sum:bigint,x:any)=>sum+scaled(x.amount??0,2),0n)-scaled(body.header?.adjustment??body.header?.source_payload?.rounding??0,2);
  if(approve&&total!==due)fail('SETTLEMENT_MISMATCH');
 }
}
function contributions(type:string,body:any,original=false){return body.lines.flatMap((l:any,index:number)=>{
 const q=original?scaled(l.stock_quantity_contribution):scaled(l.source_quantity)*(type==='SALE'?-1n:1n);
 return type==='TRANSFER'?[{index,warehouse:l.from_warehouse_id,sku:l.sku_id,q:-q},{index,warehouse:l.to_warehouse_id,sku:l.sku_id,q}]:[{index,warehouse:l.warehouse_id,sku:l.sku_id,q}];
});}
export async function command(input:Command,options:{schema?:string;actor?:string;failure?:string;responseLost?:boolean}={}){
 const schema=options.schema||RUNTIME,actor=options.actor||'local-admin';
 if(options.failure&&!schema.startsWith('v2_runtime_test_'))fail('FAILURE_INJECTION_TEST_ONLY');
 if(!uuid.test(input.documentId)||!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<0||!input.requestKey?.trim()||input.requestKey.length>200)fail('INVALID_COMMAND');
 const inject=(point:string)=>{if(options.failure===point)fail('INJECTED_'+point);};
 const result=await transaction(schema,async tx=>{
  const op=await tx.query(`SELECT id FROM operator WHERE id=$1 AND enabled AND role IN ('ADMIN','WAREHOUSE','SALESPERSON')`,[actor]);if(!op.rowCount)fail('UNAUTHORIZED_OPERATOR');
  return executeIdempotent(tx,{actorId:actor,commandScope:'legacy-runtime',idempotencyKey:input.requestKey,payload:input,execute:async()=>{
   if(input.operation==='create'){
    if(input.expectedVersion!==0||!['SALE','TRANSFER','PURCHASE'].includes(input.documentType||''))fail('INVALID_CREATE');
    await validate(tx,input.documentType!,input.body,false);
    await tx.query(`INSERT INTO document(id,document_type,number,status,baseline_was_included,current_effect_active,current_revision,business_day) VALUES($1::uuid,$2,$3,'UNAUDITED',false,false,1,$4::date) RETURNING id`,[input.documentId,input.documentType,(!input.body.header?.source_number||/^(unsaved-|草稿-)/.test(input.body.header.source_number))?'V2-'+(input.documentType==='SALE'?'XS':input.documentType==='TRANSFER'?'DB':'JH')+'-'+input.documentId.slice(0,8):input.body.header.source_number,String(input.body.header.business_date||'').slice(0,10)||null]);
    await tx.query(`INSERT INTO revision VALUES($1::uuid,1,false,$2::jsonb,$3,now()) RETURNING document_id`,[input.documentId,JSON.stringify(input.body),actor]);
   }else{
    const d=(await tx.query(`SELECT * FROM document WHERE id=$1::uuid FOR UPDATE`,[input.documentId])).rows[0];if(!d)fail('NOT_FOUND');
    if(d.version!==input.expectedVersion)fail('VERSION_CONFLICT');
    if(d.status==='DELETED')fail('DOCUMENT_DELETED');
    if(input.operation==='save'){
     if(d.current_effect_active||d.status==='APPROVED')fail('UNAPPROVE_BEFORE_EDIT');await validate(tx,d.document_type,input.body,false,(await tx.query(`SELECT body FROM revision WHERE document_id=$1::uuid AND revision=1`,[d.id])).rows[0].body);
     await tx.query(`INSERT INTO revision VALUES($1::uuid,$2,false,$3::jsonb,$4,now()) RETURNING document_id`,[d.id,d.current_revision+1,JSON.stringify(input.body),actor]);
     await tx.query(`UPDATE document SET current_revision=current_revision+1,version=version+1,business_day=$2::date,updated_at=now() WHERE id=$1::uuid RETURNING id`,[d.id,String(input.body.header.business_date||'').slice(0,10)||null]);
    }else if(input.operation==='delete'){
     if(!['SALE','TRANSFER'].includes(d.document_type)||!['DRAFT','UNAUDITED'].includes(d.status)||d.current_effect_active)fail('DELETE_REQUIRES_UNAUDITED');
     await tx.query(`UPDATE document SET status='DELETED',version=version+1,updated_at=now() WHERE id=$1::uuid RETURNING id`,[d.id]);
    }else if(['approve','unapprove'].includes(input.operation)){
     const approve=input.operation==='approve';if(approve?d.current_effect_active:!d.current_effect_active)fail('INVALID_STATE');
     if(approve&&input.body){await validate(tx,d.document_type,input.body,true,(await tx.query(`SELECT body FROM revision WHERE document_id=$1::uuid AND revision=1`,[d.id])).rows[0].body);await tx.query(`INSERT INTO revision VALUES($1::uuid,$2,false,$3::jsonb,$4,now()) RETURNING document_id`,[d.id,d.current_revision+1,JSON.stringify(input.body),actor]);await tx.query(`UPDATE document SET current_revision=current_revision+1,business_day=$2::date WHERE id=$1::uuid RETURNING id`,[d.id,String(input.body.header.business_date||'').slice(0,10)||null]);d.current_revision++;}
     const rev=approve?d.current_revision:d.active_effect_revision;
     const r=(await tx.query(`SELECT * FROM revision WHERE document_id=$1::uuid AND revision=$2`,[d.id,rev])).rows[0];if(!r)fail('MISSING_REVISION');
     if(approve)await validate(tx,d.document_type,r.body,true,(await tx.query(`SELECT body FROM revision WHERE document_id=$1::uuid AND revision=1`,[d.id])).rows[0].body);
     const baseline=!approve&&d.active_effect_identity?.startsWith('baseline:');
     let effects;
     if(!approve&&!baseline){const rows=(await tx.query(`SELECT line_index AS index,warehouse_id AS warehouse,sku_id AS sku,quantity::text FROM movement WHERE posting_id=$1::uuid ORDER BY line_index,warehouse_id`,[d.active_effect_identity])).rows;if(!rows.length)fail('MISSING_ACTIVE_EFFECT');effects=rows.map((x:any)=>({...x,q:-scaled(x.quantity)}));}
     else effects=contributions(d.document_type,r.body,baseline).map((x:any)=>({...x,q:x.q*(approve?1n:-1n)}));
     const posting=randomUUID(),reason=approve?'REVISION_APPROVAL':baseline?'BASELINE_EFFECT_REVERSAL':'ACTIVE_EFFECT_REVERSAL';
     await tx.query(`UPDATE document SET status=$2,current_effect_active=$3,active_effect_identity=$4,active_effect_revision=$5,version=version+1,updated_at=now() WHERE id=$1::uuid RETURNING id`,[d.id,approve?'APPROVED':'UNAUDITED',approve,approve?posting:null,approve?rev:null]);inject('after-status');
     await tx.query(`INSERT INTO posting VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7,now()) RETURNING id`,[posting,d.id,rev,reason,approve?null:d.active_effect_identity,actor,input.requestKey]);
     const totals=new Map<string,any>();for(const e of effects){const key=e.warehouse+'|'+e.sku;const old=totals.get(key);totals.set(key,{...e,q:e.q+(old?.q||0n)});}
     // Document lock first, then every shared inventory key in global stable order.
     let n=0;for(const [key,e] of [...totals].sort(([a],[b])=>a.localeCompare(b))){await tx.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,[schema+':stock:'+key]);await tx.query(`INSERT INTO inventory_delta VALUES($1::uuid,$2::uuid,$3::numeric) ON CONFLICT(warehouse_id,sku_id) DO UPDATE SET quantity=inventory_delta.quantity+excluded.quantity RETURNING sku_id`,[e.warehouse,e.sku,decimal(e.q)]);if(++n===1)inject('after-first-inventory');}
     for(const e of effects)await tx.query(`INSERT INTO movement VALUES($1::uuid,$2,$3::uuid,$4::uuid,$5::numeric) RETURNING posting_id`,[posting,e.index,e.warehouse,e.sku,decimal(e.q)]);inject('after-movement');
    }else fail('INVALID_OPERATION');
   }
   const d=(await tx.query(`SELECT * FROM document WHERE id=$1::uuid`,[input.documentId])).rows[0];
   await tx.query(`INSERT INTO version_history(document_id,version,operation,revision,actor_id,request_key) VALUES($1::uuid,$2,$3,$4,$5,$6) RETURNING version`,[d.id,d.version,input.operation,d.current_revision,actor,input.requestKey]);
   inject('before-idempotency');await tx.query(`UPDATE idempotency_request SET document_id=$1::uuid,expected_version=$2,operation=$3,committed_state=$4 WHERE actor_id=$5 AND command_scope='legacy-runtime' AND idempotency_key=$6 RETURNING id`,[d.id,input.expectedVersion,input.operation,d.status,actor,input.requestKey]);return {ok:true,document:d};
  }});
 });
 if(options.responseLost)fail('SIMULATED_RESPONSE_LOST_AFTER_COMMIT');return result;
}
