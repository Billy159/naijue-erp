import { Avatar, Divider, Dropdown, Menu, Space, Typography } from '@arco-design/web-react';
import { IconDown } from '@arco-design/web-react/icon';
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
  const menu = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!actions) return;
    actions.registerSlot(1);
    return () => actions.registerSlot(-1);
  }, [actions?.registerSlot]);
  if (!actions) return null;
  const close = (restoreFocus = false) => { setVisible(false); keyboardOpen.current = false; if (restoreFocus) trigger.current?.focus({ preventScroll: true }); };
  const focusFirstItem = () => {
    const element = menu.current;
    if (!keyboardOpen.current || !element?.isConnected) return;
    const first = Array.from(element.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(item => item.tabIndex >= 0 && item.getAttribute('aria-disabled') !== 'true');
    first?.focus({ preventScroll: true });
    if (first && element.ownerDocument.activeElement === first) keyboardOpen.current = false;
  };
  const staffName = 'staffName' in actions.principal && typeof actions.principal.staffName === 'string' ? actions.principal.staffName.trim() : '';
  const accountName = staffName || actions.principal.loginName;
  const accountSummary = staffName || `账号：${actions.principal.loginName}`;
  const accountRole = roleLabel(actions.principal.role);
  const items = <div className="auth-account-options" ref={element => {
    menu.current = element;
    if (element) queueMicrotask(focusFirstItem);
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
  }}><Menu.ItemGroup title={<Space direction="vertical" size="mini">
    <Typography.Text bold>{accountSummary}</Typography.Text>
    <Typography.Text type="secondary">{accountRole}</Typography.Text>
  </Space>}>
    <Divider style={{ margin: '8px 0' }} />
    <Menu.Item key="password" disabled={actions.busy}>修改密码</Menu.Item>
    <Menu.Item key="logout" disabled={actions.busy}><Typography.Text type="error">退出登录</Typography.Text></Menu.Item>
  </Menu.ItemGroup></Menu></div>;
  return <Dropdown trigger="click" position="br" popupVisible={visible} disabled={actions.busy} onVisibleChange={next => { if (next) setVisible(true); else close(); }} droplist={items}>
    <UIButton ref={trigger} type="button" className="auth-account-trigger" aria-label={staffName ? `员工菜单：${staffName}` : `账号菜单：${actions.principal.loginName}`} aria-haspopup="menu" aria-expanded={visible} disabled={actions.busy}
      onKeyDown={event => {
        if (['ArrowDown', 'Enter', ' '].includes(event.key)) { event.preventDefault(); keyboardOpen.current = true; setVisible(true); queueMicrotask(focusFirstItem); }
        if (event.key === 'Escape') { event.preventDefault(); close(true); }
      }}><Space align="center" size={8}>
        <Avatar size={24}>{Array.from(accountName)[0] ?? ''}</Avatar>
        <Typography.Text className="auth-account-summary">{accountSummary} · {accountRole}</Typography.Text>
        <IconDown />
      </Space></UIButton>
  </Dropdown>;
}
