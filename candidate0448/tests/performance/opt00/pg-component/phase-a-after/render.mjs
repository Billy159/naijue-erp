/** OFFLINE SQL enumeration only. Literal rows are not actual PG evidence. */
import {runHttpProtocol} from './http.mjs';
import {runDomainProtocol} from './reads.mjs';import {SHA} from './bindings.mjs';
export function literalQuery(f,onText=()=>{}){const b=f.base,identity={account_id:b.actor.accountId,staff_id:b.staffId,login_enabled:true,role:'ADMIN',employment_status:'在职',hall_id:null,native_hall_id:null,hall_enabled:null};
 const nativeSkus=f.good.map(s=>({id:s.id,sku_code:s.skuCode,product_id:s.productId,product_code:s.productCode,product_name:s.productName,color_id:s.colorId,color_name:s.colorName,fit_id:s.fitId,fit_name:s.fitName,size_id:s.sizeId,size_name:s.sizeName,size_group_id:s.sizeGroupId,member_size_id:s.sizeId,sku_enabled:true,product_enabled:true,color_enabled:true,fit_enabled:true}));
 const products=[{id:b.productId,product_code:b.expectedProductCode,name:'SYNTHETIC PRODUCT',retail_price:'1.25',enabled:true,size_group_id:b.targetGroupId,category_id:b.categoryId,category_name:'SYNTHETIC CATEGORY'},{id:f.otherProduct.id,product_code:f.otherProduct.code,name:f.otherProduct.name,retail_price:'2.50',enabled:true,size_group_id:f.otherProduct.groupId,category_id:b.categoryId,category_name:'SYNTHETIC CATEGORY'}];
 return async function query(text,values=[]){onText(text);let rows;
 if(['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','COMMIT','ROLLBACK'].includes(text))rows=[];
 else if(/\/\* (current-form|application-read):identity \*\//.test(text))rows=values[0]===b.actor.accountId?[identity]:[];
 else if(text.startsWith('/* current-form:sku-batch */'))rows=nativeSkus.filter(s=>values[0].includes(s.id)).sort((a,b)=>a.id.localeCompare(b.id));
 else if(text.startsWith('/* current-form:saved-edit-products */'))rows=products.filter(p=>values[0].includes(p.id)).sort((a,b)=>a.id.localeCompare(b.id));
 else if(text.startsWith('/* current-form:count */ SELECT count(*)::text AS total FROM naijue_erp.product p '))rows=[{total:String(products.filter(p=>p.product_code.toLowerCase().includes(values[0].toLowerCase())).length)}];
 else if(text.startsWith('/* current-form:page */ SELECT p.id, p.product_code,'))rows=products.filter(p=>p.product_code.toLowerCase().includes(values[0].toLowerCase())).sort((a,b)=>a.product_code.localeCompare(b.product_code));
 else if(text.startsWith('SELECT count(*)::text AS total FROM naijue_erp.size_group WHERE '))rows=[{total:'22'}];
 else if(text.startsWith('SELECT id, name FROM naijue_erp.size_group WHERE '))rows=b.groups.slice(values[2],values[2]+values[1]).map(g=>({id:g.id,name:g.name}));
 else if(text.startsWith('SELECT m.size_group_id, s.id, s.name, m.display_order FROM naijue_erp.size_group_member m'))rows=b.members.filter(m=>values[0].includes(m.size_group_id)).map(m=>({size_group_id:m.size_group_id,id:m.size_id,name:b.sizes.find(s=>s.id===m.size_id).name,display_order:m.display_order})).sort((a,b)=>a.size_group_id.localeCompare(b.size_group_id)||a.display_order-b.display_order||a.id.localeCompare(b.id));
 else throw Error('UNENUMERATED_ORIGINAL_PROTOCOL_SQL');return{rows:structuredClone(rows),rowCount:rows.length};};}
export async function renderProtocol(bindings,f,includeHttp=true){const texts=new Set(),query=literalQuery(f,text=>texts.add(text)),pool={async connect(){return{query,release(){}};}};
 const oracle=await runDomainProtocol({...bindings,pool,fixture:f}),http=includeHttp?await runHttpProtocol({...bindings,pool,fixture:f}):null;return{scope:'OFFLINE_ENUMERATION_ONLY_NOT_ENGINE_EVIDENCE',queries:[...texts].sort().map(text=>({text,sha256:SHA(text)})),oracle,http};}
