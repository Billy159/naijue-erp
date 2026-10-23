import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type Ref } from 'react';
import { Button, Checkbox, DatePicker, Input, Select } from '@arco-design/web-react';
import { IconCalendar } from '@arco-design/web-react/icon';
import type { ButtonProps, CheckboxProps, InputProps, SelectProps, TextAreaProps } from '@arco-design/web-react';
import '@arco-design/web-react/dist/css/arco.css';
import './standard-controls.css';
import dayjs from 'dayjs';

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}
const classes = (base: string, extra?: string | string[]) => [base, ...(Array.isArray(extra) ? extra : [extra])].filter(Boolean).join(' ');

/** Raw strings are intentional: money, quantities and page numbers must not be
 * rounded/coerced by InputNumber before the existing domain validators run. */
export const UIInput = forwardRef<HTMLInputElement, Omit<InputProps, 'className'> & { className?: string | string[] | undefined }>(function UIInput({ className, ...props }, ref) {
  return <Input {...props} className={classes('erp-input', className)} ref={instance => assignRef(ref, instance?.dom ?? null)} />;
});
export const UITextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function UITextArea(props, ref) {
  return <Input.TextArea {...props} className={classes('erp-textarea', props.className)} ref={instance => assignRef(ref, instance?.dom ?? null)} />;
});
export function UICheckbox(props: CheckboxProps) {
  return <Checkbox {...props} className={classes('erp-checkbox', props.className)} />;
}

/** Keep native button type and DOM refs at the existing event/focus boundary;
 * the rendered implementation is Arco Button, including disabled semantics. */
export const UIButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { readonly variant?: 'primary'|'text'|'default' }>(function UIButton({ type = 'button', variant, className, ...props }, ref) {
  const primary = /(^|\s)(primary|iw-primary)(\s|$)/.test(className ?? '');
  const text = /(^|\s)(nav|iw-link|sale-link|iw-text-button|view-action)(\s|$)/.test(className ?? '');
  // Arco declares onClick as DOM Event, but its React button passes the React
  // event through unchanged. Preserve the existing typed currentTarget refs.
  return <Button {...props as unknown as ButtonProps} ref={ref} htmlType={type} type={variant ?? (primary ? 'primary' : text ? 'text' : 'default')} className={classes('erp-button', className)} />;
});

export function UISelect(props: SelectProps) {
  const host = useRef<HTMLSpanElement>(null);
  return <span ref={host} className="erp-select-host"><Select {...props} className={classes('erp-select', props.className)} getPopupContainer={() => host.current ?? document.body} /></span>;
}
UISelect.Option = Select.Option;

/** The same date-only string boundary is used by create, edit and filters.
 * A supported Arco Input trigger retains incomplete/invalid raw text instead of
 * letting DatePicker format it as "Invalid Date". Calendar selection remains
 * DatePicker's own behaviour. No timezone or numeric coercion. */
export function UIDate({ value, onChange, disabled, className, ...inputProps }: {
  readonly value: string; readonly onChange: (value: string) => void;
  readonly disabled?: boolean; readonly className?: string;
  readonly 'aria-label': string; readonly placeholder?: string;
}) {
  const host = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const pointerInside = useRef(false);
  useEffect(() => {
    if (!open) return;
    const release = () => { pointerInside.current = false; };
    document.addEventListener('pointerup', release, true);
    document.addEventListener('pointercancel', release, true);
    return () => { document.removeEventListener('pointerup', release, true); document.removeEventListener('pointercancel', release, true); pointerInside.current = false; };
  }, [open]);
  const calendarValue = useRef('');
  // Passing an unfinished string (e.g. "2026-") to DatePicker's value makes
  // its formatter replace the user's text with "Invalid Date" on rerender.
  // Keep its last valid calendar value while its own input holds raw typing.
  if (value === '' || (/^\d{4}-\d{2}-\d{2}$/.test(value) && dayjs(value).isValid() && dayjs(value).format('YYYY-MM-DD') === value)) calendarValue.current = value;
  // Input forwards click handlers to its inner input; the native trigger must
  // also contain the calendar suffix so Arco receives that same click.
  return <span ref={host} className="erp-date-host" onPointerDownCapture={() => { pointerInside.current = true; }} onBlurCapture={event => {
    if (event.relatedTarget instanceof Node) {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    } else if (!pointerInside.current) {
      queueMicrotask(() => { if (host.current?.isConnected && !host.current.contains(document.activeElement)) setOpen(false); });
    }
  }} onKeyDownCapture={event => {
    if (open && (event.key === 'Escape' || event.key === 'Enter')) {
      event.preventDefault(); event.stopPropagation(); setOpen(false);
      requestAnimationFrame(() => {
        const element = host.current;
        if (element?.isConnected && (document.activeElement === document.body || element.contains(document.activeElement))) element.querySelector('input')?.focus({ preventScroll: true });
      });
    }
  }}><DatePicker className={classes('erp-date', className)} value={calendarValue.current} disabled={!!disabled} format="YYYY-MM-DD" allowClear unmountOnExit
    triggerElement={<span className="erp-date-trigger"><UIInput {...inputProps} className={classes('erp-date-input', className)} value={value} disabled={!!disabled} allowClear suffix={<IconCalendar />}
      placeholder={inputProps.placeholder ?? 'YYYY-MM-DD'} onChange={next => { if (!disabled) onChange(next); }} onKeyDown={event => {
        if (!disabled && event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); }
      }} /></span>}
    popupVisible={open} onVisibleChange={visible => setOpen(!!visible)} getPopupContainer={() => host.current ?? document.body}
    onChange={next => { if (!disabled) onChange(next || ''); }} /></span>;
}
