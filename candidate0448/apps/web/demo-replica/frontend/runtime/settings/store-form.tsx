import { Button, Input, Modal, Switch } from '@arco-design/web-react';
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import type { ReadScope } from '../../../../src/loading/read-scope.ts';
import type { LatestQuery } from '../../../../src/loading/latest-query.ts';
import type { StoreSettingsDetail, StoreSettingsDetailQuery, StoreSettingsEntry, StoreSettingsKind } from '../../../../src/settings/stores/contracts.ts';
import type { SettingsDirectoryReader } from '../../../../src/settings/stores/maintenance-contracts.ts';
import { StoreMaintenanceController, storeRejectionMessage } from '../../../../src/settings/stores/maintenance-controller.ts';
import { ReferenceSelect, readMessage } from './controls.tsx';

interface Props {
  scope: ReadScope; kind: StoreSettingsKind; editor: StoreMaintenanceController | null;
  detail: LatestQuery<StoreSettingsDetailQuery, StoreSettingsDetail> | null;
  directory: SettingsDirectoryReader | undefined;
  onRecord: (record: StoreSettingsEntry) => void; onSaved: () => void; close: () => void;
}
const names = { stores: '营业厅', warehouses: '仓库' } as const;
function Field(props: { title: string; required?: boolean; error?: string | undefined; children: ReactNode }) {
  return <div className="bs-field iw-form-field" role="group" aria-label={props.title}><span>{props.title}{props.required && <i> *</i>}</span>{props.children}{props.error && <small className="bs-error" role="alert">{props.error}</small>}</div>;
}
export default function StoreFormDialog(props: Props) {
  if (props.editor) return <Editor key={props.editor.record?.id ?? 'new'} {...props} editor={props.editor}/>;
  return props.detail ? <Detail {...props} detail={props.detail}/> : null;
}
function Detail(props: Props & { detail: NonNullable<Props['detail']> }) {
  const state = useSyncExternalStore(props.detail.subscribe, props.detail.getSnapshot, props.detail.getSnapshot);
  const delivered = useRef(false);
  useEffect(() => { if (!delivered.current && state.phase === 'success' && state.success?.data.item) { delivered.current = true; props.onRecord(state.success.data.item); } }, [state, props.onRecord]);
  return <Modal visible className="bs-modal iw-arco-modal iw-arco-controls" title={`编辑${names[props.kind]}`} maskClosable={false} autoFocus={false} footer={<Button onClick={props.close}>取消</Button>} onCancel={props.close}>
    {state.phase === 'loading' || state.phase === 'idle' ? <p role="status">正在读取资料…</p> : state.phase === 'error' ? <p className="bs-error" role="alert">{readMessage(state.error)}<Button type="text" onClick={() => { if (state.request) void props.detail.run(state.request.parameters); }}>重试</Button></p> : <p role="status">{state.success?.data.item ? '正在准备编辑…' : '当前资料不存在或已不可用。'}</p>}
  </Modal>;
}
function Editor(props: Props & { editor: StoreMaintenanceController }) {
  const { editor, kind } = props;
  const state = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot), committed = useRef(false);
  useEffect(() => { if (state.write.phase === 'committed' && !committed.current) { committed.current = true; props.onSaved(); props.close(); } }, [state.write.phase, props.onSaved, props.close]);
  if (state.disposed || !state.draft) return null;
  const draft = state.draft, editing = editor.record !== null, locked = editor.locked;
  const cancel = () => { if (editor.discard()) props.close(); };
  return <Modal className="bs-modal iw-arco-modal iw-arco-controls runtime-settings" visible title={`${editing ? '编辑' : '新增'}${names[kind]}`} onCancel={cancel} onOk={() => { void editor.submit(); }} confirmLoading={state.write.phase === 'submitting' || state.write.phase === 'recovering'}
    okText="确定" cancelText="取消" maskClosable={false} autoFocus={false} okButtonProps={{ disabled: !editor.writesEnabled || locked }}>
    <div className="bs-form-fields iw-form-fields"><Field title="名称" required error={state.errors.name}><Input className="iw-arco-input" aria-label="名称" value={draft.name} autoComplete="off" disabled={locked} onChange={name => editor.update({ name })}/></Field>
      {kind === 'stores' ? <><Field title="默认零售客户" error={state.errors.customer}><ReferenceSelect scope={props.scope} reader={props.directory} kind="customers" label="默认零售客户" selected={draft.customer} disabled={locked} onChange={customer => editor.update({ customer })}/></Field>
        <Field title="默认出库仓" error={state.errors.warehouse}><ReferenceSelect scope={props.scope} reader={props.directory} kind="warehouses" label="默认出库仓" selected={draft.warehouse} hallId={editor.record?.id ?? null} disabled={locked || !editing} onChange={warehouse => editor.update({ warehouse })}/>{!editing && <small>先创建营业厅及其仓库，再设置默认出库仓。</small>}</Field></>
        : <Field title="所属营业厅" required error={state.errors.hall}><ReferenceSelect scope={props.scope} reader={props.directory} kind="halls" label="所属营业厅" selected={draft.hall} required disabled={locked} onChange={hall => editor.update({ hall })}/></Field>}
      {editing && <Field title="使用状态"><div className="bs-switch"><Switch aria-label="使用状态" checked={draft.enabled} disabled={locked} onChange={enabled => editor.update({ enabled })}/><span>{draft.enabled ? '正常' : '已停用'}</span></div></Field>}
    </div>
    {!editor.writesEnabled && <p className="runtime-settings-note" role="status">维护保存尚未接入，填写内容不会提交。</p>}
    {state.write.phase === 'rejected' && <p className="bs-error" role="alert">{storeRejectionMessage(state.write.error?.code ?? '')}</p>}
    {(state.write.phase === 'uncertain' || state.write.phase === 'recovering') && <div className="bs-error" role="alert">提交结果尚未确认，输入和原操作身份已保留。确认前不能重新提交或丢弃。<Button type="text" loading={state.write.phase === 'recovering'} disabled={state.write.phase === 'recovering'} onClick={() => { void editor.recover(); }}>查询提交结果</Button></div>}
  </Modal>;
}
