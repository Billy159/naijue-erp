import { UIButton, UIInput } from '../../components/standard-controls.tsx';
import { StandardOverlay } from '../../components/standard-overlay.tsx';
import type { CatalogueSettingsEntry } from './contracts.ts';

/** Exact authorized list snapshot, never an editor or write capability. */
export function CatalogueEntryView({ entry, label, close }: { readonly entry: CatalogueSettingsEntry; readonly label: '颜色' | '版型'; readonly close: () => void }) {
  return <StandardOverlay title={`查看${label}`} closeLabel={`关闭查看${label}`} close={close} className="catalogue-entry-modal pc-arco-modal" width={480}
    footer={dismiss => <><UIButton className="pc-delete-left" disabled title="删除维护尚未接入">删除</UIButton><UIButton onClick={dismiss}>取消</UIButton><UIButton className="primary" disabled title="保存维护尚未接入">确定</UIButton></>}>
    <p className="catalogue-view-note">当前仅查看已授权读取的资料；新增、修改和删除尚未接入。</p>
    <form onSubmit={event => event.preventDefault()} aria-label={`${label}资料只读`}><label className="field"><span>{label}名称</span><UIInput value={entry.name} readOnly /></label><label className="field"><span>{label}代码</span><UIInput value={entry.code} readOnly /></label><div className="field"><span>启用状态</span><p className="pc-text-block">{entry.enabled ? '启用' : '停用'}</p></div><p className="catalogue-version">版本：{entry.version}</p></form>
  </StandardOverlay>;
}
