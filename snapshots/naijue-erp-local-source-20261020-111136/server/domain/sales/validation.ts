import type {AuthorizedContext} from '../../security/service.js';
import {identifier, object} from '../../security/errors.js';
import {canonicalJson} from '../idempotency/index.js';
import {formatScaled, parseScaled} from '../transactions/decimal.js';
import {abs, allocateDiscount, discountPrice, fail, historicalMoney, lineAmount, maxPriceCents, money, quantity, returnBasis, safeCents} from './money.js';
import {importedSaleBody, saleReferences, type SaleReferences} from './references.js';

const record=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const payload=(l:Record<string,unknown>):Record<string,unknown>=>record(l['source_payload']);
const sourceId=(v:unknown):string=>{if(typeof v!=='string'||!v.trim()||v.length>256||v.includes('\0'))return fail('明细来源 ID 缺失或无效');return v;};
const same=(a:unknown,b:unknown):boolean=>canonicalJson(a??null)===canonicalJson(b??null);
const economicFields=['sku_id','warehouse_id','product_id','color_id','size_id','unit','unit_price','source_quantity','amount','gift','direction','original_line_id','linked_line_id'] as const;
function unchangedHistory(line:Record<string,unknown>,old:Record<string,unknown>):boolean {
  return economicFields.every(k=>same(line[k],old[k]))&&same(payload(line)['v2_reference_price_cents'],payload(old)['v2_reference_price_cents'])
    &&same(payload(line)['v2_pricing_rule'],payload(old)['v2_pricing_rule'])&&same(payload(line)['v2_discount_tenths'],payload(old)['v2_discount_tenths']);
}
const rows=(body:Record<string,unknown>|null,k:string):Record<string,unknown>[]=>Array.isArray(body?.[k])?(body[k] as unknown[]).map(object):[];

