import { useEffect,useState } from 'react';
import Select from '@arco-design/web-react/es/Select';
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
/** Native maintenance IDs only. Opening/searching reads one existing candidate page. */
export function EditorChoice(p:Props&{label:string;value:string|string[]|null;labels:ReadonlyMap<string,string>;change:(ids:string[])=>void;multiple?:boolean;disabled?:boolean;onLabels?:(names:ReadonlyMap<string,string>)=>void;categoryPath?:readonly string[]}){
 const [open,setOpen]=useState(false),[search,setSearch]=useState('');const parameters={kind:p.kind,search,page:1,pageSize:20 as const};
 const {query,snapshot}=useProductRead(p.scope,read=>p.reader.readCandidates(read),parameters,false,p.denied);
 useEffect(()=>{if(!open)return;const timer=setTimeout(()=>void query.run(parameters),search?180:0);return()=>{clearTimeout(timer);query.cancel();};},[open,search]);
 useEffect(()=>{if(snapshot.success)p.onLabels?.(new Map(snapshot.success.data.items.map(x=>[x.id,x.name])));},[snapshot.success]);
 const data=snapshot.success?.data;const items=new Map((data?.items??[]).map(x=>[x.id,x.name]));const ids=Array.isArray(p.value)?p.value:p.value?[p.value]:[];for(const id of ids)if(!items.has(id))items.set(id,p.labels.get(id)??id);
 type Node={value:string;label:string;disabled?:boolean;children?:Node[]};const nodes=new Map<string,Node>((data?.items??[]).map(x=>[x.id,{value:x.id,label:x.name}]));const parents=new Map((data?.items??[]).map(x=>[x.id,x.parentId]));for(const [index,id] of (p.categoryPath??[]).entries()){if(!nodes.has(id))nodes.set(id,{value:id,label:p.labels.get(id)??id});parents.set(id,p.categoryPath?.[index-1]??null);}const roots:Node[]=[];for(const [id,node] of nodes){const parentId=parents.get(id);if(parentId){let parent=nodes.get(parentId);if(!parent){parent={value:parentId,label:p.labels.get(parentId)??'上级分类名称未提供',disabled:true,children:[]};nodes.set(parentId,parent);}parent.children??=[];parent.children.push(node);}else roots.push(node);}

 return <div id={'pc-detail-'+({'categories':'category','years':'year','seasons':'season','suppliers':'supplier','thicknesses':'thickness','collar-pants-types':'shape','size-groups':'group','barcode-schemes':'scheme'} as Record<string,string>)[p.kind]} className="pc-arco-host" onBlurCapture={event=>{
  if(p.multiple||p.kind==='categories')return;
  // Keep option pointer activation and focus within this control's shadow portal.
  const next=event.relatedTarget;if(!(next instanceof Node))return;
  const owner=event.currentTarget;let node:globalThis.Node|null=next;
  while(node){if(owner.contains(node))return;const root:globalThis.Node=node.getRootNode();node=root instanceof ShadowRoot?root.host:null;}
  setOpen(false);
 }}><SourceControl css={editorControlCss}>{portal=>p.kind==='categories'?<Cascader aria-label={p.label} options={roots} changeOnSelect expandTrigger="click" allowClear showSearch disabled={p.disabled??false} placeholder="选择商品分类" value={ids[0]?(p.categoryPath?.at(-1)===ids[0]?[...p.categoryPath]:[ids[0]]):[]} renderFormat={selected=>selected.map(x=>x.label).join(' / ')||ids.map(x=>p.labels.get(x)??x).join(' / ')} getPopupContainer={()=>portal} onVisibleChange={setOpen} onSearch={setSearch} onChange={raw=>{const path=Array.isArray(raw)?raw:[raw];p.change(path.length?[String(path.at(-1))]:[]);}} dropdownRender={menu=><>{menu}{data&&data.page*data.pageSize<data.total&&<button type="button" onClick={()=>void query.run({...parameters,page:data.page+1})}>下一页</button>}{snapshot.phase==='error'&&<button type="button" onClick={()=>void query.run(parameters)}>读取失败，重试</button>}</>}/>:<Select aria-label={p.label} disabled={p.disabled??false} {...(p.multiple?{mode:'multiple' as const}:{popupVisible:open})} showSearch allowClear filterOption={false} onFocus={event=>{
  // Only searchable single Select shares the redundant wrapper tab stop.
  if(p.multiple)return;
  const input=event.target;if(input instanceof HTMLInputElement){const view=input.closest<HTMLElement>('[role="combobox"]');if(view)view.tabIndex=-1;}
 }} value={p.multiple?ids:ids[0]??''} inputValue={search} onInputValueChange={setSearch} getPopupContainer={()=>portal} onVisibleChange={setOpen} placeholder={'选择'+p.label} onChange={value=>p.change(Array.isArray(value)?value:value?[value]:[])} dropdownRender={menu=><>{menu}{snapshot.phase==='error'&&<button type="button" onClick={()=>void query.run(parameters)}>读取失败，重试</button>}{data&&data.page*data.pageSize<data.total&&<button type="button" onClick={()=>void query.run({...parameters,page:data.page+1})}>下一页</button>}</>} loading={snapshot.phase==='loading'}>{[...items].map(([id,name])=><Select.Option key={id} value={id}>{name}</Select.Option>)}</Select>}</SourceControl></div>;
}
export function SpecSelection(p:Props&{value:readonly string[];labels:ReadonlyMap<string,string>;close:()=>void;save:(ids:string[],labels:ReadonlyMap<string,string>)=>void;create?:(close:()=>void,saved:(id:string)=>void)=>React.ReactNode;createUnavailableReason?:string}){
 const [creating,setCreating]=useState(false),[search,setSearch]=useState(''),[selected,setSelected]=useState([...p.value]),[items,setItems]=useState<ProductMaintenanceCandidatePage['items']>([]);
 const parameters={kind:p.kind,search,page:1,pageSize:100 as const};const {query,snapshot}=useProductRead(p.scope,read=>p.reader.readCandidates(read),parameters,false,p.denied);
 useEffect(()=>{const timer=setTimeout(()=>void query.run(parameters),search?180:0);return()=>{clearTimeout(timer);query.cancel();};},[search]);
 useEffect(()=>{if(snapshot.phase==='success'&&snapshot.success)setItems(old=>[...new Map([...old,...snapshot.success!.data.items].map(x=>[x.id,x])).values()]);},[snapshot.success]);
 const data=snapshot.success?.data,names=new Map([...p.labels,...items.map(x=>[x.id,x.name] as const)]);const rows=[...items.map(x=>({key:x.id,value:x.name})),...selected.filter(id=>!items.some(x=>x.id===id)).map(id=>({key:id,value:names.get(id)??id}))];const codeById=new Map(items.map(x=>[x.id,x.code??'']));const label=p.kind==='colors'?'颜色':'版型';
 if(creating&&p.create)return p.create(()=>setCreating(false),id=>{setSelected(old=>[...new Set([...old,id])]);setCreating(false);void query.run(parameters);});
 return <SpecModal title={'编辑'+label} close={p.close} footer={<><button type="button" className="btn ghost pc-create-left" disabled={!p.create} title={!p.create?(p.createUnavailableReason??'当前入口未提供新增'+label+'能力'):undefined} onClick={()=>{if(p.create)setCreating(true);}}>新增{label}</button><button type="button" className="btn" onClick={p.close}>取消</button><button type="button" className="btn primary" onClick={()=>p.save(selected,names)}>确定</button></>}><Transfer className="pc-spec-transfer" dataSource={rows} targetKeys={selected} onChange={keys=>setSelected(keys.map(String))} showSearch={{className:'iw-arco-input iw-search-input',size:'default'}} searchPlaceholder={['搜索名称或编码','搜索已选']} titleTexts={['系统可用'+label,'当前商品已用'+label]} onSearch={(text,type)=>{if(type==='source')setSearch(text);}} operationTexts={['加入已选','移除已选']} filterOption={(text,item)=>`${item.value} ${codeById.get(String(item.key))??''}`.toLocaleLowerCase().includes(text.toLocaleLowerCase())}/>{data&&data.page*data.pageSize<data.total&&<button type="button" className="btn ghost" disabled={snapshot.phase==='loading'} onClick={()=>{if(snapshot.phase!=='loading')void query.run({...parameters,page:data.page+1});}}>加载更多</button>}{snapshot.phase==='loading'&&<p role="status">正在读取…</p>}{snapshot.phase==='error'&&<p role="alert">读取失败 <button type="button" onClick={()=>void query.run(parameters)}>重试</button></p>}</SpecModal>;
}
