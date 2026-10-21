import ArcoSelect from '@arco-design/web-react/es/Select/index.js';
import type { SelectHandle, SelectProps } from '@arco-design/web-react/es/Select/interface.js';
import { useEffect, useReducer, useRef, useState, type ForwardRefExoticComponent, type RefAttributes } from 'react';
import type { DemoSingleSelectActionProps } from './single-select-contract.ts';

// NodeNext sees the package's ESM leaf as a CJS namespace in types only. The
// runtime import stays at the real Select leaf, never the all-component barrel.
const Select = ArcoSelect as unknown as ForwardRefExoticComponent<SelectProps & RefAttributes<SelectHandle>>;

/**
 * Frozen unified-single-select.jsx:56–73 presentation, not a data/DOM bridge.
 * CSS is a separate action-only entry; the caller must await its scoped style
 * lease before mounting. Nothing is registered on document/window at import.
 */
export function DemoSingleSelectAction(props: DemoSingleSelectActionProps) {
  const host = useRef<HTMLDivElement>(null);
  const select = useRef<SelectHandle | null>(null);
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
  const pageSize = props.presentation === 'page-size';
  return <div ref={host} className="demo-single-select ui-single-host">
    <Select ref={select}
      className={pageSize ? 'ui-page-size-select' : props.presentation === 'flat' ? 'ui-flat-select' : ''}
      value={props.value}
      options={props.options.map(option => ({ value: option.value, label: option.label, disabled: !!option.disabled }))}
      aria-label={props.label}
      showSearch={false}
      allowClear={false}
      disabled={props.disabled}
      popupVisible={mounted && props.open && !props.disabled}
      unmountOnExit
      getPopupContainer={() => {
        // Arco only asks after mounting. Never fall back to a document-global
        // body portal that could survive its route/drawer/session owner.
        if (!host.current) throw new Error('The Demo single-select host is not mounted.');
        return host.current;
      }}
      triggerProps={{ position: pageSize ? 'tl' : props.placement ?? 'bl', autoAlignPopupWidth: false, popupStyle: { width: pageSize ? 150 : props.popupWidth } }}
      renderFormat={(_option, selected) => {
        const value = typeof selected === 'object' ? selected.value : selected;
        return <span className="ui-single-tag">{props.options.find(item => item.value === value)?.label ?? value}</span>;
      }}
      onVisibleChange={visible => props.onOpenChange(visible && !props.disabled)}
      onChange={(value: string) => {
        const option = props.options.find(item => item.value === value);
        if (!props.open || props.disabled || !option || option.disabled) return;
        props.onOpenChange(false);
        props.onChange(value, option);
      }}
    />
  </div>;
}
