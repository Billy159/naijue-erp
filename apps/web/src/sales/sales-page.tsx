import { SalesStatusTag } from './sales-status-tag.tsx';
import { StandardReadTable } from '../components/standard-read-table.tsx';
import { UIButton, UIDate, UIInput } from '../components/standard-controls.tsx';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { SalesPageController } from './controller.ts';
import { emptySalesFilter, type SalesFilterDraft, type SalesListQuery, type SalesQueryPageSize, type SalesReferenceKind, type SalesReferenceReader, type SalesSummaryDto } from './contracts.ts';
import { SalesDetailHost } from './detail-host.tsx';
import { useDocumentNavigation } from '../demo-presentation/document-navigation.tsx';
import { salesMoney, salesParameters, salesTypeLabels } from './model.ts';
import { SalesStatusSelect, SalesBusinessTypeSelect, SalesReferenceMultiSelect } from './filter-controls.tsx';
import { useSalesReferencePopupHost } from './reference-popup-host.ts';
import { SalesPagination } from './sales-pagination.tsx';

export interface SalesPageWriteActions {
  readonly active: boolean; readonly view?: 'new' | 'document'; readonly canCreate: boolean; readonly preparing: boolean;
  readonly commitRevision: number;
  readonly openCreate: () => void; readonly canLeave?: () => boolean; readonly close?: () => void; readonly openExisting: (salesId: string) => void; readonly editor: ReactNode;
}
export interface SalesPageProps { readonly controller: SalesPageController; readonly references: SalesReferenceReader; readonly loadDetailStyles?: () => Promise<unknown>; readonly write?: SalesPageWriteActions }
const refLabels: Readonly<Record<SalesReferenceKind, string>> = { hall: '营业厅', salesperson: '营业员', customer: '客户', warehouse: '出库仓' };
// Frozen sales-current.js:7–8. Native timestamps remain authoritative; format
// only for display, with no locale-dependent parsing of business dates.
const updatedClock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function updatedMinute(timestamp: string): string {
  const parts = Object.fromEntries(updatedClock.formatToParts(new Date(timestamp)).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}
export function SalesPageView({ controller, references, loadDetailStyles, write }: SalesPageProps) {
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
  const reference = (kind: SalesReferenceKind) => <div className="iw-field sales-reference"><span>{refLabels[kind]}</span><SalesReferenceMultiSelect popupHost={referencePopupHost} active={!detailActive} scope={scope} reader={references} kind={kind} label={refLabels[kind]} value={draft[kind]} onChange={value => setDraft(previous => ({ ...previous, [kind]: value }))} /></div>;
  if (snapshot.phase === 'disposed' || !scope.active) return <div className="iw-empty" role="status"><strong>当前读取范围已关闭</strong><p>旧身份结果已清除，请重新进入销货页。</p></div>;
  const advancedCount = [draft.number.trim(), draft.customer.length > 0, draft.warehouse.length > 0].filter(Boolean).length;
  return <div className="sales-route"><section className="tc-workbench tc-list sales-workbench" data-document-list="sales" hidden={detailActive}>
    <div className="tc-head"><h1 ref={heading} tabIndex={-1}>销货单列表</h1><UIButton type="button" className="iw-button iw-primary" disabled={!write?.canCreate || write.preparing} title={write?.canCreate ? undefined : '新增销货单尚缺当前授权资料、价格及编号准备，尚未接入'} onClick={create}>新增销货单</UIButton></div>
    <form className="tc-filters tc-filters-two-row" aria-label="销货筛选" onSubmit={event => { event.preventDefault(); try { run(salesParameters(draft, size)); } catch { setInputError(true); } }}>
      <div className="tc-filter-row tc-filter-primary">
        <label className="iw-field"><span>开始日期</span><UIDate className="iw-control"  aria-label="开始日期" value={draft.startDate} onChange={nextValue => setDraft(value => ({ ...value, startDate: nextValue }))} /></label>
        <label className="iw-field"><span>结束日期</span><UIDate className="iw-control"  aria-label="结束日期" value={draft.endDate} onChange={nextValue => setDraft(value => ({ ...value, endDate: nextValue }))} /></label>
        <div className="iw-field"><span>状态</span><SalesStatusSelect scope={scope} popupHost={referencePopupHost} active={!detailActive} value={draft.statuses} onChange={statuses => setDraft(value => ({ ...value, statuses }))} /></div>
        <div className="iw-field"><span>业务类型</span><SalesBusinessTypeSelect scope={scope} popupHost={referencePopupHost} active={!detailActive} value={draft.businessTypes} onChange={businessTypes => setDraft(value => ({ ...value, businessTypes }))} /></div>
        {reference('hall')}{reference('salesperson')}
        <div className="tc-filter-actions"><UIButton type="button" className="iw-text-button tc-filter-toggle" aria-expanded={advanced} aria-controls="sales-extra-filters" onClick={() => setAdvanced(value => !value)}><span aria-hidden="true">☷</span><span>{advanced ? '收起筛选' : '高级筛选'}</span>{advancedCount > 0 && <span className="iw-filter-count">{advancedCount}</span>}<span aria-hidden="true">{advanced ? '▴' : '▾'}</span></UIButton><UIButton type="submit" className="iw-button iw-primary">查询</UIButton><UIButton type="button" className="iw-button" onClick={() => { setDraft(emptySalesFilter()); setInputError(false); }}>重置</UIButton></div>
      </div>
      {advanced && <div className="tc-filter-row tc-filter-secondary" id="sales-extra-filters"><label className="iw-field"><span>单号</span><UIInput className="iw-control" aria-label="单号" autoComplete="off" placeholder="输入单号模糊搜索" value={draft.number} maxLength={200} onChange={nextValue => setDraft(value => ({ ...value, number: nextValue }))} /></label>{reference('customer')}{reference('warehouse')}</div>}
      {inputError && <p className="iw-alert" role="alert">筛选条件无效，请检查日期顺序及单号。</p>}
    </form>
    <p className="ui-query-note" role="status" data-pending={dirty}>{dirty ? '条件已修改，点击“查询”更新结果；当前仍为上次结果。' : '修改条件后点击“查询”；“重置”仅清空条件，查询后生效。'}</p>
    {data && write && write.commitRevision > appliedWriteRevision && <p className="iw-alert" role="status">本页仍是单据操作前的查询结果，状态、数量和金额尚未刷新；点击“查询”读取当前范围。</p>}
    {snapshot.phase === 'error' && <div className="iw-alert" role="alert">销货查询失败。{data && '以下保留上次成功结果，并非本次新结果。'}{changingSize && ` 本次 ${pendingSize} 张/页读取失败，当前仍显示 ${size} 张/页。`}<UIButton type="button" className="iw-link" onClick={() => { if (snapshot.request) run(snapshot.request.parameters); }}>重试</UIButton></div>}
    {busy && <div className="iw-loading-note" role="status">{data ? changingSize ? `正在按 ${pendingSize} 张/页更新，以下仍为 ${size} 张/页的上次结果。` : '正在更新，以下为上次已执行范围的结果。' : '正在加载销货单…'}<UIButton type="button" className="iw-link" onClick={() => query.cancel()}>取消本次读取</UIButton></div>}
    <div ref={results} className="tc-list-scroll sales-results" role="region" aria-label="销货查询结果" aria-busy={busy} tabIndex={0}>
      {data ? data.items.length ? <StandardReadTable<SalesSummaryDto> label="销货单列表" tableClassName="sales-table sales-list" rows={data.items} columns={[
 { title: '日期', dataIndex: 'businessDate' },
 { title: '销货单号', render: (_, row) => <UIButton type="button" className="iw-link sales-number" title={detailAvailable ? row.number : '详情样式尚未配置，暂不可查看'} disabled={!detailAvailable} onClick={() => open(row)}>{row.number}</UIButton> },
 { title: '状态', render: (_, row) => <SalesStatusTag status={row.status} className="tc-state-tag" /> },
 { title: '业务类型', render: (_, row) => salesTypeLabels[row.businessType] },
 { title: '营业厅', render: (_, row) => ({ props: { title: row.hallName }, children: row.hallName }) },
 { title: '营业员', render: (_, row) => <span title={row.salespersonName ?? '未指定'}>{row.salespersonName ?? '未指定'}</span> },
 { title: '商品信息', render: () => <span className="sales-unavailable" title="当前原生单据未保存历史商品分类快照，不根据现商品资料推断">历史分类未提供</span> },
 { title: '数量', align: 'right', className: 'sales-numeric', render: (_, row) => row.businessType === 'SALE' ? row.quantity : `退${row.incomingQuantity} · 换${row.outgoingQuantity}` },
 { title: '金额', align: 'right', className: 'sales-numeric', render: (_, row) => salesMoney(row.netDue) },
 { title: '最后更新', render: (_, row) => <span title={row.updatedAt}>{updatedMinute(row.updatedAt)}</span> },
 { title: '操作', render: (_, row) => <UIButton type="button" className="iw-link sales-view" disabled={!detailAvailable} title={detailAvailable ? undefined : '详情样式尚未配置，暂不可查看'} onClick={() => open(row)}>查看</UIButton> },
]} /> : <div className="tc-empty"><strong>没有符合条件的销货单</strong><p>本次查询已完成，可调整条件后重新查询。</p></div> : <div className="tc-empty"><strong>{busy ? '正在查询销货单' : snapshot.phase === 'error' ? '查询未完成' : '等待查询'}</strong><p>设置筛选条件后，点击「查询」查看销货单。</p></div>}
    </div>
    <SalesPagination scope={scope} active={!detailActive} page={data?.page ?? 1} pageSize={size} total={data?.exactTotal ?? null} busy={busy} onPage={page => { if (success) run({ ...success.parameters, page }); }} onPageSize={pageSize => { if (success) run({ ...success.parameters, page: 1, pageSize }); else setInitialSize(pageSize); }} />
  </section>
    {target && detailActive && loadDetailStyles && <SalesDetailHost key={`${target.row.id}:${target.sequence}`} parentScope={scope} salesId={target.row.id} reader={reader} loadDetailStyles={loadDetailStyles} close={() => setTarget(null)} />}
    {write?.active && write.editor}
  </div>;
}
