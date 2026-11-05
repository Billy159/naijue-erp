import { Button, Input, Modal, Select, Switch } from '@arco-design/web-react';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type ComponentProps, type ComponentType } from 'react';
import { LatestQuery } from '../../loading/latest-query.ts';
import type { ReadScope } from '../../loading/read-scope.ts';
import { HttpQueryError } from '../../transport/http-query.ts';
import type { SettingsDirectoryKind, SettingsDirectoryPage, SettingsDirectoryParameters, SettingsDirectoryReader, SettingsReference, StoreMaintenanceDraft, StoreMaintenanceFormProps } from './maintenance-contracts.ts';
import { settingsReferenceName, settingsSaveUnavailable } from './maintenance-contracts.ts';
import { SettingsDraftController, StoreMaintenanceController, storeRejectionMessage } from './maintenance-controller.ts';
import { storeMaintenanceDraft, validateStoreMaintenanceDraft } from './maintenance-validation.ts';
import './source-store-settings.css';
import './demo-store-ui.css';

// Same runtime Select; extend only its published controlled-empty value typing.
const ControlledDirectorySelect = Select as ComponentType<Omit<ComponentProps<typeof Select>, 'value'> & { readonly value: ComponentProps<typeof Select>['value'] }>;

export function SettingsField(props: { readonly label: string; readonly required?: boolean; readonly error?: string | undefined; readonly children: ReactNode }) {
  return <div className="bs-field iw-form-field" role="group" aria-label={props.label}>
    <span>{props.label}{props.required && <i> *</i>}</span>{props.children}
    {props.error && <small className="bs-error" role="alert">{props.error}</small>}
  </div>;
}

export function SettingsPreparationModal<T extends object>(props: {
  readonly title: string; readonly controller: SettingsDraftController<T>; readonly close: () => void;
  readonly children: ReactNode; readonly staff?: boolean; readonly demoStore?: boolean;
}) {
  const state = useSyncExternalStore(props.controller.subscribe, props.controller.getSnapshot, props.controller.getSnapshot);
  if (state.disposed) return null;
  return <Modal className={`demo-ui bs-modal ${props.demoStore ? 'demo-store-modal' : 'store-settings-modal settings-preparation-modal'} iw-arco-modal iw-arco-controls${props.staff ? ' bs-modal-staff' : ''}`}
    visible title={props.title} maskClosable={false} autoFocus={false} focusLock
    okText="确定" cancelText="取消" okButtonProps={{ disabled: true }}
    onCancel={() => { props.controller.dispose(); props.close(); }}>
    <div onBlur={() => { props.controller.validate(); }}>{props.children}</div>
    <p className="settings-note" role="status">{settingsSaveUnavailable}</p>
  </Modal>;
}

/** Explicit paged directory read. Selected references are preserved independently
 * of the current page; a missing name stays unknown, never becomes a UUID label. */
