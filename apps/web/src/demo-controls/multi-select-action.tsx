export { createDemoMultiSelectStyles } from './multi-select-styles.ts';
import ArcoTreeSelect from '@arco-design/web-react/es/TreeSelect/index.js';
import ArcoTree from '@arco-design/web-react/es/Tree/index.js';
import type { RefTreeSelectType, TreeSelectProps } from '@arco-design/web-react/es/TreeSelect/interface.js';
import type { TreeProps } from '@arco-design/web-react/es/Tree/interface.js';
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type ComponentType, type ForwardRefExoticComponent, type RefAttributes } from 'react';
import type { DemoMultiOption, DemoMultiSelectActionProps } from './multi-select-contract.ts';
import { createCategoryBranchProjection, changeCategoryBranchSelection } from './category-branch-model.ts';

// NodeNext's CJS-namespace type interpretation must not broaden the runtime
// dependency to the all-component barrel. Keep the actual TreeSelect leaf.
const TreeSelect = ArcoTreeSelect as unknown as ForwardRefExoticComponent<TreeSelectProps & RefAttributes<RefTreeSelectType>> & { readonly SHOW_ALL: 'all' };
const Tree = ArcoTree as unknown as ComponentType<TreeProps>;
const ALL = '__demo_multi_all__';
// Controlled remote candidates must not retain Arco's stale local hitKeys.
// This callback does no read; all data ownership stays with the caller.
const remoteSearch = () => undefined;

