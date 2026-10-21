import { useEffect, useId, useRef, useState, type ComponentType } from 'react';
import type { InventoryPageSize } from '../inventory/contracts.ts';
import type { ReadScope } from '../loading/read-scope.ts';

export interface InventoryPageSizeActionProps {
  readonly value: InventoryPageSize;
  readonly disabled: boolean;
  readonly open: boolean;
  readonly focusOnMount: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChange: (size: InventoryPageSize) => void;
}
export interface InventoryPageSizeAction {
  readonly InventoryPageSizeAction: ComponentType<InventoryPageSizeActionProps>;
  readonly loadStyles: () => Promise<unknown>;
}
const loadDefaultAction = () => import('./inventory-page-size-action.tsx');

/** Only the lightweight trigger is in the inventory static closure. Code and
 * component-only styles are requested by focus/open, never by route activation. */
export function InventoryPageSizeSelect(props: {
  readonly scope: ReadScope;
  readonly value: InventoryPageSize;
  readonly disabled: boolean;
  readonly onChange: (size: InventoryPageSize) => void;
  readonly loadAction?: () => Promise<InventoryPageSizeAction>;
}) {
  const id = useId();
  const host = useRef<HTMLDivElement>(null);
  const attached = useRef(false);
  const generation = useRef(0);
  const requested = useRef(false);
  const pending = useRef<Promise<void> | null>(null);
  const disabled = useRef(props.disabled); disabled.current = props.disabled;
  const [leaf, setLeaf] = useState<{ readonly View: ComponentType<InventoryPageSizeActionProps>; readonly focus: boolean } | null>(null);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'error'>('idle');
  const [open, setOpen] = useState(false);
  const dismiss = () => { requested.current = false; setOpen(false); };
  useEffect(() => {
    attached.current = true;
    const detach = () => { generation.current++; requested.current = false; pending.current = null; setOpen(false); };
    props.scope.signal.addEventListener('abort', detach, { once: true });
    return () => { attached.current = false; props.scope.signal.removeEventListener('abort', detach); generation.current++; requested.current = false; pending.current = null; };
  }, [props.scope]);
  useEffect(() => { if (props.disabled) dismiss(); }, [props.disabled]);
  const prepare = (wantOpen: boolean) => {
    if (!props.scope.active || disabled.current) return;
    if (wantOpen) requested.current = true;
    if (leaf) { if (wantOpen) setOpen(true); return; }
    if (pending.current) return;
    const current = ++generation.current;
    setPhase('loading');
    pending.current = Promise.resolve().then(() => (props.loadAction ?? loadDefaultAction)()).then(async module => {
      if (!attached.current || !props.scope.active || current !== generation.current) return;
      await module.loadStyles();
      if (!attached.current || !props.scope.active || current !== generation.current) return;
      const focused = !!host.current?.contains(document.activeElement);
      setLeaf({ View: module.InventoryPageSizeAction, focus: focused && !disabled.current });
      setOpen(requested.current && focused && !disabled.current);
      setPhase('idle');
    }).catch(() => {
      if (attached.current && props.scope.active && current === generation.current) { requested.current = false; setOpen(false); setPhase('error'); }
    }).finally(() => { if (current === generation.current) pending.current = null; });
    void pending.current;
  };
  const cancel = () => { generation.current++; pending.current = null; dismiss(); setPhase('idle'); };
  const View = leaf?.View;
  return <div ref={host} className="iw-page-size-host" onBlur={event => { if (event.currentTarget.contains(event.relatedTarget as Node | null)) return; const current = generation.current; queueMicrotask(() => { if (attached.current && current === generation.current && !host.current?.contains(document.activeElement)) dismiss(); }); }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); } }}>
    {View ? <View value={props.value} disabled={props.disabled || !props.scope.active} open={open} focusOnMount={leaf.focus} onOpenChange={value => { requested.current = value; setOpen(value && props.scope.active && !disabled.current); }} onChange={value => { dismiss(); if (props.scope.active && !disabled.current) props.onChange(value); }} /> : <button type="button" className="iw-page-size-trigger" aria-label="每页商品款数" aria-haspopup="listbox" aria-expanded="false" aria-describedby={phase === 'idle' ? undefined : id} aria-busy={phase === 'loading'} disabled={props.disabled || !props.scope.active} onFocus={() => prepare(false)} onClick={event => { event.currentTarget.focus(); prepare(true); }} onKeyDown={event => { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); prepare(true); } }}><span>{props.value}款/页</span><svg width="12" height="12" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="m12 18 12 12 12-12" stroke="currentColor" strokeWidth="4" /></svg></button>}
    {!View && phase === 'loading' && <span id={id} className="iw-page-size-state" role="status">正在加载每页数量选项… <button type="button" className="iw-link" onClick={cancel}>取消加载</button></span>}
    {!View && phase === 'error' && <span id={id} className="iw-page-size-state" role="alert">每页数量组件未加载，仍为 {props.value} 款/页。<button type="button" className="iw-link" onClick={() => { host.current?.querySelector<HTMLButtonElement>('.iw-page-size-trigger')?.focus(); prepare(true); }}>重试加载</button></span>}
    <noscript>启用 JavaScript 后可更改每页款数；当前保持 {props.value} 款/页。</noscript>
  </div>;
}
