import { UIButton } from './standard-controls.tsx';
export { createInventoryProductSelectStyles } from './product-candidate-styles.ts';
import { Tag, Select } from '@arco-design/web-react';
import type { TagProps, SelectOptionProps as OptionProps, SelectProps } from '@arco-design/web-react';
import type { ComponentRef } from 'react';
type SelectHandle = ComponentRef<typeof Select>;
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type ComponentType, type CSSProperties, type ForwardRefExoticComponent, type RefAttributes } from 'react';
import type { Candidate } from '../inventory/contracts.ts';
import type { ProductCandidateActionProps } from './candidate-selector-contract.ts';
import { useInventoryCandidates } from './use-inventory-candidates.ts';
import { ProductCandidatePreview } from './product-candidate-preview.tsx';
const remoteSearch = () => undefined;

/** Frozen inventory-select.jsx presentation. Only the active popup owns reads. */
export function ProductCandidateAction(props: ProductCandidateActionProps) {
  const attached = useRef(false); const live = useRef(props); live.current = props;
  const isCurrent = () => attached.current && live.current === props && props.scope.active;
  const currentOpen = () => isCurrent() && props.open && !!props.activationScope?.active;
  useLayoutEffect(() => { attached.current = true; return () => { attached.current = false; }; }, []);
  const composition = useRef({ active: false, endedAt: -Infinity });
  const host = useRef<HTMLDivElement>(null); const select = useRef<SelectHandle | null>(null);
  const [mounted, setMounted] = useState(false); const [, refreshPortal] = useReducer((value: number) => value + 1, 0);
  const [selectionNotice, setSelectionNotice] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [history, setHistory] = useState<readonly string[]>([]); const [known, setKnown] = useState<ReadonlyMap<string, Candidate>>(() => new Map());
  const [activeId, setActiveId] = useState(''); const [geometry, setGeometry] = useState({ width: 0, left: 0, right: 0, viewport: 0 });
  const selected = useRef(props.selected); selected.current = props.selected;
  const open = props.open && !!props.activationScope?.active && props.scope.active;
  const search = props.search.trim(); const recent = !search;
  const { query, snapshot } = useInventoryCandidates(open && !recent ? props.activationScope : null, props.reader, 'product', props.categoryIds, () => selected.current.map(item => item.id));
  const current = snapshot.search === search ? snapshot : null; const candidates = current?.items ?? [];
  const currentCandidates = useRef(candidates); currentCandidates.current = candidates;
  const active = candidates.find(item => item.id === activeId) ?? candidates[0];
  const busy = !current || current.phase === 'idle' || current.phase === 'loading';
  useEffect(() => { if (!query || recent) return; query.reset(search); const timer = setTimeout(() => { void query.loadNext(); }, 180); return () => { clearTimeout(timer); query.reset(search); }; }, [query, search, recent]);
  useEffect(() => { setMounted(true); if (props.focusOnMount) select.current?.focus(); }, []);
  useEffect(() => {
    if (!mounted || !open) return; let active = true; queueMicrotask(() => { if (active) refreshPortal(); }); return () => { active = false; };
  }, [mounted, open]);
  useLayoutEffect(() => {
    const element = host.current; if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect(); const row = element.closest('.iw-query-row');
      const warehouse = row?.querySelector<HTMLElement>('[data-multi-label="仓库"]')?.getBoundingClientRect();
      setGeometry({ width: rect.width, left: rect.left, right: warehouse && Math.abs(warehouse.top - rect.top) < 3 ? warehouse.right : 0, viewport: window.innerWidth });
    };
    measure(); window.addEventListener('resize', measure);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null; observer?.observe(element);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  const available = Math.max(0, geometry.viewport - geometry.left - 12);
  const popupWidth = Math.min(recent || !candidates.length ? geometry.width : Math.max(geometry.width + 308, geometry.right - geometry.left), available);
  const listWidth = Math.min(geometry.width, Math.max(250, popupWidth - 308));
  const visibleTagLimit = useMemo(() => {
    if (props.selected.length < 2) return 3;
    const context = document.createElement('canvas').getContext('2d'); if (!context) return Math.min(3, props.selected.length);
    context.font = '13px Arial'; const widths = props.selected.slice(0, 3).map(item => context.measureText(known.get(item.id)?.code ?? item.label).width + 39);
    for (let count = Math.min(3, props.selected.length); count > 1; count--) {
      const reserve = props.selected.length > count ? 112 : 64;
      if (widths.slice(0, count).reduce((sum, width) => sum + width, 0) + (count - 1) * 4 + reserve <= geometry.width) return count;
    } return 1;
  }, [props.selected, known, geometry.width]);
  const remember = (value: string) => setHistory(previous => [value, ...previous.filter(item => item !== value)].slice(0, 20));
  const selectCandidate = (item: Candidate) => {
    if (!currentOpen()) return;
    const target = currentCandidates.current.find(value => value.id === item.id);
    if (!target || target.disabled || !target.code || !target.name) return;
    const code = target.code;
    if (props.selected.length >= 100 && !props.selected.some(value => value.id === target.id)) { setSelectionNotice('最多可明确选择 100 款商品，请减少选择。'); return; }
    setSelectionNotice(''); setKnown(previous => new Map(previous).set(target.id, target)); remember(code);
    if (!props.selected.some(value => value.id === target.id)) props.onChange([...props.selected, { id: target.id, label: target.label }]);
    props.onSearch(''); setActiveId(''); select.current?.focus();
  };
  const optionList = recent ? history.length ? history.map((value, index) => <Select.Option key={value} value={`__recent__${index}`}>
    <span className="inv-recent"><span title={value}>{value}</span><UIButton type="button" aria-label={`删除最近搜索 ${value}`} onMouseDown={event => { event.preventDefault(); event.stopPropagation(); }}
      onClick={event => { event.preventDefault(); event.stopPropagation(); if (!currentOpen()) return; setHistory(previous => previous.filter(item => item !== value)); }}>×</UIButton></span>
  </Select.Option>) : [<Select.Option key="empty" value="__recent_empty__" disabled>暂无最近搜索</Select.Option>] : candidates.map(item => <Select.Option key={item.id} value={item.id} {...(item.disabled === undefined ? {} : { disabled: item.disabled })} data-product-id={item.id}
    {...(active?.id === item.id ? { className: 'inv-active-option' } : {})} onMouseEnter={() => { if (currentOpen()) setActiveId(item.id); }}>
    <span className="inv-option-row"><span className="inv-option-code">{item.code}</span><span className="inv-option-name">{item.name}</span></span>
  </Select.Option>);
  return <div ref={host} className="inventory-product-select" onCompositionStart={() => { composition.current.active = true; }} onCompositionEnd={() => { composition.current.active = false; composition.current.endedAt = Date.now(); }} onKeyDownCapture={event => {
    if (!isCurrent()) return;
    if (event.key === 'Enter') {
      event.preventDefault(); event.stopPropagation(); if (event.nativeEvent.isComposing || event.keyCode === 229 || composition.current.active || Date.now() - composition.current.endedAt < 40) return;
      if (!recent && open) { const item = candidates.find(value => value.id === (activeId || active?.id)); if (item) selectCandidate(item); }
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !recent && candidates.length && !composition.current.active) {
      event.preventDefault(); event.stopPropagation(); const index = Math.max(0, candidates.findIndex(item => item.id === (activeId || active?.id)));
      setActiveId(candidates[(index + (event.key === 'ArrowDown' ? 1 : -1) + candidates.length) % candidates.length]!.id);
    }
  }}><Select ref={select} {...(props.selected.length ? { className: 'inv-has-tags' } : {})} aria-label="商品搜索，多选" mode="multiple" showSearch
    value={props.selected.map(item => item.id)} inputValue={props.search} filterOption={false} onSearch={remoteSearch} disabled={!props.scope.active}
    popupVisible={mounted && open} unmountOnExit allowClear={false} placeholder={props.placeholder ?? '商品款号 / 名称 / 系统货号'}
    arrowIcon={<svg aria-hidden="true" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="4"><circle cx="21" cy="21" r="13"/><path d="m31 31 10 10"/></svg>}
    maxTagCount={{ count: visibleTagLimit, render: count => <span className="inv-count">+{count} 更多</span>, showPopover: false }}
    renderTag={({ value, closable }) => { const id = String(value); const item = props.selected.find(item => item.id === id); const code = known.get(id)?.code ?? item?.label ?? '';
      return <Tag className="inv-tag" closable={closable} onClose={() => { if (isCurrent()) props.onChange(props.selected.filter(item => item.id !== id)); }}><UIButton type="button" className="inv-tag-copy"
        title={`点击复制款号 ${code}`} aria-label={`复制款号 ${code}`} onMouseDown={event => event.preventDefault()} onClick={event => { event.stopPropagation(); if (!isCurrent()) return;
          void navigator.clipboard?.writeText(code).then(() => { if (isCurrent()) setCopyStatus(`已复制款号 ${code}`); }, () => { if (isCurrent()) setCopyStatus('复制失败，请检查剪贴板权限'); }); select.current?.focus();
        }}>{code}</UIButton></Tag>; }}
    renderFormat={(_option, value) => { const id = typeof value === 'object' && value !== null ? value.value : value; if (typeof id !== 'string') return ''; return known.get(id)?.code ?? props.selected.find(item => item.id === id)?.label ?? ''; }}
    getPopupContainer={() => { if (!host.current) throw new Error('Product search host is not mounted.'); return host.current; }}
    triggerProps={{ position: 'bl', autoAlignPopupWidth: false, popupStyle: { width: popupWidth || undefined } }}
    onInputValueChange={(value, reason) => { if (reason !== 'manual' || !isCurrent()) return; setSelectionNotice(''); query?.reset(''); setActiveId(''); props.onSearch(value); }}
    onVisibleChange={visible => { if (isCurrent()) props.onOpen(visible); }}
    onChange={(values: string[]) => {
      if (!isCurrent()) return;
      const recentValue = values.find(value => value.startsWith('__recent__'));
      if (recentValue && open) { const value = history[Number(recentValue.slice('__recent__'.length))]; if (value) { query?.reset(''); props.onSearch(value); setActiveId(''); } return; }
      const added = values.find(id => !props.selected.some(item => item.id === id));
      if (added) { const item = candidates.find(value => value.id === added); if (item) selectCandidate(item); return; }
      if (!open) return;
      props.onChange(props.selected.filter(item => values.includes(item.id)));
    }}
    dropdownRender={menu => recent ? <div className="inv-history-menu"><div className="inv-menu-heading"><span>最近搜索</span>{history.length > 0 && <UIButton type="button" aria-label="清空最近搜索" onMouseDown={event => event.preventDefault()} onClick={() => { if (currentOpen()) setHistory([]); }}>清空</UIButton>}</div>{menu}</div>
      : <div className={candidates.length ? 'inv-menu-grid' : 'inv-menu-grid inv-menu-grid-empty'} style={{ '--inv-list-width': `${listWidth}px` } as CSSProperties}>
        <div className="inv-menu-list" onScrollCapture={event => { const element = event.target as HTMLElement; if (element.classList.contains('arco-select-popup-inner') && element.scrollHeight > element.clientHeight && element.scrollTop + element.clientHeight >= element.scrollHeight - 48) void query?.loadNext(); }}>
          {candidates.length > 0 && <div className="inv-result-heading" aria-hidden="true"><span>商品款号</span><span>商品名称</span></div>}{menu}
          {selectionNotice && <p className="inv-no-result" role="status">{selectionNotice}</p>}
          {busy && <p className="inv-no-result" role="status">正在查找…</p>}
          {current?.phase === 'error' && <p className="inv-no-result" role="alert">候选暂不可读取。<UIButton type="button" className="iw-link" onClick={() => { query?.reset(search); void query?.loadNext(); }}>重试候选</UIButton></p>}
          {current?.phase === 'success' && !candidates.length && <p className="inv-no-result">没有匹配商品，可继续输入</p>}
          {current?.limitReached && <p className="inv-no-result" role="status">已加载 200 项，请继续输入缩小范围。匹配总数 {current.exactTotal} 项。</p>}
        </div>{active && open && props.activationScope && props.productReader && <ProductCandidatePreview parent={props.activationScope} reader={props.productReader} productId={active.id} />}
      </div>}>
    {optionList}
  </Select><span className="sr-only" role="status">{copyStatus}</span></div>;
}
