import type { SalesProductCapability } from './document-presentation.tsx';
import { SalesStatusTag } from './sales-status-tag.tsx';
import { UIButton, UIDate } from '../components/standard-controls.tsx';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { SalesPageController } from './controller.ts';
import { emptySalesFilter, type SalesFilterDraft, type SalesListQuery, type SalesQueryPageSize, type SalesReferenceKind, type SalesReferenceReader, type SalesSummaryDto } from './contracts.ts';
import { SalesDetailHost } from './detail-host.tsx';
import { useDocumentNavigation } from '../demo-presentation/document-navigation.tsx';
import { salesMoney, salesParameters, salesTypeGroupLabels } from './model.ts';
import { SalesStatusSelect, SalesBusinessTypeSelect, SalesReferenceMultiSelect } from './filter-controls.tsx';
import { useSalesReferencePopupHost } from './reference-popup-host.ts';
import { SalesPagination } from './sales-pagination.tsx';

export interface SalesPageWriteActions {
  readonly active: boolean; readonly view?: 'new' | 'document'; readonly canCreate: boolean; readonly preparing: boolean;
  readonly commitRevision: number;
  readonly openCreate: () => void; readonly canLeave?: () => boolean; readonly close?: () => void; readonly openExisting: (salesId: string) => void; readonly editor: ReactNode;
}
export interface SalesPageProps { readonly controller: SalesPageController; readonly references: SalesReferenceReader; readonly loadDetailStyles?: () => Promise<unknown>; readonly write?: SalesPageWriteActions; readonly product?: SalesProductCapability }
const listColumns = ['日期', '销货单号', '状态', '业务类型', '营业厅', '营业员', '商品信息', '数量', '金额', '最后更新', '操作'] as const;
const refLabels: Readonly<Record<SalesReferenceKind, string>> = { hall: '营业厅', salesperson: '营业员', customer: '客户', warehouse: '出库仓' };
// Frozen sales-current.js:7–8. Native timestamps remain authoritative; format
// only for display, with no locale-dependent parsing of business dates.
const updatedClock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function updatedMinute(timestamp: string): string {
  const parts = Object.fromEntries(updatedClock.formatToParts(new Date(timestamp)).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}
export function SalesPageView({ controller, references, loadDetailStyles, write, product }: SalesPageProps) {
  const { list: query, scope, reader } = controller;
  const referencePopupHost = useSalesReferencePopupHost(scope);
  const snapshot = useSyncExternalStore(query.subscribe, query.getSnapshot, query.getSnapshot);
  const [draft, setDraft] = useState<SalesFilterDraft>(emptySalesFilter); const [initialSize, setInitialSize] = useState<SalesQueryPageSize>(20);
  const [advanced, setAdvanced] = useState(false); const [inputError, setInputError] = useState(false);
  const [target, setTarget] = useState<{ row: SalesSummaryDto; sequence: number } | null>(null); const sequence = useRef(0);
  const requestedWriteRevision = useRef(write?.commitRevision ?? 0), [appliedWriteRevision, setAppliedWriteRevision] = useState(write?.commitRevision ?? 0);
  const results = useRef<HTMLDivElement>(null); const heading = useRef<HTMLHeadingElement>(null); const returnContext = useRef<{ trigger: HTMLElement | null; top: number; left: number } | null>(null);
  const detailAvailable = typeof loadDetailStyles === 'function';
  const detailActive = !!write?.active || target !== null && detailAvailable;
  useEffect(() => {
    const abort = () => { setTarget(null); returnContext.current = null; };
    scope.signal.addEventListener('abort', abort, { once: true });
    return () => scope.signal.removeEventListener('abort', abort);
  }, [scope]);
  // Restore after React reveals the retained list. Focusing a hidden trigger in
  // the close handler loses focus in real browsers even if synthetic DOM allows it.
  useLayoutEffect(() => {
    if (target && !detailAvailable) setTarget(null);
    if (detailActive || !scope.active) return;
    const previous = returnContext.current; if (!previous) return;
    if (results.current) { results.current.scrollTop = previous.top; results.current.scrollLeft = previous.left; }
    if (previous.trigger?.isConnected && !previous.trigger.matches(':disabled') && !previous.trigger.closest('[hidden]')) previous.trigger.focus({ preventScroll: true }); else heading.current?.focus({ preventScroll: true });
    returnContext.current = null;
  }, [target, detailActive, detailAvailable, scope]);
  const open = (row: SalesSummaryDto) => {
    if (!detailAvailable || !scope.active) return;
    returnContext.current = { trigger: document.activeElement instanceof HTMLElement ? document.activeElement : null, top: results.current?.scrollTop ?? 0, left: results.current?.scrollLeft ?? 0 };
    if (query.getSnapshot().phase === 'loading') query.cancel();
    if (write) { write.openExisting(row.id); return; }
    setTarget({ row, sequence: ++sequence.current });
  };
  const create = (): boolean => {
    if (write?.active && write.view === 'new') return true;
    if (!write?.canCreate || write.preparing || write.canLeave?.() === false) return false;
    returnContext.current = { trigger: document.activeElement instanceof HTMLElement ? document.activeElement : null, top: results.current?.scrollTop ?? 0, left: results.current?.scrollLeft ?? 0 };
    if (query.getSnapshot().phase === 'loading') query.cancel(); write.openCreate(); return true;
  };
  useDocumentNavigation({ kind: 'sales', view: write?.active ? write.view ?? 'document' : target ? 'document' : 'list', canCreate: scope.active && !!write?.canCreate && !write.preparing,
    openCreate: create,
    showList: () => { if (write?.active) { if (!write.close || write.canLeave?.() !== true) return false; write.close(); return true; } setTarget(null); return true; } });
  const success = snapshot.success; const data = success?.data; const busy = snapshot.phase === 'loading'; const size = success?.parameters.pageSize ?? initialSize;
  useEffect(() => { if (success) setAppliedWriteRevision(requestedWriteRevision.current); }, [success]);
  const pendingSize = snapshot.request?.parameters.pageSize; const changingSize = !!data && pendingSize !== undefined && pendingSize !== size;
  let dirty = false; try { dirty = !!success && JSON.stringify(salesParameters(draft, size).filter) !== JSON.stringify(success.parameters.filter); } catch { dirty = !!success; }
  const run = (parameters: Readonly<SalesListQuery>) => { setInputError(false); requestedWriteRevision.current = write?.commitRevision ?? 0; void query.run(parameters); };
  // Frozen sales list reads its first bounded summary page on entry. Reference
  // catalogues and document bodies remain action-only. Query's own identity,
  // sequence and abort owner survives StrictMode replay and rejects late work.
  useEffect(() => {
    if (!scope.active || detailActive || query.getSnapshot().phase !== 'idle') return;
    requestedWriteRevision.current = write?.commitRevision ?? 0;
    void query.run(salesParameters(emptySalesFilter(), 20));
  }, [query, scope, detailActive]);
  const reset = () => {
    if (!scope.active || detailActive) return;
    const cleared = emptySalesFilter(); setDraft(cleared);
    if (results.current) { results.current.scrollTop = 0; results.current.scrollLeft = 0; }
    run(salesParameters(cleared, size));
  };
  const reference = (kind: SalesReferenceKind) => <div className="iw-field sales-reference"><span>{refLabels[kind]}</span><SalesReferenceMultiSelect popupHost={referencePopupHost} active={!detailActive} scope={scope} reader={references} kind={kind} label={refLabels[kind]} value={draft[kind]} onChange={value => setDraft(previous => ({ ...previous, [kind]: value }))} /></div>;
  if (snapshot.phase === 'disposed' || !scope.active) return <div className="iw-empty" role="status"><strong>当前读取范围已关闭</strong><p>旧身份结果已清除，请重新进入销货页。</p></div>;
  const advancedCount = [draft.number.trim(), draft.customer.length > 0, draft.warehouse.length > 0].filter(Boolean).length;
  return <div className="sales-route"><section className="tc-workbench tc-list sales-workbench" data-document-list="sales" hidden={detailActive}>
    <div className="tc-head"><h1 ref={heading} tabIndex={-1}>销货单列表</h1><button type="button" className="btn primary" disabled={!write?.canCreate || write.preparing} title={write?.canCreate ? undefined : '新增销货单尚缺当前授权资料、价格及编号准备，尚未接入'} onClick={create}>新增销货单</button></div>
    <form id="sale-filter" className="tc-filters tc-filters-two-row" aria-label="销货筛选" onSubmit={event => { event.preventDefault(); try { run(salesParameters(draft, size)); } catch { setInputError(true); } }}>
      <div className="tc-filter-row tc-filter-primary">
        <label className="iw-field tc-date-field"><span>开始日期</span><UIDate className="iw-control"  aria-label="开始日期" placeholder="开始日期" value={draft.startDate} onChange={nextValue => setDraft(value => ({ ...value, startDate: nextValue }))} /></label>
        <label className="iw-field tc-date-field"><span>结束日期</span><UIDate className="iw-control"  aria-label="结束日期" placeholder="结束日期" value={draft.endDate} onChange={nextValue => setDraft(value => ({ ...value, endDate: nextValue }))} /></label>
        <div className="iw-field tc-status-field"><span>状态</span><SalesStatusSelect scope={scope} popupHost={referencePopupHost} active={!detailActive} value={draft.statuses} onChange={statuses => setDraft(value => ({ ...value, statuses }))} /></div>
        <div className="iw-field"><span>业务类型</span><SalesBusinessTypeSelect scope={scope} popupHost={referencePopupHost} active={!detailActive} value={draft.businessTypes} onChange={businessTypes => setDraft(value => ({ ...value, businessTypes }))} /></div>
        {reference('hall')}{reference('salesperson')}
        <div className="tc-filter-actions"><button type="button" className="btn tc-filter-toggle" aria-expanded={advanced} aria-controls="sale-extra-filters" onClick={() => setAdvanced(value => !value)}><span className="iw-filter-icon" aria-hidden="true">☷</span><span>{advanced ? '收起筛选' : '高级筛选'}</span>{advancedCount > 0 && <span className="iw-filter-count">{advancedCount}</span>}<span aria-hidden="true">{advanced ? '▴' : '▾'}</span></button><button type="submit" className="btn primary" disabled={busy}>查询</button><button type="button" className="btn" onClick={reset}>重置</button></div>
      </div>
      {advanced && <div className="tc-filter-row tc-filter-secondary" id="sale-extra-filters"><label className="iw-field tc-number-field"><span>单号</span><input className="iw-control" name="q" aria-label="销货单号" autoComplete="off" placeholder="输入单号模糊搜索" value={draft.number} maxLength={200} onChange={event => { const number = event.currentTarget.value; setDraft(value => ({ ...value, number })); }} /></label>{reference('customer')}{reference('warehouse')}</div>}
      {inputError && <p className="iw-alert" role="alert">筛选条件无效，请检查日期顺序及单号。</p>}
    </form>
    <p className="ui-query-note" role="status" data-pending={dirty}>{dirty ? '条件已修改，点击“查询”更新结果。' : '修改条件后点击“查询”；“重置”恢复全部结果。'}</p>
    {data && write && write.commitRevision > appliedWriteRevision && <p className="iw-alert" role="status">本页仍是单据操作前的查询结果，状态、数量和金额尚未刷新；点击“查询”读取当前范围。</p>}
    {snapshot.phase === 'error' && <div className="iw-alert" role="alert">销货查询失败。{data && '以下保留上次成功结果，并非本次新结果。'}{changingSize && ` 本次 ${pendingSize} 张/页读取失败，当前仍显示 ${size} 张/页。`}<UIButton type="button" className="iw-link" onClick={() => { if (snapshot.request) run(snapshot.request.parameters); }}>重试</UIButton></div>}
    {busy && data && <div className="iw-loading-note" role="status">{data ? changingSize ? `正在按 ${pendingSize} 张/页更新，以下仍为 ${size} 张/页的上次结果。` : '正在更新，以下为上次已执行范围的结果。' : '正在加载销货单…'}<UIButton type="button" className="iw-link" onClick={() => query.cancel()}>取消本次读取</UIButton></div>}
    <div ref={results} className="tc-list-scroll sales-results" role="region" aria-label="销货查询结果" aria-busy={busy} tabIndex={0}>
      {data ? <><table className="sales-table sales-list" aria-label="销货单列表"><thead><tr>{listColumns.map(title => <th key={title} scope="col" className={title === '操作' ? 'ui-action-cell' : undefined}>{title}</th>)}</tr></thead><tbody>{data.items.map(row => <tr key={row.id}>
        <td>{row.businessDate}</td><td><button type="button" className="btn tc-link sales-number" title={detailAvailable ? row.number : '详情样式尚未配置，暂不可查看'} disabled={!detailAvailable} onClick={() => open(row)}>{row.number}</button></td>
        <td><SalesStatusTag status={row.status} className="tc-state-tag" /></td><td>{salesTypeGroupLabels[row.businessType === 'SALE' ? 'SALE' : 'RETURN_EXCHANGE']}</td>
        <td title={row.hallName}>{row.hallName}</td><td title={row.salespersonName ?? '未指定'}>{row.salespersonName ?? '未指定'}</td>
        <td><span className="sales-unavailable" title="当前原生单据未保存历史商品分类快照，不根据现商品资料推断">历史分类未提供</span></td>
        <td className="sales-numeric">{row.businessType === 'SALE' ? row.quantity : `退${row.incomingQuantity} · 换${row.outgoingQuantity}`}</td><td className="sales-numeric">{salesMoney(row.netDue)}</td>
        <td title={row.updatedAt}>{updatedMinute(row.updatedAt)}</td><td className="ui-action-cell"><button type="button" className="btn tc-link sales-view" disabled={!detailAvailable} title={detailAvailable ? undefined : '详情样式尚未配置，暂不可查看'} onClick={() => open(row)}>查看</button></td>
      </tr>)}</tbody></table>{data.items.length === 0 && <div className="tc-empty">没有符合条件的销货单</div>}</> : snapshot.phase === 'error' ? <div className="tc-empty">查询未完成</div> : busy ? <div className="iw-loading" role="status"><span className="iw-spinner" aria-hidden="true" /><strong>正在查询销货单</strong><UIButton type="button" className="iw-link" onClick={() => query.cancel()}>取消本次读取</UIButton></div> : <div className="tc-empty" role="status"><strong>尚未读取销货单</strong><p>点击“查询”读取当前条件。</p></div>}
    </div>
    <SalesPagination scope={scope} active={!detailActive} page={data?.page ?? 1} pageSize={size} total={data?.exactTotal ?? null} busy={busy} onPage={page => { if (success) run({ ...success.parameters, page }); }} onPageSize={pageSize => { if (success) run({ ...success.parameters, page: 1, pageSize }); else setInitialSize(pageSize); }} />
  </section>
    {target && detailActive && loadDetailStyles && <SalesDetailHost key={`${target.row.id}:${target.sequence}`} parentScope={scope} salesId={target.row.id} reader={reader} {...(product ? { product } : {})} loadDetailStyles={loadDetailStyles} close={() => setTarget(null)} />}
    {write?.active && write.editor}
  </div>;
}
