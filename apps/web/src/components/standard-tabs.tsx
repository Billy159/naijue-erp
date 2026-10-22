import { Tabs } from '@arco-design/web-react';
import { cloneElement, useLayoutEffect, useRef, type ReactElement, type ReactNode, type HTMLAttributes } from 'react';
import './standard-tabs.css';

export interface StandardTab<Key extends string> { readonly key: Key; readonly label: string; readonly disabled?: boolean }
/** Real Arco Tabs/TabPane owns header/panel IDs and the active panel. Domain
 * owners keep their read scopes, allowed destinations and cancellation rules. */
export function StandardTabs<Key extends string>(props: {
  readonly label: string; readonly value: Key; readonly items: readonly StandardTab<Key>[];
  readonly onChange: (key: Key) => void; readonly children: ReactNode;
  readonly className?: string; readonly restoreFocus?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const focusActive = () => {
    const element = host.current;
    if (!element?.isConnected) return;
    const active = element.ownerDocument.activeElement;
    // A replacement read-owner can restore its old tab focus after lazy code
    // mounts. A newer field/navigation/layer focus always wins.
    if (active && active !== element.ownerDocument.body && active.isConnected
      && !(element.contains(active) && active.matches('[role="tab"]'))) return;
    element.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true });
  };
  useLayoutEffect(() => {
    if (!props.restoreFocus) return;
    const frame = requestAnimationFrame(focusActive);
    return () => cancelAnimationFrame(frame);
  }, []);
  const choose = (key: string, keyboard = false) => {
    const item = props.items.find(item => item.key === key && !item.disabled);
    if (!item || item.key === props.value) return;
    props.onChange(item.key);
    if (keyboard) requestAnimationFrame(focusActive);
  };
  return <div ref={host} className={`erp-tabs-host ${props.className ?? ''}`}>
    <Tabs activeTab={props.value} type="line" size="small" animation={false} destroyOnHide lazyload onChange={key => choose(key)}
      renderTabHeader={(tabProps, Header) => <div role="tablist" aria-label={props.label}><Header {...tabProps} /></div>}
      renderTabTitle={(node, info) => cloneElement(node as ReactElement<HTMLAttributes<HTMLElement>>, {
        tabIndex: info.isActive ? 0 : -1,
        onKeyDown: event => {
          const enabled = props.items.filter(item => !item.disabled), index = enabled.findIndex(item => item.key === String(info.key));
          const key = event.key === 'ArrowRight' ? enabled[(index + 1) % enabled.length]?.key
            : event.key === 'ArrowLeft' ? enabled[(index + enabled.length - 1) % enabled.length]?.key
            : event.key === 'Home' ? enabled[0]?.key : event.key === 'End' ? enabled.at(-1)?.key
            : event.key === 'Enter' || event.key === ' ' ? String(info.key) : undefined;
          if (key !== undefined) { event.preventDefault(); event.stopPropagation(); choose(key, true); }
        },
      })}>
      {props.items.map(item => <Tabs.TabPane key={item.key} title={item.label} disabled={!!item.disabled}>
        {item.key === props.value ? props.children : null}
      </Tabs.TabPane>)}
    </Tabs>
  </div>;
}
