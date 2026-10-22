import { Input, Switch } from '@arco-design/web-react';
import { useSyncExternalStore } from 'react';
import { SettingsField, SettingsPreparationModal, SettingsReferenceSelect } from '../settings/stores/maintenance-form.tsx';
import { settingsReferenceName } from '../settings/stores/maintenance-contracts.ts';
import type { PaymentSettingsProps } from './contracts.ts';
import type { PaymentSettingsController } from './controller.ts';
export function PaymentAccountForm(props: Pick<PaymentSettingsProps, 'scope' | 'directory'> & { readonly controller: PaymentSettingsController; readonly close: () => void }) {
  const { controller } = props, state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot), draft = state.draft;
  if (!draft || controller.kind !== 'accounts' || !props.scope.active) return null;
  return <SettingsPreparationModal title={`${controller.record ? '编辑' : '新增'}资金账户`} controller={controller} close={props.close}>
    <div className="bs-form-fields iw-form-fields">
      <SettingsField label="账户名称" required error={state.errors.name}><Input className="iw-arco-input" aria-label="账户名称" value={draft.name} onChange={name => controller.update({ name })} autoComplete="off" /></SettingsField>
      <SettingsField label="所属收款方式" required error={state.errors.method}>{controller.record ? <div className="bs-readonly">{settingsReferenceName(draft.method)}</div> : <SettingsReferenceSelect scope={props.scope} reader={props.directory} kind="payment-methods" label="所属收款方式" required selected={draft.method ? [draft.method] : []} onChange={items => controller.update({ method: items[0] ?? null })} />}</SettingsField>
      <SettingsField label="适用营业厅" error={state.errors.halls}><SettingsReferenceSelect scope={props.scope} reader={props.directory} kind="halls" label="适用营业厅" multiple selected={draft.halls} onChange={halls => controller.update({ halls })} /></SettingsField>
      {controller.record && <SettingsField label="使用状态"><div className="bs-switch"><Switch aria-label="使用状态" checked={draft.enabled} onChange={enabled => controller.update({ enabled })} /><span>{draft.enabled ? '正常' : '已停用'}</span></div></SettingsField>}
    </div>
  </SettingsPreparationModal>;
}
