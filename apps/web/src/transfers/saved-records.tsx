import { useState } from 'react';
import type { TransferDetailDto } from './contracts.ts';
import { transferCount, transferUpdatedMinute } from './format.ts';

/** Actual saved rows are mounted only on disclosure and are always bounded. */
export function TransferSavedRecords({ data }: { readonly data: TransferDetailDto }) {
  const [open, setOpen] = useState(false); const [page, setPage] = useState(1); const lines = data.document.lines; const pages = Math.max(1, Math.ceil(lines.length / 40)); const header = data.document.header;
  return <section className="transfer-record-snapshots"><button type="button" className="iw-link" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? '收起单据保存记录' : '单据保存记录'}</button>
    {open && <div><p>下表保留每条实际明细的原保存款号、名称、颜色、版型、尺码和条码，不用当前名称改写历史。仓库和创建者名称采用当前参照资料。</p>
      <div className="transfer-snapshot-scroll"><table><thead><tr>{['款号／商品名称', '颜色', '版型', '尺码', '数量', '条码'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{lines.slice((page - 1) * 40, page * 40).map(line => <tr key={line.id}><td><strong>{line.snapshot.productCode}</strong><span>{line.snapshot.productName}</span></td><td>{line.snapshot.colorName}</td><td>{line.snapshot.fitName}</td><td>{line.snapshot.sizeName}</td><td>{transferCount(line.quantity)}</td><td>{line.snapshot.barcode ?? '未记录'}</td></tr>)}</tbody></table></div>
      <nav aria-label="保存记录分页"><span>共 {lines.length} 条 · 第 {page} / {pages} 页</span><button type="button" className="iw-text-button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>上一页</button><button type="button" className="iw-text-button" disabled={page >= pages} onClick={() => setPage(value => value + 1)}>下一页</button></nav>
      <p>最后更新：<time dateTime={header.updatedAt} title={header.updatedAt}>{transferUpdatedMinute(header.updatedAt)}</time> · 审核：{data.references.approvedByName ?? '未记录'}</p>
      {data.stockBasis === 'CUTOFF_HISTORY' && <p>历史截止导入记录，不代表本系统运行期库存过账。</p>}
    </div>}
  </section>;
}
