import type { ReactNode } from 'react';
import type { InventoryActions, InventoryColorFit, InventoryPage, InventoryProduct, InventoryRow, StockTotal } from './contracts.ts';
import { formatQuantity, totalLabel } from './model.ts';

export interface InventoryDisplaySettings {
  readonly category: boolean;
  readonly supplier: boolean;
  readonly season: boolean;
  readonly subtotal: boolean;
  readonly total: boolean;
  readonly sizeDescription: boolean;
}
export const defaultDisplaySettings: InventoryDisplaySettings = { category: true, supplier: false, season: false, subtotal: false, total: true, sizeDescription: false };

export function InventoryMatrix(props: {
  readonly data: InventoryPage;
  readonly settings: InventoryDisplaySettings;
  readonly collapsedProducts: ReadonlySet<string>;
  readonly collapsedColors: ReadonlySet<string>;
  readonly toggleProduct: (id: string) => void;
  readonly toggleColor: (id: string) => void;
  readonly actions: InventoryActions;
}) {
  // The contract already contains a bounded product page. No full catalog or synthetic SKU cross product.
  const sections = new Map<string, InventoryProduct[]>();
  for (const product of props.data.products) {
    const key = JSON.stringify([product.sizeGroup.id, product.sizes.map(size => [size.id, size.label])]);
    const existing = sections.get(key);
    if (existing) existing.push(product); else sections.set(key, [product]);
  }
  return <>{[...sections].map(([key, products]) => {
    const first = products[0]!;
    return <section key={key} className="mx-section" aria-label={`${first.sizeGroup.label}库存矩阵`}>
      {props.settings.sizeDescription && <p className="mx-group-description">尺码组：{first.sizeGroup.label} · 按已核实顺序显示，— 表示不存在此规格，未知不按零计算。</p>}
      <table className="mx-table"><caption className="sr-only">{first.sizeGroup.label}，商品、颜色、版型、仓库及尺码库存</caption><thead><tr><th className="mx-color">颜色</th><th className="mx-fit">版型 FIT</th><th className="mx-warehouse">仓库</th>{first.sizes.map(size => <th key={size.id} className="mx-size">{size.label}</th>)}<th className="mx-total">合计</th></tr></thead><tbody>
        {products.map(product => <ProductRows key={product.id} product={product} {...props} />)}
      </tbody></table>
    </section>;
  })}</>;
}

