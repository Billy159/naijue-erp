import type { SalesProductCapability } from '../sales/document-presentation.tsx';
import { useSyncExternalStore } from 'react';
import type { ReadScope } from '../loading/read-scope.ts';
import { SalesCommandForm } from '../sales/commands/form.tsx';
import { SalesProposalForm } from './sales-proposal-form.tsx';
import type { SalesNewDocumentSession } from './sales-create.ts';
import type { SalesHistoryReader } from '../sales/history-http-reader.ts';
import { UIButton } from '../components/standard-controls.tsx';
export function SalesNewDocumentForm({ session, scope, close, historyReader, product }: { readonly session: SalesNewDocumentSession; readonly scope: ReadScope; readonly close: () => void; readonly historyReader?: SalesHistoryReader; readonly product?: SalesProductCapability }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const editor = useSyncExternalStore(session.editor.subscribe, session.editor.getSnapshot, session.editor.getSnapshot);
  if (!scope.active || state.disposed) return <p role="status">新单会话已关闭。</p>;
  const command = editor.command, commands = session.editor.commands;
  if (command.editor?.mode === 'EXISTING' || command.editor?.mode === 'CREATE' && command.write.phase === 'committed') return <SalesCommandForm session={session.editor} scope={scope} close={close} {...(product ? { product } : {})} {...(historyReader ? { history: { scope, reader: historyReader } } : {})} />;
  const rejectedCreate = command.write.phase === 'rejected' && command.write.command?.action === 'SAVE' && command.editor?.mode === 'CREATE';
  const canDiscard = scope.active && !state.preparing && !commands.hasUnresolvedWrite;
  const canSave = !commands.hasUnresolvedWrite && command.write.phase !== 'committed' && (!command.editor || rejectedCreate);
  const feedback = ['submitting', 'checking', 'replaying'].includes(command.write.phase)
    ? <p role="status">{command.write.phase === 'checking' ? '正在核实原操作回执…' : '正在提交原操作…'}<UIButton className="iw-link" onClick={() => commands.cancelWaiting()}>停止等待</UIButton></p>
    : command.write.phase === 'uncertain'
      ? <div className="sales-command-recovery" role="status"><strong>原操作结果不确定，请勿重复新建操作。</strong><span>操作键：{command.write.command?.requestKey}</span><UIButton onClick={() => { void commands.checkReceipt(); }}>核实原操作回执</UIButton><UIButton onClick={() => { void commands.replayOriginal(); }}>重放原请求</UIButton></div>
      : command.write.phase === 'rejected' ? <p role="alert">{command.notice ?? '请求已拒绝，原草稿已保留。'}{command.write.command?.requestKey && <> 操作键：{command.write.command.requestKey}</>}</p> : null;
  const discardSource = () => {
    if (!scope.active || session.getSnapshot().disposed || session.getSnapshot().preparing || commands.hasUnresolvedWrite || !session.proposal.reset(true)) return false;
    return !rejectedCreate || session.editor.discardEditor(true);
  };
  const closeSource = () => { if (rejectedCreate && !commands.hasUnresolvedWrite) session.editor.discardEditor(true); close(); };
  return <SalesProposalForm session={session.proposal} scope={scope} close={closeSource} {...(product ? { product } : {})}
    navigationLeave={{ canDiscard, discard: discardSource }}
    preparation={{ save: () => { void session.save(); }, disabled: !canSave, preparing: state.preparing, notice: state.notice, cancel: () => session.cancelPreparation(), feedback }} />;
}
