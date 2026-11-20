import { useCallback, useRef, useState } from 'react';
import { StoreSettingsPage } from './stores-page.tsx';
import type { StoreSettingsPageProps, StoreSettingsKind } from './contracts.ts';
import type { ReadOnlyStoreSettingsTab } from '../../application/contracts.ts';

/** Tab change unmounts the old controller and all detail/directory reads. The
 * route owner and verified identity stay shared; no write capability is added. */
export function ReadOnlyStoreSettingsHost(props: StoreSettingsPageProps & {
  readonly allowedTabs: readonly ReadOnlyStoreSettingsTab[];
  readonly initialTab: ReadOnlyStoreSettingsTab;
}) {
  const [tab, setTab] = useState(props.initialTab);
  const tabFocus = useRef(false);
  const onTab = useCallback((next: StoreSettingsKind) => {
    if (props.scope.active && props.allowedTabs.includes(next)) { tabFocus.current = true; setTab(next); }
  }, [props.scope, props.allowedTabs]);
  return <StoreSettingsPage key={tab} {...props} kind={tab} onTab={onTab} focusTab={tabFocus.current} />;
}
