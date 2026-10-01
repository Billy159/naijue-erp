import {transaction,SOURCE} from './db.ts';
import {RUNTIME} from './runtime.ts';
import {currentSizeGroups} from '../../frontend/product-size-groups.mjs';

const kinds=new Set(['categories','colors','groups','fits','seasons']);

const fail=(message:string):never=>{throw Error(message)};
type MasterInput={kind:string;id:string;action:'save'|'delete'|'check-delete'|'order';body?:Record<string,any>;expectedVersion?:number};

export async function productMasters(schema=RUNTIME){return transaction(schema,async tx=>(await tx.query('SELECT kind,id,body,deleted,version FROM product_master_overlay ORDER BY kind,id')).rows);}

export async function changeProductMaster(input:MasterInput,schema=RUNTIME){
 if(!kinds.has(input?.kind)||typeof input.id!=='string'||!input.id||input.id.length>100||!['save','delete','check-delete','order'].includes(input.action))fail('INVALID_PRODUCT_MASTER');
 const {kind,id,action}=input,body=input.body||{};
 if(action==='save'&&['groups','seasons'].includes(kind))fail(kind==='groups'?'尺码组为只读资料，不支持新增或编辑':'季节为只读资料，不支持新增或编辑');
 if(action==='save'){
  if(action==='save'&&(typeof body.name!=='string'||!body.name.trim()||body.name.length>80))fail('请输入有效名称');
  if(kind==='categories'&&(typeof body.parent!=='string'||!Number.isSafeInteger(Number(body.order))||body.parent===id))fail('INVALID_CATEGORY');
  if(kind==='groups'&&(!Array.isArray(body.sizes)||!body.sizes.length||body.sizes.length>200||body.sizes.some((s:any)=>!s.id||!s.name)))fail('INVALID_SIZE_GROUP');
  if(['colors','fits'].includes(kind)&&(!body.code||String(body.code).length>20))fail('请输入有效编码');
 }
 return transaction(schema,async tx=>{
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[schema+':product-master:'+kind]);
  const existing=(await tx.query('SELECT body,deleted,version FROM product_master_overlay WHERE kind=$1 AND id=$2',[kind,id])).rows[0];
  const version=existing?.version||0;if(input.expectedVersion!=null&&version!==input.expectedVersion)fail('资料已被其他页面修改，请刷新后重试');
  if(kind==='groups'){
   if(action==='delete'||action==='check-delete')fail('尺码组不允许删除');
   const original=existing?.body||currentSizeGroups().find(x=>x.id===id);
   if(original?.sizes?.some((size:any)=>!body.sizes?.some((next:any)=>next.id===size.id)))fail('已有尺码不能逐项移除');
   if(new Set(body.sizes.map((size:any)=>size.id)).size!==body.sizes.length||new Set(body.sizes.map((size:any)=>size.name.trim())).size!==body.sizes.length)fail('尺码不可重复');
  }
  const overlays=(await tx.query('SELECT id,body,deleted FROM product_master_overlay WHERE kind=$1',[kind])).rows;
  if(action==='order'){
   if(kind!=='categories'||!Array.isArray(body.ids)||body.ids.length<2||body.ids.length>300||new Set(body.ids).size!==body.ids.length)fail('INVALID_CATEGORY_ORDER');
   const source=(await tx.query(`SELECT c.code id,coalesce(p.code,'all') parent,c.name FROM ${SOURCE}.category c LEFT JOIN ${SOURCE}.category p ON p.id=c.parent_id`)).rows;
   const combined=new Map<string,any>(source.map((x:any)=>[x.id,{...x,...overlays.find((o:any)=>o.id===x.id)?.body,deleted:!!overlays.find((o:any)=>o.id===x.id)?.deleted}]));
   for(const o of overlays)if(!combined.has(o.id))combined.set(o.id,{id:o.id,...o.body,deleted:o.deleted});
   const siblings=body.ids.map((key:string)=>combined.get(key));if(siblings.some((x:any)=>!x||x.deleted)||new Set(siblings.map((x:any)=>x.parent)).size!==1)fail('只能调整同一级分类的顺序');
   const all=[...combined.values()].filter((x:any)=>!x.deleted&&x.parent===siblings[0].parent);if(all.length!==siblings.length)fail('排序需包含全部同级分类');
   const items=[];for(let i=0;i<body.ids.length;i++){
    const key=body.ids[i],next={...combined.get(key),order:i};delete next.id;delete next.deleted;
    const row=await tx.query(`INSERT INTO product_master_overlay(kind,id,body,deleted,version) VALUES('categories',$1,$2::jsonb,false,1) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body,deleted=false,version=product_master_overlay.version+1,updated_at=now() RETURNING version`,[key,JSON.stringify(next)]);
    items.push({kind:'categories',id:key,body:next,deleted:false,version:row.rows[0].version});
   }
   return {items};
  }
  if(action==='delete'||action==='check-delete'){
   if(existing?.deleted)fail('资料已经删除');
   let count=0,reason='';
   if(kind==='categories'){
    const sourceIds=(await tx.query(`SELECT code FROM ${SOURCE}.category`)).rows.map((x:any)=>x.code);
    const children=(await tx.query(`SELECT count(*)::int n FROM ${SOURCE}.category c LEFT JOIN product_master_overlay o ON o.kind='categories' AND o.id=c.code WHERE coalesce(o.body->>'parent',(SELECT p.code FROM ${SOURCE}.category p WHERE p.id=c.parent_id))=$1 AND coalesce(o.deleted,false)=false`,[id])).rows[0].n
     +overlays.filter((x:any)=>x.id!==id&&!sourceIds.includes(x.id)&&!x.deleted&&x.body?.parent===id).length;
    if(children)fail(`当前分类仍有 ${children} 个下级分类，无法删除`);
    count=(await tx.query(`SELECT count(*)::int n FROM ${SOURCE}.product p LEFT JOIN ${SOURCE}.category c ON c.id=p.category_id LEFT JOIN product_profile_overlay o ON o.product_id=p.id LEFT JOIN product_overlay hidden ON hidden.id=p.id WHERE coalesce(hidden.deleted,false)=false AND coalesce(o.body->>'categoryId',c.code)=$1`,[id])).rows[0].n;
    count+=(await tx.query(`SELECT count(*)::int n FROM product_overlay p LEFT JOIN product_profile_overlay o ON o.product_id=p.id WHERE p.deleted=false AND NOT EXISTS(SELECT 1 FROM ${SOURCE}.product src WHERE src.id=p.id) AND coalesce(o.body->>'categoryId',p.body->>'categoryId')=$1`,[id])).rows[0].n;reason='商品';
   }else if(kind==='colors'){
    count=(await tx.query(`SELECT count(DISTINCT v.product_id)::int n FROM ${SOURCE}.variant v JOIN ${SOURCE}.variant_option vo ON vo.variant_id=v.id JOIN ${SOURCE}.spec_value sv ON sv.id=vo.spec_value_id JOIN ${SOURCE}.spec_dimension d ON d.id=sv.dimension_id AND d.code='COLOR' WHERE sv.id::text=$1`,[id])).rows[0].n;
    count+=(await tx.query('SELECT count(DISTINCT product_id)::int n FROM variant_overlay WHERE color_id::text=$1',[id])).rows[0].n;reason='商品规格';
   }else if(kind==='fits'){
    count=(await tx.query(`SELECT count(*)::int n FROM ${SOURCE}.product p JOIN ${SOURCE}.fit f ON f.id=p.fit_id LEFT JOIN product_profile_overlay o ON o.product_id=p.id LEFT JOIN product_overlay hidden ON hidden.id=p.id WHERE coalesce(hidden.deleted,false)=false AND CASE WHEN o.body ? 'fitIds' THEN o.body->'fitIds' ? $1 ELSE CASE WHEN f.name ~* '修身|偏小' THEN 'Y' WHEN f.name ~* '加肥加大' THEN 'D' WHEN f.name ~* '加肥' THEN 'C' WHEN f.name ~* '宽松|偏大|大版' THEN 'B' WHEN f.name ~* '特体' THEN 'E' ELSE 'A' END=$1 END`,[id])).rows[0].n;
    count+=(await tx.query(`SELECT count(*)::int n FROM product_overlay p LEFT JOIN product_profile_overlay o ON o.product_id=p.id WHERE p.deleted=false AND NOT EXISTS(SELECT 1 FROM ${SOURCE}.product src WHERE src.id=p.id) AND coalesce(o.body->'fitIds',p.body->'fitIds','[]'::jsonb) ? $1`,[id])).rows[0].n;reason='商品';
   }else if(kind==='seasons'){
    count=(await tx.query(`SELECT count(*)::int n FROM ${SOURCE}.product p LEFT JOIN ${SOURCE}.tplus_product_source s ON s.product_id=p.id LEFT JOIN product_profile_overlay o ON o.product_id=p.id LEFT JOIN product_overlay hidden ON hidden.id=p.id WHERE coalesce(hidden.deleted,false)=false AND position($1 in coalesce(o.body->>'season',s.source_payload->>'season',s.source_payload->'source'->>'所属类别',''))>0`,[id])).rows[0].n;
    count+=(await tx.query(`SELECT count(*)::int n FROM product_overlay p LEFT JOIN product_profile_overlay o ON o.product_id=p.id WHERE p.deleted=false AND NOT EXISTS(SELECT 1 FROM ${SOURCE}.product src WHERE src.id=p.id) AND position($1 in coalesce(o.body->>'season',p.body->>'season',''))>0`,[id])).rows[0].n;reason='商品';
   }
   if(count)fail(`当前${{categories:'分类',colors:'颜色',groups:'尺码组',fits:'版型',seasons:'季节'}[kind]}仍被 ${count} 款${reason}使用，无法删除`);
   if(action==='check-delete')return {kind,id,canDelete:true,version};
   const sourceBacked=kind==='categories'?(await tx.query(`SELECT 1 FROM ${SOURCE}.category WHERE code=$1 LIMIT 1`,[id])).rowCount>0:
    kind==='colors'?(await tx.query(`SELECT 1 FROM ${SOURCE}.spec_value s JOIN ${SOURCE}.spec_dimension d ON d.id=s.dimension_id AND d.code='COLOR' WHERE s.id::text=$1 LIMIT 1`,[id])).rowCount>0:
    kind==='groups'?new Set(['UPPER','PANTS','SHOES','KIDS','FREE']).has(id)||(await tx.query(`SELECT 1 FROM ${SOURCE}.size_group WHERE id::text=$1 LIMIT 1`,[id])).rowCount>0:
    kind==='fits'?new Set(['Y','A','B','C','D','E']).has(id):
    new Set(['春季','夏季','秋季','冬季','春夏','秋冬']).has(id);
   if(!sourceBacked){
    if(kind==='groups'&&existing?.body?.name)await tx.query('DELETE FROM size_overlay WHERE group_name=$1 AND NOT EXISTS(SELECT 1 FROM variant_overlay v WHERE v.size_id=size_overlay.id) RETURNING id',[existing.body.name]);
    await tx.query('DELETE FROM product_master_overlay WHERE kind=$1 AND id=$2 RETURNING id',[kind,id]);
    return {kind,id,deleted:true,version:0};
   }
   const updated=await tx.query(`INSERT INTO product_master_overlay(kind,id,body,deleted,version) VALUES($1,$2,'{}'::jsonb,true,1) ON CONFLICT(kind,id) DO UPDATE SET deleted=true,version=product_master_overlay.version+1,updated_at=now() RETURNING version`,[kind,id]);
   return {kind,id,deleted:true,version:updated.rows[0].version};
  }
  if(kind==='categories'){
   const source=(await tx.query(`SELECT c.code id,coalesce(p.code,'all') parent,c.name FROM ${SOURCE}.category c LEFT JOIN ${SOURCE}.category p ON p.id=c.parent_id`)).rows;
   const combined=new Map<string,any>(source.map((x:any)=>[x.id,{...x,...overlays.find((o:any)=>o.id===x.id)?.body,deleted:!!overlays.find((o:any)=>o.id===x.id)?.deleted}]));
   for(const o of overlays)if(!combined.has(o.id))combined.set(o.id,{id:o.id,...o.body,deleted:o.deleted});
   const parent=body.parent==='all'?null:combined.get(body.parent);
   if(body.parent!=='all'&&(!parent||parent.deleted||parent.parent!=='all'))fail('分类只能属于一级分类');
   if([...combined.values()].some((x:any)=>x.id!==id&&!x.deleted&&x.parent===body.parent&&x.name===body.name.trim()))fail('同级分类名称不能重复');
  }else{
   if(overlays.some((x:any)=>x.id!==id&&!x.deleted&&(x.body?.name===body.name?.trim()||body.code&&x.body?.code===body.code)))fail('名称或编码已存在');
   if(kind==='colors'){
    const sourceRows=(await tx.query(`SELECT s.id::text id,s.name,s.code FROM ${SOURCE}.spec_value s JOIN ${SOURCE}.spec_dimension d ON d.id=s.dimension_id AND d.code='COLOR'`)).rows;
    if(sourceRows.some((x:any)=>x.id!==id&&!overlays.some((o:any)=>o.id===x.id&&o.deleted)&&((overlays.find((o:any)=>o.id===x.id)?.body?.name||x.name)===body.name?.trim()||(overlays.find((o:any)=>o.id===x.id)?.body?.code||x.code)===body.code)))fail('名称或编码已存在');
   }
  }
  const next={...body,...(action==='save'?{name:body.name.trim()}:{})};
  const updated=await tx.query(`INSERT INTO product_master_overlay(kind,id,body,deleted,version) VALUES($1,$2,$3::jsonb,false,1) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body,deleted=false,version=product_master_overlay.version+1,updated_at=now() RETURNING version`,[kind,id,JSON.stringify(next)]);
  return {kind,id,body:next,deleted:false,version:updated.rows[0].version};
 });
}
