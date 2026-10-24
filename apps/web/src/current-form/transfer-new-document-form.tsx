import type { TransferProposalPresentation } from './transfer-proposal-form.tsx';
import type { TransferHistoryReader } from '../transfers/history-http-reader.ts';
import { useSyncExternalStore } from 'react';
import type { ReadScope } from '../loading/read-scope.ts';
import { TransferCommandForm } from '../transfers/commands/form.tsx';
import { TransferProposalForm } from './transfer-proposal-form.tsx';
import type { TransferNewDocumentSession } from './transfer-create.ts';
import { UIButton } from '../components/standard-controls.tsx';
/** Explicit opt-in host bridge; the caller loads existing transfer styles and owns
 * the identity-bound sessions. No HTTP endpoint is assumed or silently enabled. */
export function TransferNewDocumentForm({ session, scope, close, historyReader, presentation }: { readonly presentation?: TransferProposalPresentation; readonly historyReader?: TransferHistoryReader; readonly session: TransferNewDocumentSession; readonly scope: ReadScope; readonly close: () => void }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const command = useSyncExternalStore(session.workspace.subscribe, session.workspace.getSnapshot, session.workspace.getSnapshot);
  if (!scope.active || state.disposed) return <p role="status">新单会话已关闭。</p>;
  if (command.editor?.mode === 'EXISTING' || command.editor?.mode === 'CREATE' && command.write.phase === 'committed') return <TransferCommandForm {...(presentation ? { presentation } : {})} capability={{ workspace: session.workspace }} scope={scope} close={close} {...(historyReader ? { history: { scope, reader: historyReader } } : {})} />;
  const rejectedCreate = command.write.phase === 'rejected' && command.write.command?.action === 'SAVE' && command.editor?.mode === 'CREATE';
  const canSave = !session.workspace.hasUnresolvedWrite && command.write.phase !== 'committed' && (!command.editor || rejectedCreate);
  const writeFeedback = ['submitting', 'checking', 'replaying'].includes(command.write.phase)
    ? <p className="transfer-command-notice" role="status">{command.write.phase === 'checking' ? '正在核实原操作回执…' : '正在提交原操作…'}<UIButton type="button" className="iw-link" onClick={() => session.workspace.cancelWaiting()}>停止等待</UIButton></p>
    : command.write.phase === 'uncertain'
      ? <div className="transfer-command-recovery" role="status"><strong>原操作结果不确定，请勿重复新建操作。</strong><span>操作键：{command.write.command?.requestKey}</span><UIButton type="button" className="iw-button" onClick={() => { void session.workspace.checkReceipt(); }}>核实原操作回执</UIButton><UIButton type="button" className="iw-button" onClick={() => { void session.workspace.replayOriginal(); }}>重放原请求</UIButton></div>
      : command.write.phase === 'rejected'
        ? <p className="transfer-command-notice" role="alert">{command.notice ?? '请求已拒绝，原草稿已保留。'}{command.write.command?.requestKey && <> 操作键：{command.write.command.requestKey}</>}</p>
        : null;
  const discardSource = () => {
    if (!scope.active || session.getSnapshot().disposed || session.getSnapshot().preparing || session.workspace.hasUnresolvedWrite) return false;
    if (!session.proposal.reset(true)) return false;
    return !rejectedCreate || session.workspace.discardEditor();
  };
  const closeSource = () => { if (rejectedCreate && !session.workspace.hasUnresolvedWrite) session.workspace.discardEditor(); close(); };
  return <TransferProposalForm {...presentation} identity={{ ...(session.workspace.responsibleStaff ? { capability: session.workspace.responsibleStaff } : {}), onAccessFailure: session.workspace.responsibleAccessFailure }} scope={scope} session={session.proposal} close={closeSource}
    navigationLeave={{ canDiscard: scope.active && !state.preparing && !session.workspace.hasUnresolvedWrite,
      discard: discardSource }}
    preparation={{ save: () => { void session.save(); }, preparing: state.preparing, notice: state.notice, cancel: () => session.cancelPreparation(), canSave, feedback: writeFeedback }} />;
}
