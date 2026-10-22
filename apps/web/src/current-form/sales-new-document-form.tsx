import type { SalesProductCapability } from '../sales/document-presentation.tsx';
import { useSyncExternalStore } from 'react';
import type { ReadScope } from '../loading/read-scope.ts';
import { SalesCommandForm } from '../sales/commands/form.tsx';
import { SalesProposalForm } from './sales-proposal-form.tsx';
import type { SalesNewDocumentSession } from './sales-create.ts';
import type { SalesHistoryReader } from '../sales/history-http-reader.ts';
export function SalesNewDocumentForm({ session, scope, close, historyReader, product }: { readonly session: SalesNewDocumentSession; readonly scope: ReadScope; readonly close: () => void; readonly historyReader?: SalesHistoryReader; readonly product?: SalesProductCapability }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const editor = useSyncExternalStore(session.editor.subscribe, session.editor.getSnapshot, session.editor.getSnapshot);
  if (!scope.active || state.disposed) return <p role="status">新单会话已关闭。</p>;
  if (editor.command.editor) return <SalesCommandForm session={session.editor} scope={scope} close={close} {...(product ? { product } : {})} {...(historyReader ? { history: { scope, reader: historyReader } } : {})} />;
  return <SalesProposalForm session={session.proposal} scope={scope} close={close} {...(product ? { product } : {})} preparation={{ save: () => { void session.save(); }, preparing: state.preparing, notice: state.notice, cancel: () => session.cancelPreparation() }} />;
}