export function SettingsReferenceSelect(props: {
  readonly scope: ReadScope; readonly reader: SettingsDirectoryReader | undefined;
  readonly kind: SettingsDirectoryKind; readonly label: string;
  readonly selected: readonly SettingsReference[]; readonly multiple?: boolean;
  readonly required?: boolean; readonly disabled?: boolean; readonly hallId?: string | null; readonly flatValue?: boolean; readonly placeholder?: string;
  readonly onChange: (items: readonly SettingsReference[]) => void;
}) {
  const [binding, setBinding] = useState<{ query: LatestQuery<SettingsDirectoryParameters, SettingsDirectoryPage>; scope: ReadScope; reader: SettingsDirectoryReader; kind: SettingsDirectoryKind; hallId: string | null } | null>(null);
  useEffect(() => {
    if (!props.reader || !props.scope.active) { setBinding(null); return; }
    const reader = props.reader, query = new LatestQuery<SettingsDirectoryParameters, SettingsDirectoryPage>({ scope: props.scope,
      execute: read => reader.read(props.kind, read.parameters, read.signal) });
    setBinding({ query, scope: props.scope, reader, kind: props.kind, hallId: props.hallId ?? null }); return () => query.dispose();
  }, [props.scope, props.reader, props.kind, props.hallId]);
  const owner = binding?.scope === props.scope && binding.reader === props.reader && binding.kind === props.kind && binding.hallId === (props.hallId ?? null) ? binding.query : null;
  return <DirectorySelect key={`${props.kind}:${props.hallId ?? ''}`} {...props} owner={owner} />;
}
function DirectorySelect(props: Parameters<typeof SettingsReferenceSelect>[0] & { readonly owner: LatestQuery<SettingsDirectoryParameters, SettingsDirectoryPage> | null }) {
  const empty = useRef(Object.freeze({ phase: 'idle' as const, request: null, success: null, error: null }));
  const snapshot = useSyncExternalStore(props.owner?.subscribe ?? (() => () => {}), props.owner?.getSnapshot ?? (() => empty.current), props.owner?.getSnapshot ?? (() => empty.current));
  const [open, setOpen] = useState(false), portal = useRef<HTMLDivElement>(null);
  const active = props.scope.active && !props.disabled && snapshot.phase !== 'disposed';
  useEffect(() => {
    const clear = () => setOpen(false);
    props.scope.signal.addEventListener('abort', clear, { once: true });
    if (!props.scope.active) clear();
    return () => props.scope.signal.removeEventListener('abort', clear);
  }, [props.scope]);
  const run = (search = '', page = 1) => {
    if (active) void props.owner?.run({ search, page, pageSize: 20, hallId: props.hallId ?? null });
  };
  const current = snapshot.success, selected = new Map(props.selected.map(item => [item.id, item]));
  const candidates = new Map((snapshot.phase === 'success' ? current?.data.items ?? [] : []).map(item => [item.id, item]));
  const options = new Map<string, { value: string; label: string; disabled: boolean }>();
  // Arco uses option.disabled for tag removability and clear-all too. Existing
  // relations must stay removable even when absent from the current page.
  for (const item of props.selected) options.set(item.id, { value: item.id, label: settingsReferenceName(item), disabled: false });
  for (const item of current?.data.items ?? []) options.set(item.id, { value: item.id, label: settingsReferenceName(item), disabled: !selected.has(item.id) && snapshot.phase !== 'success' });
  const unavailable = !props.owner || props.kind === 'warehouses' && !props.hallId;
  const canRemoveSelected = !!props.multiple && selected.size > 0;
  const errorText = snapshot.error instanceof HttpQueryError && snapshot.error.kind === 'forbidden' ? '无权读取候选资料。' : '候选资料读取失败。';
  return <div className={`settings-reference-select settings-single${props.flatValue ? ' demo-store-single' : ''}`}>
    <ControlledDirectorySelect {...(props.flatValue ? { className: 'ui-flat-select' } : {})} aria-label={props.label} {...(props.multiple ? { mode: 'multiple' as const } : {})}
      value={props.multiple ? props.selected.map(item => item.id) : props.selected[0]?.id ?? (props.flatValue ? undefined : '')}
      {...(props.flatValue ? { renderFormat: () => <span className="ui-single-tag">{props.selected[0] ? settingsReferenceName(props.selected[0]) : ''}</span> } : {})}
      options={[...options.values()]} placeholder={props.placeholder ?? "请选择"} showSearch filterOption={false}
      allowClear={!props.required} disabled={!active || unavailable && !canRemoveSelected} loading={snapshot.phase === 'loading'}
      popupVisible={open && active && !unavailable} unmountOnExit
      getPopupContainer={() => { if (!portal.current) throw new Error('Settings directory portal not mounted'); return portal.current; }}
      onVisibleChange={visible => { if (!active) return; setOpen(visible); if (visible) run(); else props.owner?.cancel(); }}
      onSearch={search => { if (open) run(search); }}
      onChange={(value: unknown) => {
        if (!active) return;
        const ids = value === undefined || value === '' ? [] : Array.isArray(value) ? value : [value];
        if (ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) return;
        const onlyRemoves = ids.every(id => selected.has(id));
        if (!onlyRemoves && (!open || snapshot.phase !== 'success' || ids.some(id => !selected.has(id) && !candidates.has(id)))) return;
        if (!props.multiple && ids.length > 1 || props.required && !ids.length) return;
        const known = new Map([...selected, ...candidates]);
        props.onChange(ids.map(id => known.get(id as string)!)); if (!props.multiple) setOpen(false);
      }}
      dropdownRender={menu => <>{menu}<div className="settings-directory-footer">
        {snapshot.phase === 'error' && <p role="alert">{errorText}<Button type="text" onClick={() => run(snapshot.request?.parameters.search, snapshot.request?.parameters.page)}>重试</Button></p>}
        {current && <><span>共{current.data.total}条，第{current.data.page}页（仅显示本页）</span>
          <Button size="mini" disabled={snapshot.phase === 'loading' || current.data.page <= 1} onClick={() => run(current.parameters.search, current.data.page - 1)}>上一页</Button>
          <Button size="mini" disabled={snapshot.phase === 'loading' || current.data.page * current.data.pageSize >= current.data.total} onClick={() => run(current.parameters.search, current.data.page + 1)}>下一页</Button></>}
      </div></>} />
    <div ref={portal} className="settings-directory-portal" />
    {unavailable && <small className="settings-note">{props.kind === 'warehouses' && !props.hallId ? '请先创建营业厅和本厅仓库。' : '候选资料暂未开放。'}</small>}
  </div>;
}

