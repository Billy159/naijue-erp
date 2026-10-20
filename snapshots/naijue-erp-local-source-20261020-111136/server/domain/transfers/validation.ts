import type {AuthorizedContext} from '../../security/service.js';
import {identifier,object,SecurityError} from '../../security/errors.js';
import {canonicalJson} from '../idempotency/index.js';
import {parseScaled} from '../transactions/decimal.js';

const fail = (message:string):never => {throw new SecurityError('VALIDATION',400,message);};
/** New transfer input is checked on the command connection, inside idempotency.
 * Exact imported rows keep their original precision and facts; they are never clipped. */
export async function validateTransfer(context:AuthorizedContext,documentId:string,body:Record<string,unknown>,priorBody:Record<string,unknown>|null=null):Promise<void> {
  const {session,repo}=context,header=object(body['header']),lines=body['lines'];
  const from=identifier(header['source_from_warehouse_id'],true),to=identifier(header['source_to_warehouse_id'],true);
  if(from===to||!Array.isArray(lines)||!lines.length) return fail('调拨需要不同的两仓及正数量明细');
  if(!Array.isArray(body['fundsRecords'])||body['fundsRecords'].length) return fail('调拨不能附带收退款记录');
  const original=(await session.query<{body:Record<string,unknown>}>(`SELECT body FROM ${repo.runtime}.revision
    WHERE document_id=$1::uuid AND revision=1 AND original_imported`,[documentId])).rows[0];
  const historical=Array.isArray(original?.body['lines'])?original.body['lines']:[];
  // Only a trusted current revision passed by save can retain disabled usage.
  // Spend its original SKU/location/source allowance across all rows, including unnamed splits.
  const usageKey=(line:Record<string,unknown>):string=>canonicalJson([line['sku_id'],line['from_warehouse_id'],line['to_warehouse_id'],line['source_id']??null]);
  const remaining=new Map<string,bigint>();
  for(const value of Array.isArray(priorBody?.['lines'])?priorBody['lines']:[]){
    const prior=object(value),key=usageKey(prior);
    remaining.set(key,(remaining.get(key)??0n)+parseScaled(prior['source_quantity'],4));
  }
  const ids=new Set<string>();
  for(const value of lines){
    const line=object(value),sku=identifier(line['sku_id'],true),q=parseScaled(line['source_quantity'],4);
    if(q<=0n) return fail('调拨数量必须为正数');
    if(line['from_warehouse_id']!==from||line['to_warehouse_id']!==to) return fail('明细两侧仓库必须与表头一致');
    if(line['source_id']!==undefined){
      if(typeof line['source_id']!=='string'||!line['source_id'].trim()||line['source_id'].length>256||ids.has(line['source_id'])) return fail('调拨明细来源重复或无效');
      ids.add(line['source_id']);
    }
    const unchanged=historical.some(old=>canonicalJson(old)===canonicalJson(line));
    const row=(await session.query<{product_id:string;unit:string|null;scale:number|null;enabled:boolean}>(`SELECT v.product_id,
      coalesce(u.name,po.body->>'unit') unit,u.quantity_scale scale,
      v.enabled AND coalesce((pp.body->>'enabled')::boolean,p.enabled,true) AND NOT coalesce(po.deleted,false)
        AND NOT coalesce(pp.body->'disabledSkuIds' ? v.id::text,false) enabled
      FROM (SELECT id,product_id,enabled FROM ${repo.source}.variant UNION ALL SELECT id,product_id,true FROM ${repo.runtime}.variant_overlay) v
      LEFT JOIN ${repo.source}.product p ON p.id=v.product_id
      LEFT JOIN ${repo.runtime}.product_overlay po ON po.id=v.product_id
      LEFT JOIN ${repo.source}.unit u ON u.id=coalesce(p.unit_id,(po.body->>'unitId')::uuid)
      LEFT JOIN ${repo.runtime}.product_profile_overlay pp ON pp.product_id=v.product_id WHERE v.id=$1::uuid`,[sku])).rows[0];
    if(!row||line['product_id']!==undefined&&line['product_id']!==row.product_id) return fail('商品与原 SKU 身份不一致或不存在');
    if(!row.enabled){
      const key=usageKey(line),available=remaining.get(key)??0n;
      if(priorBody? q>available:!unchanged)throw new SecurityError('REFERENCE_CONFLICT',409,'停用商品或规格不可新增调拨');
      if(priorBody)remaining.set(key,available-q);
    }
    if(!unchanged){
      if(q>999990000n) return fail('新调拨单行数量不能超过99999');
      const scale=row.unit==='件'?0:row.scale;
      if(!row.unit||scale===null) return fail('计量单位或计量精度尚未核实');
      if(q%10n**BigInt(4-scale)!==0n) return fail('数量不符合商品计量精度');
      if(typeof line['unit']==='string'&&line['unit']&&line['unit']!==row.unit) return fail('调拨单位与商品计量单位不一致');
      line['unit']=row.unit;
    }
  }
  if(lines.length>1000&&!lines.every(value=>historical.some(old=>canonicalJson(old)===canonicalJson(value)))) return fail('新调拨最多1000行');
}
