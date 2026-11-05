/** OFFLINE ONLY: exercise original renderers against literal synthetic rows to
 * enumerate the exact finite SQL bytes BEFORE any engine is started. This is not
 * DB evidence, authorization, readiness or a substitute for actual read checks. */
import { createHash } from 'node:crypto';
import { runOriginalReads } from './reads.mjs';import { checkedFixture } from './seed.mjs';
import { need } from '../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
export async function renderReadManifest(value) {
 const f=checkedFixture(value),sql=new Set();
 const identity={account_id:f.actor.accountId,staff_id:f.staffId,login_enabled:true,role:'ADMIN',employment_status:'在职',hall_id:null,native_hall_id:null,hall_enabled:null};
 const nativeSkus=f.skuIds.map((id,i)=>({id,sku_code:'SYNTHETIC-SKU-'+f.id+'-'+i,product_id:f.productId,product_code:f.expectedProductCode,product_name:'SYNTHETIC PRODUCT',color_id:f.colorId,color_name:'SYNTHETIC COLOR',fit_id:f.fitId,fit_name:'SYNTHETIC FIT',size_id:f.sizes[i===0?0:22].id,size_name:f.sizes[i===0?0:22].name,size_group_id:f.targetGroupId,member_size_id:f.sizes[i===0?0:22].id,sku_enabled:true,product_enabled:true,color_enabled:true,fit_enabled:true}));
 const query=async(text,values=[])=>{need(typeof text==='string','SQL_TEXT_REQUIRED');sql.add(text);let rows;
 if(['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','COMMIT','ROLLBACK'].includes(text))rows=[];
 else if(/\/\* (current-form|application-read):identity \*\//.test(text))rows=values[0]===f.actor.accountId?[identity]:[];
 else if(text.startsWith('/* current-form:count */ SELECT count(*)::text AS total FROM naijue_erp.product p '))rows=[{total:'1'}];
 else if(text.startsWith('/* current-form:page */ SELECT p.id, p.product_code,'))rows=[{id:f.productId,product_code:f.expectedProductCode,name:'SYNTHETIC PRODUCT',retail_price:'1.25',enabled:true,size_group_id:f.targetGroupId,category_id:f.categoryId,category_name:'SYNTHETIC CATEGORY'}];
 else if(text.startsWith('/* current-form:count */ SELECT count(*)::text AS total FROM naijue_erp.sku s '))rows=[{total:'2'}];
 else if(text.startsWith('/* current-form:page */ SELECT s.id, s.sku_code,')||text.startsWith('/* current-form:sku-batch */ SELECT s.id, s.sku_code,'))rows=nativeSkus;
 else if(text==='SELECT count(*)::text AS total FROM naijue_erp.size_group WHERE strpos(lower(name || \' \' || code), lower($1::text)) > 0')rows=[{total:'22'}];
 else if(text.startsWith('SELECT id, name FROM naijue_erp.size_group WHERE '))rows=f.groups.slice(values[2],values[2]+values[1]).map(g=>({id:g.id,name:g.name}));
 else if(text.startsWith('SELECT m.size_group_id, s.id, s.name, m.display_order FROM naijue_erp.size_group_member m'))rows=f.members.filter(m=>values[0].includes(m.size_group_id)).map(m=>({size_group_id:m.size_group_id,id:m.size_id,name:f.sizes.find(s=>s.id===m.size_id).name,display_order:m.display_order})).sort((a,b)=>a.size_group_id.localeCompare(b.size_group_id)||a.display_order-b.display_order||a.id.localeCompare(b.id));
 else throw Error('OFFLINE_UNRECOGNIZED_ORIGINAL_SQL');return {rows,rowCount:rows.length};};
 const pool={async connect(){return{query,release(){}};}};
 await runOriginalReads(pool,f);
 return Object.freeze({scope:'OFFLINE_RENDER_ONLY_NOT_DATABASE_EVIDENCE',queries:Object.freeze([...sql].sort().map(text=>Object.freeze({text,sha256:createHash('sha256').update(text).digest('hex')})))});
}
