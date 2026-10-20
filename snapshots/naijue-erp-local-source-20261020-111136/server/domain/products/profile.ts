import {randomUUID} from 'node:crypto';
import type {AuthorizedContext} from '../../security/service.js';
import {identifier,object,SecurityError} from '../../security/errors.js';
import {approvedPartyRole} from '../../security/approved-party-roles.js';
import {CommandError,executeIdempotent} from '../idempotency/index.js';
import {parseScaled} from '../transactions/decimal.js';
import {hasNonzeroInventory} from '../transactions/inventory.js';
import {catalog,productMasters,productReference,type Catalog} from './catalog.js';
import {fail,mainBarcode,price,priceFields,record,sizeGroups,text,imageRoleLabel} from './definitions.js';

export interface PreparedImage {id:string;name:string;role:string;colorId:string;colorName:string|null;sortOrder:number;path:string;sha256:string;mediaType:string}
const fields=['name','categoryId','year','season','supplierId','thickness','shapeCode','barcodeItemCode','freeCode','schemeId','fitId','fitIds','selectedColorIds','selectedFitIds','selectedSizeIds','groupId','enabled','disabledSkuIds','unitId',...priceFields];
export function version(value:unknown):number {if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)return fail('资料版本无效');return value;}
export function requestKey(input:Record<string,unknown>):string{return identifier(input['requestKey']);}
export async function idempotent<T>(context:AuthorizedContext,input:Record<string,unknown>,scope:string,work:()=>Promise<T>):Promise<T> {
  try{return await executeIdempotent(context.session,{actorId:context.actor.id,commandScope:scope,idempotencyKey:requestKey(input),runtimeSchema:context.repo.runtime,payload:input,execute:work});}
  catch(error){if(error instanceof CommandError)throw new SecurityError(error.code==='IDEMPOTENCY_CONFLICT'?'IDEMPOTENCY_CONFLICT':'VALIDATION',409,error.message);throw error;}
}
function stringList(value:unknown,label:string,max=200):string[] {
  if(!Array.isArray(value)||value.length>max||value.some(v=>typeof v!=='string'||!v||v.includes('\0')||v.length>128)||new Set(value).size!==value.length)return fail(`${label}无效`);
  return value as string[];
}
export async function skuReferences(context:AuthorizedContext,ids:readonly string[]):Promise<boolean> {
  if(!ids.length)return false;
  const {session,repo}=context;
  if(await hasNonzeroInventory(session,repo.runtime,repo.source,[],ids))return true;
  const row=(await session.query<{used:boolean}>(`SELECT EXISTS(SELECT 1 FROM ${repo.source}.tplus_history_line WHERE sku_id=ANY($1::uuid[])
    UNION ALL SELECT 1 FROM ${repo.source}.document_line WHERE variant_id=ANY($1::uuid[])
    UNION ALL SELECT 1 FROM ${repo.source}.inventory_movement WHERE variant_id=ANY($1::uuid[])
    UNION ALL SELECT 1 FROM ${repo.runtime}.movement WHERE sku_id=ANY($1::uuid[])
    UNION ALL SELECT 1 FROM ${repo.runtime}.revision rev CROSS JOIN LATERAL jsonb_array_elements(coalesce(rev.body->'lines','[]')) line WHERE line->>'sku_id'=ANY($1::text[])
    UNION ALL SELECT 1 FROM ${repo.runtime}.inventory_history_cell WHERE sku_id=ANY($1::uuid[])
    UNION ALL SELECT 1 FROM ${repo.runtime}.inventory_history_event_leg WHERE sku_id=ANY($1::uuid[])
    UNION ALL SELECT 1 FROM ${repo.runtime}.inventory_history_movement WHERE sku_id=ANY($1::uuid[])) used`,[ids])).rows[0];
  return row?.used===true;
}

