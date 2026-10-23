import type { TransferProposalPresentation } from '../current-form/transfer-proposal-form.tsx';
import { TransferStatusTag } from './transfer-status-tag.tsx';
import { ExactValue } from '../components/exact-value.tsx';
import { UIButton } from '../components/standard-controls.tsx';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useDocumentNavigation } from '../demo-presentation/document-navigation.tsx';
import type { TransferFilterDraft, TransferListQuery, TransferProductCapability, TransferWarehouseReader } from './contracts.ts';
import { emptyTransferFilter } from './contracts.ts';
import type { TransferPageController } from './controller.ts';
import { TransferManualCreateHost } from './commands/manual-create-host.tsx';
import { TransferCommandHost } from './commands/host.tsx';
import type { TransferCommandCapability } from './commands/contracts.ts';
import { TransferDetailHost } from './detail-host.tsx';
import { TransferDate, TransferStatusSelect, TransferWarehouseSelect } from './filter-controls.tsx';
import { transferCount, transferUpdatedMinute, type TransferPageSize } from './format.ts';
import { transferParameters, transferTarget } from './model.ts';
import { TransferPagination } from './pagination.tsx';

const noSubscription = () => () => {};
const noRevision = () => 0;

export interface TransferPageProps {
  readonly controller: TransferPageController; readonly references: TransferWarehouseReader; readonly loadDetailStyles: () => Promise<unknown>;
  readonly presentation?: TransferProposalPresentation; readonly product?: TransferProductCapability; readonly initialTransferId?: string; readonly commands?: TransferCommandCapability;
}
/** An explicit route activation loads exactly one bounded first page. Editing a
 * draft never changes the executed range or triggers reads. Detail activation
 * keeps the list mounted, including its successful page, scroll and focus. */
