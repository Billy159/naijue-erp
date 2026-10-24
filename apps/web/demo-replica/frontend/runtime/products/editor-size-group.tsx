import type { ProductEditorCapability } from '../../../../src/products/product-editor-contracts.ts';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import { HttpQueryError } from '../../../../src/transport/http-query.ts';
import { useProductRead,ReadNotice } from './read.tsx';
/** The existing dictionary reader includes every actual member of a group. */
export function GroupMembers(p:{scope:ReadScope;reader:ProductEditorCapability['dictionaryReader'];id:string;name:string;denied:(e:HttpQueryError)=>void}){
 const parameters={groupId:p.id,search:p.name};const {query,snapshot}=useProductRead(p.scope,async read=>{
 for(let page=1;;page++){const data=await p.reader.readSizeGroups({...read,parameters:{search:read.parameters.search,page,pageSize:20}});const group=data.items.find(x=>x.id===read.parameters.groupId);if(group)return group;if(page*data.pageSize>=data.total)return null;}
 },parameters,true,p.denied);const group=snapshot.success?.data;
 return <><ReadNotice phase={snapshot.phase} retry={()=>void query.run(parameters)} cancel={()=>query.cancel()}/>{group&&<small className="hint">{group.sizes.map(x=>x.name).join(' / ')||'该组没有有效尺码'}</small>}{snapshot.phase==='success'&&!group&&<small className="hint">所属尺码组资料未取得</small>}</>;
}
