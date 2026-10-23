import { Modal, Input, Button, Switch } from '@arco-design/web-react';
import { useSyncExternalStore } from 'react';
import { partyLabels } from './contracts.ts';
import type { PartyMaintenanceController } from './controller.ts';
import { validName } from './response-validation.ts';


/** Frozen Fields/Modal layout, with independent identity and atomic native EDIT.
 * Recovery controls are shown only for real lifecycle failures, never fake data. */
export function PartyForm(props: { readonly controller: PartyMaintenanceController; readonly getPopupContainer: () => HTMLElement }) {
  const { controller } = props; const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const editor = state.editor; const write = state.write; const label = partyLabels[controller.kind];
  if (!editor || state.disposed || !controller.scope.active) return null;
  const verb = { CREATE: '新增', EDIT: '编辑', DISABLE: '停用', RESTORE: '恢复' }[editor.action]; const editing = editor.action === 'CREATE' || editor.action === 'EDIT';
  const pending = ['submitting', 'checking', 'replaying'].includes(write.phase); const uncertain = write.phase === 'uncertain'; const locked = pending || uncertain || editor.phase !== 'ready';
  const unchanged = editor.action === 'EDIT' && editor.record?.name === editor.draftName && editor.record.enabled === editor.draftEnabled;
  const incompatible = editor.action === 'DISABLE' && !editor.record?.enabled || editor.action === 'RESTORE' && editor.record?.enabled;
  return <Modal className="demo-ui demo-settings-modal bs-modal iw-arco-modal iw-arco-controls party-modal" visible title={`${verb}${label}`} getPopupContainer={props.getPopupContainer} onCancel={() => { controller.requestClose(); }} onOk={() => { void controller.submit(); }} confirmLoading={pending} okText="确定" cancelText="取消" maskClosable={false} autoFocus={false} focusLock
    okButtonProps={{ disabled: locked || editing && !validName(editor.draftName) || unchanged || !!incompatible || !!editor.current || editor.record !== null && editor.record.version >= 2147483647 }}>
    {editor.phase === 'loading' && <p role="status">正在读取当前{label}…</p>}
    {editor.phase === 'error' && <p className="bs-error" role="alert">当前资料读取失败，不能提交；已输入内容未改变。<Button type="text" onClick={() => { void controller.retryDetail(); }}>重试资料</Button></p>}
    <div className="bs-form-fields iw-form-fields">
      {editing ? <div className="bs-field iw-form-field" role="group" aria-label="名称"><span>名称<i> *</i></span><Input className="iw-arco-input" aria-label={`${label}名称`} value={editor.draftName} maxLength={2048} disabled={locked} onChange={value => controller.editName(value)} autoComplete="off" /></div> : <div className="bs-field iw-form-field"><span>名称</span><div className="bs-readonly">{editor.record?.name ?? '尚未读取'}</div></div>}
      <div className="bs-field iw-form-field" role="group" aria-label="编码"><span>编码</span><div className="bs-readonly party-code" role="textbox" aria-label={`${label}编码`} aria-readonly="true">{editor.record?.code ?? '保存后生成'}</div></div>
      {editor.action === 'EDIT' && <div className="bs-field iw-form-field" role="group" aria-label="使用状态"><span>使用状态</span><div className="bs-switch"><Switch aria-label="使用状态" checked={editor.draftEnabled} disabled={locked} onChange={value => controller.editEnabled(value)} /><span>{editor.draftEnabled ? '正常' : '已停用'}</span></div></div>}
    </div>
    {!editing && editor.phase === 'ready' && <p>{editor.action === 'DISABLE' ? `确认停用此${label}？历史引用保留。` : `确认恢复此${label}？`}</p>}
    {state.notice && <p className="bs-error" role="alert">{state.notice}</p>}
    {pending && <p role="status">{write.phase === 'checking' ? '正在查询原操作回执…' : write.phase === 'replaying' ? '正在重放原请求，名称、状态及版本均未改变…' : '正在提交，请勿重复操作…'}</p>}
    {uncertain && <section className="party-recovery" aria-label="原操作恢复"><strong>结果待核实</strong><p>断线、停止等待或暂未查到回执，都不代表操作未提交。名称、使用状态、目标版本及原请求已锁定，不会自动重试或另建编号。</p><div className="iw-actions"><Button onClick={() => { void controller.checkReceipt(); }}>查询原操作回执</Button><Button onClick={() => { void controller.replayOriginal(); }}>重放原请求</Button></div></section>}
    {write.phase === 'rejected' && editor.id && <Button disabled={editor.phase === 'loading'} onClick={() => { void controller.readCurrent(); }}>读取最新状态</Button>}
    {editor.current && <section className="party-current" aria-label="服务器当前状态"><strong>刚读取的服务器状态</strong><dl><dt>编码</dt><dd className="party-code">{editor.current.code}</dd><dt>名称</dt><dd>{editor.current.name}</dd><dt>状态 / 版本</dt><dd>{editor.current.enabled ? '正常' : '已停用'} / {editor.current.version}</dd></dl><p>您的名称与使用状态草稿未被覆盖，确认比较后才能重新准备。</p><Button onClick={() => controller.prepareCurrentVersion()}>按最新版本重新准备</Button></section>}
    {editor.closePrompt && <section className="party-close-confirm" role="alert"><strong>放弃本次填写？</strong><p>本次未保存的内容将丢弃，已保存的资料保持不变。</p><div className="iw-actions"><Button onClick={() => controller.keepEditing()}>继续填写</Button><Button onClick={() => controller.discardEditor()}>放弃本次填写</Button></div></section>}
  </Modal>;
}
