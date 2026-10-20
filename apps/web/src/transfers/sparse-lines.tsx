import { useState } from 'react';
import type { TransferDetailDto } from './contracts.ts';
import { transferCount } from './format.ts';

const PAGE_SIZE = 40;
/** Explicit bounded fallback, never an invisible truncation or guessed grid.
 * At most forty actual lines and forty group members are mounted at once. */
export function TransferSparseLines({ data, onOpenProduct }: { readonly data: TransferDetailDto; readonly onOpenProduct?: (productId: string, label: string) => void }) {
  const [page, setPage] = useState(1); const [showSizes, setShowSizes] = useState(false); const [groupIndex, setGroupIndex] = useState(0); const [sizePage, setSizePage] = useState(1);
  const lines = data.document.lines; const pages = Math.max(1, Math.ceil(lines.length / PAGE_SIZE)); const skus = new Map(data.catalog.skus.map(sku => [sku.skuId, sku]));
  const groups = data.catalog.sizeGroups; const group = groups[groupIndex]; const sizePages = Math.max(1, Math.ceil((group?.members.length ?? 0) / PAGE_SIZE));
  const sizeNames = new Map(groups.flatMap(group => group.members.map(size => [size.sizeId, size.name] as const)));
  return <section className="transfer-sparse-lines"><p className="transfer-readonly-note" role="status">规格矩阵超过安全显示范围，已切换为分页明细。未截断单据；每页显示 40 条实际明细，可分页查看完整规范尺码组。此模式不表示仓库库存。</p>
    <div className="transfer-sparse-scroll"><table><thead><tr>{['款号／商品名称', '颜色', '版型', '尺码', '数量', '操作'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{lines.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(line => { const sku = skus.get(line.skuId)!; return <tr key={line.id}><td><strong>{sku.productCode}</strong><span>{sku.productName}</span></td><td>{sku.colorName}</td><td>{sku.fitName}</td><td>{sizeNames.get(sku.sizeId)}</td><td>{transferCount(line.quantity)}</td><td><button type="button" className="iw-link" disabled={!onOpenProduct} title={onOpenProduct ? '查看商品资料' : '商品查看未配置'} onClick={() => onOpenProduct?.(sku.productId, `${sku.productCode} · ${sku.productName}`)}>查看</button></td></tr>; })}</tbody></table></div>
    <nav aria-label="调拨明细分页"><span>共 {lines.length} 条 · 第 {page} / {pages} 页</span><button type="button" className="iw-text-button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>上一页</button><button type="button" className="iw-text-button" disabled={page >= pages} onClick={() => setPage(value => value + 1)}>下一页</button></nav>
    <button type="button" className="iw-link" aria-expanded={showSizes} onClick={() => setShowSizes(value => !value)}>{showSizes ? '收起规范尺码组' : '查看完整规范尺码组'}</button>
    {showSizes && group && <section className="transfer-full-sizes" aria-label="完整规范尺码组"><div><strong>{group.name}</strong><span>第 {groupIndex + 1} / {groups.length} 组</span><button type="button" className="iw-text-button" disabled={groupIndex === 0} onClick={() => { setGroupIndex(value => value - 1); setSizePage(1); }}>上一组</button><button type="button" className="iw-text-button" disabled={groupIndex + 1 >= groups.length} onClick={() => { setGroupIndex(value => value + 1); setSizePage(1); }}>下一组</button></div>
      <ol start={(sizePage - 1) * PAGE_SIZE + 1}>{group.members.slice((sizePage - 1) * PAGE_SIZE, sizePage * PAGE_SIZE).map(size => <li key={size.sizeId}>{size.name}</li>)}</ol><nav aria-label="规范尺码分页"><span>共 {group.members.length} 个尺码 · 第 {sizePage} / {sizePages} 页</span><button type="button" className="iw-text-button" disabled={sizePage <= 1} onClick={() => setSizePage(value => value - 1)}>上一页</button><button type="button" className="iw-text-button" disabled={sizePage >= sizePages} onClick={() => setSizePage(value => value + 1)}>下一页</button></nav>
    </section>}
  </section>;
}