interface CalculatedLine {line:Record<string,unknown>; q:bigint; gross:bigint; price:bigint|null; historical:boolean; mergeKey:string}
function historicalContribution(line:Record<string,unknown>,q:bigint):bigint {
  let n:bigint;try{n=parseScaled(line['stock_quantity_contribution'],4);}catch{return fail('历史有效数量贡献缺失或无效','HISTORICAL_FACTS',409);}
  if(n>0n&&q>0n||n<0n&&q<0n)return fail('历史有效数量贡献与业务方向不一致','HISTORICAL_FACTS',409);
  return n;
}
function checkedLine(input:Record<string,unknown>,refs:SaleReferences,exchange:boolean,history:Record<string,unknown>|undefined,previous:Record<string,unknown>|undefined):CalculatedLine {
  const skuId=identifier(input['sku_id'],true).toLowerCase(),warehouseId=identifier(input['warehouse_id'],true).toLowerCase();
  if(history&&unchangedHistory(input,history)) {
    const q=parseScaled(history['source_quantity'],4),gross=historicalMoney(history['amount'],'行金额');
    if(!q||q>0n&&gross<0n||q<0n&&gross>0n)return fail('历史数量与金额方向不一致','HISTORICAL_FACTS',409);
    // Preserve source prices, amounts, names, contribution and precision verbatim.
    return {line:{...structuredClone(history),note:input['note']??history['note'],source_payload:{...payload(history),
      ...(payload(input)['v2_line_note']!==undefined?{v2_line_note:payload(input)['v2_line_note']}:{})}},q,gross,price:null,historical:true,mergeKey:''};
  }
  const sku=refs.skus.get(skuId);
  if(!sku||!sku.enabled||!sku.product_enabled)return fail('商品规格不存在或已停用','SPEC',409);
  for(const [field,current] of [['source_product_code',sku.product_code],['source_product_name',sku.product_name]] as const) {
    if(input[field]!==undefined&&input[field]!==current&&!(previous&&previous['sku_id']===input['sku_id']&&same(input[field],previous[field])))return fail('商品名称或款号快照与原身份不一致','SPEC');
  }
  for(const [field,expected] of [['product_id',sku.product_id],['color_id',sku.color_id],['size_id',sku.size_id]] as const) {
    if(input[field]!==undefined&&input[field]!==null&&(!expected||String(input[field]).toLowerCase()!==expected))return fail('商品/颜色/尺码与原 SKU 身份不一致','SPEC');
  }
  const q=quantity(input['source_quantity']);
  if(!q||abs(q)>999990000n)return fail('单行数量须大于零且不超过 99999');
  const precision=sku.unit==='件'?0:sku.quantity_scale;
  if(precision===null||!Number.isInteger(precision)||precision<0||precision>4||!sku.unit)return fail('计量单位或数量精度未确认','SPEC',409);
  if(q%(10n**BigInt(4-precision)))return fail('数量不符合此原 SKU 的计量精度');
  if(!exchange&&q<0n)return fail('普通销售数量必须为正');
  const direction=q<0n?'RETURN_IN':'SALE_OUT';
  if(input['direction']!==undefined&&input['direction']!==direction)return fail('数量与退入/出库方向不一致');
  if(exchange&&input['direction']===undefined)return fail('退换行须明确退入或换出方向');
  if(input['gift']!==undefined&&typeof input['gift']!=='boolean')return fail('赠品标记无效');
  const gift=input['gift']===true,price=money(input['unit_price'],'成交单价',true);
  if(price>maxPriceCents)return fail('成交单价不能超过 999999999.99');
  if(gift&&price!==0n)return fail('赠品成交单价必须为零');
  if(!gift&&price===0n&&input['zero_confirmed']!==true&&payload(input)['v2_zero_confirmed']!==true)return fail('普通零价销售须显式确认');
  const p=payload(input),rule=input['pricing_rule']??p['v2_pricing_rule']??'unit-price',tenths=input['discount_tenths']??p['v2_discount_tenths']??null;
  if(rule!=='unit-price'&&rule!=='discount')return fail('定价方式无效');
  let reference:bigint|null=null;
  if(input['reference_price']!==undefined&&input['reference_price']!==null)reference=money(input['reference_price'],'参考价',true);
  else if(p['v2_reference_price_cents']!==undefined&&p['v2_reference_price_cents']!==null) {
    if(typeof p['v2_reference_price_cents']!=='number'||!Number.isSafeInteger(p['v2_reference_price_cents'])||p['v2_reference_price_cents']<0)return fail('参考价快照无效');
    reference=BigInt(p['v2_reference_price_cents']);
  }
  if(reference!==null&&reference>maxPriceCents)return fail('参考价超过单价范围');
  if(rule==='discount'&&!gift&&(reference===null||discountPrice(reference,tenths)!==price))return fail('折扣成交价与参考价快照不一致');
  if(rule==='unit-price'&&tenths!==null)return fail('直接成交价不能携带折扣规则');
  if(!gift&&sku.minimum_price!==null&&sku.minimum_price!=='') {
    let minimum:bigint;try{minimum=parseScaled(sku.minimum_price,4,false);}catch{return fail('当前最低售价资料无效','SPEC',409);}
    if(price*100n<minimum)return fail('成交单价低于最低售价');
  }
  const gross=lineAmount(price,q);
  if(input['amount']!==undefined&&money(input['amount'],'行金额')!==gross)return fail('行金额与数量×成交单价不一致');
  const line={...input,source_id:sourceId(input['source_id']),sku_id:skuId,warehouse_id:warehouseId,product_id:sku.product_id,
    source_product_code:input['source_product_code']??sku.product_code,source_product_name:input['source_product_name']??sku.product_name,
    source_quantity:formatScaled(q,4),unit_price:formatScaled(price,2),amount:formatScaled(gross,2),unit:sku.unit,gift,direction,
    source_payload:{...p,v2_pricing_rule:rule,v2_discount_tenths:tenths,v2_reference_price_cents:reference===null?null:Number(reference)}};
  const lineage=record(input['source_lineage']),linked=input['original_line_id']??input['linked_line_id']??lineage['originalLine'];
  // Snapshots and provenance are part of equivalence. Linked lines keep their own IDs.
  const mergeKey=linked?`linked:${line.source_id}`:canonicalJson([skuId,warehouseId,direction,gift,price.toString(),rule,tenths,reference?.toString()??null,
    ['source_product_code','source_product_name','source_color_name','source_size_name'].map(k=>input[k]??null),
    Object.fromEntries(Object.entries(p).filter(([k])=>k!=='v2_line_note'&&k!=='v2_zero_confirmed')),lineage]);
  return {line,q,gross,price,historical:false,mergeKey};
}

