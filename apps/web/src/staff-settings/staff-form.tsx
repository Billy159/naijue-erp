import { Button, Checkbox, Input, Modal, Select, Switch } from '@arco-design/web-react';
import { useEffect, useReducer, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { StaffSettingsProps } from './contracts.ts';
import { staffRejectionMessage, type StaffSettingsController } from './controller.ts';
import { SettingsField, SettingsReferenceSelect } from '../settings/stores/maintenance-form.tsx';
export function StaffSettingsForm(props: StaffSettingsProps & { readonly controller: StaffSettingsController; readonly close: () => void }) {
  const { controller } = props, state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot), draft = state.draft;
  const [password, setPassword] = useState('');
  useEffect(() => {
    const clear = () => { setPassword(''); controller.passwordInputDetached(); };
    props.scope.signal.addEventListener('abort', clear); controller.scope.signal.addEventListener('abort', clear);
    return () => { props.scope.signal.removeEventListener('abort', clear); controller.scope.signal.removeEventListener('abort', clear); setPassword(''); controller.passwordInputDetached(); };
  }, [controller, props.scope]);
  const enterPassword = (value: string) => { setPassword(value); controller.setPasswordIntent(value.length > 0); };
  const submit = () => { const transient = password; setPassword(''); void controller.submit(transient); };
  const cancelPasswordReset = () => { setPassword(''); controller.cancelPasswordReset(); };
  const toggleLogin = (loginEnabled: boolean) => { if (!controller.record?.account && !loginEnabled) setPassword(''); controller.update({ loginEnabled, ...(!controller.record?.account && !loginEnabled ? { loginName: '' } : {}) }); };
  if (!draft || !props.scope.active) return null;
  const editing = controller.record !== null, hadAccount = controller.record?.account !== null && controller.record?.account !== undefined;
  const roles = props.roles.map(role => ({ value: role.value, label: role.label }));
  if (draft.role && !roles.some(role => role.value === draft.role)) roles.push({ value: draft.role, label: '角色未提供' });
  if (controller.intent !== 'edit') return <StaffSettingsModal title={controller.intent === 'LEAVE' ? '确认办理离职' : '确认恢复在职'} controller={controller} close={props.close} submit={submit} passwordReady={password.length > 0} cancelPasswordReset={cancelPasswordReset}>
    <p>{controller.intent === 'LEAVE' ? `确定为「${controller.record?.name}」办理离职？办理后登录权限关闭，员工资料、登录账号和历史单据继续保留。恢复在职后登录权限仍保持关闭。` : `确定恢复「${controller.record?.name}」在职？登录权限仍保持关闭，需要登录时请在编辑员工中手工开通。`}</p>
    {state.errors.employment && <p role="alert">{state.errors.employment}</p>}
  </StaffSettingsModal>;
  return <StaffSettingsModal title={`${editing ? '编辑' : '新增'}员工`} controller={controller} close={props.close} submit={submit} passwordReady={password.length > 0} cancelPasswordReset={cancelPasswordReset}>
    <div className="bs-form-fields bs-staff-fields iw-form-fields">
      <SettingsField label="姓名" required error={state.errors.name}><Input className="iw-arco-input" disabled={controller.locked} aria-label="姓名" value={draft.name} onChange={name => controller.update({ name })} autoComplete="off" /></SettingsField>
      <SettingsField label="角色" required error={state.errors.role}><StaffRoleSelect scope={props.scope} value={draft.role} options={roles} disabled={controller.locked || !props.roles.length} onChange={role => { if (props.roles.some(item => item.value === role)) controller.update({ role }); }} /></SettingsField>
      <SettingsField label="所属营业厅" required={draft.role === 'SALESPERSON' || props.roles.some(role => role.value === draft.role && role.requiresHall)} error={state.errors.hall}><SettingsReferenceSelect disabled={controller.locked} scope={props.scope} reader={props.directory} kind="halls" label="所属营业厅" selected={draft.hall ? [draft.hall] : []} required={draft.role === 'SALESPERSON' || props.roles.some(role => role.value === draft.role && role.requiresHall)} onChange={items => controller.update({ hall: items[0] ?? null })} /></SettingsField>
      <SettingsField label="联系方式" error={state.errors.contact}><Input className="iw-arco-input" disabled={controller.locked} aria-label="联系方式" value={draft.contact} onChange={contact => controller.update({ contact })} autoComplete="off" /></SettingsField>
      {!editing && <div className="bs-wide"><Checkbox disabled={controller.locked} checked={draft.loginEnabled} onChange={toggleLogin}>同步开通登录账号</Checkbox></div>}
      {editing && !hadAccount && !draft.loginEnabled && <SettingsField label="登录账号"><div className="bs-readonly">未开通</div></SettingsField>}
      {(hadAccount || draft.loginEnabled) && <SettingsField label="登录账号" required error={state.errors.loginName}><Input className="iw-arco-input" disabled={controller.locked} aria-label="登录账号" value={draft.loginName} onChange={loginName => controller.update({ loginName })} autoComplete="off" /></SettingsField>}
      {!hadAccount && draft.loginEnabled && <SettingsField label="初始密码" required error={state.errors.password}><Input.Password className="iw-arco-input" disabled={controller.locked} aria-label="初始密码" value={password} onChange={enterPassword} autoComplete="new-password" /></SettingsField>}
      {editing && hadAccount && <SettingsField label="重置密码" error={state.errors.password}><Input.Password className="iw-arco-input" disabled={controller.locked} aria-label="重置密码" value={password} onChange={enterPassword} placeholder="留空保留原密码" autoComplete="new-password" /></SettingsField>}
      {editing && <SettingsField label="登录权限" error={state.errors.loginEnabled}><div className="bs-switch"><Switch aria-label="登录权限" checked={draft.loginEnabled} disabled={controller.locked || controller.record?.employmentStatus === '离职'} onChange={toggleLogin} /><span>{draft.loginEnabled ? '已开通' : '已关闭'}</span></div></SettingsField>}
    </div>
  </StaffSettingsModal>;
}

