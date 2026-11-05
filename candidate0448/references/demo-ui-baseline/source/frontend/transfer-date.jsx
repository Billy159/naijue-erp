/* Arco date controls for the transfer query and document date. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import DatePicker from '@arco-design/web-react/es/DatePicker';
import Input from '@arco-design/web-react/es/Input';
import InputNumber from '@arco-design/web-react/es/InputNumber';
import Modal from '@arco-design/web-react/es/Modal';
import Button from '@arco-design/web-react/es/Button';
import Space from '@arco-design/web-react/es/Space';
import Typography from '@arco-design/web-react/es/Typography';
import arcoCss from '@arco-design/web-react/dist/css/arco.css?inline';

// Historical size aliases share a compact matrix cell, but remain separate
// quantity commands. The editor always names the original source sizes.
const quantityHost=document.createElement('div');
quantityHost.id='transfer-history-quantity-root';document.body.append(quantityHost);
const quantityRoot=createRoot(quantityHost),closeQuantity=()=>quantityRoot.render(null);
function HistoryQuantityEditor({config}){
 const [values,setValues]=React.useState(()=>Object.fromEntries(config.rows.map(row=>[row.id,row.value])));
 return <Modal visible title={config.title} style={{width:420}} onCancel={closeQuantity}
  footer={<Space><Button onClick={closeQuantity}>{config.editable?'取消':'关闭'}</Button>{config.editable&&<Button type="primary" onClick={()=>{if(config.onConfirm(values)!==false)closeQuantity()}}>确认</Button>}</Space>}>
  <Space direction="vertical" size="medium" style={{width:'100%'}}>
   {config.rows.map(row=><div key={row.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16}}>
    <Typography.Text>{row.name}</Typography.Text>
    {config.editable?<InputNumber aria-label={row.name+' 数量'} value={values[row.id]} min={0} max={99999} precision={0} size="small" style={{width:96}} onChange={value=>setValues(previous=>({...previous,[row.id]:value??0}))}/>:<Typography.Text>{row.value}</Typography.Text>}
   </div>)}
  </Space>
 </Modal>;
}
window.TRANSFER_HISTORY_QUANTITY={open(config){quantityRoot.render(<HistoryQuantityEditor key={crypto.randomUUID()} config={config}/>);},close:closeQuantity};

const roots=new Map();
const localCss=`
:host{display:block;width:100%;font:13px Arial,"PingFang SC",sans-serif;color:var(--ca-ink);--primary-6:var(--ca-primary-rgb);--arcoblue-6:var(--ca-primary-rgb)}
#root,.arco-picker{width:100%}
.arco-picker{box-sizing:border-box;height:32px;min-height:32px;border:1px solid transparent;border-radius:4px;background:var(--ca-surface-muted);box-shadow:none}
.arco-picker:hover{border-color:var(--ca-control-hover-border);background:var(--ca-surface-muted)}
.arco-picker-focused,.arco-picker-focused:hover{border-color:var(--ca-primary);background:var(--ca-surface-muted);box-shadow:none}
.arco-picker input{font:13px Arial,"PingFang SC",sans-serif;color:var(--ca-ink)}
.arco-picker input::placeholder{color:var(--ca-ink-3)}
#portal .arco-trigger{left:var(--transfer-popup-left)!important;z-index:2000!important}.arco-picker-container{border-radius:5px;background:#fff;box-shadow:var(--ca-shadow-float)}
:host([data-ledger-source]) .arco-input-wrapper{box-sizing:border-box;width:100%;height:32px;min-height:32px;border:1px solid transparent;border-radius:var(--ca-radius-control);background:var(--ca-surface-muted);box-shadow:none}
:host([data-ledger-source]) .arco-input-wrapper:hover{border-color:var(--ca-control-hover-border)}
:host([data-ledger-source]) .arco-input-wrapper:focus-within{border-color:var(--ca-control-focus-border)}
:host([data-ledger-source]) input{font:13px Arial,"PingFang SC",sans-serif;color:var(--ca-ink)}
`;
function mountDateHost(host,view){
 const shadow=host.attachShadow({mode:'open'}),arco=document.createElement('style'),local=document.createElement('style'),container=document.createElement('div'),portal=document.createElement('div');
 const alignPopup=()=>portal.style.setProperty('--transfer-popup-left',Math.max(8,Math.min(host.getBoundingClientRect().left,innerWidth-275))+'px');alignPopup();host.addEventListener('pointerdown',alignPopup);
 // Inside the ledger drawer, Arco positions against its local container.
 // The existing page-level viewport correction must not be added a second time.
 arco.textContent=arcoCss.replace(/\bbody\s*\{/g,':host {');local.textContent=host.hasAttribute('data-ledger-date')?localCss.replace('left:var(--transfer-popup-left)!important;',''):localCss;container.id='root';portal.id='portal';shadow.append(arco,local,container,portal);
 const root=createRoot(container);roots.set(host,root);root.render(view(portal));
}
function LedgerField({host,portal}){
 const field=host.dataset.ledgerDate||'source',form=host.closest('form');
 const [value,setValue]=React.useState(host.dataset.value||'');
 const change=next=>{setValue(next);const input=form?.elements.namedItem(field);if(input){input.value=next;input.dispatchEvent(new Event('input',{bubbles:true}))}};
 return field==='source'
  ? <Input.Search value={value} placeholder="来源单号" aria-label="来源单号" allowClear onChange={change} onSearch={()=>form?.requestSubmit()} />
  : <DatePicker value={value||undefined} format="YYYY-MM-DD" placeholder={field==='start'?'开始日期':'结束日期'} aria-label={field==='start'?'开始日期':'结束日期'} allowClear getPopupContainer={()=>portal} onChange={next=>change(next||'')} />;
}
function DateField({field,portal,mode,readonly}){
 const transfer=mode==='sales'?window.SALES_UI.state:window.TRANSFER_UI.state;
 const detail=field==='document';
 const initial=detail?transfer.doc?.date:transfer.filter[field];
 const [value,setValue]=React.useState((initial||'').slice(0,10));
 React.useEffect(()=>setValue((detail?transfer.doc?.date:transfer.filter[field]||'').slice(0,10)),[transfer.doc?.id,field]);
 return <DatePicker value={value||undefined} format="YYYY-MM-DD" placeholder={detail?'选择单据日期':field==='start'?'开始日期':'结束日期'} allowClear={!detail} disabled={detail&&(mode==='sales'?readonly:!transfer.lease||transfer.doc?.status==='已审核'||!!transfer.blocked)} getPopupContainer={()=>portal} onChange={date=>{
  const next=typeof date==='string'?date:String(date||'').slice(0,10);
  setValue(next);
  if(detail){const input=document.querySelector(mode==='sales'?'[data-sale-field="date"]':'#tc-date');if(input){input.value=next;input.dispatchEvent(new Event('change',{bubbles:true}))}}
  else transfer.filter[field]=next;
 }}/>
}
window.TRANSFER_DATE={mountAll(scope=document){
 for(const [host,root] of roots)if(!host.isConnected){root.unmount();roots.delete(host)}
 for(const host of scope.querySelectorAll('[data-transfer-date],[data-sales-date]')){
  if(roots.has(host))continue;
  mountDateHost(host,portal=><DateField field={host.dataset.salesDate||host.dataset.transferDate} mode={host.dataset.salesDate?'sales':'transfer'} readonly={host.dataset.salesReadonly==='true'} portal={portal}/>);
 }
},mountLedger(scope){
 for(const [host,root] of roots)if(!host.isConnected){root.unmount();roots.delete(host)}
 for(const host of scope.querySelectorAll('[data-ledger-date],[data-ledger-source]'))if(!roots.has(host))mountDateHost(host,portal=><LedgerField host={host} portal={portal}/>);
},unmountLedger(scope){
 for(const [host,root] of roots)if(scope.contains(host)&&host.matches('[data-ledger-date],[data-ledger-source]')){root.unmount();roots.delete(host)}
}};
