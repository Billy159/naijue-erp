import { useSyncExternalStore } from 'react';
import type { ReadScope } from '../loading/read-scope.ts';
import { SalesCommandForm } from '../sales/commands/form.tsx';
import { SalesProposalForm } from './sales-proposal-form.tsx';
import type { SalesNewDocumentSession } from './sales-create.ts';
export function SalesNewDocumentForm({ session, scope, close }: { readonly session: SalesNewDocumentSession; readonly scope: ReadScope; readonly close: () => void }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const editor = useSyncExternalStore(session.editor.subscribe, session.editor.getSnapshot, session.editor.getSnapshot);
  if (!scope.active || state.disposed) return <p role="status">新单会话已关闭。</p>;
  if (editor.command.editor) return <SalesCommandForm session={session.editor} close={close} />;
  return <SalesProposalForm session={session.proposal} close={close} preparation={{ save: () => { void session.save(); }, preparing: state.preparing, notice: state.notice, cancel: () => session.cancelPreparation() }} />;
}
