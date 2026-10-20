/* Shared Arco multi-select filters for inventory and transfer lists. */
import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import TreeSelect from '@arco-design/web-react/es/TreeSelect';
import { pinyin } from 'pinyin-pro';
import arcoCss from '@arco-design/web-react/dist/css/arco.css?inline';

const bridge = window.INVENTORY_FILTERS_BRIDGE;
const ALL = '__inventory_all__';
const styleText = `
:host{display:block;width:100%;min-width:0;font:13px Arial,"PingFang SC","Microsoft YaHei",sans-serif;color:var(--ca-ink);--arcoblue-6:var(--ca-primary-rgb);--primary-6:var(--ca-primary-rgb);--color-text-1:var(--ca-ink);--color-text-2:var(--ca-ink-2);--color-border-2:var(--ca-control-border)}
#root{width:100%;min-width:0}#portal{position:fixed;inset:0;z-index:1600;pointer-events:none}#portal>*{pointer-events:auto}
.arco-tree-select{display:block;width:100%;font-size:13px}
.arco-tree-select .arco-tree-select-view{height:32px;min-height:32px;max-height:32px;overflow:hidden;border:1px solid transparent;border-radius:var(--ca-radius-control);background:var(--ca-surface-muted);box-shadow:none}
.arco-tree-select:hover .arco-tree-select-view{border-color:transparent;background:var(--ca-surface-muted)}
.arco-tree-select.arco-tree-select-focused .arco-tree-select-view{border-color:var(--ca-control-focus-border);background:var(--ca-surface-muted);box-shadow:none}
.arco-tree-select .arco-input-tag,.arco-tree-select .arco-input-tag:hover,.arco-tree-select .arco-input-tag.arco-input-tag-focus{background:transparent!important}
.arco-tree-select .arco-input-tag-view,.arco-tree-select .arco-input-tag-inner{min-width:0}
.arco-tree-select .arco-input-tag-inner{flex-wrap:nowrap;white-space:nowrap}
.arco-tree-select .arco-input-tag .arco-input-tag-tag{height:23px;line-height:23px;max-width:calc(100% - 42px);flex:none;white-space:nowrap;background:var(--ca-surface);color:var(--ca-ink);border:0;border-radius:3px;box-shadow:none}
.arco-tree-select .arco-tag-content{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.arco-tree-select .arco-tag-close-icon,.arco-tree-select .arco-icon-hover{color:var(--ca-ink-2)}
.arco-tree-select .arco-input-tag .arco-input-tag-tag:has(.inv-filter-count){padding-inline:3px;border:0;background:transparent}
.arco-tree-select.inv-all-selected .arco-input-tag-inner>.arco-input-tag-tag:not(:first-child){display:none}
.inv-filter-count{white-space:nowrap;color:var(--ca-ink-2);font-size:12px}
.arco-tree-select-view input{font-size:13px;min-width:32px;background:transparent}
.arco-tree-select-view .arco-tree-select-view-suffix{flex:none}
.arco-trigger-popup{max-width:calc(100vw - 24px)}
.arco-tree-select-popup{box-sizing:border-box;padding:4px;border:1px solid var(--ca-popover-border);border-radius:var(--ca-radius-card);box-shadow:var(--ca-shadow-float);background:var(--ca-popover-bg);color:var(--ca-ink)}
.arco-tree-select-popup .arco-tree{max-height:288px;overflow-y:auto;scrollbar-gutter:stable}
.arco-tree-select-popup .arco-tree-node{box-sizing:border-box;min-height:30px;padding-left:8px;color:var(--ca-ink)}
.arco-tree-select-popup .arco-tree-node-switcher{display:none}
.arco-tree-select-popup .arco-tree-node-title{font-size:13px;color:var(--ca-ink)}
.arco-tree-select-popup .arco-tree-node-selected,.arco-tree-select-popup .arco-tree-node:hover{background:var(--ca-popover-hover)}
.arco-tree-select-popup .arco-tree-node-selected .arco-tree-node-title,.arco-tree-select-popup .arco-tree-node:hover .arco-tree-node-title{background:transparent;color:var(--ca-ink)}
.arco-tree-select-popup .arco-checkbox-checked .arco-checkbox-mask,.arco-tree-select-popup .arco-checkbox-indeterminate .arco-checkbox-mask{background:var(--ca-primary);border-color:var(--ca-primary)}
.inv-filter-tools{display:flex;align-items:center;gap:8px;padding:5px 8px 7px;border-bottom:1px solid var(--ca-line);color:var(--ca-ink-2);font-size:12px}
.inv-filter-empty{padding:10px;color:var(--ca-ink-2);font-size:13px}
`;

