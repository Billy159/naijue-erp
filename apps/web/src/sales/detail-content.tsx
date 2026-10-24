import { SalesDocumentColumns, SalesDocumentColumnHead, SalesDocumentPresentation, SalesDocumentSummary, SalesProductPresentation, salesPaymentBalance, salesPaymentKind, type SalesProductCapability } from './document-presentation.tsx';
import { DocumentOutputActions } from '../components/document-output.tsx';
import { salesDocumentOutput } from '../components/document-output-contracts.ts';
import { UIButton, UIDate } from '../components/standard-controls.tsx';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { ReadScope } from '../loading/read-scope.ts';
import type { SalesDetailDto, SalesReader } from './contracts.ts';
import { SalesDetailHeader } from './detail-header.tsx';
import { createSalesDetailQuery, salesMoney, salesTarget } from './model.ts';
import type { SalesHistoryCapability } from './history-view.tsx';

export interface SalesDetailContentProps { readonly scope: ReadScope; readonly reader: SalesReader; readonly salesId: string; readonly close: () => void; readonly product?: SalesProductCapability }
export function SalesDetailContent(props: SalesDetailContentProps) {
  const [query, setQuery] = useState(() => createSalesDetailQuery(props.scope, props.reader));
  const snapshot = useSyncExternalStore(query.subscribe, query.getSnapshot, query.getSnapshot);
  useEffect(() => {
    let attached = true;
    queueMicrotask(() => { if (attached && props.scope.active) void query.run(salesTarget(props.salesId)); });
    return () => { attached = false; query.cancel(); };
  }, [query, props.salesId, props.scope]);
  if (!props.scope.active) return null;
  if (snapshot.phase === 'success' && snapshot.success) return <DetailFacts data={snapshot.success.data} scope={props.scope} close={props.close} {...(props.product ? { product: props.product } : {})} {...(props.reader.readHistory ? { history: { scope: props.scope, reader: { readHistory: props.reader.readHistory } } } : {})} />;
  return <section className="sales-detail-page sales-detail-facts tc-workbench tc-editor sale-workbench sale-editor" aria-label="销货单详情"><SalesDocumentPresentation
    header={<SalesDetailHeader close={props.close} />}
    status={snapshot.phase === 'disposed' ? <div className="iw-inline-state" role="status">读取已取消。<UIButton type="button" className="iw-link" onClick={() => setQuery(createSalesDetailQuery(props.scope, props.reader))}>重新读取</UIButton></div>
      : snapshot.phase === 'error' ? <div className="iw-inline-state" role="alert">销货单读取失败。请检查登录和读取权限后重试。<UIButton type="button" className="iw-link" onClick={() => { void query.run(salesTarget(props.salesId)); }}>重试详情</UIButton></div>
      : <div className="iw-inline-state" role="status">正在读取销货单…<UIButton type="button" className="iw-link" onClick={() => query.dispose()}>取消读取</UIButton></div>}
  /></section>;
}
function DetailFacts({ data, scope, close, history, product }: { readonly scope: ReadScope; readonly product?: SalesProductCapability; readonly data: SalesDetailDto; readonly close: () => void; readonly history?: SalesHistoryCapability }) {
  const { header, lines, settlements } = data.document;
  const settlementNames = new Map(data.settlementNames.map(names => [names.settlementId, names]));
  const field = (label: string, value: ReactNode, className = '') => <label className={`tc-gold-field ${className}`} key={label}><span className="sale-field-label">{label}</span><span className="sale-read-value" title={typeof value === 'string' ? value : undefined}>{value}</span></label>;
  const sections = [{ title: '商品明细', incoming: false, rows: lines }];
  return <SalesProductPresentation scope={scope} {...(product ? { capability: product } : {})}>{openProduct => <section className="sales-detail-page sales-detail-facts tc-workbench tc-editor sale-workbench sale-editor" aria-label="销货单详情"><SalesDocumentPresentation
    header={<SalesDetailHeader output={<DocumentOutputActions sourceKey={`${header.id}:${header.version}`} getDocument={() => salesDocumentOutput(data)} />} close={close} status={header.status} salesId={header.id} {...(history ? { history } : {})} />}
    facts={<div className="tc-doc-header sale-doc-header"><div className="tc-gold-doc-fields sale-doc-fields">
      <label className="tc-gold-field sale-date-field"><span className="sale-field-label">单据日期 <span className="ui-required">*</span></span><input type="hidden" data-sale-field="date" value={header.businessDate} /><span className="tc-arco-date-host" data-sales-date="document" data-sales-readonly="true"><UIDate aria-label="单据日期" value={header.businessDate} disabled onChange={() => {}} /></span></label>
      {field('业务类型', header.businessType === 'SALE' ? '销售' : '退货/换货')}
      {field('营业厅', data.referenceNames.hallName)}
      {field('营业员', data.referenceNames.salespersonName ?? '未指定')}
      {field('客户', data.referenceNames.customerName)}
      {field('出库仓', data.referenceNames.warehouseName)}
      <label className="tc-gold-field tc-gold-meta sale-number-field"><span className="sale-field-label">单号</span><strong className="sale-number-value">{header.number}</strong></label>
      {field('整单优惠 / 抹零', header.businessType === 'SALE' ? `¥${salesMoney(header.orderDiscount)}` : '', 'sale-discount-field')}
      <label className="tc-gold-field sale-due-field"><span className="sale-field-label">应结金额</span><strong className="sale-due-value" data-sale-due>{header.netDue.startsWith('-') ? '-¥' + salesMoney(header.netDue.slice(1)) : '¥' + salesMoney(header.netDue)}</strong></label>
      <div className="tc-gold-field sale-payment-field" data-funds-field><span className="sale-field-label">收款</span><div className="sale-payment-rows">{settlements.map(line => {
        const names = settlementNames.get(line.id)!;
        return <div className="sale-payment-read" key={line.id}><span title={names.methodNameSnapshot}>{line.direction === 'RECEIVE' ? '收款' : '退款'} · {names.methodNameSnapshot}{names.currentMethodName !== names.methodNameSnapshot && <small className="sales-current-name">现名称：{names.currentMethodName}</small>}</span><span title={names.accountNameSnapshot}>{names.accountNameSnapshot}{names.currentAccountName !== names.accountNameSnapshot && <small className="sales-current-name">现名称：{names.currentAccountName}</small>}</span><strong>¥{line.direction === 'REFUND' ? '-' : ''}{salesMoney(line.amount)}</strong></div>;
      })}{!settlements.length && <span className="sale-read-value">本单没有收退明细</span>}</div><small data-funds-balance className={`sale-payment-balance ${salesPaymentKind(header.netDue, settlements.reduce((sum, row) => sum + (row.direction === 'REFUND' ? -1n : 1n) * BigInt(row.amount), 0n).toString(), lines.length)}`}>{salesPaymentBalance(header.netDue, settlements.reduce((sum, row) => sum + (row.direction === 'REFUND' ? -1n : 1n) * BigInt(row.amount), 0n).toString(), lines.length)}</small></div>
    </div></div>}
    note={<label className="sale-note-row"><span className="sale-field-label">备注</span><span className="sale-note-read">{header.note || '—'}</span></label>}
    lines={<>{sections.map(section => <section className="sale-entry-section" key={section.title} data-business-section={section.incoming ? 'in' : 'out'}><div className="tc-section-head sale-section-head"><strong>{section.title}</strong></div>
      <div id="sale-lines" className="sale-lines sales-table-scroll"><table className="sales-table sale-lines-table sales-lines"><caption className="sr-only">销货明细 · {section.title}</caption><SalesDocumentColumns /><SalesDocumentColumnHead incoming={section.incoming} /><tbody>
      {section.rows.map(line => <tr key={line.id} data-line={line.id}><td><div className="sale-product-cell"><strong title={line.snapshot.productCode}>{line.snapshot.productCode}</strong><span className="sale-product-name" title={line.snapshot.productName}>{line.snapshot.productName}</span>{line.isGift && <span className="sale-gift">赠品</span>}</div></td><td title={line.snapshot.colorName}>{line.snapshot.colorName}</td><td title={line.snapshot.fitName}>{line.snapshot.fitName}</td><td title={line.snapshot.sizeName}>{line.snapshot.sizeName}</td><td className={`sales-numeric ${line.quantity.startsWith('-') ? 'negative' : ''}`}>{header.businessType !== 'SALE' ? line.quantity.startsWith('-') ? '退回 ' : '换出 ' : ''}{line.quantity}</td><td className="sales-numeric sale-muted">{line.referencePrice === null ? '未记录' : salesMoney(line.referencePrice)}</td><td className="sales-numeric">{line.discountTenths === null ? '未记录' : `${Math.trunc(line.discountTenths / 10)}.${line.discountTenths % 10}折`}</td><td className="sales-numeric">{salesMoney(line.dealPrice)}</td><td className="sales-numeric">{salesMoney(line.lineAmount)}</td><td className="ui-action-cell"><div className="tc-row-actions sale-row-actions"><button type="button" className="btn sale-link" disabled={!openProduct} title={openProduct ? undefined : '当前无法查看商品资料'} onClick={() => openProduct?.(line.skuId, header.hallId)}>查看</button></div></td></tr>)}
      {!section.rows.length && <tr><td colSpan={10}>本单没有实际明细行</td></tr>}
    </tbody></table></div></section>)}</>}
    summary={<SalesDocumentSummary businessType={header.businessType} snapshotCodes lines={lines.map(line => ({ styleKey: line.snapshot.productCode, quantity: line.quantity, isGift: line.isGift }))} grossMinor={header.grossAmount} discountMinor={header.orderDiscount} netDueMinor={header.netDue} />}
  /></section>}</SalesProductPresentation>;
}
