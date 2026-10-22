import { Checkbox, Input, Select, Switch } from '@arco-design/web-react';
import { useSyncExternalStore } from 'react';
import type { StaffSettingsProps } from './contracts.ts';
import type { StaffSettingsController } from './controller.ts';
import { SettingsField, SettingsPreparationModal, SettingsReferenceSelect } from '../settings/stores/maintenance-form.tsx';
export function StaffSettingsForm(props: StaffSettingsProps & { readonly controller: StaffSettingsController; readonly close: () => void }) {
  const { controller } = props, state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot), draft = state.draft;
  if (!draft || !props.scope.active) return null;
  const editing = controller.record !== null, hadAccount = controller.record?.account !== null && controller.record?.account !== undefined;
  const roles = props.roles.map(role => ({ value: role.value, label: role.label }));
  if (draft.role && !roles.some(role => role.value === draft.role)) roles.push({ value: draft.role, label: '角色未提供' });
  return <SettingsPreparationModal title={`${editing ? '编辑' : '新增'}员工`} controller={controller} close={props.close} staff>
    <div className="bs-form-fields bs-staff-fields iw-form-fields">
      <SettingsField label="姓名" required error={state.errors.name}><Input className="iw-arco-input" aria-label="姓名" value={draft.name} onChange={name => controller.update({ name })} autoComplete="off" /></SettingsField>
      <SettingsField label="角色" required error={state.errors.role}><Select aria-label="角色" value={draft.role} options={roles} placeholder="请选择" disabled={!props.roles.length} onChange={(role: string) => { if (props.roles.some(item => item.value === role)) controller.update({ role }); }} /></SettingsField>
      <SettingsField label="所属营业厅" required={props.roles.some(role => role.value === draft.role && role.requiresHall)} error={state.errors.hall}><SettingsReferenceSelect scope={props.scope} reader={props.directory} kind="halls" label="所属营业厅" selected={draft.hall ? [draft.hall] : []} required={props.roles.some(role => role.value === draft.role && role.requiresHall)} onChange={items => controller.update({ hall: items[0] ?? null })} /></SettingsField>
      <SettingsField label="联系方式"><Input className="iw-arco-input" aria-label="联系方式" value={draft.contact} onChange={contact => controller.update({ contact })} autoComplete="off" /></SettingsField>
      {!editing && <div className="bs-wide"><Checkbox checked={draft.loginEnabled} onChange={loginEnabled => controller.update({ loginEnabled, ...(!loginEnabled ? { loginName: '', password: '' } : {}) })}>同步开通登录账号</Checkbox></div>}
      {editing && !hadAccount && !draft.loginEnabled && <SettingsField label="登录账号"><div className="bs-readonly">未开通</div></SettingsField>}
      {(hadAccount || draft.loginEnabled) && <SettingsField label="登录账号" required error={state.errors.loginName}><Input className="iw-arco-input" aria-label="登录账号" value={draft.loginName} onChange={loginName => controller.update({ loginName })} autoComplete="off" /></SettingsField>}
      {!hadAccount && draft.loginEnabled && <SettingsField label="初始密码" required error={state.errors.password}><Input.Password className="iw-arco-input" aria-label="初始密码" value={draft.password} onChange={password => controller.update({ password })} autoComplete="new-password" /></SettingsField>}
      {editing && hadAccount && <SettingsField label="重置密码"><Input.Password className="iw-arco-input" aria-label="重置密码" value={draft.password} onChange={password => controller.update({ password })} placeholder="留空保留原密码" autoComplete="new-password" /></SettingsField>}
      {editing && <SettingsField label="登录权限" error={state.errors.loginEnabled}><div className="bs-switch"><Switch aria-label="登录权限" checked={draft.loginEnabled} disabled={controller.record?.employmentStatus === '离职'} onChange={loginEnabled => controller.update({ loginEnabled, ...(!hadAccount && !loginEnabled ? { loginName: '', password: '' } : {}) })} /><span>{draft.loginEnabled ? '已开通' : '已关闭'}</span></div></SettingsField>}
    </div>
  </SettingsPreparationModal>;
}
