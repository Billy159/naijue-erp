// DOM/classes and modal options from frozen product-current.js and product-arco.jsx.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Input, Modal } from '@arco-design/web-react';
import { LatestQuery, type QueryRead } from '../../../../src/loading/latest-query.ts';
import { HttpQueryError } from '../../../../src/transport/http-query.ts';
import { CatalogueEditorController, type CatalogueEditorDraft } from '../../../../src/product-settings/catalogue-maintenance-state.ts';
import type { CatalogueMaintenanceCommand, CatalogueMaintenanceResult } from '../../../../src/product-settings/catalogue-maintenance-http-client.ts';
import type { CatalogueMaintenanceCapability } from '../../../../src/product-settings/colors/contracts.ts';
import type { CataloguePageOptions } from './entry.tsx';
import { Pagination } from '../inventory/pagination.tsx';

export const tabs = [['colors', '颜色'], ['groups', '尺码组'], ['fits', '版型'], ['seasons', '季节']] as const;
export function Head({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="gold-head iw-head pc-page-head"><h1>{title}</h1><div className="actions iw-head-actions">{children}</div></div>;
}
export const maintenanceUnavailable = '当前入口的维护尚未接通，资料以只读方式显示。';
export function MaintenanceNotice({ capability }: { capability: CatalogueMaintenanceCapability | undefined }) {
  return capability ? null : <div className="hint spaced" role="status">{maintenanceUnavailable}</div>;
}
export function SourceModal({ title, children, footer, close }: { title: string; children: ReactNode; footer: ReactNode; close: () => void }) {
  return <Modal visible title={title} footer={<div className="pc-modal-foot">{footer}</div>} className="pc-arco-modal iw-arco-controls" maskClosable={false} unmountOnExit onCancel={close} onOk={close}><div className="pc-modal-body">{children}</div></Modal>;
}
export function useRead<P, D>(options: Pick<CataloguePageOptions, 'scope' | 'onAccessFailure'>, execute: (read: QueryRead<P>) => Promise<D>, initial: P) {
  const query = useMemo(() => new LatestQuery({ scope: options.scope, execute }), [options.scope, execute]);
  const snapshot = useSyncExternalStore(query.subscribe, query.getSnapshot, query.getSnapshot);
  useEffect(() => { void query.run(initial); return () => query.dispose(); }, [query]);
  useEffect(() => {
    const error = snapshot.error as { kind?: string } | null;
    if (error?.kind === 'unauthenticated' || error?.kind === 'forbidden') {
      options.scope.dispose(); options.onAccessFailure(error.kind);
    }
  }, [snapshot.error, options]);
  return { query, snapshot };
}
export function ReadNotice({ phase, error, retry, cancel }: { phase: string; error: unknown; retry: () => void; cancel: () => void }) {
  const message = error instanceof HttpQueryError ? ({ unauthenticated: '登录已失效，请重新登录。', forbidden: '没有读取此资料的权限。', unavailable: '资料尚未准备好，请稍后重试。', 'not-implemented': '此读取能力尚未接入。', timeout: '读取超时，请重试。', network: '无法连接服务器，请重试。', 'malformed-response': '服务器返回的资料不完整，请重试。', 'too-large': '资料超出安全读取上限，未截断显示。' } as Readonly<Record<string, string>>)[error.kind] ?? '资料读取失败，请重试。' : '资料读取失败，请重试。';
  return <div className="inline-error" role="status">{phase === 'loading' ? <>正在读取资料… <button className="btn ghost" onClick={cancel}>取消</button></>
    : phase === 'error' || phase === 'stale' || phase === 'idle' ? <>{phase === 'idle' ? '尚未读取资料。' : phase === 'stale' && !error ? '本次读取已停止，仍显示上次成功读取的资料。' : message} <button className="btn ghost" onClick={retry}>重试加载资料</button></> : null}</div>;
}
export function Pager({ options, page, pageSize, total, change, disabled = false }: { options: CataloguePageOptions; page: number; pageSize: 20 | 50 | 100; total: number; change: (page: number, size: 20 | 50 | 100) => void; disabled?: boolean }) {
  const busy = disabled || !options.scope.active;
  return <Pagination page={page} size={pageSize} total={total} busy={busy} unit="条" pageSizes={[20, 50, 100]} className="pc-pagination pc-settings-pagination" selectLabel="商品设置每页条数"
    change={next => { if (!busy && Number.isSafeInteger(next) && next > 0 && next <= Math.max(1, Math.ceil(total / pageSize))) change(next, pageSize); }}
    sizeChange={size => { if (!busy && (size === 20 || size === 50 || size === 100)) change(1, size); }} />;
}

export function useCommand(options: CataloguePageOptions, capability: CatalogueMaintenanceCapability | undefined) {
  const borrowed = capability ? options.commandOwners?.[capability.kind] : undefined;
  const controller = useMemo(() => borrowed ?? (capability ? new CatalogueEditorController({ ...capability, scope: options.scope, onAccessFailure: error => { options.scope.dispose(); options.onAccessFailure(error.kind === 'unauthenticated' ? 'unauthenticated' : 'forbidden'); } }) : null), [options.scope, capability, borrowed]);
  useEffect(() => () => { if (!borrowed) controller?.dispose(); }, [controller, borrowed]);
  const state = useSyncExternalStore(controller?.subscribe ?? (() => () => {}), controller?.getSnapshot ?? (() => null), controller?.getSnapshot ?? (() => null));
  return { controller, state };
}
export function Recovery({ controller }: { controller: CatalogueEditorController }) {
  const state = controller.getSnapshot();
  return <div className="inline-error" role="alert">{state.error?.message}{state.phase === 'submitting' ? '正在保存…' : state.phase === 'checking' ? '正在查回原请求…' : null}
    {state.phase === 'uncertain' && <><button className="btn ghost" onClick={() => { if (controller.getSnapshot().phase === 'uncertain') void controller.recover(); }}>查回原请求结果</button><button className="btn ghost" onClick={() => { if (controller.getSnapshot().phase === 'uncertain') void controller.retryOriginal(); }}>按原请求重试</button></>}</div>;
}

export function EntryEditor({ options, capability, entry, resumeCommand, close, saved, guard }: {
  options: CataloguePageOptions; capability: CatalogueMaintenanceCapability;
  entry: { id: string; name: string; code: string; enabled: boolean; version: number } | null;
  resumeCommand?: CatalogueMaintenanceCommand;
  close: () => void; saved: (result: CatalogueMaintenanceResult, action: string, code: string) => Promise<boolean>;
  guard: (value: (() => boolean) | null, locked?: boolean) => void;
}) {
  const resumedValues = resumeCommand && 'values' in resumeCommand && 'code' in resumeCommand.values ? resumeCommand.values : null;
  const [name, setName] = useState(resumedValues?.name ?? entry?.name ?? ''), [code, setCode] = useState(resumedValues?.code ?? entry?.code ?? ''), [confirm, setConfirm] = useState(resumeCommand?.action === 'DELETE'), [error, setError] = useState('');
  const { controller, state } = useCommand(options, capability);
  const dirty = name !== (entry?.name ?? '') || code !== (entry?.code ?? '');
  const busy = !!state && !['idle', 'rejected'].includes(state.phase);
  const finishing = useRef(false);
  const title = capability.kind === 'COLOR' ? '颜色' : '版型';
  useEffect(() => { guard(() => !dirty && !busy, busy); return () => guard(null); }, [guard, dirty, busy]);
  async function finish() {
    if (!state?.result || !state.command || finishing.current) return;
    finishing.current = true;
    const { result, command } = state;
    if (await saved(result, command.action, code.trim())) {
      if (controller?.getSnapshot().phase === 'committed') controller.resetAfterReload(result.targetId, result.version);
      close();
    }
    finishing.current = false;
  }
  useEffect(() => { if (state?.phase === 'committed') void finish(); }, [state]);
  const submit = async (deleting = false) => {
    if (!controller || busy) return;
    if (!deleting && (!name.trim() || !code.trim())) { setError('请填写必填资料'); return; }
    if (!deleting && !entry && capability.kind === 'FIT' && !/^[A-Z]$/.test(code.trim())) { setError('版型编码请填写一个大写英文字母'); return; }
    const target = entry ?? (resumeCommand && 'id' in resumeCommand ? { id: resumeCommand.id, version: resumeCommand.expectedVersion } : null);
    const action = deleting ? 'DELETE' : entry ? 'EDIT' : 'CREATE';
    if (!capability.allowedActions.includes(action)) return;
    if (deleting && !target) return;
    const draft: CatalogueEditorDraft = deleting && target ? { action: 'DELETE', id: target.id, expectedVersion: target.version }
      : entry ? { action: 'EDIT', id: entry.id, expectedVersion: entry.version, values: { name: name.trim(), code: code.trim(), enabled: entry.enabled } }
      : { action: 'CREATE', values: { name: name.trim(), code: code.trim(), enabled: true } };
    setError(''); try { await controller.submit(draft); } catch (value) { setError(value instanceof Error ? value.message : '请求未发送'); }
  };
  const cancel = () => { if (!busy) close(); };
  return <SourceModal title={confirm ? `确认删除${title}` : `${entry ? '编辑' : '新增'}${title}`} close={cancel} footer={<>
    {!confirm && entry && capability.allowedActions.includes('DELETE') && <button className="btn ghost pc-danger pc-delete-left" disabled={busy} onClick={() => setConfirm(true)}>删除</button>}
    <button className="btn" disabled={busy} onClick={() => confirm && entry ? setConfirm(false) : cancel()}>取消</button>
    <button className={`btn ${confirm ? 'pc-danger-solid' : 'primary'}`} disabled={busy || !capability.allowedActions.includes(confirm ? 'DELETE' : entry ? 'EDIT' : 'CREATE')} onClick={() => void submit(confirm)}>{confirm ? '确认删除' : '确定'}</button>
  </>}>
    {confirm ? <p>删除该{title}后无法恢复，确定继续吗？</p> : <form id="pc-dict-form" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <div className="field"><span className="pc-field-caption">{title}名称</span><div id="pc-dict-name"><Input name="name" value={name} maxLength={40} disabled={busy || !capability.allowedActions.includes(entry ? 'EDIT' : 'CREATE')} onChange={setName} /></div></div>
      <div className="field"><span className="pc-field-caption">{title}代码</span><div id="pc-dict-code"><Input name="code" value={code} maxLength={12} disabled={busy || !capability.allowedActions.includes(entry ? 'EDIT' : 'CREATE')} onChange={setCode} /></div></div>
    </form>}
    <div className="inline-error" role="alert">{error}</div>{controller && <Recovery controller={controller} />}
    {state?.phase === 'committed' && <div className="inline-error">保存已提交，正在确认最新资料。<button className="btn ghost" onClick={() => void finish()}>重新读取资料</button></div>}
  </SourceModal>;
}
