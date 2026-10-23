import { Input, Switch } from '@arco-design/web-react';
import { useSyncExternalStore } from 'react';
import { SettingsField, SettingsReferenceSelect } from '../settings/stores/maintenance-form.tsx';
import { settingsReferenceName } from '../settings/stores/maintenance-contracts.ts';
import type { PaymentSettingsProps } from './contracts.ts';
import type { PaymentSettingsController } from './controller.ts';
import { PaymentSettingsModal } from './payment-method-form.tsx';
export function PaymentAccountForm(props: Pick<PaymentSettingsProps, 'scope' | 'directory'> & { readonly controller: PaymentSettingsController; readonly close: () => void }) {
  const { controller } = props, state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot), draft = state.draft;
  if (!draft || controller.kind !== 'accounts' || !props.scope.active) return null;
  // Frozen Fields fundAccounts branch. Multi-hall scope is the approved addition.
  const fields = [<SettingsField key="name" label="账户名称" required><Input className="iw-arco-input" aria-label="账户名称" value={draft.name} onChange={name => controller.update({ name })} autoComplete="off" maxLength={2048} disabled={controller.locked} autoFocus /></SettingsField>];
  fields.push(controller.record
    ? <SettingsField key="method" label="所属收款方式"><div className="bs-readonly">{settingsReferenceName(draft.method)}</div></SettingsField>
    : <SettingsField key="method" label="所属收款方式" required><SettingsReferenceSelect flatValue disabled={controller.locked} scope={props.scope} reader={props.directory} kind="payment-methods" label="所属收款方式" required selected={draft.method ? [draft.method] : []} onChange={items => controller.update({ method: items[0] ?? null })} /></SettingsField>);
  fields.push(<SettingsField key="halls" label="适用营业厅"><SettingsReferenceSelect disabled={controller.locked} scope={props.scope} reader={props.directory} kind="halls" label="适用营业厅" multiple selected={draft.halls} onChange={halls => controller.update({ halls })} /></SettingsField>);
  if (controller.record) fields.push(<SettingsField key="enabled" label="使用状态"><div className="bs-switch"><Switch aria-label="使用状态" checked={draft.enabled} onChange={enabled => controller.update({ enabled })} disabled={controller.locked} /><span>{draft.enabled ? '正常' : '已停用'}</span></div></SettingsField>);
  return <PaymentSettingsModal title={`${controller.record ? '编辑' : '新增'}资金账户`} controller={controller} close={props.close}>
    <div className="bs-form-fields iw-form-fields">{fields}</div>
  </PaymentSettingsModal>;
}
