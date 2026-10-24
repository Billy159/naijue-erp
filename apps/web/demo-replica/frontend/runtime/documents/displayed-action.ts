import type {ReplicaSalesSession} from './sales-session.ts';
import type {ReplicaTransferSession} from './transfers-session.ts';
import type {SalesDetailDto} from '../../../../src/sales/contracts.ts';
import type {TransferDetailDto} from '../../../../src/transfers/contracts.ts';
type Action='APPROVE'|'UNAPPROVE'|'VOID';
export type DisplayedActionOutcome='committed'|'changed'|'failed';
/** Fresh eligibility reads cannot silently upgrade the document version the user confirmed. */
export async function submitDisplayedSalesAction(session:ReplicaSalesSession,shown:SalesDetailDto,action:Action):Promise<DisplayedActionOutcome>{
 if(shown.stockBasis!=='RUNTIME_LEDGER'||!session.scope.active||!await session.editor.openExisting(shown.document.header.id))return 'failed';
 const current=session.editor.getSnapshot().command.editor?.detail?.document.header,expected=shown.document.header;
 if(!current||current.id!==expected.id||current.version!==expected.version||current.status!==expected.status){session.editor.discardEditor();return 'changed';}
 await session.editor.submit(action);return session.editor.getSnapshot().command.write.phase==='committed'?'committed':'failed';
}
export async function submitDisplayedTransferAction(session:ReplicaTransferSession,shown:TransferDetailDto,action:Action):Promise<DisplayedActionOutcome>{
 if(shown.stockBasis!=='RUNTIME_LEDGER'||!session.scope.active||!await session.workspace.openExisting(shown.document.header.id))return 'failed';
 const current=session.workspace.getSnapshot().editor?.detail?.document.header,expected=shown.document.header;
 if(!current||current.id!==expected.id||current.version!==expected.version||current.status!==expected.status){session.workspace.discardEditor();return 'changed';}
 await session.workspace.submit(action);return session.workspace.getSnapshot().write.phase==='committed'?'committed':'failed';
}
