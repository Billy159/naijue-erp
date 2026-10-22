import { UIButton, UIInput } from '../components/standard-controls.tsx';
import { useRef, useState } from 'react';
import type { CategoryTreeIndex } from './tree-model.ts';
import { visibleCategoryRows } from './tree-model.ts';

export function CatalogueCategoryTree({ index, selectedId, select }: { readonly index: CategoryTreeIndex; readonly selectedId: string | null; readonly select: (id: string) => void }) {
  const [search, setSearch] = useState(''), [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const tree = useRef<HTMLDivElement>(null), rows = visibleCategoryRows(index, expanded, search);
  const tabStop = rows.some(row => row.item.id === selectedId) ? selectedId : rows[0]?.item.id;
  const setOpen = (id: string, open: boolean) => setExpanded(previous => { const next = new Set(previous); if (open) next.add(id); else next.delete(id); return next; });
  const focus = (id: string) => tree.current?.querySelector<HTMLElement>(`[data-category-id="${id}"]`)?.focus();
  return <><div className="catalogue-tree-search"><UIInput type="search" aria-label="搜索分类" placeholder="搜索分类" value={search} onChange={nextValue => setSearch(nextValue)} />{search && <UIButton type="button" aria-label="清除分类搜索" onClick={() => setSearch('')}>×</UIButton>}</div><div ref={tree} className="catalogue-category-tree" role="tree" aria-label="商品分类" onKeyDown={event => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[role=treeitem]'), position = rows.findIndex(row => row.item.id === target?.dataset.categoryId), row = rows[position];
    if (!row) return;
    let next: string | undefined;
    if (event.key === 'ArrowDown') next = rows[position + 1]?.item.id;
    else if (event.key === 'ArrowUp') next = rows[position - 1]?.item.id;
    else if (event.key === 'Home') next = rows[0]?.item.id;
    else if (event.key === 'End') next = rows.at(-1)?.item.id;
    else if (event.key === 'ArrowRight') { if (row.item.childCount && !row.expanded) setOpen(row.item.id, true); else if (row.expanded) next = rows[position + 1]?.item.id; }
    else if (event.key === 'ArrowLeft') { if (row.expanded && !search.trim()) setOpen(row.item.id, false); else next = row.item.parentId ?? undefined; }
    else if (event.key === 'Enter' || event.key === ' ') select(row.item.id);
    else return;
    event.preventDefault(); event.stopPropagation(); if (next) focus(next);
  }}>{rows.map(row => <div key={row.item.id} role="treeitem" aria-level={row.depth + 1} aria-posinset={row.position} aria-setsize={row.siblings} aria-selected={selectedId === row.item.id} {...(row.item.childCount ? { 'aria-expanded': row.expanded } : {})} tabIndex={tabStop === row.item.id ? 0 : -1} className={`pc-tree-row${selectedId === row.item.id ? ' selected' : ''}`} data-category-id={row.item.id} style={{ paddingLeft: row.depth * 18 }} onClick={event => { select(row.item.id); event.currentTarget.focus(); }}><UIButton type="button" tabIndex={-1} className="catalogue-tree-toggle" aria-label={`${row.expanded ? '收起' : '展开'}分类：${row.item.name}`} disabled={!row.item.childCount || !!search.trim()} onClick={event => { event.stopPropagation(); setOpen(row.item.id, !row.expanded); }}>{row.item.childCount ? row.expanded ? '⌄' : '›' : ''}</UIButton><span className="catalogue-tree-title">{row.item.name || '（空名称）'}</span></div>)}</div>{!rows.length && <div className="empty" role="status">没有匹配的分类</div>}<p className="hint">当前为真实授权目录；拖动排序及撤销尚未接入。</p></>;
}
