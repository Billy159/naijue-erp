import { useLayoutEffect, useMemo, useRef, useState } from 'react';

export interface IdleSelectionToken {
  /** null is the explicit unrestricted token, never a native candidate ID. */
  readonly id: string | null;
  readonly label: string;
}
interface IdleSelectionTokensProps {
  readonly tokens: readonly IdleSelectionToken[];
  readonly variant: 'reference' | 'product';
  readonly disabled: boolean;
  readonly allResetLabel?: string;
  readonly onRemove: (id: string | null) => void;
  /** The product input can regain keyboard focus without activating its loader. */
  readonly onEmptyFocus?: () => void;
}

/** Presentation only: no action import, candidate reads, or selection inference. */
export function IdleSelectionTokens(props: IdleSelectionTokensProps) {
  const host = useRef<HTMLSpanElement>(null); const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const parent = host.current?.parentElement; if (!parent) return;
    const measure = () => setWidth(parent.getBoundingClientRect().width); measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(parent); parent.ownerDocument.defaultView?.addEventListener('resize', measure);
    return () => { observer?.disconnect(); parent.ownerDocument.defaultView?.removeEventListener('resize', measure); };
  }, []);
  // Frozen inventory-filters/category/select fit formulas. Measure only supplied
  // display labels; retained product labels are not parsed into invented codes.
  const limit = useMemo(() => {
    if (props.tokens.length < 2) return 3;
    const context = host.current?.ownerDocument.createElement('canvas').getContext('2d');
    if (!context) return props.variant === 'reference' ? 1 : Math.min(3, props.tokens.length);
    context.font = '13px Arial';
    const widths = props.tokens.slice(0, 3).map(token => props.variant === 'reference'
      ? Math.min(context.measureText(token.label).width + 37, width - 50)
      : context.measureText(token.label).width + 39);
    for (let count = Math.min(3, props.tokens.length); count > 1; count--) {
      const reserve = props.variant === 'reference' ? props.tokens.length > count ? 92 : 42 : props.tokens.length > count ? 112 : 64;
      if (widths.slice(0, count).reduce((sum, value) => sum + value, 0) + (count - 1) * 4 + reserve <= width) return count;
    }
    return 1;
  }, [props.tokens, props.variant, width]);
  const hidden = props.tokens.slice(limit);
  return <span ref={host} className={`demo-idle-selection demo-idle-selection--${props.variant}`}>
    {props.tokens.slice(0, limit).map(token => <span key={token.id ?? '__unrestricted__'} className="demo-idle-token" title={token.label}>
      <span className="demo-idle-token-label">{token.label}</span>
      <button type="button" className="demo-idle-token-remove" disabled={props.disabled}
        aria-label={token.id === null ? props.allResetLabel : `移除 ${token.label}`} title={token.id === null ? props.allResetLabel : `移除 ${token.label}`}
        onMouseDown={event => { event.preventDefault(); event.stopPropagation(); }}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation(); }}
        onClick={event => {
          event.stopPropagation(); const button = event.currentTarget;
          if (props.disabled || !button.isConnected) return;
          const document = button.ownerDocument; const parent = host.current?.parentElement;
          const restore = document.activeElement === button;
          props.onRemove(token.id);
          if (restore) queueMicrotask(() => {
            if (button.isConnected || !parent?.isConnected || document.activeElement !== document.body) return;
            const next = parent.querySelector<HTMLButtonElement>('.demo-idle-token-remove:not(:disabled)');
            if (next) next.focus({ preventScroll: true }); else props.onEmptyFocus?.();
          });
        }}>
        <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="4"><path d="m12 12 24 24m0-24L12 36" /></svg>
      </button>
    </span>)}
    {hidden.length > 0 && <span className="demo-idle-token-count" title={hidden.map(token => token.label).join('、')}>+{hidden.length} 更多</span>}
  </span>;
}
