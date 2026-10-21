import type { ProductDrawerContentProps } from './product-drawer.tsx';
import { assertProductSpecifications } from './product-model.ts';
import { ProductReadState, useProductRead } from './product-tab-state.tsx';

/** Frozen specsBody + readonlyDrawerBody: three vertical sections. The reader's
 * complete sizes/SKU facts are still validated, not expanded into a new table or
 * historical-compatibility UI that the current contract does not supply. */
export function ProductTab({ scope, reader }: ProductDrawerContentProps) {
  const { snapshot, read, cancel, cancelled } = useProductRead(scope, value => reader.readProductSpecifications(value), assertProductSpecifications);
  const data = snapshot.success?.data;
  return <ProductReadState phase={snapshot.phase} retry={read} cancel={cancel} cancelled={cancelled} empty={!data}>{data && <div className="pd-spec-stack">
    <section className="pd-spec-section" aria-label="颜色"><div className="pd-section-line"><h3>颜色</h3></div><div className="pd-spec-values">{data.colors.length ? data.colors.map(value => <span className="pd-spec-value" key={value.id}>{value.label}</span>) : <span className="muted">未设置</span>}</div></section>
    <section className="pd-spec-section" aria-label="尺码组"><div className="pd-section-line"><h3>尺码组</h3></div><div className="pd-spec-group"><span className="pd-read-value">{data.sizeGroup?.label ?? '—'}</span></div></section>
    <section className="pd-spec-section" aria-label="版型"><div className="pd-section-line"><h3>版型</h3></div><div className="pd-spec-values">{data.fits.length ? data.fits.map(value => <span className="pd-spec-value" key={value.id}>{value.label}</span>) : <span className="muted">未设置</span>}</div></section>
  </div>}</ProductReadState>;
}
