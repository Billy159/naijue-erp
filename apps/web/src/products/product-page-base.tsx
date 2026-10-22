import { assertProductBasics } from '../inventory/product-model.ts';
import { ProductReadState, useProductRead } from '../inventory/product-tab-state.tsx';
import type { ProductPageTabProps } from './product-page-view.tsx';
export function View({ scope, reader }: ProductPageTabProps) {
  const { snapshot, read, cancel, cancelled } = useProductRead(scope, value => reader.base!.read(value), assertProductBasics);
  const data = snapshot.success?.data;
  const fields = data ? [['款号', data.code], ['商品名称', data.name], ['商品分类', data.categoryLabel],
    ['年份', data.yearLabel], ['季节', data.seasonLabel], ['供应商', data.supplierLabel],
    ['厚薄（可选）', null], ['领型 / 裤型（可选）', null], ['系统货号', data.systemCode]] : [];
  return <ProductReadState phase={snapshot.phase} retry={read} cancel={cancel} cancelled={cancelled} empty={!data}>
    <dl className="product-base-grid product-readonly-base-grid" aria-label="商品基础资料">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="product-readonly-value">{value ?? '未提供'}</dd></div>)}</dl>
  </ProductReadState>;
}
