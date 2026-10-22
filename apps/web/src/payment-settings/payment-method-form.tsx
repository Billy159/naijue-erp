import { Input, Switch } from '@arco-design/web-react';
import { useSyncExternalStore } from 'react';
import { SettingsField, SettingsPreparationModal } from '../settings/stores/maintenance-form.tsx';
import type { PaymentSettingsController } from './controller.ts';
export function PaymentMethodForm(props: { readonly controller: PaymentSettingsController; readonly close: () => void }) {
  const state = useSyncExternalStore(props.controller.subscribe, props.controller.getSnapshot, props.controller.getSnapshot), draft = state.draft;
  if (!draft || props.controller.kind !== 'methods') return null;
  return <SettingsPreparationModal title={`${props.controller.record ? '编辑' : '新增'}收款方式`} controller={props.controller} close={props.close}>
    <div className="bs-form-fields iw-form-fields"><SettingsField label="名称" required error={state.errors.name}><Input className="iw-arco-input" aria-label="名称" value={draft.name} onChange={name => props.controller.update({ name })} autoComplete="off" /></SettingsField>
      {props.controller.record && <SettingsField label="使用状态"><div className="bs-switch"><Switch aria-label="使用状态" checked={draft.enabled} onChange={enabled => props.controller.update({ enabled })} /><span>{draft.enabled ? '正常' : '已停用'}</span></div></SettingsField>}
    </div>
  </SettingsPreparationModal>;
}