export async function saveProfile(context:AuthorizedContext,input:Record<string,unknown>,images:readonly PreparedImage[],validateOnly=false):Promise<unknown> {
  const work=async()=>{
    const {session,repo}=context,r=repo.runtime,productId=identifier(input['productId'],true),expected=version(input['expectedVersion']);
    const data=await catalog(context),original=data.products.find(p=>p.id===productId),prior=data.profiles.find(p=>p.product_id===productId);
    const currentVersion=prior?.version||0;
    if(currentVersion!==expected)return fail('商品已被其他页面修改，请重新读取','VERSION_CONFLICT',409);
    const raw=object(input['profile']),old=prior?.body||{},profile={...old};
    if(Object.keys(raw).some(key=>!fields.includes(key)&&key!=='images'))return fail('商品字段无效');
    for(const key of fields)if(Object.hasOwn(raw,key))profile[key]=raw[key];
    profile['name']=text(profile['name'],'商品名称',80);
    for(const key of ['categoryId','year','season','supplierId','barcodeItemCode','fitId','groupId','schemeId'])profile[key]=text(profile[key],key,120);
    for(const key of ['thickness','shapeCode','freeCode'])if(profile[key]!=null)profile[key]=text(profile[key],key,120,true);
    if(!/^\d{4}$/.test(String(profile['year']))||!String(profile['season']).split('、').every(s=>['春','夏','秋','冬','春季','夏季','秋季','冬季','春夏','秋冬'].includes(s)))return fail('请选择有效年份与季节');
    if(!['2018','2020','2021','2021fit','2023','2026'].includes(String(profile['schemeId'])))return fail('条码方案无效');
    if(raw['enabled']!==undefined&&typeof raw['enabled']!=='boolean')return fail('商品启用状态无效');
    profile['enabled']=profile['enabled']??original?.enabled??true;
    if(raw['unitId']!==undefined){
      const unitId=identifier(raw['unitId'],true);
      if(original&&unitId!==(old['unitId']||original['unit_id']))return fail('已有商品的原计量单位不能换绑','REFERENCE_CONFLICT',409);
      const unit=(await session.query<{id:string;name:string;quantity_scale:number;enabled:boolean}>(`SELECT id,name,quantity_scale,enabled FROM ${repo.source}.unit WHERE id=$1::uuid`,[unitId])).rows[0];
      if(!unit||!unit.enabled&&!original)return fail('计量单位不存在或已停用');
      profile['unitId']=unit.id;profile['unit']=unit.name;profile['quantityScale']=unit.quantity_scale;
    }
    if(!original&&!profile['unitId'])return fail('新商品请选择已确认的计量单位');
    for(const key of priceFields)if(Object.hasOwn(raw,key)){
      // An unchanged imported four-decimal fact stays exact; edited/new values obey the two-decimal contract.
      const oldValue=Object.hasOwn(old,key)?old[key]:original?.attributes[key];
      if(raw[key]!==oldValue)profile[key]=price(raw[key]);else profile[key]=oldValue;
    }
    const groups=sizeGroups(),masters=await productMasters(context),categoryId=String(profile['categoryId']);
    const sourceCategories=await productReference(context,'categories');
    const categoryMaster=masters.find(m=>m.kind==='categories'&&m.id===categoryId);
    const sourceCategory=sourceCategories.find(c=>c['code']===categoryId);
    if(categoryMaster?.deleted||!categoryMaster&&!sourceCategory||categoryMaster?.body['disabled']===true||sourceCategory?.['enabled']===false&&!categoryMaster)return fail('商品分类不存在或已停用');
    const categories=new Map(sourceCategories.map(c=>[String(c['code']),{parent:c['parent_code']||'all',...masters.find(m=>m.kind==='categories'&&m.id===c['code'])?.body}]));
    for(const m of masters.filter(m=>m.kind==='categories'&&!m.deleted))categories.set(m.id,{parent:'all',...m.body});
    if([...categories].some(([id,c])=>id!==categoryId&&c.parent===categoryId&&!masters.find(m=>m.kind==='categories'&&m.id===id)?.deleted))return fail('商品请选择末级分类');
    const supplier=String(profile['supplierId']);identifier(supplier,true);
    const known=(await session.query<{enabled:boolean;code:string|null}>(`SELECT coalesce((m.body->>'enabled')::boolean,c.enabled) enabled,c.code
      FROM (SELECT 1) anchor LEFT JOIN ${repo.source}.counterparty c ON c.id=$1::uuid LEFT JOIN ${r}.master_data_entity m ON m.kind='parties' AND m.id=$1::text
      WHERE (c.id IS NOT NULL OR m.id IS NOT NULL) AND (m.id IS NULL OR m.body->'usage' ? 'supplier')`,[supplier])).rows[0];
    const oldSupplier=old['supplierId']||original?.['counterparty_id'];
    const approvedSupplier=known?.code?approvedPartyRole(known.code):undefined;
    if(!known||(!known.enabled||(approvedSupplier!==undefined&&approvedSupplier!=='supplier'))&&supplier!==oldSupplier)return fail('供应商不存在、未纳入供应商名单或已停用');
    const newCode=input['newCode']===undefined?'':text(input['newCode'],'款号',80);
    if(!original){
      if(expected!==0||!newCode||!/^[A-Za-z0-9_-]+$/.test(newCode)||!input['specs'])return fail('新商品必须有款号和规格');
      if((await session.query(`SELECT 1 FROM ${repo.source}.product WHERE code=$1 UNION ALL SELECT 1 FROM ${r}.product_overlay WHERE code=$1 OR id=$2::uuid`,[newCode,productId])).rows.length)return fail('商品款号或身份已存在', 'VERSION_CONFLICT',409);
    }else if(newCode&&newCode!==original.code)return fail('已有商品款号不能重编');
    const ownSkus=data.skus.filter(s=>s.product_id===productId),disabled=stringList(profile['disabledSkuIds']||[],'停用规格');
    if(disabled.some(id=>!ownSkus.some(s=>s.id===id)))return fail('停用规格必须绑定原 SKU');
    const aliases=input['aliases']===undefined?[]:input['aliases'],removed=stringList(input['removedAliases']||[],'待删除条码');
    if(!Array.isArray(aliases)||aliases.length>200)return fail('人工旧码无效');
    if(!original&&!validateOnly)await session.query(`INSERT INTO ${r}.product_overlay(id,code,body) VALUES($1::uuid,$2,$3::jsonb)`,[productId,newCode,JSON.stringify(profile)]);
    const created=await ensureSpecs(context,data,productId,profile,input['specs'],validateOnly);
    for(const key of ['selectedColorIds','selectedFitIds','selectedSizeIds','fitIds'])if(profile[key]!==undefined)stringList(profile[key],key);
    if(input['specs']===undefined){
      const mapped=ownSkus.filter(s=>s.options['SIZE']?.currentGroupId&&!s.historicalUnmappedReason),groupIds=[...new Set(mapped.map(s=>s.options['SIZE']!.currentGroupId))];
      const group=groups.find(g=>g.id===(old['groupId']||groupIds.length===1&&groupIds[0]));
      const cells=new Map<string,typeof mapped>();for(const s of mapped){const key=[s.options['COLOR']?.id,s.fit_id,s.options['SIZE']?.name].join('|');cells.set(key,[...(cells.get(key)||[]),s]);}
      const unique=[...cells.values()].filter(rows=>rows.length===1).flat();
      const baseline:Record<string,unknown>={
        ...(group?{groupId:group.id,selectedSizeIds:group.sizes.map(s=>s.id)}:{}),
        selectedColorIds:[...new Set(unique.map(s=>s.options['COLOR']?.id).filter(Boolean))],selectedFitIds:[...new Set(unique.map(s=>s.fit_id).filter(Boolean))],...old,
      };
      for(const key of ['selectedColorIds','selectedFitIds','selectedSizeIds','fitIds','groupId','fitId'])if(raw[key]!==undefined&&baseline[key]!==undefined){
        const before=baseline[key],after=raw[key],same=Array.isArray(before)&&Array.isArray(after)?before.length===after.length&&before.every(v=>after.includes(v)):before===after;
        if(!same)return fail('规格变更必须提交完整规格定义');
      }
    }
    const skuIds=new Set([...ownSkus.map(s=>s.id),...created.map(s=>s.skuId)]),seen=new Set<string>();
    for(const item of aliases){const a=object(item),code=text(a['code'],'人工旧码',80),sku=identifier(a['skuId'],true),note=text(a['note']??'','旧码说明',100,true);
      if(!skuIds.has(sku)||seen.has(code))return fail('人工旧码必须唯一绑定当前商品的原 SKU');seen.add(code);
      if(removed.includes(code))return fail('待删除条码仍在草稿中');
      const existing=(await session.query<{sku_id:string|null;product_id:string}>(`SELECT sku_id,product_id FROM ${repo.source}.tplus_product_barcode WHERE barcode=$1
        UNION ALL SELECT sku_id,product_id FROM ${r}.generated_barcode WHERE barcode=$1
        UNION ALL SELECT sku_id,product_id FROM ${r}.generated_barcode_retired WHERE barcode=$1
        UNION ALL SELECT sku_id,product_id FROM ${r}.product_barcode_alias WHERE barcode=$1
        UNION ALL SELECT sku_id,product_id FROM ${r}.product_barcode_alias_retired WHERE barcode=$1`,[code])).rows;
      if(existing.some(b=>b.sku_id!==sku||b.product_id!==productId)||data.sourceBarcodes.some(b=>b.barcode===code)||data.barcodes.some(b=>b.barcode===code&&b.generated))return fail('条码已绑定，不能换绑或覆盖主码','BARCODE_CONFLICT',409);
      if(!validateOnly)await session.query(`INSERT INTO ${r}.product_barcode_alias(barcode,product_id,sku_id,historical_note,origin) VALUES($1,$2::uuid,$3::uuid,$4,'MANUAL')
        ON CONFLICT(barcode) DO UPDATE SET historical_note=excluded.historical_note WHERE ${r}.product_barcode_alias.product_id=excluded.product_id AND ${r}.product_barcode_alias.sku_id=excluded.sku_id AND ${r}.product_barcode_alias.origin='MANUAL'`,[code,productId,sku,note]);
    }
    for(const code of removed){const alias=data.aliases.find(a=>a.barcode===code&&a.product_id===productId&&a['origin']==='MANUAL');
      if(!alias?.sku_id)return fail('仅允许删除当前商品的人工旧码，主码与来源码受保护');
      if(await skuReferences(context,[alias.sku_id]))return fail('该旧码的 SKU 已有库存或单据引用，不能删除','REFERENCE_CONFLICT',409);
      if(!validateOnly)await session.query(`INSERT INTO ${r}.product_barcode_alias_retired SELECT * FROM ${r}.product_barcode_alias WHERE barcode=$1 AND product_id=$2::uuid`,[code,productId]);
      if(!validateOnly)await session.query(`DELETE FROM ${r}.product_barcode_alias WHERE barcode=$1 AND product_id=$2::uuid`,[code,productId]);
    }
    if(raw['images']!==undefined){
      if(validateOnly)return fail('图片须通过受控商品媒体入口维护');
      const ownedColors=new Set([...ownSkus.map(s=>s.options['COLOR']?.id),...created.map(s=>s.colorId)]);
      if(new Set(images.map(i=>i.id)).size!==images.length)return fail('同一媒体身份不能重复使用');
      if(images.some(i=>i.role==='color'&&!ownedColors.has(i.colorId)))return fail('颜色配图必须关联本商品的原颜色身份');
      await saveImages(context,productId,profile,images);
    }
    if(validateOnly)return {productId,code:original?.code||newCode,version:currentVersion+1,created};
    const saved=(await session.query<{version:number}>(`INSERT INTO ${r}.product_profile_overlay(product_id,body,version) VALUES($1::uuid,$2::jsonb,1)
      ON CONFLICT(product_id) DO UPDATE SET body=excluded.body,version=${r}.product_profile_overlay.version+1,updated_at=now() RETURNING version`,[productId,JSON.stringify(profile)])).rows[0]!;
    await session.query(`UPDATE ${r}.product_overlay SET body=$2::jsonb,updated_at=now() WHERE id=$1::uuid`,[productId,JSON.stringify(profile)]);
    return {productId,code:original?.code||newCode,version:saved.version,created};
  };
  return validateOnly?work():idempotent(context,input,'products.save',work);
}

