import { UIButton } from '../components/standard-controls.tsx';
import { StandardReadTable, type StandardReadColumn } from '../components/standard-read-table.tsx';
import { StandardPagination } from '../components/standard-pagination.tsx';
import { useEffect, useState } from 'react';
import type { TransferDetailDto } from './contracts.ts';
import { transferUpdatedMinute } from './format.ts';
import { transferReadProduct, transferReadQuantity, transferReadText } from './read-columns.tsx';

const PAGE_SIZE = 40;
type SavedLine = TransferDetailDto['document']['lines'][number];
/** Domain-owned read-only columns. Saved snapshots are not current catalogue
 * values, and line.id remains the row identity even for repeated SKU records. */
const columns: readonly StandardReadColumn<SavedLine>[] = [
  { title: '款号／商品名称', render: (_, line) => transferReadProduct(line.snapshot.productCode, line.snapshot.productName) },
  { title: '颜色', render: (_, line) => transferReadText(line.snapshot.colorName) },
  { title: '版型', render: (_, line) => transferReadText(line.snapshot.fitName) },
  { title: '尺码', render: (_, line) => transferReadText(line.snapshot.sizeName) },
  { title: '数量', render: (_, line) => transferReadQuantity(line.quantity) },
  { title: '条码', render: (_, line) => transferReadText(line.snapshot.barcode ?? '未记录') },
];

/** A new document owns a fresh disclosure/page. Same-document rerenders and
 * collapse/expand retain the applied local page; there is no read or command. */
export function TransferSavedRecords({ data }: { readonly data: TransferDetailDto }) {
  return <SavedDocumentRecords key={data.document.header.id} data={data} />;
}
function SavedDocumentRecords({ data }: { readonly data: TransferDetailDto }) {
  const [open, setOpen] = useState(false), [page, setPage] = useState(1);
  const lines = data.document.lines, pages = Math.max(1, Math.ceil(lines.length / PAGE_SIZE)), current = Math.min(page, pages), header = data.document.header;
  useEffect(() => { if (page > pages) setPage(pages); }, [page, pages]);
  return <section className="transfer-record-snapshots"><UIButton type="button" className="iw-link" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? '收起单据保存记录' : '单据保存记录'}</UIButton>
    {open && <div><p>下表保留每条实际明细的原保存款号、名称、颜色、版型、尺码和条码，不用当前名称改写历史。仓库和创建者名称采用当前参照资料。共 {lines.length} 条保存记录。</p>
      <div className="transfer-snapshot-scroll"><StandardReadTable label="调拨单原保存明细" tableClassName="transfer-saved-table" plainCellContent
        rows={lines.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)} columns={columns} /></div>
      {lines.length === 0 && <p role="status">本单没有保存明细。</p>}
      <StandardPagination label="保存记录分页" page={current} pageSize={PAGE_SIZE} total={lines.length} disabled={false}
        hideOnSinglePage={false} showJump={false} simple stepText onPage={setPage} />
      <p>最后更新：<time dateTime={header.updatedAt} title={header.updatedAt}>{transferUpdatedMinute(header.updatedAt)}</time> · 审核：{data.references.approvedByName ?? '未记录'}{data.stockBasis === 'CUTOFF_HISTORY' && ' · 历史截止导入记录，不代表本系统运行期库存过账。'}</p>
    </div>}
  </section>;
}
