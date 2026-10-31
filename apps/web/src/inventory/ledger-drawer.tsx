import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { IconSearch } from '@arco-design/web-react/icon';
import { StandardOverlay, SourceCloseIcon } from '../components/standard-overlay.tsx';
import { StandardReadTable } from '../components/standard-read-table.tsx';
import { StandardPagination } from '../components/standard-pagination.tsx';
import { UIButton, UIDate, UIInput } from '../components/standard-controls.tsx';
import { DemoSingleSelectAction } from '../demo-controls/single-select-action.tsx';
import { createDemoSingleSelectStyles } from '../demo-controls/single-select-styles.ts';
import { ReadScope } from '../loading/read-scope.ts';
import { parseInventoryLedgerQuery } from '../../../../packages/application/src/inventory-ledger-query-validation.ts';
import type { InventoryCellTarget } from './contracts.ts';
import type { InventoryLedgerBusinessType, InventoryLedgerCapability, InventoryLedgerFilter, InventoryLedgerEntry, InventoryLedgerQuery } from './ledger-contracts.ts';
import { createInventoryLedgerQuery } from './ledger-http-reader.ts';
import { formatQuantity } from './model.ts';
import { ledgerBalanceTransitionView } from './ledger-balance-transition-view.ts';
import './ledger.css';

const typeLabels: Readonly<Record<InventoryLedgerBusinessType, string>> = {
  BASELINE: '库存初始化 / 期初', TRANSFER_IN: '调拨入', TRANSFER_OUT: '调拨出',
  SALE: '销货出库', RETURN: '退货入库', EXCHANGE: '换货', UNKNOWN: '未知类型',
};
const typeOptions = [{ value: '__ledger_all_types__', label: '全部类型' }, ...Object.entries(typeLabels).map(([value, label]) => ({ value, label })),
  { value: 'PURCHASE_UNAVAILABLE', label: '进货（暂未提供）', disabled: true }];

/** Native last-30-days filter default, using the same Shanghai day boundary as
 * the existing numbered read. This is a query choice, never a source date. */
function ledgerDefaults(): InventoryLedgerFilter {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const day = ['year', 'month', 'day'].map(kind => parts.find(part => part.type === kind)!.value).join('-');
  const ago = new Date(`${day}T00:00:00Z`); ago.setUTCDate(ago.getUTCDate() - 30);
  return { dateFrom: ago.toISOString().slice(0, 10), dateTo: day, businessType: null, source: '' };
}
function parameters(target: InventoryCellTarget, filter: InventoryLedgerFilter, page = 1): InventoryLedgerQuery {
  return parseInventoryLedgerQuery({ warehouseId: target.warehouse.id, skuId: target.skuId, pageSize: 20, after: null, page,
    filter: { dateFrom: filter.dateFrom, dateTo: filter.dateTo, businessType: filter.businessType, source: filter.source } });
}
function LedgerTypeSelect(props: { readonly scope: ReadScope; readonly value: InventoryLedgerBusinessType | null; readonly disabled: boolean; readonly onChange: (value: InventoryLedgerBusinessType | null) => void }) {
  const host = useRef<HTMLDivElement>(null), [ready, setReady] = useState(false), [error, setError] = useState(false), [retry, setRetry] = useState(0), [open, setOpen] = useState(false);
  useEffect(() => {
    const lease = createDemoSingleSelectStyles(host.current!.ownerDocument); let attached = true;
    setReady(false); setError(false);
    const release = () => { attached = false; lease.dispose(); };
    props.scope.signal.addEventListener('abort', release, { once: true });
    void lease.load().then(() => { if (attached && props.scope.active) setReady(true); }, () => { if (attached && props.scope.active) setError(true); });
    return () => { props.scope.signal.removeEventListener('abort', release); release(); };
  }, [props.scope, retry]);
  return <div ref={host} data-ledger-type>{ready ? <DemoSingleSelectAction presentation="flat" label="业务类型" value={props.value ?? '__ledger_all_types__'} options={typeOptions} popupWidth={300}
    disabled={props.disabled || !props.scope.active} open={open && !props.disabled && props.scope.active} onOpenChange={setOpen}
    onChange={value => { if (props.scope.active && !props.disabled && (value === '__ledger_all_types__' || Object.hasOwn(typeLabels, value))) props.onChange(value === '__ledger_all_types__' ? null : value as InventoryLedgerBusinessType); }} />
    : <><UIButton disabled={!error || props.disabled} aria-label="业务类型" className="ledger-type-placeholder" onClick={() => setRetry(value => value + 1)}>{error ? '重试类型选项' : props.value ? typeLabels[props.value] : '全部类型'}</UIButton>{error && <span role="alert">类型选项未加载。</span>}</>}</div>;
}