function mergeLines(input:CalculatedLine[]):CalculatedLine[] {
  const result:CalculatedLine[]=[],byKey=new Map<string,CalculatedLine>();
  for(const row of input) {
    const old=row.historical?undefined:byKey.get(row.mergeKey);
    const q=(old?.q??0n)+row.q;
    // Rounding fractional quantities before merging can differ; retain those rows separately.
    if(old&&old.price!==null&&row.price!==null&&lineAmount(old.price,q)===old.gross+row.gross) {
      if(abs(q)>999990000n)return fail('同义行合并后数量超过 99999');
      old.q=q;old.gross+=row.gross;
      old.line['source_quantity']=formatScaled(q,4);old.line['amount']=formatScaled(old.gross,2);
      (old.line['merged_source_ids'] as string[]).push(String(row.line['source_id']));
      const notes=[payload(old.line)['v2_line_note'],payload(row.line)['v2_line_note']].filter(v=>typeof v==='string'&&v);
      old.line['source_payload']={...payload(old.line),v2_line_note:[...new Set(notes)].join('；')};
    } else {
      if(!row.historical)row.line['merged_source_ids']=[String(row.line['source_id'])];result.push(row);
      if(!row.historical&&!old)byKey.set(row.mergeKey,row);
    }
  }
  return result;
}

function settlements(input:Record<string,unknown>[],refs:SaleReferences,history:Record<string,unknown>[],previous:Record<string,unknown>[]):{lines:Record<string,unknown>[];sum:bigint} {
  const ids=new Set<string>();let sum=0n;
  const lines=input.map(value=>{
    const id=sourceId(value['source_id']);if(ids.has(id))return fail('结算来源 ID 重复');ids.add(id);
    const old=history.find(x=>x['source_id']===id);
    const unchanged=old&&['payment_method_id','fund_account_id','amount','direction','settlement_id'].every(k=>same(value[k],old[k]));
    const amount=unchanged?historicalMoney(old['amount'],'结算金额'):money(value['amount'],'结算金额');
    const direction=amount>0n?'receipt':amount<0n?'refund':'zero';
    if(value['direction']!==direction)return fail('收退款方向与金额符号不一致','FUNDS');
    sum=safeCents(sum+amount);
    if(unchanged)return structuredClone(old);
    const method=refs.masters.get('payments|'+identifier(value['payment_method_id']));
    const account=refs.masters.get('fundAccounts|'+identifier(value['fund_account_id']));
    if(!method||method.body['enabled']!==true||!account||account.body['enabled']!==true||account.body['primaryPaymentMethodId']!==method.id)return fail('结算须选择正常且方式匹配的资金账户','FUNDS');
    // Hall affiliations are recommendations, not candidate restrictions.
    const prior=previous.find(x=>x['source_id']===id&&x['payment_method_id']===method.id&&x['fund_account_id']===account.id);
    return {...value,source_id:id,payment_method_id:method.id,fund_account_id:account.id,amount:formatScaled(amount,2),direction,
      source_payment_method_name:prior?.['source_payment_method_name']??method.body['name'],source_fund_account_name:prior?.['source_fund_account_name']??account.body['name']};
  });
  if(input.length>3&&(!history.length||input.some(x=>!history.some(h=>h['source_id']===x['source_id']&&['payment_method_id','fund_account_id','amount','direction','settlement_id'].every(k=>same(x[k],h[k]))))))return fail('新录结算最多三笔；历史全部笔数仅按可信原事实保留','FUNDS');
  return {lines,sum};
}

