import type {ImportedHistoryDetailQuery} from '../../../../../../packages/application/src/imported-history-query-ports.ts';
import {LatestQuery} from '../../../../src/loading/latest-query.ts';
import {InactiveReadScopeError,type ReadScope} from '../../../../src/loading/read-scope.ts';
import {collectHistoryDocument,type CompleteHistoryDocument,type HistoryTarget,type createHistoryReader} from './history-reader.ts';
import type {HistoryRevisionOwner} from './history-revision.ts';

export interface HistoryEditReadResult<Owner> {readonly complete:CompleteHistoryDocument;readonly owner:Owner}
/** READ preparation only. Cancel/dispose never submits, cancels or retries a revision. */
export function createHistoryEditRead<Owner>(options:{readonly scope:ReadScope;readonly reader:ReturnType<typeof createHistoryReader>;readonly target:HistoryTarget;readonly owner:()=>Promise<Owner>}):LatestQuery<ImportedHistoryDetailQuery,HistoryEditReadResult<Owner>>{
 const {scope,reader,owner}=options,target=Object.freeze({...options.target});
 return new LatestQuery<ImportedHistoryDetailQuery,HistoryEditReadResult<Owner>>({scope,execute:async read=>{
  const complete=await collectHistoryDocument(reader,target,read);
  if(read.signal.aborted||!scope.active)throw new InactiveReadScopeError();
  const current=await owner();
  if(read.signal.aborted||!scope.active)throw new InactiveReadScopeError();
  return {complete,owner:current};
 }});
}
/** A cancellable READ is not a dirty edit or an unresolved business command.
 * Keep the original inactive/committed/dirty/unknown-write leave decisions. */
export function historyDetailCanLeave(scopeActive:boolean,dirty:boolean,owner:Pick<HistoryRevisionOwner,'getSnapshot'|'unresolved'>|null):boolean{
 return !scopeActive||owner?.getSnapshot().phase==='committed'||!dirty&&!owner?.unresolved;
}
