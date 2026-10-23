import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { StandardOverlay } from '../components/standard-overlay.tsx';
import { StandardReadTable } from '../components/standard-read-table.tsx';
import { UIButton } from '../components/standard-controls.tsx';
import { ReadScope } from '../loading/read-scope.ts';
import { parseInventoryLedgerQuery } from '../../../../packages/application/src/inventory-ledger-query-validation.ts';
import type { InventoryCellTarget } from './contracts.ts';
import type { InventoryLedgerCapability, InventoryLedgerCursor, InventoryLedgerEntry } from './ledger-contracts.ts';
import { createInventoryLedgerQuery, ledgerSourceLabel } from './ledger-http-reader.ts';
import { formatQuantity } from './model.ts';
import './ledger.css';

export function InventoryLedgerDrawer(props: { readonly parent: ReadScope; readonly target: InventoryCellTarget; readonly currentQuantity?:string|null; readonly capability: InventoryLedgerCapability; readonly close: () => void }) {
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
  return <StandardOverlay kind="drawer" width={880} title="库存流水" label="库存流水" closeLabel="关闭库存流水" className="inventory-ledger" close={props.close} onReady={() => setReady(true)}>
    <div className="inventory-ledger-target ledger-identity"><strong>{props.target.productLabel}</strong><p>{props.target.color.label} · {props.target.fit.label} · {props.target.size.label} · {props.target.warehouse.label} · 当前库存 {props.currentQuantity==null?'未提供':formatQuantity(props.currentQuantity)}</p></div>
    {ready && scope?.active ? <LedgerContent key={scope.routeInstanceId} scope={scope} target={props.target} capability={props.capability} /> : <p role="status">正在准备库存流水…</p>}
  </StandardOverlay>;
}
function LedgerContent(props: { readonly scope: ReadScope; readonly target: InventoryCellTarget; readonly capability: InventoryLedgerCapability }) {
  const [query, setQuery] = useState<ReturnType<typeof createInventoryLedgerQuery> | null>(null);
  const [invalidTarget, setInvalidTarget] = useState(false);
  useEffect(() => {
    const next = createInventoryLedgerQuery(props.scope, props.capability.reader, props.capability.onAccessFailure);
    setQuery(next); let attached = true;
    queueMicrotask(() => {
      if (!attached || !props.scope.active) return;
      try { void next.run(parseInventoryLedgerQuery({ warehouseId: props.target.warehouse.id, skuId: props.target.skuId, pageSize: 20, after: null })); }
      catch { setInvalidTarget(true); }
    });
    return () => { attached = false; next.dispose(); };
  }, [props.scope, props.capability]);
  return invalidTarget ? <p role="alert">当前库存格缺少有效的仓库或规格身份，无法读取流水。</p> : query ? <LedgerResults query={query} target={props.target} /> : <p role="status">正在准备读取库存流水…</p>;
}
function LedgerResults({ query, target }: { readonly query: ReturnType<typeof createInventoryLedgerQuery>; readonly target: InventoryCellTarget }) {
  const snapshot = useSyncExternalStore(query.subscribe, query.getSnapshot, query.getSnapshot);
  const [history, setHistory] = useState<readonly (InventoryLedgerCursor | null)[]>([null]);
  const success = snapshot.success, data = success?.data, busy = snapshot.phase === 'loading';
  const currentIndex = success ? history.findIndex(point => point?.postedAt === success.parameters.after?.postedAt && point?.entryId === success.parameters.after?.entryId) : 0;
  const page = Math.max(0, currentIndex);
  const move = (after: InventoryLedgerCursor | null, nextHistory: readonly (InventoryLedgerCursor | null)[]) => {
    if (!success) return;
    setHistory(nextHistory);
    void query.run({ ...success.parameters, after });
  };
  if (snapshot.phase === 'disposed') return null;
  return <div className="inventory-ledger-content">
    {busy && <p role="status">正在读取流水…<UIButton onClick={() => query.cancel()}>取消读取</UIButton></p>}
    {snapshot.phase === 'idle' && <p role="status">读取已取消。<UIButton onClick={() => { void query.run(parseInventoryLedgerQuery({ warehouseId: target.warehouse.id, skuId: target.skuId, pageSize: 20, after: null })); }}>重新读取</UIButton></p>}
    {snapshot.phase === 'error' && <p role="alert">流水读取失败。{data ? '以下保留上次成功读取的一页。' : '未把读取失败显示为无流水。'}<UIButton onClick={() => { if (snapshot.request) void query.run(snapshot.request.parameters); }}>重试</UIButton></p>}
    {data && <><StandardReadTable<InventoryLedgerEntry> label="当前仓库规格库存流水" rows={data.entries} columns={[
      { title: '业务日期', dataIndex: 'businessDate' },
      { title: '来源', render: (_, item) => ledgerSourceLabel(item) },
      { title: '操作', render: (_, item) => item.eventKind === 'APPROVE' ? '审核' : item.eventKind === 'UNAPPROVE' ? '弃审' : item.eventKind === 'HISTORY_REVISION' ? '历史修订' : '切换基线' },
      { title: '数量变化', align: 'right', render: (_, item) => formatQuantity(item.quantityDelta) },
      { title: '记录时间（UTC）', dataIndex: 'postedAt' },
    ]} />{!data.entries.length && <p className="inventory-ledger-empty" role="status">该仓库规格在本页范围内没有库存流水。</p>}
    <nav className="inventory-ledger-pagination" aria-label="库存流水分页"><UIButton disabled={busy || page === 0} onClick={() => { void move(history[page - 1] ?? null, history); }}>上一页</UIButton><span>第 {page + 1} 页</span><UIButton disabled={busy || !data.nextCursor} onClick={() => { if (data.nextCursor) void move(data.nextCursor, [...history.slice(0, page + 1), data.nextCursor]); }}>下一页</UIButton><UIButton disabled={busy} onClick={() => { void move(null, [null]); }}>刷新</UIButton></nav></>}
  </div>;
}
