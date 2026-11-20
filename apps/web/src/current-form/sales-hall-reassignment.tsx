import { useState, useSyncExternalStore, useEffect } from 'react';
import { SourceDocumentDialog } from '../components/standard-overlay.tsx';
import { UIButton, UIInput } from '../components/standard-controls.tsx';
import type { SalesEditorSession } from '../sales/commands/editor-session.ts';
import type { ReadScope } from '../loading/read-scope.ts';
import { SalesProposalSession } from './sales-proposal.ts';

/** Separate explicit header proposal: no SKU read, default hall, or automatic save. */
export function SalesHallReassignment({ owner, scope }: { readonly owner: SalesEditorSession; readonly scope?: ReadScope | undefined }) {
  const [selection, setSelection] = useState<SalesProposalSession | null>(null);
  const current = useSyncExternalStore(owner.subscribe, owner.getSnapshot, owner.getSnapshot).command.editor;
  const pending = current?.draft && current.detail && (current.draft.header.hallId !== current.detail.document.header.hallId || current.draft.header.warehouseId !== current.detail.document.header.warehouseId);
  const reader = owner.historicalHallReferenceReader;
  useEffect(() => () => selection?.dispose(), [selection]);
  if (!reader || !scope) return null;
  const close = () => { selection?.dispose(); setSelection(null); };
  return <>{pending && <p role="status">待保存营业厅编号：{current.draft!.header.hallId ?? '未记录'}；出库仓编号：{current.draft!.header.warehouseId}。原取值依据保留。</p>}<UIButton disabled={!owner.editable} onClick={() => setSelection(new SalesProposalSession(scope, reader, error => owner.responsibleAccessFailure(error.kind === 'unauthenticated' ? 'unauthenticated' : 'forbidden')))}>调整营业厅 / 出库仓</UIButton>{selection && <Selection owner={owner} session={selection} close={close}/>}</>;
}
function Selection({ owner, session, close }: { readonly owner: SalesEditorSession; readonly session: SalesProposalSession; readonly close: () => void }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot), draft = state.draft, picker = state.picker;
  const current = owner.getSnapshot().command.editor?.draft?.header;
  const select = async (id: string) => { const reset = picker?.kind === 'hall' ? session.prepareHallChange(id) : null; if (reset) reset(); else await session.select(id); session.closePicker(); };
  return <SourceDocumentDialog className="source-confirm-dialog sales-hall-reassignment" title="调整营业厅和出库仓" label="调整营业厅和出库仓" closeLabel="取消调整营业厅和出库仓" close={close} footer={<><UIButton onClick={close}>取消</UIButton><UIButton disabled={!owner.editable || !draft.hall || !draft.warehouse || draft.warehouse.hallId !== draft.hall.id} onClick={() => { if (draft.hall && draft.warehouse && owner.applyHistoricalHallWarehouse(draft.hall, draft.warehouse)) close(); }}>采用所选厅仓</UIButton></>}>
    <div className="ui-confirm-body"><p>原厅和仓库不会被自动补写。请选择有效的同厅组合，采用后仍需保存；服务端会重新核验权限和当前资料，原始取值依据继续保留。</p>
    <p>当前营业厅编号：{current?.hallId ?? '未记录'}；当前仓库编号：{current?.warehouseId ?? '未记录'}。</p>
    <label>营业厅 <UIButton aria-label="选择调整后的营业厅" onClick={() => void session.openPicker('hall')}>{draft.hall?.name ?? '请选择营业厅'}</UIButton></label>
    <label>出库仓 <UIButton aria-label="选择调整后的出库仓" disabled={!draft.hall} onClick={() => void session.openPicker('warehouse')}>{draft.warehouse?.name ?? '请选择出库仓'}</UIButton></label>
    {picker && <div role="group" aria-label={picker.kind === 'hall' ? '营业厅候选' : '出库仓候选'}><UIInput aria-label="搜索厅仓候选" value={picker.search} onChange={value => void session.search(value)}/>{picker.phase === 'loading' ? <p role="status">正在读取候选…</p> : picker.phase === 'error' ? <p role="alert">候选读取失败。<UIButton onClick={() => void session.retry()}>重试</UIButton></p> : <><div role="listbox">{picker.result?.items.map(row => <UIButton role="option" aria-selected={row.id === (picker.kind === 'hall' ? draft.hall?.id : draft.warehouse?.id)} key={row.id} onClick={() => void select(row.id)}>{'name' in row ? row.name : row.id}</UIButton>)}</div>{picker.result && <div><UIButton disabled={picker.page <= 1} onClick={() => void session.page(picker.page - 1)}>上一页</UIButton><span>第 {picker.page} 页</span><UIButton disabled={BigInt(picker.page) * 20n >= picker.result.exactTotal} onClick={() => void session.page(picker.page + 1)}>下一页</UIButton></div>}</>}</div>}
    {state.notice && <p role="status">{state.notice}</p>}</div>
  </SourceDocumentDialog>;
}
