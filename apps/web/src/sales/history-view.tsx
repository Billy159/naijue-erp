import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { StandardOverlay } from '../components/standard-overlay.tsx';
import { UIButton } from '../components/standard-controls.tsx';
import type { ReadScope } from '../loading/read-scope.ts';
import { SalesHistoryController } from './history-controller.ts';
import type { SalesHistoryReader } from './history-http-reader.ts';

export interface SalesHistoryCapability { readonly scope: ReadScope; readonly reader: SalesHistoryReader }
const actions = { SAVE: '保存', APPROVE: '审核', UNAPPROVE: '弃审', VOID: '作废' } as const;
export function SalesHistoryAction({ capability, salesId, className = 'iw-text-button' }: { readonly capability?: SalesHistoryCapability; readonly salesId?: string; readonly className?: string }) {
  const active = useSyncExternalStore(listener => {
    const signal = capability?.scope.signal;
    signal?.addEventListener('abort', listener);
    return () => signal?.removeEventListener('abort', listener);
  }, () => capability?.scope.active ?? false, () => false);
  const [opened, setOpened] = useState<{ capability: SalesHistoryCapability; salesId: string; controller: SalesHistoryController } | null>(null);
  const visible = opened && opened.salesId === salesId && opened.capability.scope === capability?.scope;
  return <><UIButton type="button" className={className} disabled={!active || !salesId} title={!capability || !salesId ? '保存并读取单据后可查看操作历史' : undefined}
    onClick={() => { if (capability?.scope.active && salesId) setOpened({ capability, salesId, controller: new SalesHistoryController(capability.scope, capability.reader, salesId) }); }}>操作历史</UIButton>
    {visible && <SalesHistoryView controller={opened.controller} close={() => setOpened(null)} />}</>;
}
export function SalesHistoryView({ controller, close }: { readonly controller: SalesHistoryController; readonly close: () => void }) {
  const state = useSyncExternalStore(controller.query.subscribe, controller.query.getSnapshot, controller.query.getSnapshot);
  const attached = useRef<SalesHistoryController | null>(null);
  useLayoutEffect(() => { attached.current = controller; return () => { attached.current = null; queueMicrotask(() => { if (attached.current !== controller) controller.dispose(); }); }; }, [controller]);
  if (state.phase === 'disposed') return null;
  const page = state.success?.data;
  return <StandardOverlay title="操作历史" label="销货操作历史" closeLabel="关闭操作历史" close={() => { controller.dispose(); close(); }} width={920} onReady={() => controller.start()}>
    {state.phase === 'loading' && <p role="status">正在读取操作历史…</p>}
    {state.phase === 'error' && <p role="alert">操作历史未能读取，原单据和原操作键保持不变。<UIButton type="button" onClick={() => controller.retry()}>重试操作历史</UIButton></p>}
    {state.phase === 'success' && page && <><div className="sales-table-scroll"><table className="sales-table"><caption className="sr-only">销货原生操作记录</caption><thead><tr>{['时间', '操作', '操作账号编号', '版本'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>
      {page.items.map(item => <tr key={item.id}><td><time dateTime={item.occurredAt}>{item.occurredAt}</time></td><td>{actions[item.action]}</td><td>{item.actorAccountId}</td><td>{item.oldVersion === null ? '首次保存' : item.oldVersion} → {item.newVersion}</td></tr>)}
      {!page.items.length && <tr><td colSpan={4}>本单暂无已记录操作</td></tr>}
    </tbody></table></div><footer className="iw-pagination"><span>第 {page.page} 页 · 共 {page.exactTotal} 条</span><UIButton type="button" disabled={page.page <= 1} onClick={() => controller.page(page.page - 1)}>上一页</UIButton><UIButton type="button" disabled={BigInt(page.page) * BigInt(page.pageSize) >= BigInt(page.exactTotal)} onClick={() => controller.page(page.page + 1)}>下一页</UIButton></footer></>}
  </StandardOverlay>;
}