function StaffSettingsModal(props: { readonly title: string; readonly controller: StaffSettingsController; readonly close: () => void; readonly children: ReactNode; readonly submit: () => void; readonly passwordReady: boolean; readonly cancelPasswordReset: () => void }) {
  const { controller } = props, state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot), write = state.write;
  if (state.disposed) return null;
  return <Modal className="bs-modal store-settings-modal settings-preparation-modal bs-modal-staff iw-arco-modal iw-arco-controls"
    visible title={props.title} maskClosable={false} autoFocus={false} focusLock okText="确定" cancelText={write.phase === 'committed' ? '关闭' : '取消'}
    okButtonProps={{ disabled: !controller.writesEnabled || controller.locked || Boolean(controller.intent === 'edit' && controller.record && !state.dirty), loading: write.phase === 'submitting' }}
    onOk={props.submit} onCancel={() => { if (controller.requestClose()) props.close(); }}>
    <div onBlur={() => { if (!controller.locked) controller.validate(props.passwordReady); }}>{props.children}</div>
    {!controller.writesEnabled && !controller.hasUnresolvedWrite && write.phase !== 'committed' && <p className="settings-note" role="status">此版本暂未开放保存，填写的内容不会保存。</p>}
    {(write.phase === 'submitting' || write.phase === 'recovering') && <p className="settings-note" role="status">{write.phase === 'submitting' ? '正在保存，请等待结果。' : '正在查询原提交的回执…'}</p>}
    {write.phase === 'committed' && <p className="settings-note" role="status">保存成功。{state.readback.phase === 'loading' ? '正在读取最新员工与账号资料…' : state.readback.phase === 'ready' ? '已读取最新员工与账号资料。' : ''}</p>}
    {write.phase === 'committed' && state.readback.phase === 'error' && <p className="settings-note" role="alert">最新资料读取失败，已保存的结果不受影响。<Button onClick={() => { void controller.readback(); }}>重新读取资料</Button></p>}
    {write.phase === 'rejected' && <p className="settings-note" role="alert">{staffRejectionMessage(write.error?.code ?? '')}</p>}
    {write.phase === 'rejected' && state.needsPasswordReentry && <p className="settings-note" role="alert">本次输入的密码已清除，请重新输入。{controller.record?.account && <Button onClick={props.cancelPasswordReset}>取消本次改密</Button>}</p>}
    {write.phase === 'uncertain' && <section className="settings-note" role="alert"><p>提交结果尚未确认，请勿重复保存。{state.needsPasswordReentry ? '输入的密码已清除，将按原提交查询结果。' : '请查询原提交的回执。'}</p>
      {write.error?.code === 'RECEIPT_NOT_FOUND' && <p>暂未查到原回执，仍不能确定是否已保存。</p>}
      {write.error?.kind === 'forbidden' && <p>当前无权读取原回执，提交结果仍待确认。</p>}
      <Button onClick={() => { void controller.recover(); }}>查询原提交回执</Button></section>}
    {state.closePrompt && <section className="settings-close-prompt" role="alert"><strong>放弃本次填写？</strong><p>关闭后将清除本次未保存的内容。</p><div className="bs-row-actions">
      <Button onClick={() => controller.keepEditing()}>继续填写</Button><Button onClick={() => { if (controller.discard()) props.close(); }}>放弃本次填写</Button>
    </div></section>}
  </Modal>;
}

/** Keep the role popup inside its form; refresh the existing Arco portal after StrictMode replay. */
function StaffRoleSelect(props: { readonly scope: StaffSettingsProps['scope']; readonly value: string; readonly options: readonly { readonly value: string; readonly label: string }[]; readonly disabled: boolean; readonly onChange: (value: string) => void }) {
  const host = useRef<HTMLDivElement>(null), [open, setOpen] = useState(false), [, refreshPortal] = useReducer((value: number) => value + 1, 0);
  useEffect(() => { if (props.disabled || !props.scope.active) setOpen(false); }, [props.disabled, props.scope]);
  useEffect(() => { if (!open || props.disabled) return; let active = true; queueMicrotask(() => { if (active) refreshPortal(); }); return () => { active = false; }; }, [open, props.disabled]);
  return <div ref={host} className="settings-single"><Select aria-label="角色" value={props.value} options={[...props.options]} placeholder="请选择" disabled={props.disabled || !props.scope.active}
    popupVisible={open && !props.disabled && props.scope.active} unmountOnExit
    getPopupContainer={() => { if (!host.current) throw new Error('Staff role host is not mounted'); return host.current; }}
    onVisibleChange={visible => { if (props.scope.active && !props.disabled) setOpen(visible); }}
    onChange={(value: string) => { if (props.scope.active && open && !props.disabled && props.options.some(option => option.value === value)) { setOpen(false); props.onChange(value); } }} /></div>;
}
