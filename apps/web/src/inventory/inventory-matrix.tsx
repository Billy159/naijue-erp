import type { CSSProperties, ReactNode } from 'react';
import type { InventoryActions, InventoryColorFit, InventoryPage, InventoryProduct, StockTotal } from './contracts.ts';
import { formatQuantity, totalLabel } from './model.ts';

export interface InventoryDisplaySettings {
  readonly category: boolean;
  readonly supplier: boolean;
  readonly fit: boolean;
  readonly sizeGroup: boolean;
  readonly season: boolean;
  readonly subtotal: boolean;
  readonly total: boolean;
  readonly sizeDescription: boolean;
}
/** Frozen workbench defaults; these are presentation choices, never SKU merging. */
export const defaultDisplaySettings: InventoryDisplaySettings = { category: true, supplier: false, fit: false, sizeGroup: false, season: false, subtotal: false, total: true, sizeDescription: false };

type MatrixProps = {
  readonly data: InventoryPage;
  readonly settings: InventoryDisplaySettings;
  readonly collapsedProducts: ReadonlySet<string>;
  readonly collapsedColors: ReadonlySet<string>;
  readonly toggleProduct: (id: string) => void;
  readonly toggleColor: (id: string) => void;
  readonly actions: InventoryActions;
};
/** Column-first geometry follows frozen inventory-matrix-experiment.js, not
 * standalone product-heading rows. Canonical FIT/SKU identities stay separate. */
