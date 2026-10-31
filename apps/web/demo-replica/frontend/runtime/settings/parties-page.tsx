import { Button, Empty, Input, Modal, Table, Tag } from '@arco-design/web-react';
import { IconSearch } from '@arco-design/web-react/icon';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { PartyClientError, partyLabels, type PartyKind, type PartyRecord } from '../../../../src/parties/contracts.ts';
import type { PartyMaintenanceController, PartyWorkspace } from '../../../../src/parties/controller.ts';
import type { SettingsAuditCapability } from '../../../../src/settings/audit/contracts.ts';
import { Pager, SmallSelect } from './controls.tsx';
import '../../basic-settings-v2.css';
import './settings-runtime.css';

export interface PartyRuntimeProps {
  workspace: PartyWorkspace; readOnly?: true;
  audit?: SettingsAuditCapability & { onAccessFailure: (kind: 'unauthenticated' | 'forbidden') => void };
}
function hasPendingPartyEditorReadback(controller:PartyMaintenanceController):boolean {const state=controller.getSnapshot();return !!state.editor&&state.write.phase==='committed';}
export function hasPendingPartyReadback(workspace:PartyWorkspace):boolean {return (['CUSTOMER','SUPPLIER'] as const).some(kind=>hasPendingPartyEditorReadback(workspace.get(kind)));}
export function PartiesRuntime(props: PartyRuntimeProps & { initialTab?: PartyKind }) {
  const [kind, setKind] = useState<PartyKind>(props.initialTab ?? 'CUSTOMER');
  return <PartyRuntime {...props} kind={kind} tabs={<nav className="bs-tabs" role="tablist" aria-label="往来单位">{(['CUSTOMER','SUPPLIER'] as const).map(tab => <button type="button" role="tab" key={tab} aria-selected={kind===tab} onClick={()=>{ if(tab===kind||hasPendingPartyReadback(props.workspace))return; const active=props.workspace.get(kind); if (!active.canLeave()) { active.requestClose(); return; } setKind(tab); }}>{partyLabels[tab]}</button>)}</nav>}/>;
}
export function CustomerRuntime(props: PartyRuntimeProps) { return <PartyRuntime {...props} kind="CUSTOMER"/>; }
export function SupplierRuntime(props: PartyRuntimeProps) { return <PartyRuntime {...props} kind="SUPPLIER"/>; }
export function PartyRuntime(props: PartyRuntimeProps & { kind: PartyKind; tabs?: React.ReactNode }) {
  if (!props.workspace.scope.active) return null;
  const controller = props.workspace.get(props.kind);
  return <PartyPage key={controller.instanceId} {...props} controller={controller}/>;
}
function PartyPage(props: PartyRuntimeProps & { controller: PartyMaintenanceController; tabs?: React.ReactNode }) {
  const { controller } = props, label = partyLabels[controller.kind];
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const query = useSyncExternalStore(controller.list.subscribe, controller.list.getSnapshot, controller.list.getSnapshot);
  const table = useRef<HTMLDivElement>(null), trigger = useRef<HTMLElement | null>(null), attached = useRef(false), lastCommit = useRef<string | null>(null);
  const [formModule, setFormModule] = useState<typeof import('./party-form.tsx') | null>(null), [formError, setFormError] = useState(false), [formAttempt, setFormAttempt] = useState(0);
  const [auditOpen, setAuditOpen] = useState(false), [auditModule, setAuditModule] = useState<typeof import('./audit-drawer.tsx') | null>(null), [auditError, setAuditError] = useState(false), [auditAttempt, setAuditAttempt] = useState(0);
  const [redacted, setRedacted] = useState(false);
  const [readback,setReadback]=useState<'idle'|'loading'|'error'>('idle'),[readbackAttempt,retryReadback]=useState(0);
  const committed=state.write.phase==='committed'?state.write.result:null;
  const denied = query.phase === 'error' && query.error instanceof PartyClientError && ['forbidden','unauthenticated'].includes(query.error.kind);
  useEffect(() => { if (denied) setRedacted(true); else if (query.phase === 'success') setRedacted(false); }, [denied, query.phase]);
  useEffect(() => {
    attached.current = true; let current = true; const committedOnMount = controller.getSnapshot().write.phase === 'committed';
    queueMicrotask(() => { if (current && !committedOnMount && controller.scope.active) void controller.queryList(controller.executedQuery); });
    return () => { current = false; attached.current = false; controller.suspend(); queueMicrotask(() => { if (!attached.current&&!hasPendingPartyEditorReadback(controller)) controller.leaveRoute(); }); };
  }, [controller]);
  const editorOpen = !!state.editor;
  useEffect(() => {
    if (!editorOpen || formModule) return;
    let active = true; setFormError(false);
    void import('./party-form.tsx').then(module => { if (active && controller.scope.active) setFormModule(module); }, () => { if (active && controller.scope.active) setFormError(true); });
    return () => { active = false; };
  }, [editorOpen, formModule, formAttempt, controller]);
  useEffect(() => {
    if (!auditOpen || auditModule) return;
    let active = true; setAuditError(false);
    void import('./audit-drawer.tsx').then(module => { if (active && controller.scope.active) setAuditModule(module); }, () => { if (active && controller.scope.active) setAuditError(true); });
    return () => { active = false; };
  }, [auditOpen, auditModule, auditAttempt, controller]);
  const restoreFocus = () => queueMicrotask(() => { if (trigger.current?.isConnected) trigger.current.focus({ preventScroll: true }); });
  const wasEditor = useRef(false);
  useEffect(() => { if (wasEditor.current && !state.editor) restoreFocus(); wasEditor.current = !!state.editor; }, [state.editor]);
  useEffect(() => {
    const result = state.write.phase === 'committed' ? state.write.result : null;
    if (result && lastCommit.current !== result.operationId) { lastCommit.current = result.operationId; void controller.queryList(controller.executedQuery); }
  }, [state.write, controller]);
  useEffect(()=>{if(!committed||!state.editor)return;const abort=new AbortController();setReadback('loading');
    void controller.client.detail(controller.kind,committed.partyId,AbortSignal.any([controller.scope.signal,abort.signal])).then(record=>{if(abort.signal.aborted||!controller.scope.active)return;if(record.id===committed.partyId&&record.version>=committed.version&&record.code===committed.code)controller.discardEditor();else setReadback('error');},error=>{if(abort.signal.aborted||!controller.scope.active)return;setReadback('error');if(error instanceof PartyClientError&&(error.kind==='unauthenticated'||error.kind==='forbidden')){controller.scope.dispose();props.audit?.onAccessFailure(error.kind);}});
    return()=>abort.abort();
  },[committed,controller,readbackAttempt]);
  useLayoutEffect(() => { if (table.current && query.phase === 'success') { table.current.scrollTop = controller.tableScroll.top; table.current.scrollLeft = controller.tableScroll.left; } }, [query.phase, query.success, controller]);
  if (state.disposed || !controller.scope.active) return null;
  const current = redacted || denied ? null : query.success, data = current?.data;
  const applied = current?.parameters ?? query.request?.parameters ?? controller.executedQuery;
  const busy = query.phase === 'loading', blocked = props.readOnly === true || controller.hasUnresolvedWrite || !!committed&&!!state.editor;
  const activate = (work: () => void) => { if (blocked) return; trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; work(); };
  const readError = query.error instanceof PartyClientError ? query.error.kind === 'forbidden' ? '无权读取此资料。' : query.error.kind === 'unauthenticated' ? '登录已失效。' : '资料读取失败，请重试。' : '资料读取失败，请重试。';
  return <div id="basic-settings-v2"><section className="bs-page iw-workbench iw-arco-controls runtime-settings"><header className="bs-head iw-head"><h1>{props.tabs ? '往来单位' : label}</h1><div className="bs-head-actions"><Button type="text" disabled={!props.audit} onClick={() => { trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setAuditOpen(true); }}>操作记录</Button><Button type="primary" disabled={blocked} onClick={() => activate(() => { controller.openCreate(); })}>新增{label}</Button></div></header>
    {props.tabs}<div className="bs-toolbar"><div className="bs-filter-fields"><div className="bs-filter search"><Input className="iw-arco-input iw-search-input" size="default" aria-label="搜索名称或编码" placeholder="搜索名称或编码" value={state.filterDraft.search} onChange={search => controller.setFilterDraft({ ...state.filterDraft, search })} suffix={<IconSearch/>} allowClear/></div><div className="bs-filter"><SmallSelect label="状态" value={state.filterDraft.enabled} items={[{ value:'ENABLED',label:'正常' },{ value:'DISABLED',label:'已停用' },{ value:'ALL',label:'全部' }]} onChange={enabled => { if (enabled === 'ALL' || enabled === 'ENABLED' || enabled === 'DISABLED') controller.setFilterDraft({ ...state.filterDraft, enabled }); }}/></div></div>
      <div className="bs-toolbar-actions iw-query-actions"><Button className="btn primary" type="primary" onClick={() => { controller.tableScroll.top = 0; void controller.queryList({ ...state.filterDraft,search:state.filterDraft.search.trim(),page:1,pageSize:applied.pageSize }); }}>查询</Button><Button className="btn iw-reset" onClick={() => { controller.setFilterDraft({search:'',enabled:'ENABLED'});controller.tableScroll.top=0;void controller.queryList({search:'',enabled:'ENABLED',page:1,pageSize:applied.pageSize}); }}>重置</Button></div></div>
    {props.readOnly && <p className="runtime-settings-note" role="status">当前为只读权限，维护保存未开放。</p>}
    {query.phase === 'error' && <div className="runtime-settings-note" role="alert">{readError}{current && ' 仍显示上一次查询结果。'}<Button type="text" onClick={() => { void controller.queryList(query.request?.parameters ?? controller.executedQuery); }}>重试</Button></div>}
    <div ref={table} className="bs-table-wrap iw-arco-table" onScroll={event => { controller.tableScroll.top=event.currentTarget.scrollTop;controller.tableScroll.left=event.currentTarget.scrollLeft; }}><Table<PartyRecord> rowKey="id" size="small" data={[...(data?.items ?? [])]} loading={busy} pagination={false} noDataElement={<Empty description={query.phase==='error'?'资料尚未读取':'暂无符合条件的数据'}/>} columns={[
      {title:'名称',dataIndex:'name'}, {title:'编码',dataIndex:'code'}, {title:'状态',width:100,render:(_,row)=><Tag className={`iw-status ${row.enabled?'normal':'off'}`}>{row.enabled?'正常':'已停用'}</Tag>}, {title:'操作',width:76,render:(_,row)=><div className="bs-row-actions"><Button type="text" size="small" disabled={blocked||busy} onClick={()=>activate(()=>{void controller.openExisting(row.id,'EDIT');})}>编辑</Button></div>}
    ]}/></div>
    <Pager total={data?.total??0} page={applied.page} size={applied.pageSize} disabled={busy} onPage={page=>{void controller.queryList({...applied,page});}} onSize={pageSize=>{void controller.queryList({...applied,page:1,pageSize});}}/>
    {state.write.phase!=='committed' && state.editor && (!props.readOnly || controller.hasUnresolvedWrite) && (formModule ? <formModule.default controller={controller}/> : <Modal visible className="bs-modal iw-arco-modal iw-arco-controls" title={`${state.editor.action==='CREATE'?'新增':'编辑'}${label}`} maskClosable={false} autoFocus={false} onCancel={()=>{controller.discardEditor();}} footer={<Button onClick={()=>{controller.discardEditor();}}>取消</Button>}>
      <p role={formError?'alert':'status'}>{formError?'维护表单暂未加载，输入已保留。':'正在准备维护表单…'}{formError&&<Button type="text" onClick={()=>setFormAttempt(value=>value+1)}>重试加载表单</Button>}</p></Modal>)}
    {committed&&state.editor&&<Modal visible className="bs-modal iw-arco-modal iw-arco-controls" title={`${label}保存已确认`} maskClosable={false} closable={false} onCancel={()=>{}} footer={<Button disabled>关闭</Button>}><p role={readback==='error'?'alert':'status'}>{readback==='error'?'当前资料读回失败，请重试读取。':'正在重新读取当前资料…'}</p>{readback==='error'&&<Button onClick={()=>retryReadback(value=>value+1)}>重试读取</Button>}</Modal>}
    {auditOpen&&props.audit&&(auditModule?<auditModule.default scope={controller.scope} capability={props.audit} onAccessFailure={props.audit.onAccessFailure} close={()=>{setAuditOpen(false);restoreFocus();}}/>:<Modal visible title="基础设置操作记录" maskClosable={false} onCancel={()=>{setAuditOpen(false);restoreFocus();}} footer={<Button onClick={()=>{setAuditOpen(false);restoreFocus();}}>取消</Button>}><p role={auditError?'alert':'status'}>{auditError?'操作记录暂未加载。':'正在读取操作记录…'}{auditError&&<Button type="text" onClick={()=>setAuditAttempt(value=>value+1)}>重试加载</Button>}</p></Modal>)}
  </section></div>;
}
