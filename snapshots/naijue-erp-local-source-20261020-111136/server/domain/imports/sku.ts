import type {AuthorizedContext} from '../../security/service.js';
import {identifier,object} from '../../security/errors.js';
import {catalog,productMasters,productReference} from '../products/catalog.js';
import {fail,text} from '../products/definitions.js';
import {version} from '../products/profile.js';

/** Explicit original identity only. No stock writes, inferred size codes, deletion or barcode replacement. */
export async function importSku(context:AuthorizedContext,input:Record<string,unknown>,validateOnly:boolean):Promise<Record<string,unknown>> {
  const {session,repo}=context,id=identifier(input['id'],true),productId=identifier(input['productId'],true),body=object(input['body']);
  if(Object.keys(body).some(k=>!['colorId','fitId','sizeName','sizeCode','groupName','enabled','barcode'].includes(k)))return fail('SKU 包含不支持字段；数量、期初与换绑不属于资料导入');
  const colorId=identifier(body['colorId'],true),fitId=text(body['fitId'],'原版型',1),sizeName=text(body['sizeName'],'原尺码名称',80),sizeCode=text(body['sizeCode'],'原尺码代码',80,true),groupName=text(body['groupName'],'原尺码组',80),barcode=body['barcode']===undefined?'':text(body['barcode'],'精确条码',80);
  if(typeof body['enabled']!=='boolean')return fail('SKU 启停状态无效');
  const data=await catalog(context),product=data.products.find(p=>p.id===productId),sku=data.skus.find(s=>s.id===id),profile=data.profiles.find(p=>p.product_id===productId),current=profile?.version||0;
  if(!product)return fail('SKU 的商品必须先导入并重新读取','REFERENCE_CONFLICT',409);
  if(version(input['expectedVersion'])!==current)return fail('商品或 SKU 状态已更新，请重新预检','VERSION_CONFLICT',409);
  if(sku&&(sku.product_id!==productId||sku.options['COLOR']?.id!==colorId||sku.fit_id!==fitId||(sku.options['SIZE']?.sourceName||sku.options['SIZE']?.name)!==sizeName||(sku.options['SIZE']?.sourceCode??sku.options['SIZE']?.code)!==sizeCode))return fail('原 SKU 的商品、颜色、版型与尺码不能换绑','REFERENCE_CONFLICT',409);
  if(sku){
    const group=sku.overlay?sku.options['SIZE']?.standardGroup:product['source_group_name']||product.attributes['sourceSizeGroupName']||product.attributes['sourceSizeGroupCode'];
    if(group&&group!==groupName)return fail('原 SKU 尺码组不能换绑','REFERENCE_CONFLICT',409);
    const source=(await session.query<{enabled:boolean}>(`SELECT enabled FROM ${repo.source}.variant WHERE id=$1::uuid`,[id])).rows[0];
    if(body['enabled']===true&&source?.enabled===false)return fail('原来源停用状态受保护，不能用导入改写');
  }else{
    if(!product.enabled)return fail('停用商品不能导入新 SKU');
    const colors=await productReference(context,'colors'),masters=await productMasters(context),color=colors.find(c=>c['id']===colorId),overlay=masters.find(c=>c.kind==='colors'&&c.id===colorId);
    if(!color&&!overlay||color?.['enabled']===false&&!overlay||overlay?.deleted||overlay?.body['disabled']===true)return fail('颜色不存在或已停用');
    if(!['Y','A','B','C','D','E'].includes(fitId)&&!masters.some(m=>m.kind==='fits'&&m.id===fitId&&!m.deleted&&m.body['disabled']!==true))return fail('版型不存在或已停用');
    if(data.skus.some(s=>s.product_id===productId&&s.options['COLOR']?.id===colorId&&s.fit_id===fitId&&(s.options['SIZE']?.sourceName||s.options['SIZE']?.name)===sizeName&&(s.options['SIZE']?.sourceCode??s.options['SIZE']?.code)===sizeCode))return fail('已有同一原规格，请使用现有 SKU 身份','REFERENCE_CONFLICT',409);
    if(product.attributes['excelBarcodeAuthority'])return fail('权威条码商品须通过已确认来源包迁入，不能普通导入补造 SKU');
  }
  const primary=data.barcodes.filter(b=>b.sku_id===id&&(b.generated||b['is_default']));
  if(barcode&&primary.length&&!primary.some(b=>b.barcode===barcode))return fail('已有主码不能覆盖或重算','BARCODE_CONFLICT',409);
  if(barcode){const occupied=(await session.query<{sku_id:string|null;product_id:string}>(`SELECT sku_id,product_id FROM ${repo.source}.tplus_product_barcode WHERE barcode=$1
    UNION ALL SELECT sku_id,product_id FROM ${repo.runtime}.generated_barcode WHERE barcode=$1
    UNION ALL SELECT sku_id,product_id FROM ${repo.runtime}.generated_barcode_retired WHERE barcode=$1
    UNION ALL SELECT sku_id,product_id FROM ${repo.runtime}.product_barcode_alias WHERE barcode=$1
    UNION ALL SELECT sku_id,product_id FROM ${repo.runtime}.product_barcode_alias_retired WHERE barcode=$1`,[barcode])).rows;
    if(occupied.some(b=>b.sku_id!==id||b.product_id!==productId))return fail('精确条码已占用，不能换绑','BARCODE_CONFLICT',409);
    if(sku&&!occupied.length&&primary.length)return fail('已有主码受保护；人工旧码请使用商品资料 aliases');
  }
  const unchanged=!!sku&&sku.enabled===body['enabled']&&(!barcode||data.barcodes.some(b=>b.sku_id===id&&b.barcode===barcode));
  const result={id,productId,version:unchanged?current:current+1,unchanged,created:!sku,claimedCodes:barcode?[barcode]:[]};
  if(validateOnly||unchanged)return result;
  if(!sku){const size=(await session.query<{id:string}>(`INSERT INTO ${repo.runtime}.size_overlay(group_name,name) VALUES($1,$2) ON CONFLICT(group_name,name) DO UPDATE SET name=excluded.name RETURNING id`,[groupName,sizeName])).rows[0]!;
    await session.query(`INSERT INTO ${repo.runtime}.variant_overlay(id,product_id,color_id,size_id,fit_id,size_name,size_code,group_name) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,$8)`,[id,productId,colorId,size.id,fitId,sizeName,sizeCode,groupName]);}
  if(barcode&&!data.barcodes.some(b=>b.sku_id===id&&b.barcode===barcode))await session.query(`INSERT INTO ${repo.runtime}.generated_barcode(sku_id,product_id,barcode,scheme_id,evidence) VALUES($1::uuid,$2::uuid,$3,'REFERENCE',$4::jsonb)`,[id,productId,barcode,JSON.stringify({source:'T26-explicit-reference',requestKey:input['requestKey']})]);
  const next={...profile?.body},disabled=new Set(Array.isArray(next['disabledSkuIds'])?next['disabledSkuIds'] as string[]:[]);
  if(body['enabled'])disabled.delete(id);else disabled.add(id);next['disabledSkuIds']=[...disabled];
  await session.query(`INSERT INTO ${repo.runtime}.product_profile_overlay(product_id,body,version) VALUES($1::uuid,$2::jsonb,1)
    ON CONFLICT(product_id) DO UPDATE SET body=excluded.body,version=${repo.runtime}.product_profile_overlay.version+1,updated_at=now()`,[productId,JSON.stringify(next)]);
  return result;
}
