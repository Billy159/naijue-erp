/* Inventory category picker. Product search in inventory-select.jsx is the visual baseline. */
import React, { useLayoutEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import TreeSelect from '@arco-design/web-react/es/TreeSelect';
import arcoCss from '@arco-design/web-react/dist/css/arco.css?inline';

const bridge = window.INVENTORY_CATEGORY_BRIDGE;
const css = `
:host{display:block;width:100%;min-width:0;font:13px Arial,"PingFang SC","Microsoft YaHei",sans-serif;color:var(--ca-ink);--arcoblue-6:var(--ca-primary-rgb);--primary-6:var(--ca-primary-rgb);--color-text-1:var(--ca-ink);--color-text-2:var(--ca-ink-2);--color-border-2:var(--ca-control-border)}
#root{width:100%;min-width:0}
#portal{position:fixed;inset:0;z-index:1600;pointer-events:none}
#portal>*{pointer-events:auto}
.arco-tree-select{display:block;width:100%;font-size:13px}
.arco-tree-select .arco-tree-select-view{height:32px;min-height:32px;max-height:32px;overflow:hidden;border:1px solid transparent;border-radius:var(--ca-radius-control);background:var(--ca-surface-muted);box-shadow:none}
.arco-tree-select:hover .arco-tree-select-view{border-color:transparent;background:var(--ca-surface-muted)}
.arco-tree-select.arco-tree-select-focused .arco-tree-select-view{border-color:var(--ca-control-focus-border);background:var(--ca-surface-muted);box-shadow:none}
.arco-tree-select .arco-input-tag,.arco-tree-select .arco-input-tag:hover,.arco-tree-select .arco-input-tag.arco-input-tag-focus{background:transparent!important}
.arco-tree-select .arco-input-tag-view,.arco-tree-select .arco-input-tag-inner{min-width:0}
.arco-tree-select .arco-input-tag-inner{flex-wrap:nowrap;white-space:nowrap}
.arco-tree-select .arco-input-tag .arco-input-tag-tag{height:23px;line-height:23px;max-width:calc(100% - 42px);flex:none;white-space:nowrap;background:var(--ca-surface);color:var(--ca-ink);border:0;border-radius:3px;box-shadow:none}
.arco-tree-select .arco-tag-content{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.arco-tree-select .arco-input-tag .arco-input-tag-tag:has(.inv-cat-count){padding-inline:3px;border:0;background:transparent;box-shadow:none}
.inv-cat-count{white-space:nowrap;color:var(--ca-ink-2);font-size:12px}
.arco-tree-select .arco-tag-close-icon,.arco-tree-select .arco-icon-hover{color:var(--ca-ink-2)}
.arco-tree-select-view input{font-size:13px;min-width:32px;background:transparent}
.arco-tree-select-view .arco-tree-select-view-suffix{flex:none}
.arco-trigger-popup{max-width:calc(100vw - 24px)}
.arco-tree-select-popup{box-sizing:border-box;padding:4px;border:1px solid var(--ca-popover-border);border-radius:var(--ca-radius-card);box-shadow:var(--ca-shadow-float);background:var(--ca-popover-bg);color:var(--ca-ink)}
.arco-tree-select-popup .arco-tree{max-height:320px;overflow-y:auto;scrollbar-gutter:stable}
.arco-tree-select-popup .arco-tree-node{min-height:30px;color:var(--ca-ink)}
.arco-tree-select-popup .arco-tree-node-title{font-size:13px;color:var(--ca-ink)}
.arco-tree-select-popup .arco-tree-node-selected .arco-tree-node-title,.arco-tree-select-popup .arco-tree-node:hover .arco-tree-node-title{background:var(--ca-popover-hover);color:var(--ca-ink)}
.arco-tree-select-popup .arco-checkbox-checked .arco-checkbox-mask,.arco-tree-select-popup .arco-checkbox-indeterminate .arco-checkbox-mask{background:var(--ca-primary);border-color:var(--ca-primary)}
`;

let root;
let mountedHost;

function CategorySelect({ portal, host, source }) {
  const initial = source.snapshot();
  const [value, setValue] = useState(initial.selected);
  const [search, setSearch] = useState('');
  const [expandedKeys, setExpandedKeys] = useState(['all']);
  const [width, setWidth] = useState(host.getBoundingClientRect().width);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => setWidth(host.getBoundingClientRect().width));
    observer.observe(host);
    return () => observer.disconnect();
  }, [host]);
  const treeData = useMemo(() => {
    const byId = new Map(initial.nodes.map(node => [node.id, {
      key: node.id,
      value: node.id,
      title: node.id === 'all' ? '全部分类' : node.name,
      children: [],
    }]));
    const roots = [];
    for (const node of initial.nodes) {
      const item = byId.get(node.id);
      const parent = byId.get(node.parent);
      if (parent && node.parent !== 'all') parent.children.push(item);
      else roots.push(item);
    }
    return roots;
  }, []);
  const names = useMemo(() => new Map(initial.nodes.map(node => [node.id, node.id === 'all' ? '全部分类' : node.name])), []);
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
  const searchExpanded = useMemo(() => {
    if (!search.trim()) return expandedKeys;
    const nodes = new Map(initial.nodes.map(node => [node.id, node]));
    const expanded = new Set(expandedKeys);
    for (const node of initial.nodes) {
      if (!node.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) continue;
      let parent = node.parent;
      while (parent && nodes.has(parent)) {
        expanded.add(parent);
        parent = nodes.get(parent).parent;
      }
    }
    return [...expanded];
  }, [search, expandedKeys]);
  return <TreeSelect
    aria-label="商品分类"
    className="inventory-category-tree"
    style={{ width: '100%' }}
    size="default"
    treeData={treeData}
    treeCheckable
    multiple
    treeCheckStrictly={false}
    treeCheckedStrategy={TreeSelect.SHOW_PARENT}
    treeProps={{ expandedKeys: searchExpanded, onExpand: keys => setExpandedKeys(keys) }}
    showSearch={{ retainInputValueWhileSelect: false }}
    filterTreeNode={(text, node) => String(node.props.title || '').toLocaleLowerCase().includes(String(text).toLocaleLowerCase())}
    inputValue={search}
    onInputValueChange={value => setSearch(value)}
    placeholder="请选择分类"
    value={value}
    maxTagCount={{ count: visibleTagLimit, render: count => <span className="inv-cat-count" title={value.slice(visibleTagLimit).map(id => names.get(id) || id).join('、')}>+{count} 更多</span>, showPopover: false }}
    renderFormat={(_, id) => names.get(typeof id === 'string' ? id : id.value) || String(id)}
    getPopupContainer={() => portal}
    triggerProps={{ position: 'bl', autoAlignPopupWidth: false, popupStyle: { width: Math.min(Math.max(width, 300), window.innerWidth - host.getBoundingClientRect().left - 12) } }}
    onChange={next => {
      const ids = [...new Set((Array.isArray(next) ? next : [next]).filter(Boolean))];
      // "All" is a standalone choice so it cannot swallow a selected child.
      const selected = ids.includes('all') && !value.includes('all') ? ['all'] : ids.filter(id => id !== 'all');
      if (!selected.length) selected.push('all');
      setValue(selected);
      source.setSelected(selected);
    }}
  />;
}

window.INVENTORY_CATEGORY = {
  beforeRender() {
    if (root) root.unmount();
    root = undefined;
    mountedHost = undefined;
  },
  mount(host, source = bridge) {
    if (!host || host === mountedHost) return;
    this.beforeRender();
    mountedHost = host;
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = arcoCss.replace(/\bbody\s*\{/g, ':host {');
    const local = document.createElement('style');
    local.textContent = css;
    const app = document.createElement('div');
    app.id = 'root';
    const portal = document.createElement('div');
    portal.id = 'portal';
    shadow.append(style, local, app, portal);
    root = createRoot(app);
    root.render(<CategorySelect portal={portal} host={host} source={source} />);
  },
};
window.INVENTORY_CATEGORY.mount(document.querySelector('#inventory-arco-category'));
if (document.querySelector('#product-arco-category')) window.INVENTORY_CATEGORY.mount(document.querySelector('#product-arco-category'), window.PRODUCT_FILTER_BRIDGES?.category);
