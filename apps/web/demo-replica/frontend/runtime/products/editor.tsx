import { useEffect,useRef,useState,useSyncExternalStore } from 'react';
import type { ProductMaintenanceDetail,ProductMaintenanceDetailV2,ProductWriteValuesV2,ProductEditorDraft,ProductBarcodeInput } from '../../../../src/products/product-editor-contracts.ts';
import { ProductEditorController,actualSpecSelection } from '../../../../src/products/product-editor-state.ts';
import { HttpQueryError } from '../../../../src/transport/http-query.ts';
import { useProductRead,ReadNotice } from './read.tsx';
import { productTabs,priceFields,SchemeConsumer } from './detail.tsx';
import { EntryEditor,SourceModal } from '../catalogue/source-controls.tsx';
import { useEditorMedia } from './editor-media.tsx';
import { GroupMembers } from './editor-size-group.tsx';
import { EditorBarcodes } from './editor-barcodes.tsx';
import { EditorStock } from './editor-stock.tsx';
import { EditorChoice,SpecSelection } from './editor-fields.tsx';
import type { SourceProductEditorOptions } from './editor-entry.tsx';
const newValues=():ProductWriteValuesV2=>({productCode:'',name:'',categoryId:'',supplierId:null,seasonIds:[],sizeGroupId:'',year:null,systemItemCode:null,thickness:null,collarPantsType:null,defaultBarcodeSchemeId:null,enabled:true,prices:Object.fromEntries(priceFields.map(([key])=>[key,null])) as ProductWriteValuesV2['prices']});
export function ProductEditor(p:SourceProductEditorOptions){
 const scope=p.parent,cap=p.capability;
 const [originalCommand]=useState(()=>cap.recovery?.read(scope.identity,p.productId)??null);
 const restoredDraft=originalCommand&&'values'in originalCommand&&'seasonIds'in originalCommand.values?{values:originalCommand.values as ProductWriteValuesV2,skus:originalCommand.skus,barcodes:originalCommand.barcodes,selection:'skuSelection'in originalCommand&&originalCommand.skuSelection?{colors:[...originalCommand.skuSelection.colorIds],fits:[...originalCommand.skuSelection.fitIds]}:actualSpecSelection(originalCommand.skus)}:null;
 const [controller]=useState(()=>new ProductEditorController({scope,client:cap.client,newRequestKey:cap.newRequestKey,onRecoveryRequired:cap.onRecoveryRequired,onAccessFailure:e=>p.onAccessFailure(new HttpQueryError(e.kind==='forbidden'?'forbidden':'unauthenticated',e.code)),...(originalCommand?{originalCommand}:{})}));
 const write=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot),alive=useRef(false),finished=useRef(false),finishing=useRef(false),resolvedKey=useRef<string|null>(null),childGuard=useRef<(()=>boolean)|null>(null);
 const [confirmation,setConfirmation]=useState<'idle'|'reading'|'error'>('idle'),[baselineKey,setBaselineKey]=useState<string|null>(null),[baselineStatus,setBaselineStatus]=useState<'idle'|'reading'|'error'>('idle');
 const rejectedKey=useRef<string|null>(null),baselineReading=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;queueMicrotask(()=>{if(!alive.current)controller.dispose();});};},[controller]);
 const detail=useProductRead(scope,read=>cap.reader.readDetail(read),{productId:p.productId??''},!!p.productId&&write.phase==='idle',p.onAccessFailure);
 const [base,setBase]=useState<ProductMaintenanceDetailV2|null>(null),[values,setValues]=useState(()=>restoredDraft?.values??newValues()),[selection,setSelection]=useState(()=>restoredDraft?{colors:[...restoredDraft.selection.colors],fits:[...restoredDraft.selection.fits]}:{colors:[] as string[],fits:[] as string[]}),[labels,setLabels]=useState<ReadonlyMap<string,string>>(new Map()),[tab,setTab]=useState<string>(p.initialTab??'base'),[modal,setModal]=useState<'colors'|'fits'|'delete'|'discard'|null>(null),[error,setError]=useState(''),[scheme,setScheme]=useState<string|null>(null),[dirty,setDirty]=useState(!!restoredDraft),[barcodeDraft,setBarcodeDraft]=useState<ProductBarcodeInput[]>([]);
 const [visited,setVisited]=useState<ReadonlySet<string>>(()=>new Set([p.initialTab??'base']));
 const changeTab=(next:string)=>{setVisited(old=>new Set([...old,next]));setTab(next);};
 const needsBaseline=write.phase==='rejected'&&!!p.productId&&baselineKey!==write.command?.requestKey;
 const writeBusy=!['idle','rejected'].includes(write.phase),busy=writeBusy||needsBaseline,ready=!p.productId||!!base||!!restoredDraft&&writeBusy;
 const media=useEditorMedia({scope,productId:p.productId,version:base?.version??null,capability:cap,controller,active:tab==='images'&&!busy,locked:busy,changed:()=>setDirty(true),denied:p.onAccessFailure});
 const specsActive=!busy&&!!p.productId&&(tab==='specs'||tab==='images'||tab==='barcodes');
 const specs=useProductRead(scope,cap.productReader.readProductSpecifications,{productId:p.productId??''},specsActive,p.onAccessFailure),specsVersion=useRef<number|null>(null);
 useEffect(()=>{
  if(!specsActive)return;
  const version=base?.version??null;
  if(!specs.query.getSnapshot().success){specsVersion.current=version;return;}
  if(specsVersion.current===version)return;
  let active=true;void specs.query.run({productId:p.productId!}).then(outcome=>{if(active&&outcome.status==='success')specsVersion.current=version;});
  return()=>{active=false;};
 },[specsActive,base?.version,specs.query,p.productId]);
 useEffect(()=>{const d=specs.snapshot.success?.data;if(d)setLabels(old=>new Map([...old,...d.colors.map(x=>[x.id,x.label] as const),...d.fits.map(x=>[x.id,x.label] as const),...d.sizes.map(x=>[x.id,x.label] as const)]));},[specs.snapshot.success]);
 const applyBaseline=(d:ProductMaintenanceDetail)=>{if(!('seasonIds'in d.values)){setError('商品维护版本已更新，请重新打开页面。');return false;}const v=d as ProductMaintenanceDetailV2;setBase(v);setValues(v.values);setBarcodeDraft([]);const selected=actualSpecSelection(v.skus);setSelection({colors:[...selected.colors],fits:[...selected.fits]});setLabels(new Map([...v.references.categoryPath,...v.references.seasons,...[v.references.sizeGroup],...(v.references.supplier?[v.references.supplier]:[]),...(v.references.defaultBarcodeScheme?[v.references.defaultBarcodeScheme]:[])].map(x=>[x.id,x.name])));setDirty(false);return true;};
 useEffect(()=>{const d=detail.snapshot.success?.data;if(d&&write.phase==='idle')applyBaseline(d);},[detail.snapshot.success]);
 const reloadRejectedBaseline=async()=>{
  const command=write.command;if(write.phase!=='rejected'||!command||!p.productId||baselineReading.current||!scope.active)return;
  baselineReading.current=true;setBaselineStatus('reading');
  try{const outcome=await detail.query.run({productId:p.productId});if(!alive.current||!scope.active||controller.getSnapshot().command?.requestKey!==command.requestKey)return;
   if(outcome.status==='success'&&outcome.data.productId===p.productId&&applyBaseline(outcome.data)){setBaselineKey(command.requestKey);setBaselineStatus('idle');}else setBaselineStatus('error');
  }finally{baselineReading.current=false;}
 };
 useEffect(()=>{if(write.phase==='rejected'&&p.productId&&write.command&&rejectedKey.current!==write.command.requestKey){rejectedKey.current=write.command.requestKey;if(write.command.action==='DELETE')setModal(null);void reloadRejectedBaseline();}},[write]);
 useEffect(()=>{p.onCanLeaveChange(()=>!dirty&&!writeBusy&&(!childGuard.current||childGuard.current()));return()=>p.onCanLeaveChange(null);},[dirty,writeBusy,p.onCanLeaveChange]);
 const confirmSaved=async()=>{
  if(write.phase!=='committed'||!write.result||!write.command||finished.current||finishing.current||!scope.active)return;
  finishing.current=true;setConfirmation('reading');setError('');
  try{
   const result=write.result,outcome=await detail.query.run({productId:result.targetId});
   if(!alive.current||!scope.active)return;
   if(outcome.status!=='success'||outcome.data.productId!==result.targetId||outcome.data.version<result.version||!('seasonIds'in outcome.data.values)){
    setConfirmation('error');setError('商品已保存，但最新资料尚未确认。请重新读取商品，不要重复保存。');return;
   }
   finished.current=true;p.onSaved(result.targetId);
  }finally{finishing.current=false;if(alive.current&&scope.active)setConfirmation(current=>current==='reading'?'idle':current);}
 };
 useEffect(()=>{
  if(write.phase!=='committed'||!write.result||!write.command||finished.current)return;
  if(resolvedKey.current!==write.command.requestKey){resolvedKey.current=write.command.requestKey;cap.recovery?.resolved(scope.identity,write.command.requestKey);}
  if(write.command.action==='DELETE'){finished.current=true;p.onClose();return;}
  void confirmSaved();
 },[write]);
 const change=(patch:Partial<ProductWriteValuesV2>)=>{setValues(old=>({...old,...patch}));setDirty(true);};
 const submit=async(deleting=false)=>{if(busy)return;setError('');try{if(deleting){if(base&&cap.allowedActions.includes('DELETE'))await controller.submit({action:'DELETE',id:base.productId,expectedVersion:base.version});return;}const action=base?'EDIT':'CREATE';if(!cap.allowedActions.includes(action))return;
 if(media.pending){setError('请等待图片准备完成，或移除失败的图片。');return;}
 const common={...(media.changes.length?{imageChanges:media.changes}:{}),values,skus:base?.skus??restoredDraft?.skus??[],barcodes:[...(base?.barcodes??restoredDraft?.barcodes??[]),...barcodeDraft],skuSelection:{colorIds:selection.colors,fitIds:selection.fits}};
 const draft:ProductEditorDraft=base?{...common,action:'EDIT',id:base.productId,expectedVersion:base.version}:{...common,action:'CREATE',values:{...values,seasonIds:values.seasonIds??[]}};
 await controller.submit(draft);
 }catch(e){setError(e instanceof Error?e.message:'商品保存失败。');}};
 const choice=(kind:Parameters<typeof EditorChoice>[0]['kind'],label:string,value:string|string[]|null,update:(ids:string[])=>void,disabled=false,multiple=false)=><EditorChoice scope={scope} reader={cap.reader} kind={kind} label={label} value={value} labels={labels} change={update} onLabels={names=>setLabels(old=>new Map([...old,...names]))} {...(kind==='categories'&&base?{categoryPath:base.references.categoryPath.map(x=>x.id)}:{})} disabled={disabled||busy} multiple={multiple} denied={p.onAccessFailure}/>;
 const field=(name:string,child:React.ReactNode)=><div className="field" key={name}><span className="pc-field-caption">{name.replace(/\s*\*$/,'')}{name.endsWith('*')&&<span className="ui-required"> *</span>}</span>{child}</div>;
 const close=()=>{if(writeBusy)return;if(dirty)setModal('discard');else p.onClose();};
 if(!scope.active)return null;
 return <div className="pc-detail-workbench"><div className="pc-detail-sticky"><div className="gold-head iw-head pc-page-head"><h1>{values.productCode||'新增商品'} · {values.name||'未命名'}</h1><div className="actions iw-head-actions">{base&&cap.allowedActions.includes('DELETE')&&<button type="button" className="btn ghost pc-danger" disabled={busy} onClick={()=>setModal('delete')}>删除商品</button>}<button type="button" className="btn" disabled={writeBusy} onClick={close}>取消</button><button type="button" className="btn primary" disabled={busy||!ready||!cap.allowedActions.includes(base?'EDIT':'CREATE')} onClick={()=>void submit()}>保存</button></div></div><div className="tabs" role="tablist" aria-label="商品详情">{productTabs.map(([key,label])=><button type="button" role="tab" aria-selected={key===tab} key={key} className={key===tab?'active':''} onClick={()=>changeTab(key)}>{label}</button>)}</div></div>
 <div id="pc-editor-error" className="inline-error" role="alert">{error||write.error?.message}</div>{write.phase==='submitting'&&<p role="status">正在保存…</p>}{(write.phase==='uncertain'||write.phase==='checking')&&<p role="alert">保存结果尚未确认，请先查回原请求。<button type="button" className="btn" disabled={write.phase==='checking'} onClick={()=>void controller.recover()}>查回结果</button>{write.phase==='uncertain'&&write.recovery==='absent'&&<button type="button" className="btn" onClick={()=>void controller.retryOriginal()}>按原请求重试</button>}</p>}
 {write.phase==='committed'&&write.command?.action!=='DELETE'&&<p role={confirmation==='error'?'alert':'status'}>{confirmation==='error'?'保存已提交，最新资料读取未完成。':finished.current?'保存已确认。':'保存已提交，正在确认最新商品资料…'}{confirmation==='error'&&<button type="button" className="btn" onClick={()=>void confirmSaved()}>重新读取商品</button>}</p>}
 {needsBaseline&&<p role={baselineStatus==='error'?'alert':'status'}>{baselineStatus==='error'?'保存未提交，最新商品资料读取失败。':'保存未提交，正在重新读取商品资料。'}{baselineStatus==='error'&&<button type="button" className="btn" onClick={()=>void reloadRejectedBaseline()}>重新读取基准</button>}</p>}
 {p.productId&&!base&&write.phase==='idle'&&<ReadNotice phase={detail.snapshot.phase} retry={()=>void detail.query.run({productId:p.productId!})} cancel={()=>detail.query.cancel()}/>}
 {ready&&specsActive&&<ReadNotice phase={specs.snapshot.phase} retry={()=>void specs.query.run({productId:p.productId!})} cancel={()=>specs.query.cancel()}/>}
 {ready&&<fieldset disabled={busy} className="pc-editor-body pc-detail-body" style={{border:0,margin:0,minWidth:0}}>
 {tab==='base'&&<div className="pc-form-grid pc-base-grid">{field('款号 *',<input aria-label="款号" value={values.productCode} readOnly={!!base} maxLength={40} onChange={e=>change({productCode:e.target.value})}/>)}{field('商品名称 *',<input aria-label="商品名称" value={values.name} maxLength={80} onChange={e=>change({name:e.target.value})}/>)}{field('商品分类 *',choice('categories','商品分类',values.categoryId,ids=>change({categoryId:ids[0]??''})))}{field('年份 *',choice('years','年份',values.year===null?null:String(values.year),ids=>change({year:ids[0]?Number(ids[0]):null})))}{field('季节 *',choice('seasons','季节',values.seasonIds===null?null:[...values.seasonIds],ids=>change({seasonIds:ids}),false,true))}{field('供应商 *',choice('suppliers','供应商',values.supplierId,ids=>change({supplierId:ids[0]??null})))}{field('厚薄（可选）',choice('thicknesses','厚薄',values.thickness,ids=>change({thickness:ids[0]??null})))}{field('领型 / 裤型（可选）',choice('collar-pants-types','领型 / 裤型',values.collarPantsType,ids=>change({collarPantsType:ids[0]??null})))}{field('系统货号 *',<input aria-label="系统货号" value={values.systemItemCode??''} maxLength={30} onChange={e=>change({systemItemCode:e.target.value||null})}/>)}</div>}
 {visited.has('specs')&&<GroupMembers key={values.sizeGroupId||'unset'} active={tab==='specs'} scope={scope} reader={cap.dictionaryReader} id={values.sizeGroupId} name={labels.get(values.sizeGroupId)??''} denied={p.onAccessFailure}>{members=><div className="pc-spec-stack">{(['colors','fits'] as const).slice(0,1).map(kind=><section className="pc-spec-section" key={kind}><div className="pc-section-line"><h3>颜色</h3><button type="button" className="btn ghost" onClick={()=>setModal(kind)}>编辑颜色</button></div><div className="pc-spec-values">{selection.colors.map(id=><span className="pc-spec-value" key={id}>{labels.get(id)??id}</span>)}{!selection.colors.length&&<span className="hint">未设置</span>}</div></section>)}<section className="pc-spec-section"><div className="pc-section-line"><h3>尺码组</h3></div><div className="pc-spec-group"><span>选择尺码组</span>{choice('size-groups','尺码组',values.sizeGroupId,ids=>change({sizeGroupId:ids[0]??''}),!!base)}</div>{values.sizeGroupId&&members}</section><section className="pc-spec-section"><div className="pc-section-line"><h3>版型</h3><button type="button" className="btn ghost" onClick={()=>setModal('fits')}>编辑版型</button></div><div className="pc-spec-values">{selection.fits.map(id=><span className="pc-spec-value" key={id}>{labels.get(id)??id}</span>)}{!selection.fits.length&&<span className="hint">未设置</span>}</div></section></div>}</GroupMembers>}
 {tab==='prices'&&<div className="pc-price-wrap"><div className="pc-price-paste"><span>价格</span><small>可从 Excel 整列复制价格，按下表顺序粘贴</small></div><table className="pc-price-table"><thead><tr><th>价格类型</th><th>金额</th></tr></thead><tbody>{priceFields.map(([key,label],index)=><tr key={key}><th scope="row">{label}</th><td><input aria-label={label} inputMode="decimal" placeholder="未设置" value={values.prices[key]??''} onChange={e=>change({prices:{...values.prices,[key]:e.target.value||null}})} onPaste={e=>{const cells=e.clipboardData.getData('text').trimEnd().split(/\r?\n/);if(cells.length<=1)return;e.preventDefault();const prices={...values.prices};cells.slice(0,priceFields.length-index).forEach((cell,i)=>{prices[priceFields[index+i]![0]]=cell.trim()||null;});change({prices});}}/></td></tr>)}</tbody></table><small className="hint">空白表示未设置；0 表示价格为零。</small></div>}
 {tab==='barcodes'&&<><div className="pc-barcode-tools">{field('主条码默认方案',choice('barcode-schemes','主条码默认方案',values.defaultBarcodeSchemeId,ids=>change({defaultBarcodeSchemeId:ids[0]??null})))}<button type="button" className="btn ghost" disabled={!values.defaultBarcodeSchemeId} onClick={()=>setScheme(values.defaultBarcodeSchemeId)}>查看方案</button></div><small className="hint">修改方案只影响以后新生成的条码，已有条码保持不变。</small></>}{visited.has('barcodes')&&<EditorBarcodes active={tab==='barcodes'} skus={base?.skus??restoredDraft?.skus??[]} barcodes={base?.barcodes??restoredDraft?.barcodes??[]} draft={barcodeDraft} names={labels} change={rows=>{setBarcodeDraft(rows);setDirty(true);}}/>}
 {tab==='images'&&media.render(selection.colors.map(id=>({id,label:labels.get(id)??id})))}{base&&<EditorStock active={tab==='stock'} scope={scope} product={{id:base.productId,label:values.productCode}} reader={cap.stock} denied={p.onAccessFailure} open={p.onOpenInventory}/>} {tab==='stock'&&!base&&<div className="empty">新商品保存后可查看库存。</div>}
 </fieldset>}
 {(modal==='colors'||modal==='fits')&&<SpecSelection scope={scope} reader={cap.reader} kind={modal} denied={p.onAccessFailure} value={selection[modal]} labels={labels} {...(p.catalogueOptions&&cap.catalogueMaintenance?.[modal]?{create:(closeChild:()=>void,savedChild:(id:string)=>void)=><EntryEditor options={p.catalogueOptions!} capability={cap.catalogueMaintenance![modal]!} entry={null} close={closeChild} guard={guard=>{childGuard.current=guard;}} saved={async(result,_action,code)=>{try{p.catalogueOptions!.onChanged(modal==='colors'?'COLOR':'FIT');for(let page=1;;page++){const data=await cap.reader.readCandidates({parameters:{kind:modal,search:code,page,pageSize:100},identity:scope.identity,routeInstanceId:scope.routeInstanceId,entityId:p.productId,signal:scope.signal});const item=data.items.find(x=>x.id===result.targetId);if(item){setLabels(old=>new Map([...old,[item.id,item.name]]));savedChild(result.targetId);return true;}if(page*data.pageSize>=data.total)return false;}}catch(e){if(e instanceof HttpQueryError&&(e.kind==='forbidden'||e.kind==='unauthenticated')){p.onAccessFailure(e);scope.dispose();}else setError('已新增目录资料，但读取最新名称失败，请在弹窗重试读取。');return false;}}}/>}:{})} close={()=>setModal(null)} save={(ids,names)=>{setSelection(old=>({...old,[modal]:ids}));setLabels(names);setDirty(true);setModal(null);}}/>}
 {(modal==='delete'||modal==='discard')&&<SourceModal title={modal==='delete'?'确认删除商品':'放弃修改'} close={()=>setModal(null)} footer={<><button type="button" className="btn" onClick={()=>setModal(null)}>取消</button><button type="button" className="btn pc-danger-solid" onClick={()=>{const action=modal;setModal(null);if(action==='delete')void submit(true);else p.onClose();}}>确认</button></>}><p>{modal==='delete'?'确定删除该商品吗？':'未保存的修改将被放弃。'}</p></SourceModal>}

 {scheme&&<SchemeConsumer scope={scope} http={p.http} onAccessFailure={p.onAccessFailure} schemeId={scheme} close={()=>setScheme(null)}/>}
 </div>;
}
