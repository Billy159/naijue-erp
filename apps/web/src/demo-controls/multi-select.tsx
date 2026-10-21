import { useId, useLayoutEffect, useReducer, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { ReadScope } from '../loading/read-scope.ts';
import type { ExclusivePopupController, PopupOwnership } from './popup-ownership.ts';
import type { DemoMultiSelectActionProps } from './multi-select-contract.ts';
import { IdleSelectionTokens } from './idle-selection-tokens.tsx';

export interface DemoMultiSelectPopupHost {
  readonly controller: ExclusivePopupController;
  readonly attach: (ownership: PopupOwnership, element: HTMLElement) => () => void;
}
interface StyleLease { load(): Promise<void>; dispose(): void }
export interface DemoMultiSelectActionModule {
  readonly DemoMultiSelectAction: ComponentType<DemoMultiSelectActionProps>;
  readonly createDemoMultiSelectStyles: (document: Document) => StyleLease;
}
interface Activation { readonly scope: ReadScope; readonly ownership: PopupOwnership }
export interface DemoMultiSelectProps extends Omit<DemoMultiSelectActionProps, 'open' | 'onOpen' | 'focusOnMount' | 'renderMenu'> {
  readonly scope: ReadScope;
  readonly popupHost: DemoMultiSelectPopupHost | null;
  readonly active?: boolean;
  /** Replacing a provider/target invalidates every pending or open child. */
  readonly ownerKey?: object;
  readonly onPopupClose?: () => void;
  readonly renderMenu?: (menu: ReactNode, scope: ReadScope) => ReactNode;
  readonly loadAction?: () => Promise<DemoMultiSelectActionModule>;
}
const loadAction = (): Promise<DemoMultiSelectActionModule> => import('./multi-select-action.tsx');

/** Lightweight shared trigger. Code/CSS prepare on focus or action; an exclusive
 * ownership lease precedes any popup/candidate work. No global cache or portal. */
export function DemoMultiSelect(props: DemoMultiSelectProps) {
  const id = useId(); const host = useRef<HTMLDivElement>(null); const trigger = useRef<HTMLButtonElement>(null);
  const attached = useRef(false); const generation = useRef(0); const sequence = useRef(0);
  const pending = useRef<Promise<void> | null>(null); const styles = useRef<StyleLease | null>(null);
  const owned = useRef<Activation | null>(null); const live = useRef(props); live.current = props;
  const focusReturn = useRef<symbol | null>(null); const [, invalidate] = useReducer((value: number) => value + 1, 0);
  const [activation, setActivation] = useState<Activation | null>(null);
  const [View, setView] = useState<ComponentType<DemoMultiSelectActionProps> | null>(null);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'error'>('idle');
  const available = () => attached.current && live.current.scope.active && live.current.active !== false && !live.current.disabled
    && !!live.current.popupHost && !live.current.popupHost.controller.disposed;
  const releaseStyles = () => { styles.current?.dispose(); styles.current = null; };
  const cancelPending = () => {
    if (!pending.current) return;
    generation.current++; pending.current = null; releaseStyles(); setPhase('idle');
  };
  useLayoutEffect(() => {
    attached.current = true; focusReturn.current = null; generation.current++; pending.current = null; releaseStyles(); setView(null); setPhase('idle');
    const abort = () => { focusReturn.current = null; owned.current?.ownership.dispose(); generation.current++; pending.current = null; releaseStyles(); setView(null); setPhase('idle'); invalidate(); };
    props.scope.signal.addEventListener('abort', abort, { once: true });
    return () => {
      attached.current = false; focusReturn.current = null; props.scope.signal.removeEventListener('abort', abort);
      owned.current?.ownership.dispose(); generation.current++; pending.current = null; releaseStyles();
    };
  }, [props.scope, props.popupHost, props.active, props.ownerKey]);
  useLayoutEffect(() => { if (!available()) { owned.current?.ownership.dispose(); cancelPending(); } }, [props.disabled, props.active, props.scope, props.popupHost]);
  // Closing Arco replaces/removes popup DOM after the close callback. Restore
  // the actual input only after that commit, never a detached popup or wrapper.
  useLayoutEffect(() => {
    const ticket = focusReturn.current; if (!ticket || activation) return;
    queueMicrotask(() => {
      if (focusReturn.current !== ticket) return;
      focusReturn.current = null;
      const element = host.current;
      if (!available() || !element || element.closest('[hidden]') || live.current.popupHost?.controller.active) return;
      const current = element.ownerDocument.activeElement;
      if (current !== element.ownerDocument.body && current && !element.contains(current)) return;
      const input = element.querySelector<HTMLElement>('input:not([type="hidden"]), [role="combobox"]');
      (input ?? trigger.current)?.focus({ preventScroll: true });
    });
  }, [activation, View, phase, props.scope, props.active]);
  const acquire = () => {
    if (!available() || !host.current || !live.current.popupHost) return;
    if (owned.current?.ownership.active) return;
    focusReturn.current = null;
    const parent = live.current.scope;
    const scope = new ReadScope(parent.identity, `${parent.routeInstanceId}:multi:${id}:${++sequence.current}`, null, () => {});
    let detach = () => {};
    const ownership = live.current.popupHost.controller.open({ signal: parent.signal, onClose: reason => {
      const restore = (reason === 'close' || reason === 'escape') && !!host.current?.contains(document.activeElement);
      scope.dispose(); detach();
      if (owned.current?.scope !== scope) return;
      if (restore) focusReturn.current = Symbol('closed-multi-focus');
      owned.current = null; setActivation(null); cancelPending(); live.current.onPopupClose?.();
    } });
    if (!ownership) { scope.dispose(); return; }
    detach = live.current.popupHost.attach(ownership, host.current);
    const next = { scope, ownership }; owned.current = next; setActivation(next);
  };
  const prepare = (open: boolean) => {
    if (!available()) return;
    if (open) acquire();
    if (View || pending.current) return;
    const current = ++generation.current; const parent = live.current.scope; setPhase('loading');
    const owns = () => available() && live.current.scope === parent && generation.current === current;
    pending.current = Promise.resolve().then(props.loadAction ?? loadAction).then(async module => {
      if (!owns() || !host.current) return;
      const lease = module.createDemoMultiSelectStyles(host.current.ownerDocument); styles.current = lease;
      await lease.load();
      if (!owns()) return;
      setView(() => module.DemoMultiSelectAction); setPhase('idle');
    }).catch(() => {
      if (owns()) { pending.current = null; generation.current++; releaseStyles(); setPhase('error'); owned.current?.ownership.close(); }
    }).finally(() => { if (generation.current === current) pending.current = null; });
    void pending.current;
  };
  const open = available() && !!activation?.ownership.active && activation.scope.active;
  const disabled = !props.scope.active || props.active === false || props.disabled || !props.popupHost || props.popupHost.controller.disposed;
  const names = new Map([...(props.selectedOptions ?? []), ...props.options].map(item => [item.id, item.name]));
  const selectedLabel = props.value.length ? props.value.map(value => names.get(value) ?? value).join('、') : props.allLabel;
  const { scope: _scope, popupHost: _popupHost, active: _active, ownerKey: _ownerKey, onPopupClose: _onPopupClose, renderMenu: _renderMenu, loadAction: _loadAction, ...actionProps } = props;
  return <div ref={host} className="demo-multi-host" data-multi-label={props.label} onBlur={event => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    const current = generation.current;
    queueMicrotask(() => { if (attached.current && current === generation.current && !host.current?.contains(document.activeElement)) {
      owned.current?.ownership.close(); cancelPending();
    } });
  }} onKeyDown={event => { if (event.key === 'Escape' && (owned.current?.ownership.active || pending.current)) {
    event.preventDefault(); event.stopPropagation(); owned.current?.ownership.close(); cancelPending();
  } }}>
    {View && props.active !== false ? <View {...actionProps} disabled={!!disabled} open={open} focusOnMount={!!host.current?.contains(document.activeElement)}
      onOpen={next => { if (next) acquire(); else owned.current?.ownership.close(); }}
      onChange={ids => { if (available()) live.current.onChange(ids); }}
      {...(props.renderMenu ? { renderMenu: menu => open && activation ? props.renderMenu?.(menu, activation.scope) : null } : {})} />
      : <div className="demo-idle-reference"><button ref={trigger} type="button" className="iw-control demo-multi-trigger" aria-label={`${props.label}，多选`} aria-haspopup="tree" aria-expanded={open}
        aria-describedby={phase === 'idle' ? undefined : id} aria-busy={phase === 'loading'} disabled={!!disabled} title={selectedLabel}
        onFocus={() => prepare(false)} onClick={event => { event.currentTarget.focus(); if (owned.current?.ownership.active) owned.current.ownership.close(); else prepare(true); }}
        onKeyDown={event => { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); prepare(true); } }}>
        <span className="demo-idle-trigger-value">{selectedLabel}</span><span aria-hidden="true">⌄</span>
      </button><IdleSelectionTokens variant="reference" disabled={!!disabled}
        tokens={props.value.length ? props.value.map(value => ({ id: value, label: names.get(value) ?? value })) : [{ id: null, label: props.allLabel }]}
        allResetLabel={`重置为${props.allLabel}（不限范围）`} onRemove={id => {
          if (!available() || live.current !== props || id !== null && !props.value.includes(id)) return;
          // Match the activated ALL handler and explicit tag removal. Empty IDs
          // remain unrestricted; never infer an empty subset or all-minus page.
          if (props.search) props.onSearch?.('');
          props.onChange(id === null ? [] : props.value.filter(value => value !== id));
        }} /></div>}
    {!View && phase === 'loading' && <span id={id} className="demo-multi-state" role="status">正在加载{props.label}选项… <button type="button" className="iw-link" onClick={() => { owned.current?.ownership.close(); cancelPending(); }}>取消加载</button></span>}
    {!View && phase === 'error' && <span id={id} className="demo-multi-state" role="alert">{props.label}选项未加载。<button type="button" className="iw-link" onClick={() => { trigger.current?.focus(); prepare(true); }}>重试加载</button></span>}
  </div>;
}
