import { UIButton } from '../../components/standard-controls.tsx';
import type { QuerySnapshot } from '../../loading/latest-query.ts';
import { HttpQueryError } from '../../transport/http-query.ts';
export function safeStoreSettingsError(error: unknown): string {
  if (error instanceof HttpQueryError) return ({ unauthenticated: '登录已失效，请重新登录。', forbidden: '没有读取此资料的权限。', unavailable: '资料尚未准备好，请稍后重试。', 'not-implemented': '此读取能力尚未接入。', timeout: '读取超时，请重试。', network: '无法连接服务器，请重试。', 'malformed-response': '服务器返回的资料不完整，请重试。' } as Readonly<Record<string, string>>)[error.kind] ?? '资料读取失败，请重试。';
  return '资料读取失败，请重试。';
}
export function StoreSettingsReadState<P, D>({ snapshot, retry, cancel, accessFailure }: { readonly snapshot: QuerySnapshot<P, D>; readonly retry: () => void; readonly cancel: () => void; readonly accessFailure: 'unauthenticated' | 'forbidden' | null }) {
  if (snapshot.phase === 'disposed') return <p role={accessFailure ? 'alert' : 'status'}>{accessFailure === 'forbidden' ? '没有读取此资料的权限。' : accessFailure === 'unauthenticated' ? '登录已失效，请重新登录。' : '当前读取范围已关闭，请重新进入此页。'}旧身份结果已清除。</p>;
  if (snapshot.phase === 'loading') return <p className="settings-read-state" role="status">正在读取资料… <UIButton type="button" onClick={cancel}>取消本次读取</UIButton></p>;
  if (snapshot.phase === 'error') return <p className="settings-read-state" role="alert">{safeStoreSettingsError(snapshot.error)} <UIButton type="button" onClick={retry}>重试</UIButton></p>;
  if (snapshot.phase === 'idle') return <p className="settings-read-state" role="status">尚未读取资料。<UIButton type="button" onClick={retry}>读取</UIButton></p>;
  return null;
}