function ProductRows(props: Parameters<typeof InventoryMatrix>[0] & { readonly product: InventoryProduct }) {
  const { product } = props;
  const collapsed = props.collapsedProducts.has(product.id);
  const columns = product.sizes.length + 4;
  return <>
    <tr className="mx-product-row"><td colSpan={columns}><div className="mx-product-head"><button type="button" className="mx-fold" aria-expanded={!collapsed} aria-label={`${collapsed ? '展开' : '折叠'}商品${product.code}`} onClick={() => props.toggleProduct(product.id)}>{collapsed ? '▸' : '▾'}</button><strong>{product.code}</strong><span className="mx-product-name">{product.name}</span><div className="mx-meta">{props.settings.category && <span>分类 {product.categoryLabel}</span>}{props.settings.supplier && <span>供应商 {product.supplierLabel}</span>}{props.settings.season && <span>季节 {product.seasonLabel}</span>}<span>尺码组 {product.sizeGroup.label}</span></div><button type="button" className="iw-link mx-view" disabled={!props.actions.onViewProduct} title={props.actions.onViewProduct ? '查看当前商品' : '商品只读抽屉尚未接入'} onClick={() => props.actions.onViewProduct?.({ id: product.id, label: `${product.code} ${product.name}` })}>查看</button></div></td></tr>
    {collapsed ? <TotalRow label="所有颜色 / 所有版型" warehouse="所有仓库" product={product} totals={product.sizeTotals} total={product.total} kind="product" /> : <>
      {product.colorFits.map(group => {
        const key = JSON.stringify([product.id, group.color.id, group.fit.id]);
        const folded = props.collapsedColors.has(key);
        const color = <div className="mx-color-label"><button type="button" className="mx-fold" aria-expanded={!folded} aria-label={`${folded ? '展开' : '折叠'}${product.code}${group.color.label}${group.fit.label}`} onClick={() => props.toggleColor(key)}>{folded ? '▸' : '▾'}</button>{group.color.label}</div>;
        return <ColorRows key={key} {...props} group={group} color={color} folded={folded} />;
      })}
      {props.settings.total && <TotalRow label="商品合计" warehouse="所有仓库" product={product} totals={product.sizeTotals} total={product.total} kind="product" />}
    </>}
  </>;
}
function ColorRows(props: Parameters<typeof ProductRows>[0] & { readonly group: InventoryColorFit; readonly color: ReactNode; readonly folded: boolean }) {
  const { group, product } = props;
  if (props.folded) return <TotalRow label={props.color} fit={group.fit.label} warehouse="所有仓库" product={product} totals={group.sizeTotals} total={group.total} kind="color" />;
  return <>
    {group.rows.map((row, index) => <tr key={row.warehouse.id} className="mx-detail-row"><th scope="row" className="mx-color">{index === 0 ? props.color : <span className="sr-only">{group.color.label}</span>}</th><td className="mx-fit">{group.fit.label}</td><td className="mx-warehouse">{row.warehouse.label}</td>{product.sizes.map(size => {
      const cell = row.cells[size.id]!;
      return <td className="mx-number" key={size.id}>{cell.state === 'not-applicable' ? <span className="mx-absent" aria-label="不存在此规格">—</span> : <button type="button" className={`mx-stock ${cell.state === 'known' && cell.quantity.startsWith('-') ? 'mx-negative' : ''} ${cell.state === 'unknown' ? 'mx-unknown' : ''}`} disabled={!props.actions.onOpenCell} title={cell.state === 'unknown' ? cell.reason : props.actions.onOpenCell ? '查看该仓库 / SKU 库存流水' : '库存流水尚未接入'} aria-label={`${product.code} ${group.color.label} ${group.fit.label} ${row.warehouse.label} ${size.label} ${cell.state === 'known' ? `库存${cell.quantity}` : '库存未知'}`} onClick={() => props.actions.onOpenCell?.({ productId: product.id, productLabel: `${product.code} ${product.name}`, color: group.color, fit: group.fit, size, warehouse: row.warehouse, skuId: cell.skuId, readReference: props.data.readReference })}>{cell.state === 'known' ? formatQuantity(cell.quantity) : '未知'}</button>}</td>;
    })}<td className="mx-total-cell" title={totalLabel(row.total)}>{totalLabel(row.total)}</td></tr>)}
    {props.settings.subtotal && <TotalRow label={`${group.color.label}小计`} fit={group.fit.label} warehouse="所有仓库" product={product} totals={group.sizeTotals} total={group.total} kind="color" />}
  </>;
}
function TotalRow(props: { readonly label: ReactNode; readonly fit?: string; readonly warehouse: string; readonly product: InventoryProduct; readonly totals: Readonly<Record<string, StockTotal>>; readonly total: StockTotal; readonly kind: 'product' | 'color' }) {
  return <tr className={`mx-${props.kind}-total`}><th scope="row" className="mx-color">{props.label}</th><td className="mx-fit">{props.fit ?? '全部版型'}</td><td className="mx-warehouse">{props.warehouse}</td>{props.product.sizes.map(size => <td key={size.id} className="mx-number" title={totalLabel(props.totals[size.id]!)}>{props.totals[size.id]!.completeness === 'incomplete' ? <span className="mx-unknown">已核 {formatQuantity(props.totals[size.id]!.knownQuantity)}</span> : formatQuantity(props.totals[size.id]!.knownQuantity)}</td>)}<td className="mx-total-cell" title={totalLabel(props.total)}>{totalLabel(props.total)}</td></tr>;
}
