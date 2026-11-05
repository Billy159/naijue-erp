import { Select } from '@arco-design/web-react';
import { useRef } from 'react';


/** The frozen unified-single-select Choice presentation, without its global mount,
 * ShadowRoot registry, hidden native-source bridge or preloaded business data. */
export function PartySingleSelect(props: { readonly label: string; readonly value: string; readonly disabled?: boolean; readonly pagination?: boolean; readonly options: readonly { readonly value: string; readonly label: string }[]; readonly onChange: (value: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  return <div className="ui-single-host bs-single party-single" ref={host}><Select className={props.pagination ? 'ui-page-size-select' : 'ui-flat-select'} value={props.value} options={[...props.options]} aria-label={props.label} showSearch={false} allowClear={false} disabled={props.disabled ?? false} getPopupContainer={() => host.current ?? document.body}
    triggerProps={{ position: props.pagination ? 'tl' : 'bl', autoAlignPopupWidth: false, popupStyle: { width: props.pagination ? 150 : Math.min(Math.max(host.current?.getBoundingClientRect().width ?? 180, 300), Math.max(180, window.innerWidth - (host.current?.getBoundingClientRect().left ?? 0) - 12)) } }}
    renderFormat={() => <span className="ui-single-tag">{props.options.find(item => item.value === props.value)?.label ?? props.value}</span>}
    onChange={(value: string) => props.onChange(value)} /></div>;
}
