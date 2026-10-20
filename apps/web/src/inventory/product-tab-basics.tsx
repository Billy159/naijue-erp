import type { ProductDrawerContentProps } from './product-drawer.tsx';
import { assertProductBasics } from './product-model.ts';
import { ProductReadState, useProductRead } from './product-tab-state.tsx';
export function ProductTab({ scope, reader }: ProductDrawerContentProps) {
  const { snapshot, read, cancel, cancelled } = useProductRead(scope, value => reader.readProductBasics(value), assertProductBasics);
  const data = snapshot.success?.data;
  const fields = data ? [['款号', data.code], ['名称', data.name], ['分类', data.categoryLabel], ['年份', data.yearLabel], ['季节', data.seasonLabel], ['供应商', data.supplierLabel], ['系统货号', data.systemCode]] : [];
  return <ProductReadState phase={snapshot.phase} retry={read} cancel={cancel} cancelled={cancelled} empty={!data}><dl className="pd-fields">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? '未提供'}</dd></div>)}</dl></ProductReadState>;
}
