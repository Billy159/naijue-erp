import { Button, Drawer, Empty, Input, Table } from '@arco-design/web-react';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { UIDate } from '../../components/standard-controls.tsx';
import { DemoSettingsPager, DemoSettingsSingleSelect } from '../demo-settings-controls.tsx';
import { useDialogFocusReturn } from '../../components/use-dialog-focus-return.ts';
import { HttpQueryError } from '../../transport/http-query.ts';
import { auditActionLabels, auditActions, auditModuleLabels, type SettingsAuditDrawerProps, type SettingsAuditItem, type SettingsAuditModule, type SettingsAuditValue } from './contracts.ts';
import { SettingsAuditController } from './controller.ts';
import './audit.css';

/** Preserve source subsecond precision while displaying the actual instant in Shanghai. */
export function formatSettingsAuditTime(value: string | null): string {
  if (value === null) return '未提供';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')}${value.match(/\.\d+(?=Z$)/)?.[0] ?? ''}`;
}
export function formatSettingsAuditValue(field: string, value: SettingsAuditValue): string {
  if (value.state === 'ABSENT') return '原记录未记载';
  if (value.state === 'NULL') return '空值';
  if (value.state === 'IDS') return value.value.length ? value.value.join('、') : '空集合';
  if (value.state === 'ROW_COUNT') return `${value.value} 行（本次记录的变更行）`;
  if (typeof value.value === 'boolean') return field === 'enabled' ? value.value ? '正常' : '已停用' : field === 'login_enabled' ? value.value ? '已开通' : '已关闭' : value.value ? '是' : '否';
  return value.value === '' ? '空字符串' : String(value.value);
}
const label = (value: string | null) => value === null ? '未提供' : value === '' ? '空字符串' : value;
export function SettingsAuditDrawer(props: SettingsAuditDrawerProps) {
  const latest = useRef(props); latest.current = props;
  const modulesKey = props.allowedModules.join('|'), targetModule = props.target?.module, targetId = props.target?.objectId;
  const [binding, setBinding] = useState<{ readonly scope: SettingsAuditDrawerProps['scope']; readonly reader: SettingsAuditDrawerProps['reader']; readonly modulesKey: string; readonly targetModule: SettingsAuditModule | undefined; readonly targetId: string | undefined; readonly controller: SettingsAuditController } | null>(null);
  const focus = useDialogFocusReturn(props.scope, props.visible), wasOpen = useRef(false);
  useLayoutEffect(() => { if (props.visible && !wasOpen.current && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) focus.capture(document.activeElement); wasOpen.current = props.visible; }, [props.visible, focus]);
  useEffect(() => {
    if (!props.visible || !props.scope.active) { setBinding(null); return; }
    const controller = new SettingsAuditController({ scope: props.scope, ...(props.reader ? { reader: props.reader } : {}), allowedModules: [...props.allowedModules], ...(targetModule && targetId ? { target: { module: targetModule, objectId: targetId } } : {}),
      onAccessFailure: kind => latest.current.onAccessFailure(kind), hasUnresolvedWrite: () => latest.current.hasUnresolvedWrite?.() ?? false });
    setBinding({ scope: props.scope, reader: props.reader, modulesKey, targetModule, targetId, controller }); controller.start(); return () => controller.dispose();
  }, [props.visible, props.scope, props.reader, modulesKey, targetModule, targetId]);
  const controller = binding?.scope === props.scope && binding.reader === props.reader && binding.modulesKey === modulesKey && binding.targetModule === targetModule && binding.targetId === targetId ? binding.controller : null;
  if (!props.visible || !controller) return null;
  return <AuditContents controller={controller} close={() => { controller.dispose(); focus.request(); props.onClose(); }} />;
}
function AuditContents(props: { readonly controller: SettingsAuditController; readonly close: () => void }) {
  const { controller } = props, state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot), read = useSyncExternalStore(controller.query.subscribe, controller.query.getSnapshot, controller.query.getSnapshot);
  if (state.disposed || !state.draft || !controller.scope.active) return null;
  const draft = state.draft, busy = read.phase === 'loading', applied = read.success?.parameters ?? read.request?.parameters, page = applied?.page ?? 1, pageSize = applied?.pageSize ?? 20;
  const authError = read.error instanceof HttpQueryError && (read.error.kind === 'forbidden' || read.error.kind === 'unauthenticated');
  const restricted = state.readDenied || authError;
  const result = restricted ? null : read.success?.data;
  const active = controller.available;
  const columns = [
    { title: '时间', width: 158, render: (_: unknown, item: SettingsAuditItem) => <span title={item.occurredAt ?? undefined}>{formatSettingsAuditTime(item.occurredAt)}</span> },
    { title: '操作人', width: 90, render: (_: unknown, item: SettingsAuditItem) => <span title={item.actor.accountId ?? undefined}>{item.actor.name === null ? label(item.actor.loginName) : label(item.actor.name)}</span> },
    { title: '模块', width: 92, render: (_: unknown, item: SettingsAuditItem) => auditModuleLabels[item.module] },
    { title: '对象', width: 145, render: (_: unknown, item: SettingsAuditItem) => <span title={item.object.id}>{label(item.object.name)}</span> },
    { title: '操作', width: 98, render: (_: unknown, item: SettingsAuditItem) => item.action === null ? '未提供' : item.module === 'ACCOUNT' && item.action === 'DISABLE' ? '登录账号关闭' : item.module === 'ACCOUNT' && item.action === 'RESTORE' ? '登录账号恢复' : auditActionLabels[item.action] },
    { title: '变化字段', render: (_: unknown, item: SettingsAuditItem) => <div>{item.changes.map(change => <div key={change.field} className="settings-audit-change">{change.label}：{formatSettingsAuditValue(change.field, change.before)} → {formatSettingsAuditValue(change.field, change.after)}</div>)}
      {item.credentialActions.map((action, index) => <div key={`credential-${index}`}>{action === 'CREATE' ? '账号凭据：已设置' : '密码：已重置'}</div>)}{!item.changes.length && !item.credentialActions.length && <span>未提供字段变化</span>}</div> },
  ];
  const errors = Object.values(state.errors);
  return <Drawer visible width={1040} title={<span title="日期与时间按上海时区显示。对象和操作人名称为当前资料；变化值保留原记录。">基础设置操作记录</span>} onCancel={props.close} maskClosable={false} className="demo-ui demo-settings-audit bs-audit-drawer settings-audit-drawer iw-arco-controls" unmountOnExit
    footer={<DemoSettingsPager label="操作记录分页" scope={controller.scope} page={page} size={pageSize} total={result?.total ?? null} busy={busy} disabled={!active || !!restricted} onPage={next => controller.page(next)} onSize={next => controller.pageSize(next)} />}>
    <form className="bs-log-filters" role="search" onSubmit={event => { event.preventDefault(); controller.apply(); }}>
      <DemoSettingsSingleSelect scope={controller.scope} label="模块" placeholder="全部模块" clear value={draft.module === 'ALL' ? '' : draft.module} disabled={!active || controller.targetLocked} options={controller.allowedModules.map(module => ({ value: module, label: auditModuleLabels[module] }))} onChange={module => controller.update({ module: (module || 'ALL') as typeof draft.module })} />
      <Input className="iw-arco-input" aria-label="数据对象" disabled={!active} value={draft.objectSearch} onChange={objectSearch => controller.update({ objectSearch })} placeholder="数据对象" allowClear maxLength={200} />
      <Input className="iw-arco-input" aria-label="操作人" disabled={!active} value={draft.actorSearch} onChange={actorSearch => controller.update({ actorSearch })} placeholder="操作人" allowClear maxLength={200} />
      <DemoSettingsSingleSelect scope={controller.scope} label="操作" placeholder="全部操作" clear value={draft.action === 'ALL' ? '' : draft.action} disabled={!active} options={auditActions.map(action => ({ value: action, label: auditActionLabels[action] }))} onChange={action => controller.update({ action: (action || 'ALL') as typeof draft.action })} />
      <UIDate aria-label="开始日期" value={draft.dateFrom ?? ''} onChange={value => controller.update({ dateFrom: value || null })} disabled={!active} placeholder="开始日期" />
      <UIDate aria-label="结束日期" value={draft.dateTo ?? ''} onChange={value => controller.update({ dateTo: value || null })} disabled={!active} placeholder="结束日期" />
      <div className="bs-toolbar-actions bs-log-actions"><Button type="primary" htmlType="submit" disabled={!active || busy}>查询</Button><Button disabled={!active || busy} onClick={() => controller.reset()}>重置</Button></div>
    </form>
    {errors.length > 0 && <p role="alert" className="settings-audit-note">{errors.join(' ')}</p>}
    {!active && <p role="status" className="settings-audit-note">操作记录读取暂未开放。</p>}
    {busy && <p role="status" className="settings-audit-note">正在读取操作记录…</p>}
    {read.phase === 'error' && <p role="alert" className="settings-audit-note">{authError ? '当前无权读取操作记录。' : state.readDenied ? '此前读取被拒绝，成功重读前不显示先前记录。' : '操作记录读取失败。'}<Button type="text" disabled={!active} onClick={() => controller.retry()}>重试</Button></p>}
    {state.readDenied && read.phase !== 'error' && <p role="status" className="settings-audit-note">此前读取被拒绝，成功重读前不显示先前记录。</p>}
    {result && read.phase !== 'success' && <p role="status" className="settings-audit-note">下方为上次成功读取的结果。</p>}
    <div className="bs-log-results iw-arco-table" aria-busy={busy}><Table size="small" rowKey="id" columns={columns} data={result ? [...result.items] : []} pagination={false} noDataElement={<Empty description={read.phase === 'success' && result?.total === 0 ? '暂无操作记录' : '尚未读到操作记录'} />} /></div>
  </Drawer>;
}