export function InventoryMatrix(props: MatrixProps) {
  const sections = new Map<string, InventoryProduct[]>();
  for (const product of props.data.products) {
    const key = JSON.stringify([product.sizeGroup.id, product.sizes.map(size => [size.id, size.label])]);
    const existing = sections.get(key);
    if (existing) existing.push(product); else sections.set(key, [product]);
  }
  return <>{[...sections].map(([key, products]) => {
    const first = products[0]!;
    const width = 300 + 116 + 152 + first.sizes.length * 76 + 76 + 70;
    return <section key={key} className="mx-section" data-size-system={first.sizeGroup.id} style={{ '--mx-table-width': `${width}px` } as CSSProperties} aria-label={`${first.sizeGroup.label}库存矩阵`}>
      {props.settings.sizeDescription && <h3>{first.sizeGroup.label}<small>{first.sizes.map(size => size.label).join(' / ')}</small></h3>}
      <table className="mx-table"><caption className="sr-only">{first.sizeGroup.label}，商品、颜色、版型、仓库及尺码库存；— 表示不存在此规格，合法规格无库存显示 0。</caption>
        <colgroup><col style={{ width: 300 }} /><col style={{ width: 116 }} /><col style={{ width: 152 }} />{first.sizes.map(size => <col key={size.id} style={{ width: 76 }} />)}<col style={{ width: 76 }} /><col style={{ width: 70 }} /></colgroup>
        <thead><tr><th scope="col" className="mx-product">款号／商品名称</th><th scope="col" className="mx-color">颜色</th><th scope="col" className="mx-warehouse">仓库</th>{first.sizes.map(size => <th scope="col" key={size.id} className="mx-size" data-size-id={size.id}>{size.label}</th>)}<th scope="col" className="mx-total-cell">合计</th><th scope="col" className="mx-operation">操作</th></tr></thead>
        <tbody>{products.map(product => <ProductRows key={product.id} product={product} {...props} />)}</tbody>
      </table>
    </section>;
  })}</>;
}
const spacer = <span className="mx-fold-spacer" aria-hidden="true" />;
function Fold(props: { readonly expanded: boolean; readonly label: string; readonly toggle: () => void }) {
  return <button type="button" className="mx-fold" aria-expanded={props.expanded} aria-label={`${props.expanded ? '折叠' : '展开'}${props.label}`} onClick={props.toggle}>{props.expanded ? '▾' : '▸'}</button>;
}
function Indent(props: { readonly control: ReactNode; readonly children: ReactNode }) {
  return <div className="mx-indent">{props.control}<span>{props.children}</span></div>;
}
function ProductIdentity(props: { readonly product: InventoryProduct; readonly settings: InventoryDisplaySettings; readonly showMeta: boolean; readonly fit?: string }) {
  const { product, settings } = props;
  return <><div className="mx-product-identity"><strong>{product.code}</strong><span title={product.name}>{product.name}</span></div>{props.showMeta && <div className="mx-meta">
    {settings.category && <span><em>分类</em> {product.categoryLabel}</span>}{settings.supplier && <span><em>供应商</em> {product.supplierLabel}</span>}{settings.fit && props.fit && <span><em>版型</em> {props.fit}</span>}{settings.sizeGroup && <span><em>尺码组</em> {product.sizeGroup.label}</span>}{settings.season && <span><em>季节</em> {product.seasonLabel}</span>}
  </div>}</>;
}
function ViewProduct(props: { readonly product: InventoryProduct; readonly actions: InventoryActions }) {
  return <button type="button" className="mx-view" disabled={!props.actions.onViewProduct} title={props.actions.onViewProduct ? '查看当前商品' : '商品只读抽屉尚未接入'} aria-label={`打开${props.product.code}商品资料`} onClick={event => { event.currentTarget.focus(); props.actions.onViewProduct?.({ id: props.product.id, label: `${props.product.code} ${props.product.name}` }); }}>查看</button>;
}
function ProductRows(props: MatrixProps & { readonly product: InventoryProduct }) {
  const { product } = props;
  const collapsed = props.collapsedProducts.has(product.id);
  const productFold = <Fold expanded={!collapsed} label={`商品${product.code}`} toggle={() => props.toggleProduct(product.id)} />;
  if (collapsed) return <TotalRow {...props} kind="product" folded first identity color={<Indent control={productFold}>所有颜色</Indent>} warehouse={<Indent control={spacer}>所有库存</Indent>} totals={product.sizeTotals} total={product.total} />;
  return <>{product.colorFits.map((group, index) => <ColorRows key={JSON.stringify([group.color.id, group.fit.id])} {...props} group={group} firstGroup={index === 0} productFold={productFold} />)}
    {props.settings.total && <TotalRow {...props} kind="product" label="商品合计" totals={product.sizeTotals} total={product.total} />}
  </>;
}
function ColorRows(props: MatrixProps & { readonly product: InventoryProduct; readonly group: InventoryColorFit; readonly firstGroup: boolean; readonly productFold: ReactNode }) {
  const { group, product } = props;
  const key = JSON.stringify([product.id, group.color.id, group.fit.id]);
  const folded = props.collapsedColors.has(key);
  const colorFold = <Fold expanded={!folded} label={`${product.code}${group.color.label}${group.fit.label}`} toggle={() => props.toggleColor(key)} />;
  if (folded) return <><TotalRow {...props} kind="color" folded first={props.firstGroup} identity fit={group.fit.label} color={<Indent control={props.firstGroup ? props.productFold : spacer}>{group.color.label}</Indent>} warehouse={<Indent control={colorFold}>所有库存</Indent>} totals={group.sizeTotals} total={group.total} /></>;
  return <>
    {group.rows.map((row, index) => {
      const first = props.firstGroup && index === 0;
      return <tr key={row.warehouse.id} data-inventory-product={product.id} data-inventory-row={JSON.stringify([product.id, group.color.id, group.fit.id, row.warehouse.id])} className={`mx-detail-row${first ? ' mx-product-row' : ''}`}>
        <td className="mx-product"><ProductIdentity product={product} settings={props.settings} showMeta={first || props.settings.fit && index === 0} fit={group.fit.label} /><span className="sr-only">{group.fit.label}</span></td>
        <td className="mx-color"><Indent control={first ? props.productFold : spacer}>{group.color.label}</Indent></td>
        <td className="mx-warehouse" title={`${row.warehouse.label} · ${group.fit.label}`}><Indent control={index === 0 ? colorFold : spacer}>{row.warehouse.label}</Indent></td>
        {product.sizes.map(size => {
          const cell = row.cells[size.id]!;
          return <td className="mx-number" key={size.id}>{cell.state === 'not-applicable' ? <span className="mx-absent" aria-label="不存在此规格">—</span> : <button type="button" className={`mx-stock${cell.quantity.startsWith('-') ? ' mx-negative' : cell.quantity === '0' ? ' mx-zero' : ''}`} disabled={!props.actions.onOpenCell} title={props.actions.onOpenCell ? `查看该仓库 / SKU 库存流水 · ${group.fit.label}` : '库存流水尚未接入'} aria-label={`${product.code} ${group.color.label} ${group.fit.label} ${row.warehouse.label} ${size.label} 库存${cell.quantity}`} onClick={() => props.actions.onOpenCell?.({ productId: product.id, productLabel: `${product.code} ${product.name}`, color: group.color, fit: group.fit, size, warehouse: row.warehouse, skuId: cell.skuId, readReference: props.data.readReference })}>{formatQuantity(cell.quantity)}</button>}</td>;
        })}<td className="mx-total-cell" title={totalLabel(row.total)}>{totalLabel(row.total)}</td><td className="mx-operation"><ViewProduct product={product} actions={props.actions} /></td>
      </tr>;
    })}
    {props.settings.subtotal && <TotalRow {...props} kind="color" label="颜色小计" totals={group.sizeTotals} total={group.total} />}
  </>;
}
function TotalRow(props: MatrixProps & { readonly product: InventoryProduct; readonly label?: string; readonly fit?: string; readonly color?: ReactNode; readonly warehouse?: ReactNode; readonly totals: Readonly<Record<string, StockTotal>>; readonly total: StockTotal; readonly kind: 'product' | 'color'; readonly folded?: boolean; readonly first?: boolean; readonly identity?: boolean }) {
  return <tr data-inventory-product={props.product.id} className={`mx-${props.kind === 'product' ? 'total mx-product-total' : 'subtotal mx-color-total'}${props.folded ? ' mx-folded' : ''}${props.first ? ' mx-product-row' : ''}`}>
    <td className="mx-product">{props.identity ? <ProductIdentity product={props.product} settings={props.settings} showMeta={!!props.first || props.settings.fit} {...(props.fit ? { fit: props.fit } : {})} /> : props.label}{props.fit && <span className="sr-only">{props.fit}</span>}</td><td className="mx-color">{props.color}</td><td className="mx-warehouse">{props.warehouse}</td>
    {props.product.sizes.map(size => <td key={size.id} className="mx-number" title={totalLabel(props.totals[size.id]!)}>{formatQuantity(props.totals[size.id]!.knownQuantity)}</td>)}<td className="mx-total-cell" title={totalLabel(props.total)}>{totalLabel(props.total)}</td><td className="mx-operation">{props.identity && <ViewProduct product={props.product} actions={props.actions} />}</td>
  </tr>;
}
