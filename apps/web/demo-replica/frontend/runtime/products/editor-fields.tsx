import type { CatalogueSettingsEntry } from '../../../../../../packages/application/src/catalogue-settings-read-ports.ts';
import { useEffect,useState,type ComponentType } from 'react';
import Select from '@arco-design/web-react/es/Select';
import type { SelectProps } from '@arco-design/web-react/es/Select';
import Cascader from '@arco-design/web-react/es/Cascader';
import Transfer from '@arco-design/web-react/es/Transfer';
import type { ProductMaintenanceCandidateKind,ProductMaintenanceCandidatePage,ProductMaintenanceReader } from '../../../../src/products/product-editor-contracts.ts';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import { HttpQueryError } from '../../../../src/transport/http-query.ts';
import { useProductRead } from './read.tsx';
import { SourceControl } from '../common/ui/source-control.tsx';
import { SourceModal } from '../catalogue/source-controls.tsx';
function SpecModal(p:{title:string;close:()=>void;footer:React.ReactNode;children:React.ReactNode}){return <SourceModal wide {...p}/>;}
import { editorControlCss } from './editor-control-css.ts';
interface Props {scope:ReadScope;reader:ProductMaintenanceReader;kind:ProductMaintenanceCandidateKind;denied:(e:HttpQueryError)=>void}
const ClearableChoice=Select as unknown as ComponentType<Omit<SelectProps,'value'>&{value:SelectProps['value']|undefined}>;
/** Native maintenance IDs only. Opening/searching reads one existing candidate page. */
export function EditorChoice(p:Props&{label:string;value:string|string[]|null;labels:ReadonlyMap<string,string>;change:(ids:string[])=>void;multiple?:boolean;disabled?:boolean;onLabels?:(names:ReadonlyMap<string,string>)=>void;required?:boolean;localOptions?:readonly (readonly [string,string])[];optionLabels?:ReadonlyMap<string,string>;categoryPath?:readonly string[];categoryRows?:readonly {id:string;name:string;parentId:string|null}[];onCategorySelection?:(ids:string[],labels:string[])=>void}){
 const [open,setOpen]=useState(false),[search,setSearch]=useState('');
 const completeCategoryTree=p.kind==='categories'&&p.categoryRows!==undefined,localChoices=p.localOptions!==undefined;
 const parameters={kind:p.kind,search,page:1,pageSize:20 as const};
 const {query,snapshot}=useProductRead(p.scope,read=>p.reader.readCandidates(read),parameters,false,p.denied);
 useEffect(()=>{if(!open||completeCategoryTree||localChoices)return;const timer=setTimeout(()=>void query.run(parameters),search?180:0);return()=>{clearTimeout(timer);query.cancel();};},[open,search,completeCategoryTree,localChoices]);
 useEffect(()=>{if(snapshot.success)p.onLabels?.(new Map(snapshot.success.data.items.map(x=>[x.id,x.name])));},[snapshot.success]);
 const data=snapshot.success?.parameters.search===search?snapshot.success.data:undefined;
 const categoryRows=p.kind==='categories'?(p.categoryRows??data?.items??[]):[];
 const ids=Array.isArray(p.value)?p.value:p.value?[p.value]:[];
 const term=search.trim().toLocaleLowerCase();
 const items=p.localOptions?new Map(p.localOptions.filter(([id,name])=>!term||id.toLocaleLowerCase().includes(term)||name.toLocaleLowerCase().includes(term))):new Map((data?.items??[]).map(x=>[x.id,x.name]));
 const visible=(next:boolean)=>{setOpen(next);if(!next)setSearch('');};
 const pending=open&&!completeCategoryTree&&!localChoices&&(snapshot.phase==='loading'||snapshot.request?.parameters.search!==search);
 const failed=!completeCategoryTree&&!localChoices&&snapshot.phase==='error'&&snapshot.request?.parameters.search===search;
 const retry=()=>void query.run(snapshot.request?.parameters??parameters);
 const notice=pending?<div role="status" className="pc-option-notice">正在读取…</div>:failed
  ?<div role="alert" className="pc-option-notice">选项读取失败<button type="button" className="pc-option-action" onClick={retry}>重试</button></div>
  :<div className="pc-option-notice">{search||completeCategoryTree&&categoryRows.length?'没有匹配的'+p.label:'暂无'+p.label+'选项'}</div>;
 const hasNext=!!data&&data.page*data.pageSize<data.total;
 // Keep the same focusable footer action while a page is loading or retrying.
 // Disabling it natively or replacing it with the status node drops portal focus.
 const footer=data&&data.items.length>0&&(pending||failed||hasNext)
  ?<div className="pc-option-footer">
   {(hasNext||failed)&&<button type="button" className="pc-option-action" aria-disabled={pending||undefined} onClick={()=>{
    if(query.getSnapshot().phase==='loading')return;
    if(failed)retry();else if(hasNext)void query.run({...parameters,page:data.page+1});
   }}>{failed?'重试':'下一页'}</button>}
   {pending?<span role="status" className="pc-option-notice">正在读取…</span>:failed?<span role="alert" className="pc-option-notice">选项读取失败</span>:null}
  </div>:null;
 type Node={value:string;label:string;disabled?:boolean;children?:Node[]};
 const categoryNames=new Map(categoryRows.map(row=>[row.id,row.name]));
 const categoryName=(id:string)=>categoryNames.get(id)??p.labels.get(id);
 const nodes=new Map<string,Node>(categoryRows.map(row=>[row.id,{value:row.id,label:row.name}]));
 const parents=new Map(categoryRows.map(row=>[row.id,row.parentId]));
 for(const [index,id] of (p.categoryPath??[]).entries()){
  if(!nodes.has(id))nodes.set(id,{value:id,label:categoryName(id)??'分类名称未提供'});
  if(!parents.has(id))parents.set(id,p.categoryPath?.[index-1]??null);
 }
 const roots:Node[]=[];
 for(const [id,node] of nodes){
  const parentId=parents.get(id);
  if(parentId){
   let parent=nodes.get(parentId);
   if(!parent){parent={value:parentId,label:categoryName(parentId)??'上级分类名称未提供',disabled:true,children:[]};nodes.set(parentId,parent);}
   (parent.children??=[]).push(node);
  }else roots.push(node);
 }
 // The form stores only the native leaf ID; Arco's controlled value needs the full ID path.
 const categoryValue:string[]=[];
 if(p.kind==='categories'){
  for(let id:string|null=ids[0]??null;id&&!categoryValue.includes(id);id=parents.get(id)??null)categoryValue.unshift(id);
 }
 const categoryCaption=!ids[0]?'':categoryName(ids[0])?categoryValue.map(categoryName).filter(Boolean).join(' / '):'分类名称未提供';

 return <div id={'pc-detail-'+({'categories':'category','years':'year','seasons':'season','suppliers':'supplier','thicknesses':'thickness','collar-pants-types':'shape','size-groups':'group','barcode-schemes':'scheme'} as Record<string,string>)[p.kind]} className="pc-arco-host" onBlurCapture={event=>{
  if(p.multiple||p.kind==='categories')return;
  // Keep option pointer activation and focus within this control's shadow portal.
  const next=event.relatedTarget;if(!(next instanceof Node))return;
  const owner=event.currentTarget;let node:globalThis.Node|null=next;
  while(node){if(owner.contains(node))return;const root:globalThis.Node=node.getRootNode();node=root instanceof ShadowRoot?root.host:null;}
  visible(false);
 }}><SourceControl css={editorControlCss}>{portal=>p.kind==='categories'
  ?<Cascader aria-label={p.label} aria-required={p.required} options={roots} changeOnSelect expandTrigger="click" allowClear showSearch={{retainInputValueWhileSelect:false}} disabled={p.disabled??false} placeholder="选择商品分类" value={categoryValue} renderFormat={()=>categoryCaption}
   getPopupContainer={()=>portal} dropdownMenuClassName="pc-category-options" triggerProps={{position:'br',autoFitPosition:true,boundaryDistance:{right:12,bottom:12}}}
   onVisibleChange={visible} {...(!completeCategoryTree?{onSearch:setSearch}:{})}
   onChange={raw=>{const path=(Array.isArray(raw)?raw:[raw]).filter(value=>value!=null&&value!=='').map(String);if(p.onCategorySelection)p.onCategorySelection(path,path.map(id=>categoryName(id)??''));else p.change(path.length?[path.at(-1)!]:[]);}}
   notFoundContent={notice} dropdownRender={menu=><>{menu}{footer}</>}
  />
  :<ClearableChoice aria-label={p.label} aria-required={p.required} disabled={p.disabled??false} {...(p.multiple?{mode:'multiple' as const}:{popupVisible:open})} showSearch allowClear filterOption={false} onFocus={event=>{
  // Only searchable single Select shares the redundant wrapper tab stop.
  if(p.multiple)return;
  const input=event.target;if(input instanceof HTMLInputElement){const view=input.closest<HTMLElement>('[role="combobox"]');if(view)view.tabIndex=-1;}
 }}
   value={p.multiple?ids:ids[0]} inputValue={search} onInputValueChange={setSearch} getPopupContainer={()=>portal} onVisibleChange={visible} placeholder={'选择'+p.label}
   onChange={value=>p.change(Array.isArray(value)?value:value?[value]:[])} notFoundContent={notice}
   renderFormat={(_option,value)=>{const id=String(value??'');return items.get(id)??p.optionLabels?.get(id)??p.labels.get(id)??id;}}
   dropdownRender={menu=><>{menu}{footer}</>} loading={pending}
  >{[...items].map(([id,name])=><Select.Option key={id} value={id}>{name}</Select.Option>)}</ClearableChoice>}</SourceControl></div>;
}
export function SpecSelection(p:Props&{value:readonly string[];labels:ReadonlyMap<string,string>;close:()=>void;save:(ids:string[],labels:ReadonlyMap<string,string>)=>void;create?:(close:()=>void,saved:(item:CatalogueSettingsEntry)=>void)=>React.ReactNode;createUnavailableReason?:string}){
 const [creating,setCreating]=useState(false),[search,setSearch]=useState(''),[selected,setSelected]=useState([...p.value]),[createNotice,setCreateNotice]=useState(''),[items,setItems]=useState<ProductMaintenanceCandidatePage['items']>([]);
 const parameters={kind:p.kind,search,page:1,pageSize:100 as const};const {query,snapshot}=useProductRead(p.scope,read=>p.reader.readCandidates(read),parameters,false,p.denied);
 useEffect(()=>{const timer=setTimeout(()=>void query.run(parameters),search?180:0);return()=>{clearTimeout(timer);query.cancel();};},[search]);
 useEffect(()=>{if(snapshot.phase==='success'&&snapshot.success)setItems(old=>[...new Map([...old,...snapshot.success!.data.items].map(x=>[x.id,x])).values()]);},[snapshot.success]);
 const data=snapshot.success?.data,names=new Map([...p.labels,...items.map(x=>[x.id,x.name] as const)]);const rows=[...items.map(x=>({key:x.id,value:x.name})),...selected.filter(id=>!items.some(x=>x.id===id)).map(id=>({key:id,value:names.get(id)??id}))];const codeById=new Map(items.map(x=>[x.id,x.code??'']));const label=p.kind==='colors'?'颜色':'版型';
 if(creating&&p.create)return p.create(()=>setCreating(false),item=>{if(item.enabled){setSelected(old=>[...new Set([...old,item.id])]);setItems(old=>[...old.filter(row=>row.id!==item.id),{...item,parentId:null}]);setCreateNotice('');}else{setItems(old=>old.filter(row=>row.id!==item.id));setCreateNotice('已新增，但该'+label+'现已停用，未加入已选。');}setCreating(false);void query.run(parameters);});
 return <SpecModal title={'选择'+label} close={p.close} footer={<><button type="button" className="btn ghost pc-create-left" disabled={!p.create} title={!p.create?(p.createUnavailableReason??'当前入口未提供新增'+label+'能力'):undefined} onClick={()=>{if(p.create)setCreating(true);}}>新增{label}</button><button type="button" className="btn" onClick={p.close}>取消</button><button type="button" className="btn primary" onClick={()=>p.save(selected,names)}>确定</button></>}><p className="hint">选好后，记得回商品页保存。</p>{createNotice&&<p role="status">{createNotice}</p>}<Transfer className="pc-spec-transfer" dataSource={rows} targetKeys={selected} onChange={keys=>setSelected(keys.map(String))} showSearch={{className:'iw-arco-input iw-search-input',size:'default'}} searchPlaceholder={['搜索名称或编码','搜索已选']} titleTexts={['系统可用'+label,'当前商品已用'+label]} onSearch={(text,type)=>{if(type==='source')setSearch(text);}} operationTexts={['加入已选','移除已选']} filterOption={(text,item)=>`${item.value} ${codeById.get(String(item.key))??''}`.toLocaleLowerCase().includes(text.toLocaleLowerCase())}/>{data&&data.page*data.pageSize<data.total&&<button type="button" className="btn ghost" disabled={snapshot.phase==='loading'} onClick={()=>{if(snapshot.phase!=='loading')void query.run({...parameters,page:data.page+1});}}>加载更多</button>}{snapshot.phase==='loading'&&<p role="status">正在读取…</p>}{snapshot.phase==='error'&&<p role="alert">读取失败 <button type="button" onClick={()=>void query.run(parameters)}>重试</button></p>}</SpecModal>;
}
