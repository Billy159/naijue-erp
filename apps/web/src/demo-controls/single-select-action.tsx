export { createDemoSingleSelectStyles } from './single-select-styles.ts';
import { Select } from '@arco-design/web-react';
import type { SelectProps } from '@arco-design/web-react';
import type { ComponentRef } from 'react';
type SelectHandle = ComponentRef<typeof Select>;
// Arco controls an own value property containing undefined. Its declaration
// predates exactOptionalPropertyTypes; keep explicit empty controlled state.
const ControlledSelect = Select as unknown as ForwardRefExoticComponent<Omit<SelectProps, 'value'> & { readonly value: SelectProps['value'] | undefined } & RefAttributes<SelectHandle>>;
import { useEffect, useImperativeHandle, useReducer, useRef, useState, type ForwardRefExoticComponent, type RefAttributes } from 'react';
import type { DemoSingleSelectActionProps } from './single-select-contract.ts';

/**
 * Frozen unified-single-select.jsx:56–73 presentation, not a data/DOM bridge.
 * CSS is a separate action-only entry; the caller must await its scoped style
 * lease before mounting. Nothing is registered on document/window at import.
 */
export function DemoSingleSelectAction(props: DemoSingleSelectActionProps) {
  const host = useRef<HTMLDivElement>(null), portal = useRef<HTMLDivElement>(null);
  const select = useRef<SelectHandle | null>(null);
  useImperativeHandle(props.focusRef, () => ({ focus: () => { select.current?.focus(); } }), []);
  const [mounted, setMounted] = useState(false);
  const [, refreshPortal] = useReducer((value: number) => value + 1, 0);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (props.focusOnMount && !props.disabled) select.current?.focus();
  }, []);
  useEffect(() => {
    if (props.disabled && props.open) props.onOpenChange(false);
  }, [props.disabled, props.open, props.onOpenChange]);
  useEffect(() => {
    // Installed Arco 2.66.16's Portal resets its container ref in React 19's
    // StrictMode replay. A guarded post-commit render reattaches the local portal.
    if (!mounted || !props.open || props.disabled) return;
    let active = true;
    queueMicrotask(() => { if (active) refreshPortal(); });
    return () => { active = false; };
  }, [mounted, props.open, props.disabled]);
  useEffect(() => {
    if (!props.open || props.disabled) return;
    const element = host.current, doc = element?.ownerDocument;
    // A remote-page footer can unmount while its bounded page loads, leaving
    // focus on body. Keep Esc owned by this still-open local layer only.
    const escape = (event: KeyboardEvent) => {
      if (!doc || !element?.isConnected || doc.activeElement !== doc.body || event.isComposing || event.keyCode === 229 || event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); props.onOpenChange(false); select.current?.focus();
    };
    doc?.addEventListener('keydown', escape);
    return () => doc?.removeEventListener('keydown', escape);
  }, [props.open, props.disabled, props.onOpenChange]);
  const pageSize = props.presentation === 'page-size';
  return <div ref={host} className="demo-single-select ui-single-host" onKeyDown={event => {
    if (!props.open || event.nativeEvent.isComposing || event.keyCode === 229 || event.key !== 'Escape') return;
    // The remote-page footer is outside Select's input key handler. Keep the
    // same source Esc dismissal for all descendants of this local layer.
    event.preventDefault(); event.stopPropagation(); props.onOpenChange(false); select.current?.focus();
  }} style={props.presentation === 'flat' ? { position: 'relative' } : undefined}>
    <ControlledSelect ref={select}
      className={pageSize ? 'ui-page-size-select' : props.presentation === 'flat' ? 'ui-flat-select' : ''}
      value={props.value === '' ? undefined : props.value}
      options={props.options.map(option => ({ value: option.value, label: option.label, disabled: !!option.disabled }))}
      aria-label={props.label}
      {...(props.placeholder !== undefined ? { placeholder: props.placeholder } : {})}
      {...(props.loading !== undefined ? { loading: props.loading } : {})}
      {...(props.dropdownRender ? { dropdownRender: props.dropdownRender } : {})}
      {...(props.required !== undefined ? { 'aria-required': props.required } : {})}
      showSearch={!!props.onSearch}
      {...(props.onSearch ? { onSearch: props.onSearch, filterOption: false } : {})}
      allowClear={props.allowClear === true}
      disabled={props.disabled}
      popupVisible={mounted && props.open && !props.disabled}
      unmountOnExit
      getPopupContainer={() => {
        // Frozen makeHost #portal uses viewport coordinates while staying
        // under its owner. Route/identity teardown removes this same layer.
        if (!portal.current) throw new Error('The Demo single-select host is not mounted.');
        return portal.current;
      }}
      triggerProps={{ position: pageSize ? 'tl' : props.placement ?? 'bl', autoAlignPopupWidth: false, style: { pointerEvents: 'auto' }, popupStyle: { width: pageSize ? 150 : props.popupWidth } }}
      renderFormat={(_option, selected) => {
        const value = typeof selected === 'object' ? selected.value : selected;
        return <span className="ui-single-tag">{props.options.find(item => item.value === value)?.label ?? value}</span>;
      }}
      onClear={() => { if (props.allowClear && !props.disabled) { props.onOpenChange(false); props.onClear?.(); } }}
      onVisibleChange={visible => props.onOpenChange(visible && !props.disabled)}
      onChange={(value: string) => {
        const option = props.options.find(item => item.value === value);
        if (!props.open || props.disabled || !option || option.disabled) return;
        props.onOpenChange(false);
        props.onChange(value, option);
      }}
    /><div ref={portal} className="demo-single-select-portal" style={{ position: 'fixed', inset: 0, zIndex: 2000, pointerEvents: 'none' }} />
  </div>;
}