async function ensureSpecs(context:AuthorizedContext,data:Catalog,productId:string,profile:Record<string,unknown>,raw:unknown,validateOnly=false):Promise<{skuId:string;colorId:string;fitId:string;sizeId:string;barcode:string}[]> {
  if(raw===undefined)return [];
  const specs=object(raw),colors=stringList(specs['colors'],'颜色',60),fits=stringList(specs['fits'],'版型',20),group=sizeGroups().find(g=>g.id===profile['groupId']);
  if(!colors.length||!fits.length||!group||!Array.isArray(specs['sizes'])||!specs['sizes'].length||colors.length*fits.length*group.sizes.length>10000)return fail('请设置当前颜色、尺码组与版型');
  const requested=specs['sizes'].map(object);
  if(requested.length!==group.sizes.length||!group.sizes.every(size=>requested.some(x=>x['id']===size.id&&x['name']===size.name&&x['groupName']===group.name&&x['code']===size.code)))return fail('尺码只能使用当前只读尺码组的完整定义');
  const masters=await productMasters(context),sourceColors=await productReference(context,'colors');
  const colorRows=colors.map(id=>{identifier(id,true);const master=masters.find(m=>m.kind==='colors'&&m.id===id),src=sourceColors.find(c=>c['id']===id);
    const body={...src,...master?.body};if(master?.deleted||!src&&!master||body['disabled']===true||body['enabled']===false)return fail('颜色不存在或已停用');return {id,code:String(body['code']||'')};});
  const allowedFits=new Set([...fitsBase,...masters.filter(m=>m.kind==='fits'&&!m.deleted&&m.body['disabled']!==true&&m.body['enabled']!==false).map(m=>m.id)]);
  if(fits.some(f=>!/^[A-Z]$/.test(f)||!allowedFits.has(f)||masters.some(m=>m.kind==='fits'&&m.id===f&&(m.deleted||m.body['disabled']===true))))return fail('版型不存在或已停用');
  const own=data.skus.filter(s=>s.product_id===productId),oldProfile=data.profiles.find(p=>p.product_id===productId)?.body||{};
  for(const sku of own){const size=sku.options['SIZE'],color=sku.options['COLOR'];
    if(!size||!color||!sku.overlay&&!size.currentGroupId)continue;
    const previouslySelected=(!Array.isArray(oldProfile['selectedColorIds'])||oldProfile['selectedColorIds'].includes(color.id))&&(!Array.isArray(oldProfile['selectedFitIds'])||oldProfile['selectedFitIds'].includes(sku.fit_id));
    if(previouslySelected&&(size.currentGroupId!==group.id||!colors.includes(color.id)||!fits.includes(sku.fit_id||'')||!group.sizes.some(s=>s.name===size.name)))return fail('已有原 SKU 的颜色、版型与尺码不能移除或换绑，请使用停用','REFERENCE_CONFLICT',409);
  }
  const created:{skuId:string;colorId:string;fitId:string;sizeId:string;barcode:string}[]=[],records:{id:string;uiSizeId:string;name:string;code:string;groupName:string}[]=[];
  const managed=data.products.find(p=>p.id===productId)?.attributes['excelBarcodeAuthority'];
  for(const size of group.sizes){const db=validateOnly?{id:randomUUID()}:(await context.session.query<{id:string}>(`INSERT INTO ${context.repo.runtime}.size_overlay(group_name,name) VALUES($1,$2)
    ON CONFLICT(group_name,name) DO UPDATE SET name=excluded.name RETURNING id`,[group.name,size.name])).rows[0]!;
    records.push({id:db.id,uiSizeId:size.id,name:size.name,code:size.code,groupName:group.name});
    for(const color of colorRows)for(const fit of fits){const matches=own.filter(s=>s.options['COLOR']?.id===color.id&&s.fit_id===fit&&s.options['SIZE']?.currentGroupId===group.id&&s.options['SIZE']?.name===size.name);
      if(matches.length)continue; // Includes ambiguous source cells; no synthetic replacement or first-row selection.
      if(managed)continue; // Workbook authority never enables automatic inferred supplementation.
      const barcode=mainBarcode(profile,fit,color.code,size.code);if(!barcode)return fail('新规格的条码编码不完整，请核对颜色、尺码与方案');
      if((await context.session.query(`SELECT 1 FROM ${context.repo.source}.tplus_product_barcode WHERE barcode=$1
        UNION ALL SELECT 1 FROM ${context.repo.runtime}.generated_barcode WHERE barcode=$1
        UNION ALL SELECT 1 FROM ${context.repo.runtime}.product_barcode_alias WHERE barcode=$1
        UNION ALL SELECT 1 FROM ${context.repo.runtime}.generated_barcode_retired WHERE barcode=$1
        UNION ALL SELECT 1 FROM ${context.repo.runtime}.product_barcode_alias_retired WHERE barcode=$1`,[barcode])).rows.length)return fail('新规格条码已被使用，已有主码不会重算','BARCODE_CONFLICT',409);
      if(created.some(s=>s.barcode===barcode))return fail('同一批规格条码重复','BARCODE_CONFLICT',409);
      const sku=randomUUID();if(!validateOnly)await context.session.query(`INSERT INTO ${context.repo.runtime}.variant_overlay(id,product_id,color_id,size_id,fit_id,size_name,size_code,group_name) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,$8)`,[sku,productId,color.id,db.id,fit,size.name,size.code,group.name]);
      if(!validateOnly)await context.session.query(`INSERT INTO ${context.repo.runtime}.generated_barcode(sku_id,product_id,barcode,scheme_id,evidence) VALUES($1::uuid,$2::uuid,$3,$4,$5::jsonb)`,[sku,productId,barcode,String(profile['schemeId']),JSON.stringify({source:'T18-new-SKU',fitId:fit,colorId:color.id,sizeId:db.id})]);
      created.push({skuId:sku,colorId:color.id,fitId:fit,sizeId:db.id,barcode});
    }
  }
  profile['specSizeRecords']=records;profile['selectedColorIds']=colors;profile['selectedFitIds']=fits;profile['selectedSizeIds']=group.sizes.map(s=>s.id);profile['fitIds']=fits;
  if(!fits.includes(String(profile['fitId'])))profile['fitId']=fits[0];
  return created;
}
const fitsBase=['Y','A','B','C','D','E'];

