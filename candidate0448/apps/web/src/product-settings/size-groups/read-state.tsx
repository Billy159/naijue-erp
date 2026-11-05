import { UIButton } from '../../components/standard-controls.tsx';
import type { QuerySnapshot } from '../../loading/latest-query.ts';
import { safeDictionaryError } from './read-owner.tsx';
export function DictionaryReadState<P, D>({ snapshot, retry, cancel, accessFailure }: { readonly snapshot: QuerySnapshot<P, D>; readonly retry: () => void; readonly cancel: () => void; readonly accessFailure?: 'unauthenticated' | 'forbidden' | null }) {
  if (snapshot.phase === 'disposed' && accessFailure) return <p role="alert">{accessFailure === 'forbidden' ? '没有读取此资料的权限。' : '登录已失效，请重新登录。'}旧身份结果已清除。</p>;
  if (snapshot.phase === 'disposed') return <p role="status">当前读取范围已关闭，旧身份结果已清除。请重新进入此页。</p>;
  if (snapshot.phase === 'loading') return <p className="dictionary-read-state" role="status">正在读取资料… <UIButton type="button" onClick={cancel}>取消本次读取</UIButton></p>;
  if (snapshot.phase === 'error') return <p className="dictionary-read-state" role="alert">{safeDictionaryError(snapshot.error)} <UIButton type="button" onClick={retry}>重试</UIButton></p>;
  if (snapshot.phase === 'idle') return <p className="dictionary-read-state" role="status">尚未读取资料。<UIButton type="button" onClick={retry}>读取</UIButton></p>;
  return null;
}
