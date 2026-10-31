import type { DocumentResponsibleStaffCapability } from '../../../../src/application/contracts.ts';
import { createCurrentFormHttpReader } from '../../../../src/current-form/http-reader.ts';
import { createSalesExistingPreparationHttpClient } from '../../../../src/current-form/existing-document-preparation.ts';
import { SalesProposalSession } from '../../../../src/current-form/sales-proposal.ts';
import { SalesNewDocumentSession, createSalesPreparationHttpClient } from '../../../../src/current-form/sales-create.ts';
import { createSalesHttpReader } from '../../../../src/sales/http-reader.ts';
import { LatestQuery } from '../../../../src/loading/latest-query.ts';
import { createNormalListReader } from './normal-list-reader.ts';
import { createSalesCommandHttpClient } from '../../../../src/sales/commands/http-client.ts';
import { SalesEditorSession } from '../../../../src/sales/commands/editor-session.ts';
import type { HistoryTarget } from './history-reader.ts';
import type { HistoryRevisionOwner } from './history-revision.ts';
import type { NormalSalesRow } from './normal-list-reader.ts';
import { documentRowKey } from './normal-list-reader.ts';
import type { ReplicaSession } from '../common/session.ts';

/** One session per actual Demo document workspace; retain it when its DOM is detached.
 * The original proposal/preparation/command owners retain exact money, SKU preparation,
 * immutable creator, responsibility and original-key recovery semantics.
 */
export function createReplicaSalesSession(runtime: ReplicaSession, options: {
  readonly instanceId: string;
  readonly newRequestKey: () => string;
  readonly responsibleStaff?: DocumentResponsibleStaffCapability;readonly responsibleReady?:boolean;
}) {
  const historyOwners=new Map<string,{scope:import('../../../../src/loading/read-scope.ts').ReadScope;owner:HistoryRevisionOwner}>();
  const selection:{row:NormalSalesRow|null}={row:null};
  const presentation:{businessChoice:'SALE'|'RETURN_EXCHANGE'|null;salespersonDefault:{attempted:boolean;touched:boolean;notice:string|null}}={businessChoice:null,salespersonDefault:{attempted:false,touched:false,notice:null}};
  const principal = runtime.auth.getSnapshot().principal;
  if (!principal) throw new Error('An authenticated session is required to open sales.');
  const scope = runtime.reads.createScope(options.instanceId);
  const reader = createSalesHttpReader(runtime.http);
  const current = createCurrentFormHttpReader(runtime.http);
  const normalReader=createNormalListReader(runtime.http);
  const listQuery=new LatestQuery({scope,execute:normalReader.readSales});
  const list=Object.freeze({list:listQuery,dispose:()=>listQuery.dispose()});
  const proposal = new SalesProposalSession(scope, current, runtime.onAccessFailure);
  const editor = new SalesEditorSession({
    scope, principal, reader,
    client: createSalesCommandHttpClient(runtime.http),
    newRequestKey: options.newRequestKey,
    onAccessFailure: runtime.onAccessFailure,
    existingPreparation: createSalesExistingPreparationHttpClient(runtime.http),
    existingReader: current,
  });
  const create = new SalesNewDocumentSession({ scope, proposal, editor,
    preparation: createSalesPreparationHttpClient(runtime.http),
    onAccessFailure: runtime.onAccessFailure,
  });
  return Object.freeze({ scope, reader, current, list, proposal, editor, create, selection, historyOwners, presentation, currentEmployee:{id:principal.staffId,name:principal.staffName??null},
    async historyOwner(target:HistoryTarget){const key=documentRowKey({dataset:'HISTORY',...target});const existing=historyOwners.get(key);if(existing?.scope.active)return existing.owner;const {HistoryRevisionOwner}=await import('./history-revision.ts');if(!scope.active)throw new Error('登录身份已改变。');const cached=historyOwners.get(key);if(cached?.scope.active)return cached.owner;const child=runtime.reads.createScope('replica-history:'+key),owner=new HistoryRevisionOwner({scope:child,target,http:runtime.http,denied:runtime.onAccessFailure});historyOwners.set(key,{scope:child,owner});return owner;},
    dispose(): void { for(const entry of historyOwners.values()){entry.owner.dispose();entry.scope.dispose();}historyOwners.clear();selection.row=null;scope.dispose(); create.dispose(); proposal.dispose(); editor.dispose(); list.dispose(); },
  });
}

export type ReplicaSalesSession = ReturnType<typeof createReplicaSalesSession>;

export function salesCanLeave(session:ReplicaSalesSession):boolean {
 if(!session.scope.active)return true;
 if([...session.historyOwners.values()].some(entry=>entry.owner.unresolved))return false;
 if(session.editor.getSnapshot().command.write.phase==='committed')return true;
 const proposal=session.proposal.getSnapshot();
 return session.editor.canLeave()&&!session.create.getSnapshot().preparing&&!proposal.dirty&&!proposal.lineEdit&&!Object.values(proposal.entries).flat().some(row=>row.product||row.query.trim());
}
export function salesCanDiscard(session:ReplicaSalesSession){return session.scope.active&&!session.create.getSnapshot().preparing&&!session.editor.getSnapshot().preparing&&!session.editor.commands.hasUnresolvedWrite&&![...session.historyOwners.values()].some(entry=>entry.owner.unresolved);}