const roots = new Map();
const romanized = name => {
  const raw = String(name || '').toLocaleLowerCase();
  const syllables = pinyin(raw, { toneType: 'none', type: 'array' }).map(x => String(x).toLocaleLowerCase());
  return [raw, syllables.join(''), syllables.map(x => x[0] || '').join('')];
};
const matches = (item, text) => {
  const q = text.trim().toLocaleLowerCase();
  if (!q) return true;
  return [item.id, item.code, ...romanized(item.name)].some(x => String(x || '').toLocaleLowerCase().includes(q));
};

function FilterSelect({ kind, host, portal, source }) {
  const initial = useRef(source.snapshot(kind)).current;
  const items = useMemo(() => kind === 'warehouses'
    ? [...initial.items].sort((a, b) => Number(b.name === '多立方总仓') - Number(a.name === '多立方总仓'))
    : initial.items, []);
  const ids = useMemo(() => items.map(item => item.id), [items]);
  const names = useMemo(() => new Map([[ALL, `全部${initial.label}`], ...items.map(item => [item.id, item.name])]), [items]);
  const initialAll = initial.defaultAll || initial.selected.length === ids.length && ids.every(id => initial.selected.includes(id));
  const [value, setValue] = useState(initialAll ? [ALL, ...ids] : initial.selected);
  const [input, setInput] = useState('');
  const [width, setWidth] = useState(host.getBoundingClientRect().width);
  const ref = useRef();
  const found = useMemo(() => items.filter(item => matches(item, input)), [items, input]);
  const byId = useMemo(() => new Map(items.map(item => [item.id, item])), [items]);
  const treeData = useMemo(() => [
    { key: ALL, value: ALL, title: `全部${initial.label}` },
    ...items.map(item => ({ key: item.id, value: item.id, title: item.name })),
  ], [items]);
  const selectedIds = value.includes(ALL) ? ids : value;
  const allSelected = value.includes(ALL);
  const visibleTagLimit = useMemo(() => {
    if (value.length < 2) return 3;
    const context = document.createElement('canvas').getContext('2d');
    if (!context) return 1;
    context.font = '13px Arial';
    const widths = value.slice(0, 3).map(id => Math.min(context.measureText(names.get(id) || id).width + 37, width - 50));
    for (let count = Math.min(3, value.length); count > 1; count--) {
      const reserve = value.length > count ? 92 : 42;
      if (widths.slice(0, count).reduce((sum, next) => sum + next, 0) + (count - 1) * 4 + reserve <= width) return count;
    }
    return 1;
  }, [value, width, names]);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => setWidth(host.getBoundingClientRect().width));
    observer.observe(host);
    return () => observer.disconnect();
  }, [host]);
  function commitSelection(next) {
    const selectedSet = new Set(next.filter(id => byId.has(id)));
    const selected = ids.filter(id => selectedSet.has(id));
    const complete = ids.length > 0 && selected.length === ids.length;
    setValue(complete ? [ALL, ...ids] : selected);
    source.setSelected(kind, complete && kind !== 'warehouses' ? null : selected);
    setInput('');
    requestAnimationFrame(() => ref.current?.focus());
  }
  function choose(next, extra = {}) {
    const key = extra.trigger?.value || extra.trigger?._key || extra.trigger?.key;
    if (key === ALL) return commitSelection(extra.checked ? ids : []);
    if (byId.has(key)) {
      const selected = new Set(selectedIds);
      if (extra.checked) selected.add(key);
      else selected.delete(key);
      return commitSelection([...selected]);
    }
    const raw = (Array.isArray(next) ? next : [next]).map(item => typeof item === 'object' ? item?.value : item).filter(Boolean);
    commitSelection(raw.includes(ALL) ? ids : raw);
  }
  return <TreeSelect
    ref={ref}
    className={allSelected ? 'inv-all-selected' : undefined}
    aria-label={`${initial.ariaLabel || initial.label}，多选`}
    style={{ width: '100%' }}
    treeData={treeData}
    treeCheckable
    multiple
    treeCheckStrictly
    treeCheckedStrategy={TreeSelect.SHOW_ALL}
    showSearch={{ retainInputValueWhileSelect: false }}
    filterTreeNode={(text, node) => {
      const id = node.props.value;
      return id === ALL || matches(byId.get(id) || { id, name: node.props.title }, String(text));
    }}
    inputValue={input}
    onInputValueChange={setInput}
    value={value}
    onChange={choose}
    placeholder={`搜索${initial.label}`}
    notFoundContent={<div className="inv-filter-empty">没有匹配的{initial.label}</div>}
    maxTagCount={{ count: allSelected ? 1 : visibleTagLimit, render: count => allSelected ? null : <span className="inv-filter-count" title={value.slice(visibleTagLimit).map(id => names.get(id) || id).join('、')}>+{count} 更多</span>, showPopover: false }}
    renderFormat={(_, id) => names.get(typeof id === 'string' ? id : id.value) || String(id)}
    getPopupContainer={() => portal}
    triggerProps={{ position: 'bl', autoAlignPopupWidth: false, popupStyle: { width: Math.min(Math.max(width, 300), window.innerWidth - host.getBoundingClientRect().left - 12) } }}
    dropdownRender={menu => <div><div className="inv-filter-tools">匹配 {found.length} 项 · 已选 {selectedIds.length} 项</div>{menu}{input && !found.length && <div className="inv-filter-empty">没有匹配的{initial.label}</div>}</div>}
  />;
}

