import { useEffect, useState } from 'react';
import { LatestQuery, type QueryRead } from '../../loading/latest-query.ts';
import { ReadScope } from '../../loading/read-scope.ts';
import { HttpQueryError } from '../../transport/http-query.ts';
import type { DictionaryPageProps } from './contracts.ts';
export function safeDictionaryError(error: unknown): string {
  if (error instanceof HttpQueryError) return ({ unauthenticated: '登录已失效，请重新登录。', forbidden: '没有读取此资料的权限。', unavailable: '资料尚未准备好，请稍后重试。', 'not-implemented': '此读取能力尚未接入。', timeout: '读取超时，请重试。', network: '无法连接服务器，请重试。', 'malformed-response': '服务器返回的资料不完整，请重试。' } as Readonly<Record<string, string>>)[error.kind] ?? '资料读取失败，请重试。';
  return '资料读取失败，请重试。';
}
export interface DictionaryOwner<P, D> {
  readonly scope: ReadScope; readonly query: LatestQuery<P, D>;
  readonly getAccessFailure: () => 'unauthenticated' | 'forbidden' | null;
  readonly invalidateAccess: (kind: 'unauthenticated' | 'forbidden') => void;
}
/** Each effect activation owns fresh child scope/query. StrictMode cleanup never closes
 * the caller's parent; closed/replaced pages cannot retain facts or deliver late failures. */
export function useDictionaryOwner<P, D>(props: DictionaryPageProps, execute: (read: QueryRead<P>) => Promise<D>, initial: P | null): DictionaryOwner<P, D> | null {
  const [owner, setOwner] = useState<(DictionaryOwner<P, D> & { parent: ReadScope; execute: typeof execute; onAccessFailure: typeof props.onAccessFailure }) | null>(null);
  useEffect(() => {
    let scope: ReadScope;
    const abort = () => scope.dispose();
    scope = new ReadScope(props.scope.identity, `${props.scope.routeInstanceId}:dictionary`, null, () => props.scope.signal.removeEventListener('abort', abort));
    props.scope.signal.addEventListener('abort', abort, { once: true }); if (!props.scope.active) scope.dispose();
    let accessFailure: 'unauthenticated' | 'forbidden' | null = null;
    const invalidateAccess = (kind: 'unauthenticated' | 'forbidden') => { accessFailure = kind; scope.dispose(); };
    const query = new LatestQuery<P, D>({ scope, execute: async read => {
      try { return await execute(read); } catch (error) {
        if (!read.signal.aborted && scope.active && error instanceof HttpQueryError && (error.kind === 'unauthenticated' || error.kind === 'forbidden')) {
          invalidateAccess(error.kind); try { props.onAccessFailure(error.kind); } catch { /* Facts are already cleared. */ }
        }
        throw error;
      }
    } });
    setOwner({ scope, query, getAccessFailure: () => accessFailure, invalidateAccess, parent: props.scope, execute, onAccessFailure: props.onAccessFailure });
    // One live initial request; StrictMode's abandoned activation is disposed before dispatch.
    if (initial !== null) queueMicrotask(() => { if (scope.active) void query.run(initial); });
    return () => { scope.dispose(); query.dispose(); };
  }, [props.scope, execute, props.onAccessFailure]);
  return owner?.parent === props.scope && owner.execute === execute && owner.onAccessFailure === props.onAccessFailure ? owner : null;
}
