import { ProductTab } from '../inventory/product-tab-specifications.tsx';
import type { ProductPageTabProps } from './product-page-view.tsx';
export function View({ scope, reader }: ProductPageTabProps) {
  if (!reader.specs) return null;
  return <><ProductTab scope={scope} reader={{ readProductSpecifications: read => reader.specs!.read(read) }} fullPage /><p className="product-page-missing">历史未映射 SKU、原标签、条码绑定及其仓库存尚未接入。当前表格仅列来源明确提供的合法 SKU，不生成颜色×版型×尺码组合。</p></>;
}
