/** Exact owner-only pre-cutoff reference setup; no driver/connection on import. */
import { buildFixture, checkPriceContract, setupInsert, SETUP_COLUMNS, FORBIDDEN_ROWS } from './contract.mjs';
import { CATALOGUE_PRICE_KEYS } from '../../../../packages/application/src/catalogue-price-input.ts';
import { isNodeScryptPasswordHash } from '../../../../packages/authentication/src/passwords.ts';
import { need } from '../../../integration/runtime26-baseline/schema-objects-only/lifecycle.mjs';
export function checkedFixture(value) { need(value && typeof value.id==='string','FROZEN_SOURCE_FIXTURE_REQUIRED'); const f=buildFixture({id:value.id});need(JSON.stringify(value)===JSON.stringify(f),'EXACT_INDEPENDENT_FIXTURE_REQUIRED');return f; }
export function seedCommands(value,passwordHash) {
 const f=checkedFixture(value),prices=checkPriceContract();need(typeof passwordHash==='string'&&isNodeScryptPasswordHash(passwordHash),'REAL_ORIGINAL_SCRYPT_HASH_REQUIRED');
 const rows=[];const add=(t,v)=>rows.push({table:t,...setupInsert(t,v)});
 add('hall',[f.hallId,'SYNTHETIC OPT01 HALL',null,null,true,1]);
 add('staff',[f.staffId,'SYNTHETIC OPT01 ADMIN',null,'ADMIN',null,'在职',1]);
 add('user_account',[f.actor.accountId,f.staffId,'synthetic-opt01-'+f.id,passwordHash,true,1,1,f.timestamp,f.timestamp]);
 add('product_category',[f.categoryId,null,'SYNTHETIC CATEGORY',0,1]);
 add('color',[f.colorId,'001','SYNTHETIC COLOR',true,1]);add('fit',[f.fitId,'A','SYNTHETIC FIT',true,1]);
 for(const s of f.sizes)add('size',[s.id,s.code,s.name]);for(const g of f.groups)add('size_group',[g.id,g.code,g.name]);
 for(const m of f.members)add('size_group_member',[m.size_group_id,m.size_id,m.display_order]);
 for(const [id,enabled,suffix] of [[f.productId,true,''],[f.disabledProductId,false,'-DISABLED']])add('product',[id,f.expectedProductCode+suffix,'SYNTHETIC PRODUCT'+suffix,f.categoryId,null,null,f.targetGroupId,...CATALOGUE_PRICE_KEYS.map(k=>prices[k]),enabled,1,'OPT01'+suffix]);
 for(let i=0;i<2;i++)add('sku',[f.skuIds[i],f.productId,f.colorId,f.fitId,f.sizes[i===0?0:22].id,'SYNTHETIC-SKU-'+f.id+'-'+i,true,1,null]);
 need(rows.length===Object.values(f.counts).reduce((a,n)=>a+n,0)&&Object.entries(f.counts).every(([table,n])=>rows.filter(r=>r.table===table).length===n),'EXACT_FINITE_ROW_COUNTS_REQUIRED');
 return Object.freeze(rows.map(Object.freeze));
}
export async function assertNoPublicationOrBusiness(query) {for(const table of FORBIDDEN_ROWS){const rows=(await query(`SELECT count(*)::text AS n FROM naijue_erp."${table}"`)).rows;need(rows.length===1&&rows[0].n==='0','ZERO_BUSINESS_SOURCE_REQUIRED:'+table);}}
export async function seedReference(query,fixture,passwordHash) {
 const f=checkedFixture(fixture);await assertNoPublicationOrBusiness(query);
 for(const row of seedCommands(f,passwordHash))await query(row.text,row.values);
 // Force original deferred constraint triggers before declaring seed success.
 await query('SET CONSTRAINTS ALL IMMEDIATE');await assertNoPublicationOrBusiness(query);
 for(const [table,expected] of Object.entries(f.counts)){const r=(await query(`SELECT count(*)::text AS n FROM naijue_erp."${table}"`)).rows;need(r.length===1&&r[0].n===String(expected),'ACTUAL_SEED_COUNT_MISMATCH:'+table);}
 return {scope:f.scope,counts:f.counts,constraintsForcedImmediate:true,serviceProduced:false,publication:false};
}