/** Recomputes new economics; only DB-bound original imported lines may retain source precision. */
export async function prepareSaleRevision(context:AuthorizedContext,id:string,body:Record<string,unknown>,approving:boolean,previous:Record<string,unknown>|null=null,originalImported=false):Promise<Record<string,unknown>> {
  const header=object(body['header']),input=rows(body,'lines'),funds=rows(body,'fundsRecords');
  const imported=await importedSaleBody(context,id),history=rows(imported,'lines'),oldFunds=rows(imported,'fundsRecords');
  if(input.length>1000&&(!imported||input.length!==history.length||input.some(l=>!history.some(h=>h['source_id']===l['source_id']&&unchangedHistory(l,h)))))return fail('新单最多 1000 行；历史原明细不按新上限裁剪');
  if(approving&&!input.length)return fail('空单据不能审核');
  const ids=new Set<string>();
  for(const line of input){const key=sourceId(line['source_id']);if(ids.has(key))return fail('销货明细来源 ID 重复');ids.add(key);}
  const refs=await saleReferences(context,input.map(l=>identifier(l['sku_id'],true)));
  const businessType=header['business_type']??(originalImported&&input.some(l=>parseScaled(l['source_quantity'],4)<0n)?'RETURN_EXCHANGE':'SALE');
  if(!['SALE','RETURN_EXCHANGE'].includes(String(businessType)))return fail('销货业务类型无效');
  const exchange=businessType==='RETURN_EXCHANGE';
  const priorLines=rows(previous,'lines');
  const calculated=mergeLines(input.map(l=>checkedLine(l,refs,exchange,history.find(h=>h['source_id']===l['source_id']),priorLines.find(h=>h['source_id']===l['source_id']))));
  for(const row of calculated)if(!row.historical){
    const old=priorLines.find(l=>l['source_id']===row.line['source_id']&&economicFields.every(k=>same(l[k],row.line[k])));
    if(old&&Array.isArray(old['merged_source_ids']))row.line['merged_source_ids']=[...new Set([...(old['merged_source_ids'] as string[]),...(row.line['merged_source_ids'] as string[])])];
  }
  const historicalUnchanged=!!imported&&calculated.every(l=>l.historical)&&calculated.length===history.length
    &&historicalMoney(header['adjustment']??record(header['source_payload'])['rounding']??'0','优惠金额')===historicalMoney(record(imported['header'])['adjustment']??record(record(imported['header'])['source_payload'])['rounding']??'0','优惠金额');
  const adjustmentRaw=header['adjustment']??record(header['source_payload'])['rounding']??'0';
  const adjustment=historicalUnchanged?historicalMoney(adjustmentRaw,'优惠金额'):money(adjustmentRaw,'整单优惠',true);
  if(exchange&&adjustment!==0n)return fail('独立退换不能使用整单优惠');
  const gross=safeCents(calculated.reduce((a,l)=>a+l.gross,0n)),due=safeCents(gross-adjustment);
  const shares=exchange?calculated.map(()=>0n):allocateDiscount(calculated.map(l=>l.gross),adjustment);
  const pay=settlements(funds,refs,oldFunds,rows(previous,'fundsRecords'));
  const difference=safeCents(due-pay.sum);
  if(approving&&difference!==0n)return fail(`结算未配平，应结 ${formatScaled(due,2)}，实录 ${formatScaled(pay.sum,2)}，差额 ${formatScaled(difference,2)}`,'FUNDS');
  const lines=calculated.map((item,i)=>{
    const discount=shares[i]!,net=item.gross-discount;
    if(item.historical) {
      // A known source basis wins; an absent one is a separate derived aid, never source rewrite.
      return item.line;
    }
    return {...item.line,gross_cents:item.gross.toString(),discount_cents:discount.toString(),net_cents:net.toString(),return_basis:returnBasis(net,item.q)};
  });
  const oldPayload=record(record(previous?.['header'])['source_payload']);
  const newHeader={...header,business_type:businessType,adjustment:historicalUnchanged?adjustmentRaw:formatScaled(adjustment,2),
    source_payload:{...record(header['source_payload']),...(oldPayload['v2_creator']!==undefined?{v2_creator:oldPayload['v2_creator']}:{})}};
  return {...body,header:newHeader,lines,fundsRecords:pay.lines,salesFacts:{version:1,calculation:'SERVER_FIXED_POINT',
    grossCents:gross.toString(),adjustmentCents:adjustment.toString(),dueCents:due.toString(),settlementCents:pay.sum.toString(),differenceCents:difference.toString(),
    inputLines:structuredClone(input),inputFundsRecords:structuredClone(funds),
    stockEffects:calculated.map(l=>({skuId:l.line['sku_id'],warehouseId:l.line['warehouse_id'],
      quantity:formatScaled(l.historical?historicalContribution(l.line,l.q): -l.q,4)})),
    allocations:calculated.map((l,i)=>({sourceId:l.line['source_id'],grossCents:l.gross.toString(),discountCents:shares[i]!.toString(),netCents:(l.gross-shares[i]!).toString(),
      historicalSourcePreserved:l.historical,derivedReturnBasis:returnBasis(l.gross-shares[i]!,l.q)}))}};
}
