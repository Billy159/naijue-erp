import type { AuthenticationPrincipal } from '../../../../packages/authentication/src/ports.ts';

export type { AuthenticationPrincipal };
export interface LoginInput { readonly loginName: string; readonly password: string }
export interface PasswordChangeInput { readonly currentPassword: string; readonly newPassword: string }
export interface LoginResult { readonly principal: AuthenticationPrincipal; readonly expiresAt: string }
/** Cookie-only client: no exposed token, storage, default account, implicit login or automatic retry. */
export interface AuthClient {
  login(input: LoginInput, signal: AbortSignal): Promise<LoginResult>;
  session(signal: AbortSignal): Promise<AuthenticationPrincipal | null>;
  logout(signal: AbortSignal): Promise<void>;
  changeOwnPassword(input: PasswordChangeInput, signal: AbortSignal): Promise<void>;
}
export type AuthErrorKind = 'invalid-input' | 'credentials' | 'unauthenticated' | 'password-rejected'
  | 'forbidden' | 'network' | 'aborted' | 'timeout' | 'invalid-response' | 'server';
const messages: Readonly<Record<AuthErrorKind, string>> = {
  'invalid-input': '请检查登录账号和密码。', credentials: '账号或密码不正确，请重新输入。',
  unauthenticated: '登录已失效，请重新登录。', 'password-rejected': '新密码未通过校验，请重新输入。',
  forbidden: '请求来源未通过安全校验。', network: '无法连接服务器，请稍后重试。',
  aborted: '请求已取消。', timeout: '请求超时，请核验登录状态后重试。',
  'invalid-response': '服务器返回无效，请稍后重试。', server: '服务器未能完成请求，请稍后重试。',
};
/** Only fixed messages/codes are retained. Never attach raw provider errors, responses, bodies or credentials. */
export class AuthClientError extends Error {
  readonly kind: AuthErrorKind;
  constructor(kind: AuthErrorKind) {
    super(messages[kind]); this.name = kind === 'aborted' ? 'AbortError' : 'AuthClientError'; this.kind = kind;
  }
}
export const passwordByteLength = (value: string): number => new TextEncoder().encode(value).byteLength;
export function validLoginInput(input: LoginInput): boolean {
  return typeof input?.loginName === 'string' && input.loginName.length > 0 && passwordByteLength(input.loginName) <= 256
    && validPasswordInput(input.password);
}
export function validPasswordInput(value: string): boolean {
  return typeof value === 'string' && value.length > 0 && passwordByteLength(value) <= 1024;
}
