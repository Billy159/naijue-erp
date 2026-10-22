import { DocumentProductPresentation } from '../sales/document-presentation.tsx';
import { TransferMatrixTable, TransferDocumentSummary } from './document-presentation.tsx';
import type { TransferProposalPresentation } from '../current-form/transfer-proposal-form.tsx';
import { DocumentOutputActions } from '../components/document-output.tsx';
import { transferDocumentOutput } from '../components/document-output-contracts.ts';
import { TransferHistoryAction, type TransferHistoryCapability } from './history-view.tsx';
import { TransferStatusTag } from './transfer-status-tag.tsx';
import { UIButton } from '../components/standard-controls.tsx';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReadScope } from '../loading/read-scope.ts';
import type { TransferDetailDto, TransferProductCapability, TransferReader } from './contracts.ts';
import { createTransferDetailQuery, transferTarget } from './model.ts';
import { transferCount } from './format.ts';
import { transferMatrix, transferMatrixDisplay } from './matrix.ts';
import { TransferSparseLines } from './sparse-lines.tsx';
import { TransferSavedRecords } from './saved-records.tsx';
import { TransferProductActivation } from './product-activation.tsx';

export interface TransferDetailContentProps {
  readonly presentation?: TransferProposalPresentation; readonly scope: ReadScope; readonly accessScope: ReadScope; readonly reader: TransferReader; readonly transferId: string; readonly close: () => void;
  readonly product?: TransferProductCapability;
}
export function TransferDetailContent(props: TransferDetailContentProps) {
  const [query, setQuery] = useState(() => createTransferDetailQuery(props.scope, props.reader, props.accessScope));
  const snapshot = useSyncExternalStore(query.subscribe, query.getSnapshot, query.getSnapshot); const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let attached = true; heading.current?.focus();
    queueMicrotask(() => { if (attached && props.scope.active) void query.run(transferTarget(props.transferId)); });
    return () => { attached = false; query.cancel(); };
  }, [query, props.transferId, props.scope]);
  if (!props.scope.active) return null;
  if (snapshot.success && (snapshot.phase === 'success' || snapshot.phase === 'stale')) return <DetailFacts {...(props.presentation ? { presentation: props.presentation } : {})} {...(props.reader.readHistory ? { history: { scope: props.scope, reader: { readHistory: read => props.reader.readHistory!(read) } } } : {})} data={snapshot.success.data} scope={props.scope} accessScope={props.accessScope} close={props.close} {...(props.product ? { product: props.product } : {})} />;
  return <section className="tc-workbench transfer-detail-loading" aria-label="调拨单详情"><div className="tc-head"><h1 ref={heading} tabIndex={-1}>查看调拨单</h1><UIButton type="button" className="iw-text-button" onClick={props.close}>返回列表</UIButton></div>
    {snapshot.phase === 'disposed' ? <p role="status" className="iw-inline-state">读取已取消。<UIButton type="button" className="iw-link" onClick={() => setQuery(createTransferDetailQuery(props.scope, props.reader, props.accessScope))}>重新读取</UIButton></p>
      : snapshot.phase === 'error' ? <p role="alert" className="iw-inline-state">调拨单读取失败。请检查登录及读取权限。<UIButton type="button" className="iw-link" onClick={() => { void query.run(transferTarget(props.transferId)); }}>重试详情</UIButton></p>
        : <p role="status" className="iw-inline-state">正在读取调拨单…<UIButton type="button" className="iw-link" onClick={() => query.dispose()}>取消读取</UIButton></p>}
  </section>;
}
function DetailFacts(props: { readonly presentation?: TransferProposalPresentation; readonly history?: TransferHistoryCapability; readonly data: TransferDetailDto; readonly scope: ReadScope; readonly accessScope: ReadScope; readonly close: () => void; readonly product?: TransferProductCapability }) {
  const { data } = props; const { header, lines } = data.document; const sections = transferMatrix(data);
  const [product, setProduct] = useState<{ id: string; label: string; activation: number } | null>(null); const activation = useRef(0); const productTrigger = useRef<HTMLElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null); useEffect(() => heading.current?.focus(), []);
  const display = transferMatrixDisplay(sections);
  const closeProduct = () => { setProduct(null); if (productTrigger.current?.isConnected) productTrigger.current.focus({ preventScroll: true }); productTrigger.current = null; };
  const openProduct = (id: string, label: string) => { productTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setProduct({ id, label, activation: ++activation.current }); };
  const actions = header.status === 'DRAFT' ? ['作废', '保存', '审核'] : header.status === 'APPROVED' ? ['弃审'] : [];
  const field = (label: string, value: string, title = value) => <div className="tc-gold-field"><span>{label}</span><span className="transfer-read-value" title={title}>{value}</span></div>;
  return <DocumentProductPresentation scope={props.scope} {...(props.presentation?.productCapability ? { capability: props.presentation.productCapability } : {})} returnLabel="返回调拨单" viewLabel="调拨商品查看" documentLabel="调拨">{openFullProduct => {
    const viewProduct = (id: string, label: string) => { const sku = data.catalog.skus.find(sku => sku.productId === id); if (openFullProduct && sku) openFullProduct(sku.skuId, 'TRANSFER', { id, label }); else if (props.product) openProduct(id, label); };
    return <section className="tc-workbench tc-editor transfer-editor" aria-label="调拨单详情">
    <div className="tc-head"><h1 ref={heading} tabIndex={-1}>查看调拨单</h1><TransferStatusTag status={header.status} /><span className="transfer-muted">· 只读</span><div className="actions"><UIButton type="button" className="iw-text-button tc-back-link" onClick={props.close}>返回列表</UIButton>{actions.map(label => <UIButton key={label} type="button" className="iw-text-button" disabled title={`${label}尚未接入`}>{label}</UIButton>)}<DocumentOutputActions sourceKey={`${header.id}:${header.version}`} getDocument={() => transferDocumentOutput(data)} /><TransferHistoryAction {...(props.history ? { capability: props.history } : {})} transferId={header.id} /></div></div>
    <div className="tc-doc-header"><div className="tc-gold-doc-fields">{field('单据日期', header.businessDate)}{field('调出仓库', data.references.fromWarehouseName, `${data.references.fromHallName} / ${data.references.fromWarehouseName}`)}{field('调入仓库', data.references.toWarehouseName, `${data.references.toHallName} / ${data.references.toWarehouseName}`)}
      <div className="tc-gold-field tc-gold-doc-number"><span>单号</span><strong className="transfer-read-value" title={header.number}>{header.number}</strong></div>{field('创建者', data.references.createdByName)}<div className="tc-gold-entry-actions"><UIButton type="button" className="iw-button iw-primary" disabled title="扫码录入尚未接入">扫码录入</UIButton></div></div></div>
    <div className="tc-note-row"><span>备注</span><span className="tc-note-read">{header.note || '—'}</span></div>
    {(header.status === 'VOID' || header.status === 'APPROVED') && <p className="transfer-readonly-note">{header.status === 'VOID' ? '此单已作废，仅可查看历史。' : '已审核，单据只读。'}</p>}
    {display.mode === 'paged-lines' ? <TransferSparseLines data={data} {...(props.product || openFullProduct ? { onOpenProduct: viewProduct } : {})} /> : <div className="transfer-matrix-scroll" role="region" aria-label="调拨数量矩阵" tabIndex={0}>
      {sections.map(section => <TransferMatrixTable key={section.group.sizeGroupId} sizes={section.group.members.map(size => ({ id: size.sizeId, label: size.name }))} label={`${section.group.name} · 当前规范规格 · 本单数量`}>
        {sizes => section.rows.map(row => <tr key={row.key}><td className="mx-product"><span className="mx-product-line"><strong title={row.current.productCode}>{row.current.productCode}</strong><span title={row.current.productName}>{row.current.productName}</span></span></td><td className="mx-color" title={row.current.colorName}>{row.current.colorName}</td><td className="mx-fit-col" title={row.current.fitName}>{row.current.fitName}</td>
          {sizes.map(size => { const sku = row.skus.get(size.id), value = sku ? row.quantities.get(sku.skuId) : undefined, label = `${row.current.productCode} ${row.current.colorName} ${row.current.fitName} ${size.label}`;
            return <td className={sku ? 'transfer-quantity' : 'mx-size-blank'} key={size.id} aria-label={`${label} ${!sku ? '无此规格' : value === undefined ? '无单据明细' : `本单数量 ${value}`}`}>{!sku ? '—' : value === undefined ? '' : transferCount(value.toString())}</td>; })}<td className="tc-subtotal">{transferCount(row.total.toString())}</td><td className="ui-action-cell"><div className="mx-actions"><UIButton className="iw-link" disabled={!props.product && !openFullProduct} onClick={() => viewProduct(row.current.productId, `${row.current.productCode} · ${row.current.productName}`)}>查看</UIButton></div></td></tr>)}
      </TransferMatrixTable>)}
      {sections.length === 0 && <p className="tc-empty">本单没有实际明细行</p>}
    </div>}
    <TransferDocumentSummary lines={lines.map(line => ({ productId: data.catalog.skus.find(sku => sku.skuId === line.skuId)?.productId, quantity: line.quantity }))} />
    <TransferSavedRecords data={data} />
    {product && props.product && <TransferProductActivation key={`${product.id}:${product.activation}`} parent={props.scope} accessScope={props.accessScope} product={product} capability={props.product} close={closeProduct} />}
  </section>;
  }}</DocumentProductPresentation>;
}
