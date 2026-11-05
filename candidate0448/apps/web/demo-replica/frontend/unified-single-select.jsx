/* One Arco Select presentation for the Demo's single-value controls. */
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Select from '@arco-design/web-react/es/Select';
import arcoCss from '@arco-design/web-react/dist/css/arco.css?inline';

const EMPTY_OPTION = '__ui_empty_option__';
const mounts = new Map();
const styles = `
:host{display:block;width:100%;min-width:0;font:13px Arial,"PingFang SC","Microsoft YaHei",sans-serif;color:var(--ca-ink);--arcoblue-6:var(--ca-primary-rgb);--primary-6:var(--ca-primary-rgb);--color-text-1:var(--ca-ink);--color-text-2:var(--ca-ink-2)}
#root{width:100%;min-width:0}#portal{position:fixed;inset:0;z-index:2000;pointer-events:none}#portal>*{pointer-events:auto}
.arco-select{display:block;width:100%;font-size:13px}.arco-select .arco-select-view{box-sizing:border-box;height:32px;min-height:32px;max-height:32px;border:1px solid transparent;border-radius:var(--ca-radius-control);background:var(--ca-surface-muted);box-shadow:none}
.arco-select-size-default.arco-select-single .arco-select-view{padding-inline:3px}
.arco-select:hover .arco-select-view{border-color:var(--ca-control-hover-border);background:var(--ca-surface-muted)}
.arco-select.arco-select-focused .arco-select-view{border-color:var(--ca-control-focus-border);background:var(--ca-surface-muted);box-shadow:none}
.arco-select-view .arco-select-view-value{display:flex;align-items:center;min-width:0;overflow:hidden}.ui-single-tag{box-sizing:border-box;display:inline-flex;align-items:center;max-width:100%;height:23px;padding:1px 7px;overflow:hidden;border-radius:3px;background:#fff;color:var(--ca-ink);text-overflow:ellipsis;white-space:nowrap;font:400 13px Arial,"PingFang SC",sans-serif}
.ui-page-size-select .ui-single-tag,.ui-flat-select .ui-single-tag{padding-left:7px;background:transparent}
:host([data-ui-transfer-creator]) .arco-select .arco-select-view{border-color:var(--ca-control-border)!important;background:#fff!important}
:host([data-ui-transfer-creator]) .arco-select:hover .arco-select-view,:host([data-ui-transfer-creator]) .arco-select.arco-select-focused .arco-select-view,:host([data-ui-transfer-creator]) .arco-select:focus-within .arco-select-view{border-color:var(--ca-control-hover-border)!important;background:#fff!important;box-shadow:none!important;outline:0!important}
:host([data-ui-transfer-creator]) .arco-select-view input{outline:0!important;box-shadow:none!important}
:host([data-ui-transfer-creator]) .ui-single-tag{background:transparent!important}
:host([data-ui-transfer-fit]) .arco-select .arco-select-view{background:var(--ca-surface-muted)!important}
:host([data-ui-transfer-fit]) .ui-single-tag{background:transparent!important}
.arco-select-view input{min-width:28px;font-size:13px;background:transparent}.arco-select-view input::placeholder{color:var(--ca-ink-3)}.arco-select .arco-icon-hover{color:var(--ca-ink-2)}
.arco-select-popup{box-sizing:border-box;padding:4px;border:1px solid var(--ca-popover-border);border-radius:var(--ca-radius-card);background:#fff;box-shadow:var(--ca-shadow-float)}.arco-select-popup-inner{max-height:288px;overflow:auto}.arco-select-option-wrapper{height:30px!important;min-height:30px!important;max-height:30px!important;padding:0 4px!important}.arco-select-option{box-sizing:border-box;height:30px!important;min-height:30px!important;max-height:30px!important;padding:0 8px!important;line-height:30px!important;color:var(--ca-ink)!important;background:#fff;font-size:13px!important;font-weight:400!important}.arco-select-option-selected{background:var(--ca-surface-subtle)!important;font-weight:400!important}.arco-select-option-hover,.arco-select-option:hover{background:var(--ca-popover-hover)!important}.arco-select-option-disabled{color:var(--ca-disabled-ink)!important}
.arco-select-option-content{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.arco-select-popup .arco-empty{font-size:13px}
.arco-select-optgroup-label,.arco-select-popup .arco-select-group-title{padding:5px 12px;color:var(--ca-ink-3);font-size:11px;background:var(--ca-surface-subtle)}
.ui-select-recommendation{padding:8px 10px;border-bottom:1px solid var(--ca-line);background:var(--ca-surface-subtle);color:var(--ca-ink);font-size:12px}.ui-select-recommendation small{display:block;margin-bottom:3px;color:var(--ca-ink-3)}.ui-select-recommendation-row{display:flex;align-items:center;justify-content:space-between;gap:8px}.ui-select-recommendation-row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ui-select-recommendation-row button{flex:none;padding:2px 4px;border:0;background:transparent;color:var(--ca-primary);font:inherit;cursor:pointer}
`;

