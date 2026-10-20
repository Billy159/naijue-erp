import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import { passwordByteLength } from './contracts.ts';
import { AuthenticationController, type AuthenticationSnapshot } from './model.ts';
import './authentication.css';

const roleLabel = (role: string): string => ({ ADMIN: '管理员', WAREHOUSE: '仓库人员', SALESPERSON: '营业员' })[role] ?? role;
function Status({ state }: { readonly state: AuthenticationSnapshot }) {
  if (state.notice === 'password-changed') return <p role="status">密码修改成功，请使用新密码重新登录。</p>;
  if (state.notice === 'logged-out') return <p role="status">已退出登录。</p>;
  if (state.notice === 'expired') return <p role="alert">登录已失效，旧身份资料已清除，请重新登录。</p>;
  if (state.notice === 'uncertain' || state.notice === 'cancelled' && state.operation !== 'resolve') {
    return <p role="alert">已停止本地等待，旧身份资料已清除。服务器可能已处理请求，请核验登录状态；尚未确认退出或密码修改成功。</p>;
  }
  if (state.notice === 'cancelled') return <p role="status">登录状态核验已取消，可重新核验。</p>;
  if (state.error) return <p role="alert">{state.operation === 'password' && state.error.kind === 'credentials' ? '旧密码不正确，请重新输入。' : state.error.message}</p>;
  return null;
}
function LoginForm({ controller, state }: { readonly controller: AuthenticationController; readonly state: AuthenticationSnapshot }) {
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const password = useRef<HTMLInputElement>(null);
  const [validation, setValidation] = useState<string | null>(null);
  useEffect(() => {
    const element = form.current;
    return () => { element?.reset(); };
  }, []);
  useEffect(() => { if (password.current) password.current.value = ''; }, [controller, state.operation, state.notice]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (controller.busy) return;
    const element = event.currentTarget;
    const login = element.elements.namedItem('loginName') as HTMLInputElement;
    const secret = password.current;
    if (!secret) return;
    const input = { loginName: login.value, password: secret.value };
    secret.value = '';
    if (!input.loginName || passwordByteLength(input.loginName) > 256 || !input.password || passwordByteLength(input.password) > 1024) {
      setValidation('请填写登录账号和密码，账号最多 256 字节，密码最多 1024 字节。'); return;
    }
    setValidation(null);
    void controller.login(input);
  };
  const busy = controller.busy;
  return <form ref={form} className="auth-form" noValidate onSubmit={submit} aria-label="账号登录" aria-busy={state.phase === 'logging-in'}>
    <h2>账号登录</h2>
    <label htmlFor={`${id}-login`}>登录账号</label>
    <input id={`${id}-login`} name="loginName" autoComplete="username" required disabled={busy} spellCheck={false} />
    <label htmlFor={`${id}-password`}>密码</label>
    <input ref={password} id={`${id}-password`} name="password" type="password" autoComplete="current-password" required disabled={busy} />
    {validation && <p role="alert">{validation}</p>}
    <button type="submit" disabled={busy}>{state.phase === 'logging-in' ? '正在登录…' : state.operation === 'login' && state.error ? '重新登录' : '登录'}</button>
    <p className="auth-hint">仅使用当前站点的安全会话。密码不会保存为草稿。</p>
  </form>;
}
function PasswordDialog({ controller, close }: { readonly controller: AuthenticationController; readonly close: () => void }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const current = useRef<HTMLInputElement>(null);
  const next = useRef<HTMLInputElement>(null);
  const confirm = useRef<HTMLInputElement>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const clear = () => { for (const input of [current.current, next.current, confirm.current]) if (input) input.value = ''; };
  const dismiss = () => { clear(); if (state.phase === 'changing-password') controller.cancel(); close(); };
  useEffect(() => {
    const element = dialog.current;
    const fields = [current.current, next.current, confirm.current];
    if (typeof element?.showModal === 'function') element.showModal(); else element?.setAttribute('open', '');
    current.current?.focus();
    return () => { for (const field of fields) if (field) field.value = ''; element?.close?.(); };
  }, []);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (controller.busy) return;
    const currentPassword = current.current?.value ?? '', newPassword = next.current?.value ?? '', confirmation = confirm.current?.value ?? '';
    clear();
    if (!currentPassword || passwordByteLength(currentPassword) > 1024 || newPassword.length < 8 || passwordByteLength(newPassword) > 1024) {
      setValidation('请填写旧密码；新密码至少 8 个字符，密码最多 1024 字节。'); return;
    }
    if (newPassword !== confirmation) { setValidation('两次输入的新密码不一致，请重新输入。'); return; }
    setValidation(null);
    void controller.changeOwnPassword({ currentPassword, newPassword });
  };
  return <dialog ref={dialog} className="auth-password-dialog" aria-modal="true" aria-labelledby={`${id}-title`}
    onCancel={event => { event.preventDefault(); dismiss(); }} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); }
      if (event.key !== 'Tab') return;
      const fields = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)'));
      const first = fields[0], last = fields.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
    <header><h2 id={`${id}-title`}>修改密码</h2><button type="button" aria-label="关闭修改密码" onClick={dismiss}>×</button></header>
    <form ref={form} className="auth-form" noValidate onSubmit={submit} aria-busy={state.phase === 'changing-password'}>
      <label htmlFor={`${id}-current`}>旧密码</label>
      <input ref={current} id={`${id}-current`} name="currentPassword" type="password" autoComplete="current-password" required disabled={controller.busy} />
      <label htmlFor={`${id}-new`}>新密码</label>
      <input ref={next} id={`${id}-new`} name="newPassword" type="password" autoComplete="new-password" minLength={8} required disabled={controller.busy} />
      <label htmlFor={`${id}-confirm`}>确认新密码</label>
      <input ref={confirm} id={`${id}-confirm`} name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required disabled={controller.busy} />
      <p className="auth-hint">新密码至少 8 个字符。修改成功后所有旧会话失效，须重新登录。</p>
      {validation && <p role="alert">{validation}</p>}
      {state.operation === 'password' && state.error && <Status state={state} />}
      <div className="auth-actions"><button type="button" onClick={dismiss}>{state.phase === 'changing-password' ? '取消等待并关闭' : '取消'}</button>
        <button type="submit" disabled={controller.busy}>{state.phase === 'changing-password' ? '正在提交…' : state.operation === 'password' && state.error ? '重新提交' : '确认修改'}</button></div>
    </form>
  </dialog>;
}
export interface AuthenticationPanelProps {
  readonly controller: AuthenticationController;
  /** Business content is rendered only for the currently verified identity. Authorization remains server-side. */
  readonly children?: (principal: NonNullable<AuthenticationSnapshot['principal']>) => ReactNode;
}
/** Real host-injected UI; no synthetic accounts/fallback, storage, credential autofill or startup network activity. */
export function AuthenticationPanel({ controller, children }: AuthenticationPanelProps) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const changeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!state.principal) setPasswordOpen(false); }, [state.principal]);
  useEffect(() => () => { controller.cancel(); }, [controller]);
  const closePassword = () => { setPasswordOpen(false); changeButton.current?.focus(); };
  return <section className="auth-panel" aria-label="登录与账号安全">
    {!(passwordOpen && state.principal && state.operation === 'password') && <Status state={state} />}
    {state.principal ? <>
      <div className="auth-session"><p>当前账号：<strong>{state.principal.loginName}</strong> <span>{roleLabel(state.principal.role)}</span></p>
        <div className="auth-actions"><button ref={changeButton} type="button" disabled={controller.busy} onClick={() => setPasswordOpen(true)}>修改密码</button>
          <button type="button" disabled={state.phase === 'logging-out'} onClick={() => { closePassword(); void controller.logout(); }}>退出登录</button></div></div>
      {children?.(state.principal)}
      {passwordOpen && <PasswordDialog controller={controller} close={closePassword} />}
    </> : <>
      {state.phase === 'unresolved' && <p role="status">尚未核验当前登录状态。</p>}
      {state.phase === 'resolving' && <p role="status">正在核验登录状态…</p>}
      {state.phase === 'logging-out' && <p role="status">正在退出登录…</p>}
      <LoginForm controller={controller} state={state} />
      <div className="auth-actions"><button type="button" disabled={controller.busy} onClick={() => { void controller.resolveSession(); }}>{state.operation === 'resolve' && state.error ? '重试核验' : '核验登录状态'}</button>
        {state.operation === 'logout' && !controller.busy && <button type="button" onClick={() => { void controller.logout(); }}>重试退出登录</button>}
      </div>
    </>}
    {controller.busy && <button type="button" className="auth-cancel" onClick={() => controller.cancel()}>取消请求</button>}
  </section>;
}