export function TransferPageView(props: TransferPageProps) {
  const { controller } = props; const { scope, list: query } = controller;
  const snapshot = useSyncExternalStore(query.subscribe, query.getSnapshot, query.getSnapshot);
  const commandRevision = useSyncExternalStore(props.commands?.workspace.subscribe ?? noSubscription, props.commands ? () => props.commands!.workspace.mutationRevision : noRevision, props.commands ? () => props.commands!.workspace.mutationRevision : noRevision);
  const [listRevision, setListRevision] = useState(commandRevision);
  const [draft, setDraft] = useState<TransferFilterDraft>(emptyTransferFilter); const [initialSize, setInitialSize] = useState<TransferPageSize>(20);
  const [advanced, setAdvanced] = useState(false); const [inputError, setInputError] = useState(false);
  const [target, setTarget] = useState<{ id: string | null; activation: number } | null>(() => props.initialTransferId ? { id: transferTarget(props.initialTransferId).transferId, activation: 1 } : null);
  const activation = useRef(1); const didRead = useRef(false); const results = useRef<HTMLDivElement>(null); const heading = useRef<HTMLHeadingElement>(null);
  const returnContext = useRef<{ trigger: HTMLElement | null; top: number; left: number } | null>(null);
  useEffect(() => {
    let attached = true;
    queueMicrotask(() => { if (attached && scope.active && !target && !didRead.current) { didRead.current = true; void query.run(transferParameters(emptyTransferFilter(), 20)).then(outcome => { if (scope.active && outcome.status === 'success') setListRevision(commandRevision); }); } });
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
  const open = (id: string) => { if (props.commands && !props.commands.workspace.canLeave()) return; returnContext.current = { trigger: document.activeElement instanceof HTMLElement ? document.activeElement : null, top: results.current?.scrollTop ?? 0, left: results.current?.scrollLeft ?? 0 }; if (query.getSnapshot().phase === 'loading') query.cancel(); setTarget({ id: transferTarget(id).transferId, activation: ++activation.current }); };
  const create = (): boolean => {
    if (target?.id === null) return true; // Repeated NEW never discards the active draft.
    if ((!props.commands?.preparation && !props.commands?.manualCreate) || !props.commands.workspace.canLeave() || props.commands.manualCreate?.canLeave() === false) return false;
    returnContext.current = { trigger: document.activeElement instanceof HTMLElement ? document.activeElement : null, top: results.current?.scrollTop ?? 0, left: results.current?.scrollLeft ?? 0 };
    if (query.getSnapshot().phase === 'loading') query.cancel();
    setTarget({ id: null, activation: ++activation.current }); return true;
  };
  useDocumentNavigation({ kind: 'transfer', view: target ? target.id === null ? 'new' : 'document' : 'list', canCreate: scope.active && !!(props.commands?.preparation || props.commands?.manualCreate), openCreate: create,
    showList: () => { if (!target) return true; if (props.commands && (!props.commands.workspace.canLeave() || props.commands.manualCreate?.canLeave() === false)) return false; setTarget(null); return true; } });
  const success = snapshot.success; const data = success?.data; const busy = snapshot.phase === 'loading'; const size = (success?.parameters.pageSize ?? initialSize) as TransferPageSize;
  let dirty = false; try { dirty = !!success && JSON.stringify(transferParameters(draft, size).filter) !== JSON.stringify(success.parameters.filter); } catch { dirty = !!success; }
  const run = (parameters: Readonly<TransferListQuery>) => { setInputError(false); didRead.current = true; const revision = commandRevision; void query.run(parameters).then(outcome => { if (scope.active && outcome.status === 'success') setListRevision(revision); }); };
  const reset = () => {
    if (!scope.active || target !== null) return;
    const cleared = emptyTransferFilter(); setDraft(cleared);
    if (results.current) { results.current.scrollTop = 0; results.current.scrollLeft = 0; }
    run(transferParameters(cleared, size));
  };
  const pendingSize = snapshot.request?.parameters.pageSize; const changingSize = !!data && pendingSize !== undefined && pendingSize !== size;
  if (!scope.active || snapshot.phase === 'disposed') return <div className="tc-empty" role="status"><strong>当前读取范围已关闭</strong><p>旧身份结果已清除，请重新进入调拨页。</p></div>;
  return <div className="transfer-route"><section className="tc-workbench tc-list transfer-list" data-document-list="transfer" hidden={target !== null}>
    <div className="tc-head"><h1 ref={heading} tabIndex={-1}>调拨单列表</h1><button type="button" className="btn primary" disabled={!props.commands?.preparation && !props.commands?.manualCreate} title={props.commands?.preparation || props.commands?.manualCreate ? undefined : '当前可用商品、仓库、原条码及编号准备尚未接入'} onClick={create}>新增调拨单</button></div>
    <form id="tc-list-filter" key={target ? 'detail' : 'list'} className="tc-filters tc-filters-two-row" aria-label="调拨筛选" onSubmit={event => { event.preventDefault(); try { run(transferParameters(draft, size)); } catch { setInputError(true); } }}>
      <div className="tc-filter-row tc-filter-primary">
        <label className="tc-date-field"><span>开始日期</span><TransferDate label="开始日期" value={draft.startDate} onChange={value => setDraft(previous => ({ ...previous, startDate: value }))} /></label>
        <label className="tc-date-field"><span>结束日期</span><TransferDate label="结束日期" value={draft.endDate} onChange={value => setDraft(previous => ({ ...previous, endDate: value }))} /></label>
        <label className="tc-status-field"><span>状态</span><TransferStatusSelect value={draft.statuses} onChange={statuses => setDraft(previous => ({ ...previous, statuses }))} /></label>
        <label><span>调出仓库</span><TransferWarehouseSelect scope={scope} reader={props.references} label="调出仓库" value={draft.from} onChange={from => setDraft(previous => ({ ...previous, from }))} /></label>
        <label><span>调入仓库</span><TransferWarehouseSelect scope={scope} reader={props.references} label="调入仓库" value={draft.to} onChange={to => setDraft(previous => ({ ...previous, to }))} /></label>
        <div className="tc-filter-actions"><button type="button" className="btn tc-filter-toggle" aria-expanded={advanced} aria-controls="transfer-extra-filters" onClick={() => setAdvanced(value => !value)}><span className="iw-filter-icon" aria-hidden="true">☷</span><span>{advanced ? '收起筛选' : '高级筛选'}</span>{draft.number.trim() && <span className="iw-filter-count">1</span>}<span aria-hidden="true">{advanced ? '▴' : '▾'}</span></button><button type="submit" className="btn primary" disabled={busy}>查询</button><button type="button" className="btn" onClick={reset}>重置</button></div>
      </div>
      {advanced && <div className="tc-filter-row tc-filter-secondary" id="transfer-extra-filters"><label className="tc-number-field"><span>调拨单号</span><input className="iw-control" name="q" aria-label="调拨单号" autoComplete="off" placeholder="输入单号模糊搜索" value={draft.number} maxLength={200} onChange={event => { const number = event.currentTarget.value; setDraft(previous => ({ ...previous, number })); }} /></label></div>}
      {inputError && <p className="transfer-notice" role="alert">筛选条件无效，请检查日期、单号及仓库选择数量。</p>}
    </form>
    <p className="ui-query-note" role="status" data-pending={dirty}>{dirty ? '条件已修改，点击“查询”更新结果。' : '修改条件后点击“查询”；“重置”恢复全部结果。'}</p>
    {success && commandRevision > listRevision && <p className="transfer-notice" role="status">调拨操作已提交，下方仍是操作前的列表结果。<UIButton type="button" className="iw-link" disabled={busy} onClick={() => run(success.parameters)}>刷新当前列表范围</UIButton></p>}
    {snapshot.phase === 'error' && <p className="transfer-notice" role="alert">调拨查询失败。{data && '以下保留上次成功结果，并非本次新结果。'}{changingSize && ` 本次 ${pendingSize} 张/页读取失败，当前仍为 ${size} 张/页。`}<UIButton type="button" className="iw-link" onClick={() => { if (snapshot.request) run(snapshot.request.parameters); }}>重试</UIButton></p>}
    {busy && data && <p className="transfer-notice" role="status">{data ? '正在查询，以下仍为上次已执行范围的结果。' : '正在查询调拨单…'}<UIButton type="button" className="iw-link" onClick={() => query.cancel()}>取消本次读取</UIButton></p>}
    <div ref={results} className="tc-list-scroll transfer-results" role="region" aria-label="调拨查询结果" aria-busy={busy} tabIndex={0}>
      {data ? <><table className="transfer-list-table" aria-label="调拨单列表"><thead><tr>{['日期', '调拨单号', '状态', '调出仓库', '调入仓库', '商品信息', '数量', '创建者', '最后更新', '操作'].map(title => <th key={title} scope="col" className={title === '操作' ? 'ui-action-cell' : undefined}>{title}</th>)}</tr></thead><tbody>{data.items.map(row => <tr key={row.id}>
        <td>{row.businessDate}</td><td><button type="button" className="btn tc-link transfer-number" title={row.number} onClick={() => open(row.id)}>{row.number}</button></td><td><TransferStatusTag status={row.status} /></td>
        <td title={`${row.fromHallName} / ${row.fromWarehouseName}`}>{row.fromWarehouseName}</td><td title={`${row.toHallName} / ${row.toWarehouseName}`}>{row.toWarehouseName}</td>
        <td><span className="transfer-muted" title="原生单据未保存历史分类快照，不根据当前商品分类推断">历史分类未提供</span></td><td className="tc-num"><ExactValue label="数量" text={transferCount(row.totalQuantity)} active={target === null} /></td>
        <td title={row.createdByName}>{row.createdByName}</td><td title={row.updatedAt}>{transferUpdatedMinute(row.updatedAt)}</td><td className="ui-action-cell"><button type="button" className="btn tc-link transfer-view" onClick={() => open(row.id)}>查看</button></td>
      </tr>)}</tbody></table>{data.items.length === 0 && <div className="tc-empty">没有符合条件的调拨单</div>}</>
        : busy ? <div className="iw-loading" role="status"><span className="iw-spinner" aria-hidden="true" /><strong>正在查询调拨单</strong><span>请稍候，正在整理查询结果…</span><UIButton type="button" className="iw-link" onClick={() => query.cancel()}>取消本次读取</UIButton></div>
          : snapshot.phase === 'error' ? <div className="tc-empty">查询未完成</div> : <div className="tc-empty" role="status"><strong>尚未读取调拨单</strong><p>点击“查询”读取当前条件。</p></div>}
    </div>
    <TransferPagination scope={scope} active={target === null} page={data?.page ?? 1} pageSize={size} total={data?.exactTotal ?? null} busy={busy} onPage={page => { if (success) run({ ...success.parameters, page }); }} onPageSize={pageSize => { if (success) run({ ...success.parameters, page: 1, pageSize }); else { setInitialSize(pageSize); run(transferParameters(draft, pageSize)); } }} />
  </section>
  {target && (target.id === null && props.commands?.manualCreate ? <TransferManualCreateHost {...(props.presentation ? { presentation: props.presentation } : {})} key={target.activation} parentScope={scope} {...(controller.reader.readHistory ? { historyReader: { readHistory: read => controller.reader.readHistory!(read) } } : {})} capability={props.commands.manualCreate} loadStyles={props.loadDetailStyles} close={() => setTarget(null)} /> : props.commands ? <TransferCommandHost {...(props.presentation ? { presentation: props.presentation } : {})} key={`${target.id}:${target.activation}`} parentScope={scope} {...(controller.reader.readHistory ? { historyReader: { readHistory: read => controller.reader.readHistory!(read) } } : {})} transferId={target.id} capability={props.commands} loadStyles={props.loadDetailStyles} close={() => setTarget(null)} /> : target.id && <TransferDetailHost {...(props.presentation ? { presentation: props.presentation } : {})} key={`${target.id}:${target.activation}`} parentScope={scope} transferId={target.id} reader={controller.reader} loadDetailStyles={props.loadDetailStyles} close={() => setTarget(null)} {...(props.product ? { product: props.product } : {})} />)}
  </div>;
}
