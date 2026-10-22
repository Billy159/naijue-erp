import { Dropdown, Menu } from '@arco-design/web-react';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { UIButton } from '../components/standard-controls.tsx';
import type { AuthenticationPrincipal } from './contracts.ts';

export interface AuthenticationAccountActions {
  readonly principal: AuthenticationPrincipal;
  readonly busy: boolean;
  readonly registerSlot: (delta: 1 | -1) => void;
  readonly changePassword: (returnTarget: HTMLElement | null) => void;
  readonly logout: () => void;
}
export const AuthenticationAccountContext = createContext<AuthenticationAccountActions | null>(null);
const roleLabel = (role: string) => ({ ADMIN: '管理员', WAREHOUSE: '仓库人员', SALESPERSON: '营业员' })[role] ?? role;

/** The frame owns placement; the existing authentication panel owns all actions and secrets. */
export function AuthenticationAccountMenu() {
  const actions = useContext(AuthenticationAccountContext);
  const trigger = useRef<HTMLButtonElement>(null), keyboardOpen = useRef(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!actions) return;
    actions.registerSlot(1);
    return () => actions.registerSlot(-1);
  }, [actions?.registerSlot]);
  if (!actions) return null;
  const close = (restoreFocus = false) => { setVisible(false); keyboardOpen.current = false; if (restoreFocus) trigger.current?.focus({ preventScroll: true }); };
  const items = <div className="auth-account-options" ref={element => {
    if (element && keyboardOpen.current) { keyboardOpen.current = false; element.querySelector<HTMLElement>('[role="menuitem"]')?.focus(); }
  }} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])'));
      if (!items.length) return;
      const index = items.indexOf(event.currentTarget.ownerDocument.activeElement as HTMLElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
      items[next]?.focus();
    } else if (event.key === 'Tab') close();
  }}><Menu selectedKeys={[]} onClickMenuItem={key => {
    close();
    if (key === 'password') {
      // The menu item will unmount. Let the shared modal remember its surviving
      // account trigger, so its focus-lock teardown can return there safely.
      trigger.current?.focus({ preventScroll: true });
      actions.changePassword(trigger.current);
    }
    if (key === 'logout') actions.logout();
  }}><Menu.Item key="password" disabled={actions.busy}>修改密码</Menu.Item><Menu.Item key="logout" disabled={actions.busy}>退出登录</Menu.Item></Menu></div>;
  return <Dropdown trigger="click" position="br" popupVisible={visible} disabled={actions.busy} onVisibleChange={next => setVisible(next)} droplist={items}>
    <UIButton ref={trigger} type="button" className="auth-account-trigger" aria-label={`账号菜单：${actions.principal.loginName}`} aria-haspopup="menu" aria-expanded={visible} disabled={actions.busy}
      onKeyDown={event => {
        if (['ArrowDown', 'Enter', ' '].includes(event.key)) { event.preventDefault(); keyboardOpen.current = true; setVisible(true); }
        if (event.key === 'Escape') { event.preventDefault(); close(true); }
      }}><span>{actions.principal.loginName}</span><small>{roleLabel(actions.principal.role)}</small><span aria-hidden="true">⌄</span></UIButton>
  </Dropdown>;
}
