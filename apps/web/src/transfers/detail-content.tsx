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
  readonly scope: ReadScope; readonly accessScope: ReadScope; readonly reader: TransferReader; readonly transferId: string; readonly close: () => void;
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
  if (snapshot.success && (snapshot.phase === 'success' || snapshot.phase === 'stale')) return <DetailFacts data={snapshot.success.data} scope={props.scope} accessScope={props.accessScope} close={props.close} {...(props.product ? { product: props.product } : {})} />;
  return <section className="tc-workbench transfer-detail-loading" aria-label="调拨单详情"><div className="tc-head"><h1 ref={heading} tabIndex={-1}>查看调拨单</h1><UIButton type="button" className="iw-text-button" onClick={props.close}>返回列表</UIButton></div>
    {snapshot.phase === 'disposed' ? <p role="status" className="iw-inline-state">读取已取消。<UIButton type="button" className="iw-link" onClick={() => setQuery(createTransferDetailQuery(props.scope, props.reader, props.accessScope))}>重新读取</UIButton></p>
      : snapshot.phase === 'error' ? <p role="alert" className="iw-inline-state">调拨单读取失败。请检查登录及读取权限。<UIButton type="button" className="iw-link" onClick={() => { void query.run(transferTarget(props.transferId)); }}>重试详情</UIButton></p>
        : <p role="status" className="iw-inline-state">正在读取调拨单…<UIButton type="button" className="iw-link" onClick={() => query.dispose()}>取消读取</UIButton></p>}
  </section>;
}
function DetailFacts(props: { readonly data: TransferDetailDto; readonly scope: ReadScope; readonly accessScope: ReadScope; readonly close: () => void; readonly product?: TransferProductCapability }) {
  const { data } = props; const { header, lines } = data.document; const sections = transferMatrix(data);
  const [product, setProduct] = useState<{ id: string; label: string; activation: number } | null>(null); const activation = useRef(0); const productTrigger = useRef<HTMLElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null); useEffect(() => heading.current?.focus(), []);
  const products = new Set(sections.flatMap(section => section.rows.map(row => row.current.productId))).size;
  const total = lines.reduce((sum, line) => sum + BigInt(line.quantity), 0n);
  const display = transferMatrixDisplay(sections); const maxColumns = display.columns;
  const closeProduct = () => { setProduct(null); if (productTrigger.current?.isConnected) productTrigger.current.focus({ preventScroll: true }); productTrigger.current = null; };
  const openProduct = (id: string, label: string) => { productTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setProduct({ id, label, activation: ++activation.current }); };
  const actions = header.status === 'DRAFT' ? ['作废', '保存', '审核'] : header.status === 'APPROVED' ? ['弃审'] : [];
  const field = (label: string, value: string, title = value) => <div className="tc-gold-field"><span>{label}</span><span className="transfer-read-value" title={title}>{value}</span></div>;
  return <section className="tc-workbench tc-editor transfer-editor" aria-label="调拨单详情">
    <div className="tc-head"><h1 ref={heading} tabIndex={-1}>查看调拨单</h1><TransferStatusTag status={header.status} /><span className="transfer-muted">· 只读</span><div className="actions"><UIButton type="button" className="iw-text-button tc-back-link" onClick={props.close}>返回列表</UIButton>{[...actions, '导出', '打印', '操作历史'].map(label => <UIButton key={label} type="button" className="iw-text-button" disabled title={`${label}尚未接入`}>{label}</UIButton>)}</div></div>
    <div className="tc-doc-header"><div className="tc-gold-doc-fields">{field('单据日期', header.businessDate)}{field('调出仓库', data.references.fromWarehouseName, `${data.references.fromHallName} / ${data.references.fromWarehouseName}`)}{field('调入仓库', data.references.toWarehouseName, `${data.references.toHallName} / ${data.references.toWarehouseName}`)}
      <div className="tc-gold-field"><span>单号</span><strong className="transfer-read-value" title={header.number}>{header.number}</strong></div>{field('创建者', data.references.createdByName)}<div className="tc-gold-entry-actions"><UIButton type="button" className="iw-button iw-primary" disabled title="扫码录入尚未接入">扫码录入</UIButton></div></div></div>
    <div className="tc-note-row"><span>备注</span><span className="tc-note-read">{header.note || '—'}</span></div>
    <div className="transfer-readonly-note">{header.status === 'VOID' ? '此单已作废，仅可查看历史。' : header.status === 'APPROVED' ? '已审核，单据只读。' : '当前仅开放单据只读查询。'} 数量为本单当前实际明细，不是仓库实时库存；规格按当前规范资料展示，原保存名称另列于保存记录。</div>
    <div className="tc-section-head"><strong>调拨明细</strong></div>
    {display.mode === 'paged-lines' ? <TransferSparseLines data={data} {...(props.product ? { onOpenProduct: openProduct } : {})} /> : <div className="transfer-matrix-scroll" role="region" aria-label="调拨数量矩阵" tabIndex={0}>
      {sections.map(section => <section className="mx-section" key={section.group.sizeGroupId} style={{ '--mx-table-width': `${592 + maxColumns * 56}px` } as React.CSSProperties}>
        <h2 className="transfer-size-group" title={section.group.code}>{section.group.name}</h2><table className="mx-table"><caption className="sr-only">{section.group.name} · 当前规范规格 · 本单数量</caption><colgroup><col style={{ width: 280 }} /><col style={{ width: 76 }} /><col style={{ width: 88 }} />{Array.from({ length: maxColumns }, (_, index) => <col key={index} style={{ width: 56 }} />)}<col style={{ width: 52 }} /><col style={{ width: 96 }} /></colgroup>
        <thead><tr><th scope="col" className="mx-product">款号／商品名称</th><th scope="col" className="mx-color">颜色</th><th scope="col" className="mx-fit-col">版型</th>{section.group.members.map(size => <th scope="col" key={size.sizeId} title={size.code === null ? size.name : `${size.name} · ${size.code}`}>{size.name}</th>)}{Array.from({ length: maxColumns - section.group.members.length }, (_, index) => <th key={`gap:${index}`} className="mx-size-gap" aria-hidden="true" />)}<th scope="col" className="tc-subtotal">小计</th><th scope="col" className="ui-action-cell">操作</th></tr></thead>
        <tbody>{section.rows.map(row => <tr key={row.key}><td className="mx-product"><span className="mx-product-line"><strong title={row.current.productCode}>{row.current.productCode}</strong><span title={row.current.productName}>{row.current.productName}</span></span></td><td className="mx-color" title={row.current.colorName}>{row.current.colorName}</td><td className="mx-fit-col" title={row.current.fitName}>{row.current.fitName}</td>
          {section.group.members.map(size => { const sku = row.skus.get(size.sizeId); const value = sku ? row.quantities.get(sku.skuId) : undefined; const label = `${row.current.productCode} ${row.current.colorName} ${row.current.fitName} ${size.name}`;
            return <td className={sku ? 'transfer-quantity' : 'mx-size-blank'} key={size.sizeId} aria-label={`${label} ${!sku ? '无此规格' : value === undefined ? '无单据明细' : `本单数量 ${value}`}`}>{!sku ? '—' : value === undefined ? '' : transferCount(value.toString())}</td>; })}
          {Array.from({ length: maxColumns - section.group.members.length }, (_, index) => <td key={`gap:${index}`} className="mx-size-gap" aria-hidden="true" />)}<td className="tc-subtotal">{transferCount(row.total.toString())}</td><td className="ui-action-cell"><div className="mx-actions"><UIButton type="button" className="iw-link" disabled={!props.product} title={props.product ? '查看商品资料' : '商品查看未配置'} onClick={() => openProduct(row.current.productId, `${row.current.productCode} · ${row.current.productName}`)}>查看</UIButton></div></td></tr>)}</tbody></table>
      </section>)}
      {sections.length === 0 && <p className="tc-empty">本单没有实际明细行</p>}
    </div>}
    <footer className="tc-foot tc-gold-footer"><strong>{products}款</strong><strong>数量 {transferCount(total.toString())}</strong></footer>
    <TransferSavedRecords data={data} />
    {product && props.product && <TransferProductActivation key={`${product.id}:${product.activation}`} parent={props.scope} accessScope={props.accessScope} product={product} capability={props.product} close={closeProduct} />}
  </section>;
}