async function saveImages({session,repo}:AuthorizedContext,productId:string,profile:Record<string,unknown>,images:readonly PreparedImage[]):Promise<void> {
  const owned=(await session.query<{id:string;path:string;role:string}>(`SELECT id,path,role FROM ${repo.runtime}.product_image WHERE product_id=$1::uuid`,[productId])).rows;
  for(const image of images){const existing=owned.find(i=>i.id===image.id);
    if(existing?.role.startsWith('history/'))return fail('媒体已由其他请求替换，请重新读取','VERSION_CONFLICT',409);
    if(existing&&existing.path!==image.path)return fail('媒体身份不一致');
    await session.query(`INSERT INTO ${repo.runtime}.product_image(id,product_id,path,sha256,media_type,role,color_name,name,sort_order)
      VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET role=excluded.role,color_name=excluded.color_name,name=excluded.name,sort_order=excluded.sort_order WHERE ${repo.runtime}.product_image.product_id=excluded.product_id`,[image.id,productId,image.path,image.sha256,image.mediaType,image.role,image.colorName,image.name,image.sortOrder]);
  }
  for(const image of owned)if(!image.role.startsWith('history/')&&!images.some(i=>i.id===image.id))await session.query(`UPDATE ${repo.runtime}.product_image SET role='history/'||role WHERE product_id=$1::uuid AND id=$2::uuid`,[productId,image.id]);
  profile['images']=images.map(i=>({id:i.id,mediaId:i.id,name:i.name,role:imageRoleLabel(i.role),colorId:i.colorId,colorName:i.colorName,url:`/api/media/${i.id}`,sortOrder:i.sortOrder}));
}

