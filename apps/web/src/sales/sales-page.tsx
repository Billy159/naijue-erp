import { useRef, useState, useSyncExternalStore } from 'react';
import type { SalesPageController } from './controller.ts';
import { emptySalesFilter, type SalesFilterDraft, type SalesListQuery, type SalesQueryPageSize, type SalesReferenceKind, type SalesReferenceReader, type SalesSummaryDto } from './contracts.ts';
import { SalesDetailHost } from './detail-host.tsx';
import { salesMoney, salesParameters, salesStatusLabels, salesTypeLabels } from './model.ts';
import { SalesReferenceSelector } from './reference-selector.tsx';
import { SalesPagination } from './sales-pagination.tsx';

export interface SalesPageProps { readonly controller: SalesPageController; readonly references: SalesReferenceReader }
const refLabels: Readonly<Record<SalesReferenceKind, string>> = { hall: '营业厅', salesperson: '营业员', customer: '客户', warehouse: '出库仓' };
function scopeLabel(parameters: Readonly<SalesListQuery>): string {
  const f = parameters.filter;
  return `${f.startDate ?? '不限开始日期'} 至 ${f.endDate ?? '不限结束日期'} · ${f.status ? salesStatusLabels[f.status] : '全部状态'} · ${f.businessType ? salesTypeLabels[f.businessType] : '全部业务类型'}${f.number ? ` · 单号包含 ${f.number}` : ''}`;
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
  return <div className="iw-workbench sales-workbench">
    <div className="iw-head"><h1>销货列表</h1></div>
    <form className="iw-query" aria-label="销货筛选" onSubmit={event => { event.preventDefault(); try { run(salesParameters(draft, size)); } catch { setInputError(true); } }}>
      <div className="iw-query-row">
        <label className="iw-field"><span>开始日期</span><input className="iw-control" type="date" aria-label="开始日期" value={draft.startDate} onChange={event => setDraft(value => ({ ...value, startDate: event.target.value }))} /></label>
        <label className="iw-field"><span>结束日期</span><input className="iw-control" type="date" aria-label="结束日期" value={draft.endDate} onChange={event => setDraft(value => ({ ...value, endDate: event.target.value }))} /></label>
        <label className="iw-field"><span>状态</span><select className="iw-control" aria-label="状态" value={draft.status ?? ''} onChange={event => setDraft(value => ({ ...value, status: event.target.value === '' ? null : event.target.value as SalesFilterDraft['status'] }))}><option value="">全部</option>{Object.entries(salesStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="iw-field"><span>业务类型</span><select className="iw-control" aria-label="业务类型" value={draft.businessType ?? ''} onChange={event => setDraft(value => ({ ...value, businessType: event.target.value === '' ? null : event.target.value as SalesFilterDraft['businessType'] }))}><option value="">全部</option>{Object.entries(salesTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {reference('hall')}{reference('salesperson')}
        <div className="iw-query-actions"><button type="button" className="iw-text-button" aria-expanded={advanced} onClick={() => setAdvanced(value => !value)}>高级筛选 {advanced ? '⌃' : '⌄'}</button><button type="submit" className="iw-button iw-primary">查询</button><button type="button" className="iw-button" onClick={() => { setDraft(emptySalesFilter()); setInputError(false); }}>重置</button></div>
      </div>
      {advanced && <div className="iw-query-row iw-advanced"><label className="iw-field"><span>单号</span><input className="iw-control" aria-label="单号" value={draft.number} maxLength={200} onChange={event => setDraft(value => ({ ...value, number: event.target.value }))} /></label>{reference('customer')}{reference('warehouse')}</div>}
      <p className={`iw-query-note ${dirty ? 'iw-dirty' : ''}`}>{dirty ? '条件已修改，点击「查询」后生效；当前结果仍使用上次已执行条件。' : '修改条件后，点击「查询」更新结果。'}</p>
      {inputError && <p className="iw-alert" role="alert">筛选条件无效，请检查日期顺序及单号。</p>}
    </form>
    <div className="iw-result-tools"><div className="iw-stats"><strong>{busy ? '正在查询' : snapshot.phase === 'error' ? '查询未完成' : data ? '查询结果' : '等待查询'}</strong><span>{success ? `已执行：${scopeLabel(success.parameters)}` : '设置条件后点击查询'}</span></div></div>
    {snapshot.phase === 'error' && <div className="iw-alert" role="alert">销货查询失败。{data && '以下保留上次成功结果，并非本次新结果。'}{changingSize && ` 本次 ${pendingSize} 张/页读取失败，当前仍显示 ${size} 张/页。`}<button type="button" className="iw-link" onClick={() => { if (snapshot.request) run(snapshot.request.parameters); }}>重试</button></div>}
    {busy && <div className="iw-loading-note" role="status">{data ? changingSize ? `正在按 ${pendingSize} 张/页更新，以下仍为 ${size} 张/页的上次结果。` : '正在更新，以下为上次已执行范围的结果。' : '正在加载销货单…'}<button type="button" className="iw-link" onClick={() => query.cancel()}>取消本次读取</button></div>}
    <div ref={results} className="iw-results sales-results" role="region" aria-label="销货查询结果" aria-busy={busy} tabIndex={0}>
      {data ? data.items.length ? <table className="sales-table sales-list"><thead><tr>{['单号', '日期', '状态', '业务类型', '营业厅', '营业员', '客户', '出库仓', '合计金额', '整单优惠', '应结金额', '操作'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{data.items.map(row => <tr key={row.id}><td><button type="button" className="iw-link sales-number" onClick={() => open(row)}>{row.number}</button></td><td>{row.businessDate}</td><td>{salesStatusLabels[row.status]}</td><td>{salesTypeLabels[row.businessType]}</td><td>{row.hallName}</td><td>{row.salespersonName ?? '未指定'}</td><td>{row.customerName}</td><td>{row.warehouseName}</td><td className="sales-numeric">{salesMoney(row.grossAmount)}</td><td className="sales-numeric">{salesMoney(row.orderDiscount)}</td><td className="sales-numeric">{salesMoney(row.netDue)}</td><td><button type="button" className="iw-link sales-view" onClick={() => open(row)}>查看</button></td></tr>)}</tbody></table> : <div className="iw-empty"><strong>没有匹配的销货单</strong><p>本次查询已完成，可调整条件后重新查询。</p></div> : <div className="iw-empty"><strong>{busy ? '正在查询' : snapshot.phase === 'error' ? '查询未完成' : '等待查询'}</strong><p>设置筛选条件后，点击「查询」查看销货单。</p></div>}
    </div>
    <SalesPagination page={data?.page ?? 1} pageSize={size} total={data?.exactTotal ?? null} busy={busy} onPage={page => { if (success) run({ ...success.parameters, page }); }} onPageSize={pageSize => { if (success) run({ ...success.parameters, page: 1, pageSize }); else setInitialSize(pageSize); }} />
    {target && <SalesDetailHost key={`${target.row.id}:${target.sequence}`} parentScope={scope} salesId={target.row.id} reader={reader} close={close} />}
  </div>;
}
