import { useState } from 'react';
import { UIButton } from '../components/standard-controls.tsx';
import { StandardReadTable } from '../components/standard-read-table.tsx';
import type { ProductWarehouseStockItem, ProductWarehouseStockPage } from '../../../../packages/application/src/product-details-query-ports.ts';
import { productStockResponse } from './product-page-validation.ts';
import { ProductPagedRead, type ProductPageTabProps } from './product-page-view.tsx';
import { formatQuantity } from '../inventory/model.ts';

const states = { UNKNOWN: '未知', MISSING: '缺少库存记录', UNMAPPED: '未映射', READ_FAILED: '读取失败' } as const;
type StockRow = ProductWarehouseStockItem & { readonly id: string };
export function View({ scope, reader, openInventory, navigationDisabled }: ProductPageTabProps) {
  const [navigating,setNavigating]=useState(false),[navigationError,setNavigationError]=useState('');
  const navigate=async()=>{if(!scope.active||navigationDisabled||navigating||!openInventory)return;setNavigating(true);setNavigationError('');try{const moved=await openInventory();if(scope.active&&!moved)setNavigationError('暂未离开商品页，请确认未保存资料后重试。');}catch{if(scope.active)setNavigationError('库存详情暂不可打开，请重试。');}finally{if(scope.active)setNavigating(false);}};
  return <><div className="product-stock-head"><strong>总库存：未提供</strong><UIButton variant="text" disabled={!openInventory||navigationDisabled||navigating} onClick={()=>void navigate()}>查看库存详情</UIButton></div>{navigationError&&<p role="alert">{navigationError}</p>}<ProductPagedRead<ProductWarehouseStockPage> scope={scope} read={reader.stock!.read} validate={productStockResponse} label="商品逐仓库存分页">{data => <>
    <StandardReadTable<StockRow> label="商品仓库规格库存" rows={data.items.map(item => ({ ...item, id: JSON.stringify([item.warehouseId, item.skuId]) }))} columns={[
      { title: '仓库', dataIndex: 'warehouseName' },
      { title: '规格', render: (_, item) => <span data-sku-id={item.skuId}>未提供</span> },
      { title: '现存量', align: 'right', render: (_, item) => item.state === 'KNOWN' ? formatQuantity(item.quantity!) : states[item.state] },
    ]} />{!data.items.length && <p className="product-field-hint">当前读取范围内没有仓库规格记录。</p>}
    <p className="product-field-hint">按仓库和规格分页显示；未提供全仓汇总。</p>
  </>}</ProductPagedRead></>;
}