export async function deleteProduct(context:AuthorizedContext,input:Record<string,unknown>):Promise<unknown> {
  const check=async()=>{const data=await catalog(context),id=identifier(input['productId'],true),p=data.products.find(p=>p.id===id);
    if(!p)return fail('商品不存在','NOT_FOUND',404);
    const current=data.profiles.find(p=>p.product_id===id)?.version||0;if(current!==version(input['expectedVersion']))return fail('商品已更新，请重新预检','VERSION_CONFLICT',409);
    if(await skuReferences(context,data.skus.filter(s=>s.product_id===id).map(s=>s.id)))return fail('商品已有分仓库存、单据或流水引用，不能删除','REFERENCE_CONFLICT',409);
    return {data,id,p,current};};
  if(input['checkOnly']===true){const {id,p,current}=await check();return {productId:id,code:p.code,version:current,canDelete:true};}
  return idempotent(context,input,'products.delete',async()=>{const {id,p,current,data}=await check(),profile=data.profiles.find(p=>p.product_id===id)?.body||{};
    await context.session.query(`INSERT INTO ${context.repo.runtime}.product_overlay(id,code,body,deleted) VALUES($1::uuid,$2,$3::jsonb,true) ON CONFLICT(id) DO UPDATE SET deleted=true,updated_at=now()`,[id,p.code,JSON.stringify(profile)]);
    await context.session.query(`INSERT INTO ${context.repo.runtime}.product_profile_overlay(product_id,body,version) VALUES($1::uuid,$2::jsonb,1) ON CONFLICT(product_id) DO UPDATE SET version=${context.repo.runtime}.product_profile_overlay.version+1`,[id,JSON.stringify(profile)]);
    return {productId:id,code:p.code,deleted:true,version:current+1};});
}

