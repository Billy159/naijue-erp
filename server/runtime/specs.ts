import {readFileSync} from 'node:fs';
import {transaction,SOURCE} from './db.ts';
import {RUNTIME} from './runtime.ts';
import {compatibleFit} from '../adapter.mjs';
import {sizeMapping} from './size-mapping.ts';

const mapping=JSON.parse(readFileSync(new URL('../../data-cleaning/size-mapping/user-size-audit.json',import.meta.url),'utf8'));
const mappedSizes=new Map<string,Set<string>>();
for(const row of mapping.matches){const [group,,,name]=row.target;if(!mappedSizes.has(group))mappedSizes.set(group,new Set());mappedSizes.get(group)!.add(name);}
for(const row of sizeMapping.values()){const [group,,,name]=row.target;if(!mappedSizes.has(group))mappedSizes.set(group,new Set());mappedSizes.get(group)!.add(name);}
for(const names of mappedSizes.values())names.add('无尺码');
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

export async function ensureSpec(input:any,schema=RUNTIME){
 const productId=String(input?.productId||''),colorId=String(input?.colorId||''),
  sourceSizeId=String(input?.sizeId||''),groupName=String(input?.groupName||'').trim(),sizeName=String(input?.sizeName||'').trim(),sizeCode=String(input?.sizeCode||'').trim(),requestedFit=String(input?.fitId||'');
 if(!uuid.test(productId)||!uuid.test(colorId)||sourceSizeId&&!uuid.test(sourceSizeId)||!groupName||groupName.length>100||!sizeName||sizeName.length>80||sizeCode.length>12)throw Error('INVALID_SPEC');
 if(!sourceSizeId&&!mappedSizes.get(groupName)?.has(sizeName))throw Error('UNKNOWN_SIZE');
 return transaction(schema,async tx=>{
  const product=(await tx.query(`SELECT p.id,f.name fit_name FROM ${SOURCE}.product p LEFT JOIN ${SOURCE}.fit f ON f.id=p.fit_id WHERE p.id=$1::uuid`,[productId])).rows[0];
  if(!product)throw Error('PRODUCT_NOT_FOUND');
  const baseFit=compatibleFit(product.fit_name).id,fitId=requestedFit||baseFit;
  if(!['Y','A','B','C','D','E'].includes(fitId))throw Error('UNKNOWN_PRODUCT_FIT');
  const color=(await tx.query(`SELECT s.id,s.name,s.code FROM ${SOURCE}.spec_value s JOIN ${SOURCE}.spec_dimension d ON d.id=s.dimension_id AND d.code='COLOR' WHERE s.id=$1::uuid UNION ALL SELECT id::uuid,body->>'name',body->>'code' FROM product_master_overlay WHERE kind='colors' AND id=$1 AND deleted=false LIMIT 1`,[colorId])).rows[0];
  if(!color)throw Error('UNKNOWN_PRODUCT_COLOR');
  let sizeId=sourceSizeId;
  if(sizeId){
   const owned=(await tx.query(`SELECT 1 FROM ${SOURCE}.variant v JOIN ${SOURCE}.variant_option o ON o.variant_id=v.id JOIN ${SOURCE}.spec_value s ON s.id=o.spec_value_id JOIN ${SOURCE}.spec_dimension d ON d.id=s.dimension_id AND d.code='SIZE' WHERE v.product_id=$1::uuid AND o.spec_value_id=$2::uuid UNION ALL SELECT 1 FROM variant_overlay WHERE product_id=$1::uuid AND size_id=$2::uuid UNION ALL SELECT 1 FROM size_overlay WHERE id=$2::uuid LIMIT 1`,[productId,sizeId])).rowCount;
   if(!owned)throw Error('UNKNOWN_PRODUCT_SIZE');
  }else{
   sizeId=(await tx.query(`INSERT INTO size_overlay(group_name,name) VALUES($1,$2) ON CONFLICT(group_name,name) DO UPDATE SET name=excluded.name RETURNING id`,[groupName,sizeName])).rows[0].id;
  }
  const existing=fitId===baseFit?(await tx.query(`SELECT v.id FROM ${SOURCE}.variant v JOIN ${SOURCE}.variant_option c ON c.variant_id=v.id JOIN ${SOURCE}.spec_value cs ON cs.id=c.spec_value_id JOIN ${SOURCE}.spec_dimension cd ON cd.id=cs.dimension_id AND cd.code='COLOR' JOIN ${SOURCE}.variant_option z ON z.variant_id=v.id JOIN ${SOURCE}.spec_value zs ON zs.id=z.spec_value_id JOIN ${SOURCE}.spec_dimension zd ON zd.id=zs.dimension_id AND zd.code='SIZE' WHERE v.product_id=$1::uuid AND c.spec_value_id=$2::uuid AND z.spec_value_id=$3::uuid LIMIT 1`,[productId,colorId,sizeId])).rows[0]:null;
  if(existing)return {skuId:existing.id,sizeId,colorId,fitId,groupName,sizeName,created:false};
  const skuId=(await tx.query(`INSERT INTO variant_overlay(product_id,color_id,size_id,fit_id,size_name,size_code,group_name) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7) ON CONFLICT(product_id,color_id,size_id,fit_id) DO UPDATE SET size_name=excluded.size_name,size_code=excluded.size_code,group_name=excluded.group_name RETURNING id`,[productId,colorId,sizeId,fitId,sizeName,sizeCode,groupName])).rows[0].id;
  return {skuId,sizeId,colorId,fitId,groupName,sizeName,created:true};
 });
}
