import type {DocumentResponsibleStaffCapability,DocumentResponsibleStaffPage} from '../../../../src/application/contracts.ts';
import type {ReplicaSession} from '../common/session.ts';
import type {ReadScope} from '../../../../src/loading/read-scope.ts';
import {createStaffSettingsHttpReader} from '../../../../src/staff-settings/http-client.ts';
import {createCurrentFormHttpReader} from '../../../../src/current-form/http-reader.ts';
import {HttpQueryError} from '../../../../src/transport/http-query.ts';
/** Exact original production host's reviewed staff ports. Construction is inert. */
export function createResponsibleCapability(session:ReplicaSession,parent:ReadScope):DocumentResponsibleStaffCapability{
 const staff=createStaffSettingsHttpReader(session.http),current=createCurrentFormHttpReader(session.http);
 return Object.freeze({allowedRoles:Object.freeze(['ADMIN','WAREHOUSE','SALESPERSON'] as const),async readCandidates(read:Parameters<DocumentResponsibleStaffCapability['readCandidates']>[0]){
  const role=()=>{const auth=session.auth.getSnapshot();if(read.signal.aborted)throw new HttpQueryError('aborted','QUERY_ABORTED');if(auth.phase!=='authenticated'||!auth.principal)throw new HttpQueryError('unauthenticated','UNAUTHENTICATED');if(!parent.active||read.identity.accountId!==parent.identity.accountId||read.identity.sessionRevision!==parent.identity.sessionRevision||read.identity.permissionRevision!==parent.identity.permissionRevision||auth.principal.accountId!==parent.identity.accountId||!['ADMIN','WAREHOUSE','SALESPERSON'].includes(auth.principal.role))throw new HttpQueryError('forbidden','FORBIDDEN');return auth.principal.role;};
  const before=role();let page:DocumentResponsibleStaffPage;
  if(before==='ADMIN'){const result=await staff.readList({...read,parameters:{search:read.parameters.search,page:read.parameters.page,pageSize:20,employmentStatus:'all',role:'',hallId:null,loginStatus:''}});page={page:result.page,pageSize:20,total:result.total,items:result.items.map(item=>({id:item.id,name:item.name}))};}
  else{const result=await current.readSalesReferences({kind:'salesperson',hallId:null,search:read.parameters.search,page:read.parameters.page,pageSize:20},read.signal),total=Number(result.exactTotal);if(!Number.isSafeInteger(total))throw new TypeError('Employee reference count exceeds the original selector boundary.');page={page:result.page,pageSize:20,total,items:result.items.map(item=>({id:item.id,name:item.name}))};}
  if(role()!==before)throw new HttpQueryError('forbidden','FORBIDDEN');return page;
 }});
}