function matchesOption(option: DemoMultiOption, text: string): boolean {
  const search = text.trim().toLocaleLowerCase();
  return [option.id, option.name, ...option.searchTerms ?? []].some(term => term.toLocaleLowerCase().includes(search));
}
export function DemoMultiSelectAction(props: DemoMultiSelectActionProps) {
  const host = useRef<HTMLDivElement>(null);
  const select = useRef<RefTreeSelectType | null>(null);
  const [mounted, setMounted] = useState(false);
  const names = new Map([[ALL, props.allLabel], ...[...props.selectedOptions ?? [], ...props.options].map(item => [item.id, item.name] as const)]);
  const [width, setWidth] = useState(0); const [localSearch, setLocalSearch] = useState(''); const [localOpen, setLocalOpen] = useState(false);
  const popupOpen = !props.disabled && (props.open ?? localOpen); const [, refreshPortal] = useReducer((value: number) => value + 1, 0);
  const search = props.search ?? localSearch; const allSelected = props.value.length === 0;
  const found = props.onSearch ? props.options : props.options.filter(option => matchesOption(option, search));
  const categoryBranches = props.hierarchy === 'category-branches';
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const branchProjection = useMemo(() => {
    if (!categoryBranches) return null;
    try { return createCategoryBranchProjection(props.options, props.selectedOptions ?? [], props.value); }
    catch { return null; }
  }, [categoryBranches, props.options, props.selectedOptions, props.value]);
  const branchAlive = useRef(false);
  const branchGeneration = useRef(0);
  const previousBranchOpen = useRef(popupOpen);
  if (previousBranchOpen.current !== popupOpen) { previousBranchOpen.current = popupOpen; branchGeneration.current++; }
  const branchLive = useRef({ props, popupOpen, branchProjection, search, categoryBranches });
  branchLive.current = { props, popupOpen, branchProjection, search, categoryBranches };
  const branchTicket = branchGeneration.current;
  useLayoutEffect(() => {
    branchAlive.current = true;
    return () => { branchAlive.current = false; branchGeneration.current++; };
  }, []);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (props.focusOnMount && !props.disabled) select.current?.focus();
  }, []);
  useEffect(() => {
    if (!props.disabled || !(props.open ?? localOpen)) return;
    if (props.open === undefined) setLocalOpen(false);
    props.onOpen?.(false);
  }, [props.disabled, props.open, localOpen, props.onOpen]);
  useEffect(() => {
    // Arco 2.66.16 Portal detaches its container during React19 StrictMode
    // effect replay. A post-open render reattaches it, without changing the
    // open state, starting another read, or reviving a dismissed popup.
    if (!mounted || !popupOpen) return;
    let active = true; queueMicrotask(() => { if (active) refreshPortal(); });
    return () => { active = false; };
  }, [mounted, popupOpen]);
  useLayoutEffect(() => {
    const element = host.current; if (!element) return;
    const update = () => setWidth(element.getBoundingClientRect().width); update();
    if (typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(update); observer.observe(element); return () => observer.disconnect();
  }, []);
  // Frozen inventory-filters.jsx fit calculation, not a fixed one-tag redesign.
  const visibleTagLimit = useMemo(() => {
    if (props.value.length < 2) return 3;
    const context = document.createElement('canvas').getContext('2d'); if (!context) return 1;
    context.font = '13px Arial';
    const widths = props.value.slice(0, 3).map(id => Math.min(context.measureText(names.get(id) ?? id).width + 37, width - 50));
    for (let count = Math.min(3, props.value.length); count > 1; count--) {
      const reserve = props.value.length > count ? 92 : 42;
      if (widths.slice(0, count).reduce((sum, value) => sum + value, 0) + (count - 1) * 4 + reserve <= width) return count;
    }
    return 1;
  }, [props.value, width, names]);
  const clearSearch = () => { if (search) (props.onSearch ?? setLocalSearch)(''); };
  const chooseBranch = (key: string, checked: boolean, tagRemoval = false) => {
    const current = branchLive.current;
    if (!branchAlive.current || branchTicket !== branchGeneration.current || !current.categoryBranches || current.props.disabled || !current.popupOpen && !tagRemoval) return;
    const clearCurrentSearch = () => { if (current.search) (current.props.onSearch ?? setLocalSearch)(''); };
    if (key === ALL) { clearCurrentSearch(); current.props.onChange([]); return; }
    if (!current.branchProjection) return;
    const result = changeCategoryBranchSelection(current.branchProjection, current.props.value, key, checked, tagRemoval ? 'tag' : 'checkbox');
    if (result.kind === 'refused') { current.props.onIncompleteSelection?.(result.option, result.reason); return; }
    if (result.kind === 'change') { clearCurrentSearch(); current.props.onChange(result.ids); }
  };
  const categoryMenu = () => {
    if (!branchProjection) return <div className="inv-filter-empty" role="alert">分类层级数据无效，请重新打开候选。</div>;
    const foundIds = new Set(found.map(option => option.id));
    const treeData = branchProjection.treeData.flatMap(parent => {
      const children = parent.children?.filter(child => foundIds.has(child.key)).map(child => ({ key: child.key, title: child.title, disabled: !!child.disabled && !props.value.includes(child.key) }));
      return foundIds.has(parent.key) || children?.length ? [{ key: parent.key, title: parent.title, disabled: !!parent.disabled && !props.value.includes(parent.key), ...(children ? { children } : {}) }] : [];
    });
    const visibleParents = treeData.filter(node => node.children?.length).map(node => node.key);
    const expanded = search.trim() ? [...new Set([...expandedKeys, ...visibleParents])] : expandedKeys;
    return <Tree treeData={[{ key: ALL, title: props.allLabel }, ...treeData]} checkable multiple checkStrictly checkedStrategy="all"
      blockNode checkedKeys={allSelected ? [ALL, ...branchProjection.checkedIds] : [...branchProjection.checkedIds]}
      halfCheckedKeys={[]} selectedKeys={[]} expandedKeys={expanded} onExpand={setExpandedKeys}
      onMouseDown={event => event.preventDefault()}
      onCheck={(_keys, extra) => { const key = extra.node.props._key; if (typeof key === 'string') chooseBranch(key, extra.checked); }}
      onSelect={(_keys, extra) => { const key = extra.node.props._key; if (typeof key === 'string') chooseBranch(key, key === ALL ? !allSelected : !branchProjection.checkedIds.includes(key)); }}
      {...(props.onMenuScroll ? { virtualListProps: { height: 320, threshold: props.menuItemLimit ?? 202, onScroll: props.onMenuScroll } } : {})} />;
  };
  // Arco unsets its source popup cap when a virtual-list height is supplied.
  // An empty dropdown maxHeight restores the installed CSS cap. Scoped flex
  // keeps the tree as the scroll target used by bounded remote pagination.
  return <div ref={host} className={`demo-multi-select${categoryBranches ? ' demo-multi-select--category-branches' : ''}${props.onMenuScroll ? ' demo-multi-select--scroll-menu' : ''}`}><TreeSelect ref={select} {...(allSelected ? { className: 'inv-all-selected' } : {})}
    aria-label={`${props.label}，多选`} treeData={[{ key: ALL, value: ALL, title: props.allLabel }, ...props.options.map(item => ({ key: item.id, value: item.id, title: item.name, disabled: !!item.disabled && !props.value.includes(item.id) }))]}
    value={allSelected ? categoryBranches ? [ALL] : [ALL, ...props.options.map(item => item.id)] : [...props.value]} multiple treeCheckable treeCheckStrictly treeCheckedStrategy={TreeSelect.SHOW_ALL}
    showSearch={{ retainInputValueWhileSelect: false }} placeholder={`搜索${props.label}`} allowClear={false} unmountOnExit
    disabled={!!props.disabled} popupVisible={mounted && popupOpen}
    onVisibleChange={visible => { const next = visible && !props.disabled; if (props.open === undefined) setLocalOpen(next); if (!next && !props.onSearch) setLocalSearch(''); props.onOpen?.(next); }}
    inputValue={search} onInputValueChange={(value, reason) => { if (!props.disabled && reason === 'manual') (props.onSearch ?? setLocalSearch)(value); }}
    {...(props.onSearch ? { onSearch: remoteSearch } : {})}
    filterTreeNode={(_text, node) => node.props.value === ALL || found.some(option => option.id === node.props.value)}
    maxTagCount={{ count: allSelected ? 1 : visibleTagLimit, render: count => allSelected ? null : <span className="inv-filter-count" title={props.value.slice(visibleTagLimit).map(id => names.get(id)).join('、')}>+{count} 更多</span>, showPopover: false }}
    renderFormat={(_option, value) => names.get(typeof value === 'string' ? value : value.value) ?? ''}
    getPopupContainer={() => {
      // Controlled first-open actions mount before exposing their local portal.
      // Never let a popup escape its owning route/drawer/session into body.
      if (!host.current) throw new Error('The Demo multi-select host is not mounted.');
      return host.current;
    }}
    triggerProps={{ position: 'bl', autoAlignPopupWidth: false, popupStyle: { width: Math.min(Math.max(width, 300), window.innerWidth - (host.current?.getBoundingClientRect().left ?? 0) - 12) } }}
    {...(props.onMenuScroll ? { treeProps: { virtualListProps: { height: 288, threshold: props.menuItemLimit ?? 202, onScroll: props.onMenuScroll } } } : {})}
    {...(props.onMenuScroll ? { dropdownMenuStyle: { maxHeight: '' } } : {})}
    dropdownRender={menu => {
      const content = categoryBranches ? categoryMenu() : menu;
      const rendered = props.renderMenu ? props.renderMenu(content) : <div><div className="inv-filter-tools">匹配 {found.length} 项 · 已选 {allSelected ? props.options.length : props.value.length} 项</div>{content}{search && !found.length && <div className="inv-filter-empty">没有匹配的{props.label}</div>}</div>;
      return props.onMenuScroll ? <div className="demo-multi-menu-viewport">{rendered}</div> : rendered;
    }}
    onChange={(values: unknown, extra) => {
      // Installed Arco marks tag removal with selected:false; ordinary checked
      // menu callbacks have no selected property. Keep closed-tag removal, but
      // never accept a closing/replaced popup's retained option callbacks.
      if (props.disabled || !popupOpen && extra.selected !== false) return;
      const key = extra.trigger?._key;
      if (categoryBranches) {
        if (typeof key === 'string') { chooseBranch(key, !!extra.checked, extra.selected === false); return; }
        // A selected-only value has no current Tree node. A tag removal may
        // remove exactly one retained canonical ID, never adopt projected keys.
        if (extra.selected === false) {
          const remaining = (Array.isArray(values) ? values : [values]).map((item: unknown) => typeof item === 'string' ? item : item && typeof item === 'object' && 'value' in item ? item.value : null);
          const removed = props.value.filter(id => !remaining.includes(id));
          if (removed.length === 1 && remaining.length === props.value.length - 1 && remaining.every(id => typeof id === 'string' && props.value.includes(id))) chooseBranch(removed[0]!, false, true);
        }
        return;
      }
      if (key === ALL) { clearSearch(); props.onChange([]); return; }
      if (typeof key === 'string' && names.has(key)) {
        const option = props.options.find(item => item.id === key) ?? props.selectedOptions?.find(item => item.id === key);
        if (option?.disabled && !props.value.includes(key)) return;
        if (allSelected && !props.completeUniverse) {
          if (option) props.onIncompleteSelection?.(option);
          return;
        }
        const selected = new Set(allSelected ? props.options.map(item => item.id) : props.value);
        if (extra.checked) selected.add(key); else selected.delete(key);
        const complete = props.completeUniverse && props.options.length > 0 && selected.size === props.options.length && props.options.every(item => selected.has(item.id));
        clearSearch(); props.onChange(complete ? [] : [...selected]); return;
      }
      const ids = (Array.isArray(values) ? values : [values]).map((item: unknown) => typeof item === 'string' ? item : item && typeof item === 'object' && 'value' in item ? item.value : null)
        .filter((id): id is string => typeof id === 'string' && id !== ALL && names.has(id));
      clearSearch(); props.onChange(ids);
    }} /></div>;
}
