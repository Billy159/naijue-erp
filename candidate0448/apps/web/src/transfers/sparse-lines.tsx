import { UIButton } from '../components/standard-controls.tsx';
import { StandardReadTable, type StandardReadColumn } from '../components/standard-read-table.tsx';
import { StandardPagination } from '../components/standard-pagination.tsx';
import { useEffect, useMemo, useState } from 'react';
import type { TransferDetailDto } from './contracts.ts';
import { transferReadProduct, transferReadQuantity, transferReadText } from './read-columns.tsx';

const PAGE_SIZE = 40;
type ActualLine = TransferDetailDto['document']['lines'][number];
interface SparseLinesProps { readonly data: TransferDetailDto; readonly onOpenProduct?: (productId: string, label: string) => void }
/** Explicit bounded fallback, never an invisible truncation or guessed grid.
 * At most forty actual lines and forty group members are mounted at once. */
export function TransferSparseLines(props: SparseLinesProps) {
  return <SparseDocumentLines key={props.data.document.header.id} {...props} />;
}
function SparseDocumentLines({ data, onOpenProduct }: SparseLinesProps) {
  const [page, setPage] = useState(1), [showSizes, setShowSizes] = useState(false);
  const [groupId, setGroupId] = useState<string | null>(data.catalog.sizeGroups[0]?.sizeGroupId ?? null), [sizePage, setSizePage] = useState(1);
  const lines = data.document.lines, pages = Math.max(1, Math.ceil(lines.length / PAGE_SIZE)), current = Math.min(page, pages);
  const groups = data.catalog.sizeGroups, groupIndex = Math.max(0, groups.findIndex(group => group.sizeGroupId === groupId)), group = groups[groupIndex];
  const sizePages = Math.max(1, Math.ceil((group?.members.length ?? 0) / PAGE_SIZE)), currentSizePage = group?.sizeGroupId === groupId ? Math.min(sizePage, sizePages) : 1;
  useEffect(() => { if (page > pages) setPage(pages); }, [page, pages]);
  useEffect(() => { if ((group?.sizeGroupId ?? null) !== groupId) { setGroupId(group?.sizeGroupId ?? null); setSizePage(1); } }, [group, groupId]);
  useEffect(() => { if (sizePage > sizePages) setSizePage(sizePages); }, [sizePage, sizePages]);
  useEffect(() => { if (groups.length === 0) setShowSizes(false); }, [groups.length]);
  const skus = useMemo(() => new Map(data.catalog.skus.map(sku => [sku.skuId, sku])), [data.catalog.skus]);
  const sizeNames = useMemo(() => new Map(groups.flatMap(group => group.members.map(size => [size.sizeId, size.name] as const))), [groups]);
  // Same presentation as saved records, but every name here comes explicitly
  // from current canonical references. Repeated SKU lines stay independent.
  const columns = useMemo<readonly StandardReadColumn<ActualLine>[]>(() => [
    { title: '款号／商品名称', render: (_, line) => { const sku = skus.get(line.skuId)!; return transferReadProduct(sku.productCode, sku.productName); } },
    { title: '颜色', render: (_, line) => transferReadText(skus.get(line.skuId)!.colorName) },
    { title: '版型', render: (_, line) => transferReadText(skus.get(line.skuId)!.fitName) },
    { title: '尺码', render: (_, line) => transferReadText(sizeNames.get(skus.get(line.skuId)!.sizeId)!) },
    { title: '数量', render: (_, line) => transferReadQuantity(line.quantity) },
    { title: '操作', render: (_, line) => { const sku = skus.get(line.skuId)!; return <UIButton type="button" className="iw-link" disabled={!onOpenProduct} title={onOpenProduct ? '查看商品资料' : '商品查看未配置'} onClick={() => onOpenProduct?.(sku.productId, `${sku.productCode} · ${sku.productName}`)}>查看</UIButton>; } },
  ], [skus, sizeNames, onOpenProduct]);
  const selectGroup = (index: number) => { setGroupId(groups[index]!.sizeGroupId); setSizePage(1); };
  return <section className="transfer-sparse-lines"><p className="transfer-readonly-note" role="status">规格矩阵超过安全显示范围，已切换为分页明细。未截断单据；每页显示 40 条实际明细，可分页查看完整规范尺码组。此模式不表示仓库库存。本单共 {lines.length} 条实际明细。</p>
    <div className="transfer-sparse-scroll"><StandardReadTable label="调拨单当前规范明细" tableClassName="transfer-sparse-table" plainCellContent rows={lines.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)} columns={columns} /></div>
    {lines.length === 0 && <p role="status">本单没有实际明细行</p>}
    <StandardPagination label="调拨明细分页" page={current} pageSize={PAGE_SIZE} total={lines.length} disabled={false} hideOnSinglePage={false} showJump={false} simple stepText onPage={setPage} />
    <UIButton type="button" className="iw-link" aria-expanded={showSizes && groups.length > 0} disabled={groups.length === 0} onClick={() => setShowSizes(value => !value)}>{showSizes && groups.length > 0 ? '收起规范尺码组' : '查看完整规范尺码组'}</UIButton>
    {showSizes && group && <section className="transfer-full-sizes" aria-label="完整规范尺码组"><div><strong>{group.name}</strong><span>第 {groupIndex + 1} / {groups.length} 组 · 共 {group.members.length} 个尺码</span><UIButton type="button" className="iw-text-button" disabled={groupIndex === 0} onClick={() => selectGroup(groupIndex - 1)}>上一组</UIButton><UIButton type="button" className="iw-text-button" disabled={groupIndex + 1 >= groups.length} onClick={() => selectGroup(groupIndex + 1)}>下一组</UIButton></div>
      <ol start={(currentSizePage - 1) * PAGE_SIZE + 1}>{group.members.slice((currentSizePage - 1) * PAGE_SIZE, currentSizePage * PAGE_SIZE).map(size => <li key={size.sizeId}>{size.name}</li>)}</ol>
      {group.members.length === 0 && <p role="status">本尺码组没有规范尺码。</p>}
      <StandardPagination label="规范尺码分页" page={currentSizePage} pageSize={PAGE_SIZE} total={group.members.length} disabled={false} hideOnSinglePage={false} showJump={false} simple stepText onPage={setSizePage} />
    </section>}
  </section>;
}
