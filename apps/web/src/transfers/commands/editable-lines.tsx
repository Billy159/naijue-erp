import { UIButton, UIInput } from '../../components/standard-controls.tsx';
import { useState } from 'react';
import type { Selection } from '../../inventory/contracts.ts';
import { TransferDocumentMatrixRow, TransferMatrixTable } from '../document-presentation.tsx';
import type { TransferDetailDto } from '../contracts.ts';
import type { TransferDraftDto, TransferFormInput } from './contracts.ts';
import { transferMatrix, transferMatrixDisplay } from '../matrix.ts';
import { transferCount } from '../format.ts';

/** Reuses the native/frozen matrix projection and its fixed geometry. Missing
 * actual rows stay blank: this slice never invents a SKU, barcode or zero row. */
export function TransferEditableLines(props: { readonly onOpenProduct?: (skuId: string, target?: Selection) => void; readonly detail: TransferDetailDto | null; readonly draft: TransferDraftDto | null; readonly input: TransferFormInput | null; readonly locked: boolean; readonly invalid: boolean; readonly update: (input: TransferFormInput) => void }) {
  const [page, setPage] = useState(1), lines = props.draft?.lines ?? props.detail?.document.lines ?? [];
  const data = props.detail ? { ...props.detail, document: { ...props.detail.document, lines } } : null;
  // A prepared new SKU can precede the next persisted-detail catalogue read.
  // Its validated snapshot remains renderable; do not project it through the
  // original document's incomplete catalogue or invent a canonical relation.
  const canProject = !!data && lines.every(line => { const sku = data.catalog.skus.find(row => row.skuId === line.skuId); return !!sku && data.catalog.sizeGroups.some(group => group.sizeGroupId === sku.sizeGroupId && group.members.some(size => size.sizeId === sku.sizeId)); });
  const sections = canProject ? transferMatrix(data) : [], display = transferMatrixDisplay(sections);
  const input = (line: typeof lines[number]) => props.input ? <UIInput type="text" inputMode="numeric" maxLength={19} aria-label={`数量 第${line.lineNo}行 ${line.snapshot.sizeName}`} className="iw-control transfer-quantity-input" value={props.input.quantities[line.id] ?? ''} disabled={props.locked} aria-invalid={props.invalid} onChange={nextValue => props.update({ ...props.input!, quantities: { ...props.input!.quantities, [line.id]: nextValue } })} /> : transferCount(line.quantity);
  // Duplicate actual rows for one SKU cannot be collapsed into one input. Sparse
  // and adversarial documents stay paged at 40 actual lines rather than Cartesian.
  if (canProject && display.mode === 'matrix' && new Set(lines.map(line => line.skuId)).size === lines.length) return <div className="transfer-matrix-scroll" role="region" aria-label="可编辑调拨数量矩阵" tabIndex={0}>{sections.map(section => <TransferMatrixTable key={section.group.sizeGroupId} columnCount={display.columns} sizes={section.group.members.map(size => ({ id: size.sizeId, label: size.name }))} label={`${section.group.name} · 调拨实际明细`}>
    {sizes => section.rows.map(row => <TransferDocumentMatrixRow key={row.key}
      productCode={row.current.productCode}
      productName={row.current.productName}
      color={row.current.colorName}
      colorTitle={row.current.colorName}
      fit={row.current.fitName}
      fitTitle={row.current.fitName}
      sizeCells={sizes.map(size => { if (size.empty) return <td key={size.id} className="mx-size-gap" aria-hidden="true" />; const sku = row.skus.get(size.id), line = sku ? row.lines.find(line => line.skuId === sku.skuId) : undefined; return <td key={size.id} className={sku ? 'transfer-quantity' : 'mx-size-blank'} aria-label={!sku ? '无此规格' : line ? undefined : '无单据明细，未开放新增'}>{line ? input(line) : sku ? '' : '—'}</td>; })}
      subtotal={props.invalid ? '待校验' : transferCount(row.total.toString())}
      actions={<div className="mx-actions"><UIButton className="iw-link" disabled={!props.onOpenProduct} onClick={() => props.onOpenProduct?.(row.current.skuId, { id: row.current.productId, label: `${row.current.productCode} · ${row.current.productName}` })}>查看</UIButton></div>}
    />)}
  </TransferMatrixTable>)}</div>;
  const pages = Math.max(1, Math.ceil(lines.length / 40)), current = Math.min(page, pages);
  return <div className="transfer-sparse-lines"><p className="transfer-muted">按实际明细逐行编辑，每页 40 行；不合并相同 SKU，不创建规格组合。</p><nav aria-label="编辑明细分页"><UIButton type="button" className="iw-button" disabled={current === 1} onClick={() => setPage(current - 1)}>上一页明细</UIButton><span>第 {current} / {pages} 页 · 共 {lines.length} 行</span><UIButton type="button" className="iw-button" disabled={current === pages} onClick={() => setPage(current + 1)}>下一页明细</UIButton></nav><div className="transfer-sparse-scroll" role="region" aria-label="可编辑实际调拨明细" tabIndex={0}><table className="transfer-command-lines"><thead><tr>{['款号／商品名称', '颜色', '版型', '尺码', '数量', '原条码', '操作'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{lines.slice((current - 1) * 40, current * 40).map(line => <tr key={line.id}><td><strong>{line.snapshot.productCode}</strong><span>{line.snapshot.productName}</span></td><td>{line.snapshot.colorName}</td><td>{line.snapshot.fitName}</td><td>{line.snapshot.sizeName}</td><td>{input(line)}</td><td>{line.snapshot.barcode === null ? '未保存条码' : line.snapshot.barcode}</td><td><UIButton className="iw-link" disabled={!props.onOpenProduct} onClick={() => props.onOpenProduct?.(line.skuId)}>查看</UIButton></td></tr>)}</tbody></table></div></div>;
}
