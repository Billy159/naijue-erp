import { useState } from 'react';
import type { ProductEditorCapability } from '../../../../src/products/product-editor-contracts.ts';
import type { Selection } from '../../../../src/inventory/contracts.ts';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import type { ProductStockOverviewQuery,ProductStockOverviewResult } from '../../../../../../packages/application/src/product-details-query-ports.ts';
import { HttpQueryError } from '../../../../src/transport/http-query.ts';
import { formatQuantity } from '../../../../src/inventory/model.ts';
import { entityId } from '../../../../../../packages/domain/src/values.ts';
import { useProductRead,ReadNotice } from './read.tsx';
export function EditorStock(p:{active:boolean;scope:ReadScope;product:Selection;reader:ProductEditorCapability['stock'];denied:(e:HttpQueryError)=>void;open:((product:Selection)=>Promise<boolean>)|undefined}){
 const [mode,setMode]=useState<'NON_ZERO'|'ALL'>('NON_ZERO');const parameters:ProductStockOverviewQuery={productId:entityId('product',p.product.id),warehouseMode:mode};const {query,snapshot}=useProductRead<ProductStockOverviewQuery,ProductStockOverviewResult|null>(p.scope,p.reader?.readOverview,parameters,p.active,p.denied),data=snapshot.success?.data;
 if(!p.active)return null;
 return <><ReadNotice phase={snapshot.phase} retry={()=>void query.run(parameters)} cancel={()=>query.cancel()}/>{data&&<><div className="pc-stock-head"><strong>{data.coverage==='ALL_BUSINESS_WAREHOUSES'?'总库存':'当前可查看库存'}：{data.total.state==='KNOWN'?formatQuantity(data.total.quantity!):'未知'}</strong><div><button type="button" className="btn ghost" onClick={()=>{const next=data.warehouseMode==='ALL'?'NON_ZERO':'ALL';setMode(next);void query.run({...parameters,warehouseMode:next});}}>{data.warehouseMode==='ALL'?'仅看有库存':'查看全部仓库'}</button>{p.open&&<button type="button" className="btn ghost" onClick={()=>void p.open!(p.product)}>查看详细库存</button>}</div></div><table className="pc-stock-overview"><thead><tr><th>仓库</th><th className="num">现存量</th></tr></thead><tbody>{data.items.map(row=><tr key={row.warehouseId}><td>{row.warehouseName}</td><td className="num">{row.state==='KNOWN'?formatQuantity(row.quantity!):'未知'}</td></tr>)}</tbody></table>{!data.items.length&&<div className="empty">{data.counts.unknownWarehouses?'存在未知库存，尚不能确认全仓为 0':'各仓库当前库存为 0'}</div>}</>}{snapshot.phase==='success'&&!data&&<div className="empty">商品库存资料未取得</div>}</>;
}
