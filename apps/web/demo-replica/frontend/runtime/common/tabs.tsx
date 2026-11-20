import { useId, useRef, useState, type ReactNode, type RefObject } from 'react';

type TabItem<Key extends string> = readonly [Key, string];
type TabOptions<Key extends string> = {
  label: string;
  items: readonly TabItem<Key>[];
  selected: Key;
  onSelect: (key: Key) => void;
  className: 'tabs' | 'bs-tabs';
};
export type RuntimeTabs = {
  header: ReactNode;
  panel: { role: 'tabpanel'; id: string; 'aria-labelledby': string; tabIndex: 0 };
};

export function useRuntimeTabs<Key extends string>(options: TabOptions<Key>): RuntimeTabs {
  const id = useId();
  // Settings replace the data owner and its header when a new tab opens.
  const trigger = useRef<HTMLButtonElement | null>(null);
  return {
    header: <TabHeader {...options} id={id} trigger={trigger} />,
    panel: { role: 'tabpanel', id: id + '-panel-' + options.selected, 'aria-labelledby': id + '-tab-' + options.selected, tabIndex: 0 },
  };
}

function TabHeader<Key extends string>(props: TabOptions<Key> & { id: string; trigger: RefObject<HTMLButtonElement | null> }) {
  const [focused, setFocused] = useState<Key | null>(null);
  const stop = props.items.some(([key]) => key === focused) ? focused : props.selected;
  const List = props.className === 'bs-tabs' ? 'nav' : 'div';
  return <><List className={props.className} role="tablist" aria-label={props.label}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(null); }}>
    {props.items.map(([key, label], index) => <button key={key} type="button" role="tab" id={props.id + '-tab-' + key}
      aria-controls={props.id + '-panel-' + key} aria-selected={key === props.selected} tabIndex={key === stop ? 0 : -1}
      className={props.className === 'tabs' && key === props.selected ? 'active' : undefined}
      ref={node => {
        const previous = props.trigger.current;
        if (!node || !previous || previous.id !== node.id || key !== props.selected) return;
        props.trigger.current = null;
        if (!previous.isConnected && node.ownerDocument.activeElement === node.ownerDocument.body) node.focus({ preventScroll: true });
      }}
      onFocus={() => setFocused(key)}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing || event.altKey || event.metaKey || event.ctrlKey) return;
        const last = props.items.length - 1;
        let target: number;
        switch (event.key) {
          case 'ArrowRight': target = index === last ? 0 : index + 1; break;
          case 'ArrowLeft': target = index === 0 ? last : index - 1; break;
          case 'Home': target = 0; break;
          case 'End': target = last; break;
          default: return; // Native buttons activate with Enter and Space.
        }
        event.preventDefault();
        event.currentTarget.ownerDocument.getElementById(props.id + '-tab-' + props.items[target]![0])?.focus();
      }}
      onClick={event => {
        if (key === props.selected) return;
        props.trigger.current = event.currentTarget === event.currentTarget.ownerDocument.activeElement ? event.currentTarget : null;
        props.onSelect(key);
      }}>{label}</button>)}
  </List>{props.items.filter(([key]) => key !== props.selected).map(([key]) =>
    <div key={key} role="tabpanel" hidden id={props.id + '-panel-' + key} aria-labelledby={props.id + '-tab-' + key} />)}</>;
}

export function SettingsTabPanel({ tabs, children }: { tabs?: RuntimeTabs | undefined; children: ReactNode }) {
  return tabs ? <div className="bs-tab-panel" {...tabs.panel}>{children}</div> : <>{children}</>;
}
