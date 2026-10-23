import { parseProductStockOverviewQuery } from '../../../../packages/application/src/product-details-query-validation.ts';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { UIButton } from '../components/standard-controls.tsx';
import { StandardReadTable } from '../components/standard-read-table.tsx';
import type { ProductWarehouseStockItem, ProductWarehouseStockPage, ProductStockOverviewQuery, ProductStockOverviewResult } from '../../../../packages/application/src/product-details-query-ports.ts';
import { productStockResponse, productStockOverviewResponse } from './product-page-validation.ts';
import { ProductPagedRead, type ProductPageTabProps } from './product-page-view.tsx';
import { LatestQuery } from '../loading/latest-query.ts';
import { useProductPanelActive, useProductQueryActivity, ProductReadState } from '../inventory/product-tab-state.tsx';
import { formatQuantity } from '../inventory/model.ts';

const states = { UNKNOWN: '未知', MISSING: '缺少库存记录', UNMAPPED: '未映射', READ_FAILED: '读取失败' } as const;
type StockRow = ProductWarehouseStockItem & { readonly id: string };
export function View({ scope, reader, openInventory, navigationDisabled }: ProductPageTabProps) {
  const active=useProductPanelActive();
  const [navigating,setNavigating]=useState(false),[navigationError,setNavigationError]=useState('');
  const navigate=async()=>{if(!active||!scope.active||navigationDisabled||navigating||!openInventory)return;setNavigating(true);setNavigationError('');try{const moved=await openInventory();if(scope.active&&!moved)setNavigationError('暂未离开商品页，请确认未保存资料后重试。');}catch{if(scope.active)setNavigationError('库存详情暂不可打开，请重试。');}finally{if(scope.active)setNavigating(false);}};
  const navigation=<UIButton variant="text" disabled={!openInventory||navigationDisabled||navigating} onClick={()=>void navigate()}>查看详细库存</UIButton>;
  return <>{navigationError&&<p role="alert">{navigationError}</p>}{reader.stock?.readOverview?<StockOverview scope={scope} read={reader.stock.readOverview} navigation={navigation}/>:<LegacyStock scope={scope} reader={reader} navigation={navigation}/>}</>;
}
function LegacyStock({scope,reader,navigation}:ProductPageTabProps&{readonly navigation:ReactNode}){
  return <><div className="product-stock-head"><strong>总库存：未提供</strong>{navigation}</div><ProductPagedRead<ProductWarehouseStockPage> scope={scope} read={reader.stock!.read} validate={productStockResponse} label="商品逐仓库存分页">{data => <>
    <StandardReadTable<StockRow> label="商品仓库规格库存" rows={data.items.map(item => ({ ...item, id: JSON.stringify([item.warehouseId, item.skuId]) }))} columns={[
      { title: '仓库', dataIndex: 'warehouseName' },
      { title: '规格', render: (_, item) => <span data-sku-id={item.skuId}>未提供</span> },
      { title: '现存量', align: 'right', render: (_, item) => item.state === 'KNOWN' ? formatQuantity(item.quantity!) : states[item.state] },
    ]} />{!data.items.length && <p className="product-field-hint">当前读取范围内没有仓库规格记录。</p>}
    <p className="product-field-hint">按仓库和规格分页显示；未提供全仓汇总。</p>
  </>}</ProductPagedRead></>;
}

let overviewSequence=0;
type OverviewReader=NonNullable<NonNullable<ProductPageTabProps['reader']['stock']>['readOverview']>;
function StockOverview(props:{readonly scope:ProductPageTabProps['scope'];readonly read:OverviewReader;readonly navigation:ReactNode}){
  const [owner,setOwner]=useState<{id:number;scope:ProductPageTabProps['scope'];read:OverviewReader;query:LatestQuery<ProductStockOverviewQuery,ProductStockOverviewResult|null>}|null>(null);
  useEffect(()=>{const query=new LatestQuery<ProductStockOverviewQuery,ProductStockOverviewResult|null>({scope:props.scope,execute:async read=>productStockOverviewResponse(await props.read(read),read.parameters)});setOwner({id:++overviewSequence,scope:props.scope,read:props.read,query});return()=>{query.dispose();};},[props.scope,props.read]);
  useProductQueryActivity(owner?.scope===props.scope&&owner.read===props.read?owner.query:null,props.scope.entityId?parseProductStockOverviewQuery({productId:props.scope.entityId,warehouseMode:'NON_ZERO'}):null);
  return owner?.scope===props.scope&&owner.read===props.read&&props.scope.active?<StockOverviewResults key={owner.id} {...props} query={owner.query}/>:null;
}
function StockOverviewResults(props:{readonly scope:ProductPageTabProps['scope'];readonly navigation:ReactNode;readonly query:LatestQuery<ProductStockOverviewQuery,ProductStockOverviewResult|null>}){
  const active=useProductPanelActive();
  const snapshot=useSyncExternalStore(props.query.subscribe,props.query.getSnapshot,props.query.getSnapshot),[mode,setMode]=useState<ProductStockOverviewQuery['warehouseMode']>('NON_ZERO'),[cancelled,setCancelled]=useState(false);
  const run=(warehouseMode=mode)=>{if(active&&props.scope.active&&props.scope.entityId){setCancelled(false);void props.query.run(parseProductStockOverviewQuery({productId:props.scope.entityId,warehouseMode}));}};
  // A mode/target error never re-labels the previous successful snapshot as current.
  const data=snapshot.phase==='success'&&snapshot.success?.parameters.warehouseMode===mode?snapshot.success.data:null;
  const phase=snapshot.phase==='success'&&snapshot.success?.parameters.warehouseMode!==mode?'idle':snapshot.phase;
  const label=data?.coverage==='AUTHORIZED_SUBSET'?'授权范围合计':'总库存';
  return <><div className="product-stock-head"><strong>{label}：{data?(data.total.state==='KNOWN'?formatQuantity(data.total.quantity!):'未知'):'未提供'}</strong><div><UIButton variant="text" aria-pressed={mode==='ALL'} onClick={()=>{if(!active||!props.scope.active)return;const next=mode==='ALL'?'NON_ZERO':'ALL';setMode(next);run(next);}}>{mode==='ALL'?'仅看有库存':'查看全部仓库'}</UIButton>{props.navigation}</div></div>
   <ProductReadState phase={phase} retry={()=>run()} cancel={()=>{setCancelled(true);props.query.cancel();}} cancelled={cancelled} empty={!data}>
    {data&&<><table className="product-stock-overview" aria-label="商品逐仓库存概览"><thead><tr><th>仓库</th><th className="num">现存量</th></tr></thead><tbody>{data.items.map(item=><tr key={item.warehouseId}><td>{item.warehouseName}</td><td className="num">{item.state==='KNOWN'?formatQuantity(item.quantity!):'未知'}</td></tr>)}</tbody></table>
     {!data.items.length&&<div className="product-stock-empty">{data.coverage==='AUTHORIZED_SUBSET'?'当前授权仓库库存均为 0。':'各仓库当前库存为 0'}</div>}
     {data.coverage==='AUTHORIZED_SUBSET'&&<p className="product-field-hint">仅包含当前授权仓库，合计不代表全部业务仓库。</p>}
     {data.total.state==='UNKNOWN'&&<p className="product-field-hint">部分规格库存尚未确认，合计保持未知。</p>}
    </>}
   </ProductReadState>
  </>;
}
