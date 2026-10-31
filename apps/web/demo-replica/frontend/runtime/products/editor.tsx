import { ProductEditorPrices } from '../../../../src/products/product-editor-prices.tsx';
import { useEffect,useRef,useState,useSyncExternalStore } from 'react';
import type { ProductMaintenanceCandidatePage,ProductMaintenanceDetail,ProductMaintenanceDetailV2,ProductWriteValuesV2,ProductEditorDraft,ProductBarcodeInput } from '../../../../src/products/product-editor-contracts.ts';
import { ProductEditorController,actualSpecSelection } from '../../../../src/products/product-editor-state.ts';
import { HttpQueryError } from '../../../../src/transport/http-query.ts';
import { useProductRead,ReadNotice } from './read.tsx';
import { productTabs,priceFields,SchemeConsumer } from './detail.tsx';
import { EntryEditor,SourceModal } from '../catalogue/source-controls.tsx';
import { useEditorMedia } from './editor-media.tsx';
import { GroupMembers } from './editor-size-group.tsx';
import { EditorBarcodes } from './editor-barcodes.tsx';
import { DraftEditorBarcodes } from './editor-draft-barcodes.tsx';
import { EditorStock } from './editor-stock.tsx';
import { EditorChoice,SpecSelection } from './editor-fields.tsx';
import type { SourceProductEditorOptions } from './editor-entry.tsx';
const currentSchemeId='0e70e45e-1a51-4d44-afe8-0002cf3fb7ef';
const newValues=():ProductWriteValuesV2=>({productCode:'',name:'',categoryId:'',supplierId:null,seasonIds:[],sizeGroupId:'',year:null,systemItemCode:null,thickness:null,collarPantsType:null,defaultBarcodeSchemeId:null,enabled:true,prices:Object.fromEntries(priceFields.map(([key])=>[key,null])) as ProductWriteValuesV2['prices']});
export function ProductEditor(p:SourceProductEditorOptions){
 const [session,setSession]=useState<{revision:number;baseline?:ProductMaintenanceDetailV2}>({revision:0});
 return <ProductEditorSession {...p} key={session.revision} initialBaseline={session.baseline} reload={baseline=>setSession(old=>({revision:old.revision+1,baseline}))}/>;
}
function ProductEditorSession(p:SourceProductEditorOptions&{initialBaseline:ProductMaintenanceDetailV2|undefined;reload:(baseline:ProductMaintenanceDetailV2)=>void}){
 const scope=p.parent,cap=p.capability;
 const [originalCommand]=useState(()=>p.initialBaseline?null:cap.recovery?.read(scope.identity,p.productId)??null);
 const restoredDraft=originalCommand&&'values'in originalCommand&&'seasonIds'in originalCommand.values?{values:originalCommand.values as ProductWriteValuesV2,skus:originalCommand.skus,barcodes:originalCommand.barcodes,selection:'skuSelection'in originalCommand&&originalCommand.skuSelection?{colors:[...originalCommand.skuSelection.colorIds],fits:[...originalCommand.skuSelection.fitIds]}:actualSpecSelection(originalCommand.skus)}:null;
 const [controller]=useState(()=>new ProductEditorController({scope,client:cap.client,newRequestKey:cap.newRequestKey,onRecoveryRequired:cap.onRecoveryRequired,onAccessFailure:e=>p.onAccessFailure(new HttpQueryError(e.kind==='forbidden'?'forbidden':'unauthenticated',e.code)),...(originalCommand?{originalCommand}:{})}));
 const write=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot),alive=useRef(false),finished=useRef(false),finishing=useRef(false),resolvedKey=useRef<string|null>(null),childGuard=useRef<(()=>boolean)|null>(null);
 const [barcodeFeedback,setBarcodeFeedback]=useState<{targetId:string;missing:readonly string[];reason:string}|null>(null);
 const [confirmation,setConfirmation]=useState<'idle'|'reading'|'error'>('idle'),[pendingBaseline,setPendingBaseline]=useState<ProductMaintenanceDetailV2|null>(null),[baselineStatus,setBaselineStatus]=useState<'idle'|'reading'|'error'>('idle');
 const rejectedKey=useRef<string|null>(null),baselineReading=useRef<string|null>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;queueMicrotask(()=>{if(!alive.current)controller.dispose();});};},[controller]);
 const detail=useProductRead(scope,read=>cap.reader.readDetail(read),{productId:p.productId??''},!!p.productId&&!p.initialBaseline&&write.phase==='idle',p.onAccessFailure);
 const [base,setBase]=useState<ProductMaintenanceDetailV2|null>(null),[values,setValues]=useState(()=>restoredDraft?.values??newValues()),[selection,setSelection]=useState(()=>restoredDraft?{colors:[...restoredDraft.selection.colors],fits:[...restoredDraft.selection.fits]}:{colors:[] as string[],fits:[] as string[]}),[labels,setLabels]=useState<ReadonlyMap<string,string>>(new Map()),[tab,setTab]=useState<string>(p.initialTab??'base'),[modal,setModal]=useState<'colors'|'fits'|'delete'|'discard'|'reload'|null>(null),[error,setError]=useState(''),[scheme,setScheme]=useState<string|null>(null),[dirty,setDirty]=useState(!!restoredDraft),[barcodeDraft,setBarcodeDraft]=useState<ProductBarcodeInput[]>([]);
 const [visited,setVisited]=useState<ReadonlySet<string>>(()=>new Set([p.initialTab??'base']));
 const fitTouched=useRef(false);
 const defaultFit=useProductRead(scope,async read=>{
  let found:ProductMaintenanceCandidatePage['items'][number]|null=null;
  for(let page=1;;page++){
   const data=await cap.reader.readCandidates({...read,parameters:{...read.parameters,page}});
   if(read.signal.aborted)throw new DOMException('Default fit cancelled','AbortError');
   for(const fit of data.items)if(fit.code==='A'){if(found&&found.id!==fit.id)return null;found=fit;}
   if(page*data.pageSize>=data.total)return found;
  }
 },{kind:'fits' as const,search:'A',page:1,pageSize:100 as const},!p.productId&&!originalCommand&&!p.initialBaseline&&!fitTouched.current,p.onAccessFailure);
 useEffect(()=>{const fit=defaultFit.snapshot.success?.data;if(!fit||p.productId||originalCommand||p.initialBaseline||fitTouched.current||controller.getSnapshot().command)return;setSelection(old=>old.fits.length?old:{...old,fits:[fit.id]});setLabels(old=>new Map([...old,[fit.id,fit.name]]));},[defaultFit.snapshot.success]);
 const schemeTouched=useRef(false);
 const defaultScheme=useProductRead(scope,cap.barcodeSchemeReader?.readBarcodeScheme,{schemeId:currentSchemeId},!p.productId&&!originalCommand,p.onAccessFailure);
 useEffect(()=>{const d=defaultScheme.snapshot.success?.data;if(p.productId||originalCommand||controller.getSnapshot().command||schemeTouched.current||!d||d.id!==currentSchemeId||d.status!=='CURRENT')return;setValues(old=>old.defaultBarcodeSchemeId===null?{...old,defaultBarcodeSchemeId:d.id}:old);setLabels(old=>new Map([...old,[d.id,d.name]]));},[defaultScheme.snapshot.success,p.productId,originalCommand]);
 const changeTab=(next:string)=>{setVisited(old=>new Set([...old,next]));setTab(next);};
 const needsBaseline=write.phase==='rejected'&&!!p.productId&&write.error?.code==='VERSION_CONFLICT';
 const writeBusy=!['idle','rejected'].includes(write.phase),busy=writeBusy,ready=!p.productId||!!base||!!restoredDraft&&writeBusy;
 const canMaintain=cap.allowedActions.includes(p.productId?'EDIT':'CREATE');
 const waitingForDefault=!p.productId&&!originalCommand&&(!schemeTouched.current&&(defaultScheme.snapshot.phase==='idle'||defaultScheme.snapshot.phase==='loading')||!p.initialBaseline&&!fitTouched.current&&(defaultFit.snapshot.phase==='idle'||defaultFit.snapshot.phase==='loading'));
 const media=useEditorMedia({scope,productId:p.productId,version:base?.version??null,capability:cap,controller,active:tab==='images'&&!busy&&ready,locked:busy||!ready||!canMaintain,changed:()=>setDirty(true),denied:p.onAccessFailure});
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
 useEffect(()=>{if(p.initialBaseline)applyBaseline(p.initialBaseline);},[]);
 const reloadRejectedBaseline=async()=>{
  const command=write.command;if(!needsBaseline||!command||!p.productId||baselineReading.current===command.requestKey||!scope.active)return;
  baselineReading.current=command.requestKey;setPendingBaseline(null);setBaselineStatus('reading');
  try{const outcome=await detail.query.run({productId:p.productId});if(!alive.current||!scope.active||controller.getSnapshot().command?.requestKey!==command.requestKey)return;
   if(outcome.status==='success'&&outcome.data.productId===p.productId&&'seasonIds'in outcome.data.values){setPendingBaseline(outcome.data as ProductMaintenanceDetailV2);setBaselineStatus('idle');}else setBaselineStatus('error');
  }finally{if(baselineReading.current===command.requestKey)baselineReading.current=null;}
 };
 useEffect(()=>{if(write.phase==='rejected'&&p.productId&&write.command&&rejectedKey.current!==write.command.requestKey){rejectedKey.current=write.command.requestKey;if(write.command.action==='DELETE')setModal(null);if(needsBaseline)void reloadRejectedBaseline();}},[write]);
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
   finished.current=true;
   const command=write.command,prior=base?.skus??[];
   if('values'in command&&outcome.data.version===result.version&&(command.action==='CREATE'||base!==null)){
    const retained=new Set(prior.flatMap(sku=>sku.id?[sku.id]:[])),fresh=outcome.data.skus.filter(sku=>sku.id&&!retained.has(sku.id)&&sku.enabled);
    const missing=fresh.filter(sku=>!outcome.data.barcodes.some(barcode=>barcode.kind==='MAIN'&&barcode.colorId===sku.colorId&&barcode.fitId===sku.fitId&&barcode.sizeId===sku.sizeId));
    if(missing.length){const actual=outcome.data.values;setBarcodeFeedback({targetId:result.targetId,missing:missing.map(sku=>sku.skuCode),reason:actual.defaultBarcodeSchemeId!==currentSchemeId?'当前主条码方案不是2026方案，本次新规格未自动生成2026主条码。':!/^\d{7}$/.test(actual.systemItemCode??'')?'手工系统货号不符合2026主条码生成规则；原货号保持不变。':'请核对颜色、版型和尺码的原编码；当前商品详情未提供具体未生成原因。'});return;}
   }
   p.onSaved(result.targetId);
  }finally{finishing.current=false;if(alive.current&&scope.active)setConfirmation(current=>current==='reading'?'idle':current);}
 };
 useEffect(()=>{
  if(write.phase!=='committed'||!write.result||!write.command||finished.current)return;
  if(resolvedKey.current!==write.command.requestKey){resolvedKey.current=write.command.requestKey;cap.recovery?.resolved(scope.identity,write.command.requestKey);}
  if(write.command.action==='DELETE'){finished.current=true;p.onClose();return;}
  void confirmSaved();
 },[write]);
 const change=(patch:Partial<ProductWriteValuesV2>)=>{setValues(old=>({...old,...patch}));setDirty(true);};
 const submit=async(deleting=false)=>{if(busy||needsBaseline||waitingForDefault)return;setError('');try{if(deleting){if(base&&cap.allowedActions.includes('DELETE'))await controller.submit({action:'DELETE',id:base.productId,expectedVersion:base.version});return;}const action=base?'EDIT':'CREATE';if(!cap.allowedActions.includes(action))return;
 if(media.pending){setError('请等待图片准备完成，或移除失败的图片。');return;}
 const common={...(media.changes.length?{imageChanges:media.changes}:{}),values,skus:base?.skus??restoredDraft?.skus??[],barcodes:[...(base?.barcodes??restoredDraft?.barcodes??[]),...barcodeDraft],skuSelection:{colorIds:selection.colors,fitIds:selection.fits}};
 const draft:ProductEditorDraft=base?{...common,action:'EDIT',id:base.productId,expectedVersion:base.version}:{...common,action:'CREATE',values:{...values,seasonIds:values.seasonIds??[]}};
 await controller.submit(draft);
 }catch(e){setError(e instanceof Error?e.message:'商品保存失败。');}};
 const choice=(kind:Parameters<typeof EditorChoice>[0]['kind'],label:string,value:string|string[]|null,update:(ids:string[])=>void,disabled=false,multiple=false)=><EditorChoice scope={scope} reader={cap.reader} kind={kind} label={label} value={value} labels={labels} change={update} onLabels={names=>setLabels(old=>new Map([...old,...names]))} {...(kind==='categories'&&base?{categoryPath:base.references.categoryPath.map(x=>x.id)}:{})} disabled={disabled||busy||!ready} multiple={multiple} denied={p.onAccessFailure}/>;
 const field=(name:string,child:React.ReactNode)=><div className="field" key={name}><span className="pc-field-caption">{name.replace(/\s*\*$/,'')}{name.endsWith('*')&&<span className="ui-required"> *</span>}</span>{child}</div>;
 const close=()=>{if(writeBusy)return;if(dirty)setModal('discard');else p.onClose();};
 if(!scope.active)return null;
 return <div className="pc-detail-workbench"><div className="pc-detail-sticky"><div className="gold-head iw-head pc-page-head"><h1>{values.productCode||(p.productId?'商品资料':'新增商品')} · {values.name||'未命名'}</h1><div className="actions iw-head-actions">{base&&cap.allowedActions.includes('DELETE')&&<button type="button" className="btn ghost pc-danger" disabled={busy} onClick={()=>setModal('delete')}>删除商品</button>}<button type="button" className="btn" disabled={writeBusy} onClick={close}>取消</button><button type="button" className="btn primary" disabled={busy||needsBaseline||waitingForDefault||!ready||!cap.allowedActions.includes(base?'EDIT':'CREATE')} onClick={()=>void submit()}>保存</button></div></div><div className="tabs" role="tablist" aria-label="商品详情">{productTabs.map(([key,label])=><button type="button" role="tab" aria-selected={key===tab} key={key} className={key===tab?'active':''} onClick={()=>changeTab(key)}>{label}</button>)}</div></div>
 {!canMaintain&&<p role="status">当前未提供商品保存能力。填写内容仅保留在本页，保存和图片上传暂不可用。</p>}
 {!p.productId&&!originalCommand&&<>{defaultScheme.snapshot.phase==='loading'?<p role="status">正在读取新建商品的2026条码方案…</p>:defaultScheme.snapshot.phase==='success'?(defaultScheme.snapshot.success?.data?.id!==currentSchemeId||defaultScheme.snapshot.success.data.status!=='CURRENT')&&<p role="alert">未取得已确认的当前2026条码方案，未自动设置默认方案。</p>:<p role="alert">2026条码方案读取未完成，未自动设置默认方案。<button type="button" className="btn ghost" disabled={writeBusy} onClick={()=>{if(!writeBusy)void defaultScheme.query.run({schemeId:currentSchemeId});}}>重试读取2026方案</button></p>}</>}
 {!p.productId&&!originalCommand&&!p.initialBaseline&&!fitTouched.current&&defaultFit.snapshot.phase==='loading'&&<p role="status">正在读取新建商品的默认A版…</p>}
 {!p.productId&&!originalCommand&&!p.initialBaseline&&!fitTouched.current&&(defaultFit.snapshot.phase==='error'||defaultFit.snapshot.phase==='success'&&!defaultFit.snapshot.success?.data)&&<p role="alert">尚未取得唯一有效的A版，未自动填写版型。<button type="button" className="btn ghost" disabled={writeBusy} onClick={()=>void defaultFit.query.run({kind:'fits',search:'A',page:1,pageSize:100})}>重新读取A版</button></p>}
 <div id="pc-editor-error" className="inline-error" role="alert">{error||write.error?.message}</div>{write.phase==='submitting'&&<p role="status">正在保存…</p>}{(write.phase==='uncertain'||write.phase==='checking')&&<p role="alert">保存结果尚未确认，请先查回原请求。<button type="button" className="btn" disabled={write.phase==='checking'} onClick={()=>void controller.recover()}>查回结果</button>{write.phase==='uncertain'&&write.recovery==='absent'&&<button type="button" className="btn" disabled={!write.command||!cap.allowedActions.includes(write.command.action)} onClick={()=>{if(write.command&&cap.allowedActions.includes(write.command.action))void controller.retryOriginal();}}>按原请求重试</button>}</p>}
 {write.phase==='committed'&&write.command?.action!=='DELETE'&&<p role={confirmation==='error'?'alert':'status'}>{confirmation==='error'?'保存已提交，最新资料读取未完成。':finished.current?'保存已确认。':'保存已提交，正在确认最新商品资料…'}{confirmation==='error'&&<button type="button" className="btn" onClick={()=>void confirmSaved()}>重新读取商品</button>}</p>}
 {barcodeFeedback&&<div role="alert" className="inline-error"><p>商品资料和规格已保存；本次新增规格中有 {barcodeFeedback.missing.length} 项在已确认的商品详情中没有主条码。</p><p>{barcodeFeedback.reason}</p><p>未生成主码的规格：{barcodeFeedback.missing.join('、')}</p><p>原主码、兼容码和停用状态保持不变，请勿重复保存。</p><button type="button" className="btn" onClick={()=>p.onSaved(barcodeFeedback.targetId)}>查看已保存商品</button></div>}
 {write.phase==='rejected'&&p.productId&&<p role="alert">保存已被拒绝，输入和原版本仍保留。{needsBaseline?'版本存在冲突，放弃修改并载入最新资料后才可再次保存。':''}{baselineStatus==='reading'?' 正在读取最新资料。':baselineStatus==='error'?' 最新资料读取失败。':''}{baselineStatus==='error'&&<button type="button" className="btn" onClick={()=>void reloadRejectedBaseline()}>重新读取基准</button>}{needsBaseline&&pendingBaseline&&<button type="button" className="btn" onClick={()=>setModal('reload')}>放弃修改并载入最新资料</button>}</p>}
 {p.productId&&!base&&write.phase==='idle'&&<ReadNotice phase={detail.snapshot.phase} retry={()=>void detail.query.run({productId:p.productId!})} cancel={()=>detail.query.cancel()}/>}
 {ready&&specsActive&&<ReadNotice phase={specs.snapshot.phase} retry={()=>void specs.query.run({productId:p.productId!})} cancel={()=>specs.query.cancel()}/>}
 <fieldset disabled={busy||!ready} className="pc-editor-body pc-detail-body" style={{border:0,margin:0,minWidth:0}}>
 {tab==='base'&&<div className="pc-form-grid pc-base-grid">{field('款号 *',<input aria-label="款号" value={values.productCode} readOnly={!!base} maxLength={40} onChange={e=>change({productCode:e.target.value})}/>)}{field('商品名称 *',<input aria-label="商品名称" value={values.name} maxLength={80} onChange={e=>change({name:e.target.value})}/>)}{field('商品分类 *',choice('categories','商品分类',values.categoryId,ids=>change({categoryId:ids[0]??''})))}{field('年份 *',choice('years','年份',values.year===null?null:String(values.year),ids=>change({year:ids[0]?Number(ids[0]):null})))}{field('季节 *',choice('seasons','季节',values.seasonIds===null?null:[...values.seasonIds],ids=>change({seasonIds:ids}),false,true))}{field('供应商 *',choice('suppliers','供应商',values.supplierId,ids=>change({supplierId:ids[0]??null})))}{field('厚薄（可选）',choice('thicknesses','厚薄',values.thickness,ids=>change({thickness:ids[0]??null})))}{field('领型 / 裤型（可选）',choice('collar-pants-types','领型 / 裤型',values.collarPantsType,ids=>change({collarPantsType:ids[0]??null})))}{field('系统货号 *',<input aria-label="系统货号" value={values.systemItemCode??''} maxLength={30} onChange={e=>change({systemItemCode:e.target.value||null})}/>)}</div>}
 {visited.has('specs')&&<GroupMembers key={'specs:'+ (values.sizeGroupId||'unset')} active={tab==='specs'} scope={scope} reader={cap.dictionaryReader} id={values.sizeGroupId} name={labels.get(values.sizeGroupId)??''} denied={p.onAccessFailure}>{members=><div className="pc-spec-stack">{(['colors','fits'] as const).slice(0,1).map(kind=><section className="pc-spec-section" key={kind}><div className="pc-section-line"><h3>颜色</h3><button type="button" className="btn ghost" onClick={()=>setModal(kind)}>编辑颜色</button></div><div className="pc-spec-values">{selection.colors.map(id=><span className="pc-spec-value" key={id}>{labels.get(id)??id}</span>)}{!selection.colors.length&&<span className="hint">未设置</span>}</div></section>)}<section className="pc-spec-section"><div className="pc-section-line"><h3>尺码组</h3></div><div className="pc-spec-group"><span>选择尺码组</span>{choice('size-groups','尺码组',values.sizeGroupId,ids=>change({sizeGroupId:ids[0]??''}),!!base)}</div>{values.sizeGroupId&&members}</section><section className="pc-spec-section"><div className="pc-section-line"><h3>版型</h3><button type="button" className="btn ghost" onClick={()=>setModal('fits')}>编辑版型</button></div><div className="pc-spec-values">{selection.fits.map(id=><span className="pc-spec-value" key={id}>{labels.get(id)??id}</span>)}{!selection.fits.length&&<span className="hint">未设置</span>}</div></section></div>}</GroupMembers>}
 {tab==='prices'&&<ProductEditorPrices values={values} disabled={busy||!ready} change={change} setError={setError}/>}
 {tab==='barcodes'&&<><div className="pc-barcode-tools">{field('主条码默认方案',choice('barcode-schemes','主条码默认方案',values.defaultBarcodeSchemeId,ids=>{schemeTouched.current=true;change({defaultBarcodeSchemeId:ids[0]??null});}))}<button type="button" className="btn ghost" disabled={!values.defaultBarcodeSchemeId} onClick={()=>setScheme(values.defaultBarcodeSchemeId)}>查看方案</button></div><small className="hint">修改方案只影响以后新生成的条码，已有条码保持不变。</small></>}{visited.has('barcodes')&&!p.productId&&!originalCommand&&<DraftEditorBarcodes key={'draft-barcodes:'+ (values.sizeGroupId||'unset')} active={tab==='barcodes'} scope={scope} reader={cap.dictionaryReader} groupId={values.sizeGroupId} groupName={labels.get(values.sizeGroupId)??''} colorIds={selection.colors} fitIds={selection.fits} names={labels} denied={p.onAccessFailure}/>}
 {visited.has('barcodes')&&(!!p.productId||!!originalCommand)&&<EditorBarcodes active={tab==='barcodes'} canSupplement={!!base&&cap.allowedActions.includes('EDIT')&&!busy} skus={base?.skus??restoredDraft?.skus??[]} barcodes={base?.barcodes??restoredDraft?.barcodes??[]} draft={barcodeDraft} names={labels} change={rows=>{setBarcodeDraft(rows);setDirty(true);}}/>}
 {tab==='images'&&(p.productId&&!base?<p role="status">尚未取得商品资料，暂不能读取图片。请先通过上方入口读取商品资料。</p>:media.render(selection.colors.map(id=>({id,label:labels.get(id)??id}))))}{base&&<EditorStock active={tab==='stock'} scope={scope} product={{id:base.productId,label:base.values.productCode+' · '+base.values.name}} reader={cap.stock} denied={p.onAccessFailure} open={p.onOpenInventory}/>} {tab==='stock'&&!base&&<div className="empty">{p.productId?'尚未取得商品资料，暂不能显示库存。':'新商品保存后可查看库存。'}</div>}
 </fieldset>
 {(modal==='colors'||modal==='fits')&&<SpecSelection createUnavailableReason={cap.catalogueMaintenance?.[modal]?'当前账号未获新增'+(modal==='colors'?'颜色':'版型')+'权限':'当前入口未接通新增'+(modal==='colors'?'颜色':'版型')+'能力'} scope={scope} reader={cap.reader} kind={modal} denied={p.onAccessFailure} value={selection[modal]} labels={labels} {...(p.catalogueOptions&&cap.catalogueMaintenance?.[modal]?.allowedActions.includes('CREATE')?{create:(closeChild:()=>void,savedChild:(id:string)=>void)=><EntryEditor options={p.catalogueOptions!} capability={cap.catalogueMaintenance![modal]!} entry={null} close={closeChild} guard={guard=>{childGuard.current=guard;}} saved={async(result,_action,code)=>{try{p.catalogueOptions!.onChanged(modal==='colors'?'COLOR':'FIT');for(let page=1;;page++){const data=await cap.reader.readCandidates({parameters:{kind:modal,search:code,page,pageSize:100},identity:scope.identity,routeInstanceId:scope.routeInstanceId,entityId:p.productId,signal:scope.signal});const item=data.items.find(x=>x.id===result.targetId);if(item){setLabels(old=>new Map([...old,[item.id,item.name]]));savedChild(result.targetId);return true;}if(page*data.pageSize>=data.total)return false;}}catch(e){if(e instanceof HttpQueryError&&(e.kind==='forbidden'||e.kind==='unauthenticated')){p.onAccessFailure(e);scope.dispose();}else setError('已新增目录资料，但读取最新名称失败，请在弹窗重试读取。');return false;}}}/>}:{})} close={()=>setModal(null)} save={(ids,names)=>{if(modal==='fits')fitTouched.current=true;setSelection(old=>({...old,[modal]:ids}));setLabels(names);setDirty(true);setModal(null);}}/>}
 {(modal==='delete'||modal==='discard'||modal==='reload')&&<SourceModal title={modal==='delete'?'确认删除商品':modal==='reload'?'放弃修改并载入最新资料':'有未保存的修改'} close={()=>setModal(null)} footer={<><button type="button" className="btn" onClick={()=>setModal(null)}>{modal==='discard'?'继续编辑':'取消'}</button><button type="button" className={modal==='discard'?'btn primary':'btn pc-danger-solid'} onClick={()=>{const action=modal;setModal(null);if(action==='delete')void submit(true);else if(action==='reload'){if(pendingBaseline)p.reload(pendingBaseline);}else p.onClose();}}>{modal==='discard'?'放弃修改并离开':'确认'}</button></>}><p>{modal==='delete'?'确定删除该商品吗？':'未保存的修改将被放弃。'}</p></SourceModal>}

 {scheme&&<SchemeConsumer scope={scope} http={p.http} onAccessFailure={p.onAccessFailure} schemeId={scheme} close={()=>setScheme(null)}/>}
 </div>;
}
