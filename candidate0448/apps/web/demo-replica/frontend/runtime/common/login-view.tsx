import type { FormEventHandler, MouseEventHandler } from 'react';
import { ReplicaBrand } from './brand.tsx';

/** The copied Demo login surface. Authentication and remember-name persistence stay with the host. */
export interface LoginViewProps {
  readonly username?: string;
  readonly remembered?: boolean;
  readonly message?: string;
  readonly passwordVisible?: boolean;
  readonly busy?: boolean;
  readonly onSubmit: FormEventHandler<HTMLFormElement>;
  readonly onTogglePassword: MouseEventHandler<HTMLButtonElement>;
}

export function LoginView({ username = '', remembered = false, message = '', passwordVisible = false, busy = false, onSubmit, onTogglePassword }: LoginViewProps) {
  return <section className="login-overlay iw-arco-controls">
    <form className="login-panel" onSubmit={onSubmit}>
      <ReplicaBrand />
      <h1>登录</h1>
      <label>登录账号<input name="username" autoComplete="username" required autoFocus defaultValue={username} /></label>
      <label>密码<div className="login-password"><input name="password" type={passwordVisible ? 'text' : 'password'} autoComplete="current-password" required /><button className="btn" type="button" data-show onClick={onTogglePassword}>{passwordVisible ? '隐藏' : '显示'}</button></div></label>
      <label className="remember"><input type="checkbox" name="remember" defaultChecked={remembered} />记住账号</label>
      <div className="basic-error" role="alert">{message}</div>
      <button className="btn primary" disabled={busy}>登录</button>
      <p><small>忘记密码请联系管理员重置</small></p>
    </form>
  </section>;
}
