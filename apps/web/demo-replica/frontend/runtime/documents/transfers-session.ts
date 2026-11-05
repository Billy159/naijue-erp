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
import {createNormalListReader,createOrdinaryListReader,documentRowKey,type NormalTransferRow,type NormalTransferPage,type OrdinaryTransferPage} from './normal-list-reader.ts';
import type {HistoryTarget} from './history-reader.ts';
import type {HistoryRevisionOwner} from './history-revision.ts';
import type {ReadScope} from '../../../../src/loading/read-scope.ts';
import {OrdinaryListTotals} from './ordinary-list-totals.ts';
import type {TransferListQuery} from '../../../../src/transfers/contracts.ts';
import type {ReplicaSession} from '../common/session.ts';
/** Original native model/command owners. Normal union reads have their own exact26 decoder. */
export function createReplicaTransferSession(runtime:ReplicaSession,options:{documentListProfile?:'source-confirmed-ordinary-documents-v1';instanceId:string;newRequestKey:()=>string;responsibleStaff?:DocumentResponsibleStaffCapability;responsibleReady?:boolean}){
 if(options.documentListProfile!==undefined&&options.documentListProfile!=='source-confirmed-ordinary-documents-v1')throw new TypeError('Unsupported document list profile.');
 const principal=runtime.auth.getSnapshot().principal;if(!principal)throw new Error('请先登录。');
 const scope=runtime.reads.createScope(options.instanceId),reader=createTransferHttpReader(runtime.http),references=createTransferWarehouseHttpReader(runtime.http),current=createCurrentFormHttpReader(runtime.http),normal=createNormalListReader(runtime.http);
 const ordinary=options.documentListProfile==='source-confirmed-ordinary-documents-v1',ordinaryReader=createOrdinaryListReader(runtime.http);
 const totals=new OrdinaryListTotals({scope,execute:ordinaryReader.readTransferTotals});
 const list=new LatestQuery<TransferListQuery,NormalTransferPage|OrdinaryTransferPage>({scope,execute:read=>ordinary?ordinaryReader.readTransfers(read):normal.readTransfers(read)}),categoryDetails=new LatestQuery({scope,execute:normal.readTransferCategories});
 let acceptedSequence=0,filterKey:string|null=null,needsListRefresh=false;
 const stopList=list.subscribe(()=>{if(!ordinary)return;const state=list.getSnapshot();if(state.phase==='loading'){const next=JSON.stringify(state.request?.parameters.filter);if(filterKey!==null&&next!==filterKey)totals.invalidate();filterKey=next;}if(state.phase==='success'&&state.success&&state.success.sequence!==acceptedSequence&&'readRevision' in state.success.data){acceptedSequence=state.success.sequence;needsListRefresh=false;void totals.load(state.success.parameters.filter,state.success.data.readRevision);}});
 const responsibleStaff=options.responsibleStaff??(options.responsibleReady===true?createResponsibleCapability(runtime,scope):undefined);
 const workspace=new TransferCommandWorkspace({scope,reader,...(ordinary?{documentListProfile:options.documentListProfile}:{}),client:createTransferCommandHttpClient(runtime.http),newRequestKey:options.newRequestKey,onAccessFailure:runtime.onAccessFailure,existingPreparation:createTransferExistingPreparationHttpClient(runtime.http),existingReader:current,...(responsibleStaff?{responsibleStaff}:{})});
 let committedOperation:string|null=null;
 const stopCommands=workspace.subscribe(()=>{const write=workspace.getSnapshot().write;if(ordinary&&write.phase==='committed'&&write.result&&write.result.operationId!==committedOperation){committedOperation=write.result.operationId;needsListRefresh=true;list.cancel();totals.invalidate();}});
 const proposal=new TransferProposalSession(scope,current,runtime.onAccessFailure),create=new TransferNewDocumentSession({scope,proposal,workspace,preparation:createTransferPreparationHttpClient(runtime.http),onAccessFailure:runtime.onAccessFailure});
 const selection:{row:NormalTransferRow|null}={row:null},historyOwners=new Map<string,{scope:ReadScope;owner:HistoryRevisionOwner}>();
 return Object.freeze({ordinary,totals,get needsListRefresh(){return needsListRefresh;},scope,reader,references,current,list,categoryDetails,workspace,proposal,create,selection,historyOwners,currentEmployee:{id:principal.staffId,name:principal.staffName??null},
  async historyOwner(target:HistoryTarget){if(ordinary)throw new Error('当前普通单据入口不提供历史资料。');if(target.kind!=='transfers')throw new Error('历史单据类型不匹配。');const key=documentRowKey({dataset:'HISTORY',...target}),existing=historyOwners.get(key);if(existing?.scope.active)return existing.owner;const {HistoryRevisionOwner}=await import('./history-revision.ts');if(!scope.active)throw new Error('登录身份已改变。');const cached=historyOwners.get(key);if(cached?.scope.active)return cached.owner;const child=runtime.reads.createScope('replica-history:'+key),owner=new HistoryRevisionOwner({scope:child,target,http:runtime.http,denied:runtime.onAccessFailure});historyOwners.set(key,{scope:child,owner});return owner;},
  dispose(){stopList();stopCommands();totals.dispose();scope.dispose();list.dispose();categoryDetails.dispose();workspace.dispose();proposal.dispose();create.dispose();selection.row=null;for(const entry of historyOwners.values()){entry.owner.dispose();entry.scope.dispose();}historyOwners.clear();}
 });
}
export type ReplicaTransferSession=ReturnType<typeof createReplicaTransferSession>;
export function transferCanLeave(session:ReplicaTransferSession){if(!session.scope.active)return true;if([...session.historyOwners.values()].some(entry=>entry.owner.unresolved))return false;if(session.workspace.getSnapshot().write.phase==='committed')return true;const proposal=session.proposal.getSnapshot();return session.workspace.canLeave()&&!session.create.getSnapshot().preparing&&!proposal.dirty&&!proposal.replacement&&!proposal.pending.product&&!proposal.pending.query.trim()&&!Object.values(proposal.pending.quantities).some(raw=>raw!=='');}

export function transferCanDiscard(session:ReplicaTransferSession){return session.scope.active&&!session.create.getSnapshot().preparing&&!session.workspace.existingDocument?.getSnapshot().preparing&&!session.workspace.hasUnresolvedWrite&&![...session.historyOwners.values()].some(entry=>entry.owner.unresolved);}
