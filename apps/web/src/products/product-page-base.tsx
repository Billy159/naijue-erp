import { assertProductBasics } from '../inventory/product-model.ts';
import { ProductReadState, useProductRead } from '../inventory/product-tab-state.tsx';
import type { ProductPageTabProps } from './product-page-view.tsx';
export function View({ scope, reader }: ProductPageTabProps) {
  const { snapshot, read, cancel, cancelled } = useProductRead(scope, value => reader.base!.read(value), assertProductBasics);
  const data = snapshot.success?.data;
  // Retain the frozen readonly field captions. The approved multi-season field
  // and legacy category have no inferred required/default/source semantics.
  const fields = data ? [
    { label: '款号', value: data.code, required: true }, { label: '商品名称', value: data.name, required: true },
    { label: '商品分类', value: data.categoryLabel, required: false }, { label: '年份', value: data.yearLabel, required: true },
    { label: '季节', value: data.seasonLabel, required: false }, { label: '供应商', value: data.supplierLabel, required: true },
    { label: '厚薄（可选）', value: null, required: false }, { label: '领型 / 裤型（可选）', value: null, required: false },
    { label: '系统货号', value: data.systemCode, required: true },
  ] : [];
  return <ProductReadState phase={snapshot.phase} retry={read} cancel={cancel} cancelled={cancelled} empty={!data}>
    <dl className="product-base-grid product-readonly-base-grid" aria-label="商品基础资料">{fields.map(({label, value, required}) => <div key={label}><dt>{label}{required && <span className="product-required-mark" aria-hidden> *</span>}</dt><dd className="product-readonly-value">{value ?? '未提供'}</dd></div>)}</dl>
  </ProductReadState>;
}
