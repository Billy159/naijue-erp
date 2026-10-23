import { Button, Input, Modal, Switch } from '@arco-design/web-react';
import { useSyncExternalStore, type ReactNode } from 'react';
import { SettingsField } from '../settings/stores/maintenance-form.tsx';
import { paymentRejectionMessage, type PaymentSettingsController } from './controller.ts';
export function PaymentMethodForm(props: { readonly controller: PaymentSettingsController; readonly close: () => void }) {
  const state = useSyncExternalStore(props.controller.subscribe, props.controller.getSnapshot, props.controller.getSnapshot), draft = state.draft;
  if (!draft || props.controller.kind !== 'methods') return null;
  return <PaymentSettingsModal title={`${props.controller.record ? '编辑' : '新增'}收款方式`} controller={props.controller} close={props.close}>
    <div className="bs-form-fields iw-form-fields"><SettingsField label="名称" required error={state.errors.name}><Input className="iw-arco-input" aria-label="名称" maxLength={2048} disabled={props.controller.locked} value={draft.name} onChange={name => props.controller.update({ name })} autoComplete="off" /></SettingsField>
      {props.controller.record && <SettingsField label="使用状态"><div className="bs-switch"><Switch aria-label="使用状态" disabled={props.controller.locked} checked={draft.enabled} onChange={enabled => props.controller.update({ enabled })} /><span>{draft.enabled ? '正常' : '已停用'}</span></div></SettingsField>}
    </div>
  </PaymentSettingsModal>;
}

/** Uses the existing modal layout; only command status and the explicit save gate differ. */
export function PaymentSettingsModal(props: { readonly title: string; readonly controller: PaymentSettingsController; readonly close: () => void; readonly children: ReactNode }) {
  const { controller } = props, state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot), write = state.write;
  if (state.disposed) return null;
  const pending = write.phase === 'submitting' || write.phase === 'recovering';
  return <Modal className="demo-ui bs-modal demo-settings-modal iw-arco-modal iw-arco-controls"
    visible title={props.title} maskClosable={false} autoFocus={false} focusLock okText="确定" cancelText={write.phase === 'committed' ? '关闭' : '取消'}
    okButtonProps={{ disabled: !controller.writesEnabled || controller.locked || Boolean(controller.record && !state.dirty), loading: write.phase === 'submitting' }}
    onOk={() => { void controller.submit(); }} onCancel={() => { if (controller.requestClose()) props.close(); }}>
    <div>{props.children}</div>
    {!controller.writesEnabled && !controller.hasUnresolvedWrite && write.phase !== 'committed' && <p className="settings-note" role="status">此版本暂未开放保存，填写的内容不会保存。</p>}
    {pending && <p className="settings-note" role="status">{write.phase === 'submitting' ? '正在保存，请等待结果。' : '正在查询原提交的回执…'}</p>}
    {write.phase === 'committed' && <p className="settings-note" role="status">保存成功。</p>}
    {write.phase === 'rejected' && <p className="settings-note" role="alert">{write.error?.outcome === 'not-sent' ? '请求尚未发送，请检查填写内容。' : paymentRejectionMessage(write.error?.code ?? '')}</p>}
    {write.phase === 'uncertain' && <section className="settings-note" role="alert"><p>提交结果尚未确认。原提交内容已保留，请勿再次新建或重复保存。</p>
      {write.error?.code === 'RECEIPT_NOT_FOUND' && <p>暂未查到原回执，仍不能确定是否已保存。</p>}
      {write.error?.kind === 'forbidden' && <p>当前无权读取原回执，提交结果仍待确认。</p>}
      <Button onClick={() => { void controller.recover(); }}>查询原提交回执</Button></section>}
    {state.closePrompt && <section className="settings-close-prompt" role="alert"><strong>放弃本次填写？</strong><p>关闭后将清除本次未保存的内容。</p><div className="bs-row-actions">
      <Button onClick={() => controller.keepEditing()}>继续填写</Button><Button onClick={() => { if (controller.discard()) props.close(); }}>放弃本次填写</Button>
    </div></section>}
  </Modal>;
}
