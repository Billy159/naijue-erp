import type {AuthorizedContext} from '../../security/service.js';
import {authorizeDocument} from '../../security/policies.js';
import {scopeFromBody} from '../../security/repository.js';
import {canonicalJson} from '../idempotency/index.js';
import {parseScaled} from '../transactions/decimal.js';
import {abs, fail, historicalMoney} from './money.js';

type Body = Record<string,unknown>;
interface Sale {id:string;body:Body;origin:Body|null;active:boolean;baseline:boolean;source_identity:Body|null}
const record=(v:unknown):Body=>v&&typeof v==='object'&&!Array.isArray(v)?v as Body:{};
const rows=(b:Body|null,k='lines'):Body[]=>Array.isArray(b?.[k])?(b[k] as unknown[]).map(record):[];
const header=(b:Body|null):Body=>record(b?.['header']);
const text=(v:unknown):string|null=>typeof v==='string'&&v.length>0?v:null;
const equal=(a:unknown,b:unknown):boolean=>canonicalJson(a??null)===canonicalJson(b??null);
const conflict=(message:string):never=>fail(message,'LINK',409);
const integer=(v:unknown):bigint=>{try{if(!/^-?\d+$/.test(String(v)))return conflict('历史分摊整数依据无效');return BigInt(String(v));}catch{return conflict('历史分摊整数依据无效');}};
const docLink=(b:Body|null):string|null=>text(header(b)['original_document_id']??header(b)['original_sale_id']??record(header(b)['source_payload'])['originalSaleId']);
export const originalLine=(l:Body):string|null=>text(l['original_line_id']??l['linked_line_id']??l['originalLineId']??record(l['source_lineage'])['originalLine']);
const aliases=(l:Body):string[]=>[l['source_id'],l['source_line_id'],record(l['source_lineage'])['sourceLine']].map(text).filter((v):v is string=>v!==null);
const q=(l:Body):bigint=>{try{return parseScaled(l['source_quantity'],4);}catch{return conflict('历史关联数量缺失或无效');}};
const sourceIds=(sale:Sale):string[]=>[sale.id,header(sale.origin)['source_document_id'],record(sale.source_identity)['source_document_id'],record(sale.source_identity)['documentId']].map(text).filter((v):v is string=>v!==null);
function checkLinkShape(b:Body):void{
  const h=header(b),values=[h['original_document_id'],h['original_sale_id'],record(h['source_payload'])['originalSaleId'],
    ...rows(b).flatMap(l=>[l['original_line_id'],l['linked_line_id'],l['originalLineId'],record(l['source_lineage'])['originalLine']])];
  if(values.some(v=>v!==undefined&&v!==null&&v!==''&&(typeof v!=='string'||!v.trim()||v.length>256||v.includes('\0'))))
    return conflict('原单或原明细关联身份无效');
}

function relationFacts(b:Body|null):Body {
  const h=header(b);
  return {document:docLink(b),documentFields:[h['original_document_id']??null,h['original_sale_id']??null,record(h['source_payload'])['originalSaleId']??null],links:b?.['links']??null,returnRecords:b?.['returnRecords']??null,
    lines:rows(b).filter(l=>originalLine(l)).map(l=>({id:l['source_id'],original:originalLine(l),fields:[l['original_line_id']??null,l['linked_line_id']??null,l['originalLineId']??null],lineage:l['source_lineage']??null}))};
}
function memoFree(b:Body):Body {
  const copy=structuredClone(b);delete copy['salesFacts'];
  const h=header(copy);delete h['note'];
  for(const l of rows(copy)){delete l['note'];const p=record(l['source_payload']);delete p['v2_line_note'];}
  return copy;
}
export function saleMemoRevision(previous:Body,next:Body):Body {
  const result=structuredClone(previous);header(result)['note']=header(next)['note'];
  for(const l of rows(result)){
    const input=rows(next).find(x=>x['source_id']===l['source_id'])!;
    if(input['note']!==undefined)l['note']=input['note'];
    if(record(input['source_payload'])['v2_line_note']!==undefined)record(l['source_payload'])['v2_line_note']=record(input['source_payload'])['v2_line_note'];
  }
  return result;
}

