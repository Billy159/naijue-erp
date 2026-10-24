import {createResponsibleCapability} from './responsible-capability.ts';
import type {DocumentResponsibleStaffCapability} from '../../../../src/application/contracts.ts';
import {createCurrentFormHttpReader} from '../../../../src/current-form/http-reader.ts';
import {createTransferExistingPreparationHttpClient} from '../../../../src/current-form/existing-document-preparation.ts';
import {TransferProposalSession} from '../../../../src/current-form/transfer-proposal.ts';
import {TransferNewDocumentSession,createTransferPreparationHttpClient} from '../../../../src/current-form/transfer-create.ts';
import {createTransferHttpReader,createTransferWarehouseHttpReader} from '../../../../src/transfers/http-reader.ts';
import {TransferCommandWorkspace} from '../../../../src/transfers/commands/controller.ts';
import {createTransferCommandHttpClient} from '../../../../src/transfers/commands/http-client.ts';
import {LatestQuery} from '../../../../src/loading/latest-query.ts';
import {createNormalListReader,documentRowKey,type NormalTransferRow} from './normal-list-reader.ts';
import type {HistoryTarget} from './history-reader.ts';
import type {HistoryRevisionOwner} from './history-revision.ts';
import type {ReadScope} from '../../../../src/loading/read-scope.ts';
import type {ReplicaSession} from '../common/session.ts';
/** Original native model/command owners. Normal union reads have their own exact26 decoder. */
export function createReplicaTransferSession(runtime:ReplicaSession,options:{instanceId:string;newRequestKey:()=>string;responsibleStaff?:DocumentResponsibleStaffCapability;responsibleReady?:boolean}){
 const principal=runtime.auth.getSnapshot().principal;if(!principal)throw new Error('请先登录。');
 const scope=runtime.reads.createScope(options.instanceId),reader=createTransferHttpReader(runtime.http),references=createTransferWarehouseHttpReader(runtime.http),current=createCurrentFormHttpReader(runtime.http),normal=createNormalListReader(runtime.http);
 const list=new LatestQuery({scope,execute:normal.readTransfers});
 const responsibleStaff=options.responsibleStaff??(options.responsibleReady===true?createResponsibleCapability(runtime,scope):undefined);
 const workspace=new TransferCommandWorkspace({scope,reader,client:createTransferCommandHttpClient(runtime.http),newRequestKey:options.newRequestKey,onAccessFailure:runtime.onAccessFailure,existingPreparation:createTransferExistingPreparationHttpClient(runtime.http),existingReader:current,...(responsibleStaff?{responsibleStaff}:{})});
 const proposal=new TransferProposalSession(scope,current,runtime.onAccessFailure),create=new TransferNewDocumentSession({scope,proposal,workspace,preparation:createTransferPreparationHttpClient(runtime.http),onAccessFailure:runtime.onAccessFailure});
 const selection:{row:NormalTransferRow|null}={row:null},historyOwners=new Map<string,{scope:ReadScope;owner:HistoryRevisionOwner}>();
 return Object.freeze({scope,reader,references,current,list,workspace,proposal,create,selection,historyOwners,
  async historyOwner(target:HistoryTarget){if(target.kind!=='transfers')throw new Error('历史单据类型不匹配。');const key=documentRowKey({dataset:'HISTORY',...target}),existing=historyOwners.get(key);if(existing?.scope.active)return existing.owner;const {HistoryRevisionOwner}=await import('./history-revision.ts');if(!scope.active)throw new Error('登录身份已改变。');const child=runtime.reads.createScope('replica-history:'+key),owner=new HistoryRevisionOwner({scope:child,target,http:runtime.http,denied:runtime.onAccessFailure});historyOwners.set(key,{scope:child,owner});return owner;},
  dispose(){scope.dispose();list.dispose();workspace.dispose();proposal.dispose();create.dispose();selection.row=null;for(const entry of historyOwners.values()){entry.owner.dispose();entry.scope.dispose();}historyOwners.clear();}
 });
}
export type ReplicaTransferSession=ReturnType<typeof createReplicaTransferSession>;
export function transferCanLeave(session:ReplicaTransferSession){if(!session.scope.active)return true;if([...session.historyOwners.values()].some(entry=>entry.owner.unresolved))return false;if(session.workspace.getSnapshot().write.phase==='committed')return true;const proposal=session.proposal.getSnapshot();return session.workspace.canLeave()&&!session.create.getSnapshot().preparing&&!proposal.dirty&&!proposal.replacement&&!proposal.pending.product&&!proposal.pending.query.trim()&&!Object.values(proposal.pending.quantities).some(raw=>raw!=='');}