export function StoreMaintenanceForm(props: StoreMaintenanceFormProps) {
  const [controller, setController] = useState<SettingsDraftController<StoreMaintenanceDraft> | null>(null);
  useEffect(() => {
    const next = new SettingsDraftController(props.scope, storeMaintenanceDraft(props.record), draft => validateStoreMaintenanceDraft(props.kind, draft, props.record));
    setController(next); return () => next.dispose();
  }, [props.scope, props.kind, props.record]);
  return controller ? <StoreFormContent {...props} controller={controller} /> : null;
}
function StoreFormContent(props: StoreMaintenanceFormProps & { readonly controller: SettingsDraftController<StoreMaintenanceDraft> }) {
  const { controller } = props, state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  if (state.disposed || !props.scope.active) return null;
  const error = Object.values(state.errors).join(' ');
  return <Modal className="demo-ui bs-modal demo-store-modal iw-arco-modal iw-arco-controls" visible
    title={`${props.record ? '编辑' : '新增'}${props.kind === 'stores' ? '营业厅' : '仓库'}`} maskClosable={false} autoFocus={false} focusLock
    okText="确定" cancelText="取消" okButtonProps={{ disabled: true }} onCancel={() => { controller.dispose(); props.close(); }}>
    <StoreFormFields {...props} />
    {error && <p className="bs-error" role="alert">{error}</p>}
    <p className="settings-note" role="status">{settingsSaveUnavailable}</p>
  </Modal>;
}
function StoreFormFields(props: StoreMaintenanceFormProps & {
  readonly controller: Pick<SettingsDraftController<StoreMaintenanceDraft>, 'getSnapshot' | 'subscribe' | 'update'>;
  readonly locked?: boolean;
}) {
  const { controller } = props, state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot), draft = state.draft;
  if (!draft) return null;
  // Frozen Fields stores/warehouses branches; reference reads remain native.
  const fields = [<SettingsField key="name" label="名称" required><Input className="iw-arco-input" aria-label="名称" value={draft.name} onChange={name => controller.update({ name })} autoComplete="off" maxLength={2048} disabled={!!props.locked} autoFocus /></SettingsField>];
  if (props.kind === 'stores') fields.push(
    <SettingsField key="defaultCustomerId" label="默认零售客户"><SettingsReferenceSelect flatValue disabled={!!props.locked} scope={props.scope} reader={props.directory} kind="customers" label="默认零售客户" selected={draft.customer ? [draft.customer] : []} onChange={items => controller.update({ customer: items[0] ?? null })} /></SettingsField>,
    <SettingsField key="defaultWarehouseId" label="默认出库仓"><SettingsReferenceSelect flatValue disabled={!!props.locked} scope={props.scope} reader={props.directory} kind="warehouses" label="默认出库仓" hallId={props.record?.id ?? null} selected={draft.warehouse ? [draft.warehouse] : []} onChange={items => controller.update({ warehouse: items[0] ?? null })} /></SettingsField>);
  if (props.kind === 'warehouses') fields.push(<SettingsField key="storeId" label="所属营业厅" required><SettingsReferenceSelect flatValue disabled={!!props.locked} scope={props.scope} reader={props.directory} kind="halls" label="所属营业厅" selected={draft.hall ? [draft.hall] : []} required onChange={items => controller.update({ hall: items[0] ?? null })} /></SettingsField>);
  if (props.record) fields.push(<SettingsField key="enabled" label="使用状态"><div className="bs-switch"><Switch aria-label="使用状态" checked={draft.enabled} onChange={enabled => controller.update({ enabled })} disabled={!!props.locked} /><span>{draft.enabled ? '正常' : '已停用'}</span></div></SettingsField>);
  return <div className="bs-form-fields iw-form-fields">{fields}</div>;
}
export function StoreCommandForm(props: StoreMaintenanceFormProps & { readonly controller: StoreMaintenanceController }) {
  const { controller } = props, state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot), write = state.write;
  if (state.disposed || !props.scope.active) return null;
  const pending = write.phase === 'submitting' || write.phase === 'recovering';
  const error = Object.values(state.errors).join(' ') || (write.phase === 'rejected'
    ? write.error?.outcome === 'not-sent' ? '请求尚未发送，请检查填写内容。' : storeRejectionMessage(write.error?.code ?? '') : '');
  return <Modal className="demo-ui bs-modal demo-store-modal iw-arco-modal iw-arco-controls"
    visible title={`${controller.record ? '编辑' : '新增'}${props.kind === 'stores' ? '营业厅' : '仓库'}`} maskClosable={false} autoFocus={false} focusLock okText="确定" cancelText={write.phase === 'committed' ? '关闭' : '取消'}
    confirmLoading={write.phase === 'submitting'}
    okButtonProps={{ disabled: !controller.writesEnabled || controller.locked || Boolean(controller.record && !state.dirty) }}
    onOk={() => { void controller.submit(); }} onCancel={() => { if (controller.discard()) props.close(); }}>
    <StoreFormFields {...props} locked={controller.locked} />
    {error && <p className="bs-error" role="alert">{error}</p>}
    {!controller.writesEnabled && !controller.hasUnresolvedWrite && write.phase !== 'committed' && <p className="settings-note" role="status">{settingsSaveUnavailable}</p>}
    {pending && <p className="settings-note" role="status">{write.phase === 'submitting' ? '正在保存，请等待结果。' : '正在查询原提交的回执…'}</p>}
    {write.phase === 'committed' && <p className="settings-note" role="status">保存成功。</p>}
    {write.phase === 'uncertain' && <section className="settings-note" role="alert"><p>提交结果尚未确认。原提交内容已保留，请勿再次新建或重复保存。</p>
      {write.error?.code === 'RECEIPT_NOT_FOUND' && <p>暂未查到原回执，仍不能确定是否已保存。</p>}
      {write.error?.kind === 'forbidden' && <p>当前无权读取原回执，提交结果仍待确认。</p>}
      <Button onClick={() => { void controller.recover(); }}>查询原提交回执</Button></section>}
  </Modal>;
}