/** A cumulative prefix makes partial returns consume the original cent remainder once. */
export function linkedReturnCents(line:Body,start:bigint,count:bigint):bigint {
  const total=q(line),basis=record(line['return_basis']??line['returnBasis']);
  if(total<=0n||start<0n||count<=0n||start+count>total)return conflict('本次及累计退回数量超过原销售可退量');
  const net=historicalMoney(line['amount'],'原销售金额')-(line['discount_cents']===undefined?0n:integer(line['discount_cents']));
  // Imported lines must carry their actual allocated basis; do not reconstruct a lost discount.
  const basisNet=basis['netCents']??line['net_cents']??line['netCents'];
  if(!Object.keys(basis).length||basisNet===undefined)return conflict('原销售成交或优惠分摊依据缺失，拒绝推算');
  const n=integer(basisNet);
  if(n<0n||line['net_cents']!==undefined&&n!==integer(line['net_cents'])||basis['quantityTenThousandths']!==undefined&&integer(basis['quantityTenThousandths'])!==total
    ||basis['quantity']!==undefined&&parseScaled(basis['quantity'],4)!==total)
    return conflict('原销售分摊依据与数量或净额不一致');
  if(line['gross_cents']!==undefined&&n!==net)return conflict('原销售成交金额与优惠分摊不一致');
  if(total%10000n===0n&&basis['unitCents']!==undefined&&basis['extraCentUnits']!==undefined){
    const unit=integer(basis['unitCents']),extra=integer(basis['extraCentUnits']),pieces=total/10000n;
    if(unit<0n||extra<0n||extra>=pieces||unit*pieces+extra!==n||start%10000n||count%10000n)return conflict('原销售逐件余分依据无效');
    const before=start/10000n,end=(start+count)/10000n;
    return count/10000n*unit+(end<extra?end:extra)-(before<extra?before:extra);
  }
  const prefix=(x:bigint):bigint=>(n*x+total/2n)/total;
  return prefix(start+count)-prefix(start);
}

/** New independent returns have one warehouse per side. Legacy originals stay verbatim. */
export function validateReturnWarehouses(body:Body):void {
  const h=header(body);
  if(h['business_type']!=='RETURN_EXCHANGE')return;
  for(const [direction,field] of [['RETURN_IN','return_warehouse_id'],['SALE_OUT','outgoing_warehouse_id']] as const){
    const side=rows(body).filter(l=>l['direction']===direction);
    const ids=new Set(side.map(l=>l['warehouse_id']));
    if(ids.size>1||side.length&&h[field]!==undefined&&[...ids][0]!==h[field])return conflict('退入仓或换出仓与该侧明细不一致');
  }
}

async function loadSales(context:AuthorizedContext,ids?:string[]):Promise<Sale[]> {
  const {session,repo}=context;
  return (await session.query<Sale>(`SELECT d.id::text,r.body,
    (SELECT ir.body FROM ${repo.runtime}.revision ir WHERE ir.document_id=d.id AND ir.original_imported ORDER BY ir.revision LIMIT 1) origin,
    d.current_effect_active active,d.baseline_was_included baseline,d.source_identity
    FROM ${repo.runtime}.document d JOIN ${repo.runtime}.revision r ON r.document_id=d.id AND r.revision=d.current_revision
    WHERE d.document_type='SALE' ${ids?'AND d.id=ANY($1::uuid[])':''} ORDER BY d.id`,ids?[ids]:[])).rows;
}
async function lockOriginal(context:AuthorizedContext,sale:Sale):Promise<void>{
  await context.session.query(`SELECT id FROM ${context.repo.runtime}.document WHERE id=$1::uuid FOR UPDATE`,[sale.id]);
  await authorizeDocument(context.actor,scopeFromBody('SALE',sale.body),'sales.detail',context.repo);
}

