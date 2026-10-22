import { ProductTab } from '../inventory/product-tab-basics.tsx';
import type { ProductPageTabProps } from './product-page-view.tsx';
export function View({ scope, reader }: ProductPageTabProps) {
  if (!reader.base) return null;
  return <><ProductTab scope={scope} reader={{ readProductBasics: read => reader.base!.read(read) }} /><p className="product-page-missing">未接入字段：厚薄、领型／裤型、完整分类路径。季节只显示来源提供的单一标签，不补造多选关系。</p></>;
}
