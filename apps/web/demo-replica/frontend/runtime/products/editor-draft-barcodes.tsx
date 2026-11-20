import type { ProductEditorCapability } from '../../../../src/products/product-editor-contracts.ts';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import { HttpQueryError } from '../../../../src/transport/http-query.ts';
import { useProductRead,ReadNotice } from './read.tsx';
import { EditorBarcodes } from './editor-barcodes.tsx';
/** Read-only, actual size-group membership. Display tuples never enter the SAVE command. */
export function DraftEditorBarcodes(p:{active:boolean;scope:ReadScope;reader:ProductEditorCapability['dictionaryReader'];groupId:string;groupName:string;colorIds:readonly string[];fitIds:readonly string[];names:ReadonlyMap<string,string>;denied:(e:HttpQueryError)=>void}){
 const complete=!!p.groupId&&p.colorIds.length>0&&p.fitIds.length>0;
 const parameters={groupId:p.groupId,search:p.groupName};
 const {query,snapshot}=useProductRead(p.scope,async read=>{
  for(let page=1;;page++){
   const data=await p.reader.readSizeGroups({...read,parameters:{search:read.parameters.search,page,pageSize:100}});
   if(read.signal.aborted)throw new DOMException('Draft preview cancelled','AbortError');
   const group=data.items.find(item=>item.id===read.parameters.groupId);
   if(group)return group;
   if(page*data.pageSize>=data.total)return null;
  }
 },parameters,p.active&&complete,p.denied);
 if(!p.active)return null;
 const group=snapshot.phase==='success'?snapshot.success?.data:null;
 const names=new Map([...p.names,...(group?.sizes??[]).map(size=>[size.id,size.name] as const)]);
 return <>{complete&&<ReadNotice phase={snapshot.phase} retry={()=>void query.run(parameters)} cancel={()=>query.cancel()}/>}{complete&&snapshot.phase==='success'&&!group&&<p role="alert">尚未取得所属尺码组资料，未推测规格组合。</p>}
 <EditorBarcodes active canSupplement={false} skus={[]} barcodes={[]} draft={[]} names={names} change={()=>{}} preview={{colorIds:p.colorIds,fitIds:p.fitIds,sizeIds:group?.sizes.map(size=>size.id)??[]}}/>
 </>;
}