async function sourceDependencies(context:AuthorizedContext,sale:Sale):Promise<{legacy:boolean;lines:Body[];references:Body[]}> {
  const {session,repo}=context,ids=sourceIds(sale),lineIds=rows(sale.origin??sale.body).flatMap(aliases);
  const docs=(await session.query<{id:string;type:string}>(`SELECT id::text,type::text FROM ${repo.source}.business_document WHERE id::text=ANY($1::text[])`,[ids])).rows;
  const lines=(await session.query<Body>(`SELECT id::text,document_id::text,historical_returned_quantity::text FROM ${repo.source}.document_line
    WHERE document_id::text=ANY($1::text[]) OR id::text=ANY($2::text[])`,[ids,lineIds])).rows;
  const references=(await session.query<Body>(`SELECT ref.original_sale_line_id::text original_line_id,rl.id::text return_line_id,rl.document_id::text return_document_id,
      rl.quantity::text quantity,d.status::text status FROM ${repo.source}.return_line_reference ref
    JOIN ${repo.source}.document_line rl ON rl.id=ref.return_line_id JOIN ${repo.source}.business_document d ON d.id=rl.document_id
    WHERE ref.original_sale_line_id::text=ANY($1::text[]) OR ref.original_sale_line_id IN
      (SELECT id FROM ${repo.source}.document_line WHERE document_id::text=ANY($2::text[]))`,[lineIds,ids])).rows;
  const documentRefs=(await session.query<Body>(`SELECT id::text FROM ${repo.source}.business_document WHERE original_document_id::text=ANY($1::text[])`,[ids])).rows;
  return {legacy:docs.some(d=>d.type==='RETURN_EXCHANGE'),lines,references:[...references,...documentRefs]};
}
function embeddedCount(sale:Sale,line:Body):bigint {
  let result=0n;
  for(const link of rows(sale.origin,'links'))if(aliases(line).includes(String(link['lineId']??link['original_line_id']))) {
    try{result+=parseScaled(link['returnedQuantity']??link['returned_quantity'],4);}catch{return conflict('历史累计退回依据缺失或无效');}
  }
  return result;
}

