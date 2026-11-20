import { UIButton, UIInput } from '../../components/standard-controls.tsx';
import { useSyncExternalStore } from 'react';
import { Switch } from '@arco-design/web-react';
import { StandardOverlay } from '../../components/standard-overlay.tsx';
import type { LatestQuery } from '../../loading/latest-query.ts';
import type { StoreSettingsDetail, StoreSettingsDetailQuery, StoreSettingsReference } from './contracts.ts';
import type { StoreSettingsReadController } from './controller.ts';
import { StoreSettingsReadState } from './read-state.tsx';
export function storeSettingsReferenceLabel(reference: StoreSettingsReference | null): string { return reference === null ? '未配置' : reference.name === null ? '名称未提供' : reference.name; }
/** Exact newly-authorized detail, never an editable clone of list/candidate data. */
export function StoreSettingsDetailModal({ controller, query, targetId, close }: { readonly controller: StoreSettingsReadController; readonly query: LatestQuery<StoreSettingsDetailQuery, StoreSettingsDetail>; readonly targetId: string; readonly close: () => void }) {
  const snapshot = useSyncExternalStore(query.subscribe, query.getSnapshot, query.getSnapshot);
  const label = controller.kind === 'stores' ? '营业厅' : '仓库', item = snapshot.success?.data.item;
  if (!controller.scope.active || snapshot.phase === 'disposed') return null;
  return <StandardOverlay title={`查看${label}`} closeLabel={`关闭查看${label}`} close={close} className="store-settings-modal erp-store-settings-modal iw-arco-controls" width={520}
    footer={dismiss => <><UIButton onClick={dismiss}>取消</UIButton><UIButton className="primary" disabled title="保存维护尚未接入">确定</UIButton></>}>
    <p className="settings-note">只读资料；新增、修改、停用和恢复使用尚未接入。</p>
    <StoreSettingsReadState snapshot={snapshot} accessFailure={controller.accessFailure} retry={() => { void query.run({ id: targetId }); }} cancel={() => query.cancel()} />{item ? <div className="bs-form-fields iw-form-fields"><label className="iw-form-field"><span>名称</span><UIInput aria-label="名称" value={item.name} readOnly /></label>{item.kind === 'stores' ? <><label className="iw-form-field"><span>默认零售客户</span><UIInput aria-label="默认零售客户" value={storeSettingsReferenceLabel(item.defaultCustomer)} readOnly />{item.defaultCustomer && <small>原生ID：{item.defaultCustomer.id}</small>}</label><label className="iw-form-field"><span>默认出库仓</span><UIInput aria-label="默认出库仓" value={storeSettingsReferenceLabel(item.defaultWarehouse)} readOnly />{item.defaultWarehouse && <small>原生ID：{item.defaultWarehouse.id}</small>}</label></> : <label className="iw-form-field"><span>所属营业厅</span><UIInput aria-label="所属营业厅" value={storeSettingsReferenceLabel(item.hall)} readOnly /><small>原生ID：{item.hall.id}</small></label>}<div className="iw-form-field"><span>使用状态</span><div className="bs-switch"><Switch aria-label="使用状态" checked={item.enabled} disabled /><span>{item.enabled ? '正常' : '已停用'}</span></div></div><p className="settings-note">版本：{item.version}；创建时间未提供。{item.kind === 'warehouses' ? '未提供完整库存与引用检查，不能据此判定可停用。' : ''}</p></div> : snapshot.phase === 'success' ? <p role="status">记录不存在或不在本次授权范围内。</p> : null}</StandardOverlay>;
}
