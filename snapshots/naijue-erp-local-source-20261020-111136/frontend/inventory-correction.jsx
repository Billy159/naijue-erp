import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Alert,Button,ConfigProvider,Form,Input,Modal,Select} from '@arco-design/web-react';
import arcoCss from '@arco-design/web-react/dist/css/arco.css?inline';
import localCss from './inventory-correction.css?inline';
import {createCorrectionController} from './inventory-correction-service.mjs';

const host=document.createElement('div');host.id='inventory-correction-root';document.body.append(host);
const shadow=host.attachShadow({mode:'open'}),style=document.createElement('style'),local=document.createElement('style'),mount=document.createElement('div'),portal=document.createElement('div');
style.textContent=arcoCss.replace(/body\[arco-theme=dark\]/g,':host([arco-theme=dark])').replace(/\bbody\s*\{/g,':host {');local.textContent=localCss;
shadow.append(style,local,mount,portal);
const theme=()=>{host.setAttribute('arco-theme',document.body.getAttribute('arco-theme')||'light');};theme();new MutationObserver(theme).observe(document.body,{attributes:true,attributeFilter:['arco-theme']});
const controller=createCorrectionController({api:window.ERP_API,onCommitted:record=>window.dispatchEvent(new CustomEvent('inventory-correction-confirmed',{detail:record.correction}))});
let returnFocusTarget=null;
const number=value=>String(value??'').replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');
function CorrectionModal(){
  const [,render]=useState(0);
  useEffect(()=>controller.subscribe(()=>render(value=>value+1)),[]);
  const s=controller.state,disabled=s.busy||!!s.pendingId,run=work=>{Promise.resolve(work()).catch(()=>{});};
  const [form]=Form.useForm();useEffect(()=>{form.setFieldsValue(s.input);},[form,s.input]);
  const preview=s.preview,confirmed=s.result?.correction;
  return <ConfigProvider size="default"><Modal visible={s.visible} title="库存校正" className="inventory-correction-modal" style={{width:'min(620px, calc(100vw - 32px))'}}
    getPopupContainer={()=>portal} getChildrenPopupContainer={()=>portal} maskClosable={false} escToExit={!s.busy} closable={!s.busy} onCancel={()=>controller.close()} afterClose={()=>{const target=returnFocusTarget;returnFocusTarget=null;if(target?.isConnected&&!target.disabled)target.focus({preventScroll:true});}} unmountOnExit footer={
      <div className="ic-actions"><Button disabled={s.busy} onClick={()=>controller.close()}>{s.result?'完成':'取消'}</Button>
        {s.pendingId?<Button loading={s.busy} type="primary" onClick={()=>run(()=>controller.recoverRequest(s.pendingId))}>查询原请求</Button>
          :!s.result&&<><Button loading={s.busy&&!preview} disabled={s.busy||s.unitLoading||!s.input.unit} onClick={()=>run(()=>controller.preview())}>核对差额</Button>
            <Button type="primary" loading={s.busy&&!!preview} disabled={s.busy||!preview} onClick={()=>run(()=>controller.confirm())}>{s.changed?'确认最新差额':'确认校正'}</Button></>}
      </div>}>
    {s.error&&<Alert className="ic-alert" type={s.pendingId||s.changed?'warning':'error'} content={s.error}/>}
    {s.pendingId&&<p className="ic-request">请求 ID：{s.pendingId}</p>}
    {s.result?<>
      <Alert type="success" content="校正已确认，记录与最新账面已回读"/>
      <dl className="ic-facts"><div><dt>确认前账面</dt><dd>{number(confirmed.bookQuantity)} {confirmed.unit}</dd></div><div><dt>实际数量</dt><dd>{number(confirmed.actualQuantity)} {confirmed.unit}</dd></div>
        <div><dt>本次差额</dt><dd>{number(confirmed.delta)} {confirmed.unit}</dd></div><div><dt>当前账面</dt><dd>{number(s.balance.quantity)} {confirmed.unit}</dd></div></dl>
      <p>原因：{confirmed.reason}</p><p className="ic-request">校正记录：{s.result.number}</p><p className="ic-request">操作者：{s.result.actorId} · {confirmed.confirmedAt}</p>
    </>:<>
      <Form form={form} layout="vertical" className="ic-form" autoComplete="off">
        <Form.Item label="仓库" field="warehouseId" required><Select aria-label="校正仓库" showSearch disabled={disabled} value={s.input.warehouseId||undefined} placeholder="选择仓库"
          options={s.choices.warehouses.map(w=>({value:w.id,label:[w.code,w.name].filter(Boolean).join(' · ')}))} onChange={value=>controller.change('warehouseId',value)}/></Form.Item>
        <Form.Item label="商品规格" field="skuId" required extra="按原规格分别校正"><Select aria-label="校正原规格" showSearch disabled={disabled} value={s.input.skuId||undefined} placeholder="款号 / 商品 / 颜色 / 原尺码"
          virtualListProps={{height:240}} options={s.choices.skus.map(sku=>({value:sku.id,label:sku.label}))} onChange={value=>controller.change('skuId',value)}/></Form.Item>
        <Form.Item label="计量单位" field="unit" required extra="各单位分别核对与校正"><Select aria-label="校正计量单位" loading={s.unitLoading} disabled={disabled||s.unitLoading||!s.availableUnits.length}
          value={s.input.unit||undefined} placeholder="选择计量单位" options={s.availableUnits} onChange={value=>controller.change('unit',value)}/></Form.Item>
        <Form.Item label="实际数量" field="actualQuantity" required><Input aria-label="实际数量" value={s.input.actualQuantity} disabled={disabled} maxLength={20} placeholder="输入实际数量，可为正数、零或负数"
          onChange={value=>controller.change('actualQuantity',value)}/></Form.Item>
        <Form.Item label="校正原因" field="reason" required><Input.TextArea aria-label="校正原因" value={s.input.reason} disabled={disabled} maxLength={1000} autoSize={{minRows:2,maxRows:4}} placeholder="填写本次校正原因"
          onChange={value=>controller.change('reason',value)}/></Form.Item>
      </Form>
      {preview&&<><dl className="ic-facts" aria-label="校正差额"><div><dt>当前账面</dt><dd data-ic="book">{number(preview.bookQuantity)} {preview.unit}</dd></div>
        <div><dt>实际数量</dt><dd>{number(preview.actualQuantity)} {preview.unit}</dd></div><div><dt>本次差额</dt><dd data-ic="delta">{number(preview.delta)} {preview.unit}</dd></div></dl>
        <p className="ic-hint">{number(preview.delta)==='0'?'差额为零，将保留一次校正记录。':'确认后按此差额更新库存，并保留校正来源。'}</p></>}
    </>}
  </Modal></ConfigProvider>;
}
createRoot(mount).render(<CorrectionModal/>);
window.INVENTORY_CORRECTION={...controller,openForCell:(target,options)=>{returnFocusTarget=options?.returnFocusTarget||document.activeElement;return controller.open({...options,target});}};
document.addEventListener('click',event=>{const trigger=event.target.closest('[data-i="correction"]');if(!trigger)return;returnFocusTarget=trigger;controller.open().catch(()=>{});});
window.addEventListener('erp-request-recovered',()=>controller.state.visible&&controller.state.pendingId&&!controller.pending().some(row=>row.requestId===controller.state.pendingId)&&controller.close());
