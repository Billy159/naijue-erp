import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ReadScope } from '../loading/read-scope.ts';
import type { SalesDetailDto, SalesReader } from './contracts.ts';
import { createSalesDetailQuery, salesMoney, salesStatusLabels, salesTarget, salesTypeLabels } from './model.ts';

export interface SalesDetailContentProps { readonly scope: ReadScope; readonly reader: SalesReader; readonly salesId: string }
export function SalesDetailContent(props: SalesDetailContentProps) {
  const [query, setQuery] = useState(() => createSalesDetailQuery(props.scope, props.reader));
  const snapshot = useSyncExternalStore(query.subscribe, query.getSnapshot, query.getSnapshot);
  useEffect(() => {
    let attached = true;
    queueMicrotask(() => { if (attached && props.scope.active) void query.run(salesTarget(props.salesId)); });
    return () => { attached = false; query.cancel(); };
  }, [query, props.salesId, props.scope]);
  if (!props.scope.active) return null;
  if (snapshot.phase === 'disposed') return <div className="iw-inline-state" role="status">读取已取消。<button type="button" className="iw-link" onClick={() => setQuery(createSalesDetailQuery(props.scope, props.reader))}>重新读取</button></div>;
  if (snapshot.phase === 'loading' || snapshot.phase === 'idle') return <div className="iw-inline-state" role="status">正在读取销货单…<button type="button" className="iw-link" onClick={() => query.dispose()}>取消读取</button></div>;
  if (snapshot.phase === 'error') return <div className="iw-inline-state" role="alert">销货单读取失败。请检查登录和读取权限后重试。<button type="button" className="iw-link" onClick={() => { void query.run(salesTarget(props.salesId)); }}>重试详情</button></div>;
  return snapshot.success ? <DetailFacts data={snapshot.success.data} /> : null;
}
function DetailFacts({ data }: { readonly data: SalesDetailDto }) {
  const { header, lines, settlements } = data.document;
  const references = [
    ['营业厅', data.referenceNames.hallName], ['营业员', data.referenceNames.salespersonName],
    ['客户', data.referenceNames.customerName], ['出库仓', data.referenceNames.warehouseName],
  ] as const;
  const settlementNames = new Map(data.settlementNames.map(names => [names.settlementId, names]));
  return <div className="sales-detail-facts">
    <dl className="sales-detail-header"><div><dt>单号</dt><dd>{header.number}</dd></div><div><dt>日期</dt><dd>{header.businessDate}</dd></div><div><dt>状态</dt><dd>{salesStatusLabels[header.status]}</dd></div><div><dt>业务类型</dt><dd>{salesTypeLabels[header.businessType]}</dd></div>
      {references.map(([label, name]) => <div key={label}><dt>{label}</dt><dd>{name ?? '未指定'}</dd></div>)}

    </dl>
    <p className="sales-source-note">商品规格及收退账户、方式采用本单保存记录；有更名时另行标注现名称。</p>
    <div className="sales-table-scroll"><table className="sales-table sales-lines"><caption>销货明细</caption><thead><tr>{['序号', '商品款号', '商品名称', '颜色', '版型', '尺码', '数量', '参考价', '折扣', '成交价', '金额', '分摊优惠', '赠品', '条码'].map(name => <th scope="col" key={name}>{name}</th>)}</tr></thead><tbody>
      {lines.map(line => <tr key={line.id}><td>{line.lineNo}</td><td>{line.snapshot.productCode}</td><td>{line.snapshot.productName}</td><td>{line.snapshot.colorName}</td><td>{line.snapshot.fitName}</td><td>{line.snapshot.sizeName}</td><td className="sales-numeric">{line.quantity}</td><td className="sales-numeric">{line.referencePrice === null ? '未记录' : salesMoney(line.referencePrice)}</td><td>{line.discountTenths === null ? '未记录' : `${Math.trunc(line.discountTenths / 10)}.${line.discountTenths % 10}折`}</td><td className="sales-numeric">{salesMoney(line.dealPrice)}</td><td className="sales-numeric">{salesMoney(line.lineAmount)}</td><td className="sales-numeric">{salesMoney(line.allocatedDiscount)}</td><td>{line.isGift ? '是' : '否'}</td><td>{line.snapshot.barcode ?? '未记录'}</td></tr>)}
      {!lines.length && <tr><td colSpan={14}>本单没有实际明细行</td></tr>}
    </tbody></table></div>
    <dl className="sales-amounts"><div><dt>合计金额</dt><dd>{salesMoney(header.grossAmount)}</dd></div><div><dt>整单优惠</dt><dd>{salesMoney(header.orderDiscount)}</dd></div><div><dt>应结金额</dt><dd>{salesMoney(header.netDue)}</dd></div></dl>
    <section className="sales-settlements"><h3>本单收退明细</h3><p className="muted">仅记录本单收款或退款金额。</p><table className="sales-table"><thead><tr><th scope="col">序号</th><th scope="col">资金账户（单据记录）</th><th scope="col">收款方式（单据记录）</th><th scope="col">方向</th><th scope="col">金额</th></tr></thead><tbody>{settlements.map(line => {
      const names = settlementNames.get(line.id)!;
      return <tr key={line.id}><td>{line.lineNo}</td><td>{names.accountNameSnapshot}{names.currentAccountName !== names.accountNameSnapshot && <small className="sales-current-name">现名称：{names.currentAccountName}</small>}</td><td>{names.methodNameSnapshot}{names.currentMethodName !== names.methodNameSnapshot && <small className="sales-current-name">现名称：{names.currentMethodName}</small>}</td><td>{line.direction === 'RECEIVE' ? '收款' : '退款'}</td><td className="sales-numeric">{salesMoney(line.amount)}</td></tr>;
    })}{!settlements.length && <tr><td colSpan={5}>本单没有收退明细</td></tr>}</tbody></table></section>

    <dl className="sales-detail-header"><div className="sales-note"><dt>备注</dt><dd>{header.note ?? '未填写'}</dd></div><div><dt>创建时间</dt><dd>{header.createdAt}</dd></div><div><dt>更新时间</dt><dd>{header.updatedAt}</dd></div><div><dt>审核时间</dt><dd>{header.approvedAt ?? '未记录'}</dd></div></dl>
  </div>;
}
