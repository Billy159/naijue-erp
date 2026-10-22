import { Button, Input, Modal, Select, Switch } from '@arco-design/web-react';
import { useEffect, useReducer, useRef, useState, useSyncExternalStore, type ComponentProps, type ComponentType } from 'react';
import { LatestQuery } from '../loading/latest-query.ts';
import { HttpQueryError } from '../transport/http-query.ts';
import type { StaffSettingsPage, StaffSettingsQuery } from '../staff-settings/contracts.ts';
import { SettingsField } from '../settings/stores/maintenance-form.tsx';
import type { AccountSettingsProps, AccountStaffCandidate } from './contracts.ts';
import { accountStaffCandidate } from './response-validation.ts';
import { accountRejectionMessage, type AccountSettingsController } from './controller.ts';
// Same Arco runtime, including its supported controlled-empty value.
const AccountSourceSelect = Select as ComponentType<Omit<ComponentProps<typeof Select>, 'value'> & { readonly value: ComponentProps<typeof Select>['value'] }>;
const titles = { CREATE: '新增登录账号', EDIT: '编辑登录账号', DISABLE: '确认禁用账号', RESTORE: '确认启用账号', RESET_PASSWORD: '重置密码' };
export function AccountSettingsForm(props: AccountSettingsProps & { readonly controller: AccountSettingsController; readonly close: () => void }) {
  const { controller } = props, state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot), draft = state.draft, write = state.write;
  const [password, setPassword] = useState('');
  useEffect(() => {
    const clear = () => { setPassword(''); controller.passwordInputDetached(); };
    props.scope.signal.addEventListener('abort', clear); controller.scope.signal.addEventListener('abort', clear);
    return () => { props.scope.signal.removeEventListener('abort', clear); controller.scope.signal.removeEventListener('abort', clear); setPassword(''); controller.passwordInputDetached(); };
  }, [controller, props.scope]);
  if (!draft || !props.scope.active) return null;
  const full = controller.intent === 'CREATE' || controller.intent === 'EDIT', secret = controller.intent === 'CREATE' || controller.intent === 'RESET_PASSWORD';
  const role = props.roles.find(item => item.value === draft.staff?.role)?.label ?? '未提供';
  return <Modal className="bs-modal demo-settings-modal iw-arco-modal iw-arco-controls" visible title={titles[controller.intent]} maskClosable={false} autoFocus={false} focusLock
    okText="确定" cancelText={write.phase === 'committed' ? '关闭' : '取消'}
    okButtonProps={{ disabled: !controller.writesEnabled || controller.locked || controller.intent === 'EDIT' && !state.dirty, loading: write.phase === 'checking' || write.phase === 'submitting' }}
    onOk={() => { const transient = password; setPassword(''); void controller.submit(transient); }} onCancel={() => { if (controller.requestClose()) props.close(); }}>
    <div className="bs-form-fields iw-form-fields" onBlur={() => { if (!controller.locked) controller.validate(password.length > 0); }}>
      <SettingsField label="所属员工" required={controller.intent === 'CREATE'} error={state.errors.staff}>
        {controller.intent === 'CREATE' ? <AccountStaffPicker {...props} selected={draft.staff} disabled={controller.locked} onChange={staff => controller.selectStaff(staff)} /> : <div className="bs-readonly">{draft.staff?.name ?? '未提供'}</div>}
      </SettingsField>
      {draft.staff && <SettingsField label="员工资料"><div className="bs-readonly">{role} · {draft.staff.employmentStatus || '未提供'}</div></SettingsField>}
      <SettingsField label="登录账号" required={full} error={state.errors.loginName}>{full ? <Input className="iw-arco-input" aria-label="登录账号" disabled={controller.locked} autoComplete="off" value={draft.loginName} onChange={loginName => controller.update({ loginName })} /> : <div className="bs-readonly">{draft.loginName}</div>}</SettingsField>
      {secret && <SettingsField label={controller.intent === 'CREATE' ? '初始密码' : '新密码'} required error={state.errors.password}><Input.Password className="iw-arco-input" aria-label={controller.intent === 'CREATE' ? '初始密码' : '新密码'} disabled={controller.locked} value={password} autoComplete="new-password" onChange={value => { setPassword(value); controller.setPasswordIntent(value.length > 0); }} /></SettingsField>}
      {full && <SettingsField label="登录权限" error={state.errors.loginEnabled}><div className="bs-switch"><Switch aria-label="登录权限" disabled={controller.locked} checked={draft.loginEnabled} onChange={loginEnabled => controller.update({ loginEnabled })} /><span>{draft.loginEnabled ? '已开通' : '已关闭'}</span></div></SettingsField>}
    </div>
    {controller.intent === 'DISABLE' && <p>确定禁用此账号？员工与历史资料继续保留，原登录会话将失效。</p>}
    {controller.intent === 'RESTORE' && <p>确定启用此账号？需要员工仍在职且角色、营业厅可用。</p>}
    {controller.intent === 'RESET_PASSWORD' && <p>确定后使用新密码，原登录会话将失效。</p>}
    {state.errors.state && <p role="alert" className="settings-note">{state.errors.state}</p>}
    {!controller.writesEnabled && !controller.hasUnresolvedWrite && write.phase !== 'committed' && <p role="status" className="settings-note">此版本暂未开放保存，填写的内容不会保存。</p>}
    {(write.phase === 'checking' || write.phase === 'submitting' || write.phase === 'recovering') && <p role="status" className="settings-note">{write.phase === 'checking' ? '正在核对员工当前账号…' : write.phase === 'submitting' ? '正在保存，请等待结果。' : '正在查询原提交的回执…'}</p>}
    {write.phase === 'committed' && <p role="status" className="settings-note">保存成功。{state.readback.phase === 'ready' ? '已读取最新账号资料。' : state.readback.phase === 'loading' ? '正在读取最新账号资料…' : ''}</p>}
    {write.phase === 'committed' && state.readback.phase === 'error' && <p role="alert" className="settings-note">最新资料读取失败，已保存的结果不受影响。<Button onClick={() => { void controller.readback(); }}>重新读取资料</Button></p>}
    {write.phase === 'rejected' && <p role="alert" className="settings-note">{accountRejectionMessage(write.error?.code ?? '')}{state.needsPasswordReentry ? ' 本次输入的密码已清除，请重新输入。' : ''}</p>}
    {write.phase === 'uncertain' && <section role="alert" className="settings-note"><p>提交结果尚未确认，请勿重复保存，请查询原提交回执。</p>
      {write.error?.code === 'RECEIPT_NOT_FOUND' && <p>暂未查到原回执，仍不能确定是否已保存。</p>}{write.error?.kind === 'forbidden' && <p>当前无权读取原回执，提交结果仍待确认。</p>}
      <Button onClick={() => { void controller.recover(); }}>查询原提交回执</Button></section>}
    {state.closePrompt && <section role="alert" className="settings-close-prompt"><strong>放弃本次填写？</strong><p>关闭后将清除本次未保存的内容。</p><div className="bs-row-actions"><Button onClick={() => controller.keepEditing()}>继续填写</Button><Button onClick={() => { if (controller.discard()) props.close(); }}>放弃本次填写</Button></div></section>}
  </Modal>;
}
const empty = Object.freeze({ phase: 'idle' as const, request: null, success: null, error: null });
const noSubscribe = () => () => {};
function AccountStaffPicker(props: AccountSettingsProps & { readonly selected: AccountStaffCandidate | null; readonly disabled: boolean; readonly onChange: (staff: AccountStaffCandidate) => void }) {
  const [binding, setBinding] = useState<{ readonly query: LatestQuery<StaffSettingsQuery, StaffSettingsPage>; readonly reader: NonNullable<AccountSettingsProps['staffReader']>; readonly scope: AccountSettingsProps['scope'] } | null>(null);
  const [open, setOpen] = useState(false), host = useRef<HTMLDivElement>(null), [, refreshPortal] = useReducer((value: number) => value + 1, 0);
  useEffect(() => { if (!props.staffReader || !props.scope.active) { setBinding(null); return; } const reader = props.staffReader, query = new LatestQuery<StaffSettingsQuery, StaffSettingsPage>({ scope: props.scope, execute: read => reader.readList(read) }); setBinding({ query, reader, scope: props.scope }); return () => query.dispose(); }, [props.scope, props.staffReader]);
  const query = binding?.scope === props.scope && binding.reader === props.staffReader ? binding.query : null;
  const state = useSyncExternalStore(query?.subscribe ?? noSubscribe, query?.getSnapshot ?? (() => empty), query?.getSnapshot ?? (() => empty));
  const active = props.scope.active && !props.disabled;
  useEffect(() => { if (!active) setOpen(false); }, [active]);
  useEffect(() => { if (!open || !active) return; let alive = true; queueMicrotask(() => { if (alive) refreshPortal(); }); return () => { alive = false; }; }, [open, active]);
  useEffect(() => { const error = state.error; if (error instanceof HttpQueryError && (error.kind === 'unauthenticated' || error.kind === 'forbidden')) { if (error.kind === 'forbidden' && props.workspace?.hasUnresolvedWrite()) return; if (error.kind === 'unauthenticated') props.workspace?.dispose(); props.onAccessFailure(error.kind); } }, [state.error, props.onAccessFailure, props.workspace]);
  const run = (search = '', page = 1) => { if (active) void query?.run({ search, page, pageSize: 20, role: '', hallId: null, employmentStatus: 'all', loginStatus: '' }); };
  const options = new Map<string, { value: string; label: string; disabled: boolean }>();
  if (props.selected) options.set(props.selected.id, { value: props.selected.id, label: props.selected.name, disabled: false });
  for (const item of state.success?.data.items ?? []) options.set(item.id, { value: item.id, label: `${item.name} · ${item.employmentStatus || '状态未提供'}${item.account ? '（已有账号）' : ''}`, disabled: state.phase !== 'success' || item.account !== null });
  return <div ref={host} className="settings-reference-select settings-single demo-settings-single"><AccountSourceSelect className="ui-flat-select" aria-label="所属员工" value={props.selected?.id} options={[...options.values()]} placeholder="请选择员工" showSearch filterOption={false} allowClear={false} disabled={!active || !query} loading={state.phase === 'loading'}
    renderFormat={() => <span className="ui-single-tag">{props.selected?.name ?? ''}</span>}
    triggerProps={{ position: 'bl', autoAlignPopupWidth: false, popupStyle: { width: Math.max(180, host.current?.getBoundingClientRect().width ?? 0) } }}
    popupVisible={open && active && !!query} unmountOnExit getPopupContainer={() => { if (!host.current) throw new Error('Account staff picker is not mounted'); return host.current; }}
    onVisibleChange={visible => { if (!active) return; setOpen(visible); if (visible) run(); else query?.cancel(); }} onSearch={search => { if (open) run(search); }}
    onChange={(id: string) => { if (!active || !open || state.phase !== 'success') return; const row = state.success?.data.items.find(item => item.id === id); if (!row || row.account) return; props.onChange(accountStaffCandidate(row)); setOpen(false); }}
    dropdownRender={menu => <>{menu}<div className="settings-directory-footer"><span>已有账号的员工不可选，仅显示本页。</span>
      {state.phase === 'error' && <p role="alert">员工候选读取失败。<Button onClick={() => run(state.request?.parameters.search, state.request?.parameters.page)}>重试</Button></p>}
      {state.success && <><span>共{state.success.data.total}条，第{state.success.data.page}页</span><Button size="mini" disabled={state.phase === 'loading' || state.success.data.page <= 1} onClick={() => run(state.success?.parameters.search, (state.success?.data.page ?? 1) - 1)}>上一页</Button><Button size="mini" disabled={state.phase === 'loading' || state.success.data.page * state.success.data.pageSize >= state.success.data.total} onClick={() => run(state.success?.parameters.search, (state.success?.data.page ?? 1) + 1)}>下一页</Button></>}
    </div></>} />{!query && <small className="settings-note">员工候选读取暂未开放。</small>}</div>;
}