function makeHost(host) {
  const shadow = host.attachShadow({ mode: 'open' });
  const arco = document.createElement('style');
  arco.textContent = arcoCss.replace(/\bbody\s*\{/g, ':host {');
  const local = document.createElement('style'); local.textContent = styles;
  const app = document.createElement('div'); app.id = 'root';
  const portal = document.createElement('div'); portal.id = 'portal';
  shadow.append(arco, local, app, portal);
  const root = createRoot(app);
  mounts.set(host, { root, portal, key: '' });
  return mounts.get(host);
}

function Choice({ data, portal }) {
  const [value, setValue] = useState(data.value || undefined);
  const ref = useRef(null);
  useEffect(() => setValue(data.value || undefined), [data.value]);
  useEffect(() => { if (data.autoOpen) requestAnimationFrame(() => ref.current?.focus()); }, [data.autoOpen]);
  const commit = next => {
    const normalized = next === EMPTY_OPTION ? '' : next == null ? '' : String(next);
    setValue(next || undefined);
    data.onChange(normalized, data.items.find(x => x.value === next));
  };
  const grouped = data.items.some(item => item.group);
  const groups = grouped ? [...new Set(data.items.map(item => item.group).filter(Boolean))] : [];
  return <Select
    ref={ref}
    className={data.pagination ? 'ui-page-size-select' : data.flatValue ? 'ui-flat-select' : undefined}
    value={value}
    options={grouped ? undefined : data.items}
    aria-label={data.label}
    placeholder={data.placeholder || `搜索${data.label}`}
    showSearch={data.showSearch !== false}
    allowClear={data.allowClear !== false}
    disabled={data.disabled}
    defaultPopupVisible={!!data.autoOpen}
    popupVisible={data.autoOpen ? true : undefined}
    getPopupContainer={() => portal}
    triggerProps={{ position: data.placement || 'bl', autoAlignPopupWidth: false, popupStyle: { width: data.popupWidth || Math.max(180, data.width || 0) } }}
    dropdownRender={data.recommendation ? menu => <><div className="ui-select-recommendation"><small>推荐客户</small><div className="ui-select-recommendation-row"><span>{data.recommendation.label}</span><button type="button" onMouseDown={event => event.preventDefault()} onClick={() => commit(data.recommendation.value)}>选用</button></div></div>{menu}</> : undefined}
    renderFormat={(option, selected) => <span className="ui-single-tag">{option?.label ?? data.items.find(x => x.value === selected)?.label ?? data.currentLabel ?? selected}</span>}
    onChange={commit}
    onVisibleChange={visible => { if (!visible && !data.autoOpen) data.onClose?.(); }}
  >{grouped && groups.map(group => <Select.OptGroup key={group} label={group}>
    {data.items.filter(item => item.group === group).map(item => <Select.Option key={item.value} value={item.value} disabled={item.disabled}>{item.label}</Select.Option>)}
  </Select.OptGroup>)}</Select>;
}

function mount(host, data) {
  const record = mounts.get(host) || makeHost(host);
  data.width = host.getBoundingClientRect().width;
  data.popupWidth ||= Math.min(Math.max(data.width, 300), Math.max(180, innerWidth - host.getBoundingClientRect().left - 12));
  const key = JSON.stringify([data.value, data.items, data.disabled, data.placeholder, data.currentLabel, data.autoOpen, data.width, data.pagination, data.flatValue, data.allowClear, data.recommendation, data.showSearch, data.label]);
  if (record.key === key) return;
  record.key = key;
  record.root.render(<Choice data={data} portal={record.portal} />);
}

function nativeData(select) {
  const pagination = select.closest('.iw-pagination,.tc-list-pagination,.sale-foot,.pc-pagination');
  const items = [...select.options].filter(option => !option.hidden).map((option, index) => ({
    value: option.value === '' ? EMPTY_OPTION : option.value,
    label: option.textContent.trim(), disabled: option.disabled,
    group: option.parentElement?.tagName === 'OPTGROUP' ? option.parentElement.label : undefined,
    index,
  }));
  const selected = select.selectedOptions[0];
  const hiddenPlaceholder = selected?.hidden && selected.value === '' ? selected.textContent.trim() : '';
  const current = (hiddenPlaceholder || select.selectedIndex < 0) ? undefined : select.value === '' ? EMPTY_OPTION : select.value;
  const label = select.getAttribute('aria-label') || select.closest('label')?.firstChild?.textContent?.trim() || '选项';
  return { items, value: current, label, disabled: select.disabled,
    currentLabel: undefined,
    placeholder: hiddenPlaceholder || (select.hasAttribute('data-transfer-creator') ? '选择人员' : undefined),
    flatValue: select.classList.contains('ui-flat-select-source') || select.id === 'mx-transfer-color' || select.id === 'mx-transfer-fit' || select.hasAttribute('data-transfer-creator'),
    pagination: !!pagination,
    allowClear: !select.closest('.sale-editor') && !select.hasAttribute('data-required-single'),
    placement: pagination ? 'tl' : 'bl', popupWidth: pagination ? 150 : undefined,
    onChange(value) {
      select.value = value;
      if (value === '' && ![...select.options].some(option => option.value === '')) select.selectedIndex = -1;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      if (select.id === 'mx-transfer-color' && value) select.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      schedule();
    },
  };
}

function transferData(host) {
  const T = window.TRANSFER_UI?.state, D = window.ERP_DEMO;
  if (!T || !D) return null;
  const field = host.dataset.uiField, context = host.dataset.uiContext;
  const target = context === 'doc' ? T.doc : T.filter;
  if (!target) return null;
  const raw = target[field];
  const value = Array.isArray(raw) ? raw.length === 1 ? raw[0] : '' : raw || '';
  const label = host.dataset.uiLabel || (field === 'status' ? '状态' : field === 'from' ? '调出仓库' : '调入仓库');
  const outgoing = window.TRANSFER_SERVICE?.actor && context === 'doc' && field === 'from'
    ? new Set(window.MASTER_DATA.transferWarehouses('from').map(item => item.id)) : null;
  const choices = field === 'status'
    ? [{ value: EMPTY_OPTION, label: '全部状态' }, ...['未审核', '已审核', '已作废'].map(x => ({ value: x, label: x }))]
    : [...(context === 'filter' ? [{ value: EMPTY_OPTION, label: '全部仓库' }] : []), ...D.warehouses.filter(w => window.TRANSFER_SERVICE?.actor && (outgoing ? outgoing.has(w.id) : w.enabled !== false) && (!window.SALES_SERVICE?.session || (context === 'filter' ? window.SALES_SERVICE.session.warehouses : field === 'from' ? window.SALES_SERVICE.session.outgoingWarehouses || window.SALES_SERVICE.session.operationWarehouses || window.SALES_SERVICE.session.warehouses : window.SALES_SERVICE.session.operationWarehouses || window.SALES_SERVICE.session.warehouses).includes(w.id))).sort((a, b) => Number(b.name === '多立方总仓') - Number(a.name === '多立方总仓')).map(w => ({ value: w.id, label: w.name, disabled: context === 'doc' && w.id === T.doc[field === 'from' ? 'to' : 'from'] }))];
  return { items: choices, value: value || (context === 'filter' ? EMPTY_OPTION : undefined), label, flatValue: context === 'doc', allowClear: context !== 'doc',
    disabled: context === 'doc' && (!T.lease || T.lease.expires <= Date.now() || T.doc?.status !== '未审核' || !!T.busy || !!T.blocked || !!T.viewLatest),
    onChange(next) { target[field] = next; if (context === 'doc') T.touched[field] = true; window.render(); },
  };
}

let entitySession = null;
async function openEntity(anchor, options) {
  closeEntity(false);
  const host = document.createElement('span'); host.className = 'ui-single-host ui-single-entity';
  host.style.width = Math.max(160, Math.round(anchor.getBoundingClientRect().width)) + 'px';
  anchor.replaceWith(host);
  entitySession = { anchor, host };
  const session = entitySession;
  let items;
  try { items = await (typeof options.items === 'function' ? options.items() : options.items); }
  catch { items = []; }
  await new Promise(resolve => setTimeout(resolve, 0));
  if (session !== entitySession || !host.isConnected) return;
  const choices = (items || []).map(item => ({ value: String(item.id), label: item.name, group: item.group, disabled: !!item.disabled }));
  const recommended=options.recommendation && (items||[]).find(item=>String(item.id)===String(options.recommendation.id));
  mount(host, { items: choices, value: options.value || undefined, label: options.label, autoOpen: true, allowClear: options.allowClear !== false, flatValue: !!options.flatValue,
    recommendation: recommended ? { value: String(recommended.id), label: recommended.name } : null,
    onChange(value) { const selected = (items || []).find(item => String(item.id) === value) || null; closeEntity(false); options.onConfirm(value, selected); },
    onClose() { closeEntity(true); },
  });
}
function closeEntity(focus) {
  if (!entitySession) return;
  const { anchor, host } = entitySession; entitySession = null;
  const record = mounts.get(host);
  if (record) { record.root.unmount(); mounts.delete(host); }
  if (host.isConnected) host.replaceWith(anchor);
  if (focus && anchor.isConnected) anchor.focus();
}

let queued = false;
function schedule() { if (!queued) { queued = true; queueMicrotask(scan); } }
function scan() {
  queued = false;
  for (const [host, record] of mounts) if (!host.isConnected) { record.root.unmount(); mounts.delete(host); }
  document.querySelectorAll('select:not([multiple]):not(.ui-single-native):not([data-ui-single-exempt])').forEach(select => {
    if (select.closest('.arco-select') || select.type === 'hidden') return;
    const host = document.createElement('span'); host.className = 'ui-single-host';
    if (select.hasAttribute('data-transfer-creator')) host.dataset.uiTransferCreator = '';
    if (select.id === 'mx-transfer-fit') host.dataset.uiTransferFit = '';
    select.after(host); select.classList.add('ui-single-native');
    select.dataset.uiSingleMounted = '1';
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
  });
  document.querySelectorAll('select.ui-single-native').forEach(select => {
    const host = select.nextElementSibling;
    if (!host?.classList.contains('ui-single-host')) return;
    mount(host, nativeData(select));
  });
  document.querySelectorAll('[data-ui-single="transfer"]').forEach(host => {
    const data = transferData(host); if (data) mount(host, data);
  });
}

new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
document.addEventListener('change', event => { if (event.target.matches?.('select.ui-single-native')) schedule(); });
document.addEventListener('pointerdown', event => { if (entitySession && !entitySession.host.contains(event.target) && !entitySession.anchor.contains(event.target)) closeEntity(false); }, true);
document.addEventListener('keydown', event => { if (entitySession && event.key === 'Escape') { event.preventDefault(); closeEntity(true); } }, true);
window.UNIFIED_SINGLE_SELECT = { mountAll: schedule, openEntity, closeEntity, mount,
  unmount(host) { const record=mounts.get(host);if(record){record.root.unmount();mounts.delete(host)} },
};
schedule();
