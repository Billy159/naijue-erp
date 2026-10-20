import { useRef, useState, useSyncExternalStore } from 'react';
import type { SalesPageController } from './controller.ts';
import { emptySalesFilter, type SalesFilterDraft, type SalesListQuery, type SalesQueryPageSize, type SalesReferenceKind, type SalesReferenceReader, type SalesSummaryDto } from './contracts.ts';
import { SalesDetailHost } from './detail-host.tsx';
import { salesMoney, salesParameters, salesStatusLabels, salesTypeLabels } from './model.ts';
import { SalesReferenceSelector } from './reference-selector.tsx';
import { SalesPagination } from './sales-pagination.tsx';

export interface SalesPageProps { readonly controller: SalesPageController; readonly references: SalesReferenceReader }
const refLabels: Readonly<Record<SalesReferenceKind, string>> = { hall: '营业厅', salesperson: '营业员', customer: '客户', warehouse: '出库仓' };
// Frozen sales-current.js:7–8. Native timestamps remain authoritative; format
// only for display, with no locale-dependent parsing of business dates.
const updatedClock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function updatedMinute(timestamp: string): string {
  const parts = Object.fromEntries(updatedClock.formatToParts(new Date(timestamp)).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}
export function SalesPageView({ controller, references }: SalesPageProps) {
  const { list: query, scope, reader } = controller;
  const snapshot = useSyncExternalStore(query.subscribe, query.getSnapshot, query.getSnapshot);
  const [draft, setDraft] = useState<SalesFilterDraft>(emptySalesFilter); const [initialSize, setInitialSize] = useState<SalesQueryPageSize>(20);
  const [advanced, setAdvanced] = useState(false); const [inputError, setInputError] = useState(false);
  const [target, setTarget] = useState<{ row: SalesSummaryDto; sequence: number } | null>(null); const sequence = useRef(0);
  const results = useRef<HTMLDivElement>(null); const returnContext = useRef<{ trigger: HTMLElement | null; top: number; left: number } | null>(null);
  const open = (row: SalesSummaryDto) => { returnContext.current = { trigger: document.activeElement instanceof HTMLElement ? document.activeElement : null, top: results.current?.scrollTop ?? 0, left: results.current?.scrollLeft ?? 0 }; setTarget({ row, sequence: ++sequence.current }); };
  const close = () => { setTarget(null); const previous = returnContext.current; if (results.current && previous) { results.current.scrollTop = previous.top; results.current.scrollLeft = previous.left; } if (previous?.trigger?.isConnected) previous.trigger.focus({ preventScroll: true }); returnContext.current = null; };
  const success = snapshot.success; const data = success?.data; const busy = snapshot.phase === 'loading'; const size = success?.parameters.pageSize ?? initialSize;
  const pendingSize = snapshot.request?.parameters.pageSize; const changingSize = !!data && pendingSize !== undefined && pendingSize !== size;
  let dirty = false; try { dirty = !!success && JSON.stringify(salesParameters(draft, size).filter) !== JSON.stringify(success.parameters.filter); } catch { dirty = !!success; }
  const run = (parameters: Readonly<SalesListQuery>) => { setInputError(false); void query.run(parameters); };
  const reference = (kind: SalesReferenceKind) => <SalesReferenceSelector parentScope={scope} reader={references} kind={kind} label={refLabels[kind]} value={draft[kind]} onChange={value => setDraft(previous => ({ ...previous, [kind]: value }))} />;
  if (snapshot.phase === 'disposed' || !scope.active) return <div className="iw-empty" role="status"><strong>当前读取范围已关闭</strong><p>旧身份结果已清除，请重新进入销货页。</p></div>;
  const advancedCount = [draft.number.trim(), draft.customer, draft.warehouse].filter(Boolean).length;
  return <section className="tc-workbench tc-list sales-workbench" data-document-list="sales">
    <div className="tc-head"><h1>销货单列表</h1><button type="button" className="iw-button iw-primary" disabled title="新增销货单尚未接入">新增销货单</button></div>
    <form className="tc-filters tc-filters-two-row" aria-label="销货筛选" onSubmit={event => { event.preventDefault(); try { run(salesParameters(draft, size)); } catch { setInputError(true); } }}>
      <div className="tc-filter-row tc-filter-primary">
        <label className="iw-field"><span>开始日期</span><input className="iw-control" type="date" aria-label="开始日期" value={draft.startDate} onChange={event => setDraft(value => ({ ...value, startDate: event.target.value }))} /></label>
        <label className="iw-field"><span>结束日期</span><input className="iw-control" type="date" aria-label="结束日期" value={draft.endDate} onChange={event => setDraft(value => ({ ...value, endDate: event.target.value }))} /></label>
        <label className="iw-field"><span>状态</span><select className="iw-control" aria-label="状态" value={draft.status ?? ''} onChange={event => setDraft(value => ({ ...value, status: event.target.value === '' ? null : event.target.value as SalesFilterDraft['status'] }))}><option value="">全部状态</option>{Object.entries(salesStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="iw-field"><span>业务类型</span><select className="iw-control" aria-label="业务类型" value={draft.businessType ?? ''} onChange={event => setDraft(value => ({ ...value, businessType: event.target.value === '' ? null : event.target.value as SalesFilterDraft['businessType'] }))}><option value="">全部业务类型</option>{Object.entries(salesTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {reference('hall')}{reference('salesperson')}
        <div className="tc-filter-actions"><button type="button" className="iw-text-button tc-filter-toggle" aria-expanded={advanced} aria-controls="sales-extra-filters" onClick={() => setAdvanced(value => !value)}><span aria-hidden="true">☷</span><span>{advanced ? '收起筛选' : '高级筛选'}</span>{advancedCount > 0 && <span className="iw-filter-count">{advancedCount}</span>}<span aria-hidden="true">{advanced ? '▴' : '▾'}</span></button><button type="submit" className="iw-button iw-primary">查询</button><button type="button" className="iw-button" onClick={() => { setDraft(emptySalesFilter()); setInputError(false); }}>重置</button></div>
      </div>
      {advanced && <div className="tc-filter-row tc-filter-secondary" id="sales-extra-filters"><label className="iw-field"><span>单号</span><input className="iw-control" aria-label="单号" autoComplete="off" placeholder="输入单号模糊搜索" value={draft.number} maxLength={200} onChange={event => setDraft(value => ({ ...value, number: event.target.value }))} /></label>{reference('customer')}{reference('warehouse')}</div>}
      {inputError && <p className="iw-alert" role="alert">筛选条件无效，请检查日期顺序及单号。</p>}
    </form>
    <p className="ui-query-note" role="status" data-pending={dirty}>{dirty ? '条件已修改，点击“查询”更新结果；当前仍为上次结果。' : '修改条件后点击“查询”；“重置”仅清空条件，查询后生效。'}</p>
    {snapshot.phase === 'error' && <div className="iw-alert" role="alert">销货查询失败。{data && '以下保留上次成功结果，并非本次新结果。'}{changingSize && ` 本次 ${pendingSize} 张/页读取失败，当前仍显示 ${size} 张/页。`}<button type="button" className="iw-link" onClick={() => { if (snapshot.request) run(snapshot.request.parameters); }}>重试</button></div>}
    {busy && <div className="iw-loading-note" role="status">{data ? changingSize ? `正在按 ${pendingSize} 张/页更新，以下仍为 ${size} 张/页的上次结果。` : '正在更新，以下为上次已执行范围的结果。' : '正在加载销货单…'}<button type="button" className="iw-link" onClick={() => query.cancel()}>取消本次读取</button></div>}
    <div ref={results} className="tc-list-scroll sales-results" role="region" aria-label="销货查询结果" aria-busy={busy} tabIndex={0}>
      {data ? data.items.length ? <table className="sales-table sales-list"><thead><tr>{['日期', '销货单号', '状态', '业务类型', '营业厅', '营业员', '商品信息', '数量', '金额', '最后更新', '操作'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{data.items.map(row => <tr key={row.id}><td>{row.businessDate}</td><td><button type="button" className="iw-link sales-number" title={row.number} onClick={() => open(row)}>{row.number}</button></td><td><span className="tc-state-tag" data-document-status={row.status === 'APPROVED' ? 'effective' : row.status === 'VOID' ? 'void' : 'pending'}>{salesStatusLabels[row.status]}</span></td><td>{salesTypeLabels[row.businessType]}</td><td title={row.hallName}>{row.hallName}</td><td title={row.salespersonName ?? '未指定'}>{row.salespersonName ?? '未指定'}</td><td><span className="sales-unavailable" title="当前原生单据未保存历史商品分类快照，不根据现商品资料推断">历史分类未提供</span></td><td className="sales-numeric">{row.businessType === 'SALE' ? row.quantity : `退${row.incomingQuantity} · 换${row.outgoingQuantity}`}</td><td className="sales-numeric">{salesMoney(row.netDue)}</td><td title={row.updatedAt}>{updatedMinute(row.updatedAt)}</td><td><button type="button" className="iw-link sales-view" onClick={() => open(row)}>查看</button></td></tr>)}</tbody></table> : <div className="tc-empty"><strong>没有符合条件的销货单</strong><p>本次查询已完成，可调整条件后重新查询。</p></div> : <div className="tc-empty"><strong>{busy ? '正在查询销货单' : snapshot.phase === 'error' ? '查询未完成' : '等待查询'}</strong><p>设置筛选条件后，点击「查询」查看销货单。</p></div>}
    </div>
    <SalesPagination page={data?.page ?? 1} pageSize={size} total={data?.exactTotal ?? null} busy={busy} onPage={page => { if (success) run({ ...success.parameters, page }); }} onPageSize={pageSize => { if (success) run({ ...success.parameters, page: 1, pageSize }); else setInitialSize(pageSize); }} />
    {target && <SalesDetailHost key={`${target.row.id}:${target.sequence}`} parentScope={scope} salesId={target.row.id} reader={reader} close={close} />}
  </section>;
}
