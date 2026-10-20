import type { ProductDrawerContentProps } from './product-drawer.tsx';
import { assertProductSpecifications } from './product-model.ts';
import { ProductReadState, useProductRead } from './product-tab-state.tsx';
export function ProductTab({ scope, reader }: ProductDrawerContentProps) {
  const { snapshot, read, cancel, cancelled } = useProductRead(scope, value => reader.readProductSpecifications(value), assertProductSpecifications);
  const data = snapshot.success?.data;
  const colors = new Map(data?.colors.map(value => [value.id, value.label]));
  const fits = new Map(data?.fits.map(value => [value.id, value.label]));
  const sizes = new Map(data?.sizes.map(value => [value.id, value.label]));
  return <ProductReadState phase={snapshot.phase} retry={read} cancel={cancel} cancelled={cancelled} empty={!data}>{data && <>
    <dl className="pd-fields"><div><dt>颜色</dt><dd>{data.colors.map(value => value.label).join('、') || '暂无颜色'}</dd></div><div><dt>尺码组</dt><dd>{data.sizeGroup?.label ?? '未提供'}</dd></div><div><dt>尺码</dt><dd>{data.sizes.map(value => value.label).join('、') || '暂无尺码'}</dd></div><div><dt>版型 FIT</dt><dd>{data.fits.map(value => value.label).join('、') || '暂无版型'}</dd></div></dl>
    {data.skus.length ? <div className="pd-sku-scroll"><table className="pd-skus"><caption>当前商品有效规格</caption><thead><tr><th>颜色</th><th>版型 FIT</th><th>尺码</th></tr></thead><tbody>{data.skus.map(sku => <tr key={sku.id} data-sku-id={sku.id}><td>{colors.get(sku.colorId)}</td><td>{fits.get(sku.fitId)}</td><td>{sizes.get(sku.sizeId)}</td></tr>)}</tbody></table></div> : <p className="iw-inline-state">暂无有效规格，未生成缺失 SKU。</p>}
  </>}</ProductReadState>;
}
