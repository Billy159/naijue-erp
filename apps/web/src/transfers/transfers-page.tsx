import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { TransferFilterDraft, TransferListQuery, TransferProductCapability, TransferWarehouseReader } from './contracts.ts';
import { emptyTransferFilter } from './contracts.ts';
import type { TransferPageController } from './controller.ts';
import { TransferDetailHost } from './detail-host.tsx';
import { TransferDate, TransferStatusSelect, TransferWarehouseSelect } from './filter-controls.tsx';
import { transferCount, transferUpdatedMinute, type TransferPageSize } from './format.ts';
import { transferParameters, transferStatusLabels, transferTarget } from './model.ts';
import { TransferPagination } from './pagination.tsx';

export interface TransferPageProps {
  readonly controller: TransferPageController; readonly references: TransferWarehouseReader; readonly loadDetailStyles: () => Promise<unknown>;
  readonly product?: TransferProductCapability; readonly initialTransferId?: string;
}
/** An explicit route activation loads exactly one bounded first page. Editing a
 * draft never changes the executed range or triggers reads. Detail activation
 * keeps the list mounted, including its successful page, scroll and focus. */
export function TransferPageView(props: TransferPageProps) {
  const { controller } = props; const { scope, list: query } = controller;
  const snapshot = useSyncExternalStore(query.subscribe, query.getSnapshot, query.getSnapshot);
  const [draft, setDraft] = useState<TransferFilterDraft>(emptyTransferFilter); const [initialSize, setInitialSize] = useState<TransferPageSize>(20);
  const [advanced, setAdvanced] = useState(false); const [inputError, setInputError] = useState(false);
  const [target, setTarget] = useState<{ id: string; activation: number } | null>(() => props.initialTransferId ? { id: transferTarget(props.initialTransferId).transferId, activation: 1 } : null);
  const activation = useRef(1); const didRead = useRef(false); const results = useRef<HTMLDivElement>(null); const heading = useRef<HTMLHeadingElement>(null);
  const returnContext = useRef<{ trigger: HTMLElement | null; top: number; left: number } | null>(null);
  useEffect(() => {
    let attached = true;
    queueMicrotask(() => { if (attached && scope.active && !target && !didRead.current) { didRead.current = true; void query.run(transferParameters(emptyTransferFilter(), 20)); } });
    return () => { attached = false; };
  }, [query, scope, target]);
  useEffect(() => {
    const abort = () => { setDraft(emptyTransferFilter()); setTarget(null); returnContext.current = null; };
    scope.signal.addEventListener('abort', abort, { once: true });
    return () => scope.signal.removeEventListener('abort', abort);
  }, [scope]);
  useEffect(() => {
    if (target || !scope.active) return;
    const previous = returnContext.current; if (!previous) return;
    if (results.current) { results.current.scrollTop = previous.top; results.current.scrollLeft = previous.left; }
    if (previous.trigger?.isConnected) previous.trigger.focus({ preventScroll: true }); else heading.current?.focus();
    returnContext.current = null;
  }, [target, scope]);
  const open = (id: string) => { returnContext.current = { trigger: document.activeElement instanceof HTMLElement ? document.activeElement : null, top: results.current?.scrollTop ?? 0, left: results.current?.scrollLeft ?? 0 }; if (query.getSnapshot().phase === 'loading') query.cancel(); setTarget({ id: transferTarget(id).transferId, activation: ++activation.current }); };
  const success = snapshot.success; const data = success?.data; const busy = snapshot.phase === 'loading'; const size = (success?.parameters.pageSize ?? initialSize) as TransferPageSize;
  let dirty = false; try { dirty = !!success && JSON.stringify(transferParameters(draft, size).filter) !== JSON.stringify(success.parameters.filter); } catch { dirty = !!success; }
  const run = (parameters: Readonly<TransferListQuery>) => { setInputError(false); didRead.current = true; void query.run(parameters); };
  const pendingSize = snapshot.request?.parameters.pageSize; const changingSize = !!data && pendingSize !== undefined && pendingSize !== size;
  if (!scope.active || snapshot.phase === 'disposed') return <div className="tc-empty" role="status"><strong>当前读取范围已关闭</strong><p>旧身份结果已清除，请重新进入调拨页。</p></div>;
  return <div className="transfer-route"><section className="tc-workbench tc-list transfer-list" hidden={target !== null}>
    <div className="tc-head"><h1 ref={heading} tabIndex={-1}>调拨单列表</h1><button type="button" className="iw-button iw-primary" disabled title="新增调拨单尚未接入">新增调拨单</button></div>
    <form key={target ? 'detail' : 'list'} className="tc-filters tc-filters-two-row" aria-label="调拨筛选" onSubmit={event => { event.preventDefault(); try { run(transferParameters(draft, size)); } catch { setInputError(true); } }}>
      <div className="tc-filter-row tc-filter-primary">
        <label><span>开始日期</span><TransferDate label="开始日期" value={draft.startDate} onChange={value => setDraft(previous => ({ ...previous, startDate: value }))} /></label>
        <label><span>结束日期</span><TransferDate label="结束日期" value={draft.endDate} onChange={value => setDraft(previous => ({ ...previous, endDate: value }))} /></label>
        <label><span>状态</span><TransferStatusSelect value={draft.statuses} onChange={statuses => setDraft(previous => ({ ...previous, statuses }))} /></label>
        <label><span>调出仓库</span><TransferWarehouseSelect scope={scope} reader={props.references} label="调出仓库" value={draft.from} onChange={from => setDraft(previous => ({ ...previous, from }))} /></label>
        <label><span>调入仓库</span><TransferWarehouseSelect scope={scope} reader={props.references} label="调入仓库" value={draft.to} onChange={to => setDraft(previous => ({ ...previous, to }))} /></label>
        <div className="tc-filter-actions"><button type="button" className="iw-text-button tc-filter-toggle" aria-expanded={advanced} aria-controls="transfer-extra-filters" onClick={() => setAdvanced(value => !value)}><span aria-hidden="true">☷</span><span>{advanced ? '收起筛选' : '高级筛选'}</span>{draft.number.trim() && <span className="iw-filter-count">1</span>}<span aria-hidden="true">{advanced ? '▴' : '▾'}</span></button><button type="submit" className="iw-button iw-primary" disabled={busy}>查询</button><button type="button" className="iw-button" onClick={() => { setDraft(emptyTransferFilter()); setInputError(false); }}>重置</button></div>
      </div>
      {advanced && <div className="tc-filter-row tc-filter-secondary" id="transfer-extra-filters"><label className="tc-number-field"><span>调拨单号</span><input className="iw-control" aria-label="调拨单号" autoComplete="off" placeholder="输入单号模糊搜索" value={draft.number} maxLength={200} onChange={event => setDraft(previous => ({ ...previous, number: event.target.value }))} /></label></div>}
      {inputError && <p className="transfer-notice" role="alert">筛选条件无效，请检查日期、单号及仓库选择数量。</p>}
    </form>
    <p className="ui-query-note" role="status">{dirty ? '条件已修改，点击“查询”更新结果；当前仍为上次结果。' : '修改条件后点击“查询”；“重置”仅清空条件，查询后生效。'}</p>
    {snapshot.phase === 'error' && <p className="transfer-notice" role="alert">调拨查询失败。{data && '以下保留上次成功结果，并非本次新结果。'}{changingSize && ` 本次 ${pendingSize} 张/页读取失败，当前仍为 ${size} 张/页。`}<button type="button" className="iw-link" onClick={() => { if (snapshot.request) run(snapshot.request.parameters); }}>重试</button></p>}
    {busy && <p className="transfer-notice" role="status">{data ? '正在查询，以下仍为上次已执行范围的结果。' : '正在查询调拨单…'}<button type="button" className="iw-link" onClick={() => query.cancel()}>取消本次读取</button></p>}
    <div ref={results} className="tc-list-scroll transfer-results" role="region" aria-label="调拨查询结果" aria-busy={busy} tabIndex={0}>
      {data ? data.items.length ? <table className="transfer-list-table"><thead><tr>{['日期', '调拨单号', '状态', '调出仓库', '调入仓库', '商品信息', '数量', '创建者', '最后更新', '操作'].map(label => <th key={label} scope="col" className={label === '操作' ? 'ui-action-cell' : undefined}>{label}</th>)}</tr></thead><tbody>{data.items.map(row => <tr key={row.id}><td>{row.businessDate}</td><td><button type="button" className="iw-link transfer-number" title={row.number} onClick={() => open(row.id)}>{row.number}</button></td><td><span className="tc-state-tag" data-document-status={row.status}>{transferStatusLabels[row.status]}</span></td><td title={`${row.fromHallName} / ${row.fromWarehouseName}`}>{row.fromWarehouseName}</td><td title={`${row.toHallName} / ${row.toWarehouseName}`}>{row.toWarehouseName}</td><td><span className="transfer-muted" title="原生单据未保存历史分类快照，不根据当前商品分类推断">历史分类未提供</span></td><td className="tc-num">{transferCount(row.totalQuantity)}</td><td title={row.createdByName}>{row.createdByName}</td><td title={row.updatedAt}>{transferUpdatedMinute(row.updatedAt)}</td><td className="ui-action-cell"><button type="button" className="iw-link transfer-view" onClick={() => open(row.id)}>查看</button></td></tr>)}</tbody></table>
        : <div className="tc-empty">没有符合条件的调拨单</div> : <div className="tc-empty"><strong>{busy ? '正在查询调拨单' : snapshot.phase === 'error' ? '查询未完成' : '尚未读取调拨单'}</strong><p>没有已完成的查询结果。</p></div>}
    </div>
    <TransferPagination page={data?.page ?? 1} pageSize={size} total={data?.exactTotal ?? null} busy={busy} onPage={page => { if (success) run({ ...success.parameters, page }); }} onPageSize={pageSize => { if (success) run({ ...success.parameters, page: 1, pageSize }); else { setInitialSize(pageSize); run(transferParameters(draft, pageSize)); } }} />
  </section>
  {target && <TransferDetailHost key={`${target.id}:${target.activation}`} parentScope={scope} transferId={target.id} reader={controller.reader} loadDetailStyles={props.loadDetailStyles} close={() => setTarget(null)} {...(props.product ? { product: props.product } : {})} />}
  </div>;
}
