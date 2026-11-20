import { Input, Tree } from '@arco-design/web-react';
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CategoryTreeIndex } from './tree-model.ts';
import { visibleCategoryRows } from './tree-model.ts';

interface NativeTreeNode { key:string; title:ReactNode; isLeaf:boolean; children:NativeTreeNode[] }
/** Frozen CategoryTree presentation with the full authorized native hierarchy.
 * Arco renders nodes/switchers/selection. The existing iterative path search and
 * a title-slot keyboard bridge retain native depth and accessible navigation. */
export function CatalogueCategoryTree({ index, selectedId, select, reorder }: { readonly index: CategoryTreeIndex; readonly selectedId: string | null; readonly select: (id: string) => void; readonly reorder?: (movedId: string, targetId: string, placement: 'before' | 'after') => void }) {
  const [search,setSearch]=useState(''),[expanded,setExpanded]=useState<ReadonlySet<string>>(new Set()),[focused,setFocused]=useState<string|null>(null);
  const host=useRef<HTMLDivElement>(null);
  const query=search.trim();
  const data=useMemo(()=>{
    const all=visibleCategoryRows(index,new Set(index.byId.keys()),search),nodes=new Map<string,NativeTreeNode>(),roots:NativeTreeNode[]=[];
    for(const row of all){const id=row.item.id;nodes.set(id,{key:id,isLeaf:row.item.childCount===0,children:[],title:<span data-category-id={id} tabIndex={-1} onFocus={()=>setFocused(id)} onClick={event=>event.currentTarget.focus()}>{row.item.name||'（空名称）'}</span>});}
    for(const row of all){const node=nodes.get(row.item.id)!;if(row.item.parentId===null)roots.push(node);else{const parent=nodes.get(row.item.parentId);if(!parent)throw new TypeError('Native category ancestor is missing.');parent.children.push(node);}}
    return {roots,searchExpanded:all.filter(row=>row.expanded).map(row=>row.item.id)};
  },[index,search]);
  const rows=useMemo(()=>visibleCategoryRows(index,expanded,search),[index,expanded,search]);
  const tabStop=rows.some(row=>row.item.id===focused)?focused:rows.some(row=>row.item.id===selectedId)?selectedId:rows[0]?.item.id;
  useLayoutEffect(()=>{for(const element of Array.from(host.current?.querySelectorAll<HTMLElement>('[data-category-id]')??[]))element.tabIndex=element.dataset.categoryId===tabStop?0:-1;},[data,rows,tabStop]);
  const setOpen=(id:string,open:boolean)=>{if(query)return;setExpanded(previous=>{const next=new Set(previous);if(open)next.add(id);else next.delete(id);return next;});};
  const focus=(id:string)=>host.current?.querySelector<HTMLElement>(`[data-category-id="${id}"]`)?.focus();
  return <><Input.Search className="product-tree-search" aria-label="搜索分类" placeholder="搜索分类" value={search} onChange={setSearch} allowClear/>
    <div ref={host} className="catalogue-category-tree" onKeyDownCapture={event=>{
      const target=event.target as HTMLElement,node=target.closest('[role=treeitem]'),id=target.closest<HTMLElement>('[data-category-id]')?.dataset.categoryId??node?.querySelector<HTMLElement>('[data-category-id]')?.dataset.categoryId??tabStop;
      const position=rows.findIndex(row=>row.item.id===id),row=rows[position];if(!row)return;
      let next:string|undefined;
      if((event.key==='Enter'||event.key===' ')&&target.closest('.arco-tree-node-switcher-icon'))setOpen(row.item.id,!row.expanded);
      else if(event.key==='ArrowDown')next=rows[position+1]?.item.id;
      else if(event.key==='ArrowUp')next=rows[position-1]?.item.id;
      else if(event.key==='Home')next=rows[0]?.item.id;
      else if(event.key==='End')next=rows.at(-1)?.item.id;
      else if(event.key==='ArrowRight'){if(row.item.childCount&&!row.expanded)setOpen(row.item.id,true);else if(row.expanded)next=rows[position+1]?.item.id;}
      else if(event.key==='ArrowLeft'){if(row.expanded&&!query)setOpen(row.item.id,false);else next=row.item.parentId??undefined;}
      else if(event.key==='Enter'||event.key===' ')select(row.item.id);
      else return;
      event.preventDefault();event.stopPropagation();if(next)focus(next);
    }}><Tree aria-label="商品分类" blockNode draggable={!!reorder} allowDrop={({dragNode,dropNode,dropPosition})=>{
        const moved=typeof dragNode?.key==='string'?index.byId.get(dragNode.key):undefined,target=typeof dropNode?.key==='string'?index.byId.get(dropNode.key):undefined;
        return !!reorder&&dropPosition!==0&&!!moved&&!!target&&moved.id!==target.id&&moved.parentId===target.parentId;
      }} onDrop={({dragNode,dropNode,dropPosition})=>{
        const moved=typeof dragNode?.key==='string'?index.byId.get(dragNode.key):undefined,target=typeof dropNode?.key==='string'?index.byId.get(dropNode.key):undefined;
        if(reorder&&dropPosition!==0&&moved&&target&&moved.id!==target.id&&moved.parentId===target.parentId)reorder(moved.id,target.id,dropPosition<0?'before':'after');
      }} autoExpandParent={false} selectedKeys={selectedId&&index.byId.has(selectedId)?[selectedId]:[]} expandedKeys={query?data.searchExpanded:[...expanded]} treeData={data.roots}
      onSelect={keys=>{const id=keys[0];if(typeof id==='string'&&index.byId.has(id))select(id);}}
      onExpand={keys=>{if(!query)setExpanded(new Set(keys.filter(key=>index.byId.has(key))));}}/>
    </div>{!rows.length&&<div className="empty" role="status">没有匹配的分类</div>}
  </>;
}
