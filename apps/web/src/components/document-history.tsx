import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import type { QuerySnapshot } from '../loading/latest-query.ts';
import { StandardOverlay } from './standard-overlay.tsx';
import { StandardReadTable } from './standard-read-table.tsx';
import { UIButton } from './standard-controls.tsx';

interface HistoryEntry {
  readonly id: string; readonly actorAccountId: string; readonly occurredAt: string;
  readonly action: 'SAVE' | 'APPROVE' | 'UNAPPROVE' | 'VOID';
  readonly oldVersion: number | null; readonly newVersion: number;
}
interface HistoryPage { readonly page: number; readonly pageSize: number; readonly exactTotal: string; readonly items: readonly HistoryEntry[] }
interface HistoryController {
  readonly query: {
    readonly subscribe: (listener: () => void) => () => void;
    readonly getSnapshot: () => QuerySnapshot<unknown, HistoryPage>;
  };
  start(): void; retry(): void; page(page: number): void; dispose(): void;
}
const actions = { SAVE: '保存', APPROVE: '审核', UNAPPROVE: '弃审', VOID: '作废' } as const;

/** Shared presentation only. Each document owns its native reader, target and
 * permission scope. Account IDs are not presented as invented person names. */
export function DocumentHistoryView({ controller, kind, close }: { readonly controller: HistoryController; readonly kind: '销货' | '调拨'; readonly close: () => void }) {
  const state = useSyncExternalStore(controller.query.subscribe, controller.query.getSnapshot, controller.query.getSnapshot);
  const attached = useRef<HistoryController | null>(null);
  useLayoutEffect(() => {
    attached.current = controller;
    return () => { attached.current = null; queueMicrotask(() => { if (attached.current !== controller) controller.dispose(); }); };
  }, [controller]);
  if (state.phase === 'disposed') return null;
  const page = state.success?.data;
  return <StandardOverlay title="操作历史" label={`${kind}操作历史`} closeLabel="关闭操作历史" close={() => { controller.dispose(); close(); }} width={920} onReady={() => controller.start()}>
    {state.phase === 'loading' && <p role="status">正在读取操作历史…</p>}
    {state.phase === 'error' && <p role="alert">操作历史未能读取，原单据和原操作键保持不变。<UIButton type="button" onClick={() => controller.retry()}>重试操作历史</UIButton></p>}
    {state.phase === 'success' && page && <>
      {page.items.length ? <div className="sales-table-scroll"><StandardReadTable<HistoryEntry> label={`${kind}原生操作记录`} tableClassName="sales-table" rows={page.items} columns={[
        { title: '时间', render: (_, item) => <time dateTime={item.occurredAt}>{item.occurredAt}</time> },
        { title: '操作', render: (_, item) => actions[item.action] },
        { title: '操作账号编号', dataIndex: 'actorAccountId' },
        { title: '版本', render: (_, item) => <>{item.oldVersion === null ? '首次保存' : item.oldVersion} → {item.newVersion}</> },
      ]} /></div> : <p role="status">本单暂无已记录操作</p>}
      <footer className="iw-pagination"><span>第 {page.page} 页 · 共 {page.exactTotal} 条</span><UIButton type="button" disabled={page.page <= 1} onClick={() => controller.page(page.page - 1)}>上一页</UIButton><UIButton type="button" disabled={BigInt(page.page) * BigInt(page.pageSize) >= BigInt(page.exactTotal)} onClick={() => controller.page(page.page + 1)}>下一页</UIButton></footer>
    </>}
  </StandardOverlay>;
}
