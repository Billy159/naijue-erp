import { Button, DatePicker, Drawer, Empty, Input, Table } from '@arco-design/web-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import type { SettingsAuditCapability } from '../../../../src/settings/audit/contracts.ts';
import { SettingsAuditController } from '../../../../src/settings/audit/controller.ts';
import { auditActionLabels, auditModuleLabels, type SettingsAuditItem, type SettingsAuditValue } from '../../../../src/settings/audit/contracts.ts';
import { Pager, readMessage, SmallSelect } from './controls.tsx';

function valueText(value: SettingsAuditValue): string {
  if (value.state === 'ABSENT') return '未记录';
  if (value.state === 'NULL') return '空';
  if (value.state === 'IDS') return value.value.join('、') || '空';
  if (value.state === 'ROW_COUNT') return `${value.value} 行`;
  return typeof value.value === 'boolean' ? value.value ? '是' : '否' : String(value.value);
}
export default function AuditDrawer(props: { scope: ReadScope; capability: SettingsAuditCapability; onAccessFailure: (kind: 'unauthenticated' | 'forbidden') => void; close: () => void }) {
  const [binding, setBinding] = useState<{ scope: ReadScope; capability: SettingsAuditCapability; controller: SettingsAuditController } | null>(null);
  useEffect(() => {
    const controller = new SettingsAuditController({ scope: props.scope, reader: props.capability.reader, allowedModules: props.capability.allowedModules, onAccessFailure: props.onAccessFailure, hasUnresolvedWrite: props.capability.hasUnresolvedWrite });
    setBinding({ scope: props.scope, capability: props.capability, controller });
    return controller.dispose;
  }, [props.scope, props.capability]);
  return binding?.scope === props.scope && binding.capability === props.capability && binding.controller.scope.active ? <AuditBody {...props} controller={binding.controller}/> : <p role="status">正在读取操作记录…</p>;
}
function AuditBody(props: Parameters<typeof AuditDrawer>[0] & { controller: SettingsAuditController }) {
  const { controller } = props;
  const form = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const state = useSyncExternalStore(controller.query.subscribe, controller.query.getSnapshot, controller.query.getSnapshot);
  useEffect(() => { controller.start(); }, [controller]);
  if (form.disposed || !form.draft) return null;
  const draft = form.draft, current = state.success;
  const records = form.readDenied ? [] : current?.data.items ?? [];
  return <Drawer visible width={1040} title="基础设置操作记录" onCancel={props.close} maskClosable={false} className="bs-audit-drawer iw-arco-controls runtime-settings"
    footer={<Pager total={form.readDenied ? 0 : current?.data.total ?? 0} page={current?.parameters.page ?? 1} size={current?.parameters.pageSize ?? 20} disabled={state.phase === 'loading'} onPage={page => controller.page(page)} onSize={size => controller.pageSize(size)}/>}>
    <div className="bs-log-filters"><SmallSelect value={draft.module} label="全部模块" clear items={[{ value: 'ALL', label: '全部模块' }, ...controller.allowedModules.map(value => ({ value, label: auditModuleLabels[value] }))]} onChange={value => controller.update({ module: value && value !== 'ALL' ? value as typeof draft.module : 'ALL' })}/>
      <Input className="iw-arco-input" aria-label="数据对象" placeholder="数据对象" value={draft.objectSearch} allowClear onChange={objectSearch => controller.update({ objectSearch })}/><Input className="iw-arco-input" aria-label="操作人" placeholder="操作人" value={draft.actorSearch} allowClear onChange={actorSearch => controller.update({ actorSearch })}/>
      <SmallSelect value={draft.action} label="全部操作" clear items={[{ value: 'ALL', label: '全部操作' }, ...Object.entries(auditActionLabels).map(([value,label]) => ({ value,label }))]} onChange={value => controller.update({ action: value && value !== 'ALL' ? value as typeof draft.action : 'ALL' })}/>
      <DatePicker aria-label="开始日期" value={draft.dateFrom ?? ''} placeholder="开始日期" onChange={date => controller.update({ dateFrom: date || null })}/><DatePicker aria-label="结束日期" value={draft.dateTo ?? ''} placeholder="结束日期" onChange={date => controller.update({ dateTo: date || null })}/>
      <div className="bs-toolbar-actions bs-log-actions"><Button type="primary" onClick={() => controller.apply()}>查询</Button><Button onClick={() => controller.reset()}>重置</Button></div></div>
    {Object.values(form.errors).map((error,index) => <p className="bs-error" role="alert" key={index}>{error}</p>)}
    {state.phase === 'error' && <div className="bs-error" role="alert">{readMessage(state.error)}<Button type="text" onClick={() => controller.retry()}>重试</Button></div>}
    <div className="bs-log-results iw-arco-table"><Table<SettingsAuditItem> size="small" rowKey="id" pagination={false} loading={state.phase === 'loading'} data={[...records]} noDataElement={<Empty description="暂无操作记录"/>} columns={[
      { title: '时间', width: 158, render: (_,row) => row.occurredAt ? new Date(row.occurredAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '未知' },
      { title: '操作人', width: 90, render: (_,row) => row.actor.name ?? row.actor.loginName ?? '未知' },
      { title: '模块', width: 92, render: (_,row) => auditModuleLabels[row.module] },
      { title: '对象', width: 145, render: (_,row) => row.object.name ?? row.object.code ?? '名称未提供' },
      { title: '操作', width: 98, render: (_,row) => row.action ? auditActionLabels[row.action] : '未记录' },
      { title: '变化字段', render: (_,row) => <>{row.changes.map((change,index) => <div key={index}>{change.label}：{valueText(change.before)} → {valueText(change.after)}</div>)}{row.credentialActions.map((action,index) => <div key={`credential:${index}`}>{action === 'CREATE' ? '设置登录密码' : '重置密码'}</div>)}</> },
    ]}/></div>
  </Drawer>;
}
