import type { TransferHistoryReader } from '../transfers/history-http-reader.ts';
import { useSyncExternalStore } from 'react';
import type { ReadScope } from '../loading/read-scope.ts';
import { TransferCommandForm } from '../transfers/commands/form.tsx';
import { TransferProposalForm } from './transfer-proposal-form.tsx';
import type { TransferNewDocumentSession } from './transfer-create.ts';
/** Explicit opt-in host bridge; the caller loads existing transfer styles and owns
 * the identity-bound sessions. No HTTP endpoint is assumed or silently enabled. */
export function TransferNewDocumentForm({ session, scope, close, historyReader }: { readonly historyReader?: TransferHistoryReader; readonly session: TransferNewDocumentSession; readonly scope: ReadScope; readonly close: () => void }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const command = useSyncExternalStore(session.workspace.subscribe, session.workspace.getSnapshot, session.workspace.getSnapshot);
  if (!scope.active || state.disposed) return <p role="status">新单会话已关闭。</p>;
  if (command.editor) return <TransferCommandForm capability={{ workspace: session.workspace }} scope={scope} close={close} {...(historyReader ? { history: { scope, reader: historyReader } } : {})} />;
  return <TransferProposalForm session={session.proposal} close={close} preparation={{ save: () => { void session.save(); }, preparing: state.preparing, notice: state.notice, cancel: () => session.cancelPreparation() }} />;
}
