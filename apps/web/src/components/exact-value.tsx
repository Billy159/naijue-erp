import { Tooltip } from '@arco-design/web-react';
import { useEffect, useReducer, useState } from 'react';
import './exact-value.css';
/** The domain supplies already-formatted exact text. Keep it readable to
 * pointer, keyboard and assistive technology even in a narrow table column. */
export function ExactValue(props: { readonly label: string; readonly text: string; readonly active?: boolean }) {
  const active = props.active !== false, [open, setOpen] = useState(false);
  const [, refreshAttachment] = useReducer((value: number) => value + 1, 0);
  useEffect(() => { setOpen(false); }, [active, props.text]);
  useEffect(() => {
    if (!active || !open) return;
    // Arco2.66 Trigger Portal clears its container ref in StrictMode's effect
    // replay. One ordinary post-attachment render lets its public component
    // recreate that container; no library internals or DOM reparenting.
    let attached = true;
    queueMicrotask(() => { if (attached) refreshAttachment(); });
    return () => { attached = false; };
  }, [active, open]);
  return <Tooltip content={props.text} trigger={['hover', 'focus']} popupVisible={active && open} onVisibleChange={visible => setOpen(active && visible)}
    disabled={!active} escToClose unmountOnExit blurToHide popupHoverStay={false}>
    <span className="erp-exact-value" title={props.text} aria-label={`${props.label}：${props.text}`} tabIndex={active ? 0 : -1}
      onKeyDown={event => { if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); } }}>{props.text}</span>
  </Tooltip>;
}
