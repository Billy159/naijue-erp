import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Alert,Button,Checkbox,ConfigProvider,Input,Modal,Table,Tag} from '@arco-design/web-react';
import arcoCss from '@arco-design/web-react/dist/css/arco.css?inline';
import localCss from './reference-import.css?inline';
import {createReferenceImportController} from './reference-import-service.mjs';
const host=document.createElement('div');host.id='reference-import-host';document.body.append(host);
const shadow=host.attachShadow({mode:'open'}),style=document.createElement('style'),mount=document.createElement('div'),portal=document.createElement('div');
style.textContent=arcoCss.replace(/\bbody\s*\{/g,':host {')+localCss;shadow.append(style,mount,portal);
const client=window.ERP_API,controller=createReferenceImportController(client);
const labels={product:'商品',sku:'原 SKU',halls:'营业厅',warehouses:'仓库',parties:'往来单位',payments:'收款方式',fundAccounts:'资金账户'};
const statuses={READY:'待确认',UNCHANGED:'相同资料，跳过',FAILED:'失败',COMMITTED:'已提交',SKIPPED:'未选择'};
function ReferenceImport(){const [s,set]=useState({...controller.state}),[confirmation,setConfirmation]=useState(false),[lookup,setLookup]=useState(''),[fileError,setFileError]=useState('');
 useEffect(()=>controller.subscribe(set),[]);
 const run=work=>work().catch(()=>{}),rows=s.result?.rows||s.preview?.rows||[];
 const columns=[{title:'来源行',dataIndex:'rowKey',width:95},{title:'类型',render:(_,r)=>labels[r.kind]||r.kind,width:90},{title:'资料 / 原规格',dataIndex:'label',width:210},{title:'原身份',dataIndex:'targetId',width:225},
   {title:'启停',render:(_,r)=>r.enabled===null?'保留原状态':r.enabled?'启用':'停用',width:90},{title:'结果',render:(_,r)=><Tag color={r.status==='FAILED'?'red':r.status==='COMMITTED'?'green':'gray'}>{statuses[r.status]}</Tag>,width:135},
   {title:'原因',dataIndex:'message',width:260},{title:'来源',render:(_,r)=>r.source?.name,width:160}];
 const file=async event=>{try{const f=event.target.files[0];if(!f)return;if(f.size>900000)throw new Error('文件超过 900KB，请按每批最多 100 行分批');controller.load(JSON.parse(await f.text()));setFileError('');setConfirmation(false);}catch(error){setFileError(error.message);}event.target.value='';};
 return <ConfigProvider size="small"><Modal visible={s.visible} title="必要资料导入" style={{width:'min(1140px, calc(100vw - 40px))'}} className="ri-modal" getPopupContainer={()=>portal} getChildrenPopupContainer={()=>portal}
   maskClosable={false} closable={!s.busy} escToExit={!s.busy} onCancel={()=>controller.close()} footer={<div className="ri-footer"><Button disabled={s.busy} onClick={()=>controller.close()}>关闭</Button>
   {s.pendingId?<Button type="primary" loading={s.busy} onClick={()=>run(()=>controller.recover())}>查询原请求</Button>:!s.result&&<><Button disabled={!s.batch||s.busy} loading={s.busy&&!s.preview} onClick={()=>{setConfirmation(false);run(()=>controller.preflight());}}>预检资料</Button><Button type="primary" disabled={s.busy||!s.preview||!s.selected.length||!confirmation} loading={s.busy&&!!s.preview} onClick={()=>run(()=>controller.confirm())}>确认提交 {s.selected.length} 行</Button></>}</div>}>
   <p className="ri-intro">先预检，再选择通过的行提交。库存期初与历史累计使用独立迁移入口。</p>
   <div className="ri-toolbar"><label className="ri-file">选择资料文件<input aria-label="资料导入文件" type="file" accept=".json,application/json" disabled={s.busy||!!s.pendingId} onChange={file}/></label><Button onClick={()=>{const content={batchId:'填写唯一批次编号',source:{name:'原资料文件名',sha256:'填写原资料文件的64位SHA256'},rows:[{rowKey:'Sheet1:2',kind:'payments',payload:{id:crypto.randomUUID(),expectedVersion:0,body:{code:'NEW-PAYMENT',name:'新收款方式',enabled:true}}}]};const url=URL.createObjectURL(new Blob([JSON.stringify(content,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='资料导入模板.json';a.click();URL.revokeObjectURL(url);}}>下载模板</Button><span>JSON · 每批最多 100 行</span></div>
   {s.batch&&<div className="ri-meta"><span>批次：{s.batch.batchId}</span><span>来源：{s.batch.source?.name}</span><code>SHA-256：{s.batch.source?.sha256}</code></div>}
   {(fileError||s.error)&&<Alert type="error" content={fileError||s.error}/>}
   {s.pendingId&&<Alert type="warning" content={'提交结果待核实，请查询原请求：'+s.pendingId}/>}
   {s.result&&<Alert type="success" content={'批次 '+s.result.batchId+' 已回读。提交 '+rows.filter(r=>r.status==='COMMITTED').length+' 行，跳过 '+rows.filter(r=>r.status==='UNCHANGED'||r.status==='SKIPPED').length+' 行，失败 '+rows.filter(r=>r.status==='FAILED').length+' 行。'}/>}
   <Table rowKey="rowKey" columns={columns} data={rows} size="small" scroll={{x:1365,y:310}} pagination={{pageSize:20}} rowSelection={!s.result&&s.preview&&!s.pendingId?{selectedRowKeys:s.selected,onChange:keys=>{setConfirmation(false);controller.select(keys);},checkboxProps:r=>({disabled:s.busy||r.status==='FAILED'})}:undefined}/>
   {s.preview&&!s.result&&<Checkbox checked={confirmation} disabled={s.busy||!!s.pendingId} onChange={setConfirmation}>已核对选中行的身份、来源及启停状态，确认导入</Checkbox>}
   <div className="ri-lookup"><Input aria-label="查询导入批次" value={lookup} onChange={setLookup} placeholder="已提交批次编号" disabled={s.busy}/><Button disabled={!lookup.trim()||s.busy} onClick={()=>run(()=>controller.lookup(lookup.trim()))}>查询批次结果</Button></div>
   <p className="ri-hint">引用资料先分批提交，再导入引用它们的商品或 SKU。账号与图片通过各自受控入口维护。</p>
 </Modal></ConfigProvider>;
}
createRoot(mount).render(<ReferenceImport/>);window.REFERENCE_IMPORT=controller;
document.addEventListener('click',event=>{if(event.target.closest('[data-reference-import-open]')){controller.restorePending();controller.open();}});
