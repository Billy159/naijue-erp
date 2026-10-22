import { Button } from '@arco-design/web-react';
import { useEffect, useRef, useState } from 'react';
import { AsyncLeafRegistry } from '../../loading/async-leaf-registry.ts';
import type { ReadScope } from '../../loading/read-scope.ts';
import { useDialogFocusReturn } from '../../components/use-dialog-focus-return.ts';
import { auditModules, type SettingsAuditDrawerProps, type SettingsAuditModule, type SettingsAuditReader } from './contracts.ts';

/** Explicit host capability only. It carries no browser role assertion or write grant. */
export interface SettingsAuditCapability {
  readonly reader: SettingsAuditReader;
  readonly allowedModules: readonly SettingsAuditModule[];
  /** Aggregate every business workspace, including routes not currently mounted. */
  readonly hasUnresolvedWrite: () => boolean;
}
interface SettingsAuditEntryProps {
  readonly scope: ReadScope; readonly capability?: SettingsAuditCapability;
  /** Required for activation; an unknown parent auth bridge keeps the button disabled. */
  readonly onAccessFailure?: SettingsAuditDrawerProps['onAccessFailure'];
  readonly localHasUnresolvedWrite?: () => boolean;
}
const drawers = new AsyncLeafRegistry({ audit: { load: () => import('./audit-drawer.tsx') } }, { maxRetainedEntries: 1 });
function available(props: SettingsAuditEntryProps): boolean {
  const capability = props.capability;
  return props.scope.active && typeof props.onAccessFailure === 'function'
    && typeof capability?.reader?.readQuery === 'function' && typeof capability.hasUnresolvedWrite === 'function'
    && Array.isArray(capability.allowedModules) && capability.allowedModules.length > 0
    && new Set(capability.allowedModules).size === capability.allowedModules.length
    && capability.allowedModules.every(module => auditModules.includes(module));
}
/** Reuses the existing header button and loads only the independent read layer on click.
 * Opening/closing never navigates, asks to discard, or touches a business workspace. */
export function SettingsAuditEntry(props: SettingsAuditEntryProps) {
  const current = useRef(props); current.current = props;
  const [module, setModule] = useState<Awaited<ReturnType<typeof drawers.load<'audit'>>> | null>(null);
  const [open, setOpen] = useState(false), [loading, setLoading] = useState(false), [failed, setFailed] = useState(false);
  const generation = useRef(0), attached = useRef(false), focus = useDialogFocusReturn(props.scope, open);
  const active = available(props), reader = props.capability?.reader, modulesKey = Array.isArray(props.capability?.allowedModules) ? props.capability.allowedModules.join('|') : '';
  useEffect(() => {
    attached.current = true;
    const clear = () => { generation.current++; setOpen(false); setLoading(false); setFailed(false); };
    clear(); props.scope.signal.addEventListener('abort', clear, { once: true });
    return () => { attached.current = false; props.scope.signal.removeEventListener('abort', clear); clear(); };
  }, [props.scope, reader, modulesKey, active]);
  const activate = async (trigger?: HTMLElement): Promise<void> => {
    if (!available(current.current) || loading || open) return;
    if (trigger) focus.capture(trigger);
    const scope = props.scope, requestedReader = reader, requestedModules = modulesKey, ticket = ++generation.current;
    setLoading(true); setFailed(false);
    try {
      const loaded = await drawers.load('audit', scope);
      const latest = current.current;
      if (!attached.current || ticket !== generation.current || latest.scope !== scope || !latest.capability || !available(latest)
        || latest.capability.reader !== requestedReader || latest.capability.allowedModules.join('|') !== requestedModules) return;
      setModule(loaded); setOpen(true);
    } catch {
      if (attached.current && ticket === generation.current && scope.active && available(current.current)) setFailed(true);
    } finally { if (attached.current && ticket === generation.current) setLoading(false); }
  };
  const hasUnresolvedWrite = (): boolean => {
    try {
      if (current.current.localHasUnresolvedWrite && current.current.localHasUnresolvedWrite() !== false) return true;
      return current.current.capability?.hasUnresolvedWrite() !== false;
    } catch { return true; /* Unknown guard state must not erase a business identity. */ }
  };
  if (!props.scope.active) return null;
  return <><Button type="text" disabled={!active || loading || open} loading={loading} aria-label={active ? '操作记录' : '操作记录（暂不可用）'} title={active ? '查看基础设置操作记录' : '操作记录读取尚未接入'} onClick={event => { void activate(event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined); }}>操作记录</Button>
    {failed && active && <span role="alert" className="settings-note">操作记录暂不可加载。<Button type="text" onClick={event => { void activate(event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined); }}>重试操作记录</Button></span>}
    {module && props.capability && props.onAccessFailure && <module.SettingsAuditDrawer visible={open && active} scope={props.scope} reader={props.capability.reader} allowedModules={props.capability.allowedModules}
      hasUnresolvedWrite={hasUnresolvedWrite} onAccessFailure={kind => current.current.onAccessFailure?.(kind)} onClose={() => { focus.request(); generation.current++; setOpen(false); setLoading(false); setFailed(false); }} />}
  </>;
}
