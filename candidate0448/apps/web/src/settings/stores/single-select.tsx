import { Select } from '@arco-design/web-react';
import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import type { ReadScope } from '../../loading/read-scope.ts';
/** Frozen searchable SmallSelect presentation with a route-local popup, not the
 * old global mount/data bridge. Server search/pagination remains caller-owned. */
export function StoreSettingsSingleSelect(props: { readonly scope: ReadScope; readonly label: string; readonly value: string; readonly disabled?: boolean; readonly search?: boolean; readonly loading?: boolean; readonly options: readonly { readonly value: string; readonly label: string }[]; readonly onChange: (value: string) => void; readonly onOpen?: () => void; readonly onSearch?: (value: string) => void; readonly footer?: ReactNode }) {
  const host = useRef<HTMLDivElement>(null), [open, setOpen] = useState(false), [mounted, setMounted] = useState(false), [, refreshPortal] = useReducer((value: number) => value + 1, 0);
  useEffect(() => { setMounted(true); return () => { setMounted(false); }; }, []);
  useEffect(() => { if (props.disabled || !props.scope.active) setOpen(false); }, [props.disabled, props.scope]);
  useEffect(() => { if (!mounted || !open || props.disabled) return; let active = true; queueMicrotask(() => { if (active) refreshPortal(); }); return () => { active = false; }; }, [mounted, open, props.disabled]);
  return <div className="bs-single settings-single ui-single-host" ref={host}><Select className="ui-flat-select" aria-label={props.label} value={props.value} options={[...props.options]} disabled={props.disabled || !props.scope.active} showSearch={!!props.search} filterOption={props.search ? false : true} allowClear={false} loading={props.loading ?? false} popupVisible={mounted && open && !props.disabled && props.scope.active} unmountOnExit
    getPopupContainer={() => { if (!host.current) throw new Error('Store settings select host is not mounted'); return host.current; }}
    triggerProps={{ position: 'bl', autoAlignPopupWidth: false, popupStyle: { width: Math.min(Math.max(host.current?.getBoundingClientRect().width ?? 180, 300), Math.max(180, window.innerWidth - (host.current?.getBoundingClientRect().left ?? 0) - 12)) } }}
    renderFormat={() => <span className="ui-single-tag">{props.options.find(item => item.value === props.value)?.label ?? '未提供'}</span>}
    dropdownRender={menu => <>{menu}{props.footer}</>}
    onVisibleChange={value => { if (!props.scope.active || props.disabled) return; setOpen(value); if (value) props.onOpen?.(); }}
    onSearch={value => { if (props.scope.active && open) props.onSearch?.(value); }}
    onChange={(value: string) => { if (props.scope.active && open && !props.disabled && props.options.some(option => option.value === value)) { setOpen(false); props.onChange(value); } }} /></div>;
}
