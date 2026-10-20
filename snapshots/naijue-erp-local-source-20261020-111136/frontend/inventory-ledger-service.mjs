import {inventoryQuantity} from './inventory-unit-view.mjs?v=t23-trace-20261003-r02';

const queryOnly={mode:'query'};
const sourceLabel=row=>row.source?.sourceNumbers?.join(' / ')||row.source?.sourceDocumentId||row.sourceTarget?.documentId||row.source?.eventId||row.source?.runId||'来源未知';
function adapt(row,unit){
  if(row.unit!==undefined&&row.unit!==unit)throw Error('流水计量单位与查询单元不一致');
  const type=row.kind==='COUNTED_HISTORY'||row.kind==='SOURCE_HISTORY'?'已计入历史':row.kind==='HISTORY_ACCUMULATION'?'历史累计基准':
    row.sourceTarget?.documentType==='CORRECTION'?'库存校正':row.sourceTarget?.documentType==='SALE'?'销货流水':
    row.sourceTarget?.documentType==='TRANSFER'?(Number(row.stockDelta)>0?'调拨入':'调拨出'):'库存变动';
  // Keep the raw source evidence and exact decimals; no 2-D fallback or fabricated actor.
  return {...row,unit,type,delta:row.stockDelta,historical_only:row.historicalOnly,
    phase:row.kind==='HISTORY_ACCUMULATION'?0:row.historicalOnly?-1:1,
    sourceEvidence:row.source,source:sourceLabel(row),user:row.actorId||row.source?.createdBy||'未知'};
}
export async function queryCellLedger(api,cell,page=1,filters={}){
  if(!cell.warehouseId||!cell.skuId||!cell.unit)throw Error('请按仓库、原 SKU 和已核实单位查看流水');
  const local=!!(filters.type||filters.source),size=local?200:20;
  const params=new URLSearchParams({warehouseId:cell.warehouseId,skuId:cell.skuId,unit:cell.unit,page:String(local?1:page),size:String(size)});
  for(const key of ['start','end'])if(filters[key])params.set(key,filters[key]);
  const read=async()=>{
    const result=await api('/inventory/ledger?'+params,undefined,queryOnly),balance=result.balance?.items;
    if(!Array.isArray(result.items)||!Array.isArray(balance)||balance.length!==1||balance[0].warehouseId!==cell.warehouseId||balance[0].skuId!==cell.skuId||balance[0].unit!==cell.unit||balance[0].unitConflict)throw Error('流水库存身份或单位尚未核实');
    inventoryQuantity(balance[0].quantity);
    return {...result,items:result.items.map(row=>adapt(row,cell.unit)),cell:balance[0]};
  };
  const first=await read();let rows=first.items;
  if(local){
    for(let next=2;next<=Math.ceil(first.total/size);next++){params.set('page',String(next));rows.push(...(await read()).items);}
    const types=[...new Set(rows.map(row=>row.type))];
    rows=rows.filter(row=>(!filters.type||row.type===filters.type)&&(!filters.source||row.source.toLowerCase().includes(filters.source.toLowerCase())));
    return {...first,items:rows.slice((page-1)*20,page*20),total:rows.length,page,size:20,types};
  }
  return {...first,types:[...new Set(rows.map(row=>row.type))]};
}
export async function readLedgerSource(api,entry){
  const target=entry.sourceTarget;
  if(!target?.available)throw Error('来源版本尚未核实或无权查看');
  const path=String(target.url||'');
  if(!/^\/api\/inventory\/(?:postings\/[0-9a-f-]{36}|documents\/[0-9a-f-]{36}\/revisions\/[1-9]\d*)$/i.test(path))throw Error('来源版本地址未核实');
  const result=await api(path.slice(4),undefined,queryOnly),document=result.document||result;
  if(document.documentId!==target.documentId||document.revision!==target.revision||target.postingId&&result.postingId!==target.postingId)throw Error('来源版本与流水绑定不一致');
  return {document,trace:result.document?result:null};
}
