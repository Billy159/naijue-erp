import { UIButton } from '../components/standard-controls.tsx';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { ReadScope } from '../loading/read-scope.ts';
import type { SalesDetailDto, SalesReader } from './contracts.ts';
import { SalesDetailHeader } from './detail-header.tsx';
import { createSalesDetailQuery, salesMoney, salesTarget, salesTypeLabels } from './model.ts';

export interface SalesDetailContentProps { readonly scope: ReadScope; readonly reader: SalesReader; readonly salesId: string; readonly close: () => void }
export function SalesDetailContent(props: SalesDetailContentProps) {
  const [query, setQuery] = useState(() => createSalesDetailQuery(props.scope, props.reader));
  const snapshot = useSyncExternalStore(query.subscribe, query.getSnapshot, query.getSnapshot);
  useEffect(() => {
    let attached = true;
    queueMicrotask(() => { if (attached && props.scope.active) void query.run(salesTarget(props.salesId)); });
    return () => { attached = false; query.cancel(); };
  }, [query, props.salesId, props.scope]);
  if (!props.scope.active) return null;
  if (snapshot.phase === 'success' && snapshot.success) return <DetailFacts data={snapshot.success.data} close={props.close} />;
  return <section className="sales-detail-page sales-detail-facts tc-workbench tc-editor sale-workbench sale-editor" aria-label="销货单详情"><SalesDetailHeader close={props.close} />
    {snapshot.phase === 'disposed' ? <div className="iw-inline-state" role="status">读取已取消。<UIButton type="button" className="iw-link" onClick={() => setQuery(createSalesDetailQuery(props.scope, props.reader))}>重新读取</UIButton></div>
      : snapshot.phase === 'error' ? <div className="iw-inline-state" role="alert">销货单读取失败。请检查登录和读取权限后重试。<UIButton type="button" className="iw-link" onClick={() => { void query.run(salesTarget(props.salesId)); }}>重试详情</UIButton></div>
      : <div className="iw-inline-state" role="status">正在读取销货单…<UIButton type="button" className="iw-link" onClick={() => query.dispose()}>取消读取</UIButton></div>}
  </section>;
}
function DetailFacts({ data, close }: { readonly data: SalesDetailDto; readonly close: () => void }) {
  const { header, lines, settlements } = data.document;
  const settlementNames = new Map(data.settlementNames.map(names => [names.settlementId, names]));
  const field = (label: string, value: ReactNode, className = '') => <div className={`tc-gold-field ${className}`} key={label}><span className="sale-field-label">{label}</span><span className="sale-read-value" title={typeof value === 'string' ? value : undefined}>{value}</span></div>;
  const incoming = lines.filter(line => !line.isGift && BigInt(line.quantity) < 0n).reduce((sum, line) => sum - BigInt(line.quantity), 0n);
  const outgoing = lines.filter(line => !line.isGift && BigInt(line.quantity) > 0n).reduce((sum, line) => sum + BigInt(line.quantity), 0n);
  const sections = header.businessType === 'EXCHANGE'
    ? [{ title: '退回商品', incoming: true, rows: lines.filter(line => BigInt(line.quantity) < 0n) }, { title: '换出商品', incoming: false, rows: lines.filter(line => BigInt(line.quantity) >= 0n) }]
    : [{ title: header.businessType === 'RETURN' ? '退回商品' : '商品明细', incoming: header.businessType === 'RETURN', rows: lines }];
  return <section className="sales-detail-page sales-detail-facts tc-workbench tc-editor sale-workbench sale-editor" aria-label="销货单详情">
    <SalesDetailHeader close={close} status={header.status} />
    <div className="tc-doc-header sale-doc-header"><div className="tc-gold-doc-fields sale-doc-fields">
      {field('单据日期', header.businessDate, 'sale-date-field')}
      {field('业务类型', salesTypeLabels[header.businessType])}
      {field('营业厅', data.referenceNames.hallName)}
      {field('营业员', data.referenceNames.salespersonName ?? '未指定')}
      {field('客户', data.referenceNames.customerName)}
      {field('出库仓', data.referenceNames.warehouseName)}
      <div className="tc-gold-field sale-number-field"><span className="sale-field-label">单号</span><strong className="sale-number-value">{header.number}</strong></div>
      {field('整单优惠 / 抹零', `¥${salesMoney(header.orderDiscount)}`, 'sale-discount-field')}
      <div className="tc-gold-field sale-due-field"><span className="sale-field-label">应结金额</span><strong className="sale-due-value">{header.netDue.startsWith('-') ? '-¥' + salesMoney(header.netDue.slice(1)) : '¥' + salesMoney(header.netDue)}</strong></div>
      <div className="tc-gold-field sale-payment-field"><span className="sale-field-label">本单收退明细</span><div className="sale-payment-rows">{settlements.map(line => {
        const names = settlementNames.get(line.id)!;
        return <div className="sale-payment-read" key={line.id}><span title={names.methodNameSnapshot}>{line.direction === 'RECEIVE' ? '收款' : '退款'} · {names.methodNameSnapshot}{names.currentMethodName !== names.methodNameSnapshot && <small className="sales-current-name">现名称：{names.currentMethodName}</small>}</span><span title={names.accountNameSnapshot}>{names.accountNameSnapshot}{names.currentAccountName !== names.accountNameSnapshot && <small className="sales-current-name">现名称：{names.currentAccountName}</small>}</span><strong>{salesMoney(line.amount)}</strong></div>;
      })}{!settlements.length && <span className="sale-read-value">本单没有收退明细</span>}</div></div>
    </div></div>
    <div className="sale-note-row"><span className="sale-field-label">备注</span><span className="sale-note-read">{header.note ?? '未填写'}</span></div>
    {sections.map(section => <section className="sale-entry-section" key={section.title}><div className="tc-section-head sale-section-head"><strong>{section.title}</strong></div>
      <div className="sale-lines sales-table-scroll"><table className="sales-table sale-lines-table sales-lines"><caption className="sr-only">销货明细 · {section.title}</caption><colgroup>{[270, 100, 122, 84, 80, 95, 90, 108, 99, 142].map((width, index) => <col key={index} style={{ width }} />)}</colgroup><thead><tr>{['款号／商品名称', '颜色', '版型', '尺码', '数量', '参考零售价', '折扣', section.incoming ? '退货单价' : '成交单价', '金额', '操作'].map(name => <th scope="col" key={name} className={name === '操作' ? 'ui-action-cell' : undefined}>{name}</th>)}</tr></thead><tbody>
      {section.rows.map(line => <tr key={line.id}><td><div className="sale-product-cell"><strong title={line.snapshot.productCode}>{line.snapshot.productCode}</strong><span className="sale-product-name" title={line.snapshot.productName}>{line.snapshot.productName}</span>{line.isGift && <span className="sale-gift">赠品</span>}</div></td><td title={line.snapshot.colorName}>{line.snapshot.colorName}</td><td title={line.snapshot.fitName}>{line.snapshot.fitName}</td><td title={line.snapshot.sizeName}>{line.snapshot.sizeName}</td><td className={`sales-numeric ${line.quantity.startsWith('-') ? 'negative' : ''}`}>{header.businessType !== 'SALE' ? line.quantity.startsWith('-') ? '退回 ' : '换出 ' : ''}{line.quantity}</td><td className="sales-numeric sale-muted">{line.referencePrice === null ? '未记录' : salesMoney(line.referencePrice)}</td><td className="sales-numeric">{line.discountTenths === null ? '未记录' : `${Math.trunc(line.discountTenths / 10)}.${line.discountTenths % 10}折`}</td><td className="sales-numeric">{salesMoney(line.dealPrice)}</td><td className="sales-numeric">{salesMoney(line.lineAmount)}</td><td className="ui-action-cell"><UIButton type="button" className="iw-link" disabled title="商品规格详情尚未接入">查看</UIButton></td></tr>)}
      {!section.rows.length && <tr><td colSpan={10}>本单没有实际明细行</td></tr>}
    </tbody></table></div></section>)}
    <footer className="tc-foot tc-gold-footer sale-summary">{header.businessType === 'SALE' ? <><div className="sale-summary-detail"><strong>数量 {(outgoing - incoming).toString()}</strong></div><div className="sale-summary-primary"><strong>销售金额 ¥{salesMoney(header.grossAmount)}</strong><strong>优惠 ¥{salesMoney(header.orderDiscount)}</strong><strong>应结 ¥{salesMoney(header.netDue)}</strong></div></> : <div className="sale-summary-primary"><strong>退回 {incoming.toString()}</strong><strong>换出 {outgoing.toString()}</strong><strong>{header.netDue === '0' ? '差额' : header.netDue.startsWith('-') ? '应退' : '应收'} ¥{salesMoney(header.netDue.startsWith('-') ? header.netDue.slice(1) : header.netDue)}</strong></div>}</footer>
  </section>;
}
