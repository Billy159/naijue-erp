import { useEffect, useState, useSyncExternalStore } from 'react';
import { UIButton } from '../components/standard-controls.tsx';
import { SourceDocumentDialog, StandardOverlay } from '../components/standard-overlay.tsx';
import { DocumentOutputActions } from '../components/document-output.tsx';
import { transferDocumentOutput } from '../components/document-output-contracts.ts';
import { TransferHistoryAction } from '../transfers/history-view.tsx';
import { TransferSavedRecords } from '../transfers/saved-records.tsx';
import { TransferNativeCommandForm, TransferVoidConfirmation, type TransferCommandFormProps } from '../transfers/commands/form.tsx';
import type { TransferExistingDocumentSession } from './transfer-existing-document.ts';
import { TransferProposalForm } from './transfer-proposal-form.tsx';

export function TransferExistingDocumentForm(props: TransferCommandFormProps) {
  const workspace = props.capability.workspace, state = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot, workspace.getSnapshot);
  const [model, setModel] = useState<TransferExistingDocumentSession | null>(null);
  useEffect(() => { const current = workspace.prepareExistingDocument(); setModel(current); if (current) void current.initialize(); }, [workspace, state.editor?.detail]);
  if (!model || model !== workspace.existingDocument) return workspace.editableExistingProposal ? <p role="status">正在读取原单实际规格…</p> : <TransferNativeCommandForm {...props} />;
  return <SavedTransferDocument {...props} model={model} />;
}
function SavedTransferDocument({ model, ...props }: TransferCommandFormProps & { readonly model: TransferExistingDocumentSession }) {
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot), workspace = props.capability.workspace;
  const native = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot, workspace.getSnapshot);
  const [confirm, setConfirm] = useState<'leave' | 'APPROVE' | 'VOID' | null>(null), original = model.original;
  useEffect(() => { setConfirm(null); }, [native.write.phase, native.editor?.detail]);
  if (state.disposed || !original) return <TransferNativeCommandForm {...props} />;
  if (state.phase === 'idle' || state.phase === 'loading') return <p role="status">正在读取原单实际规格，输入已保留…</p>;
  if (state.phase !== 'ready' || !state.proposal) return <><p role="status">{state.notice}</p><TransferNativeCommandForm {...props} /></>;
  if (!workspace.editableExistingProposal) return <TransferNativeCommandForm {...props} />;
  const dirty = workspace.hasDirtyDraft;
  const leave = () => { if (dirty) setConfirm('leave'); else if (workspace.discardEditor()) props.close(); };
  const beforeSave = <UIButton className="iw-text-button" disabled={dirty} onClick={() => setConfirm('VOID')}>作废</UIButton>;
  const actions = <>
    <UIButton className="iw-text-button" disabled={dirty} onClick={() => setConfirm('APPROVE')}>审核</UIButton>
    <DocumentOutputActions sourceKey={`${original.document.header.id}:${original.document.header.version}`} {...(!dirty ? { getDocument: () => transferDocumentOutput(original) } : {})} unavailableReason="请先保存并采用当前单据" />
    <TransferHistoryAction {...(props.history ? { capability: props.history } : {})} transferId={original.document.header.id} />
  </>;
  return <><TransferProposalForm {...props.presentation} scope={props.scope} creatorName={original.references.createdByName ?? '未知'} session={state.proposal} close={leave}
    navigationLeave={{ canDiscard: !state.preparing && workspace.editableExistingProposal,
      discard: () => props.scope.active && workspace.existingDocument === model && !model.getSnapshot().preparing && workspace.discardEditor() }}
    saved={{ number: original.document.header.number, beforeSave, actions, records: <TransferSavedRecords data={original} />, ...(native.notice ? { feedback: <p role="status">{native.notice}</p> } : {}) }}
    preparation={{ preparing: state.preparing, notice: state.notice, save: () => { void workspace.submit('SAVE'); }, cancel: () => model.cancelPreparation() }} />
    {confirm === 'leave' && <SourceDocumentDialog title="有未保存的修改" label="有未保存的修改" closeLabel="关闭弹窗" close={() => setConfirm(null)} className="transfer-source-discard" initialFocus="[data-erp-keep-input]" footer={<><button type="button" className="btn" data-erp-keep-input onClick={() => setConfirm(null)}>继续编辑</button><button type="button" className="btn primary" onClick={() => { setConfirm(null); if (workspace.discardEditor()) props.close(); }}>放弃修改并离开</button></>}><div className="ui-confirm-body"><p>离开后，本次未保存的修改将丢失。</p></div></SourceDocumentDialog>}
    {confirm === 'VOID' && <TransferVoidConfirmation number={original.document.header.number} close={() => setConfirm(null)} confirm={() => { setConfirm(null); void workspace.submit('VOID'); }} />}
    {confirm === 'APPROVE' && <StandardOverlay role="alertdialog" title="确认操作" label="确认调拨单操作" closeLabel="关闭调拨单操作确认" close={() => setConfirm(null)} width={620} initialFocus="[data-erp-keep-input]"><p>审核将按本单实际明细追加双端库存效果。允许负库存。</p><UIButton data-erp-keep-input onClick={() => setConfirm(null)}>保留输入</UIButton><UIButton className="iw-primary" onClick={() => { setConfirm(null); void workspace.submit('APPROVE'); }}>确认审核</UIButton></StandardOverlay>}
  </>;
}
