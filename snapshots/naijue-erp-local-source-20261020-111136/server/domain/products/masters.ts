import type {AuthorizedContext} from '../../security/service.js';
import {identifier,object} from '../../security/errors.js';
import {catalog,productMasters,productReference,type Master} from './catalog.js';
import {fail,fits,text} from './definitions.js';
import {idempotent,version} from './profile.js';

async function combined(context:AuthorizedContext,kind:string):Promise<Master[]> {
  const overlays=(await productMasters(context)).filter(m=>m.kind===kind);
  const source:Record<string,unknown>[]=kind==='fits'?fits:await productReference(context,kind);
  const rows=new Map<string,Master>(source.map(row=>{const id=String(kind==='categories'?row['code']:row['id']);return [id,{kind,id,body:{...row,...(kind==='categories'?{parent:row['parent_code']||'all',standard:true}:{}),disabled:row['enabled']===false},version:0,deleted:false}];}));
  for(const overlay of overlays)rows.set(overlay.id,{...overlay,body:{...rows.get(overlay.id)?.body,...overlay.body}});
  return [...rows.values()];
}
async function referenced(context:AuthorizedContext,kind:string,id:string):Promise<boolean> {
  const data=await catalog(context);
  if(kind==='colors')return data.skus.some(s=>s.options['COLOR']?.id===id);
  if(kind==='fits')return data.skus.some(s=>s.fit_id===id)||data.profiles.some(p=>Array.isArray(p.body['fitIds'])&&p.body['fitIds'].includes(id));
  const row=(await context.session.query<{used:boolean}>(`SELECT EXISTS(
    SELECT 1 FROM ${context.repo.source}.product p JOIN ${context.repo.source}.category c ON c.id=p.category_id WHERE c.code=$1
    UNION ALL SELECT 1 FROM ${context.repo.runtime}.product_profile_overlay WHERE body->>'categoryId'=$1
    UNION ALL SELECT 1 FROM ${context.repo.runtime}.product_overlay WHERE body->>'categoryId'=$1) used`,[id])).rows[0];
  return row?.used===true;
}
async function store(context:AuthorizedContext,kind:string,id:string,body:Record<string,unknown>,deleted=false):Promise<Master> {
  return (await context.session.query<Master>(`INSERT INTO ${context.repo.runtime}.product_master_overlay(kind,id,body,deleted,version) VALUES($1,$2,$3::jsonb,$4,1)
    ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body,deleted=excluded.deleted,version=${context.repo.runtime}.product_master_overlay.version+1,updated_at=now() RETURNING kind,id,body,deleted,version`,[kind,id,JSON.stringify(body),deleted])).rows[0]!;
}
export async function changeMaster(context:AuthorizedContext,input:Record<string,unknown>):Promise<unknown> {
  const kind=text(input['kind'],'资料类型'),id=identifier(input['id']),action=input['action'];
  if(!['categories','colors','fits','groups','seasons'].includes(kind)||!['save','delete','check-delete','order'].includes(String(action)))return fail('商品设置动作无效');
  if(['groups','seasons'].includes(kind))return fail('尺码组与季节为只读资料');
  const work=async()=>{
    const rows=await combined(context,kind),old=rows.find(m=>m.id===id);
    if((old?.version||0)!==version(input['expectedVersion']))return fail('商品设置已被其他页面修改','VERSION_CONFLICT',409);
    if(old?.deleted)return fail('资料已删除，不能复用原身份');
    const raw=input['body']===undefined?{}:object(input['body']);
    if(action==='order'){
      const ids=raw['ids'];if(kind!=='categories'||!Array.isArray(ids)||ids.length<2||ids.length>300||new Set(ids).size!==ids.length||ids.some(v=>typeof v!=='string'))return fail('分类排序无效');
      const siblings=ids.map(key=>rows.find(row=>row.id===key));if(siblings.some(x=>!x||x.deleted)||new Set(siblings.map(x=>x!.body['parent'])).size!==1)return fail('只能调整同级分类');
      if(rows.filter(x=>!x.deleted&&x.body['parent']===siblings[0]!.body['parent']).length!==siblings.length)return fail('排序必须包含全部同级分类');
      const expected=object(input['versions']);for(const row of siblings)if(expected[row!.id]!==row!.version)return fail('分类排序版本已变化','VERSION_CONFLICT',409);
      const items=[];for(const [index,row]of siblings.entries())items.push(await store(context,kind,row!.id,{...row!.body,order:index}));return {items};
    }
    const used=await referenced(context,kind,id);
    if(action==='check-delete'||action==='delete'){
      if(!old)return fail('资料不存在','NOT_FOUND',404);
      if(used||kind==='categories'&&rows.some(row=>!row.deleted&&row.body['parent']===id))return fail('资料仍被商品、原 SKU 或下级分类引用，不能删除','REFERENCE_CONFLICT',409);
      if(kind==='fits'&&fits.some(f=>f.id===id))return fail('固定版型不能删除');
      if(action==='check-delete')return {kind,id,canDelete:true,version:old.version};
      return store(context,kind,id,old.body,true);
    }
    const body:Record<string,unknown>={...old?.body,name:text(raw['name'],'名称',80)};
    for(const key of ['code','parent','order','standard','disabled','enabled'])if(raw[key]!==undefined)body[key]=raw[key];
    if(raw['disabled']!==undefined&&typeof raw['disabled']!=='boolean'||raw['enabled']!==undefined&&typeof raw['enabled']!=='boolean')return fail('启用状态无效');
    body['disabled']=raw['disabled']??(raw['enabled']===undefined?old?.body['disabled']||false:!raw['enabled']);body['enabled']=!body['disabled'];
    if(kind==='categories'){
      const parent=text(body['parent'],'上级分类');
      const p=rows.find(row=>row.id===parent);if(parent!== 'all'&&(!p||p.deleted||p.body['parent']!=='all'||parent===id))return fail('分类只能属于有效一级分类');
      if(used&&old?.body['parent']!==parent||rows.some(row=>!row.deleted&&row.body['parent']===id)&&parent!=='all')return fail('已引用分类不能换绑上级','REFERENCE_CONFLICT',409);
      body['standard']=true;body['parent']=parent;if(!Number.isSafeInteger(body['order']))return fail('分类顺序无效');
    }else{
      const code=text(body['code'],'编码',20);body['code']=code;
      if(kind==='colors')identifier(id,true);
      if(kind==='fits'&&(!/^[A-Z]$/.test(id)||code!==id))return fail('版型编码必须与一个大写字母身份一致');
      if(used&&old?.body['code']!==code)return fail('已引用颜色或版型编码不能重编','REFERENCE_CONFLICT',409);
    }
    if(rows.some(row=>row.id!==id&&!row.deleted&&(row.body['name']===body['name']&&(kind!=='categories'||row.body['parent']===body['parent'])||kind!=='categories'&&row.body['code']===body['code'])))return fail('名称或编码已存在','VALIDATION',409);
    return store(context,kind,id,body);
  };
  return action==='check-delete'?work():idempotent(context,input,'productMasters.save',work);
}