/** Called under the all-sales association lock, on the same transaction as revision and posting. */
export async function protectSaleAssociations(context:AuthorizedContext,id:string,operation:string,proposed?:Body):Promise<boolean> {
  if(proposed)checkLinkShape(proposed);
  const all=await loadSales(context),sale=all.find(d=>d.id===id);
  if(!sale){
    if((await context.session.query(`SELECT id FROM ${context.repo.source}.business_document WHERE id=$1::uuid`,[id])).rows.length)
      return conflict('来源单据身份已存在，不能用新建覆盖其历史身份');
    if(proposed&&(docLink(proposed)||rows(proposed).some(originalLine)||rows(proposed,'links').length||rows(proposed,'returnRecords').length))
      return fail('新退换请使用独立销货单；原单专用写入口只读','HISTORICAL_ONLY',409);
    return false;
  }
  const source=await sourceDependencies(context,sale);
  if(source.legacy||record(header(sale.origin)['source_payload'])['legacy_immediate']===true)
    return fail('旧即时生效退换记录仅供查询；请新增独立销货单','HISTORICAL_ONLY',409);
  const next=proposed??sale.body;
  checkLinkShape(next);
  if(!equal(relationFacts(next),relationFacts(sale.body)))return conflict('历史原单和原明细关联不可新增、移除或改绑');
  // The database-bound imported revision is the only authority for historical associations.
  if(!equal(relationFacts(sale.body),relationFacts(sale.origin))) {
    const f=relationFacts(sale.body);
    if(f['document']||rows(sale.body,'links').length||rows(sale.body,'returnRecords').length||rows(sale.body).some(originalLine))return conflict('运行态关联缺少可信原导入依据');
  }
  const ids=sourceIds(sale),lineIds=rows(sale.origin??sale.body).flatMap(aliases);
  const dependents=all.filter(d=>d.id!==id&&(ids.includes(docLink(d.origin??d.body)??'')||!docLink(d.origin??d.body)&&rows(d.origin??d.body).some(l=>lineIds.includes(originalLine(l)??''))));
  const protectedOriginal=source.references.length>0||source.lines.some(l=>parseScaled(l['historical_returned_quantity'],4)>0n)
    ||rows(sale.origin,'links').length>0||rows(sale.origin,'returnRecords').length>0||dependents.length>0;
  if(protectedOriginal){
    if(operation==='unapprove'||operation==='delete')return conflict('原销售已有后续退换关联，不能弃审或作废');
    if(proposed&&!equal(memoFree(proposed),memoFree(sale.body)))return conflict('后续退换依赖原规格、数量、成交价、仓库和优惠分摊；仅可修改备注');
  }
  if(!['save','approve'].includes(operation))return false;
  if(docLink(next)&&!rows(next).some(originalLine))return conflict('历史原单关联缺少逐行原明细依据，不能审核或修改业务');
  const grouped=new Map<string,{original:Sale;line:Body;rows:Body[]}>();
  for(const l of rows(next)){
    const pointer=originalLine(l);if(!pointer)continue;
    if(q(l)>=0n)return conflict('历史原销售关联只能对应退入行');
    const docId=docLink(next),matches=all.flatMap(d=>d.id===id||docId&&!sourceIds(d).includes(docId)?[]:rows(d.body).filter(x=>aliases(x).includes(pointer)).map(line=>({original:d,line})));
    if(matches.length!==1)return conflict('原销售或原明细缺失、歧义或已被修改');
    const match=matches[0]!;if(q(match.line)<=0n)return conflict('关联目标不是原销售出库明细');
    const key=match.original.id+'|'+String(match.line['source_id']),group=grouped.get(key)??{...match,rows:[]};group.rows.push(l);grouped.set(key,group);
  }
  for(const group of [...grouped.values()].sort((a,b)=>a.original.id.localeCompare(b.original.id))){
    await lockOriginal(context,group.original);
    if(operation==='approve'&&!group.original.active)return conflict('原销售当前未生效，不能审核后续关联退回');
    const keys=aliases(group.line),deps=await sourceDependencies(context,group.original);
    let baseline=embeddedCount(group.original,group.line);
    for(const l of deps.lines)if(keys.includes(String(l['id'])))baseline=baseline>parseScaled(l['historical_returned_quantity'],4)?baseline:parseScaled(l['historical_returned_quantity'],4);
    const sourceSum=deps.references.filter(r=>keys.includes(String(r['original_line_id']))&&['APPROVED','COMPLETED'].includes(String(r['status'])))
      .reduce((n,l)=>n+parseScaled(l['quantity'],4),0n);baseline=baseline>sourceSum?baseline:sourceSum;
    let trackedBaseline=0n,active=0n;
    for(const other of all){
      const matches=(b:Body|null):Body[]=>rows(b).filter(l=>keys.includes(originalLine(l)??'')&&(!docLink(b)||sourceIds(group.original).includes(docLink(b)!)));
      // Source references and a runtime copy describe the same event even when the copy
      // is outside the opening snapshot. Replace that source count with its current effect.
      if(other.baseline)trackedBaseline+=matches(other.origin).reduce((n,l)=>n+abs(q(l)),0n);
      else trackedBaseline+=deps.references.filter(ref=>keys.includes(String(ref['original_line_id']))&&sourceIds(other).includes(String(ref['return_document_id']))
        &&['APPROVED','COMPLETED'].includes(String(ref['status']))).reduce((n,ref)=>n+parseScaled(ref['quantity'],4),0n);
      if(other.id!==id&&other.active)active+=matches(other.body).reduce((n,l)=>n+abs(q(l)),0n);
    }
    baseline=baseline>trackedBaseline?baseline:trackedBaseline;
    let used=baseline-trackedBaseline+active;
    const requested=group.rows.reduce((n,l)=>n+abs(q(l)),0n);
    if(used<0n||used+requested>q(group.line))return conflict('重复行合计及累计已退量超过原销售可退数量');
    for(const l of group.rows){
      if(l['sku_id']!==group.line['sku_id']||!!l['gift']!==!!group.line['gift']||parseScaled(l['unit_price'],4)!==parseScaled(group.line['unit_price'],4))
        return conflict('历史退回的原规格、赠品或成交价不一致');
      const refund=linkedReturnCents(group.line,used,abs(q(l)));
      if(historicalMoney(l['amount'],'关联退回金额')!==-refund)return conflict('历史退回金额与原成交及累计余分依据冲突');
      used+=abs(q(l));
    }
  }
  return protectedOriginal&&operation==='save'&&proposed!==undefined;
}

export async function saleHasAssociations(context:AuthorizedContext,id:string):Promise<boolean>{
  const all=await loadSales(context),sale=all.find(d=>d.id===id);if(!sale)return false;
  const source=await sourceDependencies(context,sale),ids=sourceIds(sale),lineIds=rows(sale.origin??sale.body).flatMap(aliases);
  return source.references.length>0||source.lines.some(l=>parseScaled(l['historical_returned_quantity'],4)>0n)
    ||rows(sale.origin,'links').length>0||rows(sale.origin,'returnRecords').length>0
    ||all.some(d=>d.id!==id&&(ids.includes(docLink(d.origin??d.body)??'')||!docLink(d.origin??d.body)&&rows(d.origin??d.body).some(l=>lineIds.includes(originalLine(l)??''))));
}