export function InventoryLedgerDrawer(props: { readonly parent: ReadScope; readonly target: InventoryCellTarget; readonly currentQuantity?: string | null; readonly capability: InventoryLedgerCapability; readonly close: () => void }) {
  const [ready, setReady] = useState(false), sequence = useRef(0);
  const [scope, setScope] = useState<ReadScope | null>(null);
  useEffect(() => {
    const child = new ReadScope(props.parent.identity, `${props.parent.routeInstanceId}:ledger:${++sequence.current}`, props.target.skuId, () => {});
    const abort = () => child.dispose(); props.parent.signal.addEventListener('abort', abort, { once: true });
    if (!props.parent.active) child.dispose();
    setScope(child);
    return () => { props.parent.signal.removeEventListener('abort', abort); child.dispose(); };
  }, [props.parent, props.target.skuId, props.target.warehouse.id]);
  if (!props.parent.active) return null;
  return <StandardOverlay kind="drawer" closePlacement="header" closeIcon={<SourceCloseIcon />} width={880} title={<h2 className="inventory-ledger-title">库存流水</h2>} label="库存流水" closeLabel="关闭库存流水" className="inventory-ledger" close={props.close} onReady={() => setReady(true)}>
    <div className="inventory-ledger-target ledger-identity"><strong>{props.target.productLabel}</strong><p>{props.target.color.label} · {props.target.fit.label} · {props.target.size.label} · {props.target.warehouse.label} · 当前库存 {props.currentQuantity == null ? '未提供' : formatQuantity(props.currentQuantity)}</p></div>
    {ready && scope?.active ? <LedgerContent key={scope.routeInstanceId} scope={scope} target={props.target} capability={props.capability} /> : <p role="status">正在准备库存流水…</p>}
  </StandardOverlay>;
}
function LedgerContent(props: { readonly scope: ReadScope; readonly target: InventoryCellTarget; readonly capability: InventoryLedgerCapability }) {
  const [query, setQuery] = useState<ReturnType<typeof createInventoryLedgerQuery> | null>(null);
  const [initialFilter] = useState(ledgerDefaults);
  const [invalidTarget, setInvalidTarget] = useState(false);
  useEffect(() => {
    const next = createInventoryLedgerQuery(props.scope, props.capability.reader, props.capability.onAccessFailure);
    setQuery(next); let attached = true;
    queueMicrotask(() => {
      if (!attached || !props.scope.active) return;
      try { void next.run(parameters(props.target, initialFilter)); }
      catch { setInvalidTarget(true); }
    });
    return () => { attached = false; next.dispose(); };
  }, [props.scope, props.capability]);
  return invalidTarget ? <p role="alert">当前库存格缺少有效的仓库或规格身份，无法读取流水。</p>
    : query ? <LedgerResults query={query} {...props} initialFilter={initialFilter} /> : <p role="status">正在准备读取库存流水…</p>;
}
function LedgerResults({ query, target, scope, capability, initialFilter }: {
  readonly query: ReturnType<typeof createInventoryLedgerQuery>; readonly target: InventoryCellTarget; readonly scope: ReadScope;
  readonly capability: InventoryLedgerCapability; readonly initialFilter: InventoryLedgerFilter;
}) {
  const snapshot = useSyncExternalStore(query.subscribe, query.getSnapshot, query.getSnapshot);
  const [draft, setDraft] = useState(initialFilter), [filterError, setFilterError] = useState('');
  const [sourcePending, setSourcePending] = useState(false), [sourceError, setSourceError] = useState('');
  const success = snapshot.success, data = success?.data, busy = snapshot.phase === 'loading';
  useEffect(() => setSourceError(''), [success]);
  const unavailable = busy || !scope.active;
  const submit = () => {
    if (!scope.active || busy) return;
    try { const next = parameters(target, draft); setFilterError(''); void query.run(next); }
    catch { setFilterError('请检查日期范围和来源单号；开始日期不能晚于结束日期。'); }
  };
  const repeat = () => {
    if (!scope.active || busy) return;
    void query.run(snapshot.request?.parameters ?? parameters(target, initialFilter));
  };
  const openSource = async (entry: InventoryLedgerEntry) => {
    if (!scope.active || busy || sourcePending || !capability.onOpenSource || query.getSnapshot().success !== success) return;
    setSourcePending(true); setSourceError('');
    try {
      const opened = await capability.onOpenSource(entry);
      if (!opened && scope.active && query.getSnapshot().success === success) setSourceError('未能打开来源单据，请检查当前访问权限或稍后重试。');
    } catch {
      if (scope.active && query.getSnapshot().success === success) setSourceError('来源单据读取失败，请稍后重试。');
    } finally { if (scope.active) setSourcePending(false); }
  };
  if (snapshot.phase === 'disposed') return null;
  return <div className="inventory-ledger-content">
    <form id="ledger-filter" className="mini-filter" aria-label="库存流水筛选" onSubmit={event => { event.preventDefault(); submit(); }}>
      <span data-ledger-date="start" title="按北京时间筛选，包含开始日期"><UIDate popupMount="ancestor" aria-label="开始日期" placeholder="开始日期" value={draft.dateFrom ?? ''} disabled={unavailable} onChange={dateFrom => setDraft(old => ({ ...old, dateFrom: dateFrom || null }))} /></span>
      <span data-ledger-date="end" title="按北京时间筛选，包含结束日期"><UIDate popupMount="ancestor" aria-label="结束日期" placeholder="结束日期" value={draft.dateTo ?? ''} disabled={unavailable} onChange={dateTo => setDraft(old => ({ ...old, dateTo: dateTo || null }))} /></span>
      <LedgerTypeSelect scope={scope} value={draft.businessType} disabled={unavailable} onChange={businessType => setDraft(old => ({ ...old, businessType }))} />
      <span data-ledger-source><UIInput aria-label="来源单号" placeholder="来源单号" value={draft.source} disabled={unavailable} allowClear onChange={source => setDraft(old => ({ ...old, source }))}
        suffix={<UIButton className="ledger-source-search" variant="text" aria-label="查询来源单号" disabled={unavailable} onClick={submit}><IconSearch aria-hidden /></UIButton>} /></span>
      <UIButton type="submit" className="btn primary" disabled={unavailable}>查询</UIButton>
    </form>
    <div className="ledger-filter-error" role="alert">{filterError}</div>
    {busy && <p className="ledger-read-state" role="status">正在读取流水…{data && '以下保留上次成功查询结果。'}<UIButton className="iw-link" onClick={() => query.cancel()}>取消读取</UIButton></p>}
    {snapshot.phase === 'idle' && <p className="ledger-read-state" role="status">读取已取消。<UIButton className="iw-link" onClick={repeat}>重新读取</UIButton></p>}
    {snapshot.phase === 'error' && <p className="ledger-read-state" role="alert">流水读取失败。{data ? '以下保留上次成功查询结果。' : '请重试。'}<UIButton className="iw-link" onClick={repeat}>重试</UIButton></p>}
    {snapshot.phase === 'stale' && <p className="ledger-read-state" role="status">读取范围已变化，请重新读取。<UIButton className="iw-link" onClick={repeat}>重新读取</UIButton></p>}
    {sourceError && <p className="ledger-read-state ledger-source-state" role="alert">{sourceError}</p>}
    <div className="ledger-stats" aria-live="polite">{data ? `共 ${BigInt(data.filteredTotal!).toLocaleString('zh-CN')} 条 · 每页 20 条` : '每页 20 条'}</div>
    <div className="table-scroll ledger-scroll"><StandardReadTable<InventoryLedgerEntry> label="当前仓库规格库存流水" rows={data?.entries ?? []} plainCellContent columns={[
      { title: '时间', render: (_, item) => <time dateTime={item.eventKind === 'CUTOFF_BASELINE' ? item.businessDate : item.postedAt} title={item.postedAt}>{item.eventKind === 'CUTOFF_BASELINE' ? item.display!.date : new Date(item.postedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}</time> },
      { title: '业务类型', render: (_, item) => typeLabels[item.display!.businessType] },
      { title: '变化', render: (_, item) => `${BigInt(item.quantityDelta) > 0n ? '+' : ''}${formatQuantity(item.quantityDelta)}` },
      { title: '变化前 → 后', render: (_, item) => { const view = ledgerBalanceTransitionView(item.display!.balanceTransition); return <span title={view.title}>{view.text}</span>; } },
      { title: '来源单据', render: (_, item) => item.display!.sourceNumber === null ? '未记录'
        : item.source.kind === 'CUTOFF_BASELINE' ? item.display!.sourceNumber
          : <UIButton className="iw-link ledger-source-link" disabled={unavailable || sourcePending || !capability.onOpenSource} aria-busy={sourcePending} title={capability.onOpenSource ? '查看来源单据' : '来源单据查看尚未接通'} onClick={() => { void openSource(item); }}>{item.display!.sourceNumber}</UIButton> },
      { title: '操作人', render: (_, item) => <span data-label-basis="CURRENT_REFERENCE" title="操作账号的当前员工名称">{item.display!.operator.name ?? '未记录'}</span> },
    ]} />{data && !data.entries.length && <div className="empty" role="status">当前范围无流水</div>}</div>
    <footer className="ledger-footer"><div className="iw-pagination"><StandardPagination label="库存流水分页" scope={scope} page={data?.page ?? 1} pageSize={20} total={data?.filteredTotal ?? null} disabled={unavailable}
      hideOnSinglePage={false} showJump={false} stepText onPage={page => { if (success && scope.active && !busy) void query.run({ ...success.parameters, page }); }} /></div></footer>
  </div>;
}
