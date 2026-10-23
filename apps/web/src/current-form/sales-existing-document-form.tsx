import { useEffect, useState, useSyncExternalStore } from 'react';
import { UIButton } from '../components/standard-controls.tsx';
import { SourceDocumentDialog, StandardOverlay } from '../components/standard-overlay.tsx';
import { DocumentOutputActions } from '../components/document-output.tsx';
import { salesDocumentOutput } from '../components/document-output-contracts.ts';
import { SalesHistoryAction } from '../sales/history-view.tsx';
import { settlementBalanced } from '../sales/commands/validation.ts';
import { SalesNativeCommandForm, type SalesCommandFormProps } from '../sales/commands/form.tsx';
import type { SalesExistingDocumentSession } from './sales-existing-document.ts';
import { SalesProposalForm } from './sales-proposal-form.tsx';

/** Full-page saved editor. The native session still owns the CAS, original
 * request, uncertain receipt and explicit adoption. No CREATE path is used. */
export function SalesExistingDocumentForm(props: SalesCommandFormProps) {
  const state = useSyncExternalStore(props.session.subscribe, props.session.getSnapshot, props.session.getSnapshot);
  const [model, setModel] = useState<SalesExistingDocumentSession | null>(null);
  useEffect(() => { const current = props.session.prepareExistingDocument(); setModel(current); if (current) void current.initialize(); }, [props.session, state.command.editor?.detail]);
  if (!model || model !== props.session.existingDocument) return props.session.editable ? <p role="status">正在读取原单实际规格…</p> : <SalesNativeCommandForm {...props} />;
  return <SavedSalesDocument {...props} model={model} />;
}
function SavedSalesDocument({ model, ...props }: SalesCommandFormProps & { readonly model: SalesExistingDocumentSession }) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
  const owner = useSyncExternalStore(props.session.subscribe, props.session.getSnapshot, props.session.getSnapshot);
  const [confirm, setConfirm] = useState<'leave' | 'APPROVE' | 'VOID' | null>(null);
  const original = model.original, native = owner.command;
  useEffect(() => { setConfirm(null); }, [native.write.phase, native.editor?.detail]);
  if (state.disposed || !original) return <SalesNativeCommandForm {...props} />;
  if (state.phase === 'idle' || state.phase === 'loading') return <p role="status">正在读取原单实际规格，输入已保留…</p>;
  if (state.phase !== 'ready' || !state.proposal) return <><p role="status">{state.notice}</p><SalesNativeCommandForm {...props} /></>;
  // Original native recovery is authoritative and keeps this proposal mounted
  // in its session owner. No new preparation/key replaces an uncertain write.
  if (!props.session.editable) return <SalesNativeCommandForm {...props} />;
  const dirty = props.session.hasDirtyDraft, draft = native.editor?.draft;
  const leave = () => { if (dirty) setConfirm('leave'); else if (props.session.discardEditor()) props.close(); };
  const actions = <>
    <UIButton disabled={dirty || !draft || !settlementBalanced(draft) || !props.session.actionAllowed('APPROVE')} onClick={() => setConfirm('APPROVE')}>审核</UIButton>
    <UIButton disabled={dirty || !props.session.actionAllowed('VOID')} onClick={() => setConfirm('VOID')}>作废</UIButton>
    <DocumentOutputActions sourceKey={`${original.document.header.id}:${original.document.header.version}`} {...(!dirty ? { getDocument: () => salesDocumentOutput(original) } : {})} unavailableReason="请先保存并采用当前单据" />
    <SalesHistoryAction {...(props.history ? { capability: props.history } : {})} salesId={original.document.header.id} />
  </>;
  return <><SalesProposalForm session={state.proposal} close={leave} {...(props.scope ? { scope: props.scope } : {})} {...(props.product ? { product: props.product } : {})}
    navigationLeave={{ canDiscard: !state.preparing && props.session.editable, discard: () => props.session.discardEditor(true) }}
    saved={{ number: original.document.header.number, actions, ...(native.notice || owner.notice ? { feedback: <p role="status">{owner.notice ?? native.notice}</p> } : {}) }}
    preparation={{ preparing: state.preparing, notice: state.notice, save: () => { void props.session.save(); }, cancel: () => model.cancelPreparation() }} />
    {confirm === 'leave' && <SourceDocumentDialog title="有未保存的修改" label="有未保存的修改" closeLabel="关闭弹窗" close={() => setConfirm(null)} className="source-discard-dialog" footer={<><button type="button" className="btn" data-erp-keep-input onClick={() => setConfirm(null)}>继续编辑</button><button type="button" className="btn primary" onClick={() => { setConfirm(null); if (props.session.discardEditor(true)) props.close(); }}>放弃修改并离开</button></>}><div className="ui-confirm-body"><p>离开后，本次未保存的修改将丢失。</p></div></SourceDocumentDialog>}
    {confirm && confirm !== 'leave' && <StandardOverlay role="alertdialog" title="确认操作" label="确认销货单操作" closeLabel="关闭销货单操作确认" close={() => setConfirm(null)} width={620} initialFocus="[data-erp-keep-input]"><p>{confirm === 'APPROVE' ? '审核将按本单实际明细追加库存效果，并计入收退统计。允许负库存。' : '作废仅作用于已保存未审核单据，不改库存。'}</p><UIButton data-erp-keep-input onClick={() => setConfirm(null)}>保留输入</UIButton><UIButton className="iw-primary" onClick={() => { const action = confirm; setConfirm(null); void props.session.submit(action); }}>{confirm === 'APPROVE' ? '确认审核' : '确认作废'}</UIButton></StandardOverlay>}
  </>;
}