/** Called by the transaction seam for new/increased usage only. Reversals stay tied to original identities. */
export async function validateSkuUse(context:AuthorizedContext,body:Record<string,unknown>,prior:Record<string,unknown>|null):Promise<void> {
  const lines=Array.isArray(body['lines'])?body['lines']:[],oldLines=Array.isArray(prior?.['lines'])?prior['lines']:[];
  const {session,repo}=context;
  for(const value of lines){const line=object(value),old=oldLines.map(record).find(o=>o['source_id']===line['source_id']&&o['sku_id']===line['sku_id']);
    const row=(await session.query<{product_id:string;enabled:boolean;product_enabled:boolean}>(`SELECT v.product_id,v.enabled AND NOT coalesce(pp.body->'disabledSkuIds' ? v.id::text,false) enabled,
      coalesce((pp.body->>'enabled')::boolean,p.enabled,true) AND NOT coalesce(po.deleted,false) product_enabled
      FROM (SELECT id,product_id,enabled FROM ${repo.source}.variant UNION ALL SELECT id,product_id,true FROM ${repo.runtime}.variant_overlay) v
      LEFT JOIN ${repo.source}.product p ON p.id=v.product_id LEFT JOIN ${repo.runtime}.product_overlay po ON po.id=v.product_id
      LEFT JOIN ${repo.runtime}.product_profile_overlay pp ON pp.product_id=v.product_id WHERE v.id=$1::uuid`,[identifier(line['sku_id'],true)])).rows[0];
    if(!row)return fail('商品规格不存在');
    if(line['product_id']!==undefined&&line['product_id']!==row.product_id)return fail('商品与原 SKU 身份不一致');
    if(!row.enabled||!row.product_enabled){
      const quantity=parseScaled(line['source_quantity'],4),before=old?parseScaled(old['source_quantity'],4):0n;
      const absolute=(value:bigint)=>value<0n?-value:value;
      const sameLocations=old&&['warehouse_id','from_warehouse_id','to_warehouse_id'].every(key=>line[key]===old[key]);
      if(!old||!sameLocations||absolute(quantity)>absolute(before)||quantity!==0n&&(quantity<0n)!==(before<0n))return fail('停用商品或规格不能用于新业务','REFERENCE_CONFLICT',409);
    }
  }
}