const transferBridge = {
  snapshot(kind) {
    const state = window.TRANSFER_UI.state;
    const selected = state.filter[kind];
    const scope = window.SALES_SERVICE?.session?.warehouses;
    const warehouses = window.ERP_DEMO.warehouses.filter(item => item.enabled !== false && (!scope || scope.includes(item.id)));
    return {
      items: kind === 'status'
        ? [{ id: '未审核', name: '未审核' }, { id: '已审核', name: '已审核' }, { id: '已作废', name: '已作废' }]
        : warehouses.map(item => ({ id: item.id, name: item.name, code: item.code })),
      selected: Array.isArray(selected) ? selected : selected ? [selected] : [],
      defaultAll: !selected || Array.isArray(selected) && selected.length === 0,
      label: kind === 'status' ? '状态' : '仓库',
      ariaLabel: kind === 'from' ? '调出仓库' : kind === 'to' ? '调入仓库' : '状态',
    };
  },
  setSelected(kind, ids) {
    window.TRANSFER_UI.state.filter[kind] = ids ? [...ids] : [];
  },
};

const salesBridge = {
  snapshot(kind) {
    const service = window.SALES_SERVICE;
    const selected = window.SALES_UI.state.filter[kind];
    const stores = window.BUSINESS_CONFIG.available(service.catalog, service.session);
    const items = kind === 'status'
      ? ['未审核', '已审核', '已作废'].map(name => ({ id: name, name }))
      : kind === 'businessType'
        ? ['销售', '退货/换货'].map(name => ({ id: name, name }))
        : kind === 'storeId' ? stores
          : kind === 'salespersonId' ? service.catalog.staff.filter(person => person.enabled !== false && person.employmentStatus !== '离职').sort((a,b) => { const id=window.BUSINESS_CONFIG.currentUser(service.catalog,service.session)?.id; return Number(b.id===id)-Number(a.id===id); })
            : kind === 'customerId' ? service.catalog.customers.filter(item => item.enabled !== false)
              : window.ERP_DEMO.warehouses.filter(item => item.enabled !== false && (!service.session?.warehouses || service.session.warehouses.includes(item.id)));
    const label = ({ status: '状态', businessType: '业务类型', storeId: '营业厅', salespersonId: '营业员', customerId: '客户', warehouseId: '仓库' })[kind];
    return { items: items.map(item => ({ id: item.id, name: item.name, code: item.code })), selected: Array.isArray(selected) ? selected : selected ? [selected] : [], defaultAll: !selected?.length, label, ariaLabel: kind === 'warehouseId' ? '出库仓' : label };
  },
  setSelected(kind, ids) {
    const selected = Array.isArray(ids) ? ids : [];
    const all = salesBridge.snapshot(kind).items.map(item => item.id);
    window.SALES_UI.state.filter[kind] = selected.length === all.length ? [] : selected;
  },
};

function mountFilter(kind, host, source) {
  for (const [mounted, root] of roots) if (!mounted.isConnected) { root.unmount(); roots.delete(mounted); }
  if (!host || roots.has(host)) return;
  const shadow = host.attachShadow({ mode: 'open' });
  const arco = document.createElement('style');
  arco.textContent = arcoCss.replace(/\bbody\s*\{/g, ':host {');
  const local = document.createElement('style');
  local.textContent = styleText;
  const app = document.createElement('div');
  app.id = 'root';
  const portal = document.createElement('div');
  portal.id = 'portal';
  shadow.append(arco, local, app, portal);
  const root = createRoot(app);
  roots.set(host, root);
  root.render(<FilterSelect kind={kind} host={host} portal={portal} source={source} />);
}

window.INVENTORY_FILTERS = {
  beforeRender() {
    for (const root of roots.values()) root.unmount();
    roots.clear();
  },
  mount(kind, host) {
    mountFilter(kind, host, bridge);
  },
  mountTransfer(kind, host) {
    mountFilter(kind, host, transferBridge);
  },
  mountSales(kind, host) {
    mountFilter(kind, host, salesBridge);
  },
  mountBasic(kind, host, source) { mountFilter(kind, host, source); },
  unmount(host) { const root=roots.get(host);if(root){root.unmount();roots.delete(host)} },
  mountProduct(kind, host) {
    mountFilter(kind, host, window.PRODUCT_FILTER_BRIDGES.multi);
  },
};
if (location.hash.slice(1) === 'products') queueMicrotask(() => window.PRODUCT_UI?.render());
