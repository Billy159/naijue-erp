import { useEffect, useLayoutEffect, useId, useRef, useState, type ComponentType } from 'react';
import type { ReadScope } from '../loading/read-scope.ts';
import { loadDemoSingleSelectAction, type DemoSingleSelectActionProps, type DemoSingleSelectOption } from './single-select-contract.ts';
import type { DemoSingleSelectStyles } from './single-select-styles.ts';

export interface DemoPageSizeAction {
  readonly DemoSingleSelectAction: ComponentType<DemoSingleSelectActionProps>;
  readonly createDemoSingleSelectStyles: (document: Document) => DemoSingleSelectStyles;
}
export interface DemoPageSizeSelectProps {
  readonly scope: ReadScope;
  readonly active?: boolean;
  readonly label: string;
  readonly value: string;
  readonly options: readonly DemoSingleSelectOption[];
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
  readonly loadAction?: () => Promise<DemoPageSizeAction>;
}

/** One lightweight lifecycle shell for all pagers. Applied values/options remain
 * domain-owned; no Arco/CSS/data work happens until first focus or action. */
export function DemoPageSizeSelect(props: DemoPageSizeSelectProps) {
  const id = useId();
  const host = useRef<HTMLDivElement>(null);
  const attached = useRef(false);
  const generation = useRef(0);
  const requested = useRef(false);
  const pending = useRef<Promise<void> | null>(null);
  const styles = useRef<DemoSingleSelectStyles | null>(null);
  const live = useRef(props); live.current = props;
  const [leaf, setLeaf] = useState<{ readonly View: ComponentType<DemoSingleSelectActionProps>; readonly focus: boolean; readonly scope: ReadScope } | null>(null);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'error'>('idle');
  const [open, setOpen] = useState(false);
  const available = () => attached.current && live.current.scope === props.scope && live.current.scope.active && live.current.active !== false && !live.current.disabled;
  const dismiss = () => { requested.current = false; setOpen(false); };
  const releaseStyles = () => { styles.current?.dispose(); styles.current = null; };
  // Scope ownership must be ready before the first visible enabled interaction.
  useLayoutEffect(() => {
    attached.current = true;
    const detach = () => {
      generation.current++; requested.current = false; pending.current = null;
      releaseStyles(); setOpen(false); setLeaf(null); setPhase('idle');
    };
    detach();
    props.scope.signal.addEventListener('abort', detach, { once: true });
    return () => {
      attached.current = false; props.scope.signal.removeEventListener('abort', detach);
      generation.current++; requested.current = false; pending.current = null; releaseStyles();
    };
  }, [props.scope, props.active]);
  useEffect(() => { if (props.disabled) dismiss(); }, [props.disabled]);
  const prepare = (wantOpen: boolean) => {
    if (!available()) return;
    if (wantOpen) requested.current = true;
    if (leaf?.scope === props.scope) { if (wantOpen) setOpen(true); return; }
    if (pending.current) return;
    const current = ++generation.current;
    setPhase('loading');
    const loadAction: () => Promise<DemoPageSizeAction> = props.loadAction ?? loadDemoSingleSelectAction;
    const owns = () => attached.current && props.scope.active && live.current.scope === props.scope && live.current.active !== false && current === generation.current;
    pending.current = Promise.resolve().then(loadAction).then(async module => {
      if (!owns()) return;
      const lease = module.createDemoSingleSelectStyles(host.current!.ownerDocument); styles.current = lease;
      await lease.load();
      if (!owns()) return;
      const focused = !!host.current?.contains(host.current.ownerDocument.activeElement);
      setLeaf({ View: module.DemoSingleSelectAction, focus: focused && available(), scope: props.scope });
      setOpen(requested.current && focused && available()); setPhase('idle');
    }).catch(() => {
      if (owns()) {
        releaseStyles(); requested.current = false; setOpen(false); setPhase('error');
      }
    }).finally(() => { if (current === generation.current) pending.current = null; });
    void pending.current;
  };
  const cancel = () => {
    generation.current++; pending.current = null; dismiss(); setPhase('idle');
    if (!leaf) releaseStyles();
  };
  useEffect(() => {
    if (phase !== 'loading') return;
    const outside = (event: Event) => { if (!host.current?.contains(event.target as Node)) cancel(); };
    const document = host.current!.ownerDocument;
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [phase]);
  const View = leaf?.scope === props.scope && props.active !== false ? leaf.View : null;
  const label = props.options.find(option => option.value === props.value)?.label ?? props.value;
  const disabled = props.disabled || !props.scope.active || props.active === false;
  return <div ref={host} className="iw-page-size-host" onBlur={event => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    const current = generation.current;
    queueMicrotask(() => { if (attached.current && current === generation.current && !host.current?.contains(host.current.ownerDocument.activeElement)) dismiss(); });
  }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel(); } }}>
    {View ? <View presentation="page-size" label={props.label} value={props.value} options={props.options} disabled={disabled} open={open && !disabled} focusOnMount={leaf!.focus}
      onOpenChange={value => { requested.current = value && available(); setOpen(requested.current); }}
      onChange={value => {
        dismiss();
        if (available() && live.current.options.some(option => option.value === value && !option.disabled)) live.current.onChange(value);
      }} /> : <button type="button" className="iw-page-size-trigger" aria-label={props.label} aria-haspopup="listbox" aria-expanded="false" aria-describedby={phase === 'idle' ? undefined : id} aria-busy={phase === 'loading'} disabled={disabled}
      onFocus={() => prepare(false)} onClick={event => { event.currentTarget.focus(); prepare(true); }}
      onKeyDown={event => { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); prepare(true); } }}>
      <span>{label}</span><svg width="12" height="12" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="m12 18 12 12 12-12" stroke="currentColor" strokeWidth="4" /></svg>
    </button>}
    {!View && phase === 'loading' && <span id={id} className="iw-page-size-state" role="status">正在加载每页数量选项… <button type="button" className="iw-link" onClick={cancel}>取消加载</button></span>}
    {!View && phase === 'error' && <span id={id} className="iw-page-size-state" role="alert">每页数量组件未加载，仍为 {label}。<button type="button" className="iw-link" onClick={() => { host.current?.querySelector<HTMLButtonElement>('.iw-page-size-trigger')?.focus(); prepare(true); }}>重试加载</button></span>}
    <noscript>启用 JavaScript 后可更改每页数量；当前保持 {label}。</noscript>
  </div>;
}
